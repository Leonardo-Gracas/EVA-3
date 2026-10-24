// Peças do caderno de campanha: salvamento automático, texto que cresce,
// lista com marcação e o cartão de seção.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { CampaignCheck } from '../../model/types';
import { LIMITS } from '../../rules/validate';

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/**
 * Salva `value` sozinho, `delay` ms depois da última mudança (e na hora, ao sair da tela).
 * Compara com o que já foi salvo, então montar a tela não grava nada.
 */
export function useAutosave<T>(value: T, save: (v: T) => Promise<boolean>, delay = 700): SaveState {
  const [state, setState] = useState<SaveState>('idle');
  const saved = useRef(JSON.stringify(value));
  const latest = useRef(value);
  const saveRef = useRef(save);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  latest.current = value;
  saveRef.current = save;

  const run = async () => {
    timer.current = null;
    const json = JSON.stringify(latest.current);
    if (json === saved.current) { setState('saved'); return; }
    setState('saving');
    const ok = await saveRef.current(latest.current);
    if (ok) saved.current = json;
    setState(ok ? 'saved' : 'error');
  };

  useEffect(() => {
    if (JSON.stringify(value) === saved.current) return;
    setState('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void run(); }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay]);

  // Ao sair da tela com algo por salvar, salva já.
  useEffect(() => () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    if (JSON.stringify(latest.current) !== saved.current) void saveRef.current(latest.current);
  }, []);

  return state;
}

export function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const text = state === 'error' ? 'Não salvou' : state === 'saved' ? 'Salvo' : 'Salvando…';
  return (
    <span className={`camp-save camp-save-${state}`} role="status" aria-live="polite">
      {state === 'saved' && <Check size={12} />}{text}
    </span>
  );
}

/** Caixa de texto que cresce com o conteúdo. */
export function AutoTextarea({ value, minRows = 2, className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} rows={minRows} className={`textarea camp-text ${className}`} value={value} {...rest} />;
}

/** Cartão de seção: título, uma dica curta e o conteúdo. */
export function Section({ icon, title, hint, aside, children, className = '' }: {
  icon?: ReactNode; title: string; hint?: string; aside?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`camp-card ${className}`}>
      <header className="camp-card-head">
        {icon}<h3>{title}</h3>
        <span className="spacer" />
        {aside}
      </header>
      {hint && <p className="camp-hint">{hint}</p>}
      {children}
    </section>
  );
}

let tmp = 0;
export const tmpId = () => `c${Date.now().toString(36)}${(tmp++).toString(36)}`;

/**
 * Lista com marcação: cada linha se edita no lugar; Enter no campo de baixo acrescenta.
 * `doneLabel` explica o que a marca quer dizer ("revelado", "pronto", "resolvido").
 */
export function CheckList({ items, onChange, placeholder, doneLabel, max = 80 }: {
  items: CampaignCheck[]; onChange: (items: CampaignCheck[]) => void; placeholder: string; doneLabel: string; max?: number;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const text = draft.trim();
    if (!text || items.length >= max) return;
    onChange([...items, { id: tmpId(), text, done: false }]);
    setDraft('');
  };
  const set = (id: string, p: Partial<CampaignCheck>) => onChange(items.map((x) => (x.id === id ? { ...x, ...p } : x)));
  return (
    <div className="checklist">
      {items.map((x) => (
        <div key={x.id} className={`check-row${x.done ? ' done' : ''}`}>
          <button type="button" className="check-box" aria-pressed={x.done} title={x.done ? `Desmarcar (${doneLabel})` : `Marcar como ${doneLabel}`}
            onClick={() => set(x.id, { done: !x.done })}>
            {x.done && <Check size={12} />}
          </button>
          <input className="check-text" value={x.text} maxLength={LIMITS.campaignLine} aria-label="Texto"
            onChange={(e) => set(x.id, { text: e.target.value })}
            onBlur={(e) => { if (!e.target.value.trim()) onChange(items.filter((y) => y.id !== x.id)); }} />
          <button type="button" className="check-del" title="Remover" onClick={() => onChange(items.filter((y) => y.id !== x.id))}><X size={13} /></button>
        </div>
      ))}
      {items.length < max && (
        <div className="check-add">
          <Plus size={13} className="muted" />
          <input className="check-text" value={draft} maxLength={LIMITS.campaignLine} placeholder={placeholder} enterKeyHint="done"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            onBlur={add} />
        </div>
      )}
    </div>
  );
}
