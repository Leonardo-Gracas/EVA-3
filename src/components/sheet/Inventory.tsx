import { useState } from 'react';
import { Backpack, Hammer, Pencil, Plus, Shield, Trash2 } from 'lucide-react';
import { ITEM_TYPES, type Character, type InventoryItem, type ItemData } from '../../model/types';
import { useAct } from '../act';
import ActButton from '../common/ActButton';
import Modal from '../common/Modal';
import ItemFormModal from './ItemForm';

const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** Selos do item: tipo, dano, DEF, durabilidade e valor. Usado no inventário e na biblioteca. */
export function ItemBadges({ it, pv }: { it: ItemData; pv?: number }) {
  const broken = pv !== undefined && pv <= 0;
  return (
    <>
      <span className="badge">{ITEM_TYPES[it.type] ?? 'Outro'}</span>
      {it.damage && <span className="badge badge-err">{it.damage}</span>}
      {it.effects.def !== 0 && <span className="badge badge-ok" title="Bônus de Defesa quando equipado">DEF {fmt(it.effects.def)}</span>}
      {it.effects.rdPhysical !== 0 && <span className="badge badge-ok" title="Bônus de RD física quando equipado">RD fís. {fmt(it.effects.rdPhysical)}</span>}
      {it.effects.rdMagic !== 0 && <span className="badge badge-ok" title="Bônus de RD mágica quando equipado">RD mág. {fmt(it.effects.rdMagic)}</span>}
      <span className={`badge${broken ? ' badge-err' : ''}`} title="Durabilidade do objeto: PV · RD · Defesa">
        {broken ? 'Quebrado' : `PV ${pv !== undefined ? `${pv}/` : ''}${it.durability.pv}`} · RD {it.durability.rd} · DEF {it.durability.def}
      </span>
      {it.value > 0 && <span className="badge badge-gold">Valor {it.value.toLocaleString('pt-BR')}</span>}
    </>
  );
}

export default function Inventory({ ch, readOnly }: { ch: Character; readOnly?: boolean }) {
  const { act } = useAct();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [repairing, setRepairing] = useState<InventoryItem | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const total = ch.inventory.reduce((s, it) => s + it.value * it.qty, 0);

  return (
    <div className="card">
      <div className="row mb">
        <div className="card-title" style={{ margin: 0 }}><Backpack size={14} /> Inventário</div>
        {total > 0 && <span className="tiny muted">Valor total {total.toLocaleString('pt-BR')}</span>}
        <div className="spacer" />
        {!readOnly && (
          <ActButton perm="item_add" onClick={() => setAdding(true)}><Plus size={14} /> Item</ActButton>
        )}
      </div>
      {ch.inventory.length === 0 && <div className="empty">Inventário vazio.</div>}
      <div>
        {ch.inventory.map((it) => {
          const broken = it.pv <= 0;
          return (
            <div key={it.id}>
              <div className={`inv-row${it.equipped ? ' inv-equipped' : ''}`} style={broken ? { opacity: 0.75 } : undefined}>
                <button className="grow" style={{ textAlign: 'left' }} onClick={() => setOpen(open === it.id ? null : it.id)}>
                  <div className="row-wrap">
                    <strong style={broken ? { textDecoration: 'line-through' } : undefined}>{it.name}</strong>
                    {it.qty > 1 && <span className="muted">×{it.qty}</span>}
                    <ItemBadges it={it} pv={it.pv} />
                  </div>
                  {it.pv < it.durability.pv && (
                    <div className="bar bar-pv" style={{ height: 4, marginTop: 6, maxWidth: 220 }}>
                      <div style={{ width: `${(it.pv / it.durability.pv) * 100}%` }} />
                    </div>
                  )}
                </button>
                {!readOnly && (
                  <>
                    <ActButton perm="item_equip" className={`btn btn-sm${it.equipped ? ' btn-primary' : ''}`}
                      title={it.equipped ? 'Desequipar' : 'Equipar'}
                      onClick={() => act({ type: 'item/equip', characterId: ch.id, itemId: it.id, equipped: !it.equipped })}>
                      <Shield size={13} /><span className="hide-sm">{it.equipped ? 'Equipado' : 'Equipar'}</span>
                    </ActButton>
                    <ActButton perm="item_durability" className="btn btn-sm btn-ghost" title="Dano / reparo" onClick={() => setRepairing(it)}><Hammer size={13} /></ActButton>
                    <ActButton perm="item_update" className="btn btn-sm btn-ghost" title="Editar" onClick={() => setEditing(it)}><Pencil size={13} /></ActButton>
                    <ActButton perm="item_remove" className="btn btn-sm btn-ghost" title="Remover"
                      onClick={() => act({ type: 'item/remove', characterId: ch.id, itemId: it.id })}><Trash2 size={13} /></ActButton>
                  </>
                )}
              </div>
              {open === it.id && it.description && <div className="small secondary pre" style={{ padding: '6px 12px 10px' }}>{it.description}</div>}
            </div>
          );
        })}
      </div>
      {adding && (
        <ItemFormModal title="Novo item" submitLabel="Adicionar" onClose={() => setAdding(false)}
          onSubmit={async (item, qty) => (await act({ type: 'item/add', characterId: ch.id, item, qty }, 'Item adicionado.')).ok} />
      )}
      {editing && (
        <ItemFormModal title={`Editar ${editing.name}`} initial={editing} initialQty={editing.qty} onClose={() => setEditing(null)}
          onSubmit={async (item, qty) => (await act({ type: 'item/update', characterId: ch.id, itemId: editing.id, item, qty }, 'Item atualizado.')).ok} />
      )}
      {repairing && <DurabilityModal ch={ch} it={repairing} onClose={() => setRepairing(null)} />}
    </div>
  );
}

function DurabilityModal({ ch, it, onClose }: { ch: Character; it: InventoryItem; onClose: () => void }) {
  const { act } = useAct();
  const [amount, setAmount] = useState('');
  const n = Math.abs(parseInt(amount, 10) || 0);
  const max = it.durability.pv;
  const set = async (pv: number, reason: string) => {
    const r = await act({ type: 'item/durability', characterId: ch.id, itemId: it.id, pv: Math.max(0, Math.min(max, pv)), reason });
    if (r.ok) onClose();
  };
  return (
    <Modal open title={`Durabilidade — ${it.name}`} onClose={onClose}>
      <div className="col gap-lg">
        <div className="row-wrap">
          <span className="vital-num">{it.pv}</span><span className="vital-max">/ {max} PV</span>
          <span className="spacer" />
          <span className="badge">RD {it.durability.rd}</span>
          <span className="badge">DEF {it.durability.def}</span>
        </div>
        <div className={`bar ${it.pv <= 0 ? 'bar-neg' : 'bar-pv'}`}><div style={{ width: it.pv <= 0 ? '100%' : `${(it.pv / max) * 100}%` }} /></div>
        <div className="field">
          <label className="label">Quantidade</label>
          <input className="input" autoFocus inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} placeholder="Ex.: 6" />
        </div>
        <div className="row-wrap">
          <button className="btn btn-sm" disabled={!n} onClick={() => set(it.pv - Math.max(0, n - it.durability.rd), `Dano ${n} − RD ${it.durability.rd}`)}>Dano (aplica RD)</button>
          <button className="btn btn-sm" disabled={!n} onClick={() => set(it.pv - n, `Dano direto ${n}`)}>Dano direto</button>
          <button className="btn btn-sm" disabled={!n} onClick={() => set(it.pv + n, `Reparo ${n}`)}>Reparar</button>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" disabled={it.pv >= max} onClick={() => set(max, 'Restaurado')}>Restaurar</button>
        </div>
      </div>
    </Modal>
  );
}
