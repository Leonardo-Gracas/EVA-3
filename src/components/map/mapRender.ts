// Desenho do mapa em poucos <path>: um por terreno, um para o grid, um para as paredes.
// Coordenadas em quadrados (o SVG usa viewBox em quadrados). Puro e testável.
import type { EdgeRef } from '../../model/types';

/** Tamanho de um quadrado na tela, sem zoom. */
export const CELL = 40;

/** Retângulos por sequência na linha: todo quadrado com o caractere `ch`. */
export function runsPath(cells: string, w: number, h: number, ch: string): string {
  let d = '';
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (cells[y * w + x] !== ch) { x++; continue; }
      const x0 = x;
      while (x < w && cells[y * w + x] === ch) x++;
      d += `M${x0} ${y}h${x - x0}v1h${x0 - x}z`;
    }
  }
  return d;
}

/** Quadrados de uma lista de índices (alcance, seleção), em sequências por linha. */
export function cellsPath(indices: Iterable<number>, w: number): string {
  const rows = new Map<number, number[]>();
  for (const i of indices) {
    const y = Math.floor(i / w);
    (rows.get(y) ?? rows.set(y, []).get(y)!).push(i - y * w);
  }
  let d = '';
  for (const [y, xs] of rows) {
    xs.sort((a, b) => a - b);
    let k = 0;
    while (k < xs.length) {
      const x0 = xs[k];
      let x1 = x0;
      while (k + 1 < xs.length && xs[k + 1] === x1 + 1) { k++; x1++; }
      d += `M${x0} ${y}h${x1 - x0 + 1}v1h${x0 - x1 - 1}z`;
      k++;
    }
  }
  return d;
}

/** Linhas do grid. */
export function gridPath(w: number, h: number): string {
  let d = '';
  for (let x = 0; x <= w; x++) d += `M${x} 0V${h}`;
  for (let y = 0; y <= h; y++) d += `M0 ${y}H${w}`;
  return d;
}

/** Paredes ligadas, com segmentos vizinhos na mesma linha emendados. */
export function wallsPath(wallsH: string, wallsV: string, w: number, h: number): string {
  let d = '';
  for (let y = 0; y <= h; y++) {
    let x = 0;
    while (x < w) {
      if (wallsH[y * w + x] !== '1') { x++; continue; }
      const x0 = x;
      while (x < w && wallsH[y * w + x] === '1') x++;
      d += `M${x0} ${y}H${x}`;
    }
  }
  for (let x = 0; x <= w; x++) {
    let y = 0;
    while (y < h) {
      if (wallsV[y * (w + 1) + x] !== '1') { y++; continue; }
      const y0 = y;
      while (y < h && wallsV[y * (w + 1) + x] === '1') y++;
      d += `M${x} ${y0}V${y}`;
    }
  }
  return d;
}

/** Linha mais perto do ponto (em quadrados), se estiver a até `tol` dela. */
export function nearestEdge(fx: number, fy: number, w: number, h: number, tol = 0.3): EdgeRef | null {
  const cx = Math.floor(fx);
  const cy = Math.floor(fy);
  const lx = Math.round(fx);
  const ly = Math.round(fy);
  const dv = Math.abs(fx - lx);
  const dh = Math.abs(fy - ly);
  const v: EdgeRef | null = dv <= tol && lx >= 0 && lx <= w && cy >= 0 && cy < h ? { o: 'v', x: lx, y: cy } : null;
  const hz: EdgeRef | null = dh <= tol && ly >= 0 && ly <= h && cx >= 0 && cx < w ? { o: 'h', x: cx, y: ly } : null;
  if (v && hz) return dv <= dh ? v : hz;
  return v ?? hz;
}

/** Linhas atravessadas entre dois pontos da mesma linha do grid (arrastar parede). */
export function edgesBetween(a: EdgeRef, b: EdgeRef): EdgeRef[] {
  if (a.o !== b.o) return [b];
  if (a.o === 'h' && a.y === b.y) {
    const [x0, x1] = a.x <= b.x ? [a.x, b.x] : [b.x, a.x];
    return Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ o: 'h' as const, x: x0 + i, y: a.y }));
  }
  if (a.o === 'v' && a.x === b.x) {
    const [y0, y1] = a.y <= b.y ? [a.y, b.y] : [b.y, a.y];
    return Array.from({ length: y1 - y0 + 1 }, (_, i) => ({ o: 'v' as const, x: a.x, y: y0 + i }));
  }
  return [b];
}

/** Segmento da linha, em quadrados: [x1, y1, x2, y2]. */
export const edgeCoords = (e: EdgeRef): [number, number, number, number] =>
  (e.o === 'h' ? [e.x, e.y, e.x + 1, e.y] : [e.x, e.y, e.x, e.y + 1]);

/** Quadrados de um retângulo entre dois cantos, dentro do mapa. */
export function rectCells(ax: number, ay: number, bx: number, by: number, w: number, h: number): number[] {
  const out: number[] = [];
  const [x0, x1] = [Math.max(0, Math.min(ax, bx)), Math.min(w - 1, Math.max(ax, bx))];
  const [y0, y1] = [Math.max(0, Math.min(ay, by)), Math.min(h - 1, Math.max(ay, by))];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(y * w + x);
  return out;
}

/** Quadrados de uma linha reta entre dois quadrados (pincel rápido não deixa buracos). */
export function lineCells(ax: number, ay: number, bx: number, by: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0;
    out.push([Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t)]);
  }
  return out;
}
