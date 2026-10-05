import type { ActionPermission, GameAction, PermissionKey, PermissionState, Permissions } from './types';

export const PERMISSION_KEYS: PermissionKey[] = [
  'resource_change',
  'ability_use',
  'level_up',
  'item_add',
  'item_update',
  'item_remove',
  'item_equip',
  'item_durability',
  'notes_update',
];

export const PERMISSION_LABELS: Record<PermissionKey, { label: string; hint: string }> = {
  resource_change: { label: 'Alterar PV/PE atuais', hint: 'Dano, cura, gasto e recuperação manual de PV e PE.' },
  ability_use: { label: 'Usar habilidade', hint: 'Gasta PE/PV pelo botão "Usar" da habilidade.' },
  level_up: { label: 'Subir de nível', hint: 'Escolher classe e habilidade do próximo nível.' },
  item_add: { label: 'Adicionar item', hint: 'Criar item no próprio inventário.' },
  item_update: { label: 'Editar item', hint: 'Mudar nome, dano, quantidade etc. de um item do inventário.' },
  item_remove: { label: 'Remover item', hint: 'Descartar item do inventário.' },
  item_equip: { label: 'Equipar / desequipar', hint: 'Itens equipados somam bônus de DEF.' },
  item_durability: { label: 'Durabilidade de itens', hint: 'Dano e reparo no PV dos objetos do inventário.' },
  notes_update: { label: 'Editar anotações', hint: 'Texto livre da ficha.' },
};

export const PERMISSION_VALUES: Array<{ value: ActionPermission; label: string }> = [
  { value: 'free', label: 'Livre' },
  { value: 'request', label: 'Solicitar' },
  { value: 'blocked', label: 'Bloqueada' },
];

export const DEFAULT_PERMISSIONS: Permissions = {
  resource_change: 'free',
  ability_use: 'free',
  level_up: 'request',
  item_add: 'request',
  item_update: 'request',
  item_remove: 'request',
  item_equip: 'free',
  item_durability: 'free',
  notes_update: 'free',
};

export function isPermissionKey(v: unknown): v is PermissionKey {
  return typeof v === 'string' && (PERMISSION_KEYS as string[]).includes(v);
}

export function isPermissionValue(v: unknown): v is ActionPermission {
  return v === 'free' || v === 'request' || v === 'blocked';
}

export function effectivePermissions(state: PermissionState, playerId: string): Permissions {
  return { ...DEFAULT_PERMISSIONS, ...state.global, ...(state.perPlayer[playerId] ?? {}) };
}

/** Qual permissão controla a ação de jogador. null = não depende de permissão. */
export function permissionFor(action: GameAction): PermissionKey | null {
  switch (action.type) {
    case 'resource/set': return 'resource_change';
    case 'ability/use': return 'ability_use';
    case 'level/up': return 'level_up';
    case 'item/add': return 'item_add';
    case 'item/update': return 'item_update';
    case 'item/remove': return 'item_remove';
    case 'item/equip': return 'item_equip';
    case 'item/durability': return 'item_durability';
    case 'notes/update': return 'notes_update';
    default: return null;
  }
}
