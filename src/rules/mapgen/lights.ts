// Janelas e iluminação do mapa gerado: janelas nas paredes que dão para fora, velas e
// candelabros sobre as mesas, lareiras acesas, lustres no teto dos salões, lampiões e tochas
// presos nas paredes de corredores e masmorras (algumas salas da masmorra ficam no escuro).
// Roda depois da mobília, com sorteio próprio: não mexe na planta nem nos móveis.
import type { EdgeRef, LightKind, LightMount, MapPreset } from '../../model/types';
import { LIGHT_KINDS, TERRAIN_CHAR } from '../../model/types';
import { edgeKey } from '../../model/map';
import { randInt, type SeededRng } from '../random';
import type { GenProp } from './furnish';
import { type Dir, type GenBase, type GenRoom, type Rect, type RoomKind, ZONE } from './shared';

export interface GenLight {
  light: LightKind;
  label: string;
  x: number;
  y: number;
  radius: number;
  mount: LightMount;
  side?: Dir;
}

export interface Lighting {
  windows: EdgeRef[];
  lights: GenLight[];
  /** Máscara de céu aberto ('1'); ausente na masmorra. */
  outside?: string;
}

interface WallSpot { x: number; y: number; side: Dir }

function shuffle<T>(r: SeededRng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Linha do lado `side` do quadrado (x, y). */
function sideEdge(x: number, y: number, side: Dir): EdgeRef {
  switch (side) {
    case 'n': return { o: 'h', x, y };
    case 's': return { o: 'h', x, y: y + 1 };
    case 'w': return { o: 'v', x, y };
    case 'e': return { o: 'v', x: x + 1, y };
  }
}

const STEP: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
const SIDES: Dir[] = ['n', 's', 'w', 'e'];

/** Janelas por cômodo: [mínimo, máximo] (o tamanho do cômodo decide dentro disso). */
const WINDOWS: Partial<Record<RoomKind, [number, number]>> = {
  sala: [1, 3], cozinha: [1, 2], quarto: [1, 2], banheiro: [0, 1], despensa: [0, 1], escritorio: [1, 2], biblioteca: [1, 3],
  jantar: [1, 3], lavanderia: [0, 1], entrada: [1, 2], recepcao: [1, 3], taverna: [2, 4],
  nave: [2, 8], santuario: [1, 2], vestibulo: [0, 2], capela: [1, 1], sacristia: [0, 1], torre: [1, 1], cabana: [1, 2], generic: [1, 2],
};

/** Cômodos com lustre no teto (a partir desta área). */
const CEILING: Partial<Record<RoomKind, number>> = { taverna: 0, jantar: 20, recepcao: 0, nave: 0, sala: 24, entrada: 20, salao: 0 };

/** Lampião de parede: chance e quantos no máximo. */
const WALL_LAMP: Partial<Record<RoomKind, [number, number]>> = {
  quarto: [0.6, 1], banheiro: [0.4, 1], biblioteca: [0.9, 2], escritorio: [0.5, 1], lavanderia: [0.3, 1], despensa: [0.3, 1], vassouras: [0.2, 1],
  entrada: [0.8, 1], cozinha: [0.5, 1], vestibulo: [0.7, 2], sacristia: [0.6, 1], capela: [0.5, 1], taverna: [0.8, 2], sala: [0.4, 1],
};

/** Salas da masmorra: chance de ter tochas acesas. */
const DUNGEON_LIT: Partial<Record<RoomKind, number>> = {
  guarda: 1, salao: 0.85, santuario: 0.9, dormitorio: 0.6, deposito: 0.4, cela: 0.35, tesouro: 0.5, biblioteca: 0.7, ruina: 0.3, generic: 0.6,
};

export function illuminate(base: GenBase, props: GenProp[], preset: MapPreset, r: SeededRng, budget: number): Lighting {
  const { layout, zone } = base;
  const { w, h, cells, wallsH, wallsV } = layout;
  const n = w * h;
  const doorKeys = new Set(base.doors.map(edgeKey));
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const open = (x: number, y: number) => inb(x, y) && cells[y * w + x] !== TERRAIN_CHAR.void;
  const wall = (e: EdgeRef) => (e.o === 'h' ? wallsH[e.y * w + e.x] : wallsV[e.y * (w + 1) + e.x]) === '1';
  const solid = (e: EdgeRef) => wall(e) && !doorKeys.has(edgeKey(e));

  // Céu aberto: o quintal, a trilha e as ruínas sem telhado.
  let outside: string | undefined;
  const sky = new Uint8Array(n);
  if (preset !== 'dungeon') {
    for (let i = 0; i < n; i++) if (zone[i] === ZONE.outside || zone[i] === ZONE.path) sky[i] = 1;
    for (const rm of base.rooms) {
      if (rm.kind !== 'ruina') continue;
      for (let y = rm.y; y < rm.y + rm.h; y++) for (let x = rm.x; x < rm.x + rm.w; x++) if (inb(x, y)) sky[y * w + x] = 1;
    }
    let s = '';
    for (let i = 0; i < n; i++) s += sky[i] ? '1' : '0';
    if (s.includes('1')) outside = s;
  }

  // Móveis por quadrado: tocha não fica em cima de estante, fogueira não fica numa árvore.
  const blockAt = new Uint8Array(n);
  const propAt = new Uint8Array(n);
  for (const p of props) {
    for (let y = p.y; y < p.y + p.h; y++) {
      for (let x = p.x; x < p.x + p.w; x++) {
        if (!inb(x, y)) continue;
        propAt[y * w + x] = 1;
        if (p.effect === 'block') blockAt[y * w + x] = 1;
      }
    }
  }

  const lights: GenLight[] = [];
  const windows: EdgeRef[] = [];
  const lit = new Uint8Array(n);
  const full = () => lights.length + windows.length >= budget;
  const add = (kind: LightKind, x: number, y: number, mount: LightMount, label = '', side?: Dir): boolean => {
    if (full() || !open(x, y) || lit[y * w + x]) return false;
    lit[y * w + x] = 1;
    lights.push({ light: kind, label: label || LIGHT_KINDS[kind].label, x, y, radius: LIGHT_KINDS[kind].radius, mount, ...(side ? { side } : {}) });
    return true;
  };

  const inside = (R: Rect, x: number, y: number) => x >= R.x && y >= R.y && x < R.x + R.w && y < R.y + R.h;
  const propsIn = (R: Rect) => props.filter((p) => inside(R, p.x, p.y));

  /** Quadrados encostados numa parede de verdade, livres de móvel que bloqueia e de escada. */
  const wallSpots = (idx: Iterable<number>): WallSpot[] => {
    const out: WallSpot[] = [];
    for (const i of idx) {
      const x = i % w;
      const y = (i - x) / w;
      if (!open(x, y) || blockAt[i] || cells[i] === TERRAIN_CHAR.stairs) continue;
      for (const side of SIDES) if (solid(sideEdge(x, y, side))) out.push({ x, y, side });
    }
    return out;
  };

  /** Até `max` lâmpadas de parede, longe umas das outras (`gap` quadrados). */
  const wallLights = (spots: WallSpot[], kind: LightKind, max: number, gap: number, chance = 1): number => {
    const chosen: WallSpot[] = [];
    for (const s of shuffle(r, spots)) {
      if (chosen.length >= max) break;
      if (chosen.some((c) => Math.max(Math.abs(c.x - s.x), Math.abs(c.y - s.y)) < gap)) continue;
      if (r() >= chance) { chosen.push(s); continue; } // fica o espaço, sem luz: corredores com trechos escuros
      if (add(kind, s.x, s.y, 'parede', '', s.side)) chosen.push(s);
    }
    return chosen.length;
  };

  const roomCells = (R: Rect) => {
    const out: number[] = [];
    for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) if (inb(x, y)) out.push(y * w + x);
    return out;
  };

  /** Lustres no teto: um por bloco de ~9 quadrados. */
  const ceiling = (R: Rect) => {
    const nx = Math.max(1, Math.round(R.w / 9));
    const ny = Math.max(1, Math.round(R.h / 9));
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = R.x + Math.floor(((i + 0.5) * R.w) / nx);
        const y = R.y + Math.floor(((j + 0.5) * R.h) / ny);
        add('lustre', x, y, 'teto');
      }
    }
  };

  /** Velas, candelabros e lampiões sobre as mesas; lareiras e fogões acesos; velas no altar. */
  const onFurniture = (R: GenRoom): number => {
    let count = 0;
    for (const p of propsIn(R)) {
      const cx = p.x + Math.floor((p.w - 1) / 2);
      const cy = p.y + Math.floor((p.h - 1) / 2);
      if (p.prop === 'fogao') {
        if (p.label === 'Lareira') count += +add('lareira', p.x, p.y, 'chao', 'Lareira');
        else if (r() < 0.8) count += +add('braseiro', p.x, p.y, 'chao', 'Fogo do fogão');
      } else if (p.prop === 'altar') {
        count += +add('candelabro', p.x, p.y, 'mesa');
        if (p.w * p.h > 1) count += +add('candelabro', p.x + p.w - 1, p.y + p.h - 1, 'mesa');
      } else if (p.prop === 'mesa') {
        const label = p.label;
        if (label === 'Escrivaninha' || label === 'Mesa de leitura') { if (r() < 0.9) count += +add('vela', p.x, p.y, 'mesa'); }
        else if (label === 'Mesa de jantar') count += +add('candelabro', cx, cy, 'mesa');
        else if (label.startsWith('Balcão')) count += +add('lampiao', p.x, p.y, 'mesa');
        else if (label === 'Aparador') { if (r() < 0.5) count += +add('candelabro', p.x, p.y, 'mesa'); }
        else if (r() < (R.kind === 'taverna' ? 0.4 : 0.5)) count += +add('vela', cx, cy, 'mesa');
      } else if (p.prop === 'bau' && (R.kind === 'quarto' || R.kind === 'cela' || R.kind === 'dormitorio') && r() < 0.4) {
        count += +add('vela', p.x, p.y, 'mesa');
      }
    }
    return count;
  };

  // ── Luzes de cada cômodo ──
  for (const R of base.rooms) {
    if (full()) break;
    const k = R.kind;
    if (preset === 'outdoor' && k === 'ruina') continue;
    const area = R.w * R.h;
    let count = onFurniture(R);
    const spots = () => wallSpots(roomCells(R));
    if (preset === 'dungeon') {
      if (r() >= (DUNGEON_LIT[k] ?? 0.5)) continue; // sala no escuro
      const perim = 2 * (R.w + R.h);
      count += wallLights(spots(), 'tocha', Math.max(1, Math.round(perim / 10)), 5);
      if (k === 'salao' && r() < 0.6) {
        const c = { x: R.x + Math.floor(R.w / 2), y: R.y + Math.floor(R.h / 2) };
        if (!blockAt[c.y * w + c.x]) add('braseiro', c.x, c.y, 'chao');
      }
      continue;
    }
    const ceil = CEILING[k];
    if (ceil !== undefined && area >= ceil) { ceiling(R); count++; }
    const lamp = WALL_LAMP[k];
    if (lamp && r() < lamp[0]) count += wallLights(spots(), 'lampiao', lamp[1], 4);
    if (k === 'torre') count += wallLights(spots(), 'tocha', 1, 4);
    // Cômodo sem nada aceso ainda: um lampião na parede, para não ficar no breu.
    if (!count && k !== 'despensa' && k !== 'lavanderia' && k !== 'vassouras' && r() < 0.5) wallLights(spots(), 'lampiao', 1, 4);
  }

  // ── Corredores: lampiões (casa, templo) ou tochas (masmorra), com trechos escuros na masmorra ──
  const corridor: number[] = [];
  for (let i = 0; i < n; i++) if (zone[i] === ZONE.corridor) corridor.push(i);
  if (corridor.length && !full()) {
    const spots = wallSpots(corridor);
    if (preset === 'dungeon') wallLights(spots, 'tocha', Math.ceil(corridor.length / 12), 7, 0.6);
    else wallLights(spots, 'lampiao', Math.ceil(corridor.length / 10), 6, 0.9);
  }

  // ── Fogueiras no campo, perto das construções ──
  if (preset === 'outdoor') {
    for (const R of base.rooms) {
      if (full() || r() >= 0.45) continue;
      const cands: Array<[number, number]> = [];
      for (let y = R.y - 3; y <= R.y + R.h + 2; y++) {
        for (let x = R.x - 3; x <= R.x + R.w + 2; x++) {
          const ring = x < R.x - 1 || y < R.y - 1 || x > R.x + R.w || y > R.y + R.h;
          if (ring && open(x, y) && sky[y * w + x] && !propAt[y * w + x] && zone[y * w + x] !== ZONE.path) cands.push([x, y]);
        }
      }
      if (cands.length) {
        const [x, y] = cands[randInt(r, 0, cands.length - 1)];
        add('fogueira', x, y, 'chao');
      }
    }
  }

  // ── Janelas: nas paredes entre um cômodo coberto e o céu aberto ──
  if (preset !== 'dungeon') {
    const taken = new Set<string>();
    const windowsFor = (idx: number[], max: number) => {
      if (max <= 0) return;
      const cands: EdgeRef[] = [];
      for (const i of idx) {
        const x = i % w;
        const y = (i - x) / w;
        if (sky[i] || !open(x, y)) continue;
        for (const side of SIDES) {
          const [dx, dy] = STEP[side];
          const ox = x + dx;
          const oy = y + dy;
          if (!open(ox, oy) || !sky[oy * w + ox]) continue;
          const e = sideEdge(x, y, side);
          if (!solid(e)) continue;
          // Longe das pontas da parede e das portas: os vizinhos na mesma linha também são parede.
          const along = (k: number): EdgeRef => (e.o === 'h' ? { o: 'h', x: e.x + k, y: e.y } : { o: 'v', x: e.x, y: e.y + k });
          if (![-1, 1].every((k) => { const a = along(k); return solid(a) && !doorKeys.has(edgeKey(a)); })) continue;
          cands.push(e);
        }
      }
      const chosen: EdgeRef[] = [];
      for (const e of shuffle(r, cands)) {
        if (chosen.length >= max || full()) break;
        if (taken.has(edgeKey(e))) continue;
        if (chosen.some((c) => Math.abs(c.x - e.x) + Math.abs(c.y - e.y) < 3)) continue;
        chosen.push(e);
        taken.add(edgeKey(e));
        windows.push(e);
      }
    };
    for (const R of base.rooms) {
      const lim = WINDOWS[R.kind];
      if (!lim || (preset === 'outdoor' && R.kind === 'ruina')) continue;
      const [lo, hi] = lim;
      const size = Math.round((R.w * R.h) / 16);
      const want = Math.min(hi, Math.max(lo, size));
      windowsFor(roomCells(R), lo === 0 && r() < 0.4 ? 0 : want);
    }
    if (corridor.length) windowsFor(corridor, Math.floor(corridor.length / 8));
  }

  return { windows, lights, ...(outside ? { outside } : {}) };
}
