import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ThreatAbility, ThreatAttack, ThreatData } from '../../model/types';
import { ATTR_KEYS, ATTRIBUTES } from '../../rules/attributes';
import { LIMITS } from '../../rules/validate';
import Modal from '../common/Modal';

export const EMPTY_THREAT: ThreatData = {
  name: '',
  concept: '',
  attributes: { FOR: 0, CON: 0, DES: 0, FE: 0, INT: 0, PRE: 0 },
  pvMax: 10,
  peMax: 0,
  def: 10,
  von: 10,
  rdPhysical: 0,
  rdMagic: 0,
  attacks: [],
  abilities: [],
  notes: '',
};

let tmp = 0;
const tmpId = () => `n${Date.now().toString(36)}${(tmp++).toString(36)}`;

/** Campo numérico que aceita digitação livre (inclusive "-") e só converte ao salvar. */
function Num({ value, onChange, width = 70 }: { value: string; onChange: (v: string) => void; width?: number }) {
  return (
    <input className="input mono" style={{ width, textAlign: 'center' }} inputMode="numeric" value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d-]/g, '').replace(/(?!^)-/g, ''))} />
  );
}

const n = (v: string) => parseInt(v, 10) || 0;

type Draft = Omit<ThreatData, 'attributes' | 'pvMax' | 'peMax' | 'def' | 'von' | 'rdPhysical' | 'rdMagic' | 'attacks'> & {
  attributes: Record<string, string>;
  pvMax: string; peMax: string; def: string; von: string; rdPhysical: string; rdMagic: string;
  attacks: Array<Omit<ThreatAttack, 'bonus'> & { bonus: string }>;
};

function toDraft(d: ThreatData): Draft {
  return {
    ...d,
    attributes: Object.fromEntries(ATTR_KEYS.map((k) => [k, String(d.attributes[k])])),
    pvMax: String(d.pvMax), peMax: String(d.peMax), def: String(d.def), von: String(d.von), rdPhysical: String(d.rdPhysical), rdMagic: String(d.rdMagic),
    attacks: d.attacks.map((a) => ({ ...a, bonus: String(a.bonus) })),
  };
}

function fromDraft(d: Draft): ThreatData {
  return {
    ...d,
    name: d.name.trim(),
    attributes: Object.fromEntries(ATTR_KEYS.map((k) => [k, n(d.attributes[k])])) as ThreatData['attributes'],
    pvMax: n(d.pvMax), peMax: n(d.peMax), def: n(d.def), von: n(d.von), rdPhysical: n(d.rdPhysical), rdMagic: n(d.rdMagic),
    attacks: d.attacks.map((a) => ({ ...a, bonus: n(a.bonus) })),
  };
}

export default function ThreatEditor({ title, initial, onSave, onClose }: {
  title: string;
  initial?: ThreatData;
  onSave: (d: ThreatData) => Promise<boolean>;
  onClose: () => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(initial ?? EMPTY_THREAT));
  const up = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const setAttack = (i: number, p: Partial<Draft['attacks'][number]>) =>
    up({ attacks: d.attacks.map((a, j) => (j === i ? { ...a, ...p } : a)) });
  const setAbility = (i: number, p: Partial<ThreatAbility>) =>
    up({ abilities: d.abilities.map((a, j) => (j === i ? { ...a, ...p } : a)) });

  const save = async () => { if (await onSave(fromDraft(d))) onClose(); };

  return (
    <Modal open width={760} title={title} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!d.name.trim() || n(d.pvMax) < 1} onClick={save}>Salvar</button></>}>
      <div className="col gap-lg">
        <div className="grid-2">
          <div className="field">
            <label className="label">Nome</label>
            <input className="input" autoFocus value={d.name} maxLength={LIMITS.name} onChange={(e) => up({ name: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Descrição curta</label>
            <input className="input" value={d.concept} maxLength={LIMITS.concept} onChange={(e) => up({ concept: e.target.value })} placeholder="Ex.: Entidade menor, vagante" />
          </div>
        </div>

        <div>
          <label className="label">Atributos (livres, de −10 a 30)</label>
          <div className="attrs">
            {ATTR_KEYS.map((k) => (
              <div key={k} className="attr">
                <span className="attr-key">{ATTRIBUTES[k].short}</span>
                <Num value={d.attributes[k]} onChange={(v) => up({ attributes: { ...d.attributes, [k]: v } })} width={60} />
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="row mb">
            <label className="label" style={{ margin: 0 }}>Combate</label>
            <span className="spacer" />
            <button className="btn btn-sm btn-ghost" onClick={() => up({ def: String(10 + n(d.attributes.DES)), von: String(10 + n(d.attributes.FE)) })}>
              DEF/VON pelos atributos
            </button>
          </div>
          <div className="row-wrap">
            <label className="field small secondary">PV máx.<Num value={d.pvMax} onChange={(v) => up({ pvMax: v })} /></label>
            <label className="field small secondary">PE máx.<Num value={d.peMax} onChange={(v) => up({ peMax: v })} /></label>
            <label className="field small secondary">Defesa<Num value={d.def} onChange={(v) => up({ def: v })} /></label>
            <label className="field small secondary">Vontade<Num value={d.von} onChange={(v) => up({ von: v })} /></label>
            <label className="field small secondary">RD física<Num value={d.rdPhysical} onChange={(v) => up({ rdPhysical: v })} /></label>
            <label className="field small secondary">RD mágica<Num value={d.rdMagic} onChange={(v) => up({ rdMagic: v })} /></label>
          </div>
        </div>

        <div>
          <div className="row mb">
            <label className="label" style={{ margin: 0 }}>Ataques</label>
            <span className="spacer" />
            <button className="btn btn-sm" onClick={() => up({ attacks: [...d.attacks, { id: tmpId(), name: '', bonus: '0', damage: '', notes: '' }] })}><Plus size={13} /> Ataque</button>
          </div>
          {d.attacks.length === 0 && <div className="tiny muted">Nenhum ataque.</div>}
          <div className="col">
            {d.attacks.map((a, i) => (
              <div key={a.id} className="row-wrap" style={{ alignItems: 'flex-end' }}>
                <label className="field small secondary grow" style={{ minWidth: 140 }}>Nome
                  <input className="input" value={a.name} maxLength={LIMITS.itemName} onChange={(e) => setAttack(i, { name: e.target.value })} placeholder="Garras" /></label>
                <label className="field small secondary">Bônus<Num value={a.bonus} onChange={(v) => setAttack(i, { bonus: v })} width={64} /></label>
                <label className="field small secondary">Dano
                  <input className="input" style={{ width: 110 }} value={a.damage} maxLength={LIMITS.itemDamage} onChange={(e) => setAttack(i, { damage: e.target.value })} placeholder="2d6+3" /></label>
                <label className="field small secondary grow" style={{ minWidth: 140 }}>Observação
                  <input className="input" value={a.notes} maxLength={300} onChange={(e) => setAttack(i, { notes: e.target.value })} /></label>
                <button className="btn btn-ghost btn-icon" onClick={() => up({ attacks: d.attacks.filter((_, j) => j !== i) })} aria-label="Remover ataque"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="row mb">
            <label className="label" style={{ margin: 0 }}>Habilidades</label>
            <span className="spacer" />
            <button className="btn btn-sm" onClick={() => up({ abilities: [...d.abilities, { id: tmpId(), name: '', cost: '', text: '' }] })}><Plus size={13} /> Habilidade</button>
          </div>
          {d.abilities.length === 0 && <div className="tiny muted">Nenhuma habilidade.</div>}
          <div className="col">
            {d.abilities.map((h, i) => (
              <div key={h.id} className="card" style={{ padding: 10 }}>
                <div className="row-wrap" style={{ alignItems: 'flex-end' }}>
                  <label className="field small secondary grow">Nome
                    <input className="input" value={h.name} maxLength={LIMITS.itemName} onChange={(e) => setAbility(i, { name: e.target.value })} /></label>
                  <label className="field small secondary">Custo
                    <input className="input" style={{ width: 110 }} value={h.cost} maxLength={40} onChange={(e) => setAbility(i, { cost: e.target.value })} placeholder="3 PE" /></label>
                  <button className="btn btn-ghost btn-icon" onClick={() => up({ abilities: d.abilities.filter((_, j) => j !== i) })} aria-label="Remover habilidade"><Trash2 size={14} /></button>
                </div>
                <textarea className="textarea mt" style={{ minHeight: 60 }} value={h.text} maxLength={LIMITS.itemText} onChange={(e) => setAbility(i, { text: e.target.value })} placeholder="O que faz" />
              </div>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="label">Anotações do mestre</label>
          <textarea className="textarea" value={d.notes} maxLength={LIMITS.notes} onChange={(e) => up({ notes: e.target.value })} placeholder="Comportamento, fraquezas, táticas..." />
        </div>
      </div>
    </Modal>
  );
}
