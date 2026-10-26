// Leitura e escrita das strings do mapa: terreno por quadrado e paredes nas linhas.
import type { BattleMap, EdgeRef, MapLayout, MapObject, Terrain } from './types';
import { MAP_LIMITS, TERRAIN_CHAR } from './types';

const CHAR_TERRAIN: Record<string, Terrain> = Object.fromEntries(
  Object.entries(TERRAIN_CHAR).map(([t, ch]) => [ch, t as Terrain]),
);

export const terrainOf = (ch: string | undefined): Terrain => CHAR_TERRAIN[ch ?? ''] ?? 'void';

export function terrainAt(m: Pick<BattleMap, 'w' | 'h' | 'cells'>, x: number, y: number): Terrain {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return 'void';
  return terrainOf(m.cells[y * m.w + x]);
}

export const inBounds = (m: Pick<BattleMap, 'w' | 'h'>, x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h;

/** Índice da linha em wallsH / wallsV; -1 fora do mapa. */
export function edgeIndex(m: Pick<BattleMap, 'w' | 'h'>, e: EdgeRef): number {
  if (e.o === 'h') return e.x >= 0 && e.x < m.w && e.y >= 0 && e.y <= m.h ? e.y * m.w + e.x : -1;
  return e.x >= 0 && e.x <= m.w && e.y >= 0 && e.y < m.h ? e.y * (m.w + 1) + e.x : -1;
}

export function hasWall(m: Pick<BattleMap, 'w' | 'h' | 'wallsH' | 'wallsV'>, e: EdgeRef): boolean {
  const i = edgeIndex(m, e);
  if (i < 0) return false;
  return (e.o === 'h' ? m.wallsH : m.wallsV)[i] === '1';
}

export const edgeKey = (e: EdgeRef) => `${e.o}${e.x},${e.y}`;
export const sameEdge = (a: EdgeRef, b: EdgeRef) => a.o === b.o && a.x === b.x && a.y === b.y;

/** Troca caracteres numa string em lote (índices fora do tamanho são ignorados). */
export function setChars(src: string, idx: Iterable<number>, ch: string): string {
  const arr = src.split('');
  for (const i of idx) if (i >= 0 && i < arr.length) arr[i] = ch;
  return arr.join('');
}

/** Liga ou desliga paredes em lote. */
export function setWalls<T extends Pick<BattleMap, 'w' | 'h' | 'wallsH' | 'wallsV'>>(m: T, edges: EdgeRef[], on: boolean): void {
  const ch = on ? '1' : '0';
  m.wallsH = setChars(m.wallsH, edges.filter((e) => e.o === 'h').map((e) => edgeIndex(m, e)), ch);
  m.wallsV = setChars(m.wallsV, edges.filter((e) => e.o === 'v').map((e) => edgeIndex(m, e)), ch);
}

export function blankLayout(w: number, h: number, fill: Terrain = 'floor'): MapLayout {
  return {
    w, h,
    cells: TERRAIN_CHAR[fill].repeat(w * h),
    wallsH: '0'.repeat((h + 1) * w),
    wallsV: '0'.repeat(h * (w + 1)),
    objects: {},
  };
}

/** Passável = não é vazio. */
export const isOpen = (t: Terrain) => t !== 'void';

/**
 * Parede em toda linha entre um quadrado aberto e um vazio (ou a borda do mapa).
 * Não apaga paredes que já existam.
 */
export function wallAround<T extends Pick<BattleMap, 'w' | 'h' | 'cells' | 'wallsH' | 'wallsV'>>(m: T): void {
  const edges: EdgeRef[] = [];
  const open = (x: number, y: number) => isOpen(terrainAt(m, x, y));
  for (let y = 0; y <= m.h; y++) {
    for (let x = 0; x < m.w; x++) if (open(x, y - 1) !== open(x, y)) edges.push({ o: 'h', x, y });
  }
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x <= m.w; x++) if (open(x - 1, y) !== open(x, y)) edges.push({ o: 'v', x, y });
  }
  setWalls(m, edges, true);
}

/** "C7": colunas em letras (A..Z, AA..), linhas a partir de 1. */
export function cellLabel(x: number, y: number): string {
  let col = '';
  let n = x + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    col = String.fromCharCode(65 + r) + col;
    n = Math.floor((n - 1) / 26);
  }
  return `${col}${y + 1}`;
}

/** Quadrados que o objeto ocupa (porta: nenhum). */
export function objectCells(o: MapObject): Array<[number, number]> {
  if (o.kind !== 'prop') return [];
  const out: Array<[number, number]> = [];
  for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) out.push([x, y]);
  return out;
}

/** Acerta tamanhos e caracteres das strings (backup mexido à mão, versão antiga). */
export function fixMap(m: BattleMap): BattleMap {
  m.w = Math.max(MAP_LIMITS.min, Math.min(MAP_LIMITS.max, Math.round(m.w) || MAP_LIMITS.min));
  m.h = Math.max(MAP_LIMITS.min, Math.min(MAP_LIMITS.max, Math.round(m.h) || MAP_LIMITS.min));
  const fit = (s: unknown, len: number, pad: string, ok: (c: string) => boolean) => {
    const src = typeof s === 'string' ? s : '';
    let out = '';
    for (let i = 0; i < len; i++) out += ok(src[i]) ? src[i] : pad;
    return out;
  };
  m.cells = fit(m.cells, m.w * m.h, TERRAIN_CHAR.void, (c) => c in CHAR_TERRAIN);
  m.wallsH = fit(m.wallsH, (m.h + 1) * m.w, '0', (c) => c === '0' || c === '1');
  m.wallsV = fit(m.wallsV, m.h * (m.w + 1), '0', (c) => c === '0' || c === '1');
  m.objects ??= {};
  m.tokens ??= {};
  m.mode ??= 'livre';
  return m;
}
