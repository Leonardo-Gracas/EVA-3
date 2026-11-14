// Parâmetros do gerador de mapas: valores padrão de cada tipo e limpeza (motor e tela usam a mesma regra).
import type { Exterior, HouseModel, HouseShape, HouseSize, MapGenParams, MapPreset } from '../../model/types';
import { EXTERIORS, HOUSE_MODELS, HOUSE_SHAPES, HOUSE_SIZES, MAP_LIMITS, MAP_PRESETS, MAX_FLOORS } from '../../model/types';

type Tunables = Pick<MapGenParams, 'rooms' | 'roomMin' | 'roomMax' | 'corridor' | 'doors'>;

/** Valores sugeridos ao trocar de tipo (largura e altura ficam as do mapa). */
export const PRESET_DEFAULTS: Record<MapPreset, Tunables> = {
  dungeon: { rooms: 8, roomMin: 4, roomMax: 9, corridor: 1, doors: 0.6 },
  house: { rooms: HOUSE_MODELS.casa.rooms[2], roomMin: 3, roomMax: 6, corridor: HOUSE_MODELS.casa.corridor, doors: HOUSE_MODELS.casa.doors },
  temple: { rooms: 6, roomMin: 3, roomMax: 6, corridor: 1, doors: 0.7 },
  outdoor: { rooms: 3, roomMin: 3, roomMax: 6, corridor: 1, doors: 0.5 },
  village: { rooms: 10, roomMin: 3, roomMax: 6, corridor: 1, doors: 0.8 },
};

/** Valores sugeridos ao trocar de modelo de casa. */
export function houseModelDefaults(model: HouseModel): Pick<MapGenParams, 'rooms' | 'corridor' | 'doors'> {
  const m = HOUSE_MODELS[model];
  return { rooms: m.rooms[2], corridor: m.corridor, doors: m.doors };
}

export const MAP_GEN_DEFAULTS: MapGenParams = {
  preset: 'dungeon', shape: 'random', model: 'casa', size: 'normal', furnish: false, lights: false, w: 40, h: 30, ...PRESET_DEFAULTS.dungeon,
};

/** Tamanho de um mapa novo de cada tipo: cabe o número padrão de salas ou quartos, com quintal. */
const NEW_SIZES: Record<Exclude<MapPreset, 'house'>, { w: number; h: number }> = {
  dungeon: { w: 40, h: 30 }, temple: { w: 24, h: 34 }, outdoor: { w: 40, h: 30 }, village: { w: 64, h: 48 },
};
const HOUSE_NEW_SIZES: Record<HouseModel, { w: number; h: number }> = {
  casebre: { w: 16, h: 14 }, casa: { w: 38, h: 24 }, casarao: { w: 34, h: 30 }, estalagem: { w: 32, h: 24 }, hotel: { w: 46, h: 36 },
};

/** Rua e floresta pedem mais espaço em volta (a rua na frente, a mata em volta). */
export function newMapSize(preset: MapPreset, model: HouseModel, exterior: Exterior = 'quintal'): { w: number; h: number } {
  const s = preset === 'house' ? HOUSE_NEW_SIZES[model] : NEW_SIZES[preset];
  const extra = exterior === 'quintal' || !hasExterior(preset) ? 0 : preset === 'temple' ? 8 : 6;
  return { w: Math.min(MAP_LIMITS.max, s.w + extra), h: Math.min(MAP_LIMITS.max, s.h + extra) };
}

/** Tipos com um prédio no meio e o exterior escolhido em volta. */
export const hasExterior = (preset: MapPreset) => preset === 'house' || preset === 'temple';

/** Quantos andares o tipo aceita: masmorra (níveis) e casas com mais de um cômodo. */
export function maxFloors(preset: MapPreset, model: HouseModel): number {
  if (preset === 'dungeon') return MAX_FLOORS;
  if (preset === 'house') return model === 'casebre' ? 1 : MAX_FLOORS;
  return 1;
}

/** Menor lado aceito pelo gerador. */
export const GEN_MIN_SIDE = 12;

const clampN = (v: unknown, min: number, max: number, def: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : def;
  return Math.max(min, Math.min(max, n));
};

export function cleanMapParams(raw: Partial<MapGenParams> | null | undefined): MapGenParams {
  const r = raw ?? {};
  const preset: MapPreset = typeof r.preset === 'string' && r.preset in MAP_PRESETS ? r.preset : 'dungeon';
  const model: HouseModel = typeof r.model === 'string' && r.model in HOUSE_MODELS ? r.model : 'casa';
  const size: HouseSize = typeof r.size === 'string' && r.size in HOUSE_SIZES ? r.size : 'normal';
  const info = HOUSE_MODELS[model];
  let shape: HouseShape = typeof r.shape === 'string' && r.shape in HOUSE_SHAPES ? r.shape : 'random';
  // Formato que o modelo não tem vira aleatório (entre os que ele tem).
  if (preset === 'house' && shape !== 'random' && !info.shapes.includes(shape)) shape = 'random';
  const d = preset === 'house' ? { ...PRESET_DEFAULTS.house, ...houseModelDefaults(model) } : PRESET_DEFAULTS[preset];
  const w = Math.round(clampN(r.w, GEN_MIN_SIDE, MAP_LIMITS.max, MAP_GEN_DEFAULTS.w));
  const h = Math.round(clampN(r.h, GEN_MIN_SIDE, MAP_LIMITS.max, MAP_GEN_DEFAULTS.h));
  const roomMax = Math.round(clampN(r.roomMax, 3, Math.min(20, Math.min(w, h) - 4), d.roomMax));
  const [rMin, rMax] = preset === 'house' ? [info.rooms[0], info.rooms[1]] : preset === 'outdoor' ? [0, 12] : preset === 'village' ? [3, 24] : [1, 40];
  return {
    preset, shape, model, size, furnish: !!r.furnish, lights: !!r.lights,
    w, h,
    rooms: Math.round(clampN(r.rooms, rMin, rMax, d.rooms)),
    roomMin: Math.round(clampN(r.roomMin, 2, roomMax, Math.min(d.roomMin, roomMax))),
    roomMax,
    corridor: Math.round(clampN(r.corridor, 1, 3, d.corridor)),
    doors: clampN(r.doors, 0, 1, d.doors),
    floors: Math.round(clampN(r.floors, 1, maxFloors(preset, model), 1)),
    exterior: typeof r.exterior === 'string' && r.exterior in EXTERIORS && hasExterior(preset) ? r.exterior : 'quintal',
  };
}
