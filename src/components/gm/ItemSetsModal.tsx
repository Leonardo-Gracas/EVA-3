import { useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Crosshair, Flame, PackageMinus, Shield, Smartphone, type LucideIcon } from 'lucide-react';
import type { TableState } from '../../model/types';
import { MAX_LIBRARY } from '../../store/engine';
import { ITEM_SETS, installedSetItems, missingSetItems, type ItemSetId, type SetRemoval } from '../../store/itemSets';
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

/** Sai por padrão só o que está igual ao conjunto e não é de outro conjunto em uso. */
const removableByDefault = (r: SetRemoval) => !r.changed && r.alsoIn.length === 0;

/**
 * Conjuntos de itens prontos para a biblioteca. Marque um ou mais e importe:
 * só entra o que a biblioteca ainda não tem (pelo nome), e os de mesmo nome sem luz passam a iluminar.
 * "Remover" desimporta um conjunto, conferindo antes item a item.
 */
export default function ItemSetsModal({ table, onClose, onImported }: {
  table: TableState; onClose: () => void; onImported: (sets: ItemSetId[]) => void;
}) {
  const { act } = useAct();
  const lib = table.itemLibrary;
  const gaps = useMemo(() => new Map(ITEM_SETS.map((set) => [set.id, missingSetItems(lib, set.items)])), [lib]);
  const installed = useMemo(() => new Map(ITEM_SETS.map((set) => [set.id, installedSetItems(lib, set.id)])), [lib]);
  const pending = (id: ItemSetId) => { const g = gaps.get(id)!; return g.add.length + g.update.length; };
  // Já vem marcado o que tem algo novo.
  const [picked, setPicked] = useState<ItemSetId[]>(() => ITEM_SETS.filter((s) => pending(s.id) > 0).map((s) => s.id));
  const [openId, setOpenId] = useState<ItemSetId | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Desimportar: o conjunto e os itens marcados para sair.
  const [removing, setRemoving] = useState<{ id: ItemSetId; ids: string[] } | null>(null);

  const chosen = ITEM_SETS.filter((s) => picked.includes(s.id) && pending(s.id) > 0);
  const total = missingSetItems(lib, chosen.flatMap((s) => s.items));
  const count = total.add.length + total.update.length;
  const room = MAX_LIBRARY - Object.keys(lib).length;
  const tooMany = total.add.length > room;
  const busy = progress !== null;

  const toggle = (id: ItemSetId) => setPicked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  /** Roda as ações uma a uma, com o progresso no botão. Devolve quantas deram certo. */
  const runAll = async (actions: Parameters<typeof act>[0][]) => {
    let done = 0;
    setProgress({ done, total: actions.length });
    for (const a of actions) {
      if (!(await act(a)).ok) break;
      setProgress({ done: ++done, total: actions.length });
    }
    setProgress(null);
    return done;
  };

  const importNow = async () => {
    if (!count || tooMany || busy) return;
    const actions = [
      ...total.update.map((u) => ({ type: 'library/upsert' as const, item: u.item, itemId: u.id })),
      ...total.add.map((item) => ({ type: 'library/upsert' as const, item })),
    ];
    const done = await runAll(actions);
    if (!done) return;
    toast(done === actions.length ? `Itens importados: ${done}.` : `Importados ${done} de ${actions.length} itens.`, done === actions.length ? 'ok' : 'info');
    onImported(chosen.map((s) => s.id));
    if (done === actions.length) onClose();
  };

  const startRemove = (id: ItemSetId) => {
    setOpenId(null);
    setRemoving({ id, ids: installed.get(id)!.filter(removableByDefault).map((r) => r.id) });
  };

  if (removing) {
    const set = ITEM_SETS.find((s) => s.id === removing.id)!;
    const list = installed.get(set.id)!;
    // Itens que já saíram da biblioteca (removidos agora ou em outra tela) não contam.
    const ids = removing.ids.filter((id) => lib[id]);
    const n = ids.length;
    const allOn = list.length > 0 && list.every((r) => ids.includes(r.id));
    const toggleItem = (id: string) => setRemoving({ ...removing, ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
    const removeNow = async () => {
      if (!n || busy) return;
      const done = await runAll(ids.map((itemId) => ({ type: 'library/delete' as const, itemId })));
      if (!done) return;
      toast(done === n ? `Itens removidos: ${done}.` : `Removidos ${done} de ${n} itens.`, done === n ? 'ok' : 'info');
      if (done === n) setRemoving(null);
    };
    return (
      <Modal open title={`Remover ${set.name}`} width={600} onClose={busy ? () => {} : onClose}
        footer={
          <>
            <button className="btn" onClick={() => setRemoving(null)} disabled={busy}><ArrowLeft size={14} /> Voltar</button>
            <button className="btn btn-danger" onClick={() => void removeNow()} disabled={!n || busy}>
              {busy ? `Removendo ${progress.done} de ${progress.total}…` : n ? `Remover ${n} ${n === 1 ? 'item' : 'itens'}` : 'Remover'}
            </button>
          </>
        }>
        <div className="col">
          <p className="small muted">
            Sai da biblioteca o que estiver marcado. Itens que você editou ou que também são de outro conjunto em uso
            vêm desmarcados. Cópias já entregues aos personagens continuam nos inventários. Não dá para desfazer.
          </p>
          {list.length === 0 ? <div className="empty">Nenhum item deste conjunto na biblioteca.</div> : (
            <>
              <div className="row">
                <span className="small muted grow">{n} de {list.length} marcados</span>
                <button className="btn btn-sm btn-ghost" disabled={busy}
                  onClick={() => setRemoving({ ...removing, ids: allOn ? [] : list.map((r) => r.id) })}>
                  {allOn ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              </div>
              <div className="set-remove-list">
                {list.map((r) => {
                  const on = ids.includes(r.id);
                  return (
                    <button key={r.id} className={`set-remove-row${on ? ' on' : ''}`} role="checkbox" aria-checked={on} disabled={busy}
                      onClick={() => toggleItem(r.id)}>
                      <span className="set-check">{on && <Check size={13} />}</span>
                      <span className="grow">{r.name}</span>
                      {r.changed && <span className="set-tag" title="Diferente da versão do conjunto: editado por você ou um item seu de mesmo nome">editado</span>}
                      {r.alsoIn.length > 0 && <span className="set-tag" title="Também faz parte deste conjunto, que está na biblioteca">também em {r.alsoIn.join(', ')}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal open title="Conjuntos de itens" width={600} onClose={busy ? () => {} : onClose}
      footer={
        <>
          {tooMany && <span className="small item-dmg grow">Passa do limite de {MAX_LIBRARY} itens da biblioteca (cabem mais {room}).</span>}
          <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => void importNow()} disabled={!count || tooMany || busy}>
            {busy ? `Importando ${progress.done} de ${progress.total}…`
              : count ? `Importar ${count} ${count === 1 ? 'item' : 'itens'}` : 'Importar'}
          </button>
        </>
      }>
      <div className="col">
        <p className="small muted">
          Marque os conjuntos e importe. Só entra o que a biblioteca ainda não tem (pelo nome); depois, edite à vontade.
          Para tirar um conjunto da biblioteca, use Remover.
        </p>
        <div className="set-list">
          {ITEM_SETS.map((set) => {
            const Icon = SET_ICON[set.id];
            const g = gaps.get(set.id)!;
            const left = g.add.length + g.update.length;
            const have = installed.get(set.id)!.length;
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
                        {left > 0 && have > 0 && <> · {have} na biblioteca</>}
                      </span>
                    </span>
                  </button>
                  <div className="set-side">
                    <button className="btn btn-sm btn-ghost set-more" onClick={() => setOpenId(open ? null : set.id)} aria-expanded={open}
                      title={open ? 'Esconder os itens' : 'Ver os itens do conjunto'}>
                      <span className="hide-xs">Itens</span><ChevronDown size={14} className={`set-chev${open ? ' open' : ''}`} />
                    </button>
                    {have > 0 && (
                      <button className="btn btn-sm btn-ghost set-more" onClick={() => startRemove(set.id)} disabled={busy}
                        title={`Desimportar: tirar da biblioteca os itens de ${set.name}`}>
                        <PackageMinus size={14} /><span className="hide-xs">Remover</span>
                      </button>
                    )}
                  </div>
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
