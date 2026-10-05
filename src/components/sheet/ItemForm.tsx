import { useState } from 'react';
import { DEFAULT_DURABILITY, ITEM_TYPES, type ItemData, type ItemType } from '../../model/types';
import { LIMITS } from '../../rules/validate';
import Modal from '../common/Modal';

export const EMPTY_ITEM: ItemData = {
  name: '', type: 'equipamento', description: '', damage: '', defBonus: 0, value: 0,
  durability: { ...DEFAULT_DURABILITY.equipamento },
};

/** Campos numéricos como texto enquanto digita; converte ao salvar. */
function Num({ value, onChange, allowNeg }: { value: string; onChange: (v: string) => void; allowNeg?: boolean }) {
  return (
    <input className="input mono" inputMode="numeric" value={value}
      onChange={(e) => onChange(allowNeg ? e.target.value.replace(/[^\d-]/g, '').replace(/(?!^)-/g, '') : e.target.value.replace(/[^\d]/g, ''))} />
  );
}

const n = (v: string, min = 0) => Math.max(min, parseInt(v, 10) || 0);

// Estrutura de seções inspirada no AddItemModal do Mesa20: geral, combate,
// durabilidade e descrição. A durabilidade nasce com o padrão do tipo.
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
  const base = initial ?? EMPTY_ITEM;
  const [name, setName] = useState(base.name);
  const [type, setType] = useState<ItemType>(base.type);
  const [description, setDescription] = useState(base.description);
  const [damage, setDamage] = useState(base.damage);
  const [def, setDef] = useState(String(base.defBonus));
  const [value, setValue] = useState(String(base.value));
  const [qty, setQty] = useState(String(initialQty ?? 1));
  const [pv, setPv] = useState(String(base.durability.pv));
  const [rd, setRd] = useState(String(base.durability.rd));
  const [dDef, setDDef] = useState(String(base.durability.def));
  // Enquanto o mestre não mexer na durabilidade de um item novo, trocar o tipo troca o padrão.
  const [durTouched, setDurTouched] = useState(!!initial);

  const changeType = (t: ItemType) => {
    setType(t);
    if (!durTouched) {
      const d = DEFAULT_DURABILITY[t];
      setPv(String(d.pv)); setRd(String(d.rd)); setDDef(String(d.def));
    }
  };
  const touch = (set: (v: string) => void) => (v: string) => { setDurTouched(true); set(v); };

  const isWeapon = type === 'arma' || type === 'municao';
  const isArmor = type === 'protecao' || type === 'escudo';

  const submit = async () => {
    const item: ItemData = {
      name, type, description, damage,
      defBonus: parseInt(def, 10) || 0,
      value: n(value),
      durability: { pv: n(pv, 1), rd: n(rd), def: n(dDef) },
    };
    if (await onSubmit(item, Math.max(1, parseInt(qty, 10) || 1))) onClose();
  };

  return (
    <Modal open width={600} title={title} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!name.trim() || n(pv) < 1} onClick={submit}>{submitLabel}</button></>}>
      <div className="col gap-lg">
        <div className="field">
          <label className="label">Nome</label>
          <input className="input" autoFocus value={name} maxLength={LIMITS.itemName} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid-3">
          <div className="field">
            <label className="label">Tipo</label>
            <select className="select" value={type} onChange={(e) => changeType(e.target.value as ItemType)}>
              {Object.entries(ITEM_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Valor</label>
            <Num value={value} onChange={setValue} />
          </div>
          {withQty && (
            <div className="field">
              <label className="label">Quantidade</label>
              <Num value={qty} onChange={setQty} />
            </div>
          )}
        </div>

        <div>
          <div className="card-title" style={{ marginBottom: 6 }}>Combate</div>
          <div className="grid-2">
            <div className="field">
              <label className="label">Dano{!isWeapon && <span className="muted"> (se usado como arma)</span>}</label>
              <input className="input" placeholder="Ex.: 1d8" value={damage} maxLength={LIMITS.itemDamage} onChange={(e) => setDamage(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Bônus de DEF de quem usa{!isArmor && <span className="muted"> (equipado)</span>}</label>
              <Num value={def} onChange={setDef} allowNeg />
            </div>
          </div>
        </div>

        <div>
          <div className="row" style={{ marginBottom: 6 }}>
            <div className="card-title" style={{ margin: 0 }}>Durabilidade</div>
            <span className="tiny muted">{durTouched ? '' : `padrão de ${ITEM_TYPES[type]}`}</span>
          </div>
          <div className="grid-3">
            <div className="field">
              <label className="label">PV</label>
              <Num value={pv} onChange={touch(setPv)} />
            </div>
            <div className="field">
              <label className="label">RD</label>
              <Num value={rd} onChange={touch(setRd)} />
            </div>
            <div className="field">
              <label className="label">Defesa</label>
              <Num value={dDef} onChange={touch(setDDef)} />
            </div>
          </div>
          <p className="tiny muted" style={{ marginTop: 6 }}>PV, RD e Defesa do próprio objeto quando ele é atacado. Com PV 0 o item fica quebrado e deixa de proteger.</p>
        </div>

        <div className="field">
          <label className="label">Descrição</label>
          <textarea className="textarea" value={description} maxLength={LIMITS.itemText} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
