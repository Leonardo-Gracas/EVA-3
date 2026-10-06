import type { ReactNode } from 'react';

export function TopBar({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="topbar">
      <span className="brand"><img src="/eva.svg" width={22} height={22} alt="" /> EVA 3</span>
      <span className="topbar-title">{title}</span>
      <div className="spacer" />
      {children}
    </header>
  );
}

/** `short`: rótulo curto usado na barra inferior do celular. */
export interface TabDef<T extends string> { id: T; label: string; short?: string; icon?: ReactNode; count?: number }

/** Com `mobileBar`, as abas viram uma barra de navegação fixa no rodapé em telas estreitas. */
export function Tabs<T extends string>({ tabs, value, onChange, mobileBar }: { tabs: TabDef<T>[]; value: T; onChange: (t: T) => void; mobileBar?: boolean }) {
  return (
    <nav className={`tabs${mobileBar ? ' tabs-mobile-bar' : ''}`}>
      {tabs.map((t) => (
        <button key={t.id} className={`tab${t.id === value ? ' tab-active' : ''}`} onClick={() => onChange(t.id)}
          aria-current={t.id === value ? 'page' : undefined} aria-label={t.count ? `${t.label} (${t.count})` : t.label}>
          <span className="tab-icon">{t.icon}{t.count ? <span className="count">{t.count}</span> : null}</span>
          <span className="tab-label">{t.label}</span>
          {mobileBar && <span className="tab-short">{t.short ?? t.label}</span>}
        </button>
      ))}
    </nav>
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
