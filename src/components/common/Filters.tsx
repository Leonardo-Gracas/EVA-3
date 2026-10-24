import { useState, type ReactNode } from 'react';
import { ArrowDownUp, Search, SlidersHorizontal, X } from 'lucide-react';

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
        onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
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
    <div className="filter-group">
      <span className="filter-label">Ordenar</span>
      <label className="filter-sort">
        <ArrowDownUp size={13} className="muted" />
        <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)} aria-label="Ordenar">
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
    </div>
  );
}

/**
 * Seletor de um valor só, em pílulas numa linha que rola de lado: o filtro principal
 * da lista (tipo de item, categoria de ameaça), sempre à vista. `null` = todos.
 */
export function QuickFilter<T extends string>({ value, onChange, options, total, label }: {
  value: T | null; onChange: (v: T | null) => void; total: number; label: string;
  options: Array<{ id: T; label: string; count: number; icon?: ReactNode }>;
}) {
  return (
    <div className="quick-filter" role="radiogroup" aria-label={label}>
      <button role="radio" aria-checked={value === null} className={`qf${value === null ? ' on' : ''}`} onClick={() => onChange(null)}>
        Todos<span className="qf-count">{total}</span>
      </button>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} className={`qf${value === o.id ? ' on' : ''}`}
          onClick={() => onChange(value === o.id ? null : o.id)}>
          {o.icon}{o.label}<span className="qf-count">{o.count}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Barra de busca enxuta: campo de texto, botão "Filtros" (com quantos estão ligados) e a
 * ação principal da tela. A ordenação e os grupos de filtros ficam recolhidos no painel
 * do botão; `quick` (opcional) é o filtro principal, sempre à vista logo abaixo.
 * Com algo filtrado, mostra quantos resultados sobraram e o botão de limpar tudo.
 */
export function FilterBar({ search, sort, children, quick, action, filterCount = 0, active, shown, total, onClear, noun }: {
  search: ReactNode; sort?: ReactNode; children?: ReactNode; quick?: ReactNode; action?: ReactNode;
  /** Filtros ligados dentro do painel (não conta a busca nem `quick`). */
  filterCount?: number;
  active: boolean; shown: number; total: number; onClear: () => void; noun: [string, string];
}) {
  const [open, setOpen] = useState(false);
  const hasPanel = !!children || !!sort;
  return (
    <div className="filters">
      <div className="filters-top">
        {search}
        {hasPanel && (
          <button className={`btn btn-sm filters-toggle${open ? ' on' : ''}${filterCount ? ' has' : ''}`} onClick={() => setOpen(!open)}
            aria-expanded={open} title={open ? 'Esconder filtros' : 'Filtrar e ordenar'}>
            <SlidersHorizontal size={14} /><span className="filters-toggle-label">Filtros</span>
            {filterCount > 0 && <span className="filters-badge">{filterCount}</span>}
          </button>
        )}
        {action}
      </div>
      {quick}
      {open && hasPanel && (
        <div className="filters-panel">
          {sort}
          {children}
        </div>
      )}
      {active && (
        <div className="filters-status">
          <span>{shown} de {total} {total === 1 ? noun[0] : noun[1]}</span>
          <button className="btn btn-sm btn-ghost" onClick={onClear}><X size={13} /> Limpar</button>
        </div>
      )}
    </div>
  );
}
