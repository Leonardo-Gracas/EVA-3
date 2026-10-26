// Gerador de mapas: escolhe o gerador do tipo pedido e, se pedido, mobilia. Puro e com semente:
// a prévia do mestre e o motor chegam ao mesmo mapa.
import type { MapGenParams } from '../../model/types';
import { TERRAIN_CHAR } from '../../model/types';
import { generateDungeon } from '../dungeon';
import { mulberry32 } from '../random';
import { furnish, type GenProp } from './furnish';
import { generateHouse } from './house';
import { generateOutdoor } from './outdoor';
import { cleanMapParams } from './params';
import { type GenBase, type GenRoom, ROOM_KINDS, type RoomKind, ZONE } from './shared';
import { generateTemple } from './temple';

export { cleanMapParams, GEN_MIN_SIDE, MAP_GEN_DEFAULTS, PRESET_DEFAULTS } from './params';
export type { GenProp } from './furnish';
export { ROOM_KINDS, type GenRoom, type RoomKind } from './shared';

export interface GeneratedMap extends GenBase {
  params: MapGenParams;
  props: GenProp[];
}

function dungeonBase(p: MapGenParams, seed: number): GenBase {
  const d = generateDungeon(p, seed);
  const { w, h, cells } = d.layout;
  const zone = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) zone[i] = cells[i] === TERRAIN_CHAR.void ? ZONE.none : ZONE.corridor;
  const rooms: GenRoom[] = d.rooms.map((rm) => ({ ...rm, kind: 'generic' }));
  for (const rm of rooms) for (let y = rm.y; y < rm.y + rm.h; y++) for (let x = rm.x; x < rm.x + rm.w; x++) zone[y * w + x] = ZONE.room;
  return { layout: d.layout, rooms, doors: d.doors, zone };
}

export function generateMap(raw: Partial<MapGenParams>, seed: number): GeneratedMap {
  const p = cleanMapParams(raw);
  const base = p.preset === 'house' ? generateHouse(p, seed)
    : p.preset === 'temple' ? generateTemple(p, seed)
    : p.preset === 'outdoor' ? generateOutdoor(p, seed)
    : dungeonBase(p, seed);
  // Sorteio separado: ligar a mobília não muda a planta.
  const props = p.furnish ? furnish(base, p.preset, mulberry32((seed ^ 0x5bd1e995) >>> 0)) : [];
  return { layout: base.layout, rooms: base.rooms, doors: base.doors, zone: base.zone, params: p, props };
}

/** "sala de estar, cozinha, 3 quartos e banheiro". */
export function describeRooms(rooms: GenRoom[]): string {
  const count = new Map<RoomKind, number>();
  for (const rm of rooms) count.set(rm.kind, (count.get(rm.kind) ?? 0) + 1);
  const parts = [...count].map(([k, n]) => (n === 1 ? ROOM_KINDS[k].one : `${n} ${ROOM_KINDS[k].many}`));
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}
