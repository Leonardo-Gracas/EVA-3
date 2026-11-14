import { AFFINITY_LEVELS, type Affinity } from '../../model/types';

/** Cinco níveis sem nome, só cor: vermelho, vermelho claro, branco, verde claro, verde. */
export const AFFINITY_COLORS: Record<Affinity, string> = {
  [-2]: '#d6454f',
  [-1]: '#eda0a5',
  0: '#f2ede4',
  1: '#a6dbb8',
  2: '#4fae74',
};

const position = (level: Affinity) => AFFINITY_LEVELS.indexOf(level) + 1;

/** Cor de um nível, só para ler. */
export function AffinityDot({ level, title, size = 14 }: { level: Affinity; title?: string; size?: number }) {
  return (
    <span className="affinity-dot" title={title} role="img" aria-label={`${title ? `${title}: ` : ''}${position(level)} de 5`}
      style={{ width: size, height: size, background: AFFINITY_COLORS[level] }} />
  );
}

/** As cinco cores lado a lado; a marcada fica com o anel. */
export function AffinityPicker({ value, onChange, label, disabled }: {
  value: Affinity; onChange: (level: Affinity) => void; label: string; disabled?: boolean;
}) {
  return (
    <div className="affinity-picker" role="radiogroup" aria-label={label} title={label}>
      {AFFINITY_LEVELS.map((lv) => (
        <button key={lv} type="button" role="radio" aria-checked={lv === value} aria-label={`${position(lv)} de 5`}
          className={`affinity-opt${lv === value ? ' on' : ''}`} disabled={disabled}
          style={{ background: AFFINITY_COLORS[lv] }}
          onClick={() => { if (lv !== value) onChange(lv); }} />
      ))}
    </div>
  );
}

/** Legenda das pontas da escala: os níveis não têm nome. */
export function AffinityLegend() {
  return (
    <span className="affinity-legend tiny muted">
      Não gosta
      <span className="affinity-scale" aria-hidden>
        {AFFINITY_LEVELS.map((lv) => <span key={lv} style={{ background: AFFINITY_COLORS[lv] }} />)}
      </span>
      Gosta
    </span>
  );
}
