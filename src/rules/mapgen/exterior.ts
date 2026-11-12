// Exterior da casa, da hospedagem e do templo: o quintal é o padrão (nada muda aqui);
// a rua passa na frente da fachada, com calçadas e as fachadas vizinhas do outro lado;
// a floresta fecha em volta, com mato (terreno difícil) e uma trilha saindo da porta.
// Só mexe no que está fora do prédio.
import type { Exterior } from '../../model/types';
import { TERRAIN_CHAR } from '../../model/types';
import { setWalls } from '../../model/map';
import { randInt, type SeededRng } from '../random';
import { type Dir, type GenBase, ZONE } from './shared';

const STEP: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

export function applyExterior(base: GenBase, exterior: Exterior, r: SeededRng): void {
  if (exterior === 'quintal' || !base.front) return;
  const { w, h } = base.layout;
  const { zone } = base;
  const cells = base.layout.cells.split('');
  const built = (i: number) => zone[i] === ZONE.room || zone[i] === ZONE.corridor;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

  let bx0 = w;
  let by0 = h;
  let bx1 = -1;
  let by1 = -1;
  for (let i = 0; i < w * h; i++) {
    if (!built(i)) continue;
    const x = i % w;
    const y = (i - x) / w;
    bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
  }
  if (bx1 < 0) return;

  const d = base.front.dir;
  const [dx, dy] = STEP[d];
  // Quadrados de fora logo na frente da porta.
  const doorOut = base.front.edges.map((e) => {
    const x = e.o === 'v' ? (d === 'e' ? e.x : e.x - 1) : e.x;
    const y = e.o === 'h' ? (d === 's' ? e.y : e.y - 1) : e.y;
    return [x, y] as [number, number];
  }).filter(([x, y]) => inb(x, y));
  if (!doorOut.length) return;

  if (exterior === 'rua') street();
  else forest();
  base.layout.cells = cells.join('');

  /** Faixa a `k` quadrados da frente do prédio (k = 0 encosta nele), de um lado ao outro do mapa. */
  function line(k: number): number[] {
    const out: number[] = [];
    if (d === 'n' || d === 's') {
      const y = d === 's' ? by1 + 1 + k : by0 - 1 - k;
      if (y >= 0 && y < h) for (let x = 0; x < w; x++) out.push(y * w + x);
    } else {
      const x = d === 'e' ? bx1 + 1 + k : bx0 - 1 - k;
      if (x >= 0 && x < w) for (let y = 0; y < h; y++) out.push(y * w + x);
    }
    return out;
  }

  /** Quantas faixas cabem entre o prédio e a borda do mapa, na frente. */
  function depth(): number {
    return d === 's' ? h - 1 - by1 : d === 'n' ? by0 : d === 'e' ? w - 1 - bx1 : bx0;
  }

  /** Calçamento (rua, calçada, trilha batida). */
  function setPath(i: number, ch = TERRAIN_CHAR.road) {
    if (built(i)) return;
    cells[i] = ch;
    zone[i] = ZONE.path;
  }

  /** Da porta para fora, em linha reta, até chegar à calçada. */
  function walkway() {
    for (const [sx, sy] of doorOut) {
      let x = sx;
      let y = sy;
      for (let guard = 0; guard < w + h && inb(x, y); guard++) {
        const i = y * w + x;
        if (built(i) || zone[i] !== ZONE.outside) break;
        setPath(i);
        x += dx;
        y += dy;
      }
    }
  }

  function street() {
    const G = depth();
    if (G < 3) return; // sem espaço na frente: fica o quintal
    const yardRows = Math.max(0, Math.min(2, G - 8));
    const width = Math.min(4, Math.max(1, G - yardRows - 2));
    const near = yardRows;
    const far = near + width + 1;
    const sidewalk: number[] = [];
    // Calçadas de piso liso; a pista no meio, de pedras.
    for (const i of line(near)) { setPath(i, TERRAIN_CHAR.floor); sidewalk.push(i); }
    for (let k = near + 1; k <= near + width; k++) for (const i of line(k)) setPath(i);
    if (far < G) for (const i of line(far)) { setPath(i, TERRAIN_CHAR.floor); sidewalk.push(i); }
    walkway();
    // Do outro lado da rua, as fachadas dos vizinhos: ninguém entra.
    if (far + 1 < G) {
      for (let k = far + 1; k < G; k++) {
        for (const i of line(k)) { cells[i] = TERRAIN_CHAR.void; zone[i] = ZONE.none; }
      }
      const edges = line(far).map((i) => {
        const x = i % w;
        const y = (i - x) / w;
        return d === 's' ? { o: 'h' as const, x, y: y + 1 } : d === 'n' ? { o: 'h' as const, x, y }
          : d === 'e' ? { o: 'v' as const, x: x + 1, y } : { o: 'v' as const, x, y };
      });
      setWalls(base.layout, edges, true);
    }
    base.sidewalk = sidewalk;
  }

  function forest() {
    // Clareira de dois quadrados em volta do prédio; o resto é mata.
    const clear = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (!built(i)) continue;
      const x = i % w;
      const y = (i - x) / w;
      for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (inb(xx, yy)) clear[yy * w + xx] = 1;
    }
    // Trilha da porta até a borda do mapa, serpenteando um pouco.
    for (const [sx, sy] of doorOut.slice(0, 1)) {
      let x = sx;
      let y = sy;
      for (let guard = 0; guard < 2 * (w + h) && inb(x, y); guard++) {
        const i = y * w + x;
        if (built(i)) break;
        setPath(i);
        const far = !clear[i];
        if (far && r() < 0.3) {
          // Desvio para o lado (o quadrado do desvio também é trilha: nada de quina diagonal).
          const side = r() < 0.5 ? 1 : -1;
          const nx = x + (dy ? side : 0);
          const ny = y + (dx ? side : 0);
          if (inb(nx, ny) && !built(ny * w + nx)) { x = nx; y = ny; setPath(ny * w + nx); }
        }
        x += dx;
        y += dy;
      }
    }
    // Mato em manchas, longe da clareira e fora da trilha.
    const ok = (x: number, y: number) => inb(x, y) && zone[y * w + x] === ZONE.outside && !clear[y * w + x];
    const N = w * h;
    for (let k = 0; k < Math.round(N / 45); k++) {
      let x = randInt(r, 0, w - 1);
      let y = randInt(r, 0, h - 1);
      const len = randInt(r, 6, 22);
      for (let s = 0; s < len; s++) {
        for (const [ax, ay] of [[0, 0], [1, 0], [0, 1]] as const) if (ok(x + ax, y + ay)) cells[(y + ay) * w + x + ax] = TERRAIN_CHAR.difficult;
        const [mx, my] = [[1, 0], [-1, 0], [0, 1], [0, -1]][randInt(r, 0, 3)];
        x = Math.max(0, Math.min(w - 1, x + mx));
        y = Math.max(0, Math.min(h - 1, y + my));
      }
    }
  }
}
