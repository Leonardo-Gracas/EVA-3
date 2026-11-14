import { useMemo, useState } from 'react';
import { Check, ChevronDown, Flame, Shield, Smartphone, Crosshair, type LucideIcon } from 'lucide-react';
import type { TableState } from '../../model/types';
import { MAX_LIBRARY } from '../../store/engine';
import { ITEM_SETS, missingSetItems, type ItemSetId } from '../../store/itemSets';
import { useAct } from '../act';
import Modal from '../common/Modal';
import { toast } from '../common/toast';

const key = (s: string) => s.trim().toLocaleLowerCase('pt-BR');

const SET_ICON: Record<ItemSetId, LucideIcon> = {
  iluminacao: Flame,
  medieval: Shield,
  old_school: Crosshair,
  contemporaneo: Smartphone,
};

/**
 * Conjuntos de itens prontos para a biblioteca. Marque um ou mais e importe:
 * só entra o que a biblioteca ainda não tem (pelo nome), e os de mesmo nome sem luz passam a iluminar.
 */
export default function ItemSetsModal({ table, onClose, onImported }: {
  table: TableState; onClose: () => void; onImported: (sets: ItemSetId[]) => void;
}) {
  const { act } = useAct();
  const lib = table.itemLibrary;
  const gaps = useMemo(() => new Map(ITEM_SETS.map((set) => [set.id, missingSetItems(lib, set.items)])), [lib]);
  const pending = (id: ItemSetId) => { const g = gaps.get(id)!; return g.add.length + g.update.length; };
  // Já vem marcado o que tem algo novo.
  const [picked, setPicked] = useState<ItemSetId[]>(() => ITEM_SETS.filter((s) => pending(s.id) > 0).map((s) => s.id));
  const [openId, setOpenId] = useState<ItemSetId | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const chosen = ITEM_SETS.filter((s) => picked.includes(s.id) && pending(s.id) > 0);
  const total = missingSetItems(lib, chosen.flatMap((s) => s.items));
  const count = total.add.length + total.update.length;
  const room = MAX_LIBRARY - Object.keys(lib).length;
  const tooMany = total.add.length > room;
  const busy = progress !== null;

  const toggle = (id: ItemSetId) => setPicked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  const go = async () => {
    if (!count || tooMany || busy) return;
    const actions = [
      ...total.update.map((u) => ({ type: 'library/upsert' as const, item: u.item, itemId: u.id })),
      ...total.add.map((item) => ({ type: 'library/upsert' as const, item })),
    ];
    let done = 0;
    setProgress({ done, total: actions.length });
    for (const a of actions) {
      if (!(await act(a)).ok) break;
      setProgress({ done: ++done, total: actions.length });
    }
    setProgress(null);
    if (!done) return;
    toast(done === actions.length ? `Itens importados: ${done}.` : `Importados ${done} de ${actions.length} itens.`, done === actions.length ? 'ok' : 'info');
    onImported(chosen.map((s) => s.id));
    if (done === actions.length) onClose();
  };

  return (
    <Modal open title="Conjuntos de itens" width={600} onClose={busy ? () => {} : onClose}
      footer={
        <>
          {tooMany && <span className="small item-dmg grow">Passa do limite de {MAX_LIBRARY} itens da biblioteca (cabem mais {room}).</span>}
          <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => void go()} disabled={!count || tooMany || busy}>
            {busy ? `Importando ${progress.done} de ${progress.total}…`
              : count ? `Importar ${count} ${count === 1 ? 'item' : 'itens'}` : 'Importar'}
          </button>
        </>
      }>
      <div className="col">
        <p className="small muted">
          Marque os conjuntos e importe. Só entra o que a biblioteca ainda não tem (pelo nome); depois, edite à vontade.
        </p>
        <div className="set-list">
          {ITEM_SETS.map((set) => {
            const Icon = SET_ICON[set.id];
            const g = gaps.get(set.id)!;
            const left = g.add.length + g.update.length;
            const on = picked.includes(set.id) && left > 0;
            const open = openId === set.id;
            const missing = new Set([...g.add.map((i) => key(i.name)), ...g.update.map((u) => key(u.item.name))]);
            return (
              <div key={set.id} className={`set-card${on ? ' on' : ''}${left ? '' : ' done'}`}>
                <div className="set-top">
                  <button className="set-main" role="checkbox" aria-checked={on} disabled={!left || busy} onClick={() => toggle(set.id)}>
                    <span className="set-check">{on && <Check size={13} />}</span>
                    <span className="set-icon"><Icon size={18} /></span>
                    <span className="grow">
                      <span className="set-name">{set.name}</span>
                      <span className="set-desc">{set.description}</span>
                      <span className="set-count">
                        {set.items.length} itens · {left ? <strong>{left} {left === 1 ? 'novo' : 'novos'}</strong> : 'todos já na biblioteca'}
                      </span>
                    </span>
                  </button>
                  <button className="btn btn-sm btn-ghost set-more" onClick={() => setOpenId(open ? null : set.id)} aria-expanded={open}
                    title={open ? 'Esconder os itens' : 'Ver os itens do conjunto'}>
                    <span className="hide-xs">Itens</span><ChevronDown size={14} className={`set-chev${open ? ' open' : ''}`} />
                  </button>
                </div>
                {open && (
                  <ul className="set-items">
                    {set.items.map((it) => (
                      <li key={it.name} className={missing.has(key(it.name)) ? undefined : 'have'} title={missing.has(key(it.name)) ? it.description : 'Já está na biblioteca'}>
                        {it.name}{it.pack > 1 && <span className="muted"> ×{it.pack}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
