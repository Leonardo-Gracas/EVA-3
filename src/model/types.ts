import type { Attributes, AttrKey } from '../rules/attributes';
import type { ClassId } from '../rules/classes';

// ── Ficha ────────────────────────────────────────────────────────────────────

/** Uma subida de nível: a classe que recebeu o nível e a habilidade escolhida. */
export interface LevelPick {
  classId: ClassId;
  /** null quando não havia habilidade disponível para escolher. */
  abilityId: string | null;
}

export type CharacterStatus = 'pending' | 'approved' | 'rejected';

export interface Character {
  id: string;
  ownerId: string;
  name: string;
  concept: string;
  attributes: Attributes;
  /** levels[0] é o nível 1. O nível do personagem é levels.length. */
  levels: LevelPick[];
  current: { pv: number; pe: number };
  /** Perdas permanentes de PV/PE máximos (ex.: Pacto). Só o mestre altera. */
  permanentLoss: { pv: number; pe: number };
  inventory: InventoryItem[];
  notes: string;
  status: CharacterStatus;
  rejectReason?: string;
  createdAt: number;
  updatedAt: number;
}

/** O que o jogador envia ao criar a ficha. */
export interface CharacterDraft {
  name: string;
  concept: string;
  attributes: Attributes;
  classId: ClassId;
  abilityId: string | null;
  notes: string;
}

// ── Itens ────────────────────────────────────────────────────────────────────

export type ItemType = 'arma' | 'protecao' | 'catalisador' | 'consumivel' | 'equipamento' | 'outro';

export const ITEM_TYPES: Record<ItemType, string> = {
  arma: 'Arma',
  protecao: 'Proteção',
  catalisador: 'Catalisador',
  consumivel: 'Consumível',
  equipamento: 'Equipamento',
  outro: 'Outro',
};

export interface ItemData {
  name: string;
  type: ItemType;
  description: string;
  /** Texto livre: "1d8", "2d6 + FOR"... */
  damage: string;
  /** Bônus de DEF quando equipado. */
  defBonus: number;
}

export interface LibraryItem extends ItemData {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface InventoryItem extends ItemData {
  id: string;
  qty: number;
  equipped: boolean;
  libraryId?: string;
}

// ── Mesa ─────────────────────────────────────────────────────────────────────

export interface PlayerRecord {
  id: string;
  name: string;
  /** SHA-256 do segredo do navegador do jogador: impede que outro assuma o lugar. */
  secretHash: string;
  firstSeen: number;
  lastSeen: number;
}

export type ActionPermission = 'free' | 'request' | 'blocked';

export type PermissionKey =
  | 'resource_change'
  | 'ability_use'
  | 'level_up'
  | 'item_add'
  | 'item_update'
  | 'item_remove'
  | 'item_equip'
  | 'notes_update';

export type Permissions = Record<PermissionKey, ActionPermission>;

export interface PermissionState {
  global: Permissions;
  perPlayer: Record<string, Partial<Permissions>>;
}

export type RequestStatus = 'pending' | 'approved' | 'denied';

export interface PendingRequest {
  id: string;
  playerId: string;
  characterId: string;
  permission: PermissionKey;
  action: GameAction;
  summary: string;
  status: RequestStatus;
  createdAt: number;
  resolvedAt?: number;
  error?: string;
}

export interface RollResult {
  expr: string;
  dice: Array<{ sides: number; value: number }>;
  modifier: number;
  total: number;
  attr?: AttrKey;
  levelBonus?: number;
  /** Alvo opcional (DEF/VON/CD). */
  target?: number;
}

export interface LogEntry {
  id: string;
  at: number;
  kind: 'roll' | 'ability' | 'resource' | 'system' | 'request' | 'item' | 'level';
  actorName: string;
  characterName?: string;
  text: string;
  roll?: RollResult;
  /** Só o mestre (e o autor) veem. */
  hidden?: boolean;
  /** Jogador autor, para mostrar a ele as entradas ocultas que ele mesmo fez. */
  playerId?: string;
}

export interface TableState {
  schema: 1;
  id: string;
  name: string;
  gmName: string;
  roomCode: string;
  createdAt: number;
  updatedAt: number;
  players: Record<string, PlayerRecord>;
  characters: Record<string, Character>;
  itemLibrary: Record<string, LibraryItem>;
  permissions: PermissionState;
  requests: PendingRequest[];
  log: LogEntry[];
}

// ── Ações ────────────────────────────────────────────────────────────────────

export type GameAction =
  | { type: 'character/create'; draft: CharacterDraft }
  | { type: 'character/resubmit'; characterId: string; draft: CharacterDraft }
  | { type: 'character/approve'; characterId: string }
  | { type: 'character/reject'; characterId: string; reason: string }
  | { type: 'character/delete'; characterId: string }
  | { type: 'character/permanentLoss'; characterId: string; pv: number; pe: number }
  | { type: 'resource/set'; characterId: string; pv: number; pe: number; reason?: string }
  | { type: 'ability/use'; characterId: string; abilityId: string; pe: number; pv: number; note?: string }
  | { type: 'level/up'; characterId: string; classId: ClassId; abilityId: string | null }
  | { type: 'item/add'; characterId: string; item: ItemData; qty: number }
  | { type: 'item/update'; characterId: string; itemId: string; item: ItemData; qty: number }
  | { type: 'item/remove'; characterId: string; itemId: string }
  | { type: 'item/equip'; characterId: string; itemId: string; equipped: boolean }
  | { type: 'notes/update'; characterId: string; notes: string }
  | { type: 'library/upsert'; item: ItemData; itemId?: string }
  | { type: 'library/delete'; itemId: string }
  | { type: 'library/give'; itemId: string; characterId: string; qty: number }
  | { type: 'permissions/global'; key: PermissionKey; value: ActionPermission }
  | { type: 'permissions/player'; playerId: string; key: PermissionKey; value: ActionPermission | null }
  | { type: 'request/resolve'; requestId: string; approve: boolean }
  | { type: 'roll'; expr: string; characterId?: string; attr?: AttrKey; label?: string; target?: number; hidden?: boolean }
  | { type: 'table/rename'; name: string }
  | { type: 'log/clear' };

export type Actor = { role: 'gm'; name: string } | { role: 'player'; playerId: string; name: string };

// ── Visão do jogador ─────────────────────────────────────────────────────────

export interface PublicCharacter {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  concept: string;
  level: number;
  title: string;
  status: CharacterStatus;
}

export interface PlayerView {
  table: { id: string; name: string; gmName: string };
  me: { id: string; name: string };
  players: Array<{ id: string; name: string; online: boolean }>;
  myCharacters: Character[];
  others: PublicCharacter[];
  myRequests: PendingRequest[];
  permissions: Permissions;
  log: LogEntry[];
}
