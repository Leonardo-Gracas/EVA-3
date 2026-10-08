import { useMemo, useState } from 'react';
import { Moon } from 'lucide-react';
import type { Character, TableState } from '../../model/types';
import { deriveStats } from '../../rules/derive';
import { useAct } from '../act';
import Modal from '../common/Modal';

/** Descanso: o mestre escolhe quem descansa; PV, PE e Clareza voltam ao máximo. */
export default function RestModal({ table, onClose }: { table: TableState; onClose: () => void }) {
  const { act } = useAct();
  const [busy, setBusy] = useState(false);
  const { pcs, npcs } = useMemo(() => {
    const ok = Object.values(table.characters).filter((c) => c.status === 'approved');
    const byName = (a: Character, b: Character) => a.name.localeCompare(b.name, 'pt-BR');
    return { pcs: ok.filter((c) => c.kind === 'pc').sort(byName), npcs: ok.filter((c) => c.kind === 'npc').sort(byName) };
  }, [table.characters]);
  const isDead = (c: Character) => c.current.pv <= deriveStats(c).deathAt;
  const select = (list: Character[]) => new Set(list.filter((c) => !isDead(c)).map((c) => c.id));
  const [picked, setPicked] = useState<Set<string>>(() => select(pcs));

  const toggle = (id: string) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const ids = [...picked].filter((id) => table.characters[id]);

  const rest = async () => {
    setBusy(true);
    const r = await act({ type: 'rest', characterIds: ids }, 'Descanso aplicado.');
    setBusy(false);
    if (r.ok) onClose();
  };

  const row = (c: Character) => {
    const d = deriveStats(c);
    const dead = isDead(c);
    const owner = c.kind === 'pc' ? table.players[c.ownerId]?.name : undefined;
    return (
      <label key={c.id} className="check rest-row" style={dead ? { opacity: 0.5 } : undefined}>
        <input type="checkbox" checked={picked.has(c.id)} disabled={dead} onChange={() => toggle(c.id)} />
        <span className="grow">
          <strong>{c.name}</strong>{owner && <span className="tiny muted"> · {owner}</span>}
          {dead && <span className="tiny muted"> · morto</span>}
        </span>
        <span className="tiny" style={{ color: 'var(--pv)' }}>{c.current.pv}/{d.pvMax}</span>
        <span className="tiny" style={{ color: 'var(--pe)' }}>{c.current.pe}/{d.peMax}</span>
        <span className="tiny" style={{ color: 'var(--clareza)' }}>{c.current.clareza}/{d.clarezaMax}</span>
      </label>
    );
  };

  return (
    <Modal open width={520} title={<><Moon size={16} /> Descanso</>} onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy || !ids.length} onClick={() => void rest()}>
            Descansar{ids.length ? ` (${ids.length})` : ''}
          </button>
        </>
      }>
      <div className="col">
        <p className="small muted">Quem descansa recupera PV, PE e Clareza até o máximo. Personagens mortos não descansam.</p>
        <div className="row-wrap">
          <button className="btn btn-sm" onClick={() => setPicked(select(pcs))}>Todos os jogadores</button>
          <button className="btn btn-sm" onClick={() => setPicked(select([...pcs, ...npcs]))}>Todos</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setPicked(new Set())}>Nenhum</button>
        </div>
        {pcs.length > 0 && <div className="menu-title mt">Jogadores</div>}
        {pcs.map(row)}
        {npcs.length > 0 && <div className="menu-title mt">NPCs</div>}
        {npcs.map(row)}
      </div>
    </Modal>
  );
}
