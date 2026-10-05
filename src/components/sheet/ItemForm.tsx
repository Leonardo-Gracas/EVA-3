import { useState } from 'react';
import { ITEM_TYPES, type ItemData, type ItemType } from '../../model/types';
import { LIMITS } from '../../rules/validate';
import Modal from '../common/Modal';

export const EMPTY_ITEM: ItemData = { name: '', type: 'equipamento', description: '', damage: '', defBonus: 0 };

export default function ItemFormModal({
  title, initial, initialQty, withQty = true, submitLabel = 'Salvar', onSubmit, onClose,
}: {
  title: string;
  initial?: ItemData;
  initialQty?: number;
  withQty?: boolean;
  submitLabel?: string;
  onSubmit: (item: ItemData, qty: number) => Promise<boolean>;
  onClose: () => void;
}) {
  const [item, setItem] = useState<ItemData>(initial ?? EMPTY_ITEM);
  const [qty, setQty] = useState(String(initialQty ?? 1));
  const [def, setDef] = useState(String(initial?.defBonus ?? 0));
  const up = (p: Partial<ItemData>) => setItem({ ...item, ...p });

  const submit = async () => {
    const ok = await onSubmit({ ...item, defBonus: parseInt(def, 10) || 0 }, Math.max(1, parseInt(qty, 10) || 1));
    if (ok) onClose();
  };

  return (
    <Modal open title={title} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!item.name.trim()} onClick={submit}>{submitLabel}</button></>}>
      <div className="col gap-lg">
        <div className="field">
          <label className="label">Nome</label>
          <input className="input" autoFocus value={item.name} maxLength={LIMITS.itemName} onChange={(e) => up({ name: e.target.value })} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label">Tipo</label>
            <select className="select" value={item.type} onChange={(e) => up({ type: e.target.value as ItemType })}>
              {Object.entries(ITEM_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {withQty && (
            <div className="field">
              <label className="label">Quantidade</label>
              <input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))} />
            </div>
          )}
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label">Dano</label>
            <input className="input" placeholder="Ex.: 1d8" value={item.damage} maxLength={LIMITS.itemDamage} onChange={(e) => up({ damage: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Bônus de DEF (equipado)</label>
            <input className="input" inputMode="numeric" value={def} onChange={(e) => setDef(e.target.value.replace(/[^\d-]/g, ''))} />
          </div>
        </div>
        <div className="field">
          <label className="label">Descrição</label>
          <textarea className="textarea" value={item.description} maxLength={LIMITS.itemText} onChange={(e) => up({ description: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
}
