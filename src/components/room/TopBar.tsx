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

export interface TabDef<T extends string> { id: T; label: string; icon?: ReactNode; count?: number }

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: TabDef<T>[]; value: T; onChange: (t: T) => void }) {
  return (
    <nav className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={`tab${t.id === value ? ' tab-active' : ''}`} onClick={() => onChange(t.id)}>
          {t.icon}{t.label}{t.count ? <span className="count">{t.count}</span> : null}
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
