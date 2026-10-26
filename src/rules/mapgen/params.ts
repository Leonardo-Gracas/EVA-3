// Parâmetros do gerador de mapas: valores padrão de cada tipo e limpeza (motor e tela usam a mesma regra).
import type { HouseShape, MapGenParams, MapPreset } from '../../model/types';
import { HOUSE_SHAPES, MAP_LIMITS, MAP_PRESETS } from '../../model/types';

type Tunables = Pick<MapGenParams, 'rooms' | 'roomMin' | 'roomMax' | 'corridor' | 'doors'>;

/** Valores sugeridos ao trocar de tipo (largura e altura ficam as do mapa). */
export const PRESET_DEFAULTS: Record<MapPreset, Tunables> = {
  dungeon: { rooms: 8, roomMin: 4, roomMax: 9, corridor: 1, doors: 0.6 },
  house: { rooms: 8, roomMin: 3, roomMax: 6, corridor: 1, doors: 0.8 },
  temple: { rooms: 6, roomMin: 3, roomMax: 6, corridor: 1, doors: 0.7 },
  outdoor: { rooms: 3, roomMin: 3, roomMax: 6, corridor: 1, doors: 0.5 },
};

export const MAP_GEN_DEFAULTS: MapGenParams = {
  preset: 'dungeon', shape: 'random', furnish: false, w: 40, h: 30, ...PRESET_DEFAULTS.dungeon,
};

/** Menor lado aceito pelo gerador. */
export const GEN_MIN_SIDE = 12;

const clampN = (v: unknown, min: number, max: number, def: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : def;
  return Math.max(min, Math.min(max, n));
};

export function cleanMapParams(raw: Partial<MapGenParams> | null | undefined): MapGenParams {
  const r = raw ?? {};
  const preset: MapPreset = typeof r.preset === 'string' && r.preset in MAP_PRESETS ? r.preset : 'dungeon';
  const shape: HouseShape = typeof r.shape === 'string' && r.shape in HOUSE_SHAPES ? r.shape : 'random';
  const d = PRESET_DEFAULTS[preset];
  const w = Math.round(clampN(r.w, GEN_MIN_SIDE, MAP_LIMITS.max, MAP_GEN_DEFAULTS.w));
  const h = Math.round(clampN(r.h, GEN_MIN_SIDE, MAP_LIMITS.max, MAP_GEN_DEFAULTS.h));
  const roomMax = Math.round(clampN(r.roomMax, 3, Math.min(20, Math.min(w, h) - 4), d.roomMax));
  return {
    preset, shape, furnish: !!r.furnish,
    w, h,
    rooms: Math.round(clampN(r.rooms, preset === 'outdoor' ? 0 : 1, preset === 'outdoor' ? 12 : 40, d.rooms)),
    roomMin: Math.round(clampN(r.roomMin, 2, roomMax, Math.min(d.roomMin, roomMax))),
    roomMax,
    corridor: Math.round(clampN(r.corridor, 1, 3, d.corridor)),
    doors: clampN(r.doors, 0, 1, d.doors),
  };
}
