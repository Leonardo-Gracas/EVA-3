// Templo: nave no sentido do lado maior, santuário com degraus no fundo, vestíbulo na entrada.
// Variações: basílica (capelas e sacristias dos dois lados, torres na fachada), cruz
// (braços do transepto abertos para a nave) e simples (só a nave). Sempre simétrico.
import type { EdgeRef, MapGenParams } from '../../model/types';
import { TERRAIN_CHAR } from '../../model/types';
import { mulberry32, type SeededRng } from '../random';
import {
  cutLengths, type Dir, frameFor, type GenBase, type GenRoom, mapDir, mapRect, passage, pickSpan, Plan,
  type Rect, type RoomKind, ZONE,
} from './shared';

const YARD = 2;

export type TempleVariant = 'basilica' | 'cruz' | 'simples';

interface Part extends Rect { kind: RoomKind; dir?: Dir; pair?: number }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Partes no quadro canônico: W estreito, H comprido, altar em cima (y = 0), entrada embaixo. */
function canonicalParts(W: number, H: number, p: MapGenParams, r: SeededRng): { parts: Part[]; variant: TempleVariant } {
  const m = p.roomMin;
  let ah = clamp(Math.round(H * 0.2), 3, 9);
  let vh = clamp(Math.round(H * 0.13), 2, 6);
  if (H - ah - vh < 4) vh = 0;
  if (H - ah - vh < 3) ah = Math.max(2, H - vh - 3);
  let sw = clamp(Math.round(W * 0.27), m, p.roomMax);
  let nw = W - 2 * sw;
  if (nw < 5) { sw = 0; nw = W; }
  const variant: TempleVariant = sw === 0 ? 'simples' : r() < 0.55 ? 'basilica' : 'cruz';
  const navH = H - ah - vh;
  const parts: Part[] = [
    { x: sw, y: 0, w: nw, h: ah, kind: 'santuario', dir: 'n' },
    { x: sw, y: ah, w: nw, h: navH, kind: 'nave', dir: 'n' },
  ];
  if (vh) parts.push({ x: sw, y: H - vh, w: nw, h: vh, kind: 'vestibulo', dir: 'n' });
  const mirror = (q: Part, pair: number) => {
    parts.push({ ...q, pair }, { ...q, x: W - q.x - q.w, pair });
  };
  if (variant === 'basilica') {
    const lens = cutLengths(H - vh, m, p.roomMax, r);
    // Variedade: embaralha uma vez e vai seguindo.
    const extras: RoomKind[] = ['capela', 'cela', 'biblioteca', 'capela', 'deposito', 'cela'];
    for (let i = extras.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [extras[i], extras[j]] = [extras[j], extras[i]];
    }
    let y = 0;
    lens.forEach((len, i) => {
      mirror({ x: 0, y, w: sw, h: len, kind: i === 0 ? 'sacristia' : extras[(i - 1) % extras.length] }, i);
      y += len;
    });
    if (vh >= 2) mirror({ x: 0, y: H - vh, w: sw, h: vh, kind: 'torre' }, lens.length);
  } else if (variant === 'cruz') {
    const tl = clamp(Math.round(navH * 0.4), 3, Math.max(3, navH - 2));
    const ty = ah + Math.max(0, Math.round((navH - tl) * 0.3));
    mirror({ x: 0, y: ty, w: sw, h: Math.min(tl, H - vh - ty), kind: 'capela' }, 0);
  }
  return { parts, variant };
}

export function generateTemple(p: MapGenParams, seed: number): GenBase & { variant: TempleVariant } {
  const r = mulberry32(seed);
  const { w, h } = p;
  const box = { x: YARD, y: YARD, w: w - 2 * YARD, h: h - 2 * YARD };
  // A nave segue o lado maior; a entrada fica de um lado ou do outro.
  const f = frameFor(box, box.w > box.h, false, r() < 0.5);
  const { parts: canon, variant } = canonicalParts(f.W, f.H, p, r);
  const parts = canon.map((q) => ({ ...q, ...mapRect(f, q), dir: q.dir && mapDir(f, q.dir) }));
  const rooms: GenRoom[] = parts.map(({ pair: _pair, ...q }) => q);
  const id = (kind: RoomKind) => rooms.findIndex((x) => x.kind === kind) + 1;

  const plan = new Plan(w, h);
  rooms.forEach((rm, i) => plan.fill(rm, i + 1));
  const layout = plan.toLayout('floor');
  const doors: EdgeRef[] = [];
  const cells = layout.cells.split('');

  const nave = id('nave');
  const sant = id('santuario');
  const vest = id('vestibulo');
  const naveRoom = rooms[nave - 1];
  const centered = (run: EdgeRef[]) => pickSpan(run, run.length % 2 ? 1 : 2, null);

  // Santuário aberto para a nave, com degraus na boca.
  const mouth = plan.runs(nave, sant)[0];
  if (mouth) {
    const open = mouth.length >= 5 ? mouth.slice(1, -1) : mouth;
    passage(layout, doors, open, false);
    const s = rooms[sant - 1];
    for (const e of open) {
      const [cx, cy] = e.o === 'h'
        ? (e.y === s.y ? [e.x, e.y] : [e.x, e.y - 1])
        : (e.x === s.x ? [e.x, e.y] : [e.x - 1, e.y]);
      cells[cy * w + cx] = TERRAIN_CHAR.stairs;
    }
  }

  // Fachada: entrada no meio da parede oposta ao altar.
  const facade = (rm: GenRoom, run: EdgeRef[]) => {
    const e = run[0];
    switch (rm.dir) {
      case 'n': return e.o === 'h' && e.y === rm.y + rm.h;
      case 's': return e.o === 'h' && e.y === rm.y;
      case 'w': return e.o === 'v' && e.x === rm.x + rm.w;
      default: return e.o === 'v' && e.x === rm.x;
    }
  };
  const entry = vest || nave;
  const front = plan.runs(entry, -1).find((run) => facade(rooms[entry - 1], run));
  if (front) passage(layout, doors, centered(front), true);
  if (vest) {
    const inner = plan.runs(vest, nave)[0];
    if (inner) passage(layout, doors, centered(inner), r() < p.doors);
  }

  // Laterais: cada par espelhado decide junto (porta ou abertura) para ficar simétrico.
  const pairDoor = new Map<number, boolean>();
  parts.forEach((q, i) => {
    if (q.pair === undefined) return;
    if (!pairDoor.has(q.pair)) pairDoor.set(q.pair, r() < p.doors);
    const k = i + 1;
    if (q.kind === 'torre') {
      const run = vest ? plan.runs(k, vest)[0] : undefined;
      if (run) passage(layout, doors, centered(run), pairDoor.get(q.pair)!);
      // Escada no canto de fora da torre.
      const corner = [[q.x, q.y], [q.x + q.w - 1, q.y], [q.x, q.y + q.h - 1], [q.x + q.w - 1, q.y + q.h - 1]]
        .sort((a, b) => dist2(b, naveRoom) - dist2(a, naveRoom))[0];
      cells[corner[1] * w + corner[0]] = TERRAIN_CHAR.stairs;
      return;
    }
    if (variant === 'cruz') {
      // Braço do transepto: arco largo para a nave.
      const run = plan.runs(k, nave)[0];
      if (run) passage(layout, doors, run.length >= 3 ? run.slice(1, -1) : run, false);
      return;
    }
    const toSant = q.kind === 'sacristia' ? plan.runs(k, sant)[0] : undefined;
    const run = toSant ?? plan.runs(k, nave)[0] ?? plan.runs(k, sant)[0];
    if (run) passage(layout, doors, centered(run), pairDoor.get(q.pair)!);
  });
  layout.cells = cells.join('');

  const zone = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) zone[i] = plan.region[i] < 0 ? ZONE.outside : ZONE.room;
  return { layout, rooms, doors, zone, variant };
}

const dist2 = ([x, y]: number[], rm: Rect) => {
  const cx = rm.x + rm.w / 2;
  const cy = rm.y + rm.h / 2;
  return (x - cx) ** 2 + (y - cy) ** 2;
};
