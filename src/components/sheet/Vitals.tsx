import { useState } from 'react';
import { Heart, Zap, Minus, Plus, SlidersHorizontal } from 'lucide-react';
import type { Character } from '../../model/types';
import type { Derived } from '../../rules/derive';
import { conditionOf } from '../../rules/derive';
import { useAct } from '../act';
import ActButton from '../common/ActButton';
import Modal from '../common/Modal';

function pct(v: number, max: number) {
  return `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;
}

const CONDITION_TEXT: Record<string, { text: string; cls: string } | undefined> = {
  morto: { text: 'Morto', cls: 'badge badge-err' },
  inconsciente: { text: 'Inconsciente', cls: 'badge badge-warn' },
  'sem-pe': { text: 'Sem PE', cls: 'badge' },
};

export default function Vitals({ ch, d, readOnly }: { ch: Character; d: Derived; readOnly?: boolean }) {
  const { act } = useAct();
  const [adjust, setAdjust] = useState(false);
  const cond = CONDITION_TEXT[conditionOf(ch, d)];

  const set = (pv: number, pe: number, reason?: string) =>
    act({ type: 'resource/set', characterId: ch.id, pv: Math.max(d.deathAt, Math.min(d.pvMax, pv)), pe: Math.max(0, Math.min(d.peMax, pe)), reason });

  return (
    <div className="card">
      <div className="row mb">
        <div className="card-title" style={{ margin: 0 }}>Vitalidade</div>
        {cond && <span className={cond.cls}>{cond.text}</span>}
        <div className="spacer" />
        {!readOnly && (
          <ActButton perm="resource_change" className="btn btn-sm btn-ghost" onClick={() => setAdjust(true)}>
            <SlidersHorizontal size={14} /> Ajustar
          </ActButton>
        )}
      </div>
      <div className="grid-2">
        <div className="vital">
          <div className="vital-top">
            <Heart size={16} color="var(--pv)" />
            <span className="vital-label" style={{ color: 'var(--pv)' }}>PV</span>
            <span className="vital-num">{ch.current.pv}</span>
            <span className="vital-max">/ {d.pvMax}</span>
          </div>
          <div className={`bar ${ch.current.pv < 0 ? 'bar-neg' : 'bar-pv'}`}>
            <div style={{ width: ch.current.pv < 0 ? pct(-ch.current.pv, -d.deathAt) : pct(ch.current.pv, d.pvMax) }} />
          </div>
          <div className="tiny muted" title={d.breakdown.pv.join('\n')}>
            Morre em {d.deathAt}{!d.unconsciousAtZero && ' · Inabalável'}
          </div>
          {!readOnly && (
            <div className="vital-actions">
              <ActButton perm="resource_change" onClick={() => set(ch.current.pv - 1, ch.current.pe)} aria-label="-1 PV"><Minus size={13} /></ActButton>
              <ActButton perm="resource_change" onClick={() => set(ch.current.pv + 1, ch.current.pe)} aria-label="+1 PV"><Plus size={13} /></ActButton>
            </div>
          )}
        </div>
        <div className="vital">
          <div className="vital-top">
            <Zap size={16} color="var(--pe)" />
            <span className="vital-label" style={{ color: 'var(--pe)' }}>PE</span>
            <span className="vital-num">{ch.current.pe}</span>
            <span className="vital-max">/ {d.peMax}</span>
          </div>
          <div className="bar bar-pe"><div style={{ width: pct(ch.current.pe, d.peMax) }} /></div>
          <div className="tiny muted" title={d.breakdown.pe.join('\n')}>Zerado: sem conjurações e habilidades</div>
          {!readOnly && (
            <div className="vital-actions">
              <ActButton perm="resource_change" onClick={() => set(ch.current.pv, ch.current.pe - 1)} aria-label="-1 PE"><Minus size={13} /></ActButton>
              <ActButton perm="resource_change" onClick={() => set(ch.current.pv, ch.current.pe + 1)} aria-label="+1 PE"><Plus size={13} /></ActButton>
            </div>
          )}
        </div>
      </div>
      {adjust && <AdjustModal ch={ch} d={d} onClose={() => setAdjust(false)} onSave={set} />}
    </div>
  );
}

function AdjustModal({ ch, d, onClose, onSave }: {
  ch: Character; d: Derived; onClose: () => void; onSave: (pv: number, pe: number, reason?: string) => Promise<unknown>;
}) {
  const [amount, setAmount] = useState('');
  const [pv, setPv] = useState(String(ch.current.pv));
  const [pe, setPe] = useState(String(ch.current.pe));
  const [reason, setReason] = useState('');
  const n = Math.abs(parseInt(amount, 10) || 0);

  const quick = (dpv: number, dpe: number, label: string) => {
    setPv(String(Math.max(d.deathAt, Math.min(d.pvMax, (parseInt(pv, 10) || 0) + dpv))));
    setPe(String(Math.max(0, Math.min(d.peMax, (parseInt(pe, 10) || 0) + dpe))));
    if (!reason) setReason(label);
  };

  const save = async () => {
    await onSave(parseInt(pv, 10) || 0, parseInt(pe, 10) || 0, reason.trim() || undefined);
    onClose();
  };

  return (
    <Modal open title={`Ajustar ${ch.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={save}>Salvar</button></>}>
      <div className="col gap-lg">
        <div className="field">
          <label className="label">Quantidade</label>
          <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} placeholder="Ex.: 5" />
          <div className="row-wrap">
            <button className="btn btn-sm" disabled={!n} onClick={() => quick(-n, 0, 'Dano')}>Dano −{n || ''} PV</button>
            <button className="btn btn-sm" disabled={!n} onClick={() => quick(n, 0, 'Cura')}>Cura +{n || ''} PV</button>
            <button className="btn btn-sm" disabled={!n} onClick={() => quick(0, -n, 'Gasto')}>Gastar {n || ''} PE</button>
            <button className="btn btn-sm" disabled={!n} onClick={() => quick(0, n, 'Recuperação')}>Recuperar {n || ''} PE</button>
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label">PV atual (máx. {d.pvMax}, morte {d.deathAt})</label>
            <input className="input" value={pv} onChange={(e) => setPv(e.target.value.replace(/[^\d-]/g, ''))} />
          </div>
          <div className="field">
            <label className="label">PE atual (máx. {d.peMax})</label>
            <input className="input" value={pe} onChange={(e) => setPe(e.target.value.replace(/[^\d]/g, ''))} />
          </div>
        </div>
        <div className="field">
          <label className="label">Motivo (opcional)</label>
          <input className="input" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="row-wrap">
          <button className="btn btn-sm btn-ghost" onClick={() => { setPv(String(d.pvMax)); setPe(String(d.peMax)); setReason('Recuperação total'); }}>Restaurar tudo</button>
        </div>
      </div>
    </Modal>
  );
}
