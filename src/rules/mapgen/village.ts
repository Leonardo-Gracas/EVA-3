// Vilarejo: povoado pequeno e irregular. Uma estrada de terra atravessa o mapa passando por uma
// praça com poço; às vezes um ou dois ramais saem da praça e um riacho corta o mapa (a estrada
// passa por cima, como ponte). Os ofícios (ferreiro, padeiro, mercador, curandeiro) ficam perto
// da praça, de frente para a rua; as casas de morar se espalham, umas na beira da estrada e
// outras mais afastadas, ligadas por trilhas. Algumas casas têm horta.
// Cada construção é montada à parte (as casas pelo gerador de casas) e carimbada no mapa,
// girada para a porta da frente dar para a rua.
import type { EdgeRef, HouseModel, HouseSize, MapGenParams } from '../../model/types';
import { TERRAIN_CHAR } from '../../model/types';
import { blankLayout, setWalls } from '../../model/map';
import { mulberry32, randInt, type SeededRng } from '../random';
import { generateHouse } from './house';
import {
  type BuildingKind, type Dir, type GenBase, type GenBuilding, type GenRoom, longest, passage, pick, pickSpan, Plan, type Rect,
  type RoomKind, ZONE,
} from './shared';

const STEP: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const DIRS: Dir[] = ['n', 's', 'e', 'w'];

function shuffle<T>(r: SeededRng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Peça: uma construção pronta, em coordenadas próprias ────────────────────

interface Piece {
  W: number;
  H: number;
  /** ZONE.room ou ZONE.corridor nos quadrados construídos; 0 fora. */
  built: Uint8Array;
  walls: EdgeRef[];
  doors: EdgeRef[];
  rooms: GenRoom[];
  /** Linhas da porta (ou do vão) da frente e para onde ela dá. */
  front: EdgeRef[];
  dir: Dir;
}

/** Recorta a construção de um mapa gerado (só o que é cômodo ou corredor). */
function cropPiece(base: GenBase): Piece | null {
  if (!base.front) return null;
  const { w, h, wallsH, wallsV } = base.layout;
  const isBuilt = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h
    && (base.zone[y * w + x] === ZONE.room || base.zone[y * w + x] === ZONE.corridor);
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isBuilt(x, y)) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return null;
  const W = x1 - x0 + 1;
  const H = y1 - y0 + 1;
  const built = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isBuilt(x + x0, y + y0)) built[y * W + x] = base.zone[(y + y0) * w + x + x0];
  const walls: EdgeRef[] = [];
  for (let y = y0; y <= y1 + 1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (wallsH[y * w + x] === '1' && (isBuilt(x, y - 1) || isBuilt(x, y))) walls.push({ o: 'h', x: x - x0, y: y - y0 });
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1 + 1; x++) {
      if (wallsV[y * (w + 1) + x] === '1' && (isBuilt(x - 1, y) || isBuilt(x, y))) walls.push({ o: 'v', x: x - x0, y: y - y0 });
    }
  }
  const move = (e: EdgeRef): EdgeRef => ({ o: e.o, x: e.x - x0, y: e.y - y0 });
  return {
    W, H, built, walls,
    doors: base.doors.map(move),
    rooms: base.rooms.map((rm) => ({ ...rm, x: rm.x - x0, y: rm.y - y0 })),
    front: base.front.edges.map(move),
    dir: base.front.dir,
  };
}

// Giro (horário, `rot` vezes) depois de espelhar (`flip`, troca leste e oeste).
interface Turn { rot: number; flip: boolean }

function turnCell(t: Turn, W: number, H: number, x: number, y: number): [number, number] {
  let px = t.flip ? W - 1 - x : x;
  let py = y;
  let w = W;
  let h = H;
  for (let k = 0; k < t.rot; k++) {
    [px, py] = [h - 1 - py, px];
    [w, h] = [h, w];
  }
  return [px, py];
}

function turnDir(t: Turn, d: Dir): Dir {
  let out = d;
  if (t.flip) out = out === 'e' ? 'w' : out === 'w' ? 'e' : out;
  for (let k = 0; k < t.rot; k++) out = ({ n: 'e', e: 's', s: 'w', w: 'n' } as const)[out];
  return out;
}

/** A linha entre dois quadrados vizinhos continua entre os dois depois do giro. */
function turnEdge(t: Turn, W: number, H: number, e: EdgeRef): EdgeRef {
  const [a, b] = e.o === 'h' ? [[e.x, e.y - 1], [e.x, e.y]] : [[e.x - 1, e.y], [e.x, e.y]];
  const A = turnCell(t, W, H, a[0], a[1]);
  const B = turnCell(t, W, H, b[0], b[1]);
  if (A[0] === B[0]) return { o: 'h', x: A[0], y: Math.max(A[1], B[1]) };
  return { o: 'v', x: Math.max(A[0], B[0]), y: A[1] };
}

function turnPiece(pc: Piece, t: Turn): Piece {
  const { W, H } = pc;
  const [W2, H2] = t.rot % 2 ? [H, W] : [W, H];
  const built = new Uint8Array(W2 * H2);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = pc.built[y * W + x];
      if (!v) continue;
      const [nx, ny] = turnCell(t, W, H, x, y);
      built[ny * W2 + nx] = v;
    }
  }
  const edge = (e: EdgeRef) => turnEdge(t, W, H, e);
  const rooms = pc.rooms.map((rm) => {
    const [ax, ay] = turnCell(t, W, H, rm.x, rm.y);
    const [bx, by] = turnCell(t, W, H, rm.x + rm.w - 1, rm.y + rm.h - 1);
    const out: GenRoom = { kind: rm.kind, x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(ax - bx) + 1, h: Math.abs(ay - by) + 1 };
    if (rm.dir) out.dir = turnDir(t, rm.dir);
    return out;
  });
  return {
    W: W2, H: H2, built, walls: pc.walls.map(edge), doors: pc.doors.map(edge), rooms, front: pc.front.map(edge), dir: turnDir(t, pc.dir),
  };
}

/** Quadrado de fora logo na frente de uma linha da porta. */
function outCell(e: EdgeRef, d: Dir): [number, number] {
  if (d === 's' || d === 'e') return [e.x, e.y];
  return d === 'n' ? [e.x, e.y - 1] : [e.x - 1, e.y];
}

// ── Ofícios: cômodo de trabalho na frente, os de trás encostados ────────────

type Trade = Exclude<BuildingKind, 'moradia'>;

interface TradeSpec {
  main: RoomKind;
  mw: [number, number];
  mh: [number, number];
  back: (r: SeededRng) => RoomKind[];
  /** Frente aberta (vão largo, sem porta), como a da forja. */
  open?: boolean;
}

const TRADES: Record<Trade, TradeSpec> = {
  ferreiro: { main: 'forja', mw: [5, 6], mh: [4, 5], back: (r) => (r() < 0.4 ? ['quarto', 'deposito'] : ['quarto']), open: true },
  padeiro: { main: 'padaria', mw: [4, 6], mh: [3, 4], back: () => ['forno', 'quarto'] },
  mercador: { main: 'loja', mw: [5, 7], mh: [4, 5], back: (r) => (r() < 0.5 ? ['deposito', 'quarto'] : ['quarto', 'deposito']) },
  curandeiro: { main: 'enfermaria', mw: [4, 6], mh: [4, 5], back: (r) => (r() < 0.4 ? ['quarto', 'despensa'] : ['quarto']) },
};

const BACK_LEN: Partial<Record<RoomKind, [number, number]>> = { quarto: [3, 4], deposito: [2, 3], despensa: [2, 2], forno: [3, 4] };

function tradePiece(kind: Trade, p: MapGenParams, r: SeededRng): Piece {
  const t = TRADES[kind];
  const mw = randInt(r, t.mw[0], t.mw[1]);
  const mh = randInt(r, t.mh[0], t.mh[1]);
  const bd = randInt(r, 3, 4);
  const backs = t.back(r).map((k) => {
    const [a, b] = BACK_LEN[k] ?? [3, 3];
    return { kind: k, len: randInt(r, a, b) };
  });
  const total = backs.reduce((s, b) => s + b.len, 0);
  // Fileira de trás alinhada à esquerda, à direita ou sobrando para um lado: planta em L ou em T.
  const lo = Math.min(0, mw - total);
  const hi = Math.max(0, mw - total);
  const off = r() < 0.6 ? pick(r, [lo, hi]) : randInt(r, lo, hi);
  const x0 = Math.min(0, off);
  const rects: Array<Rect & { kind: RoomKind }> = [{ x: -x0, y: bd, w: mw, h: mh, kind: t.main }];
  let x = off - x0;
  for (const b of backs) {
    rects.push({ x, y: 0, w: b.len, h: bd, kind: b.kind });
    x += b.len;
  }
  const W = Math.max(mw - x0, x);
  const H = bd + mh;
  const plan = new Plan(W, H);
  rects.forEach((rc, k) => plan.fill(rc, k + 1));
  const layout = plan.toLayout('floor');
  const doors: EdgeRef[] = [];
  // Cada cômodo de trás abre para a frente; se não encosta nela, para o vizinho do lado.
  for (let k = 1; k < rects.length; k++) {
    const id = k + 1;
    const run = longest(plan.runs(id, 1), r) ?? longest(plan.runs(id, id - 1), r) ?? longest(plan.runs(id, id + 1), r);
    if (!run) continue;
    const kindK = rects[k].kind;
    const door = kindK === 'quarto' ? r() < Math.max(0.5, p.doors) : r() < p.doors;
    passage(layout, doors, pickSpan(run, 1, r), door);
  }
  const M = rects[0];
  const frontRun = plan.runs(1, -1).filter((run) => run[0].o === 'h' && run[0].y === M.y + M.h);
  const run = longest(frontRun, r)!;
  const span = pickSpan(run, t.open ? Math.min(3, Math.max(2, run.length - 2)) : 1, r);
  passage(layout, doors, span, !t.open);
  const zone = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) zone[i] = plan.region[i] > 0 ? ZONE.room : ZONE.outside;
  const rooms: GenRoom[] = rects.map((rc) => ({ x: rc.x, y: rc.y, w: rc.w, h: rc.h, kind: rc.kind }));
  return cropPiece({ layout, rooms, doors, zone, front: { edges: span, dir: 's' } })!;
}

/** Casa de morar: casebre ou casa térrea pequena, do gerador de casas. */
function housePiece(p: MapGenParams, seed: number, r: SeededRng): Piece | null {
  const model: HouseModel = r() < 0.55 ? 'casebre' : 'casa';
  const size: HouseSize = model === 'casa' && r() < 0.3 ? 'normal' : 'compacto';
  const rooms = model === 'casebre' ? randInt(r, 0, 2) : randInt(r, 1, 3);
  const [w, h] = model === 'casebre' ? [16, 14] : [30, 24];
  const base = generateHouse({
    ...p, preset: 'house', model, size, shape: 'random', rooms, w, h, corridor: 1, floors: 1, exterior: 'quintal',
  }, seed);
  return cropPiece(base);
}

// ── Caminho mais barato (trilhas) ───────────────────────────────────────────

/** Dijkstra de `start` até o primeiro quadrado com `goal`; `cost` < 0 não passa. Devolve o caminho sem o alvo. */
function cheapest(w: number, h: number, start: number, goal: Uint8Array, cost: (i: number) => number): number[] | null {
  const dist = new Float64Array(w * h).fill(Infinity);
  const prev = new Int32Array(w * h).fill(-1);
  const heap: Array<[number, number]> = [];
  const push = (d: number, i: number) => {
    heap.push([d, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const pk = (k - 1) >> 1;
      if (heap[pk][0] <= heap[k][0]) break;
      [heap[pk], heap[k]] = [heap[k], heap[pk]];
      k = pk;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const a = 2 * k + 1;
        const b = a + 1;
        let m = k;
        if (a < heap.length && heap[a][0] < heap[m][0]) m = a;
        if (b < heap.length && heap[b][0] < heap[m][0]) m = b;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  dist[start] = 0;
  push(0, start);
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    if (goal[i] && i !== start) {
      const path: number[] = [];
      for (let k = prev[i]; k >= 0; k = prev[k]) path.push(k);
      return path.reverse();
    }
    const x = i % w;
    const y = (i - x) / w;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      const c = cost(ni);
      if (c < 0) continue;
      const nd = d + c;
      if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = i; push(nd, ni); }
    }
  }
  return null;
}

// ── Vilarejo ────────────────────────────────────────────────────────────────

/** Ordem dos ofícios: com poucas construções, ficam só os primeiros (sorteados). */
const TRADE_LIST: Trade[] = ['ferreiro', 'padeiro', 'mercador', 'curandeiro'];

export function generateVillage(p: MapGenParams, seed: number): GenBase {
  const r = mulberry32(seed);
  const { w, h } = p;
  const N = w * h;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const path = new Uint8Array(N);
  const water = new Uint8Array(N);
  const rough = new Uint8Array(N);
  const built = new Uint8Array(N);
  /** Construído ou perto de construção (folga entre casas) e hortas. */
  const reserved = new Uint8Array(N);
  const layout = blankLayout(w, h, 'floor');
  const rooms: GenRoom[] = [];
  const doors: EdgeRef[] = [];
  const buildings: GenBuilding[] = [];
  const gardens: Rect[] = [];

  // A estrada principal corre no sentido do lado maior. a = ao longo, c = de través.
  const across = w >= h;
  const len = across ? w : h;
  const side = across ? h : w;
  const idx = (a: number, c: number) => (across ? c * w + a : a * w + c);
  const inAC = (a: number, c: number) => a >= 0 && c >= 0 && a < len && c < side;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  // ── Praça e estrada ──
  const ca = randInt(r, Math.floor(len * 0.38), Math.ceil(len * 0.62) - 1);
  const cc = randInt(r, Math.floor(side * 0.4), Math.ceil(side * 0.6) - 1);
  const roadW = side >= 20 ? 2 : 1;
  const paintRoad = (a: number, c: number, width: number) => {
    for (let k = 0; k < width; k++) if (inAC(a, c + k)) path[idx(a, c + k)] = 1;
  };
  /** Anda de `from` a `to` no eixo a, com o través mudando aos poucos (sem quina diagonal). */
  const drift = (from: number, to: number, c0: number, lo: number, hi: number, chance: number, paint: (a: number, c: number) => void) => {
    let c = c0;
    const step = Math.sign(to - from) || 1;
    for (let a = from; ; a += step) {
      const prevC = c;
      if (r() < chance) c = clamp(c + randInt(r, -1, 1), lo, hi);
      for (const cv of new Set([prevC, c])) paint(a, cv);
      if (a === to) break;
    }
  };
  const roadLo = 1;
  const roadHi = Math.max(roadLo, side - roadW - 1);
  const c0 = clamp(cc - (roadW > 1 ? randInt(r, 0, 1) : 0), roadLo, roadHi);
  drift(ca, len - 1, c0, roadLo, roadHi, 0.3, (a, c) => paintRoad(a, c, roadW));
  drift(ca, 0, c0, roadLo, roadHi, 0.3, (a, c) => paintRoad(a, c, roadW));

  // Praça: mancha arredondada e torta em volta do centro, com o poço no meio.
  const big = p.rooms >= 10 && Math.min(w, h) >= 30;
  const ra = Math.min(big ? 4 : 3, Math.floor(len / 6));
  const rc = Math.min(big ? 3 : 2, Math.floor(side / 6));
  if (ra >= 1 && rc >= 1) {
    for (let da = -ra - 1; da <= ra + 1; da++) {
      for (let dc = -rc - 1; dc <= rc + 1; dc++) {
        const q = (da * da) / (ra * ra) + (dc * dc) / (rc * rc);
        if (q <= 1 + (r() - 0.5) * 0.6 && inAC(ca + da, cc + dc)) path[idx(ca + da, cc + dc)] = 1;
      }
    }
  }

  // Ramais saindo da praça para um lado (às vezes para os dois), até a borda ou um pouco antes.
  const branches = side >= 18 ? (p.rooms >= 10 && r() < 0.6 ? 2 : r() < 0.75 ? 1 : 0) : 0;
  const firstSide = r() < 0.5 ? 1 : -1;
  for (let b = 0; b < branches; b++) {
    const dirC = b === 0 ? firstSide : -firstSide;
    const bw = big && r() < 0.5 ? 2 : 1;
    const toEdge = r() < 0.65;
    const end = dirC > 0 ? (toEdge ? side - 1 : randInt(r, cc + 6, side - 3)) : (toEdge ? 0 : randInt(r, 2, cc - 6));
    if ((dirC > 0 && end <= cc) || (dirC < 0 && end >= cc)) continue;
    let a = clamp(ca + randInt(r, -1, 1), 1, len - bw - 1);
    const aLo = clamp(ca - 5, 1, len - bw - 1);
    const aHi = clamp(ca + 5, 1, len - bw - 1);
    for (let c = cc; ; c += dirC) {
      const prevA = a;
      if (r() < 0.3) a = clamp(a + randInt(r, -1, 1), aLo, aHi);
      for (const av of new Set([prevA, a])) for (let k = 0; k < bw; k++) if (inAC(av + k, c)) path[idx(av + k, c)] = 1;
      if (c === end) break;
    }
  }

  // Riacho de través, longe da praça; onde cruza a estrada, a estrada passa por cima (ponte).
  if (len >= 30 && side >= 14 && r() < 0.75) {
    const far = 9;
    const spots: number[] = [];
    for (let a = 3; a < len - 4; a++) if (Math.abs(a - ca) >= far + 2) spots.push(a);
    if (spots.length) {
      let a = pick(r, spots);
      const sw = side >= 28 && r() < 0.5 ? 2 : 1;
      const lo = a < ca ? 2 : ca + far;
      const hi = a < ca ? ca - far - sw : len - sw - 2;
      for (let c = 0; c < side; c++) {
        const prevA = a;
        if (r() < 0.4) a = clamp(a + randInt(r, -1, 1), lo, Math.max(lo, hi));
        for (const av of new Set([prevA, a])) {
          for (let k = 0; k < sw; k++) {
            if (!inAC(av + k, c)) continue;
            const i = idx(av + k, c);
            if (!path[i]) water[i] = 1;
          }
        }
      }
    }
  }

  // Mato alto nos arredores.
  const [px, py] = across ? [ca, cc] : [cc, ca];
  const fromSquare = (x: number, y: number) => Math.hypot(x - px, y - py);
  const reach = Math.hypot(w, h) / 2;
  for (let k = 0; k < Math.round(N / 300); k++) {
    let x = randInt(r, 0, w - 1);
    let y = randInt(r, 0, h - 1);
    for (let s = randInt(r, 6, 18); s > 0; s--) {
      const i = y * w + x;
      if (!path[i] && !water[i] && fromSquare(x, y) > reach * 0.45) rough[i] = 1;
      const [dx, dy] = pick(r, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
      x = clamp(x + dx, 0, w - 1);
      y = clamp(y + dy, 0, h - 1);
    }
  }

  // Poço no meio da praça.
  const wellI = path[py * w + px] ? py * w + px : -1;
  if (wellI >= 0) path[wellI] = 0;

  // ── Construções ──
  const n = p.rooms;
  const trades = shuffle(r, TRADE_LIST).slice(0, clamp(n - 2, 0, 4));
  const kinds: BuildingKind[] = [...trades, ...Array<BuildingKind>(Math.max(0, n - trades.length)).fill('moradia')];

  const fits = (pc: Piece, ox: number, oy: number): boolean => {
    for (let y = 0; y < pc.H; y++) {
      for (let x = 0; x < pc.W; x++) {
        if (!pc.built[y * pc.W + x]) continue;
        const gx = x + ox;
        const gy = y + oy;
        if (gx < 1 || gy < 1 || gx > w - 2 || gy > h - 2) return false;
        const i = gy * w + gx;
        if (path[i] || water[i] || reserved[i] || i === wellI) return false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (water[i + dy * w + dx]) return false;
      }
    }
    return true;
  };

  const stamp = (pc: Piece, ox: number, oy: number, kind: BuildingKind, spacing: number) => {
    const cells: number[] = [];
    for (let y = 0; y < pc.H; y++) {
      for (let x = 0; x < pc.W; x++) {
        const v = pc.built[y * pc.W + x];
        if (!v) continue;
        const i = (y + oy) * w + x + ox;
        built[i] = v;
        rough[i] = 0;
        cells.push(i);
      }
    }
    for (const i of cells) {
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -spacing; dy <= spacing; dy++) {
        for (let dx = -spacing; dx <= spacing; dx++) if (inb(x + dx, y + dy)) reserved[(y + dy) * w + x + dx] ||= 1;
      }
    }
    const move = (e: EdgeRef): EdgeRef => ({ o: e.o, x: e.x + ox, y: e.y + oy });
    setWalls(layout, pc.walls.map(move), true);
    doors.push(...pc.doors.map(move));
    for (const rm of pc.rooms) rooms.push({ ...rm, x: rm.x + ox, y: rm.y + oy });
    buildings.push({ kind, x: ox, y: oy, w: pc.W, h: pc.H });
  };

  const markPath = (i: number) => { path[i] = 1; water[i] = 0; rough[i] = 0; };

  /** Ao lado da estrada, de frente para ela. */
  const byRoad = (pc0: Piece, trade: boolean) => {
    const roads: number[] = [];
    for (let i = 0; i < N; i++) if (path[i]) roads.push(i);
    if (!roads.length) return null;
    let best: { pc: Piece; ox: number; oy: number; walk: number[]; score: number } | null = null;
    for (let t = 0; t < 260; t++) {
      const road = pick(r, roads);
      const d = pick(r, DIRS);
      const flip = r() < 0.5;
      const rot = [0, 1, 2, 3].find((k) => turnDir({ rot: k, flip }, pc0.dir) === d)!;
      const pc = turnPiece(pc0, { rot, flip });
      const [dx, dy] = STEP[d];
      const s = randInt(r, 0, trade ? 1 : 2);
      const rx = road % w;
      const ry = (road - rx) / w;
      const anchor = pc.front[Math.floor(pc.front.length / 2)];
      const [fx, fy] = outCell(anchor, d);
      const ox = rx - dx * s - fx;
      const oy = ry - dy * s - fy;
      if (!fits(pc, ox, oy)) continue;
      // Calçada da porta até a estrada.
      const walk: number[] = [];
      let ok = true;
      for (let k = 0; k < s; k++) {
        const x = rx - dx * (s - k);
        const y = ry - dy * (s - k);
        if (!inb(x, y) || built[y * w + x] || y * w + x === wellI) { ok = false; break; }
        walk.push(y * w + x);
      }
      if (!ok) continue;
      // Os outros quadrados da frente (vão largo) também precisam estar livres.
      if (pc.front.some((e) => {
        const [x, y] = outCell(e, d);
        return !inb(x + ox, y + oy) || built[(y + oy) * w + x + ox];
      })) continue;
      const cx = ox + pc.W / 2;
      const cy = oy + pc.H / 2;
      const score = fromSquare(cx, cy) * (trade ? 1 : 0.4) + r() * (trade ? 3 : 10);
      if (!best || score < best.score) best = { pc, ox, oy, walk, score };
    }
    return best;
  };

  /** Afastada da estrada, ligada a ela por uma trilha. */
  const offRoad = (pc0: Piece) => {
    let best: { pc: Piece; ox: number; oy: number; trail: number[]; score: number } | null = null;
    const noise = new Float64Array(N);
    for (let i = 0; i < N; i++) noise[i] = r() * 1.5;
    for (let t = 0; t < 40; t++) {
      const flip = r() < 0.5;
      const pc = turnPiece(pc0, { rot: randInt(r, 0, 3), flip });
      const ox = randInt(r, 1, Math.max(1, w - pc.W - 1));
      const oy = randInt(r, 1, Math.max(1, h - pc.H - 1));
      if (!fits(pc, ox, oy)) continue;
      const anchor = pc.front[Math.floor(pc.front.length / 2)];
      const [fx, fy] = outCell(anchor, pc.dir);
      const sx = fx + ox;
      const sy = fy + oy;
      if (!inb(sx, sy)) continue;
      const start = sy * w + sx;
      if (built[start] || start === wellI) continue;
      // A trilha não atravessa construção (nem a nova) e evita o riacho e o quintal dos vizinhos.
      const mine = new Set<number>();
      for (let y = 0; y < pc.H; y++) for (let x = 0; x < pc.W; x++) if (pc.built[y * pc.W + x]) mine.add((y + oy) * w + x + ox);
      const trail = cheapest(w, h, start, path, (i) => (built[i] || mine.has(i) || i === wellI ? -1 : 1 + noise[i] + (water[i] ? 4 : 0) + (reserved[i] ? 1.5 : 0)));
      if (!trail || trail.length < 3 || trail.length > 16) continue;
      const score = fromSquare(ox + pc.W / 2, oy + pc.H / 2) * 0.5 + trail.length * 0.5 + r() * 8;
      if (!best || score < best.score) best = { pc, ox, oy, trail, score };
    }
    return best;
  };

  /** Horta encostada (com um quadrado de folga) num lado da casa. */
  const addGarden = (b: GenBuilding) => {
    for (let t = 0; t < 20; t++) {
      const gw = randInt(r, 2, 4);
      const gh = randInt(r, 2, 3);
      const [ww, hh] = r() < 0.5 ? [gw, gh] : [gh, gw];
      const sideG = pick(r, DIRS);
      const x = sideG === 'w' ? b.x - 1 - ww : sideG === 'e' ? b.x + b.w + 1 : randInt(r, b.x - 1, b.x + b.w - ww + 1);
      const y = sideG === 'n' ? b.y - 1 - hh : sideG === 's' ? b.y + b.h + 1 : randInt(r, b.y - 1, b.y + b.h - hh + 1);
      let ok = x >= 1 && y >= 1 && x + ww <= w - 1 && y + hh <= h - 1;
      for (let yy = y - 1; ok && yy <= y + hh; yy++) {
        for (let xx = x - 1; ok && xx <= x + ww; xx++) {
          if (!inb(xx, yy)) continue;
          const i = yy * w + xx;
          const inner = xx >= x && yy >= y && xx < x + ww && yy < y + hh;
          if (built[i] || path[i] || water[i] || i === wellI || (inner && reserved[i] === 2)) ok = false;
        }
      }
      if (!ok) continue;
      for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + ww; xx++) { reserved[yy * w + xx] = 2; rough[yy * w + xx] = 0; }
      gardens.push({ x, y, w: ww, h: hh });
      return;
    }
  };

  for (const [k, kind] of kinds.entries()) {
    const sub = (seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0;
    const br = mulberry32(sub);
    const trade = kind !== 'moradia';
    let placed = false;
    for (let tries = 0; tries < 3 && !placed; tries++) {
      const pc = trade ? tradePiece(kind, p, br) : housePiece(p, (sub + tries * 0x632be5ab) >>> 0, br);
      if (!pc) continue;
      const spacing = trade ? 1 : r() < 0.5 ? 1 : 2;
      const far = !trade && r() < 0.35 ? offRoad(pc) : null;
      if (far) {
        stamp(far.pc, far.ox, far.oy, kind, spacing);
        for (const i of far.trail) markPath(i);
        placed = true;
        continue;
      }
      const near = byRoad(pc, trade) ?? (trade ? null : offRoad(pc));
      if (!near) continue;
      stamp(near.pc, near.ox, near.oy, kind, spacing);
      for (const i of 'walk' in near ? near.walk : near.trail) markPath(i);
      placed = true;
    }
    if (placed && kind === 'moradia' && r() < 0.5) addGarden(buildings[buildings.length - 1]);
  }

  // ── Terreno e zonas ──
  const cells: string[] = Array(N).fill(TERRAIN_CHAR.floor);
  const zone = new Uint8Array(N).fill(ZONE.outside);
  for (let i = 0; i < N; i++) {
    if (built[i]) { zone[i] = built[i]; continue; }
    if (path[i]) { cells[i] = TERRAIN_CHAR.road; zone[i] = ZONE.path; continue; }
    if (water[i] || rough[i] || reserved[i] === 2) cells[i] = TERRAIN_CHAR.difficult;
  }
  layout.cells = cells.join('');

  // Postes de lampião: na beira da estrada perto da praça.
  const sidewalk: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!path[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    if (fromSquare(x, y) > Math.max(ra, rc) + 9) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inb(x + dx, y + dy) && !path[(y + dy) * w + x + dx] && !built[(y + dy) * w + x + dx])) {
      sidewalk.push(i);
    }
  }

  const waterCells: number[] = [];
  for (let i = 0; i < N; i++) if (water[i]) waterCells.push(i);
  return {
    layout, rooms, doors, zone,
    ...(sidewalk.length ? { sidewalk } : {}),
    village: { buildings, well: wellI >= 0 ? wellI : null, water: waterCells, gardens },
  };
}
