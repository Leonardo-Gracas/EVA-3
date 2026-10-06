import { useMemo, useState } from 'react';
import { Gift, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { LibraryItem, TableState } from '../../model/types';
import { useAct } from '../act';
import ConfirmButton from '../common/ConfirmButton';
import ItemCard from '../common/ItemCard';
import Modal from '../common/Modal';
import ItemFormModal from '../sheet/ItemForm';

export default function ItemLibrary({ table }: { table: TableState }) {
  const { act } = useAct();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const [giving, setGiving] = useState<LibraryItem | null>(null);

  const items = useMemo(() => Object.values(table.itemLibrary)
    .filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [table.itemLibrary, q]);

  return (
    <div className="card">
      <div className="row-wrap mb">
        <div className="card-title" style={{ margin: 0 }}>Biblioteca de itens</div>
        <div className="spacer" />
        <div className="row" style={{ minWidth: 200 }}>
          <Search size={14} className="muted" />
          <input className="input" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Plus size={14} /> Novo item</button>
      </div>
      {items.length === 0 && <div className="empty">Crie itens aqui e entregue aos personagens.</div>}
      <div className="item-list">
        {items.map((it) => (
          <ItemCard key={it.id} it={it} actions={(
            <>
              <button className="btn btn-sm" onClick={() => setGiving(it)}><Gift size={13} /> Entregar</button>
              <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEditing(it)} title="Editar"><Pencil size={14} /></button>
              <ConfirmButton className="btn btn-sm btn-ghost btn-icon" onConfirm={() => act({ type: 'library/delete', itemId: it.id })}><Trash2 size={14} /></ConfirmButton>
            </>
          )} />
        ))}
      </div>
      {creating && (
        <ItemFormModal title="Novo item" withQty={false} onClose={() => setCreating(false)}
          onSubmit={async (item) => (await act({ type: 'library/upsert', item }, 'Item criado.')).ok} />
      )}
      {editing && (
        <ItemFormModal title={`Editar ${editing.name}`} withQty={false} initial={editing} onClose={() => setEditing(null)}
          onSubmit={async (item) => (await act({ type: 'library/upsert', item, itemId: editing.id }, 'Item atualizado.')).ok} />
      )}
      {giving && <GiveModal table={table} item={giving} onClose={() => setGiving(null)} />}
    </div>
  );
}

function GiveModal({ table, item, onClose }: { table: TableState; item: LibraryItem; onClose: () => void }) {
  const { act } = useAct();
  const chars = Object.values(table.characters).filter((c) => c.status === 'approved');
  const [charId, setCharId] = useState(chars[0]?.id ?? '');
  const [qty, setQty] = useState('1');
  const go = async () => {
    const r = await act({ type: 'library/give', itemId: item.id, characterId: charId, qty: Math.max(1, parseInt(qty, 10) || 1) }, 'Item entregue.');
    if (r.ok) onClose();
  };
  return (
    <Modal open title={`Entregar ${item.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!charId} onClick={go}>Entregar</button></>}>
      {chars.length === 0 ? <div className="empty">Nenhuma ficha aprovada.</div> : (
        <div className="grid-2">
          <div className="field">
            <label className="label">Personagem</label>
            <select className="select" value={charId} onChange={(e) => setCharId(e.target.value)}>
              {chars.map((c) => <option key={c.id} value={c.id}>{c.name} ({table.players[c.ownerId]?.name ?? '—'})</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Quantidade</label>
            <input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))} />
          </div>
        </div>
      )}
    </Modal>
  );
}
