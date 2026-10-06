import { useMemo, useState } from 'react';
import { Backpack, Coins, Hammer, Wrench, Pencil, Plus, Search, Shield, Trash2 } from 'lucide-react';
import { ITEM_TYPES, type Character, type InventoryItem, type LibraryItem } from '../../model/types';
import { useAct } from '../act';
import ActButton from '../common/ActButton';
import ItemCard, { ItemIcon } from '../common/ItemCard';
import Modal from '../common/Modal';
import ResourceAdjustModal, { goldOps } from '../common/ResourceAdjust';
import ItemFormModal from './ItemForm';

const GOLD_CHIPS = [1, 3, 5, 10, 15, 20, 25, 50, 100, 500];

export default function Inventory({ ch, readOnly }: { ch: Character; readOnly?: boolean }) {
  const { act } = useAct();
  const [goldOpen, setGoldOpen] = useState(false);
  // Adicionar: primeiro o seletor da biblioteca; "Criar novo" troca para o formulário.
  const [adding, setAdding] = useState<'pick' | 'create' | null>(null);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [repairing, setRepairing] = useState<InventoryItem | null>(null);
  const total = ch.inventory.reduce((s, it) => s + it.value * it.qty, 0);

  return (
    <div className="card">
      <div className="row mb">
        <div className="card-title" style={{ margin: 0 }}><Backpack size={14} /> Inventário</div>
        {total > 0 && <span className="item-value tiny" title="Valor total do inventário"><Coins size={12} />{total.toLocaleString('pt-BR')}</span>}
        <div className="spacer" />
        {!readOnly && (
          <ActButton perm="item_add" onClick={() => setAdding('pick')}><Plus size={14} /> Item</ActButton>
        )}
      </div>
      <div className="gold-row">
        <Coins size={18} className="gold" />
        <div className="grow">
          <div className="gold-amount">{(ch.gold ?? 0).toLocaleString('pt-BR')} <span className="small muted">de ouro</span></div>
        </div>
        {!readOnly && (
          <ActButton perm="gold_change" className="btn btn-sm" title="Ganhar ou gastar ouro" onClick={() => setGoldOpen(true)}>
            <Coins size={13} /> Ganhar / gastar
          </ActButton>
        )}
      </div>
      {ch.inventory.length === 0 && <div className="empty">Nenhum item.</div>}
      <div className="item-list">
        {ch.inventory.map((it) => (
          <ItemCard key={it.id} it={it} pv={it.pv} qty={it.qty} equipped={it.equipped}
            actions={readOnly ? undefined : (
              <>
                <ActButton perm="item_equip" className={`btn btn-sm${it.equipped ? ' btn-primary' : ''}`}
                  title={it.equipped ? 'Desequipar' : 'Equipar'}
                  onClick={() => act({ type: 'item/equip', characterId: ch.id, itemId: it.id, equipped: !it.equipped })}>
                  <Shield size={13} />{it.equipped ? 'Equipado' : 'Equipar'}
                </ActButton>
                <ActButton perm="item_durability" className="btn btn-sm btn-ghost btn-icon" title="Durabilidade: dano e reparo" onClick={() => setRepairing(it)}><Hammer size={14} /></ActButton>
                <ActButton perm="item_update" className="btn btn-sm btn-ghost btn-icon" title="Editar" onClick={() => setEditing(it)}><Pencil size={14} /></ActButton>
                <ActButton perm="item_remove" className="btn btn-sm btn-ghost btn-icon" title="Remover"
                  onClick={() => act({ type: 'item/remove', characterId: ch.id, itemId: it.id })}><Trash2 size={14} /></ActButton>
              </>
            )} />
        ))}
      </div>
      {adding === 'pick' && (
        <LibraryPickModal ch={ch} onCreate={() => setAdding('create')} onClose={() => setAdding(null)} />
      )}
      {adding === 'create' && (
        <ItemFormModal title="Novo item" submitLabel="Adicionar" onClose={() => setAdding(null)}
          note="O item vai para o inventário e também para a biblioteca de itens."
          onSubmit={async (item, qty) => (await act({ type: 'item/add', characterId: ch.id, item, qty, toLibrary: true }, 'Item adicionado.')).ok} />
      )}
      {editing && (
        <ItemFormModal title={`Editar ${editing.name}`} initial={editing} initialQty={editing.qty} onClose={() => setEditing(null)}
          onSubmit={async (item, qty) => (await act({ type: 'item/update', characterId: ch.id, itemId: editing.id, item, qty }, 'Item atualizado.')).ok} />
      )}
      {goldOpen && <GoldModal ch={ch} onClose={() => setGoldOpen(false)} />}
      {repairing && <DurabilityModal ch={ch} it={repairing} onClose={() => setRepairing(null)} />}
    </div>
  );
}

function LibraryPickModal({ ch, onCreate, onClose }: { ch: Character; onCreate: () => void; onClose: () => void }) {
  const { act, library } = useAct();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<LibraryItem | null>(null);
  const [qty, setQty] = useState('1');
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    return library
      .filter((i) => !term || i.name.toLowerCase().includes(term) || ITEM_TYPES[i.type]?.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [library, q]);

  const add = async () => {
    if (!picked || busy) return;
    setBusy(true);
    const { id: _id, createdAt: _c, updatedAt: _u, ...item } = picked;
    const r = await act({ type: 'item/add', characterId: ch.id, item, qty: Math.max(1, parseInt(qty, 10) || 1), libraryId: picked.id }, 'Item adicionado.');
    setBusy(false);
    if (r.ok) onClose();
  };

  return (
    <Modal open width={600} title={`Adicionar item — ${ch.name}`} onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCreate}><Plus size={14} /> Criar novo item</button>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancelar</button>
          <ActButton perm="item_add" className="btn btn-primary" disabled={!picked || busy} onClick={() => void add()}>Adicionar</ActButton>
        </>
      }>
      <div className="col gap-lg">
        {library.length === 0 ? (
          <div className="empty">A biblioteca de itens está vazia. Use “Criar novo item”.</div>
        ) : (
          <>
            <div className="row">
              <Search size={14} className="muted" />
              <input className="input" autoFocus placeholder="Buscar na biblioteca" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="lib-pick" role="listbox" aria-label="Itens da biblioteca">
              {items.length === 0 && <div className="empty">Nenhum item encontrado.</div>}
              {items.map((it) => (
                <button key={it.id} type="button" role="option" aria-selected={picked?.id === it.id}
                  className={`lib-pick-item${picked?.id === it.id ? ' on' : ''}`}
                  onClick={() => setPicked(it)}>
                  <ItemIcon type={it.type} size={16} />
                  <div className="grow">
                    <div className="lib-pick-name">{it.name}</div>
                    <div className="tiny muted">{ITEM_TYPES[it.type] ?? 'Outro'}{it.damage ? ` · ${it.damage}` : ''}</div>
                  </div>
                  {it.value > 0 && <span className="item-value tiny"><Coins size={12} />{it.value.toLocaleString('pt-BR')}</span>}
                </button>
              ))}
            </div>
            {picked && (
              <>
                <ItemCard it={picked} />
                <div className="field" style={{ maxWidth: 160 }}>
                  <label className="label" htmlFor="pick-qty">Quantidade</label>
                  <input id="pick-qty" className="input" inputMode="numeric" value={qty}
                    onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))} />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function GoldModal({ ch, onClose }: { ch: Character; onClose: () => void }) {
  const { act } = useAct();
  return (
    <ResourceAdjustModal title={`Ouro — ${ch.name}`} perm="gold_change" onClose={onClose}
      tracks={[{
        key: 'gold', label: 'Ouro', icon: <Coins size={16} color="var(--gold)" />, color: 'var(--gold)', barClass: 'bar-dur',
        current: ch.gold ?? 0, min: 0, ops: goldOps(), chips: GOLD_CHIPS,
        status: (v) => (v <= 0 ? 'Fica sem dinheiro.' : undefined),
      }]}
      onApply={async (_k, v, reason) => (await act({ type: 'gold/set', characterId: ch.id, gold: v, reason })).ok} />
  );
}

function DurabilityModal({ ch, it, onClose }: { ch: Character; it: InventoryItem; onClose: () => void }) {
  const { act } = useAct();
  const { rd, def, pv: max } = it.durability;
  return (
    <ResourceAdjustModal title={`Durabilidade — ${it.name}`} perm="item_durability" onClose={onClose}
      tracks={[{
        key: 'pv', label: 'PV', icon: <Wrench size={16} color="var(--gold)" />, color: 'var(--gold)', barClass: 'bar-dur',
        current: it.pv, max, min: 0,
        ops: [
          { key: 'hit', label: 'Dano', tone: 'down', compute: (c, n) => c - Math.max(0, n - rd), reason: (n) => `Dano ${n}${rd ? ` − RD ${rd}` : ''}`,
            hint: rd ? `A RD do objeto (${rd}) é descontada. DEF do objeto: ${def}.` : `Objeto sem RD. DEF do objeto: ${def}.` },
          { key: 'direct', label: 'Dano direto', tone: 'down', compute: (c, n) => c - n, reason: (n) => `Dano direto ${n}`, hint: 'Ignora a RD do objeto.' },
          { key: 'repair', label: 'Reparar', tone: 'up', compute: (c, n) => c + n, reason: (n) => `Reparo ${n}` },
        ],
        status: (v) => (v <= 0 ? `O item quebra${it.equipped ? ' e deixa de dar seus bônus' : ''}.` : it.pv <= 0 ? 'O item deixa de estar quebrado.' : undefined),
      }]}
      onRestoreAll={{ label: 'Restaurar', run: async () => (await act({ type: 'item/durability', characterId: ch.id, itemId: it.id, pv: max, reason: 'Restaurado' })).ok }}
      onApply={async (_k, pv, reason) => (await act({ type: 'item/durability', characterId: ch.id, itemId: it.id, pv, reason })).ok} />
  );
}
