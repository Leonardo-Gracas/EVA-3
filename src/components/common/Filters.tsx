import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';

/** Texto comparável: sem acento e em minúsculas ("Espião" acha "espiao"). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Todas as palavras da busca aparecem em algum dos textos. */
export function matchesQuery(q: string, ...texts: string[]): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(texts.join(' '));
  return words.every((w) => hay.includes(w));
}

/** Liga/desliga um valor num conjunto de filtros (nenhum marcado = todos). */
export function toggleIn<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function SearchInput({ value, onChange, placeholder = 'Buscar', autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean;
}) {
  return (
    <div className="filter-search">
      <Search size={14} className="muted" />
      <input className="input" enterKeyHint="search" placeholder={placeholder} value={value} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} />
      {value && <button className="filter-clear-q" onClick={() => onChange('')} title="Limpar busca"><X size={14} /></button>}
    </div>
  );
}

/** Filtro de liga/desliga, com contagem opcional. */
export function Chip({ on, onClick, count, children, title }: {
  on: boolean; onClick: () => void; count?: number; children: ReactNode; title?: string;
}) {
  return (
    <button className={`chip${on ? ' on' : ''}`} onClick={onClick} title={title} aria-pressed={on}>
      {children}
      {count !== undefined && <span className="chip-count">{count}</span>}
    </button>
  );
}

/** Uma linha de filtros com rótulo ("Tipo", "Classe"...). */
export function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="filter-group">
      <span className="filter-label">{label}</span>
      <div className="chips">{children}</div>
    </div>
  );
}

export function SortSelect<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: Array<{ id: T; label: string }>;
}) {
  return (
    <label className="filter-sort">
      <span className="filter-label">Ordenar</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}

/**
 * Painel de busca: campo de texto e ordenação no topo, grupos de filtros abaixo e,
 * com filtros ativos, quantos resultados sobraram e o botão de limpar tudo.
 */
export function FilterBar({ search, sort, children, active, shown, total, onClear, noun }: {
  search: ReactNode; sort?: ReactNode; children?: ReactNode;
  active: boolean; shown: number; total: number; onClear: () => void; noun: [string, string];
}) {
  return (
    <div className="filters">
      <div className="filters-top">
        {search}
        {sort}
      </div>
      {children}
      {active && (
        <div className="filters-status">
          <span>{shown} de {total} {total === 1 ? noun[0] : noun[1]}</span>
          <button className="btn btn-sm btn-ghost" onClick={onClear}><X size={13} /> Limpar filtros</button>
        </div>
      )}
    </div>
  );
}
