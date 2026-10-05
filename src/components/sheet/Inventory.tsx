import { useState } from 'react';
import { Backpack, Pencil, Plus, Shield, Trash2 } from 'lucide-react';
import { ITEM_TYPES, type Character, type InventoryItem } from '../../model/types';
import { useAct } from '../act';
import ActButton from '../common/ActButton';
import ItemFormModal from './ItemForm';

export default function Inventory({ ch, readOnly }: { ch: Character; readOnly?: boolean }) {
  const { act } = useAct();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="card">
      <div className="row mb">
        <div className="card-title" style={{ margin: 0 }}><Backpack size={14} /> Inventário</div>
        <div className="spacer" />
        {!readOnly && (
          <ActButton perm="item_add" onClick={() => setAdding(true)}><Plus size={14} /> Item</ActButton>
        )}
      </div>
      {ch.inventory.length === 0 && <div className="empty">Inventário vazio.</div>}
      <div>
        {ch.inventory.map((it) => (
          <div key={it.id}>
            <div className={`inv-row${it.equipped ? ' inv-equipped' : ''}`}>
              <button className="grow" style={{ textAlign: 'left' }} onClick={() => setOpen(open === it.id ? null : it.id)}>
                <div className="row-wrap">
                  <strong>{it.name}</strong>
                  {it.qty > 1 && <span className="muted">×{it.qty}</span>}
                  <span className="badge">{ITEM_TYPES[it.type]}</span>
                  {it.damage && <span className="badge badge-err">{it.damage}</span>}
                  {it.defBonus !== 0 && <span className="badge badge-ok">DEF {it.defBonus > 0 ? '+' : ''}{it.defBonus}</span>}
                </div>
              </button>
              {!readOnly && (
                <>
                  <ActButton perm="item_equip" className={`btn btn-sm${it.equipped ? ' btn-primary' : ''}`}
                    title={it.equipped ? 'Desequipar' : 'Equipar'}
                    onClick={() => act({ type: 'item/equip', characterId: ch.id, itemId: it.id, equipped: !it.equipped })}>
                    <Shield size={13} />
                  </ActButton>
                  <ActButton perm="item_update" className="btn btn-sm btn-ghost" title="Editar" onClick={() => setEditing(it)}><Pencil size={13} /></ActButton>
                  <ActButton perm="item_remove" className="btn btn-sm btn-ghost" title="Remover"
                    onClick={() => act({ type: 'item/remove', characterId: ch.id, itemId: it.id })}><Trash2 size={13} /></ActButton>
                </>
              )}
            </div>
            {open === it.id && it.description && <div className="small secondary pre" style={{ padding: '6px 12px 10px' }}>{it.description}</div>}
          </div>
        ))}
      </div>
      {adding && (
        <ItemFormModal title="Novo item" submitLabel="Adicionar" onClose={() => setAdding(false)}
          onSubmit={async (item, qty) => (await act({ type: 'item/add', characterId: ch.id, item, qty }, 'Item adicionado.')).ok} />
      )}
      {editing && (
        <ItemFormModal title={`Editar ${editing.name}`} initial={editing} initialQty={editing.qty} onClose={() => setEditing(null)}
          onSubmit={async (item, qty) => (await act({ type: 'item/update', characterId: ch.id, itemId: editing.id, item, qty }, 'Item atualizado.')).ok} />
      )}
    </div>
  );
}
