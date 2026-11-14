import { BookOpen, Crosshair, Flame, Shield, Smartphone, type LucideIcon } from 'lucide-react';
import type { TableState } from '../../model/types';
import { nameKey } from '../../store/catalogSets';
import { MAX_LIBRARY } from '../../store/engine';
import { ITEM_SETS, installedSetItems, missingSetItems, type ItemSetId } from '../../store/itemSets';
import SetsModal, { type SetsPlan } from './SetsModal';

const SET_ICON: Record<ItemSetId, LucideIcon> = {
  iluminacao: Flame,
  medieval: Shield,
  old_school: Crosshair,
  contemporaneo: Smartphone,
  ocultismo: BookOpen,
};

const SETS = ITEM_SETS.map((s) => {
  const Icon = SET_ICON[s.id];
  return {
    id: s.id, name: s.name, description: s.description, icon: <Icon size={18} />,
    entries: s.items.map((i) => ({ name: i.name, title: i.description, suffix: i.pack > 1 ? `×${i.pack}` : undefined })),
  };
});

/** Conjuntos de itens para a biblioteca; os de mesmo nome sem luz passam a iluminar. */
export default function ItemSetsModal({ table, onClose, onImported }: {
  table: TableState; onClose: () => void; onImported: (sets: ItemSetId[]) => void;
}) {
  const lib = table.itemLibrary;
  const plan = (ids: string[]): SetsPlan => {
    const gap = missingSetItems(lib, ITEM_SETS.filter((s) => ids.includes(s.id)).flatMap((s) => s.items));
    return {
      actions: [
        ...gap.update.map((u) => ({ type: 'library/upsert' as const, item: u.item, itemId: u.id })),
        ...gap.add.map((item) => ({ type: 'library/upsert' as const, item })),
      ],
      adds: gap.add.length,
      pending: new Set([...gap.add.map((i) => nameKey(i.name)), ...gap.update.map((u) => nameKey(u.item.name))]),
    };
  };
  return (
    <SetsModal title="Conjuntos de itens" sets={SETS}
      words={{
        one: 'item', many: 'itens', fem: false, inPlace: 'na biblioteca', place: 'a biblioteca',
        removeNote: 'Cópias já entregues aos personagens continuam nos inventários.',
      }}
      plan={plan} installed={(id) => installedSetItems(lib, id as ItemSetId)}
      removeAction={(itemId) => ({ type: 'library/delete', itemId })}
      room={MAX_LIBRARY - Object.keys(lib).length} limit={MAX_LIBRARY}
      onClose={onClose} onImported={(ids) => onImported(ids as ItemSetId[])} />
  );
}
