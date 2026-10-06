import { useState, type ReactNode } from 'react';
import { ChevronRight, Menu } from 'lucide-react';
import Modal from '../common/Modal';

/** No celular, os filhos marcados com `desktop-only` somem e vão para a gaveta "Mais" das abas. */
export function TopBar({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="topbar">
      <span className="brand"><img src="/eva.svg" width={22} height={22} alt="" /> <span className="brand-text">EVA 3</span></span>
      <span className="topbar-title">{title}</span>
      <div className="spacer" />
      {children}
    </header>
  );
}

/** `short`: rótulo curto usado na barra inferior do celular. */
export interface TabDef<T extends string> { id: T; label: string; short?: string; icon?: ReactNode; count?: number }

/**
 * Com `mobileBar`, as abas viram uma barra de navegação fixa no rodapé em telas estreitas.
 * A barra mostra no máximo `mobileMax` itens; o resto das abas e o conteúdo de `more`
 * (dados e ações da sessão) ficam na gaveta "Mais".
 * Tocar na aba já aberta volta ao topo e chama `onReselect`.
 */
export function Tabs<T extends string>({ tabs, value, onChange, onReselect, mobileBar, mobileMax = 5, more }: {
  tabs: TabDef<T>[]; value: T; onChange: (t: T) => void; onReselect?: (t: T) => void;
  mobileBar?: boolean; mobileMax?: number; more?: (close: () => void) => ReactNode;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const needMore = !!mobileBar && (!!more || tabs.length > mobileMax);
  const primary = needMore ? mobileMax - 1 : tabs.length;
  const overflow = tabs.slice(primary);
  const overflowActive = overflow.some((t) => t.id === value);
  const overflowCount = overflow.reduce((n, t) => n + (t.count ?? 0), 0);

  const pick = (id: T) => {
    if (id === value) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      onReselect?.(id);
    } else {
      window.scrollTo({ top: 0 });
      onChange(id);
    }
  };

  return (
    <>
      <nav className={`tabs${mobileBar ? ' tabs-mobile-bar' : ''}`}>
        {tabs.map((t, i) => (
          <button key={t.id} className={`tab${t.id === value ? ' tab-active' : ''}${i >= primary ? ' tab-overflow' : ''}`} onClick={() => pick(t.id)}
            aria-current={t.id === value ? 'page' : undefined} aria-label={t.count ? `${t.label} (${t.count})` : t.label}>
            <span className="tab-icon">{t.icon}{t.count ? <span className="count">{t.count}</span> : null}</span>
            <span className="tab-label">{t.label}</span>
            {mobileBar && <span className="tab-short">{t.short ?? t.label}</span>}
          </button>
        ))}
        {needMore && (
          <button className={`tab tab-more${overflowActive ? ' tab-active' : ''}`} onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog" aria-label={overflowCount ? `Mais (${overflowCount})` : 'Mais'}>
            <span className="tab-icon"><Menu size={14} />{overflowCount ? <span className="count">{overflowCount}</span> : null}</span>
            <span className="tab-short">{overflowActive ? overflow.filter((t) => t.id === value).map((t) => t.short ?? t.label)[0] : 'Mais'}</span>
          </button>
        )}
      </nav>
      {/* Fora do <nav>: o backdrop-filter da barra prenderia o overlay fixo dentro dela. */}
      {needMore && (
        <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Mais">
          <div className="col gap-lg">
            {overflow.length > 0 && (
              <div className="menu-list">
                {overflow.map((t) => (
                  <button key={t.id} className={`menu-item${t.id === value ? ' on' : ''}`} onClick={() => { setMoreOpen(false); pick(t.id); }}>
                    <span className="menu-icon">{t.icon}</span>
                    <span className="grow">{t.label}</span>
                    {t.count ? <span className="count">{t.count}</span> : null}
                    <ChevronRight size={16} className="muted" />
                  </button>
                ))}
              </div>
            )}
            {more?.(() => setMoreOpen(false))}
          </div>
        </Modal>
      )}
    </>
  );
}

export function ConnStatus({ status, message }: { status: string; message: string }) {
  const on = status === 'online';
  return (
    <span className="conn" title={message}>
      <span className={`dot${on ? ' dot-on' : ''}`} style={!on && status !== 'idle' ? { background: 'var(--warning)' } : undefined} />
      <span className="hide-sm">{on ? 'Online' : message}</span>
    </span>
  );
}
