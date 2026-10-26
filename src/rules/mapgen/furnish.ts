// Mobília automática: cada tipo de cômodo tem uma receita (cama encostada na parede, mesa
// com cadeiras no meio, bancos voltados para o altar...). Nada fica na frente de portas
// e aberturas, e um móvel que bloqueia só entra se não separar nenhuma parte do mapa.
import type { MapPreset, PropEffect, PropKind } from '../../model/types';
import { PROP_KINDS, TERRAIN_CHAR } from '../../model/types';
import { edgeKey } from '../../model/map';
import { randInt, type SeededRng } from '../random';
import { type Dir, type GenBase, type GenRoom, pick, type Rect, type RoomKind, ZONE } from './shared';

export interface GenProp { prop: PropKind; label: string; x: number; y: number; w: number; h: number; effect: PropEffect }

/** Teto de objetos do mapa (portas + móveis) é 500; sobra folga para o mestre. */
const OBJECT_BUDGET = 480;
const PROP_SIDE_MAX = 10;

function shuffle<T>(r: SeededRng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Quadro local do cômodo: u atravessa, v vai da frente (v = 0, lado do altar) para o fundo. */
function local(R: Rect, dir: Dir) {
  const vert = dir === 'n' || dir === 's';
  const U = vert ? R.w : R.h;
  const V = vert ? R.h : R.w;
  const rect = (u: number, v: number, uw: number, vd: number): Rect => {
    switch (dir) {
      case 'n': return { x: R.x + u, y: R.y + v, w: uw, h: vd };
      case 's': return { x: R.x + U - u - uw, y: R.y + V - v - vd, w: uw, h: vd };
      case 'w': return { x: R.x + v, y: R.y + U - u - uw, w: vd, h: uw };
      case 'e': return { x: R.x + V - v - vd, y: R.y + u, w: vd, h: uw };
    }
  };
  return { U, V, rect };
}

class Furnisher {
  readonly w: number;
  readonly h: number;
  readonly cells: string[];
  readonly props: GenProp[] = [];
  private readonly wallsH: string;
  private readonly wallsV: string;
  private readonly doorKeys: Set<string>;
  private readonly occ: Uint8Array;
  private readonly blocked: Uint8Array;
  readonly keep: Uint8Array;
  readonly zone: Uint8Array;
  private comps = -1;

  constructor(base: GenBase, readonly r: SeededRng, private budget: number) {
    const { layout } = base;
    this.w = layout.w;
    this.h = layout.h;
    this.cells = layout.cells.split('');
    this.wallsH = layout.wallsH;
    this.wallsV = layout.wallsV;
    this.zone = base.zone;
    this.doorKeys = new Set(base.doors.map(edgeKey));
    const n = this.w * this.h;
    this.occ = new Uint8Array(n);
    this.blocked = new Uint8Array(n);
    this.keep = new Uint8Array(n);
    const roomOf = new Int16Array(n).fill(-1);
    base.rooms.forEach((rm, k) => {
      for (let y = rm.y; y < rm.y + rm.h; y++) for (let x = rm.x; x < rm.x + rm.w; x++) roomOf[y * this.w + x] = k;
    });
    // Livre: dos dois lados de toda porta e de toda passagem entre áreas diferentes; e a trilha.
    const mark = (a: number, b: number, o: 'h' | 'v', x: number, y: number) => {
      if (!this.open(a) || !this.open(b)) return;
      const door = this.doorKeys.has(`${o}${x},${y}`);
      if (door || (roomOf[a] !== roomOf[b] && this.passEdge(o, x, y))) { this.keep[a] = 1; this.keep[b] = 1; }
    };
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (x + 1 < this.w) mark(i, i + 1, 'v', x + 1, y);
        if (y + 1 < this.h) mark(i, i + this.w, 'h', x, y + 1);
        if (this.zone[i] === ZONE.path) this.keep[i] = 1;
      }
    }
  }

  open(i: number) { return this.cells[i] !== TERRAIN_CHAR.void; }

  passEdge(o: 'h' | 'v', x: number, y: number) {
    const wall = o === 'h' ? this.wallsH[y * this.w + x] : this.wallsV[y * (this.w + 1) + x];
    return wall !== '1' || this.doorKeys.has(`${o}${x},${y}`);
  }

  /** Parede de verdade (sem porta). */
  solid(o: 'h' | 'v', x: number, y: number) {
    const wall = o === 'h' ? this.wallsH[y * this.w + x] : this.wallsV[y * (this.w + 1) + x];
    return wall === '1' && !this.doorKeys.has(`${o}${x},${y}`);
  }

  canUse(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    const i = y * this.w + x;
    return this.open(i) && this.cells[i] !== TERRAIN_CHAR.stairs && !this.occ[i] && !this.keep[i];
  }

  fits(rc: Rect) {
    for (let y = rc.y; y < rc.y + rc.h; y++) for (let x = rc.x; x < rc.x + rc.w; x++) if (!this.canUse(x, y)) return false;
    return true;
  }

  get full() { return this.props.length >= this.budget; }

  place(prop: PropKind, rc: Rect, label = ''): boolean {
    if (this.full || rc.w < 1 || rc.h < 1 || rc.w > PROP_SIDE_MAX || rc.h > PROP_SIDE_MAX || !this.fits(rc)) return false;
    const effect = PROP_KINDS[prop].effect;
    const idx: number[] = [];
    for (let y = rc.y; y < rc.y + rc.h; y++) for (let x = rc.x; x < rc.x + rc.w; x++) idx.push(y * this.w + x);
    if (effect === 'block' && !this.tryBlock(idx, rc)) return false;
    for (const i of idx) this.occ[i] = 1;
    this.props.push({ prop, label, ...rc, effect });
    return true;
  }

  // ── Conexão ──
  private passable(i: number) { return this.open(i) && !this.blocked[i]; }

  private stepOk(ax: number, ay: number, bx: number, by: number) {
    if (bx === ax + 1) return this.passEdge('v', bx, ay);
    if (ax === bx + 1) return this.passEdge('v', ax, ay);
    if (by === ay + 1) return this.passEdge('h', ax, by);
    return this.passEdge('h', ax, ay);
  }

  private components(): number {
    const { w, h } = this;
    const seen = new Uint8Array(w * h);
    let n = 0;
    const stack: number[] = [];
    for (let s = 0; s < w * h; s++) {
      if (seen[s] || !this.passable(s)) continue;
      n++;
      seen[s] = 1;
      stack.push(s);
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % w;
        const y = (i - x) / w;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (seen[ni] || !this.passable(ni) || !this.stepOk(x, y, nx, ny)) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
    }
    return n;
  }

  /** Um quadrado só: se os vizinhos dele se ligam pela volta (3 × 3), bloquear não separa nada. */
  private locallySafe(x: number, y: number): { safe: boolean; isolated: boolean } {
    const { w, h } = this;
    const inb = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < w && yy < h;
    const nbs = ([[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Array<[number, number]>)
      .filter(([nx, ny]) => inb(nx, ny) && this.passable(ny * w + nx) && this.stepOk(x, y, nx, ny));
    if (nbs.length <= 1) return { safe: true, isolated: nbs.length === 0 };
    const key = (xx: number, yy: number) => `${xx},${yy}`;
    const seen = new Set([key(...nbs[0])]);
    const stack = [nbs[0]];
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1 || (nx === x && ny === y) || !inb(nx, ny)) continue;
        if (seen.has(key(nx, ny)) || !this.passable(ny * w + nx) || !this.stepOk(cx, cy, nx, ny)) continue;
        seen.add(key(nx, ny));
        stack.push([nx, ny]);
      }
    }
    return { safe: nbs.every(([nx, ny]) => seen.has(key(nx, ny))), isolated: false };
  }

  private tryBlock(idx: number[], rc: Rect): boolean {
    if (this.comps < 0) this.comps = this.components();
    if (idx.length === 1) {
      const local = this.locallySafe(rc.x, rc.y);
      if (local.safe) {
        this.blocked[idx[0]] = 1;
        if (local.isolated) this.comps--;
        return true;
      }
    }
    for (const i of idx) this.blocked[i] = 1;
    const after = this.components();
    if (after > this.comps) {
      for (const i of idx) this.blocked[i] = 0;
      return false;
    }
    this.comps = after;
    return true;
  }

  // ── Posições ──

  /** Encostado numa parede: `len` ao longo dela, `depth` para dentro. */
  alongWall(R: Rect, prop: PropKind, len: number, depth: number, label = ''): Rect | null {
    const spots: Rect[] = [];
    const solidRun = (o: 'h' | 'v', x: number, y: number, n: number) => {
      for (let k = 0; k < n; k++) if (!this.solid(o, o === 'h' ? x + k : x, o === 'h' ? y : y + k)) return false;
      return true;
    };
    if (len <= R.w && depth <= R.h) {
      for (let x = R.x; x + len <= R.x + R.w; x++) {
        if (solidRun('h', x, R.y, len)) spots.push({ x, y: R.y, w: len, h: depth });
        if (solidRun('h', x, R.y + R.h, len)) spots.push({ x, y: R.y + R.h - depth, w: len, h: depth });
      }
    }
    if (len <= R.h && depth <= R.w) {
      for (let y = R.y; y + len <= R.y + R.h; y++) {
        if (solidRun('v', R.x, y, len)) spots.push({ x: R.x, y, w: depth, h: len });
        if (solidRun('v', R.x + R.w, y, len)) spots.push({ x: R.x + R.w - depth, y, w: depth, h: len });
      }
    }
    for (const s of shuffle(this.r, spots)) if (this.place(prop, s, label)) return s;
    return null;
  }

  /** Perto do meio, longe das paredes quando dá. Tenta deitado e em pé. */
  center(R: Rect, prop: PropKind, w: number, h: number, label = ''): Rect | null {
    const cands: Array<{ rc: Rect; d: number }> = [];
    for (const [ww, hh] of w === h ? [[w, h]] : [[w, h], [h, w]]) {
      const mx = R.w - ww >= 2 ? 1 : 0;
      const my = R.h - hh >= 2 ? 1 : 0;
      for (let y = R.y + my; y + hh <= R.y + R.h - my; y++) {
        for (let x = R.x + mx; x + ww <= R.x + R.w - mx; x++) {
          const d = Math.abs(x + ww / 2 - (R.x + R.w / 2)) + Math.abs(y + hh / 2 - (R.y + R.h / 2));
          cands.push({ rc: { x, y, w: ww, h: hh }, d });
        }
      }
    }
    cands.sort((a, b) => a.d - b.d);
    for (let k = 0; k < cands.length; k++) {
      // Entre os mais centrais, um pouco de sorte.
      const j = Math.min(cands.length - 1, k + (this.r() < 0.5 ? 1 : 0));
      const c = cands[j];
      if (this.place(prop, c.rc, label)) return c.rc;
      if (j !== k && this.place(prop, cands[k].rc, label)) return cands[k].rc;
    }
    return null;
  }

  corner(R: Rect, prop: PropKind, label = ''): Rect | null {
    const cs = [[R.x, R.y], [R.x + R.w - 1, R.y], [R.x, R.y + R.h - 1], [R.x + R.w - 1, R.y + R.h - 1]];
    for (const [x, y] of shuffle(this.r, cs)) {
      const rc = { x, y, w: 1, h: 1 };
      if (this.place(prop, rc, label)) return rc;
    }
    return null;
  }

  anywhere(R: Rect, prop: PropKind, n: number, label = ''): number {
    let done = 0;
    for (let t = 0; t < n * 8 && done < n; t++) {
      const rc = { x: randInt(this.r, R.x, R.x + R.w - 1), y: randInt(this.r, R.y, R.y + R.h - 1), w: 1, h: 1 };
      if (this.place(prop, rc, label)) done++;
    }
    return done;
  }

  /** Mesa no meio com cadeiras em volta. */
  dining(R: Rect, chairs: number, label = '') {
    const big = Math.min(R.w, R.h) >= 4;
    const t = big ? this.center(R, 'mesa', R.w >= R.h ? 2 : 1, R.w >= R.h ? 1 : 2, label) : this.center(R, 'mesa', 1, 1, label);
    if (!t) return;
    const around: Array<[number, number]> = [];
    for (let x = t.x; x < t.x + t.w; x++) around.push([x, t.y - 1], [x, t.y + t.h]);
    for (let y = t.y; y < t.y + t.h; y++) around.push([t.x - 1, y], [t.x + t.w, y]);
    let n = 0;
    for (const [x, y] of shuffle(this.r, around)) {
      if (n >= chairs) break;
      if (x < R.x || y < R.y || x >= R.x + R.w || y >= R.y + R.h) continue;
      if (this.place('cadeira', { x, y, w: 1, h: 1 })) n++;
    }
  }

  some(n: number, fn: () => unknown) { for (let k = 0; k < n; k++) fn(); }
}

type Recipe = (f: Furnisher, R: GenRoom) => void;

const storage: Recipe = (f, R) => {
  const n = randInt(f.r, 3, Math.max(3, Math.min(8, Math.floor((R.w * R.h) / 4))));
  for (let k = 0; k < n; k++) {
    const kind: PropKind = f.r() < 0.55 ? 'caixa' : 'barril';
    if (!f.alongWall(R, kind, 1, 1)) f.corner(R, kind);
  }
};

const bedroom = (label: string): Recipe => (f, R) => {
  if (Math.min(R.w, R.h) >= 4 && f.r() < 0.5) f.alongWall(R, 'cama', 2, 2, 'Cama de casal') || f.alongWall(R, 'cama', 1, 2, label);
  else f.alongWall(R, 'cama', 1, 2, label);
  f.alongWall(R, 'bau', 1, 1);
  if (R.w * R.h >= 12) f.alongWall(R, 'estante', 2, 1, 'Guarda-roupa') || f.alongWall(R, 'estante', 1, 1, 'Guarda-roupa');
  if (R.w * R.h >= 16) f.corner(R, 'cadeira');
};

const library: Recipe = (f, R) => {
  f.some(randInt(f.r, 2, 4), () => f.alongWall(R, 'estante', Math.min(3, Math.max(R.w, R.h) - 1), 1) || f.alongWall(R, 'estante', 1, 1));
  if (R.w * R.h >= 16) f.dining(R, 2, 'Mesa de leitura');
};

/** Pilares em grade, a cada três quadrados, longe das paredes. */
const pillarGrid = (f: Furnisher, R: Rect) => {
  for (let y = R.y + 2; y <= R.y + R.h - 3; y += 3) {
    for (let x = R.x + 2; x <= R.x + R.w - 3; x += 3) f.place('pilar', { x, y, w: 1, h: 1 });
  }
};

const RECIPES: Record<RoomKind, Recipe> = {
  generic: (f, R) => { f.anywhere(R, 'pedras', 1); },
  sala: (f, R) => {
    f.alongWall(R, 'sofa', 2, 1) || f.alongWall(R, 'sofa', 1, 1);
    f.center(R, 'mesa', 1, 1, 'Mesa de centro');
    f.alongWall(R, 'estante', 2, 1) || f.alongWall(R, 'estante', 1, 1);
    if (R.w * R.h >= 20) f.alongWall(R, 'fogao', 1, 1, 'Lareira');
    f.corner(R, 'cadeira', 'Poltrona');
  },
  cozinha: (f, R) => {
    f.alongWall(R, 'fogao', 2, 1) || f.alongWall(R, 'fogao', 1, 1);
    f.alongWall(R, 'estante', 2, 1, 'Armário') || f.alongWall(R, 'estante', 1, 1, 'Armário');
    f.dining(R, 4);
    f.corner(R, 'barril');
  },
  quarto: bedroom(''),
  banheiro: (f, R) => {
    f.alongWall(R, 'banheira', 2, 1) || f.alongWall(R, 'banheira', 1, 1, 'Tina');
    f.alongWall(R, 'outro', 1, 1, 'Pia');
  },
  despensa: storage,
  escritorio: (f, R) => {
    const desk = f.alongWall(R, 'mesa', 2, 1, 'Escrivaninha') ?? f.alongWall(R, 'mesa', 1, 1, 'Escrivaninha');
    if (desk) {
      // Cadeira encostada na escrivaninha, dentro do cômodo.
      const x1 = Math.max(R.x, desk.x - 1);
      const y1 = Math.max(R.y, desk.y - 1);
      const x2 = Math.min(R.x + R.w, desk.x + desk.w + 1);
      const y2 = Math.min(R.y + R.h, desk.y + desk.h + 1);
      f.center({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, 'cadeira', 1, 1);
    }
    f.some(2, () => f.alongWall(R, 'estante', 2, 1) || f.alongWall(R, 'estante', 1, 1));
  },
  biblioteca: library,
  nave: (f, R) => {
    const L = local(R, R.dir ?? 'n');
    const { U, V } = L;
    const pillars = U >= 7 && V >= 5;
    if (pillars) for (let v = 1; v <= V - 2; v += 2) for (const u of [1, U - 2]) f.place('pilar', L.rect(u, v, 1, 1));
    const aisle = U % 2 ? 1 : 2;
    const a0 = (U - aisle) / 2;
    const len = Math.min(PROP_SIDE_MAX, a0 - (pillars ? 2 : 1));
    if (len >= 1 && V >= 6) {
      for (let v = 2; v <= V - 3; v += 2) {
        f.place('banco', L.rect(a0 - len, v, len, 1));
        f.place('banco', L.rect(a0 + aisle, v, len, 1));
      }
    }
  },
  santuario: (f, R) => {
    if (!R.dir) {
      // Santuário de masmorra: altar na parede e estátuas nos cantos.
      f.alongWall(R, 'altar', 2, 1) || f.alongWall(R, 'altar', 1, 1);
      f.some(2, () => f.corner(R, 'estatua'));
      if (Math.min(R.w, R.h) >= 7) pillarGrid(f, R);
      return;
    }
    const L = local(R, R.dir);
    const { U, V } = L;
    const aw = U % 2 ? (U >= 5 ? 3 : 1) : 2;
    f.place('altar', L.rect((U - aw) / 2, V >= 4 ? 1 : 0, aw, 1));
    if (U >= 5) { f.place('estatua', L.rect(0, 0, 1, 1)); f.place('estatua', L.rect(U - 1, 0, 1, 1)); }
  },
  vestibulo: (f, R) => {
    const L = local(R, R.dir ?? 'n');
    if (L.U >= 5) { f.place('estatua', L.rect(0, L.V - 1, 1, 1)); f.place('estatua', L.rect(L.U - 1, L.V - 1, 1, 1)); }
  },
  capela: (f, R) => {
    f.alongWall(R, 'altar', 1, 1);
    if (R.w * R.h >= 9) f.center(R, 'banco', 2, 1);
    f.corner(R, 'estatua');
  },
  sacristia: (f, R) => {
    f.alongWall(R, 'estante', 2, 1, 'Armário de paramentos') || f.alongWall(R, 'estante', 1, 1, 'Armário de paramentos');
    f.alongWall(R, 'bau', 1, 1);
    if (R.w * R.h >= 12) f.center(R, 'mesa', 1, 1);
  },
  cela: (f, R) => {
    f.alongWall(R, 'cama', 1, 2, 'Catre') || f.alongWall(R, 'cama', 1, 1, 'Catre');
    if (f.r() < 0.5) f.alongWall(R, 'bau', 1, 1);
    if (f.r() < 0.4) f.anywhere(R, 'pedras', 1, 'Palha');
  },
  torre: (f, R) => { f.corner(R, 'caixa'); },
  guarda: (f, R) => {
    f.dining(R, 3);
    f.alongWall(R, 'estante', 2, 1, 'Armeiro') || f.alongWall(R, 'estante', 1, 1, 'Armeiro');
    f.corner(R, 'barril');
  },
  deposito: storage,
  tesouro: (f, R) => {
    f.center(R, 'bau', 1, 1, 'Baú do tesouro');
    f.some(2, () => f.corner(R, 'estatua'));
    f.corner(R, 'caixa');
  },
  dormitorio: (f, R) => {
    f.some(randInt(f.r, 2, 4), () => f.alongWall(R, 'cama', 1, 2, 'Catre'));
    f.alongWall(R, 'bau', 1, 1);
  },
  ruina: (f, R) => {
    f.anywhere(R, 'pedras', randInt(f.r, 2, 5));
    if (f.r() < 0.4) f.anywhere(R, 'pilar', 1, 'Coluna quebrada');
  },
  salao: (f, R) => {
    pillarGrid(f, R);
    if (f.r() < 0.5) f.alongWall(R, 'estatua', 1, 1);
    f.corner(R, 'barril');
  },
  cabana: (f, R) => {
    f.alongWall(R, 'cama', 1, 2) || f.alongWall(R, 'cama', 1, 1);
    f.alongWall(R, 'fogao', 1, 1, 'Lareira');
    if (R.w * R.h >= 12) f.center(R, 'mesa', 1, 1);
    f.corner(R, 'barril');
  },
};

const DUNGEON_KINDS: Array<[RoomKind, number]> = [
  ['guarda', 2], ['deposito', 2], ['cela', 1.5], ['dormitorio', 1], ['tesouro', 0.6], ['santuario', 0.6], ['biblioteca', 0.6], ['ruina', 1.5],
];

function dungeonKind(R: GenRoom, r: SeededRng): RoomKind {
  if (Math.min(R.w, R.h) >= 7 && r() < 0.5) return 'salao';
  const total = DUNGEON_KINDS.reduce((s, [, wt]) => s + wt, 0);
  let x = r() * total;
  for (const [k, wt] of DUNGEON_KINDS) {
    x -= wt;
    if (x < 0) return k;
  }
  return 'ruina';
}

/** Árvores longe das paredes e arbustos encostados, no quintal da casa ou do templo. */
function yard(f: Furnisher) {
  const { w, h, zone } = f;
  const built = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && (zone[y * w + x] === ZONE.room || zone[y * w + x] === ZONE.corridor);
  for (let y = 0; y < h && !f.full; y++) {
    for (let x = 0; x < w && !f.full; x++) {
      if (zone[y * w + x] !== ZONE.outside) continue;
      let near8 = false;
      let near4 = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!built(x + dx, y + dy)) continue;
          near8 = true;
          if (!dx || !dy) near4 = true;
        }
      }
      const rc = { x, y, w: 1, h: 1 };
      if (!near8 && f.r() < 0.14) f.place('arvore', rc);
      else if (near4 && f.r() < 0.07) f.place('arbusto', rc);
    }
  }
}

/** Campo aberto: bosques, árvores soltas, arbustos e pedras perto das rochas. */
function field(f: Furnisher) {
  const { w, h, zone, r } = f;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? zone[y * w + x] : ZONE.none);
  const ok = (x: number, y: number) => {
    if (at(x, y) !== ZONE.outside) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) === ZONE.room) return false;
    return true;
  };
  const cands: Array<[number, number]> = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ok(x, y)) cands.push([x, y]);
  if (!cands.length) return;
  const groves = Math.max(2, Math.round((w * h) / 180));
  for (let g = 0; g < groves && !f.full; g++) {
    const [cx, cy] = pick(r, cands);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy > 9 || !ok(cx + dx, cy + dy) || r() >= 0.45) continue;
        f.place('arvore', { x: cx + dx, y: cy + dy, w: 1, h: 1 });
      }
    }
  }
  for (const [x, y] of cands) {
    if (f.full) break;
    const rc = { x, y, w: 1, h: 1 };
    const nearRock = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < w && ny < h && f.cells[ny * w + nx] === TERRAIN_CHAR.void;
    });
    const roll = r();
    if (nearRock && roll < 0.12) f.place('pedras', rc);
    else if (roll < 0.02) f.place('arvore', rc);
    else if (roll < 0.045) f.place('arbusto', rc);
  }
}

/**
 * Mobília para o mapa gerado. Muda o terreno só na masmorra (escadas de entrada e saída)
 * e dá tipo às salas da masmorra.
 */
export function furnish(base: GenBase, preset: MapPreset, r: SeededRng): GenProp[] {
  const f = new Furnisher(base, r, Math.max(0, OBJECT_BUDGET - base.doors.length));
  const { w } = f;

  if (preset === 'dungeon') {
    for (const rm of base.rooms) rm.kind = dungeonKind(rm, r);
    // Escadas: na primeira sala e na mais distante dela.
    const c = (rm: Rect) => [rm.x + rm.w / 2, rm.y + rm.h / 2];
    const [x0, y0] = c(base.rooms[0]);
    const far = base.rooms.reduce((b, rm) => {
      const [x, y] = c(rm);
      const d = Math.abs(x - x0) + Math.abs(y - y0);
      return d > b.d ? { rm, d } : b;
    }, { rm: base.rooms[0], d: -1 }).rm;
    for (const rm of new Set([base.rooms[0], far])) {
      const cs = [[rm.x, rm.y], [rm.x + rm.w - 1, rm.y], [rm.x, rm.y + rm.h - 1], [rm.x + rm.w - 1, rm.y + rm.h - 1]];
      const spot = shuffle(r, cs).find(([x, y]) => f.canUse(x, y));
      if (spot) f.cells[spot[1] * w + spot[0]] = TERRAIN_CHAR.stairs;
    }
  }

  for (const rm of base.rooms) {
    if (f.full) break;
    RECIPES[rm.kind](f, rm);
  }

  if (preset === 'dungeon') {
    // Entulho solto nos corredores (só atrapalha, não bloqueia).
    const corr: number[] = [];
    f.zone.forEach((z, i) => { if (z === ZONE.corridor) corr.push(i); });
    if (corr.length) {
      f.some(randInt(r, 0, 3), () => {
        const i = pick(r, corr);
        f.place('pedras', { x: i % w, y: Math.floor(i / w), w: 1, h: 1 });
      });
    }
  }
  if (preset === 'house' || preset === 'temple') yard(f);
  if (preset === 'outdoor') field(f);

  base.layout.cells = f.cells.join('');
  return f.props;
}
