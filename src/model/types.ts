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

/** pc = ficha de jogador; npc = ficha do mestre, mesmas regras, sem jogador. */
export type CharacterKind = 'pc' | 'npc';

/** Dono das fichas de NPC. */
export const GM_OWNER = 'gm';

/** Deslocamento padrão de uma ficha, em metros. */
export const DEFAULT_MOVEMENT = 9;

export interface Character {
  id: string;
  kind: CharacterKind;
  /** NPC: aparece (só nome e conceito) para os jogadores. */
  visible: boolean;
  ownerId: string;
  name: string;
  concept: string;
  attributes: Attributes;
  /** levels[0] é o nível 1. O nível do personagem é levels.length. */
  levels: LevelPick[];
  current: { pv: number; pe: number };
  /** Perdas permanentes de PV/PE máximos (ex.: Pacto). Só o mestre altera. */
  permanentLoss: { pv: number; pe: number };
  /** RD extra concedida pelo mestre (bênçãos, maldições, condições). */
  rdBonus: { physical: number; magic: number };
  /** Deslocamento em metros. Só o mestre altera. */
  movement: number;
  /** Dinheiro carregado (moedas de ouro), à parte dos itens. */
  gold: number;
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

export type ItemType =
  | 'arma' | 'protecao' | 'escudo'
  | 'catalisador_sagrado' | 'catalisador_profano' | 'catalisador_etereo'
  | 'consumivel' | 'municao' | 'equipamento' | 'outro';

export const ITEM_TYPES: Record<ItemType, string> = {
  arma: 'Arma',
  protecao: 'Proteção',
  escudo: 'Escudo',
  catalisador_sagrado: 'Catalisador sagrado',
  catalisador_profano: 'Catalisador profano',
  catalisador_etereo: 'Catalisador etéreo',
  consumivel: 'Consumível',
  municao: 'Munição',
  equipamento: 'Equipamento',
  outro: 'Outro',
};

/** Durabilidade do objeto: PV, RD e Defesa do próprio item quando é alvo. */
export interface Durability {
  pv: number;
  rd: number;
  def: number;
}

/** Efeitos de um item equipado sobre quem o usa. */
export interface ItemEffects {
  def: number;
  rdPhysical: number;
  rdMagic: number;
}

export const NO_EFFECTS: ItemEffects = { def: 0, rdPhysical: 0, rdMagic: 0 };

/** Durabilidade padrão sugerida ao criar um item de cada tipo. */
export const DEFAULT_DURABILITY: Record<ItemType, Durability> = {
  arma: { pv: 10, rd: 5, def: 12 },
  protecao: { pv: 20, rd: 5, def: 10 },
  escudo: { pv: 15, rd: 8, def: 10 },
  catalisador_sagrado: { pv: 5, rd: 2, def: 13 },
  catalisador_profano: { pv: 5, rd: 2, def: 13 },
  catalisador_etereo: { pv: 3, rd: 1, def: 14 },
  consumivel: { pv: 1, rd: 0, def: 12 },
  municao: { pv: 1, rd: 1, def: 15 },
  equipamento: { pv: 5, rd: 2, def: 11 },
  outro: { pv: 5, rd: 0, def: 10 },
};

export interface ItemData {
  name: string;
  type: ItemType;
  description: string;
  /** Texto livre: "1d8", "2d6 + FOR"... */
  damage: string;
  /** Bônus para quem usa, aplicados só com o item equipado e inteiro. */
  effects: ItemEffects;
  /** Valor em moedas. */
  value: number;
  /** Durabilidade máxima do objeto. */
  durability: Durability;
}

export interface LibraryItem extends ItemData {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface InventoryItem extends ItemData {
  id: string;
  /** PV atual do objeto. 0 = quebrado. */
  pv: number;
  qty: number;
  equipped: boolean;
  libraryId?: string;
}

// ── Ameaças ──────────────────────────────────────────────────────────────────
// Fichas de combate do mestre: valores livres, sem compra de pontos nem classe.

export interface ThreatAttack {
  id: string;
  name: string;
  /** Bônus somado ao d20 do ataque. */
  bonus: number;
  damage: string;
  notes: string;
}

export interface ThreatAbility {
  id: string;
  name: string;
  cost: string;
  text: string;
}

export interface ThreatData {
  name: string;
  concept: string;
  attributes: Attributes;
  pvMax: number;
  peMax: number;
  def: number;
  von: number;
  rdPhysical: number;
  rdMagic: number;
  attacks: ThreatAttack[];
  abilities: ThreatAbility[];
  notes: string;
}

export interface Threat extends ThreatData {
  id: string;
  current: { pv: number; pe: number };
  /** Aparece (só nome e descrição) para os jogadores. */
  visible: boolean;
  createdAt: number;
  updatedAt: number;
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
  | 'item_durability'
  | 'gold_change'
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
  threats: Record<string, Threat>;
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
  | { type: 'npc/create'; draft: CharacterDraft }
  | { type: 'npc/visibility'; characterId: string; visible: boolean }
  | { type: 'threat/upsert'; threatId?: string; data: ThreatData }
  | { type: 'threat/duplicate'; threatId: string }
  | { type: 'threat/delete'; threatId: string }
  | { type: 'threat/resource'; threatId: string; pv: number; pe: number; reason?: string }
  | { type: 'threat/visibility'; threatId: string; visible: boolean }
  | { type: 'resource/set'; characterId: string; pv: number; pe: number; reason?: string }
  | { type: 'ability/use'; characterId: string; abilityId: string; pe: number; pv: number; note?: string }
  | { type: 'level/up'; characterId: string; classId: ClassId; abilityId: string | null }
  /** libraryId: copia o item da biblioteca. toLibrary: também cria o item na biblioteca. */
  | { type: 'item/add'; characterId: string; item: ItemData; qty: number; libraryId?: string; toLibrary?: boolean }
  | { type: 'item/update'; characterId: string; itemId: string; item: ItemData; qty: number }
  | { type: 'item/remove'; characterId: string; itemId: string }
  | { type: 'item/equip'; characterId: string; itemId: string; equipped: boolean }
  | { type: 'item/durability'; characterId: string; itemId: string; pv: number; reason?: string }
  | { type: 'character/rdBonus'; characterId: string; physical: number; magic: number }
  | { type: 'character/movement'; characterId: string; movement: number }
  | { type: 'gold/set'; characterId: string; gold: number; reason?: string }
  | { type: 'notes/update'; characterId: string; notes: string }
  | { type: 'library/upsert'; item: ItemData; itemId?: string }
  | { type: 'library/delete'; itemId: string }
  | { type: 'library/give'; itemId: string; characterId: string; qty: number }
  | { type: 'permissions/global'; key: PermissionKey; value: ActionPermission }
  | { type: 'permissions/player'; playerId: string; key: PermissionKey; value: ActionPermission | null }
  | { type: 'request/resolve'; requestId: string; approve: boolean }
  | { type: 'roll'; expr: string; characterId?: string; threatId?: string; attr?: AttrKey; label?: string; target?: number; hidden?: boolean }
  | { type: 'table/rename'; name: string }
  | { type: 'log/clear' };

export type Actor = { role: 'gm'; name: string } | { role: 'player'; playerId: string; name: string };

// ── Visão do jogador ─────────────────────────────────────────────────────────

export interface PublicCharacter {
  id: string;
  kind: CharacterKind;
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
  /** Biblioteca de itens do mestre, para escolher ao adicionar no inventário. */
  library: LibraryItem[];
  others: PublicCharacter[];
  threats: Array<{ id: string; name: string; concept: string }>;
  myRequests: PendingRequest[];
  permissions: Permissions;
  log: LogEntry[];
}
