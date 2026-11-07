// Ícone "i" com informações objetivas: aparece ao passar o mouse ou ao tocar.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';

export default function InfoTip({ children, label = 'Informações', align = 'left', up = false }: {
  children: ReactNode; label?: string; align?: 'left' | 'right'; up?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span ref={root} className={`infotip${open ? ' open' : ''}`}>
      <button type="button" className="btn btn-sm btn-ghost btn-icon infotip-btn" aria-label={label} aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        <Info size={14} />
      </button>
      <span className={`infotip-pop ${align}${up ? ' up' : ''}`} role="tooltip">{children}</span>
    </span>
  );
}
