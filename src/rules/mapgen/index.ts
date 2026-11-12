// Gerador de mapas: escolhe o gerador do tipo pedido e, se pedido, mobilia. Puro e com semente:
// a prévia do mestre e o motor chegam ao mesmo mapa.
import type { EdgeRef, MapGenParams } from '../../model/types';
import { TERRAIN_CHAR } from '../../model/types';
import { generateDungeon } from '../dungeon';
import { mulberry32 } from '../random';
import { putStairs, stairSpot, voidOutside } from './floors';
import { furnish, type FurnishOptions, type GenProp } from './furnish';
import { generateHouse } from './house';
import { type GenLight, illuminate } from './lights';
import { generateOutdoor } from './outdoor';
import { cleanMapParams } from './params';
import { type GenBase, type GenRoom, ROOM_KINDS, type RoomKind, ZONE } from './shared';
import { generateTemple } from './temple';

export { cleanMapParams, GEN_MIN_SIDE, houseModelDefaults, MAP_GEN_DEFAULTS, maxFloors, newMapSize, PRESET_DEFAULTS } from './params';
export type { GenProp } from './furnish';
export type { GenLight } from './lights';
export { ROOM_KINDS, type GenRoom, type RoomKind } from './shared';

export interface GeneratedMap extends GenBase {
  params: MapGenParams;
  props: GenProp[];
  windows: EdgeRef[];
  lights: GenLight[];
  /** Quadrados a céu aberto ('1'), quando há janelas e luzes. */
  outside?: string;
}

/** Teto de objetos do mapa (portas + móveis + janelas + luzes) é 500; sobra folga para o mestre. */
const OBJECT_BUDGET = 480;

function dungeonBase(p: MapGenParams, seed: number): GenBase {
  const d = generateDungeon(p, seed);
  const { w, h, cells } = d.layout;
  const zone = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) zone[i] = cells[i] === TERRAIN_CHAR.void ? ZONE.none : ZONE.corridor;
  const rooms: GenRoom[] = d.rooms.map((rm) => ({ ...rm, kind: 'generic' }));
  for (const rm of rooms) for (let y = rm.y; y < rm.y + rm.h; y++) for (let x = rm.x; x < rm.x + rm.w; x++) zone[y * w + x] = ZONE.room;
  return { layout: d.layout, rooms, doors: d.doors, zone };
}

/** Móveis, janelas e luzes sobre a planta. `upper`: andar de cima (sem quintal; o quintal vira vazio no fim). */
function dress(base: GenBase, p: MapGenParams, seed: number, opts: FurnishOptions & { upper?: boolean } = {}): GeneratedMap {
  // Sorteio separado: ligar a mobília não muda a planta.
  const props = p.furnish ? furnish(base, p.preset, mulberry32((seed ^ 0x5bd1e995) >>> 0), { ...opts, yard: !opts.upper }) : [];
  // Outro sorteio: ligar janelas e luzes não muda planta nem móveis.
  const lit = p.lights
    ? illuminate(base, props, p.preset, mulberry32((seed ^ 0x27d4eb2f) >>> 0), Math.max(0, OBJECT_BUDGET - base.doors.length - props.length))
    : { windows: [], lights: [] };
  const out: GeneratedMap = { layout: base.layout, rooms: base.rooms, doors: base.doors, zone: base.zone, params: p, props, ...lit };
  if (opts.upper) {
    // As janelas foram postas com o quintal aberto; agora ele vira vazio (e segue céu aberto, para a luz entrar).
    voidOutside(base);
    const open = (x: number, y: number) => base.layout.cells[y * base.layout.w + x] !== TERRAIN_CHAR.void;
    out.lights = out.lights.filter((l) => open(l.x, l.y));
    out.props = out.props.filter((pr) => open(pr.x, pr.y));
  }
  return out;
}

function baseFor(p: MapGenParams, seed: number): GenBase {
  return p.preset === 'house' ? generateHouse(p, seed)
    : p.preset === 'temple' ? generateTemple(p, seed)
    : p.preset === 'outdoor' ? generateOutdoor(p, seed)
    : dungeonBase(p, seed);
}

/** Um andar só (o gerador do editor e a prévia do primeiro andar de uma masmorra). */
export function generateMap(raw: Partial<MapGenParams>, seed: number): GeneratedMap {
  const p = cleanMapParams(raw);
  return dress(baseFor(p, seed), p, seed);
}

export interface GeneratedFloor extends GeneratedMap {
  /** "Térreo", "1º andar", "Nível 2"... Vazio com um andar só. */
  label: string;
  /** Quadrados (y*w+x) da escada que liga a este andar de cima ou de baixo. */
  stairs: number[];
}

export function floorLabel(preset: MapGenParams['preset'], level: number): string {
  if (preset === 'dungeon') return `Nível ${level + 1}`;
  return level === 0 ? 'Térreo' : `${level}º andar`;
}

const floorSeed = (seed: number, level: number, attempt = 0) =>
  (seed ^ Math.imul(level + 1, 0x632be5ab) ^ Math.imul(attempt, 0x7feb352d)) >>> 0;

/**
 * Todos os andares, de baixo para cima na casa (térreo primeiro) e de cima para baixo na
 * masmorra (nível 1 é a entrada). Cada par de andares vizinhos tem uma escada nos mesmos quadrados.
 */
export function generateFloors(raw: Partial<MapGenParams>, seed: number): GeneratedFloor[] {
  const p = cleanMapParams(raw);
  const n = p.floors ?? 1;
  if (n <= 1) return [{ ...generateMap(p, seed), label: '', stairs: [] }];
  const r = mulberry32((seed ^ 0x1b873593) >>> 0);
  const bases: GenBase[] = [];
  const stairs: number[][] = [];

  if (p.preset === 'house') {
    // Mesma semente, mesma planta: uma escada só, no cômodo da entrada, atravessa todos os andares.
    const houses = Array.from({ length: n }, (_, k) => generateHouse(p, seed, k));
    bases.push(...houses);
    const entry = houses[0].rooms[houses[0].entry];
    const spot = stairSpot(bases, r, entry) ?? [];
    putStairs(bases, spot);
    for (let k = 0; k < n; k++) stairs.push(spot);
  } else {
    // Masmorra: cada nível é outro; a escada para baixo fica onde os dois níveis têm sala.
    bases.push(dungeonBase(p, seed));
    stairs.push([]);
    for (let k = 1; k < n; k++) {
      const upper = bases[k - 1];
      let lower: GenBase | null = null;
      let spot: number[] | null = null;
      for (let t = 0; t < 16 && !spot; t++) {
        lower = dungeonBase(p, floorSeed(seed, k, t));
        spot = stairSpot([upper, lower], r, undefined, stairs[k - 1]);
      }
      if (!spot) {
        // Sem lugar comum: uma escada em cada nível, cada uma onde der.
        lower = dungeonBase(p, floorSeed(seed, k));
        const a = stairSpot([upper], r, undefined, stairs[k - 1]) ?? [];
        const b = stairSpot([lower], r) ?? [];
        putStairs([upper], a);
        putStairs([lower], b);
        stairs[k - 1] = [...stairs[k - 1], ...a];
        stairs.push(b);
      } else {
        putStairs([upper, lower!], spot);
        stairs[k - 1] = [...stairs[k - 1], ...spot];
        stairs.push([...spot]);
      }
      bases.push(lower!);
    }
  }

  return bases.map((b, k) => {
    const fs = k === 0 ? seed : floorSeed(seed, k);
    const opts = p.preset === 'house' ? { upper: k > 0 } : { stairs: k === 0 ? 'entry' as const : 'none' as const };
    return { ...dress(b, p, fs, opts), label: floorLabel(p.preset, k), stairs: stairs[k] };
  });
}

/** "sala de estar, cozinha, 3 quartos e banheiro". */
export function describeRooms(rooms: GenRoom[]): string {
  const count = new Map<RoomKind, number>();
  for (const rm of rooms) count.set(rm.kind, (count.get(rm.kind) ?? 0) + 1);
  const parts = [...count].map(([k, n]) => (n === 1 ? ROOM_KINDS[k].one : `${n} ${ROOM_KINDS[k].many}`));
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}
