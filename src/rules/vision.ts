// Visão escura com luz: cada um vê os quadrados iluminados que estão em linha reta de visão,
// e no escuro só os vizinhos. Parede e porta fechada tapam a vista e a luz; janela e porta
// aberta deixam passar; o vazio (rocha) tapa. Móveis não tapam.
// Puro: o motor corta a visão do jogador com isto e a tela do mestre mostra o que ninguém vê.
import type { Ambient, BattleMap, MapObject } from '../model/types';
import { AMBIENTS, TERRAIN_CHAR } from '../model/types';
import { EDGE, edgeOf, sightBlocked, type Grid, type Point } from './grid';

/** Luz em volta de um ponto. `cap`: intensidade máxima (janela à noite é fraca). */
export interface LightSource { x: number; y: number; radius: number; cap?: number }

export interface Vision {
  /** Por quadrado: 1 = visto. */
  seen: Uint8Array;
  /**
   * Soleiras: o quadrado logo depois de uma porta fechada (destrancada) na borda do que se vê.
   * Fica à meia-luz: dá para ir até a porta e atravessar, sem ver quem está do outro lado.
   */
  dim: Set<number>;
  /** Luz (0 a 4) em cada quadrado visto; 0 = visto no escuro (vizinho). */
  light: Uint8Array;
}

export interface SightOptions {
  sources: LightSource[];
  /** Máscara de céu aberto ('1'), w*h. */
  outside?: string;
  ambient: Ambient;
}

/** Até onde alguém enxerga, em quadrados (mesmo com tudo aceso). */
export const MAX_SIGHT = 40;

/** Intensidade máxima. */
export const FULL_LIGHT = 4;

/**
 * Linha reta do centro de `a` ao centro de `b`: atravessa alguma linha que tapa a vista
 * ou algum quadrado de vazio no meio do caminho? Passando bem na quina, basta um dos lados livre.
 */
export function lineOfSight(g: Grid, cells: string, ax: number, ay: number, bx: number, by: number): boolean {
  const voidChar = TERRAIN_CHAR.void;
  const nx = Math.abs(bx - ax);
  const ny = Math.abs(by - ay);
  const sx = Math.sign(bx - ax);
  const sy = Math.sign(by - ay);
  const opaque = (x: number, y: number) => (x !== bx || y !== by) && cells[y * g.w + x] === voidChar;
  let x = ax;
  let y = ay;
  let ix = 0;
  let iy = 0;
  while (ix < nx || iy < ny) {
    // Qual linha a reta cruza primeiro: a vertical (x) ou a horizontal (y). 0 = a quina.
    const cmp = iy >= ny ? -1 : ix >= nx ? 1 : (2 * ix + 1) * ny - (2 * iy + 1) * nx;
    if (cmp < 0) {
      if (sightBlocked(g, x, y, sx, 0)) return false;
      x += sx;
      ix++;
    } else if (cmp > 0) {
      if (sightBlocked(g, x, y, 0, sy)) return false;
      y += sy;
      iy++;
    } else {
      const viaX = !sightBlocked(g, x, y, sx, 0) && !opaque(x + sx, y) && !sightBlocked(g, x + sx, y, 0, sy);
      const viaY = !sightBlocked(g, x, y, 0, sy) && !opaque(x, y + sy) && !sightBlocked(g, x, y + sy, sx, 0);
      if (!viaX && !viaY) return false;
      x += sx;
      y += sy;
      ix++;
      iy++;
    }
    if (opaque(x, y)) return false;
  }
  return true;
}

/** Intensidade a uma distância (ao quadrado) da fonte: forte no miolo, mais fraca na borda. */
function falloff(d2: number, radius: number): number {
  const f = Math.sqrt(d2) / (radius + 0.5);
  return f <= 0.5 ? 4 : f <= 0.8 ? 3 : 2;
}

/** Luz das fontes (0 a 4) em cada quadrado: dentro do raio e com linha reta até a fonte. */
export function lightMap(g: Grid, cells: string, sources: LightSource[]): Uint8Array {
  const { w, h } = g;
  const out = new Uint8Array(w * h);
  const voidChar = TERRAIN_CHAR.void;
  for (const s of sources) {
    const r = Math.floor(s.radius);
    if (r <= 0 || s.x < 0 || s.y < 0 || s.x >= w || s.y >= h || cells[s.y * w + s.x] === voidChar) continue;
    const cap = Math.min(FULL_LIGHT, s.cap ?? FULL_LIGHT);
    const reach2 = (r + 0.5) * (r + 0.5);
    for (let y = Math.max(0, s.y - r); y <= Math.min(h - 1, s.y + r); y++) {
      for (let x = Math.max(0, s.x - r); x <= Math.min(w - 1, s.x + r); x++) {
        const i = y * w + x;
        const d2 = (x - s.x) ** 2 + (y - s.y) ** 2;
        if (d2 > reach2 || cells[i] === voidChar) continue;
        const lvl = Math.min(cap, falloff(d2, r));
        if (lvl <= out[i] || !lineOfSight(g, cells, s.x, s.y, x, y)) continue;
        out[i] = lvl;
      }
    }
  }
  return out;
}

/**
 * Janelas viram fontes de luz do lado de dentro: o raio e a força vêm da luz de fora.
 * Só a janela entre um quadrado a céu aberto (ou a borda do mapa) e um coberto ilumina.
 */
export function windowSources(
  m: Pick<BattleMap, 'w' | 'h' | 'cells' | 'outside'>, objects: Iterable<MapObject>, ambient: Ambient,
): LightSource[] {
  const a = AMBIENTS[ambient];
  if (!a.window || !a.outside) return [];
  const voidChar = TERRAIN_CHAR.void;
  const out: LightSource[] = [];
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h;
  const sky = (x: number, y: number) => !inb(x, y) || m.outside?.[y * m.w + x] === '1';
  const roofed = (x: number, y: number) => inb(x, y) && m.cells[y * m.w + x] !== voidChar && m.outside?.[y * m.w + x] !== '1';
  for (const o of objects) {
    if (o.kind !== 'window') continue;
    const { x, y } = o.edge;
    const [px, py] = o.edge.o === 'h' ? [x, y - 1] : [x - 1, y];
    let inside: [number, number] | null = null;
    if (sky(px, py) && roofed(x, y)) inside = [x, y];
    else if (sky(x, y) && roofed(px, py)) inside = [px, py];
    if (inside) out.push({ x: inside[0], y: inside[1], radius: a.window, cap: a.outside });
  }
  return out;
}

/** Luz em cada quadrado do mapa inteiro, sem olhar de ninguém (a tela do mestre). */
export function fullLight(g: Grid, cells: string, opts: SightOptions): Uint8Array {
  const n = g.w * g.h;
  const voidChar = TERRAIN_CHAR.void;
  if (opts.ambient === 'geral') {
    const all = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (cells[i] !== voidChar) all[i] = FULL_LIGHT;
    return all;
  }
  const lm = lightMap(g, cells, opts.sources);
  const sky = AMBIENTS[opts.ambient].outside;
  if (sky && opts.outside) for (let i = 0; i < n; i++) if (opts.outside[i] === '1' && cells[i] !== voidChar && lm[i] < sky) lm[i] = sky;
  return lm;
}

/** `cells`: o terreno do mapa (o vazio não se vê). `g`: as linhas como o jogador enxerga. */
export function sightArea(g: Grid, cells: string, eyes: Point[], opts: SightOptions): Vision {
  const { w, h } = g;
  const n = w * h;
  const seen = new Uint8Array(n);
  const light = new Uint8Array(n);
  const dim = new Set<number>();
  const voidChar = TERRAIN_CHAR.void;
  const amb = AMBIENTS[opts.ambient];
  const lm = opts.ambient === 'geral' ? null : lightMap(g, cells, opts.sources);
  const near2 = amb.near === undefined ? Infinity : amb.near * amb.near;
  for (const e of eyes) {
    if (e.x < 0 || e.y < 0 || e.x >= w || e.y >= h) continue;
    for (let y = Math.max(0, e.y - MAX_SIGHT); y <= Math.min(h - 1, e.y + MAX_SIGHT); y++) {
      for (let x = Math.max(0, e.x - MAX_SIGHT); x <= Math.min(w - 1, e.x + MAX_SIGHT); x++) {
        const i = y * w + x;
        if (cells[i] === voidChar) continue;
        const dx = x - e.x;
        const dy = y - e.y;
        let lvl = FULL_LIGHT;
        if (lm) {
          lvl = lm[i];
          if (amb.outside > lvl && opts.outside?.[i] === '1' && dx * dx + dy * dy <= near2) lvl = amb.outside;
        }
        // No escuro, só os vizinhos.
        if (!lvl && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) continue;
        if (seen[i] && light[i] >= lvl) continue;
        if (!lineOfSight(g, cells, e.x, e.y, x, y)) continue;
        seen[i] = 1;
        if (lvl > light[i]) light[i] = lvl;
      }
    }
  }
  // Soleiras: do outro lado de uma porta fechada que se vê.
  for (let i = 0; i < n; i++) {
    if (!seen[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (!seen[ni] && cells[ni] !== voidChar && edgeOf(g, x, y, dx, dy) === EDGE.closedDoor) dim.add(ni);
    }
  }
  return { seen, dim, light };
}
