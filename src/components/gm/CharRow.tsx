import { Eye } from 'lucide-react';
import type { Character } from '../../model/types';
import { deriveStats } from '../../rules/derive';
import Avatar from '../common/Avatar';
import { StatusBadge } from '../sheet/CharacterSheet';

const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;

/**
 * Linha de ficha (personagem ou NPC) nas listas do mestre. Com `bars`, PV, PE e Clareza
 * atuais aparecem em barras (NPCs são únicos: o estado deles importa).
 */
export default function CharRow({ c, active, onClick, bars }: { c: Character; active: boolean; onClick: () => void; bars?: boolean }) {
  const d = deriveStats(c);
  const tracks = [
    { key: 'PV', cur: c.current.pv, max: d.pvMax, cls: 'bar-pv', color: 'var(--pv)' },
    { key: 'PE', cur: c.current.pe, max: d.peMax, cls: 'bar-pe', color: 'var(--pe)' },
    { key: 'Clareza', cur: c.current.clareza, max: d.clarezaMax, cls: 'bar-clareza', color: 'var(--clareza)' },
  ];
  return (
    <button className={`card card-hover row${active ? ' card-selected' : ''}`} style={{ padding: '8px 10px', textAlign: 'left', alignItems: bars ? 'flex-start' : undefined }} onClick={onClick}>
      <Avatar config={c.avatar} size={bars ? 40 : 32} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row">
          <strong className="grow">{c.name}</strong>
          {c.kind === 'npc' && c.visible && <Eye size={13} className="muted" />}
          <StatusBadge status={c.status} />
        </div>
        <div className="row tiny muted">
          <span className="gold">{d.title}</span> · Nv {d.level}
          {!bars && (
            <>
              <span className="spacer" />
              {tracks.map((t) => <span key={t.key} style={{ color: t.color }} title={t.key}>{t.cur}/{t.max}</span>)}
            </>
          )}
        </div>
        {bars && (
          <div className="npc-bars">
            {tracks.map((t) => (
              <div key={t.key} className="npc-bar" title={`${t.key} ${t.cur}/${t.max}`}>
                <span className="npc-bar-lbl" style={{ color: t.color }}>{t.key === 'Clareza' ? 'CLA' : t.key}</span>
                <div className={`bar ${t.cur < 0 ? 'bar-neg' : t.cls}`}><div style={{ width: t.cur < 0 ? '100%' : pct(t.cur, t.max) }} /></div>
                <span className="npc-bar-num mono">{t.cur}/{t.max}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
