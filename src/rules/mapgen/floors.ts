// Escadas entre andares: os mesmos quadrados nos dois andares, encostados numa parede,
// longe de portas e vãos (não tapam passagem nem ficam na frente de uma porta).
import type { EdgeRef } from '../../model/types';
import { TERRAIN_CHAR } from '../../model/types';
import type { SeededRng } from '../random';
import { type GenBase, type Rect, ZONE } from './shared';

const SIDES: Array<[number, number, (x: number, y: number) => EdgeRef]> = [
  [0, -1, (x, y) => ({ o: 'h', x, y })],
  [0, 1, (x, y) => ({ o: 'h', x, y: y + 1 })],
  [-1, 0, (x, y) => ({ o: 'v', x, y })],
  [1, 0, (x, y) => ({ o: 'v', x: x + 1, y })],
];

const key = (e: EdgeRef) => `${e.o}${e.x},${e.y}`;

/** Lados (índices de SIDES) com parede de verdade, ou null se o quadrado não serve para escada neste andar. */
function wallSides(b: GenBase, x: number, y: number): number[] | null {
  const { w, h, cells, wallsH, wallsV } = b.layout;
  const i = y * w + x;
  if (cells[i] !== TERRAIN_CHAR.floor) return null;
  const z = b.zone[i];
  if (z !== ZONE.room && z !== ZONE.corridor) return null;
  const doors = new Set(b.doors.map(key));
  const region = (xx: number, yy: number) => {
    const k = b.rooms.findIndex((rm) => xx >= rm.x && yy >= rm.y && xx < rm.x + rm.w && yy < rm.y + rm.h);
    return k >= 0 ? k : b.zone[yy * w + xx] === ZONE.corridor ? -1 : -2;
  };
  const here = region(x, y);
  const solid: number[] = [];
  for (let s = 0; s < SIDES.length; s++) {
    const [dx, dy, edge] = SIDES[s];
    const e = edge(x, y);
    const wall = (e.o === 'h' ? wallsH[e.y * w + e.x] : wallsV[e.y * (w + 1) + e.x]) === '1';
    if (doors.has(key(e))) return null;
    if (wall) { solid.push(s); continue; }
    const nx = x + dx;
    const ny = y + dy;
    // Lado aberto só para o mesmo cômodo (ou corredor): vão para outro lugar fica livre.
    if (nx < 0 || ny < 0 || nx >= w || ny >= h || region(nx, ny) !== here) return null;
  }
  return solid.length ? solid : null;
}

/**
 * Lugar da escada que vale em todos os andares: dois quadrados lado a lado, na mesma parede
 * (ou um só, se não houver dois). `prefer`: tenta primeiro dentro deste retângulo.
 * `avoid`: quadrados (y*w+x) que não servem, nem os vizinhos (outra escada).
 */
export function stairSpot(bases: GenBase[], r: SeededRng, prefer?: Rect, avoid: number[] = []): number[] | null {
  const { w, h } = bases[0].layout;
  if (bases.some((b) => b.layout.w !== w || b.layout.h !== h)) return null;
  const near = new Set<number>();
  for (const i of avoid) {
    const ax = i % w;
    const ay = (i - ax) / w;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) near.add((ay + dy) * w + ax + dx);
  }
  // Lados com parede em todos os andares, por quadrado.
  const ok = new Map<number, number[]>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (near.has(i)) continue;
      let common: number[] | null = null;
      for (const b of bases) {
        const s = wallSides(b, x, y);
        common = s && (common ? common.filter((c) => s.includes(c)) : s);
        if (!common?.length) { common = null; break; }
      }
      if (common) ok.set(i, common);
    }
  }
  if (!ok.size) return null;
  const inPrefer = (i: number) => {
    if (!prefer) return true;
    const x = i % w;
    const y = (i - x) / w;
    return x >= prefer.x && y >= prefer.y && x < prefer.x + prefer.w && y < prefer.y + prefer.h;
  };
  // Pares na mesma parede: horizontais encostam em parede de cima ou de baixo; verticais, nas laterais.
  const pairs: Array<{ cells: number[]; score: number }> = [];
  for (const [i, s] of ok) {
    const x = i % w;
    for (const [j, along] of [[i + 1, [0, 1]], [i + w, [2, 3]]] as Array<[number, number[]]>) {
      if (j === i + 1 && x + 1 >= w) continue;
      const t = ok.get(j);
      if (!t || !along.some((side) => s.includes(side) && t.includes(side))) continue;
      const corner = s.length + t.length;
      pairs.push({ cells: [i, j], score: (inPrefer(i) && inPrefer(j) ? 100 : 0) + corner + r() });
    }
  }
  if (pairs.length) return pairs.reduce((a, b) => (b.score > a.score ? b : a)).cells;
  const singles = [...ok.keys()].map((i) => ({ i, score: (inPrefer(i) ? 100 : 0) + r() }));
  return [singles.reduce((a, b) => (b.score > a.score ? b : a)).i];
}

/** Pinta a escada nos andares. */
export function putStairs(bases: GenBase[], cells: number[]) {
  for (const b of bases) {
    const cs = b.layout.cells.split('');
    for (const i of cells) cs[i] = TERRAIN_CHAR.stairs;
    b.layout.cells = cs.join('');
  }
}

/** Andar de cima: o que era quintal vira vazio (continua "céu aberto", para as janelas). */
export function voidOutside(b: GenBase) {
  const cs = b.layout.cells.split('');
  for (let i = 0; i < cs.length; i++) if (b.zone[i] === ZONE.outside || b.zone[i] === ZONE.path) cs[i] = TERRAIN_CHAR.void;
  b.layout.cells = cs.join('');
}
