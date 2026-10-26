// Movimento no grid: custo de cada passo, o que bloqueia e até onde dá para ir.
// Puro: o mesmo código desenha o alcance no navegador e valida o movimento no motor.
import type { BattleMap, MapObject } from '../model/types';
import { MAP_CELL_M } from '../model/types';
import { terrainOf } from '../model/map';

export interface Point { x: number; y: number }

export type GridSource = Pick<BattleMap, 'w' | 'h' | 'cells' | 'wallsH' | 'wallsV'> & { objects: Iterable<MapObject> };

export interface Grid {
  w: number;
  h: number;
  /** Por quadrado: 0 bloqueado, 1 normal, 2 terreno difícil. */
  mult: Uint8Array;
  /** Por linha: 0 livre (ou porta aberta), 1 não passa (parede ou porta trancada), 2 porta fechada. */
  blockH: Uint8Array;
  blockV: Uint8Array;
}

/** Valores de `blockH`/`blockV`. */
export const EDGE = { free: 0, wall: 1, closedDoor: 2 } as const;

/** Quadrados que o deslocamento em metros permite (9 m = 6). */
export const squaresFor = (meters: number) => Math.max(0, Math.floor(meters / MAP_CELL_M + 1e-9));
export const metersFor = (squares: number) => +(squares * MAP_CELL_M).toFixed(1);

export function buildGrid(src: GridSource): Grid {
  const { w, h } = src;
  const mult = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const t = terrainOf(src.cells[i]);
    mult[i] = t === 'void' ? 0 : t === 'difficult' || t === 'stairs' ? 2 : 1;
  }
  const blockH = new Uint8Array((h + 1) * w);
  const blockV = new Uint8Array(h * (w + 1));
  for (let i = 0; i < blockH.length; i++) blockH[i] = src.wallsH[i] === '1' ? 1 : 0;
  for (let i = 0; i < blockV.length; i++) blockV[i] = src.wallsV[i] === '1' ? 1 : 0;
  for (const o of src.objects) {
    if (o.kind === 'door') {
      const { o: or, x, y } = o.edge;
      const v = o.state === 'open' ? EDGE.free : o.state === 'locked' ? EDGE.wall : EDGE.closedDoor;
      if (or === 'h' && x >= 0 && x < w && y >= 0 && y <= h) blockH[y * w + x] = v;
      if (or === 'v' && x >= 0 && x <= w && y >= 0 && y < h) blockV[y * (w + 1) + x] = v;
    } else if (o.effect !== 'none') {
      for (let y = o.y; y < o.y + o.h; y++) {
        for (let x = o.x; x < o.x + o.w; x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const i = y * w + x;
          if (o.effect === 'block') mult[i] = 0;
          else if (mult[i]) mult[i] = 2;
        }
      }
    }
  }
  return { w, h, mult, blockH, blockV };
}

const passable = (g: Grid, x: number, y: number) => x >= 0 && y >= 0 && x < g.w && y < g.h && g.mult[y * g.w + x] > 0;

/** A linha cruzada por um passo de um quadrado na horizontal ou vertical. */
function edgeOf(g: Grid, x: number, y: number, dx: number, dy: number): number {
  if (dx === 1) return g.blockV[y * (g.w + 1) + x + 1];
  if (dx === -1) return g.blockV[y * (g.w + 1) + x];
  if (dy === 1) return g.blockH[(y + 1) * g.w + x];
  return g.blockH[y * g.w + x];
}

/** Passo de um quadrado na horizontal ou vertical. `strict`: nem porta fechada serve (diagonal). */
function orthOk(g: Grid, x: number, y: number, dx: number, dy: number, strict = false): boolean {
  if (!passable(g, x + dx, y + dy)) return false;
  const e = edgeOf(g, x, y, dx, dy);
  return strict ? e === EDGE.free : e !== EDGE.wall;
}

/**
 * Pode dar o passo? Na diagonal, os dois caminhos em L precisam estar livres:
 * não se corta canto de parede, de vazio nem de obstáculo, nem se passa por porta fechada.
 */
export function canStep(g: Grid, x: number, y: number, dx: number, dy: number): boolean {
  if (!dx || !dy) return orthOk(g, x, y, dx, dy);
  return orthOk(g, x, y, dx, 0, true) && orthOk(g, x + dx, y, 0, dy, true)
    && orthOk(g, x, y, 0, dy, true) && orthOk(g, x, y + dy, dx, 0, true);
}

/** Atravessar porta fechada custa como entrar em terreno difícil. */
export function crossesClosedDoor(g: Grid, x: number, y: number, dx: number, dy: number): boolean {
  return (!dx || !dy) && edgeOf(g, x, y, dx, dy) === EDGE.closedDoor;
}

/** Diagonal alterna 1, 2, 1, 2...; terreno difícil dobra o custo do quadrado em que se entra. */
export const stepCost = (mult: number, diagonal: boolean, parity: 0 | 1) => (diagonal && parity ? 2 : 1) * mult;

const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export interface Reach {
  w: number;
  h: number;
  start: number;
  budget: number;
  /** Custo mínimo por estado (quadrado*2 + paridade); -1 = não alcança. */
  dist: Int32Array;
  /** Estado anterior no caminho mais barato; -1 = início. */
  prev: Int32Array;
  /** Quadrados onde não se pode parar (outros tokens). */
  occupied: Set<number>;
}

/**
 * Até onde se chega a partir de `start` gastando no máximo `budget` quadrados.
 * `parity0` = 1 quando a próxima diagonal já custa 2 (movimento anterior no mesmo turno).
 * Passa por quadrados ocupados, mas não termina neles.
 */
export function reachFrom(g: Grid, start: Point, budget: number, parity0: 0 | 1 = 0, occupied: Set<number> = new Set()): Reach {
  const n = g.w * g.h;
  const dist = new Int32Array(n * 2).fill(-1);
  const prev = new Int32Array(n * 2).fill(-1);
  const s = start.y * g.w + start.x;
  const reach: Reach = { w: g.w, h: g.h, start: s, budget, dist, prev, occupied };
  if (start.x < 0 || start.y < 0 || start.x >= g.w || start.y >= g.h) return reach;
  // Fila de baldes: os custos são inteiros pequenos (no máximo 4 por passo).
  const buckets: number[][] = [];
  const s0 = s * 2 + parity0;
  dist[s0] = 0;
  buckets[0] = [s0];
  const done = new Uint8Array(n * 2);
  for (let c = 0; c < buckets.length && c <= budget; c++) {
    const b = buckets[c];
    if (!b) continue;
    for (let k = 0; k < b.length; k++) {
      const st = b[k];
      if (done[st] || dist[st] !== c) continue;
      done[st] = 1;
      const cell = st >> 1;
      const par = (st & 1) as 0 | 1;
      const x = cell % g.w;
      const y = (cell - x) / g.w;
      for (const [dx, dy] of DIRS) {
        if (!canStep(g, x, y, dx, dy)) continue;
        const diag = dx !== 0 && dy !== 0;
        const ni = (y + dy) * g.w + x + dx;
        const mult = crossesClosedDoor(g, x, y, dx, dy) ? Math.max(2, g.mult[ni]) : g.mult[ni];
        const nc = c + stepCost(mult, diag, par);
        if (nc > budget) continue;
        const np = diag ? ((1 - par) as 0 | 1) : par;
        const ns = ni * 2 + np;
        if (dist[ns] !== -1 && dist[ns] <= nc) continue;
        dist[ns] = nc;
        prev[ns] = st;
        (buckets[nc] ??= []).push(ns);
      }
    }
  }
  return reach;
}

/** Passos de um caminho traçado à mão, no máximo. */
export const MAX_PATH = 300;

/**
 * Custo de um caminho exato, quadrado a quadrado (inclui o de partida).
 * null = algum passo não vale (não é vizinho, parede, canto, vazio...).
 */
export function followPath(g: Grid, cells: Point[], parity0: 0 | 1 = 0): { cost: number; parity: 0 | 1 } | null {
  if (cells.length < 2 || cells.length > MAX_PATH + 1) return null;
  let cost = 0;
  let par = parity0;
  for (let i = 1; i < cells.length; i++) {
    const a = cells[i - 1];
    const b = cells[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if ((!dx && !dy) || Math.abs(dx) > 1 || Math.abs(dy) > 1) return null;
    if (a.x < 0 || a.y < 0 || a.x >= g.w || a.y >= g.h || !canStep(g, a.x, a.y, dx, dy)) return null;
    const diag = dx !== 0 && dy !== 0;
    const ni = b.y * g.w + b.x;
    const mult = crossesClosedDoor(g, a.x, a.y, dx, dy) ? Math.max(2, g.mult[ni]) : g.mult[ni];
    cost += stepCost(mult, diag, par);
    if (diag) par = (1 - par) as 0 | 1;
  }
  return { cost, parity: par };
}

/**
 * Leva o rascunho de caminho até `to`: se `to` já está nele, corta ali; senão vai
 * em linha reta, um vizinho por vez, até onde der (parede ou fim do deslocamento).
 */
export function extendPath(g: Grid, draft: Point[], to: Point, parity0: 0 | 1, budget: number): Point[] {
  const k = draft.findIndex((p) => p.x === to.x && p.y === to.y);
  if (k >= 0) return draft.slice(0, k + 1);
  const out = [...draft];
  let last = out[out.length - 1];
  const n = Math.max(Math.abs(to.x - last.x), Math.abs(to.y - last.y));
  const ox = last.x;
  const oy = last.y;
  for (let i = 1; i <= n && out.length <= MAX_PATH; i++) {
    const t = i / n;
    const next = { x: Math.round(ox + (to.x - ox) * t), y: Math.round(oy + (to.y - oy) * t) };
    if (next.x === last.x && next.y === last.y) continue;
    // Voltar por cima do próprio rastro corta o rascunho ali.
    const back = out.findIndex((p) => p.x === next.x && p.y === next.y);
    if (back >= 0) { out.length = back + 1; last = next; continue; }
    const cost = followPath(g, [...out, next], parity0);
    if (!cost || cost.cost > budget) break;
    out.push(next);
    last = next;
  }
  return out;
}

/** O estado mais barato de um quadrado (empate: paridade 0, que deixa a próxima diagonal mais barata). */
function bestState(r: Reach, i: number): number {
  const a = r.dist[i * 2];
  const b = r.dist[i * 2 + 1];
  if (a === -1 && b === -1) return -1;
  if (a === -1) return i * 2 + 1;
  if (b === -1) return i * 2;
  return b < a ? i * 2 + 1 : i * 2;
}

/** Custo para chegar ao quadrado; -1 = fora de alcance. */
export function costTo(r: Reach, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= r.w || y >= r.h) return -1;
  const st = bestState(r, y * r.w + x);
  return st < 0 ? -1 : r.dist[st];
}

/** Dá para terminar o movimento aqui (alcança e não está ocupado). */
export function canEnd(r: Reach, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= r.w || y >= r.h) return false;
  const i = y * r.w + x;
  if (i === r.start) return true;
  return costTo(r, x, y) >= 0 && !r.occupied.has(i);
}

/** Quadrados onde dá para terminar o movimento (sem o de partida). */
export function reachableCells(r: Reach): number[] {
  const out: number[] = [];
  for (let i = 0; i < r.w * r.h; i++) {
    if (i === r.start || r.occupied.has(i)) continue;
    if (r.dist[i * 2] >= 0 || r.dist[i * 2 + 1] >= 0) out.push(i);
  }
  return out;
}

export interface GridPath {
  /** Do quadrado de partida ao destino, inclusive. */
  cells: Point[];
  cost: number;
  /** Paridade ao chegar: 1 = a próxima diagonal custa 2. */
  parity: 0 | 1;
}

export function pathTo(r: Reach, x: number, y: number): GridPath | null {
  if (x < 0 || y < 0 || x >= r.w || y >= r.h) return null;
  const end = bestState(r, y * r.w + x);
  if (end < 0) return null;
  const cells: Point[] = [];
  for (let st = end; st !== -1; st = r.prev[st]) {
    const i = st >> 1;
    cells.push({ x: i % r.w, y: Math.floor(i / r.w) });
  }
  cells.reverse();
  return { cells, cost: r.dist[end], parity: (end & 1) as 0 | 1 };
}
