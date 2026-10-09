import { Eye } from 'lucide-react';
import type { Character } from '../../model/types';
import { deriveStats } from '../../rules/derive';
import Avatar from '../common/Avatar';
import { StatusBadge } from '../sheet/CharacterSheet';

/** Linha de ficha (personagem ou NPC) nas listas do mestre. */
export default function CharRow({ c, active, onClick }: { c: Character; active: boolean; onClick: () => void }) {
  const d = deriveStats(c);
  return (
    <button className={`card card-hover row${active ? ' card-selected' : ''}`} style={{ padding: '8px 10px', textAlign: 'left' }} onClick={onClick}>
      <Avatar config={c.avatar} size={32} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row">
          <strong className="grow">{c.name}</strong>
          {c.kind === 'npc' && c.visible && <Eye size={13} className="muted" />}
          <StatusBadge status={c.status} />
        </div>
        <div className="row tiny muted">
          <span className="gold">{d.title}</span> · Nv {d.level}
          <span className="spacer" />
          <span style={{ color: 'var(--pv)' }}>{c.current.pv}/{d.pvMax}</span>
          <span style={{ color: 'var(--pe)' }}>{c.current.pe}/{d.peMax}</span>
          <span style={{ color: 'var(--clareza)' }} title="Clareza">{c.current.clareza}/{d.clarezaMax}</span>
        </div>
      </div>
    </button>
  );
}
