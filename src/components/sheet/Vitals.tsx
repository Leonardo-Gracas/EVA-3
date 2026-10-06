import { useState } from 'react';
import { Heart, Zap, Minus, Plus, SlidersHorizontal } from 'lucide-react';
import type { Character } from '../../model/types';
import type { Derived } from '../../rules/derive';
import { conditionOf } from '../../rules/derive';
import { useAct } from '../act';
import ActButton from '../common/ActButton';
import ResourceAdjustModal, { peOps, pvOps, type AdjustStart, type AdjustTrack } from '../common/ResourceAdjust';

function pct(v: number, max: number) {
  return `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;
}

const CONDITION_TEXT: Record<string, { text: string; cls: string } | undefined> = {
  morto: { text: 'Morto', cls: 'badge badge-err' },
  inconsciente: { text: 'Inconsciente', cls: 'badge badge-warn' },
  'sem-pe': { text: 'Sem PE', cls: 'badge' },
};

export default function Vitals({ ch, d, readOnly }: { ch: Character; d: Derived; readOnly?: boolean }) {
  const { act, perm } = useAct();
  const [adjust, setAdjust] = useState<AdjustStart | null>(null);
  const cond = CONDITION_TEXT[conditionOf(ch, d)];
  const canOpen = !readOnly && perm('resource_change') !== 'blocked';

  const set = async (pv: number, pe: number, reason?: string) =>
    (await act({ type: 'resource/set', characterId: ch.id, pv: Math.max(d.deathAt, Math.min(d.pvMax, pv)), pe: Math.max(0, Math.min(d.peMax, pe)), reason })).ok;

  const tracks: AdjustTrack[] = [
    {
      key: 'pv', label: 'PV', icon: <Heart size={16} color="var(--pv)" />, color: 'var(--pv)', barClass: 'bar-pv',
      current: ch.current.pv, max: d.pvMax, min: d.deathAt,
      ops: pvOps(d.rdPhysical, d.rdMagic),
      status: (v) => v <= d.deathAt ? 'Fica com PV de morte: o personagem morre.'
        : v <= 0 && d.unconsciousAtZero ? 'Fica inconsciente (PV ≤ 0).'
        : v > 0 && ch.current.pv <= 0 ? 'Volta a ficar consciente.' : undefined,
    },
    {
      key: 'pe', label: 'PE', icon: <Zap size={16} color="var(--pe)" />, color: 'var(--pe)', barClass: 'bar-pe',
      current: ch.current.pe, max: d.peMax, min: 0,
      ops: peOps(),
      status: (v) => (v <= 0 ? 'Sem PE: não pode conjurar nem usar habilidades.' : undefined),
    },
  ];

  const step = (k: 'pv' | 'pe', delta: number) => {
    const pv = k === 'pv' ? ch.current.pv + delta : ch.current.pv;
    const pe = k === 'pe' ? ch.current.pe + delta : ch.current.pe;
    void set(pv, pe, `${delta > 0 ? '+' : ''}${delta} ${k.toUpperCase()}`);
  };

  const vital = (t: AdjustTrack, foot: string, footTitle: string, down: string, downOp: string, up: string, upOp: string) => (
    <div className="vital">
      <button className="vital-hit" disabled={!canOpen} title={canOpen ? `Ajustar ${t.label}` : undefined} onClick={() => setAdjust({ track: t.key })}>
        <div className="vital-top">
          {t.icon}
          <span className="vital-label" style={{ color: t.color }}>{t.label}</span>
          <span className="vital-num">{t.current}</span>
          <span className="vital-max">/ {t.max}</span>
        </div>
        <div className={`bar ${t.current < 0 ? 'bar-neg' : t.barClass}`} style={{ marginTop: 6 }}>
          <div style={{ width: t.current < 0 ? pct(-t.current, -d.deathAt) : pct(t.current, t.max!) }} />
        </div>
      </button>
      <div className="tiny muted" title={footTitle}>{foot}</div>
      {!readOnly && (
        <div className="vital-actions">
          <ActButton perm="resource_change" className="btn btn-sm btn-icon" title={`−1 ${t.label}`} aria-label={`−1 ${t.label}`}
            disabled={t.current <= (t.min ?? -Infinity)} onClick={() => step(t.key as 'pv', -1)}><Minus size={13} /></ActButton>
          <ActButton perm="resource_change" className="btn btn-sm btn-icon" title={`+1 ${t.label}`} aria-label={`+1 ${t.label}`}
            disabled={t.current >= t.max!} onClick={() => step(t.key as 'pv', 1)}><Plus size={13} /></ActButton>
          <ActButton perm="resource_change" onClick={() => setAdjust({ track: t.key, op: downOp })}>{down}</ActButton>
          <ActButton perm="resource_change" onClick={() => setAdjust({ track: t.key, op: upOp })}>{up}</ActButton>
        </div>
      )}
    </div>
  );

  return (
    <div className="card">
      <div className="row mb">
        <div className="card-title" style={{ margin: 0 }}>Vitalidade</div>
        {cond && <span className={cond.cls}>{cond.text}</span>}
        <div className="spacer" />
        {!readOnly && (
          <ActButton perm="resource_change" className="btn btn-sm btn-ghost" onClick={() => setAdjust({})}>
            <SlidersHorizontal size={14} /> Ajustar
          </ActButton>
        )}
      </div>
      <div className="grid-2">
        {vital(tracks[0], `Morre em ${d.deathAt}${d.unconsciousAtZero ? '' : ' · Inabalável'}`, d.breakdown.pv.join('\n'), 'Dano', 'phys', 'Curar', 'heal')}
        {vital(tracks[1], 'Zerado: sem conjurações e habilidades', d.breakdown.pe.join('\n'), 'Gastar', 'spend', 'Recuperar', 'recover')}
      </div>
      {adjust && (
        <ResourceAdjustModal title={`Ajustar ${ch.name}`} tracks={tracks} start={adjust} perm="resource_change"
          onApply={(k, v, reason) => (k === 'pv' ? set(v, ch.current.pe, reason) : set(ch.current.pv, v, reason))}
          onRestoreAll={{ label: 'Restaurar tudo', run: () => set(d.pvMax, d.peMax, 'Recuperação total') }}
          onClose={() => setAdjust(null)} />
      )}
    </div>
  );
}
