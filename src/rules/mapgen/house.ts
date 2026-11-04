// Casa ou hotel: planta montada pelo modelo escolhido, no tamanho do programa (não do mapa),
// com quintal em volta.
// Casas têm a parte social sem corredor (sala, jantar e cozinha se abrem uma para a outra) e,
// no máximo, um corredor curto para quartos e banheiros. Hospedagens têm corredores compridos
// com quartos dos dois lados. As portas seguem o tipo do cômodo: quarto abre para o corredor
// ou para a sala, banheiro de suíte só para o quarto, cozinha para o jantar, e assim por diante.
import type { EdgeRef, HouseModel, HouseShape, HouseSize, MapGenParams } from '../../model/types';
import { HOUSE_MODELS } from '../../model/types';
import { mulberry32, randInt, type SeededRng } from '../random';
import {
  type Dir, type Frame, type GenBase, type GenRoom, longest, mapDir, mapRect, passage, pick, pickSpan, Plan, type Rect,
  type RoomKind, subtract, touches, ZONE,
} from './shared';

type Shape = Exclude<HouseShape, 'random'>;

/** Cômodo da planta. `owner`: quarto da suíte (banheiro só abre para ele). `bath`: banheiro nos fundos, a cortar. */
interface Room extends Rect { kind: RoomKind; owner?: Room; bath?: number }

/** Cômodo pedido numa faixa ao longo do corredor. `suite`: banheiro do cômodo anterior (vão juntos). */
interface Spec { kind: RoomKind; len: number; suite?: boolean; bath?: number }

/** Quartos de hóspede em série: `peek` mostra o próximo sem gastar, `take` gasta. */
interface Quota { peek(): Spec | null; take(): void }

/** Faixa de cômodos encostada num corredor, cortada no sentido `along`. */
interface Band extends Rect {
  along: 'x' | 'y';
  /** Começa a cortar pela ponta de x (ou y) maior. */
  rev?: boolean;
  items: Spec[];
  /** Depois dos pedidos, enche com os quartos da cota. */
  fill?: Quota;
  /** Sobra de três quadrados ou mais vira este cômodo. */
  spare: RoomKind;
}

interface Blueprint {
  rooms: Room[];
  halls: Rect[];
  bands: Band[];
  /** Recebe a porta da frente (lado de baixo, no quadro canônico). */
  entry: Room;
  /** Podem ganhar porta dos fundos. */
  back: Room[];
}

// ── Medidas ─────────────────────────────────────────────────────────────────
// Um quadrado vale 1,5 m: quarto de 3 × 3 tem 4,5 m de lado.

interface Dims {
  /** Comprimento do quarto ao longo do corredor e profundidade. */
  q(): number; qd(): number;
  ban(): number; sala(): number; coz(): number; jan(): number;
}

function dims(size: HouseSize, r: SeededRng): Dims {
  const R = (a: number, b: number) => () => randInt(r, a, b);
  switch (size) {
    case 'compacto': return { q: R(3, 3), qd: R(3, 3), ban: R(2, 2), sala: R(4, 5), coz: R(3, 3), jan: R(3, 3) };
    case 'amplo': return { q: R(4, 5), qd: R(4, 5), ban: R(2, 3), sala: R(6, 7), coz: R(4, 5), jan: R(4, 5) };
    default: return { q: R(3, 4), qd: R(3, 4), ban: R(2, 2), sala: R(5, 6), coz: R(3, 4), jan: R(4, 4) };
  }
}

const sum = (xs: Spec[]) => xs.reduce((s, x) => s + x.len, 0);
const quarto = (len: number): Spec => ({ kind: 'quarto', len });

/** Cada grupo vai para a faixa mais curta até então. */
function balance(groups: Spec[][], bands: Spec[][]) {
  for (const g of groups) {
    const b = bands.reduce((best, x) => (sum(x) < sum(best) ? x : best), bands[0]);
    b.push(...g);
  }
}

function shuffle<T>(r: SeededRng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Modelos ─────────────────────────────────────────────────────────────────
// Quadro canônico: x para leste, y para baixo, frente da casa embaixo. Coordenadas podem
// ser negativas; o montador acerta depois.

/** Casebre: cômodo de fogão e mesa, quartos encostados num lado. Sem corredor. */
function casebre(k: number, D: Dims, r: SeededRng): Blueprint {
  const col: Spec[] = Array.from({ length: k }, () => quarto(D.q()));
  if (k >= 1 && r() < 0.5) col.splice(randInt(r, 0, col.length), 0, { kind: 'banheiro', len: D.ban() });
  const mainH = Math.max(4, sum(col));
  for (let rest = mainH - sum(col), i = 0; rest > 0 && col.length; rest--, i++) {
    const qs = col.filter((s) => s.kind === 'quarto');
    (qs.length ? qs : col)[i % (qs.length || col.length)].len++;
  }
  const main: Room = { x: 0, y: 0, w: Math.max(4, D.sala() - 1), h: mainH, kind: k ? 'cozinha' : 'cabana' };
  const rooms: Room[] = [main];
  const qd = D.qd();
  let y = 0;
  for (const s of col) {
    rooms.push({ x: main.w, y, w: qd, h: s.len, kind: s.kind });
    y += s.len;
  }
  return { rooms, halls: [], bands: [], entry: main, back: [] };
}

/** Casa térrea: sala, cozinha (e jantar) de um lado; corredor curto dos quartos do outro. */
function casa(k: number, shape: Shape, c: number, size: HouseSize, D: Dims, r: SeededRng): Blueprint {
  const single = shape === 'long';
  const suite = k >= 3 || (k === 2 && size !== 'compacto' && r() < 0.4);
  const nq = k - (suite ? 1 : 0);
  const dT = D.qd();
  const dB = single ? 0 : D.qd();
  const Dw = dT + c + dB;
  const top: Spec[] = [];
  const bot: Spec[] = [];
  const quartos = Array.from({ length: nq }, () => [quarto(D.q())]);
  const bath: Spec = { kind: 'banheiro', len: D.ban() };
  if (single) {
    top.push(...quartos.flat());
    top.splice(randInt(r, 0, Math.min(1, top.length)), 0, bath);
  } else {
    top.push(bath);
    balance(quartos, [bot, top]);
  }
  // Suíte: quarto na cabeceira do corredor, banheiro dela na ponta de uma das faixas.
  const sb = suite ? D.ban() : 0;
  const sbBand = single ? top : bot;
  const L = Math.max(sum(top) + (sbBand === top ? sb : 0), single ? 0 : sum(bot) + (sbBand === bot ? sb : 0), 2);
  const rooms: Room[] = [];
  if (suite) {
    const master: Room = { x: L, y: 0, w: D.q() + 1, h: Dw, kind: 'quarto' };
    const sy = sbBand === top ? 0 : dT + c;
    rooms.push(master, { x: L - sb, y: sy, w: sb, h: sbBand === top ? dT : dB, kind: 'banheiro', owner: master });
  }
  const halls: Rect[] = [{ x: 0, y: dT, w: L, h: c }];
  const bands: Band[] = [{ x: 0, y: 0, w: L, h: dT, along: 'x', items: top, spare: 'escritorio' }];
  if (!single) bands.push({ x: 0, y: dT + c, w: L, h: dB, along: 'x', items: bot, spare: 'escritorio' });

  // Parte social, a oeste: a sala encosta na boca do corredor.
  const salaW = D.sala();
  const jan = k >= 3 ? r() < 0.65 : size === 'amplo' && r() < 0.4;
  let sala: Room;
  let back: Room;
  if (single) {
    // Fileira: [lavanderia] [cozinha] [jantar] [sala] → corredor.
    sala = { x: -salaW, y: 0, w: salaW, h: Dw, kind: 'sala' };
    rooms.push(sala);
    let x = -salaW;
    if (jan) {
      const jw = D.jan();
      x -= jw;
      rooms.push({ x, y: 0, w: jw, h: Dw, kind: 'jantar' });
    }
    const cw = D.coz();
    x -= cw;
    back = { x, y: 0, w: cw, h: Dw, kind: 'cozinha' };
    rooms.push(back);
    if (k >= 2 && r() < 0.5) {
      back = { x: x - 2, y: 0, w: 2, h: Dw, kind: 'lavanderia' };
      rooms.push(back);
    }
  } else {
    // Duas fileiras: atrás a cozinha (e lavanderia, despensa); na frente jantar e sala.
    const ext = shape === 'L' ? randInt(r, 2, 4) : 0;
    const Hh = Dw + ext;
    const janW = jan ? D.jan() : 0;
    const Sw = salaW + janW;
    sala = { x: -salaW, y: dT, w: salaW, h: Hh - dT, kind: 'sala' };
    rooms.push(sala);
    if (jan) rooms.push({ x: -Sw, y: dT, w: janW, h: Hh - dT, kind: 'jantar' });
    let cx = -Sw;
    let cw = Sw;
    let lav: Room | null = null;
    if (k >= 2 && cw - 2 >= 3 && r() < 0.6) {
      lav = { x: cx, y: 0, w: 2, h: dT, kind: 'lavanderia' };
      rooms.push(lav);
      cx += 2;
      cw -= 2;
    }
    if (cw - 2 >= 5) {
      rooms.push({ x: cx, y: 0, w: 2, h: dT, kind: 'despensa' });
      cx += 2;
      cw -= 2;
    }
    const coz: Room = { x: cx, y: 0, w: cw, h: dT, kind: 'cozinha' };
    rooms.push(coz);
    back = lav ?? coz;
  }
  return { rooms, halls, bands, entry: sala, back: [back] };
}

/** Casarão: entrada e salas na frente, corredor central de quartos, jantar e cozinha no fundo. */
function casarao(k: number, shape: Shape, c: number, D: Dims, r: SeededRng): Blueprint {
  const dL = Math.max(4, D.qd());
  const dR = Math.max(4, D.qd());
  const W = dL + c + dR;
  const study: RoomKind = k >= 6 && r() < 0.6 ? 'biblioteca' : 'escritorio';
  const spare: RoomKind = study === 'escritorio' ? 'biblioteca' : 'escritorio';
  const westQ = shape === 'T' ? Math.floor((k - 1) / 2) : 0;
  const centerQ = k - 1 - westQ;
  const left: Spec[] = [quarto(D.q() + 1), { kind: 'banheiro', len: D.ban(), suite: true }];
  const right: Spec[] = [];
  const groups: Spec[][] = Array.from({ length: centerQ }, () => [quarto(D.q())]);
  for (let i = 0; i < Math.max(1, Math.round(centerQ / 3)); i++) groups.splice(randInt(r, 0, groups.length), 0, [{ kind: 'banheiro', len: D.ban() }]);
  balance(groups, [right, left]);
  const Lm = Math.max(sum(left), sum(right));
  const bh = Math.max(4, D.coz() + 1, shape === 'long' ? 0 : 3 + c);
  const fh = Math.max(4, D.sala() - 1);

  // Fundo: jantar na boca do corredor, cozinha ao lado.
  const jx = Math.min(W - 3, dL + c + randInt(r, 0, 1));
  const jantar: Room = { x: 0, y: 0, w: jx, h: bh, kind: 'jantar' };
  const rooms: Room[] = [jantar];
  let cozW = W - jx;
  if (shape === 'long' && cozW - 2 >= 3) {
    rooms.push({ x: W - 2, y: 0, w: 2, h: bh, kind: 'despensa' });
    cozW -= 2;
  }
  const coz: Room = { x: jx, y: 0, w: cozW, h: bh, kind: 'cozinha' };
  rooms.push(coz);

  // Frente: sala de estar, hall de entrada (na boca do corredor) e escritório ou biblioteca.
  const fy = bh + Lm;
  const ew = Math.max(3, c + 2);
  const ex = dL - Math.floor((ew - c) / 2);
  const entrada: Room = { x: ex, y: fy, w: ew, h: fh, kind: 'entrada' };
  rooms.push(
    { x: 0, y: fy, w: ex, h: fh, kind: 'sala' },
    entrada,
    { x: ex + ew, y: fy, w: W - ex - ew, h: fh, kind: study },
  );
  const halls: Rect[] = [{ x: dL, y: bh, w: c, h: Lm }];
  const bands: Band[] = [
    { x: 0, y: bh, w: dL, h: Lm, along: 'y', items: left, spare },
    { x: dL + c, y: bh, w: dR, h: Lm, along: 'y', items: right, spare },
  ];

  if (shape !== 'long') {
    // Ala de serviço a leste, saindo da cozinha.
    const dS = 3;
    const items: Spec[] = shuffle(r, [
      { kind: 'lavanderia', len: randInt(r, 2, 3) }, { kind: 'despensa', len: 2 }, { kind: 'banheiro', len: 2 },
      ...(r() < 0.5 ? [quarto(3)] : [{ kind: 'deposito' as const, len: 3 }]),
    ]);
    const Ls = sum(items);
    halls.push({ x: W, y: dS, w: Ls, h: c });
    bands.push({ x: W, y: 0, w: Ls, h: dS, along: 'x', items, spare: 'deposito' });
  }
  if (shape === 'T' && westQ > 0) {
    // Ala oeste de quartos, saindo do jantar.
    const t: Spec[] = [{ kind: 'banheiro', len: D.ban() }];
    const b: Spec[] = [];
    balance(Array.from({ length: westQ }, () => [quarto(D.q())]), [b, t]);
    const Lw = Math.max(sum(t), sum(b));
    const dT2 = 3;
    const dB2 = D.qd();
    halls.push({ x: -Lw, y: dT2, w: Lw, h: c });
    bands.push(
      { x: -Lw, y: 0, w: Lw, h: dT2, along: 'x', rev: true, items: t, spare },
      { x: -Lw, y: dT2 + c, w: Lw, h: dB2, along: 'x', rev: true, items: b, spare },
    );
  }
  return { rooms, halls, bands, entry: entrada, back: [coz] };
}

/** Estalagem: taverna na frente, cozinha e despensa atrás, corredor de quartos ao lado. */
function estalagem(k: number, shape: Shape, c: number, size: HouseSize, D: Dims, r: SeededRng): Blueprint {
  const dT = D.qd();
  const dB = D.qd();
  const Dw = dT + c + dB;
  const tw = size === 'compacto' ? randInt(r, 6, 7) : size === 'amplo' ? randInt(r, 9, 11) : randInt(r, 7, 9);
  const ext = shape === 'L' ? randInt(r, 2, 4) : Math.max(0, dT + 5 - Dw);
  const Hh = Dw + ext;
  const taverna: Room = { x: -tw, y: dT, w: tw, h: Hh - dT, kind: 'taverna' };
  const coz: Room = { x: -tw + 2, y: 0, w: tw - 2, h: dT, kind: 'cozinha' };
  const rooms: Room[] = [taverna, { x: -tw, y: 0, w: 2, h: dT, kind: 'despensa' }, coz];
  const two = shape === 'long' && k >= 4;
  const wings = two ? [Math.ceil(k / 2), Math.floor(k / 2)] : [k];
  const halls: Rect[] = [];
  const bands: Band[] = [];
  wings.forEach((nq, wi) => {
    const t: Spec[] = [];
    const b: Spec[] = [];
    const groups = Array.from({ length: nq }, () => [quarto(D.q())]);
    for (let i = 0; i < Math.max(1, Math.round(nq / 5)); i++) groups.splice(randInt(r, 0, groups.length), 0, [{ kind: 'banheiro', len: 2 }]);
    balance(groups, [t, b]);
    const L = Math.max(sum(t), sum(b), 2);
    const x = wi === 0 ? 0 : -tw - L;
    halls.push({ x, y: dT, w: L, h: c });
    bands.push(
      { x, y: 0, w: L, h: dT, along: 'x', rev: wi === 1, items: t, spare: 'deposito' },
      { x, y: dT + c, w: L, h: dB, along: 'x', rev: wi === 1, items: b, spare: 'deposito' },
    );
  });
  return { rooms, halls, bands, entry: taverna, back: [coz] };
}

/** Quartos de hóspede, todos do mesmo tamanho (com banheiro nos fundos, se privativo). */
function guestQuota(n: number, q: number, priv: boolean): Quota {
  let left = n;
  return {
    peek: () => (left > 0 ? { kind: 'quarto', len: q, bath: priv ? 2 : 0 } : null),
    take: () => { left--; },
  };
}

/** Divide `k` entre as faixas, proporcional ao que cabe em cada uma. */
function apportion(k: number, caps: number[]): number[] {
  const total = caps.reduce((s, x) => s + x, 0);
  if (!total) return caps.map(() => 0);
  const t = Math.min(k, total);
  const exact = caps.map((c) => (t * c) / total);
  const out = exact.map(Math.floor);
  let rem = t - out.reduce((s, x) => s + x, 0);
  const order = caps.map((_, i) => i).sort((a, b) => (exact[b] - out[b]) - (exact[a] - out[a]));
  for (const i of order) {
    if (rem <= 0) break;
    if (out[i] < caps[i]) { out[i]++; rem--; }
  }
  return out;
}

/** Menor número de quartos para cada formato de hotel. */
const HOTEL_MIN: Record<Shape, number> = { long: 0, square: 0, L: 8, T: 10, U: 16 };

const fitsBox = (bb: Rect, box: Rect) => (bb.w <= box.w && bb.h <= box.h) || (bb.h <= box.w && bb.w <= box.h);

/** Hotel: corredor principal com a recepção na frente; L, T e U ganham corredores saindo dele. */
function hotel(k: number, shape: Shape, c: number, size: HouseSize, D: Dims, r: SeededRng, box: Rect): Blueprint {
  const priv = size !== 'compacto';
  const q = D.q();
  const d = D.qd() + (priv ? 2 : 0);
  const small = k < 8;
  // Recepção (avança um pouco para a rua), restaurante, cozinha e gerência na faixa da frente.
  const front: Array<{ kind: RoomKind; w: number; h: number }> = [
    { kind: 'cozinha', w: D.coz(), h: d },
    { kind: 'jantar', w: small ? D.jan() + 1 : D.sala() + 1, h: d },
    { kind: 'recepcao', w: small ? D.sala() - 1 : D.sala(), h: d + randInt(r, 1, 2) },
    ...(small ? [] : [{ kind: 'escritorio' as const, w: 3, h: d }]),
  ];
  if (r() < 0.5) front.reverse();
  const hubW = front.reduce((s, x) => s + x.w, 0);
  const lav = 3;
  // Sem banheiro privativo: banheiros coletivos, um para cada seis quartos.
  const baths = priv ? 0 : Math.ceil(k / 6);
  const branchXs = (Lm: number) => (shape === 'U' ? [d, Lm - d - c] : shape === 'L' ? [Lm - d - c] : shape === 'T' ? [Math.floor((Lm - c) / 2)] : []);

  const geom = (Lm: number, Lb: number): Blueprint => {
    const rooms: Room[] = [];
    let x = shape === 'L' ? 0 : Math.floor((Lm - hubW) / 2);
    let recepcao: Room | null = null;
    let coz: Room | null = null;
    for (const f of front) {
      const rm: Room = { x, y: d + c, w: f.w, h: f.h, kind: f.kind };
      rooms.push(rm);
      if (f.kind === 'recepcao') recepcao = rm;
      if (f.kind === 'cozinha') coz = rm;
      x += f.w;
    }
    const halls: Rect[] = [{ x: 0, y: d, w: Lm, h: c }];
    const bands: Band[] = [
      { x: 0, y: 0, w: Lm, h: d, along: 'x', items: [{ kind: 'lavanderia', len: lav }], spare: 'deposito' },
      { x: 0, y: d + c, w: Lm, h: d, along: 'x', items: [], spare: 'deposito' },
    ];
    // Corredores para o norte, saindo do principal.
    for (const bx of branchXs(Lm)) {
      halls.push({ x: bx, y: -Lb, w: c, h: Lb + d });
      bands.push(
        { x: bx - d, y: -Lb, w: d, h: Lb, along: 'y', rev: true, items: [], spare: 'deposito' },
        { x: bx + c, y: -Lb, w: d, h: Lb, along: 'y', rev: true, items: [], spare: 'deposito' },
      );
    }
    for (let i = 0; i < baths; i++) bands[i % bands.length].items.push({ kind: 'banheiro', len: 2 });
    return { rooms, halls, bands, entry: recepcao!, back: [coz!] };
  };
  const caps = (bp: Blueprint) => bp.bands.map((b) => capacity(b, [...bp.rooms, ...bp.halls], q));

  // Corredores crescendo um quadrado por vez até caberem os quartos pedidos.
  const branched = shape !== 'long' && shape !== 'square';
  const share = shape === 'U' ? 0.4 : 0.6;
  let Lm = Math.max(hubW + q, 2 * d + c, shape === 'U' ? 4 * d + 2 * c + 3 : 0, shape === 'T' ? 2 * d + c + 2 : 0);
  let Lb = q;
  let bp = geom(Lm, Lb);
  let cs = caps(bp);
  for (let guard = 0; guard < 160; guard++) {
    const total = cs.reduce((s, x) => s + x, 0);
    if (total >= k || !fitsBox(bbox(bp), box)) break;
    const main = cs[0] + cs[1];
    if (!branched || main / share < (total - main) / (1 - share)) Lm++;
    else Lb++;
    bp = geom(Lm, Lb);
    cs = caps(bp);
  }
  const quotas = apportion(k, cs);
  bp.bands.forEach((b, i) => { b.fill = guestQuota(quotas[i], q, priv); });
  return bp;
}

function blueprint(model: HouseModel, k: number, shape: Shape, p: MapGenParams, size: HouseSize, r: SeededRng, box: Rect): Blueprint {
  const D = dims(size, r);
  const c = p.corridor;
  switch (model) {
    case 'casebre': return casebre(k, D, r);
    case 'casarao': return casarao(k, shape, c, D, r);
    case 'estalagem': return estalagem(k, shape, c, size, D, r);
    case 'hotel': return hotel(k, k >= HOTEL_MIN[shape] ? shape : 'long', c, size, D, r, box);
    default: return casa(k, shape, c, size, D, r);
  }
}

// ── Montagem ────────────────────────────────────────────────────────────────

/** Comprimento de `a` e `b` que se sobrepõe no eixo. */
const overlap = (a0: number, al: number, b0: number, bl: number) => Math.min(a0 + al, b0 + bl) - Math.max(a0, b0);

/** Pedaços livres da faixa (fora dos obstáculos), na ordem de corte. */
function bandPieces(band: Band, obstacles: Rect[]): Rect[] {
  let pieces: Rect[] = [band];
  for (const o of obstacles) pieces = pieces.flatMap((pc) => subtract(pc, o));
  const ax = band.along === 'x';
  return pieces.sort((a, b) => (ax ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x) * (band.rev ? -1 : 1));
}

/** Quantos quartos de comprimento `q` cabem na faixa, depois dos pedidos dela. */
function capacity(band: Band, obstacles: Rect[], q: number): number {
  const ax = band.along === 'x';
  const queue = band.items.map((s) => s.len);
  let cap = 0;
  for (const pc of bandPieces(band, obstacles)) {
    if ((ax ? pc.h : pc.w) < 2) continue;
    const len = ax ? pc.w : pc.h;
    let used = 0;
    while (queue.length && used + queue[0] <= len) used += queue.shift()!;
    cap += Math.floor((len - used) / q);
  }
  return cap;
}

/** Corta as faixas em cômodos. Pedaço de faixa que sobra fino vira corredor ou é engolido pelo vizinho. */
function realize(bp: Blueprint): { rooms: Room[]; halls: Rect[] } {
  const rooms = [...bp.rooms];
  const halls = [...bp.halls];
  const slivers: Rect[] = [];
  const hallTouch = (rm: Rect) => halls.some((hl) => touches(hl, rm));
  for (const band of bp.bands) {
    const pieces = bandPieces(band, [...rooms, ...halls]);
    const ax = band.along === 'x';
    const queue = [...band.items];
    for (const pc of pieces) {
      const len = ax ? pc.w : pc.h;
      const depth = ax ? pc.h : pc.w;
      if (depth < 2) { slivers.push(pc); continue; }
      const placed: Spec[] = [];
      let used = 0;
      while (queue.length) {
        let n = 1;
        while (n < queue.length && queue[n].suite) n++;
        const ul = sum(queue.slice(0, n));
        if (used + ul > len) break;
        placed.push(...queue.splice(0, n));
        used += ul;
      }
      if (!queue.length && band.fill) {
        for (let s = band.fill.peek(); s && used + s.len <= len; s = band.fill.peek()) {
          placed.push({ ...s });
          used += s.len;
          band.fill.take();
        }
      }
      let rest = len - used;
      if (rest >= 3 || (rest >= 2 && !placed.length)) {
        placed.push({ kind: band.spare, len: rest });
        rest = 0;
      }
      if (!placed.length) { slivers.push(pc); continue; }
      // Sobra pequena: alarga os cômodos (quartos primeiro, banheiros por último).
      const grow = placed.filter((s) => !s.suite && s.kind !== 'banheiro');
      const pool = grow.length ? grow : placed.filter((s) => !s.suite);
      for (let i = 0; rest > 0 && pool.length; i++, rest--) pool[i % pool.length].len++;

      const made: Room[] = [];
      let off = 0;
      for (const s of placed) {
        const a = band.rev ? len - off - s.len : off;
        const rc = ax ? { x: pc.x + a, y: pc.y, w: s.len, h: pc.h } : { x: pc.x, y: pc.y + a, w: pc.w, h: s.len };
        const rm: Room = { ...rc, kind: s.kind };
        if (s.suite && made.length) rm.owner = made[made.length - 1];
        if (s.bath) rm.bath = s.bath;
        made.push(rm);
        off += s.len;
      }
      if (band.rev) made.reverse();
      // Quarto ou banheiro sem corredor na porta (canto de corredor): junta com o vizinho.
      for (let changed = true; changed && made.length > 1;) {
        changed = false;
        for (let i = 0; i < made.length; i++) {
          const rm = made[i];
          if (rm.owner || (rm.kind !== 'quarto' && rm.kind !== 'banheiro') || hallTouch(rm)) continue;
          const cand = [made[i - 1], made[i + 1]].filter((x): x is Room => !!x && !x.owner);
          const to = cand.find(hallTouch) ?? cand[0];
          if (!to) continue;
          const x1 = Math.min(to.x, rm.x);
          const y1 = Math.min(to.y, rm.y);
          to.w = Math.max(to.x + to.w, rm.x + rm.w) - x1;
          to.h = Math.max(to.y + to.h, rm.y + rm.h) - y1;
          to.x = x1;
          to.y = y1;
          if (to.kind === 'banheiro' && rm.kind === 'quarto') to.kind = 'quarto';
          to.bath = to.bath || rm.bath;
          for (const o of made) if (o.owner === rm) o.owner = to;
          made.splice(i, 1);
          changed = true;
          break;
        }
      }
      // Banheiro privativo nos fundos do quarto (do lado oposto ao corredor).
      for (const rm of [...made]) {
        const b = rm.bath;
        delete rm.bath;
        if (!b || (ax ? rm.h : rm.w) - b < 3) continue;
        const low = halls.some((hl) => (ax
          ? hl.y + hl.h === rm.y && overlap(hl.x, hl.w, rm.x, rm.w) > 0
          : hl.x + hl.w === rm.x && overlap(hl.y, hl.h, rm.y, rm.h) > 0));
        const high = halls.some((hl) => (ax
          ? hl.y === rm.y + rm.h && overlap(hl.x, hl.w, rm.x, rm.w) > 0
          : hl.x === rm.x + rm.w && overlap(hl.y, hl.h, rm.y, rm.h) > 0));
        if (low === high) continue;
        let bathRect: Rect;
        if (ax) {
          bathRect = { x: rm.x, y: low ? rm.y + rm.h - b : rm.y, w: rm.w, h: b };
          rm.h -= b;
          if (!low) rm.y += b;
        } else {
          bathRect = { x: low ? rm.x + rm.w - b : rm.x, y: rm.y, w: b, h: rm.h };
          rm.w -= b;
          if (!low) rm.x += b;
        }
        made.push({ ...bathRect, kind: 'banheiro', owner: rm });
      }
      rooms.push(...made);
    }
  }
  for (const s of slivers) {
    if (hallTouch(s)) { halls.push(s); continue; }
    const n = rooms.find((o) => !o.owner && (
      (o.y === s.y && o.h === s.h && (o.x + o.w === s.x || s.x + s.w === o.x))
      || (o.x === s.x && o.w === s.w && (o.y + o.h === s.y || s.y + s.h === o.y))));
    if (n) {
      const x1 = Math.min(n.x, s.x);
      const y1 = Math.min(n.y, s.y);
      n.w = Math.max(n.x + n.w, s.x + s.w) - x1;
      n.h = Math.max(n.y + n.h, s.y + s.h) - y1;
      n.x = x1;
      n.y = y1;
    } else {
      rooms.push({ ...s, kind: 'despensa' });
    }
  }
  return { rooms, halls };
}

function bbox(bp: Blueprint): Rect {
  const all: Rect[] = [...bp.rooms, ...bp.halls, ...bp.bands];
  const x1 = Math.min(...all.map((a) => a.x));
  const y1 = Math.min(...all.map((a) => a.y));
  const x2 = Math.max(...all.map((a) => a.x + a.w));
  const y2 = Math.max(...all.map((a) => a.y + a.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Giro e espelho que fazem a planta caber no mapa, centrada. */
function fitFrame(bb: Rect, box: Rect, r: SeededRng): Frame | null {
  const opts: boolean[] = [];
  if (bb.w <= box.w && bb.h <= box.h) opts.push(false);
  if (bb.h <= box.w && bb.w <= box.h) opts.push(true);
  if (!opts.length) return null;
  const transpose = pick(r, opts);
  const fw = transpose ? bb.h : bb.w;
  const fh = transpose ? bb.w : bb.h;
  return {
    W: bb.w, H: bb.h, flipX: r() < 0.5, flipY: r() < 0.5, transpose,
    ox: box.x + Math.floor((box.w - fw) / 2), oy: box.y + Math.floor((box.h - fh) / 2),
  };
}

// ── Portas ──────────────────────────────────────────────────────────────────

type Node = RoomKind | 'hall';

/** Cômodos sociais: abrem um para o outro em vão largo. */
const SOCIAL = new Set<Node>(['sala', 'jantar', 'entrada', 'recepcao', 'taverna']);
const SERVICE = new Set<Node>(['despensa', 'lavanderia', 'deposito']);

/** Custo de `u` ganhar a passagem para `v` (menor é melhor). Nunca se passa por banheiro. */
function accessCost(u: Node, v: Node): number {
  if (v === 'banheiro') return 300;
  if (u === 'hall') return SOCIAL.has(v) ? 0 : v === 'cozinha' ? 6 : 40;
  if (v === 'hall') return SOCIAL.has(u) ? 1 : u === 'cozinha' ? 3 : 0.5;
  switch (u) {
    case 'quarto':
      if (SOCIAL.has(v)) return v === 'jantar' ? 6 : v === 'taverna' ? 8 : 3;
      // Pela cozinha (cômodo principal do casebre) antes de por dentro de outro quarto.
      return v === 'cozinha' || v === 'cabana' ? 20 : v === 'quarto' ? 30 : v === 'escritorio' || v === 'biblioteca' ? 25 : 60;
    case 'banheiro': return v === 'quarto' ? 8 : SOCIAL.has(v) ? 4 : v === 'cozinha' || v === 'lavanderia' ? 10 : 50;
    case 'escritorio': case 'biblioteca': return SOCIAL.has(v) ? 2 : v === 'quarto' ? 20 : 40;
    case 'cozinha': return v === 'jantar' || v === 'taverna' ? 0.5 : SOCIAL.has(v) ? 1.5 : SERVICE.has(v) ? 20 : 40;
    case 'despensa': case 'lavanderia': case 'deposito': return v === 'cozinha' ? 0.5 : SOCIAL.has(v) ? 6 : SERVICE.has(v) ? 10 : 40;
    case 'jantar': return v === 'sala' || v === 'entrada' || v === 'recepcao' ? 0.5 : v === 'cozinha' ? 1.5 : 10;
    case 'sala': return v === 'entrada' ? 0.2 : SOCIAL.has(v) ? 0.5 : v === 'cozinha' ? 2 : 20;
    default: return SOCIAL.has(v) ? 1 : 20;
  }
}

const OPPOSITE: Record<Dir, Dir> = { n: 's', s: 'n', e: 'w', w: 'e' };

/** A linha do trecho fica no lado `d` do cômodo. */
function onSide(rm: Rect, run: EdgeRef[], d: Dir): boolean {
  const e = run[0];
  switch (d) {
    case 's': return e.o === 'h' && e.y === rm.y + rm.h;
    case 'n': return e.o === 'h' && e.y === rm.y;
    case 'e': return e.o === 'v' && e.x === rm.x + rm.w;
    default: return e.o === 'v' && e.x === rm.x;
  }
}

function finish(p: MapGenParams, r: SeededRng, f: Frame, bb: Rect, built: { rooms: Room[]; halls: Rect[] }, bp: Blueprint): GenBase {
  const { w, h } = p;
  const place = (rc: Rect) => mapRect(f, { x: rc.x - bb.x, y: rc.y - bb.y, w: rc.w, h: rc.h });
  const src = built.rooms;
  const rooms: GenRoom[] = src.map((rm) => ({ ...place(rm), kind: rm.kind }));
  const id = new Map(src.map((rm, i) => [rm, i + 1]));
  const owner = src.map((rm) => (rm.owner ? id.get(rm.owner) ?? 0 : 0));
  // Regiões: cômodo k → k + 1; cada grupo de corredores ligados → uma região depois dos cômodos.
  const n = rooms.length;
  const plan = new Plan(w, h);
  const groups = hallGroups(built.halls);
  groups.forEach((g, j) => { for (const hl of g) plan.fill(place(hl), n + 1 + j); });
  rooms.forEach((rm, i) => plan.fill(rm, i + 1));
  const layout = plan.toLayout('floor');
  const doors: EdgeRef[] = [];
  const adj = plan.adjacency();
  const nb = (a: number) => adj.get(a) ?? new Set<number>();
  const kind = (x: number): Node => (x > n ? 'hall' : rooms[x - 1].kind);
  const cost = (u: number, v: number) => {
    if (u <= n && owner[u - 1]) return v === owner[u - 1] ? 0 : 500;
    return accessCost(kind(u), kind(v));
  };

  const linked = new Set<string>();
  const link = (a: number, b: number) => {
    const run = longest(plan.runs(a, b), r);
    if (!run) return false;
    const ka = kind(a);
    const kb = kind(b);
    let door: boolean;
    let width = 1;
    if (SOCIAL.has(ka) && SOCIAL.has(kb)) {
      door = false;
      width = run.length >= 5 ? Math.min(3, run.length - 2) : Math.min(2, run.length);
    } else if ((ka === 'hall' && SOCIAL.has(kb)) || (kb === 'hall' && SOCIAL.has(ka))) {
      door = r() < p.doors * 0.2;
      width = door ? 1 : Math.min(p.corridor, run.length);
    } else if ((ka === 'cozinha' && (SOCIAL.has(kb) || kb === 'hall')) || (kb === 'cozinha' && (SOCIAL.has(ka) || ka === 'hall'))) {
      door = r() < p.doors * 0.6;
      width = door ? 1 : Math.min(2, run.length);
    } else {
      door = r() < p.doors;
    }
    passage(layout, doors, pickSpan(run, width, r), door);
    linked.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
    return true;
  };

  // Árvore de passagens a partir da entrada, sempre pela ligação mais barata.
  const entry = id.get(bp.entry)!;
  const all = [...rooms.map((_, i) => i + 1), ...groups.map((_, j) => n + 1 + j)];
  const reached = new Set([entry]);
  for (let guard = 0; guard < all.length; guard++) {
    let best: [number, number] | null = null;
    let bestCost = Infinity;
    for (const u of all) {
      if (reached.has(u)) continue;
      for (const v of nb(u)) {
        if (v < 0 || !reached.has(v)) continue;
        const cst = cost(u, v);
        if (cst < bestCost) { bestCost = cst; best = [u, v]; }
      }
    }
    if (!best) break;
    link(best[0], best[1]);
    reached.add(best[0]);
  }
  // Na parte social, às vezes mais um vão (sala com jantar, jantar com cozinha...).
  for (let a = 1; a <= rooms.length; a++) {
    for (const b of nb(a)) {
      if (b <= a || linked.has(`${a}:${b}`)) continue;
      const ka = kind(a);
      const kb = kind(b);
      const social = (SOCIAL.has(ka) && SOCIAL.has(kb)) || (ka === 'cozinha' && SOCIAL.has(kb)) || (kb === 'cozinha' && SOCIAL.has(ka));
      if (social && r() < 0.5) link(a, b);
    }
  }

  // Porta da frente na fachada; porta dos fundos na cozinha ou lavanderia, às vezes.
  const front = mapDir(f, 's');
  const er = rooms[entry - 1];
  const ext = plan.runs(entry, -1);
  const main = longest(ext.filter((run) => onSide(er, run, front)), r) ?? longest(ext, r);
  const wide = main && main.length >= 5 && SOCIAL.has(kind(entry)) && kind(entry) !== 'sala';
  if (main) passage(layout, doors, pickSpan(main, wide ? 2 : 1, r), true);
  if (r() < 0.6) {
    for (const rm of bp.back) {
      const b = id.get(rm);
      if (!b) continue;
      const runs = plan.runs(b, -1).filter((run) => !onSide(rooms[b - 1], run, front));
      const back = longest(runs.filter((run) => onSide(rooms[b - 1], run, OPPOSITE[front])), r) ?? longest(runs, r);
      if (!back) continue;
      passage(layout, doors, pickSpan(back, 1, r), true);
      break;
    }
  }

  const zone = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) zone[i] = plan.region[i] < 0 ? ZONE.outside : plan.region[i] > n ? ZONE.corridor : ZONE.room;
  return { layout, rooms, doors, zone };
}

/** Corredores que se encostam formam um grupo só. */
function hallGroups(halls: Rect[]): Rect[][] {
  const g = halls.map((_, i) => i);
  const find = (i: number): number => (g[i] === i ? i : (g[i] = find(g[i])));
  for (let i = 0; i < halls.length; i++) for (let j = i + 1; j < halls.length; j++) if (touches(halls[i], halls[j])) g[find(i)] = find(j);
  const out = new Map<number, Rect[]>();
  halls.forEach((hl, i) => {
    const k = find(i);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(hl);
  });
  return [...out.values()];
}

// ── Entrada ─────────────────────────────────────────────────────────────────

const SIZE_ORDER: HouseSize[] = ['amplo', 'normal', 'compacto'];

export function generateHouse(p: MapGenParams, seed: number): GenBase & { model: HouseModel; shape: Shape } {
  const box = { x: 1, y: 1, w: p.w - 2, h: p.h - 2 };
  const sizes = SIZE_ORDER.slice(SIZE_ORDER.indexOf(p.size));
  // Não coube: primeiro cômodos menores, depois outro sorteio.
  const attempt = (model: HouseModel, k: number) => {
    const info = HOUSE_MODELS[model];
    for (let si = 0; si < sizes.length; si++) {
      for (let t = 0; t < 3; t++) {
        const r = mulberry32((seed ^ Math.imul(k + 1, 0x9e3779b1) ^ Math.imul(si * 3 + t + 1, 0x85ebca6b)) >>> 0);
        const shape: Shape = p.shape === 'random' || !info.shapes.includes(p.shape) ? pick(r, info.shapes) : p.shape;
        const bp = blueprint(model, k, shape, p, sizes[si], r, box);
        const bb = bbox(bp);
        const f = fitFrame(bb, box, r);
        if (!f) continue;
        return { ...finish(p, r, f, bb, realize(bp), bp), model, shape };
      }
    }
    return null;
  };
  // Ainda não coube: o maior número de quartos que cabe (busca binária).
  const tryModel = (model: HouseModel, kFrom: number) => {
    const first = attempt(model, kFrom);
    if (first) return first;
    let lo = HOUSE_MODELS[model].rooms[0];
    let hi = kFrom - 1;
    let best: ReturnType<typeof attempt> = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const res = attempt(model, mid);
      if (res) { best = res; lo = mid + 1; } else hi = mid - 1;
    }
    return best;
  };
  // Um casebre sem quartos cabe em qualquer mapa aceito.
  return tryModel(p.model, p.rooms) ?? tryModel('casebre', Math.min(p.rooms, 2)) ?? tryModel('casebre', 0)!;
}
