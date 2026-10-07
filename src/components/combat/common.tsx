// Peças da tela de combate usadas pelo mestre e pelo jogador.
import { useEffect, type RefObject } from 'react';
import { Hourglass, X } from 'lucide-react';
import type { CombatHealth, CombatSide } from '../../model/types';
import { HEALTH_LABELS } from '../../store/combat';

/** Mede a barra superior fixa para a barra de turno grudar logo abaixo dela. */
export function useTopbarHeight(root: RefObject<HTMLElement>) {
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('.topbar');
    const el = root.current;
    if (!bar || !el) return;
    const sync = () => el.style.setProperty('--topbar-h', `${bar.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [root]);
}

export function sideClass(side: CombatSide) {
  return `side-${side}`;
}

export function HealthBadge({ health }: { health: CombatHealth }) {
  const h = HEALTH_LABELS[health];
  return <span className={`badge ${h.cls}`}>{h.label}</span>;
}

export function roundsLabel(rounds: number | null) {
  return rounds === null ? '' : rounds === 1 ? '1 rodada' : `${rounds} rodadas`;
}

/** Condição pronta para exibir: `rounds` = rodadas restantes; `hint` = onde termina. */
export interface ChipCondition { id: string; name: string; rounds: number | null; hint?: string }

/** Condições como fichas: "Atordoado ⌛2". Com `onRemove`, cada uma ganha um ×. */
export function ConditionChips({ conditions, onRemove }: {
  conditions: ChipCondition[];
  onRemove?: (id: string) => void;
}) {
  if (!conditions.length) return null;
  return (
    <span className="cond-chips">
      {conditions.map((c) => (
        <span key={c.id} className={`cond-chip${c.rounds === 1 ? ' cond-last' : ''}`}
          title={c.hint ?? (c.rounds === null ? `${c.name}: até ser removida` : `${c.name}: ${roundsLabel(c.rounds)} restante${c.rounds > 1 ? 's' : ''}`)}>
          {c.name}
          {c.rounds !== null && <span className="cond-rounds"><Hourglass size={10} />{c.rounds}</span>}
          {onRemove && (
            <button type="button" className="cond-x" aria-label={`Remover ${c.name}`}
              onClick={(e) => { e.stopPropagation(); onRemove(c.id); }}>
              <X size={11} />
            </button>
          )}
        </span>
      ))}
    </span>
  );
}

export function pct(v: number, max: number) {
  return `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;
}
