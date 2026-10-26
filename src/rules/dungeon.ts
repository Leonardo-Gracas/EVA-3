// Gerador de masmorra: salas retangulares ligadas por corredores em L, paredes
// automáticas em volta do piso e portas nas entradas das salas. Puro e com semente.
import type { EdgeRef, MapGenParams, MapLayout } from '../model/types';
import { TERRAIN_CHAR } from '../model/types';
import { blankLayout, edgeIndex, edgeKey, setWalls, wallAround } from '../model/map';
import { cleanMapParams, MAP_GEN_DEFAULTS } from './mapgen/params';
import { mulberry32, randInt, type SeededRng } from './random';

type DungeonParams = MapGenParams;

export interface Room { x: number; y: number; w: number; h: number }

export interface Dungeon {
  /** Terreno e paredes (sem objetos). */
  layout: MapLayout;
  rooms: Room[];
  /** Linhas que ganham porta fechada (a parede da linha já vem ligada). */
  doors: EdgeRef[];
}

export const DUNGEON_DEFAULTS: MapGenParams = MAP_GEN_DEFAULTS;

/** Parâmetros dentro dos limites (o motor e a tela usam a mesma regra). */
export const cleanDungeonParams = (raw: Partial<MapGenParams> | null | undefined) => cleanMapParams({ ...raw, preset: 'dungeon' });

const GAP = 2;

function overlaps(a: Room, b: Room, gap: number) {
  return a.x - gap < b.x + b.w && b.x - gap < a.x + a.w && a.y - gap < b.y + b.h && b.y - gap < a.y + a.h;
}

function placeRooms(p: DungeonParams, r: SeededRng): Room[] {
  const rooms: Room[] = [];
  for (let tries = 0; tries < p.rooms * 40 && rooms.length < p.rooms; tries++) {
    const w = Math.min(randInt(r, p.roomMin, p.roomMax), p.w - 2);
    const h = Math.min(randInt(r, p.roomMin, p.roomMax), p.h - 2);
    const room = { x: randInt(r, 1, p.w - w - 1), y: randInt(r, 1, p.h - h - 1), w, h };
    if (!rooms.some((o) => overlaps(o, room, GAP))) rooms.push(room);
  }
  if (!rooms.length) {
    const w = Math.min(p.roomMax, p.w - 2);
    const h = Math.min(p.roomMax, p.h - 2);
    rooms.push({ x: Math.floor((p.w - w) / 2), y: Math.floor((p.h - h) / 2), w, h });
  }
  return rooms;
}

const center = (a: Room) => ({ x: a.x + Math.floor(a.w / 2), y: a.y + Math.floor(a.h / 2) });
const manhattan = (a: Room, b: Room) => {
  const ca = center(a);
  const cb = center(b);
  return Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y);
};

/** Árvore geradora mínima (Prim) e algumas ligações extras, para ter caminhos alternativos. */
function connections(rooms: Room[], r: SeededRng): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const inTree = new Set([0]);
  while (inTree.size < rooms.length) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const i of inTree) {
      for (let j = 0; j < rooms.length; j++) {
        if (inTree.has(j)) continue;
        const d = manhattan(rooms[i], rooms[j]);
        if (d < bestD) { bestD = d; best = [i, j]; }
      }
    }
    out.push(best!);
    inTree.add(best![1]);
  }
  const has = (a: number, b: number) => out.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  for (let i = 0; i < rooms.length; i++) {
    if (r() >= 0.15) continue;
    let near = -1;
    let nearD = Infinity;
    for (let j = 0; j < rooms.length; j++) {
      if (j === i || has(i, j)) continue;
      const d = manhattan(rooms[i], rooms[j]);
      if (d < nearD) { nearD = d; near = j; }
    }
    if (near >= 0) out.push([i, near]);
  }
  return out;
}

export function generateDungeon(params: DungeonParams, seed: number): Dungeon {
  const p = cleanDungeonParams(params);
  const r = mulberry32(seed);
  const { w, h } = p;
  const cells: string[] = Array(w * h).fill(TERRAIN_CHAR.void);
  /** Sala de cada quadrado (-1 = corredor ou vazio). */
  const roomOf = new Int16Array(w * h).fill(-1);
  const rooms = placeRooms(p, r);
  rooms.forEach((rm, k) => {
    for (let y = rm.y; y < rm.y + rm.h; y++) {
      for (let x = rm.x; x < rm.x + rm.w; x++) {
        cells[y * w + x] = TERRAIN_CHAR.floor;
        roomOf[y * w + x] = k;
      }
    }
  });

  // Corredores em L entre os centros, com a largura pedida. Só escavam o vazio.
  const carve = (x: number, y: number) => {
    for (let dy = 0; dy < p.corridor; dy++) {
      for (let dx = 0; dx < p.corridor; dx++) {
        const cx = Math.min(w - 2, Math.max(1, x + dx));
        const cy = Math.min(h - 2, Math.max(1, y + dy));
        cells[cy * w + cx] = TERRAIN_CHAR.floor;
      }
    }
  };
  for (const [i, j] of connections(rooms, r)) {
    const a = center(rooms[i]);
    const b = center(rooms[j]);
    const horizontalFirst = r() < 0.5;
    const corner = horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    for (const [from, to] of [[a, corner], [corner, b]] as const) {
      const sx = Math.sign(to.x - from.x);
      const sy = Math.sign(to.y - from.y);
      let x = from.x;
      let y = from.y;
      carve(x, y);
      while (x !== to.x || y !== to.y) {
        x += sx;
        y += sy;
        carve(x, y);
      }
    }
  }

  const layout = { ...blankLayout(w, h, 'void'), cells: cells.join('') };
  wallAround(layout);

  // Entradas: linhas entre um quadrado de sala e um piso de fora dela, agrupadas por lado.
  const doors: EdgeRef[] = [];
  const doorKeys = new Set<string>();
  const floor = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && cells[y * w + x] !== TERRAIN_CHAR.void;
  const outsideRoom = (k: number, x: number, y: number) => floor(x, y) && roomOf[y * w + x] !== k;
  const scrapes: EdgeRef[][] = [];
  rooms.forEach((rm, k) => {
    const sides: Array<{ edges: Array<EdgeRef | null> }> = [];
    // Topo e base: linhas horizontais; esquerda e direita: verticais.
    const top: Array<EdgeRef | null> = [];
    const bottom: Array<EdgeRef | null> = [];
    for (let x = rm.x; x < rm.x + rm.w; x++) {
      top.push(outsideRoom(k, x, rm.y - 1) ? { o: 'h', x, y: rm.y } : null);
      bottom.push(outsideRoom(k, x, rm.y + rm.h) ? { o: 'h', x, y: rm.y + rm.h } : null);
    }
    const left: Array<EdgeRef | null> = [];
    const right: Array<EdgeRef | null> = [];
    for (let y = rm.y; y < rm.y + rm.h; y++) {
      left.push(outsideRoom(k, rm.x - 1, y) ? { o: 'v', x: rm.x, y } : null);
      right.push(outsideRoom(k, rm.x + rm.w, y) ? { o: 'v', x: rm.x + rm.w, y } : null);
    }
    sides.push({ edges: top }, { edges: bottom }, { edges: left }, { edges: right });
    for (const side of sides) {
      let run: EdgeRef[] = [];
      const flush = () => {
        if (!run.length) return;
        if (run.length <= p.corridor) {
          if (r() < p.doors) {
            for (const e of run) {
              const key = edgeKey(e);
              if (doorKeys.has(key)) continue;
              doorKeys.add(key);
              doors.push(e);
            }
          }
        } else {
          scrapes.push(run);
        }
        run = [];
      };
      for (const e of side.edges) {
        if (e) run.push(e);
        else flush();
      }
      flush();
    }
  });
  setWalls(layout, doors, true);

  // Corredor que só raspa a sala vira parede, se isso não isolar nenhuma sala.
  for (const run of scrapes) {
    if (run.some((e) => doorKeys.has(edgeKey(e)))) continue;
    setWalls(layout, run, true);
    if (!allConnected(layout, rooms, doorKeys)) setWalls(layout, run, false);
  }

  return { layout, rooms, doors };
}

/** Todas as salas alcançáveis a partir da primeira (portas contam como passagem). */
export function allConnected(m: MapLayout, rooms: Room[], doorKeys: Set<string>): boolean {
  const { w, h } = m;
  const seen = new Uint8Array(w * h);
  const start = center(rooms[0]);
  const stack = [start.y * w + start.x];
  seen[stack[0]] = 1;
  const free = (e: EdgeRef) => {
    const i = edgeIndex(m, e);
    return (e.o === 'h' ? m.wallsH : m.wallsV)[i] !== '1' || doorKeys.has(edgeKey(e));
  };
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    const steps: Array<[number, number, EdgeRef]> = [
      [x + 1, y, { o: 'v', x: x + 1, y }], [x - 1, y, { o: 'v', x, y }],
      [x, y + 1, { o: 'h', x, y: y + 1 }], [x, y - 1, { o: 'h', x, y }],
    ];
    for (const [nx, ny, e] of steps) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (seen[ni] || m.cells[ni] === TERRAIN_CHAR.void || !free(e)) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  return rooms.every((rm) => {
    const c = center(rm);
    return !!seen[c.y * w + c.x];
  });
}
