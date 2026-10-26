// Casa: planta fechada no formato pedido (quadrada, comprida, L, T, U), sem vazio dentro.
// Cada ala vira faixas de cômodos encostadas num corredor; os corredores das alas se ligam
// por dentro da planta. Fora da casa fica um quintal de piso.
import type { EdgeRef, HouseShape, MapGenParams } from '../../model/types';
import { mulberry32, randInt, type SeededRng } from '../random';
import {
  area, cutLengths, frameFor, type GenBase, type GenRoom, longest, mapRect, passage, pick, pickSpan, Plan, type Rect,
  type RoomKind, subtract, touches, ZONE,
} from './shared';

/** Quintal em volta da casa, em quadrados. */
const YARD = 2;

type Shape = Exclude<HouseShape, 'random'>;
const SHAPES: Shape[] = ['square', 'long', 'L', 'T', 'U'];

/** Alas (retângulos que não se sobrepõem) do formato, no quadro canônico W × H. */
function canonicalWings(shape: Shape, W: number, H: number, p: MapGenParams, r: SeededRng): Rect[] | null {
  const minT = Math.max(3, p.roomMin);
  const ok = (rs: Rect[]) => rs.every((x) => x.w >= minT && x.h >= minT) ? rs : null;
  const f = (a: number, b: number) => a + r() * (b - a);
  switch (shape) {
    case 'square': {
      const a = Math.min(W, H);
      const b = Math.min(Math.max(W, H), Math.round(a * f(1, 1.3)));
      const [w, h] = W >= H ? [b, a] : [a, b];
      return [{ x: Math.floor((W - w) / 2), y: Math.floor((H - h) / 2), w, h }];
    }
    case 'long': {
      const L = Math.max(W, H);
      const S = Math.min(W, H);
      const t = Math.max(Math.min(S, 2 * p.roomMin + p.corridor), Math.min(S, Math.round(L / f(2.2, 3))));
      return [W >= H ? { x: 0, y: Math.floor((H - t) / 2), w: W, h: t } : { x: Math.floor((W - t) / 2), y: 0, w: t, h: H }];
    }
    case 'L': {
      const aw = Math.round(W * f(0.38, 0.55));
      const bh = Math.round(H * f(0.38, 0.55));
      if (H - bh < 2) return null;
      return ok([{ x: 0, y: 0, w: aw, h: H }, { x: aw, y: H - bh, w: W - aw, h: bh }]);
    }
    case 'T': {
      const th = Math.round(H * f(0.38, 0.5));
      let sw = Math.round(W * f(0.34, 0.48));
      if ((W - sw) % 2) sw++;
      if (H - th < 2 || W - sw < 4) return null;
      return ok([{ x: 0, y: 0, w: W, h: th }, { x: (W - sw) / 2, y: th, w: sw, h: H - th }]);
    }
    case 'U': {
      const bh = Math.round(H * f(0.36, 0.5));
      const aw = Math.round(W * f(0.28, 0.36));
      if (W - 2 * aw < 2 || H - bh < 2) return null;
      return ok([{ x: 0, y: H - bh, w: W, h: bh }, { x: 0, y: 0, w: aw, h: H - bh }, { x: W - aw, y: 0, w: aw, h: H - bh }]);
    }
  }
}

function houseWings(box: Rect, p: MapGenParams, r: SeededRng): { shape: Shape; wings: Rect[] } {
  const want: Shape = p.shape === 'random' ? pick(r, SHAPES) : p.shape;
  for (const shape of [want, 'square' as const]) {
    // Comprida e quadrada seguem a caixa; L, T e U giram e espelham à vontade.
    const free = shape === 'L' || shape === 'T' || shape === 'U';
    const transpose = free && r() < 0.5;
    const f = frameFor(box, transpose, free && r() < 0.5, free && r() < 0.5);
    const wings = canonicalWings(shape, f.W, f.H, p, r);
    if (wings) return { shape, wings: wings.map((x) => mapRect(f, x)) };
  }
  return { shape: 'square', wings: [box] };
}

/** Faixas da ala na espessura: cômodos e corredores (o corredor corre no sentido do comprimento). */
function wingBands(wing: Rect, p: MapGenParams, r: SeededRng): { corridors: Rect[]; strips: Rect[] } {
  const horiz = wing.w >= wing.h;
  const t = horiz ? wing.h : wing.w;
  const L = horiz ? wing.w : wing.h;
  const m = p.roomMin;
  const c = p.corridor;
  const segs: Array<{ corr: boolean; size: number }> = [];
  if (t < m + c + 1 || L < 2 * m) {
    segs.push({ corr: false, size: t });
  } else if (t < 2 * m + c) {
    const one = [{ corr: false, size: t - c }, { corr: true, size: c }];
    segs.push(...(r() < 0.5 ? one : one.reverse()));
  } else {
    const target = (p.roomMin + p.roomMax) / 2;
    let k = Math.max(1, Math.round(t / (2 * target + c)));
    while (k > 1 && Math.floor((Math.floor(t / k) - c) / 2) < m) k--;
    for (let i = 0; i < k; i++) {
      const u = Math.floor(t / k) + (i < t % k ? 1 : 0);
      let s1 = Math.floor((u - c) / 2);
      const j = randInt(r, -1, 1);
      if (s1 + j >= m && u - c - s1 - j >= m) s1 += j;
      segs.push({ corr: false, size: s1 }, { corr: true, size: c }, { corr: false, size: u - c - s1 });
    }
  }
  const corridors: Rect[] = [];
  const strips: Rect[] = [];
  let off = 0;
  for (const s of segs) {
    const rect = horiz ? { x: wing.x, y: wing.y + off, w: wing.w, h: s.size } : { x: wing.x + off, y: wing.y, w: s.size, h: wing.h };
    (s.corr ? corridors : strips).push(rect);
    off += s.size;
  }
  return { corridors, strips };
}

/** Ligação entre dois corredores: reta quando eles se enxergam, em L senão. Tudo dentro da planta. */
function connector(a: Rect, b: Rect, c: number, inFoot: (rc: Rect) => boolean, r: SeededRng): Rect[] | null {
  const ox1 = Math.max(a.x, b.x);
  const ox2 = Math.min(a.x + a.w, b.x + b.w);
  const oy1 = Math.max(a.y, b.y);
  const oy2 = Math.min(a.y + a.h, b.y + b.h);
  if (ox2 - ox1 >= c) {
    const [top, bot] = a.y < b.y ? [a, b] : [b, a];
    const y1 = top.y + top.h;
    if (bot.y <= y1) return [];
    const x = randInt(r, ox1, ox2 - c);
    const rc = { x, y: y1, w: c, h: bot.y - y1 };
    return inFoot(rc) ? [rc] : null;
  }
  if (oy2 - oy1 >= c) {
    const [lft, rgt] = a.x < b.x ? [a, b] : [b, a];
    const x1 = lft.x + lft.w;
    if (rgt.x <= x1) return [];
    const y = randInt(r, oy1, oy2 - c);
    const rc = { x: x1, y, w: rgt.x - x1, h: c };
    return inFoot(rc) ? [rc] : null;
  }
  const mid = (s: Rect, axis: 'x' | 'y') => {
    const lo = s[axis];
    const len = axis === 'x' ? s.w : s.h;
    return Math.max(lo, Math.min(lo + len - c, Math.round(lo + len / 2 - c / 2)));
  };
  const ax = mid(a, 'x');
  const ay = mid(a, 'y');
  const bx = mid(b, 'x');
  const by = mid(b, 'y');
  const hSeg = (y: number) => ({ x: Math.min(ax, bx), y, w: Math.abs(bx - ax) + c, h: c });
  const vSeg = (x: number) => ({ x, y: Math.min(ay, by), w: c, h: Math.abs(by - ay) + c });
  const options = [[hSeg(ay), vSeg(bx)], [vSeg(ax), hSeg(by)]];
  if (r() < 0.5) options.reverse();
  return options.find((o) => o.every(inFoot)) ?? null;
}

/** Liga todos os corredores num só (Prim pelo menor acréscimo). */
function connectCorridors(corridors: Rect[], inFoot: (rc: Rect) => boolean, c: number, r: SeededRng): Rect[] {
  const all = [...corridors];
  if (all.length < 2) return all;
  const group = all.map((_, i) => i);
  const merge = (a: number, b: number) => {
    const ga = group[a];
    const gb = group[b];
    for (let i = 0; i < group.length; i++) if (group[i] === gb) group[i] = ga;
  };
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (touches(all[i], all[j])) merge(i, j);
  for (let guard = 0; guard < 50; guard++) {
    const g0 = group[0];
    if (group.every((g) => g === g0)) break;
    let best: { rects: Rect[]; j: number } | null = null;
    let bestCost = Infinity;
    for (let i = 0; i < all.length; i++) {
      if (group[i] !== g0) continue;
      for (let j = 0; j < all.length; j++) {
        if (group[j] === g0) continue;
        const rects = connector(all[i], all[j], c, inFoot, r);
        if (!rects) continue;
        const cost = rects.reduce((s, x) => s + area(x), 0);
        if (cost < bestCost) { bestCost = cost; best = { rects, j }; }
      }
    }
    if (!best) break;
    const j = best.j;
    for (const rc of best.rects) {
      all.push(rc);
      group.push(g0);
    }
    merge(0, j);
  }
  return all;
}

/** Corta um pedaço de faixa em cômodos, no sentido do comprimento. */
function cutPiece(piece: Rect, p: MapGenParams, r: SeededRng): Rect[] {
  const horiz = piece.w >= piece.h;
  const lens = cutLengths(horiz ? piece.w : piece.h, p.roomMin, p.roomMax, r);
  const out: Rect[] = [];
  let off = 0;
  for (const n of lens) {
    out.push(horiz ? { x: piece.x + off, y: piece.y, w: n, h: piece.h } : { x: piece.x, y: piece.y + off, w: piece.w, h: n });
    off += n;
  }
  return out;
}

/** Tira lascas (cômodo de um quadrado de largura): viram corredor ou se juntam ao vizinho. */
function fixSlivers(rooms: Rect[], corridors: Rect[]): { rooms: Rect[]; extraCorridor: Rect[] } {
  const extra: Rect[] = [];
  let list = [...rooms];
  for (let changed = true; changed;) {
    changed = false;
    for (const s of list) {
      if (Math.min(s.w, s.h) >= 2) continue;
      if (corridors.some((c) => touches(c, s)) || extra.some((c) => touches(c, s))) {
        extra.push(s);
        list = list.filter((x) => x !== s);
        changed = true;
        break;
      }
      const n = list.find((o) => o !== s && (
        (o.y === s.y && o.h === s.h && (o.x + o.w === s.x || s.x + s.w === o.x))
        || (o.x === s.x && o.w === s.w && (o.y + o.h === s.y || s.y + s.h === o.y))));
      if (n) {
        const u = { x: Math.min(n.x, s.x), y: Math.min(n.y, s.y), w: 0, h: 0 };
        u.w = Math.max(n.x + n.w, s.x + s.w) - u.x;
        u.h = Math.max(n.y + n.h, s.y + s.h) - u.y;
        list = [...list.filter((x) => x !== s && x !== n), u];
        changed = true;
        break;
      }
    }
  }
  return { rooms: list, extraCorridor: extra };
}

/** Maior vira sala, depois cozinha; o menor, banheiro; os pequenos, despensa ou banheiro; o resto, quartos e afins. */
function assignKinds(rooms: Rect[], r: SeededRng): RoomKind[] {
  const order = rooms.map((_, i) => i).sort((a, b) => area(rooms[b]) - area(rooms[a]));
  const kinds: RoomKind[] = rooms.map(() => 'quarto');
  const n = rooms.length;
  const cycle: RoomKind[] = ['quarto', 'quarto', 'banheiro', 'escritorio', 'quarto', 'despensa', 'biblioteca', 'quarto', 'banheiro'];
  let small = 0;
  let k = 0;
  order.forEach((idx, rank) => {
    const rm = rooms[idx];
    if (rank === 0) kinds[idx] = 'sala';
    else if (rank === 1 && n >= 2) kinds[idx] = 'cozinha';
    else if (rank === n - 1 && n >= 4) kinds[idx] = 'banheiro';
    else if (area(rm) <= 6 || Math.min(rm.w, rm.h) < 2) kinds[idx] = small++ % 2 ? 'banheiro' : 'despensa';
    else kinds[idx] = cycle[k++ % cycle.length];
  });
  // Um pouco de variedade: às vezes o escritório vira quarto e vice-versa.
  if (r() < 0.3) {
    const i = kinds.indexOf('escritorio');
    if (i >= 0) kinds[i] = 'quarto';
  }
  return kinds;
}

export function generateHouse(p: MapGenParams, seed: number): GenBase & { shape: Shape } {
  const r = mulberry32(seed);
  const { w, h } = p;
  const box = { x: YARD, y: YARD, w: w - 2 * YARD, h: h - 2 * YARD };
  const { shape, wings } = houseWings(box, p, r);

  const foot = new Uint8Array(w * h);
  for (const wg of wings) for (let y = wg.y; y < wg.y + wg.h; y++) for (let x = wg.x; x < wg.x + wg.w; x++) foot[y * w + x] = 1;
  const inFoot = (rc: Rect) => {
    for (let y = rc.y; y < rc.y + rc.h; y++) {
      for (let x = rc.x; x < rc.x + rc.w; x++) if (x < 0 || y < 0 || x >= w || y >= h || !foot[y * w + x]) return false;
    }
    return true;
  };

  let corridors: Rect[] = [];
  const strips: Rect[] = [];
  for (const wg of wings) {
    const b = wingBands(wg, p, r);
    corridors.push(...b.corridors);
    strips.push(...b.strips);
  }
  corridors = connectCorridors(corridors, inFoot, p.corridor, r);

  let pieces = strips;
  for (const c of corridors) pieces = pieces.flatMap((s) => subtract(s, c));
  const fixed = fixSlivers(pieces.flatMap((pc) => cutPiece(pc, p, r)), corridors);
  corridors.push(...fixed.extraCorridor);
  const rects = fixed.rooms;
  const kinds = assignKinds(rects, r);
  const rooms: GenRoom[] = rects.map((rc, i) => ({ ...rc, kind: kinds[i] }));

  const plan = new Plan(w, h);
  for (const c of corridors) plan.fill(c, 0);
  rooms.forEach((rm, i) => plan.fill(rm, i + 1));
  const layout = plan.toLayout('floor');
  const doors: EdgeRef[] = [];
  const hasCorridor = plan.region.some((x) => x === 0);
  const adj = plan.adjacency();
  const nb = (a: number) => adj.get(a) ?? new Set<number>();

  // Cômodo encostado no corredor: porta (ou abertura) para ele.
  const reached = new Set<number>(hasCorridor ? [0] : []);
  const linked = new Set<string>();
  const link = (a: number, b: number) => {
    const run = longest(plan.runs(a, b), r);
    if (!run) return false;
    passage(layout, doors, pickSpan(run, 1, r), r() < p.doors);
    linked.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
    return true;
  };
  const sala = kinds.indexOf('sala') + 1;
  if (hasCorridor) {
    rooms.forEach((_, i) => { if (nb(i + 1).has(0) && link(i + 1, 0)) reached.add(i + 1); });
  } else {
    reached.add(sala);
  }
  // O resto entra por um cômodo já alcançado (de preferência o maior).
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < rooms.length; i++) {
      if (reached.has(i + 1)) continue;
      const opts = [...nb(i + 1)].filter((n) => n > 0 && reached.has(n)).sort((a, b) => area(rooms[b - 1]) - area(rooms[a - 1]));
      if (opts.length && link(i + 1, opts[0])) { reached.add(i + 1); changed = true; }
    }
  }
  // Algumas portas a mais entre cômodos vizinhos.
  rooms.forEach((_, i) => {
    for (const n of nb(i + 1)) {
      if (n <= i + 1 || linked.has(`${i + 1}:${n}`) || r() >= 0.12) continue;
      link(i + 1, n);
    }
  });

  // Porta da frente: do corredor (ou da sala) para o quintal. Porta dos fundos na cozinha, às vezes.
  const frontFrom = [...(hasCorridor ? [0] : []), sala, ...rooms.map((_, i) => i + 1).sort((a, b) => area(rooms[b - 1]) - area(rooms[a - 1]))];
  for (const from of frontFrom) {
    const front = longest(plan.runs(from, -1), r);
    if (!front) continue;
    passage(layout, doors, pickSpan(front, from === 0 ? Math.min(2, p.corridor) : 1, r), true);
    break;
  }
  const kitchen = kinds.indexOf('cozinha') + 1;
  if (kitchen > 0 && r() < 0.5) {
    const back = longest(plan.runs(kitchen, -1), r);
    if (back) passage(layout, doors, pickSpan(back, 1, r), true);
  }

  const zone = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) zone[i] = plan.region[i] < 0 ? ZONE.outside : plan.region[i] === 0 ? ZONE.corridor : ZONE.room;
  return { layout, rooms, doors, zone, shape };
}
