// Peças comuns dos geradores: retângulos, planta por regiões, portas e giro/espelho da planta.
import type { EdgeRef, MapLayout, Terrain } from '../../model/types';
import { TERRAIN_CHAR } from '../../model/types';
import { blankLayout, setWalls } from '../../model/map';
import { randInt, type SeededRng } from '../random';

export interface Rect { x: number; y: number; w: number; h: number }

/** Para onde fica a "frente" do cômodo (o altar, no templo). n = topo do mapa. */
export type Dir = 'n' | 's' | 'e' | 'w';

export type RoomKind =
  | 'generic' | 'sala' | 'cozinha' | 'quarto' | 'banheiro' | 'despensa' | 'escritorio' | 'biblioteca'
  | 'nave' | 'santuario' | 'vestibulo' | 'capela' | 'sacristia' | 'cela' | 'torre'
  | 'guarda' | 'deposito' | 'tesouro' | 'dormitorio' | 'ruina' | 'salao' | 'cabana';

export const ROOM_KINDS: Record<RoomKind, { one: string; many: string }> = {
  generic: { one: 'sala', many: 'salas' },
  sala: { one: 'sala de estar', many: 'salas de estar' },
  cozinha: { one: 'cozinha', many: 'cozinhas' },
  quarto: { one: 'quarto', many: 'quartos' },
  banheiro: { one: 'banheiro', many: 'banheiros' },
  despensa: { one: 'despensa', many: 'despensas' },
  escritorio: { one: 'escritório', many: 'escritórios' },
  biblioteca: { one: 'biblioteca', many: 'bibliotecas' },
  nave: { one: 'nave', many: 'naves' },
  santuario: { one: 'santuário', many: 'santuários' },
  vestibulo: { one: 'vestíbulo', many: 'vestíbulos' },
  capela: { one: 'capela', many: 'capelas' },
  sacristia: { one: 'sacristia', many: 'sacristias' },
  cela: { one: 'cela', many: 'celas' },
  torre: { one: 'torre', many: 'torres' },
  guarda: { one: 'sala da guarda', many: 'salas da guarda' },
  deposito: { one: 'depósito', many: 'depósitos' },
  tesouro: { one: 'sala do tesouro', many: 'salas do tesouro' },
  dormitorio: { one: 'dormitório', many: 'dormitórios' },
  ruina: { one: 'ruína', many: 'ruínas' },
  salao: { one: 'salão', many: 'salões' },
  cabana: { one: 'cabana', many: 'cabanas' },
};

export interface GenRoom extends Rect { kind: RoomKind; dir?: Dir }

/** O que cada quadrado é para a mobília. */
export const ZONE = { none: 0, room: 1, corridor: 2, outside: 3, path: 4 } as const;

/** Resultado de um gerador, antes da mobília. */
export interface GenBase {
  layout: MapLayout;
  rooms: GenRoom[];
  /** Linhas que ganham porta fechada (a parede da linha já vem ligada). */
  doors: EdgeRef[];
  /** ZONE de cada quadrado, índice y*w+x. */
  zone: Uint8Array;
}

export const area = (r: Rect) => r.w * r.h;

export const pick = <T>(r: SeededRng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

/** Pedaços de `a` fora de `b` (até quatro). */
export function subtract(a: Rect, b: Rect): Rect[] {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 >= x2 || y1 >= y2) return [a];
  const out: Rect[] = [];
  if (y1 > a.y) out.push({ x: a.x, y: a.y, w: a.w, h: y1 - a.y });
  if (y2 < a.y + a.h) out.push({ x: a.x, y: y2, w: a.w, h: a.y + a.h - y2 });
  if (x1 > a.x) out.push({ x: a.x, y: y1, w: x1 - a.x, h: y2 - y1 });
  if (x2 < a.x + a.w) out.push({ x: x2, y: y1, w: a.x + a.w - x2, h: y2 - y1 });
  return out;
}

/** Encostam por um lado (ao menos um quadrado) ou se sobrepõem. */
export function touches(a: Rect, b: Rect): boolean {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return (ox > 0 && oy >= 0) || (oy > 0 && ox >= 0);
}

/** Comprimentos entre min e max que somam `len` (o último pode sair do intervalo se não houver jeito). */
export function cutLengths(len: number, min: number, max: number, r: SeededRng): number[] {
  const out: number[] = [];
  let rem = len;
  while (rem > 0) {
    if (rem <= max) { out.push(rem); break; }
    const hi = Math.min(max, rem - min);
    if (hi < min) {
      const a = Math.floor(rem / 2);
      out.push(a, rem - a);
      break;
    }
    const n = randInt(r, min, hi);
    out.push(n);
    rem -= n;
  }
  return out;
}

// ── Giro e espelho ──────────────────────────────────────────────────────────
// A planta é pensada num quadro "canônico" (W × H) e depois espelhada e/ou
// transposta para caber na caixa do mapa.

export interface Frame { W: number; H: number; flipX: boolean; flipY: boolean; transpose: boolean; ox: number; oy: number }

export function frameFor(box: Rect, transpose: boolean, flipX: boolean, flipY: boolean): Frame {
  return { W: transpose ? box.h : box.w, H: transpose ? box.w : box.h, flipX, flipY, transpose, ox: box.x, oy: box.y };
}

export function mapRect(f: Frame, r: Rect): Rect {
  let x = f.flipX ? f.W - r.x - r.w : r.x;
  let y = f.flipY ? f.H - r.y - r.h : r.y;
  let { w, h } = r;
  if (f.transpose) [x, y, w, h] = [y, x, h, w];
  return { x: x + f.ox, y: y + f.oy, w, h };
}

export function mapDir(f: Frame, d: Dir): Dir {
  let out = d;
  if (f.flipX) out = out === 'e' ? 'w' : out === 'w' ? 'e' : out;
  if (f.flipY) out = out === 'n' ? 's' : out === 's' ? 'n' : out;
  if (f.transpose) out = ({ n: 'w', w: 'n', s: 'e', e: 's' } as const)[out];
  return out;
}

// ── Planta por regiões ──────────────────────────────────────────────────────
// Cada quadrado tem uma região: -1 fora, 0 corredor, k+1 o cômodo k.
// Parede em toda linha entre regiões diferentes; portas e aberturas depois.

export class Plan {
  readonly region: Int16Array;
  constructor(readonly w: number, readonly h: number) {
    this.region = new Int16Array(w * h).fill(-1);
  }

  at(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : this.region[y * this.w + x];
  }

  fill(r: Rect, id: number) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) this.region[y * this.w + x] = id;
  }

  /** Linhas entre as regiões a e b, em trechos contínuos (mesma linha, quadrados vizinhos). */
  runs(a: number, b: number): EdgeRef[][] {
    const is = (p: number, q: number) => (p === a && q === b) || (p === b && q === a);
    const out: EdgeRef[][] = [];
    for (let y = 0; y <= this.h; y++) {
      let run: EdgeRef[] = [];
      for (let x = 0; x <= this.w; x++) {
        if (x < this.w && is(this.at(x, y - 1), this.at(x, y))) run.push({ o: 'h', x, y });
        else if (run.length) { out.push(run); run = []; }
      }
    }
    for (let x = 0; x <= this.w; x++) {
      let run: EdgeRef[] = [];
      for (let y = 0; y <= this.h; y++) {
        if (y < this.h && is(this.at(x - 1, y), this.at(x, y))) run.push({ o: 'v', x, y });
        else if (run.length) { out.push(run); run = []; }
      }
    }
    return out;
  }

  /** Vizinhas de cada região (sem contar ela mesma), numa passada só. */
  adjacency(): Map<number, Set<number>> {
    const out = new Map<number, Set<number>>();
    const add = (a: number, b: number) => {
      if (a === b) return;
      if (!out.has(a)) out.set(a, new Set());
      if (!out.has(b)) out.set(b, new Set());
      out.get(a)!.add(b);
      out.get(b)!.add(a);
    };
    for (let y = -1; y < this.h; y++) {
      for (let x = -1; x < this.w; x++) {
        add(this.at(x, y), this.at(x + 1, y));
        add(this.at(x, y), this.at(x, y + 1));
      }
    }
    return out;
  }

  /** Terreno (regiões viram piso; fora vira `outside`) e paredes entre regiões diferentes. */
  toLayout(outside: Terrain): MapLayout {
    const { w, h } = this;
    const layout = blankLayout(w, h, outside);
    const cells = layout.cells.split('');
    for (let i = 0; i < w * h; i++) if (this.region[i] >= 0) cells[i] = TERRAIN_CHAR.floor;
    layout.cells = cells.join('');
    const edges: EdgeRef[] = [];
    for (let y = 0; y <= h; y++) {
      for (let x = 0; x < w; x++) if (this.at(x, y - 1) !== this.at(x, y)) edges.push({ o: 'h', x, y });
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x <= w; x++) if (this.at(x - 1, y) !== this.at(x, y)) edges.push({ o: 'v', x, y });
    }
    setWalls(layout, edges, true);
    return layout;
  }
}

/** Escolhe `width` linhas seguidas de um trecho: no meio, ou num ponto qualquer longe das pontas. */
export function pickSpan(run: EdgeRef[], width: number, r: SeededRng | null): EdgeRef[] {
  const n = Math.min(width, run.length);
  let start: number;
  if (!r) start = Math.floor((run.length - n) / 2);
  else if (run.length - n >= 2) start = randInt(r, 1, run.length - n - 1);
  else start = randInt(r, 0, run.length - n);
  return run.slice(start, start + n);
}

/** Porta (fica na parede) ou abertura (tira a parede). */
export function passage(layout: MapLayout, doors: EdgeRef[], edges: EdgeRef[], door: boolean) {
  if (door) doors.push(...edges);
  else setWalls(layout, edges, false);
}

/**
 * Quadrados alcançáveis a partir de `starts`, andando em cruz. Vazio e `blocked` não passam;
 * parede só passa se tiver porta (qualquer estado).
 */
export function flood(layout: MapLayout, doorKeys: Set<string>, starts: number[], blocked?: Uint8Array): Uint8Array {
  const { w, h, cells, wallsH, wallsV } = layout;
  const seen = new Uint8Array(w * h);
  const ok = (i: number) => cells[i] !== TERRAIN_CHAR.void && !(blocked && blocked[i]);
  const stack: number[] = [];
  for (const s of starts) if (ok(s) && !seen[s]) { seen[s] = 1; stack.push(s); }
  const through = (o: 'h' | 'v', x: number, y: number) => {
    const wall = o === 'h' ? wallsH[y * w + x] : wallsV[y * (w + 1) + x];
    return wall !== '1' || doorKeys.has(`${o}${x},${y}`);
  };
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    const go = (ni: number, pass: boolean) => {
      if (pass && !seen[ni] && ok(ni)) { seen[ni] = 1; stack.push(ni); }
    };
    if (x + 1 < w) go(i + 1, through('v', x + 1, y));
    if (x > 0) go(i - 1, through('v', x, y));
    if (y + 1 < h) go(i + w, through('h', x, y + 1));
    if (y > 0) go(i - w, through('h', x, y));
  }
  return seen;
}

export const longest = (runs: EdgeRef[][], r: SeededRng): EdgeRef[] | null => {
  if (!runs.length) return null;
  const max = Math.max(...runs.map((x) => x.length));
  return pick(r, runs.filter((x) => x.length === max));
};
