// Cenário aberto: campo de piso com manchas de mato (terreno difícil), às vezes um rio raso,
// rochas (vazio), cabanas e ruínas, e uma trilha que atravessa o mapa até as construções.
import type { EdgeRef, MapGenParams } from '../../model/types';
import { TERRAIN_CHAR } from '../../model/types';
import { blankLayout, edgeKey, setWalls } from '../../model/map';
import { mulberry32, randInt } from '../random';
import { flood, type GenBase, type GenRoom, passage, pick, pickSpan, type Rect, ZONE } from './shared';

const F = TERRAIN_CHAR.floor;
const D = TERRAIN_CHAR.difficult;
const V = TERRAIN_CHAR.void;

const grow = (a: Rect, n: number): Rect => ({ x: a.x - n, y: a.y - n, w: a.w + 2 * n, h: a.h + 2 * n });
const hit = (a: Rect, x: number, y: number) => x >= a.x && y >= a.y && x < a.x + a.w && y < a.y + a.h;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function generateOutdoor(p: MapGenParams, seed: number): GenBase & { river: boolean } {
  const r = mulberry32(seed);
  const { w, h } = p;
  const N = w * h;
  const cells: string[] = Array(N).fill(F);
  const zone = new Uint8Array(N).fill(ZONE.outside);
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const paint = (x: number, y: number, ch: string, brush: number) => {
    for (let dy = -brush; dy <= brush; dy++) {
      for (let dx = -brush; dx <= brush; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > brush || !inb(x + dx, y + dy)) continue;
        cells[(y + dy) * w + x + dx] = ch;
      }
    }
  };
  const walk = (len: number, ch: string, brush: number) => {
    let x = randInt(r, 0, w - 1);
    let y = randInt(r, 0, h - 1);
    for (let i = 0; i < len; i++) {
      paint(x, y, ch, brush);
      const [dx, dy] = pick(r, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
      x = Math.max(0, Math.min(w - 1, x + dx));
      y = Math.max(0, Math.min(h - 1, y + dy));
    }
  };

  // Mato e lama.
  for (let k = 0; k < Math.round(N / 160); k++) walk(randInt(r, 8, 28), D, r() < 0.4 ? 1 : 0);

  // Rio raso atravessando o lado maior.
  const river = r() < 0.45;
  if (river) {
    const across = w >= h;
    const len = across ? w : h;
    const side = across ? h : w;
    let c = randInt(r, Math.floor(side * 0.25), Math.floor(side * 0.75));
    const width = randInt(r, 2, 3);
    for (let i = 0; i < len; i++) {
      if (r() < 0.4) c = Math.max(1, Math.min(side - width - 1, c + randInt(r, -1, 1)));
      for (let k = 0; k < width; k++) {
        const [x, y] = across ? [i, c + k] : [c + k, i];
        cells[y * w + x] = D;
      }
    }
  }

  // Rochas.
  for (let k = 0; k < Math.round(N / 320); k++) walk(randInt(r, 3, 12), V, 0);

  // Construções: cabanas inteiras ou ruínas com paredes caídas.
  const rooms: GenRoom[] = [];
  for (let tries = 0; tries < p.rooms * 60 && rooms.length < p.rooms; tries++) {
    const rw = randInt(r, p.roomMin, p.roomMax);
    const rh = randInt(r, p.roomMin, p.roomMax);
    if (w - rw - 4 < 2 || h - rh - 4 < 2) continue;
    const rc = { x: randInt(r, 2, w - rw - 2), y: randInt(r, 2, h - rh - 2), w: rw, h: rh };
    if (rooms.some((o) => overlaps(grow(o, 3), rc))) continue;
    rooms.push({ ...rc, kind: r() < 0.6 ? 'cabana' : 'ruina' });
  }
  for (const rm of rooms) {
    const g = grow(rm, 1);
    for (let y = g.y; y < g.y + g.h; y++) {
      for (let x = g.x; x < g.x + g.w; x++) {
        if (!inb(x, y)) continue;
        cells[y * w + x] = F;
        zone[y * w + x] = hit(rm, x, y) ? ZONE.room : ZONE.outside;
      }
    }
  }

  const layout = blankLayout(w, h, 'floor');
  const doors: EdgeRef[] = [];
  const entries: number[] = [];
  const sides = (rm: Rect): Array<{ edges: EdgeRef[]; out: Array<[number, number]> }> => {
    const top: EdgeRef[] = [];
    const bottom: EdgeRef[] = [];
    const left: EdgeRef[] = [];
    const right: EdgeRef[] = [];
    for (let x = rm.x; x < rm.x + rm.w; x++) { top.push({ o: 'h', x, y: rm.y }); bottom.push({ o: 'h', x, y: rm.y + rm.h }); }
    for (let y = rm.y; y < rm.y + rm.h; y++) { left.push({ o: 'v', x: rm.x, y }); right.push({ o: 'v', x: rm.x + rm.w, y }); }
    return [
      { edges: top, out: top.map((e) => [e.x, e.y - 1]) },
      { edges: bottom, out: bottom.map((e) => [e.x, e.y]) },
      { edges: left, out: left.map((e) => [e.x - 1, e.y]) },
      { edges: right, out: right.map((e) => [e.x, e.y]) },
    ];
  };
  for (const rm of rooms) {
    const ss = sides(rm);
    setWalls(layout, ss.flatMap((s) => s.edges), true);
    const s = pick(r, ss);
    const span = pickSpan(s.edges, 1, r);
    const k = s.edges.indexOf(span[0]);
    entries.push(s.out[k][1] * w + s.out[k][0]);
    if (rm.kind === 'cabana') {
      passage(layout, doors, span, r() < p.doors);
    } else {
      passage(layout, doors, span, false);
      setWalls(layout, ss.flatMap((x) => x.edges).filter(() => r() < 0.3), false);
    }
  }

  // Trilha principal no sentido do lado maior, desviando das construções.
  const blockedByHouse = (x: number, y: number) => rooms.some((rm) => hit(grow(rm, 1), x, y));
  const mark = (x: number, y: number) => {
    if (!inb(x, y) || blockedByHouse(x, y)) return;
    cells[y * w + x] = F;
    zone[y * w + x] = ZONE.path;
  };
  const across = w >= h;
  let c = randInt(r, Math.floor((across ? h : w) * 0.2), Math.floor((across ? h : w) * 0.8));
  const trail: number[] = [];
  for (let i = 0; i < (across ? w : h); i++) {
    const prev = c;
    if (r() < 0.35) c = Math.max(1, Math.min((across ? h : w) - 2, c + randInt(r, -1, 1)));
    // Ao mudar de faixa, liga os dois quadrados para a trilha não ter quina diagonal.
    for (const cc of new Set([prev, c])) {
      const [x, y] = across ? [i, cc] : [cc, i];
      mark(x, y);
      if (zone[y * w + x] === ZONE.path) trail.push(y * w + x);
    }
  }
  // Ramal de cada entrada até a trilha.
  for (const start of entries) {
    if (!trail.length) break;
    let sx = start % w;
    let sy = (start - sx) / w;
    const best = trail.reduce((b, t) => {
      const tx = t % w;
      const ty = (t - tx) / w;
      const d = Math.abs(tx - sx) + Math.abs(ty - sy);
      return d < b.d ? { t, d } : b;
    }, { t: trail[0], d: Infinity });
    const tx = best.t % w;
    const ty = (best.t - tx) / w;
    const hFirst = r() < 0.5;
    const stepTo = (gx: number, gy: number) => {
      while (sx !== gx || sy !== gy) {
        if (sx !== gx) sx += Math.sign(gx - sx);
        else sy += Math.sign(gy - sy);
        mark(sx, sy);
      }
    };
    if (inb(sx, sy)) { cells[sy * w + sx] = F; zone[sy * w + sx] = ZONE.path; }
    if (hFirst) { stepTo(tx, sy); stepTo(tx, ty); } else { stepTo(sx, ty); stepTo(tx, ty); }
  }

  layout.cells = cells.join('');
  // Bolsões que ficaram presos entre as rochas viram rocha também.
  const seenFrom = trail.length ? trail : [cells.findIndex((ch) => ch !== V)];
  const seen = flood(layout, new Set(doors.map(edgeKey)), seenFrom.filter((i) => i >= 0));
  const fixed = layout.cells.split('');
  for (let i = 0; i < N; i++) {
    if (fixed[i] !== V && !seen[i]) { fixed[i] = V; zone[i] = ZONE.none; }
    else if (fixed[i] === V) zone[i] = ZONE.none;
  }
  layout.cells = fixed.join('');
  return { layout, rooms, doors, zone, river };
}
