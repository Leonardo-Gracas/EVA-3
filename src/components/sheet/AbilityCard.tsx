import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Ability } from '../../rules/abilities';
import { CLASSES } from '../../rules/classes';

export function costText(a: Ability): string | null {
  if (a.passive) return null;
  const parts: string[] = [];
  if (a.peCost) parts.push(`${a.peCost} PE`);
  if (a.pvCost) parts.push(`${a.pvCost} PV`);
  if (a.costNote) parts.push(a.costNote);
  return parts.join(' · ') || null;
}

export default function AbilityCard({
  ability, action, disabledReason, selected, onSelect, defaultOpen = false, showClass,
}: {
  ability: Ability;
  action?: ReactNode;
  disabledReason?: string;
  selected?: boolean;
  onSelect?: () => void;
  defaultOpen?: boolean;
  showClass?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const cost = costText(ability);
  const cls = CLASSES[ability.classId];
  return (
    <div className={`ability${disabledReason ? ' ability-disabled' : ''}${selected ? ' card-selected' : ''}`}>
      <div className="row" style={{ paddingRight: 10 }}>
        <button className="ability-head grow" onClick={() => (onSelect && !disabledReason ? onSelect() : setOpen(!open))}>
          {onSelect ? (
            <input type="radio" readOnly checked={!!selected} disabled={!!disabledReason} style={{ accentColor: 'var(--gold)' }} />
          ) : open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="ability-name">{ability.name}</span>
          {showClass && <span className="tiny" style={{ color: cls.color }}>{cls.name}</span>}
          {ability.minClassLevel > 1 && <span className="badge">{ability.minClassLevel}º nível</span>}
          <span className={ability.passive ? 'badge' : 'badge badge-gold'}>{ability.passive ? 'Passiva' : cost ?? 'Ativa'}</span>
          {disabledReason && <span className="tiny muted">{disabledReason}</span>}
        </button>
        {onSelect && (
          <button className="btn btn-ghost btn-icon" onClick={() => setOpen(!open)} aria-label="Detalhes">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
        {action}
      </div>
      {open && <div className="ability-body">{ability.text}</div>}
    </div>
  );
}
