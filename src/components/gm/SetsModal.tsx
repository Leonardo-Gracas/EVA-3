import { useState, type ReactNode } from 'react';
import { ArrowLeft, Check, ChevronDown, PackageMinus } from 'lucide-react';
import type { GameAction } from '../../model/types';
import { nameKey, removableByDefault, type SetRemoval } from '../../store/catalogSets';
import { useAct } from '../act';
import Modal from '../common/Modal';
import { toast } from '../common/toast';

export interface SetsModalSet {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  /** O que o conjunto traz, na ordem do conjunto. */
  entries: Array<{ name: string; title?: string; suffix?: string }>;
}

/** O que importar os conjuntos escolhidos faria agora. */
export interface SetsPlan {
  actions: GameAction[];
  /** Quantos entram de novo (as demais ações atualizam o que já existe). */
  adds: number;
  /** Nomes (ver `nameKey`) que ainda faltam na mesa. */
  pending: Set<string>;
}

/** Palavras da tela: "item"/"ameaça", gênero e onde ficam. */
export interface SetsWords {
  one: string;
  many: string;
  fem: boolean;
  /** "na biblioteca", "no painel". */
  inPlace: string;
  /** "a biblioteca", "o painel". */
  place: string;
  /** Lembrete ao desimportar (o que não some junto). */
  removeNote: string;
}

/**
 * Conjuntos prontos para importar (itens, ameaças). Marque um ou mais e importe: só entra
 * o que a mesa ainda não tem (pelo nome). "Remover" desimporta um conjunto, conferindo antes
 * um a um; o editado e o que é de outro conjunto em uso vêm desmarcados.
 */
export default function SetsModal({ title, sets, words: w, plan, installed, removeAction, room, limit, onClose, onImported }: {
  title: string; sets: SetsModalSet[]; words: SetsWords;
  plan: (setIds: string[]) => SetsPlan;
  installed: (setId: string) => SetRemoval[];
  removeAction: (id: string) => GameAction;
  /** Quantos ainda cabem na mesa, e o limite. */
  room: number; limit: number;
  onClose: () => void; onImported: (setIds: string[]) => void;
}) {
  const { act } = useAct();
  const g = (m: string, f: string) => (w.fem ? f : m);
  const noun = (n: number) => `${n} ${n === 1 ? w.one : w.many}`;
  const perSet = new Map(sets.map((s) => [s.id, plan([s.id])]));
  const have = new Map(sets.map((s) => [s.id, installed(s.id)]));
  const pending = (id: string) => perSet.get(id)!.actions.length;
  // Já vem marcado o que tem algo novo.
  const [picked, setPicked] = useState<string[]>(() => sets.filter((s) => pending(s.id) > 0).map((s) => s.id));
  const [openId, setOpenId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Desimportar: o conjunto e o que está marcado para sair.
  const [removing, setRemoving] = useState<{ id: string; ids: string[] } | null>(null);

  const chosen = sets.filter((s) => picked.includes(s.id) && pending(s.id) > 0).map((s) => s.id);
  const total = plan(chosen);
  const count = total.actions.length;
  const tooMany = total.adds > room;
  const busy = progress !== null;
  const close = busy ? () => {} : onClose;

  const toggle = (id: string) => setPicked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  /** Roda as ações uma a uma, com o progresso no botão. Devolve quantas deram certo. */
  const runAll = async (actions: GameAction[]) => {
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
    const done = await runAll(total.actions);
    if (!done) return;
    const all = done === count;
    toast(all ? `${g('Importados', 'Importadas')}: ${noun(done)}.` : `${g('Importados', 'Importadas')} ${done} de ${noun(count)}.`, all ? 'ok' : 'info');
    onImported(chosen);
    if (all) onClose();
  };

  if (removing) {
    const set = sets.find((s) => s.id === removing.id)!;
    const list = have.get(set.id)!;
    // O que já saiu da mesa (agora ou em outra tela) não conta.
    const ids = removing.ids.filter((id) => list.some((r) => r.id === id));
    const n = ids.length;
    const allOn = list.length > 0 && list.every((r) => ids.includes(r.id));
    const toggleOne = (id: string) => setRemoving({ ...removing, ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
    const removeNow = async () => {
      if (!n || busy) return;
      const done = await runAll(ids.map(removeAction));
      if (!done) return;
      toast(done === n ? `${g('Removidos', 'Removidas')}: ${noun(done)}.` : `${g('Removidos', 'Removidas')} ${done} de ${noun(n)}.`, done === n ? 'ok' : 'info');
      if (done === n) setRemoving(null);
    };
    return (
      <Modal open title={`Remover ${set.name}`} width={600} onClose={close}
        footer={
          <>
            <button className="btn" onClick={() => setRemoving(null)} disabled={busy}><ArrowLeft size={14} /> Voltar</button>
            <button className="btn btn-danger" onClick={() => void removeNow()} disabled={!n || busy}>
              {busy ? `Removendo ${progress.done} de ${progress.total}…` : n ? `Remover ${noun(n)}` : 'Remover'}
            </button>
          </>
        }>
        <div className="col">
          <p className="small muted">
            Sai {w.inPlace.replace(/^n/, 'd')} o que estiver marcado. {g('Os', 'As')} que você editou ou que também são de outro
            conjunto em uso vêm {g('desmarcados', 'desmarcadas')}. {w.removeNote} Não dá para desfazer.
          </p>
          {list.length === 0 ? <div className="empty">Nada deste conjunto {w.inPlace}.</div> : (
            <>
              <div className="row">
                <span className="small muted grow">{n} de {list.length} {g('marcados', 'marcadas')}</span>
                <button className="btn btn-sm btn-ghost" disabled={busy}
                  onClick={() => setRemoving({ ...removing, ids: allOn ? [] : list.map((r) => r.id) })}>
                  {allOn ? g('Desmarcar todos', 'Desmarcar todas') : g('Marcar todos', 'Marcar todas')}
                </button>
              </div>
              <div className="set-remove-list">
                {list.map((r) => {
                  const on = ids.includes(r.id);
                  return (
                    <button key={r.id} className={`set-remove-row${on ? ' on' : ''}`} role="checkbox" aria-checked={on} disabled={busy}
                      onClick={() => toggleOne(r.id)}>
                      <span className="set-check">{on && <Check size={13} />}</span>
                      <span className="grow">{r.name}</span>
                      {r.changed && <span className="set-tag" title="Diferente da versão do conjunto: editado por você, ou algo seu de mesmo nome">{g('editado', 'editada')}</span>}
                      {r.alsoIn.length > 0 && <span className="set-tag" title={`Também é de outro conjunto que está ${w.inPlace}`}>também em {r.alsoIn.join(', ')}</span>}
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
    <Modal open title={title} width={600} onClose={close}
      footer={
        <>
          {tooMany && <span className="small item-dmg grow">Passa do limite de {limit} {w.many} (cabem mais {room}).</span>}
          <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => void importNow()} disabled={!count || tooMany || busy}>
            {busy ? `Importando ${progress.done} de ${progress.total}…` : count ? `Importar ${noun(count)}` : 'Importar'}
          </button>
        </>
      }>
      <div className="col">
        <p className="small muted">
          Marque os conjuntos e importe. Só entra o que {w.place} ainda não tem (pelo nome); depois, edite à vontade.
          Para tirar um conjunto, use Remover.
        </p>
        <div className="set-list">
          {sets.map((set) => {
            const left = pending(set.id);
            const inside = have.get(set.id)!.length;
            const on = picked.includes(set.id) && left > 0;
            const open = openId === set.id;
            const missing = perSet.get(set.id)!.pending;
            return (
              <div key={set.id} className={`set-card${on ? ' on' : ''}${left ? '' : ' done'}`}>
                <div className="set-top">
                  <button className="set-main" role="checkbox" aria-checked={on} disabled={!left || busy} onClick={() => toggle(set.id)}>
                    <span className="set-check">{on && <Check size={13} />}</span>
                    <span className="set-icon">{set.icon}</span>
                    <span className="grow">
                      <span className="set-name">{set.name}</span>
                      <span className="set-desc">{set.description}</span>
                      <span className="set-count">
                        {noun(set.entries.length)} · {left
                          ? <strong>{left} {left === 1 ? g('novo', 'nova') : g('novos', 'novas')}</strong>
                          : `${g('todos', 'todas')} já ${w.inPlace}`}
                        {left > 0 && inside > 0 && <> · {inside} {w.inPlace}</>}
                      </span>
                    </span>
                  </button>
                  <div className="set-side">
                    <button className="btn btn-sm btn-ghost set-more" onClick={() => setOpenId(open ? null : set.id)} aria-expanded={open}
                      title={open ? 'Esconder a lista' : 'Ver o que vem no conjunto'}>
                      <span className="hide-xs">Lista</span><ChevronDown size={14} className={`set-chev${open ? ' open' : ''}`} />
                    </button>
                    {inside > 0 && (
                      <button className="btn btn-sm btn-ghost set-more" disabled={busy}
                        onClick={() => { setOpenId(null); setRemoving({ id: set.id, ids: have.get(set.id)!.filter(removableByDefault).map((r) => r.id) }); }}
                        title={`Desimportar: tirar ${w.inPlace.replace(/^n/, 'd')} o que veio de ${set.name}`}>
                        <PackageMinus size={14} /><span className="hide-xs">Remover</span>
                      </button>
                    )}
                  </div>
                </div>
                {open && (
                  <ul className="set-items">
                    {set.entries.map((e) => {
                      const want = missing.has(nameKey(e.name));
                      return (
                        <li key={e.name} className={want ? undefined : 'have'} title={want ? e.title : `Já está ${w.inPlace}`}>
                          {e.name}{e.suffix && <span className="muted"> {e.suffix}</span>}
                        </li>
                      );
                    })}
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
