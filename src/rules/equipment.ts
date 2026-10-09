// Limite de itens equipados: duas mãos e uma proteção. Vestes não têm limite;
// se duas se anulam ou atrapalham, o mestre decide na mesa.
import { SLOT_HANDS, type InventoryItem, type ItemData } from '../model/types';

export const MAX_HANDS = 2;

/** Mãos ocupadas pelos itens equipados (quebrados também: continuam na mão). */
export function handsInUse(inventory: InventoryItem[], exceptId?: string): number {
  return inventory.reduce((n, i) => n + (i.equipped && i.id !== exceptId ? SLOT_HANDS[i.slot] ?? 0 : 0), 0);
}

/**
 * Por que o item não pode ser equipado agora, ou null se cabe.
 * `id` é o próprio item no inventário (ignorado na conta).
 */
export function equipBlock(inventory: InventoryItem[], it: Pick<ItemData, 'type' | 'slot'> & { id: string }): string | null {
  const others = inventory.filter((i) => i.equipped && i.id !== it.id);
  if (it.type === 'protecao') {
    const worn = others.find((i) => i.type === 'protecao');
    if (worn) return `Só dá para usar uma proteção por vez. Desequipe ${worn.name} antes.`;
  }
  const need = SLOT_HANDS[it.slot] ?? 0;
  if (need > 0) {
    const held = others.filter((i) => (SLOT_HANDS[i.slot] ?? 0) > 0);
    const used = held.reduce((n, i) => n + SLOT_HANDS[i.slot], 0);
    if (used + need > MAX_HANDS) {
      return `Mãos ocupadas (${held.map((i) => i.name).join(', ')}). Desequipe ${held.length > 1 ? 'algo' : 'esse item'} antes.`;
    }
  }
  return null;
}
