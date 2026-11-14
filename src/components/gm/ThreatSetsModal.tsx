import type { TableState, ThreatCategory } from '../../model/types';
import { nameKey } from '../../store/catalogSets';
import { MAX_THREATS } from '../../store/engine';
import { THREAT_SETS, installedThreatSet, missingThreats, type ThreatSetId } from '../../store/threatSets';
import SetsModal, { type SetsPlan } from './SetsModal';
import { ThreatGlyph } from './ThreatIcon';

/** Ícone de cada classe: a categoria que mais aparece nela. */
const SET_GLYPH: Record<ThreatSetId, ThreatCategory> = {
  ocultistas: 'demoniaco',
  criminosos: 'humano',
  selvagens: 'animal',
};

const SETS = THREAT_SETS.map((s) => ({
  id: s.id, name: s.name, description: s.description, icon: <ThreatGlyph category={SET_GLYPH[s.id]} size={18} />,
  entries: s.items.map((t) => ({ name: t.name, title: t.concept, suffix: `· ${t.concept.split(' · ')[0]}` })),
}));

/** Conjuntos de ameaças por classe para o painel do mestre. */
export default function ThreatSetsModal({ table, onClose, onImported }: {
  table: TableState; onClose: () => void; onImported: (sets: ThreatSetId[]) => void;
}) {
  const threats = table.threats;
  const plan = (ids: string[]): SetsPlan => {
    const add = missingThreats(threats, THREAT_SETS.filter((s) => ids.includes(s.id)).flatMap((s) => s.items));
    return {
      actions: add.map((data) => ({ type: 'threat/upsert' as const, data })),
      adds: add.length,
      pending: new Set(add.map((t) => nameKey(t.name))),
    };
  };
  return (
    <SetsModal title="Conjuntos de ameaças" sets={SETS}
      words={{
        one: 'ameaça', many: 'ameaças', fem: true, inPlace: 'no painel', place: 'o painel',
        removeNote: 'Cópias já em combate continuam na fila.',
      }}
      plan={plan} installed={(id) => installedThreatSet(threats, id as ThreatSetId)}
      removeAction={(threatId) => ({ type: 'threat/delete', threatId })}
      room={MAX_THREATS - Object.keys(threats).length} limit={MAX_THREATS}
      onClose={onClose} onImported={(ids) => onImported(ids as ThreatSetId[])} />
  );
}
