// Peças do caderno de campanha: salvamento automático, texto que cresce,
// lista com marcação, o cartão de seção e os seletores de data e de arco.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { CalendarDays, Check, ChevronDown, Milestone, Plus, X } from 'lucide-react';
import { ARC_STATUS, type CampaignArc, type CampaignCheck } from '../../model/types';
import { formatSessionDate } from '../../model/campaign';
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

/**
 * Data em pílula: mostra a data por extenso e abre o calendário do sistema ao toque.
 * O campo nativo fica invisível por cima da pílula (no celular o toque nele já abre o
 * calendário; no computador, `showPicker`).
 */
export function DatePill({ value, onChange, label = 'Data' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const text = formatSessionDate(value);
  const openPicker = (el: HTMLInputElement) => {
    try { el.showPicker(); } catch { /* navegador sem showPicker: o próprio campo resolve */ }
  };
  return (
    <span className={`camp-pill${value ? ' set' : ''}`}>
      <span className="camp-pill-main">
        <CalendarDays size={14} />
        <span className="camp-pill-text">{text || 'Marcar data'}</span>
        <input type="date" className="camp-date-native" value={value} aria-label={label} title={label}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => openPicker(e.currentTarget)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(e.currentTarget); } }} />
      </span>
      {value && <button type="button" className="camp-pill-x" aria-label="Tirar a data" title="Tirar a data" onClick={() => onChange('')}><X size={12} /></button>}
    </span>
  );
}

/** Escolha do arco em pílula, com a lista dos arcos (situação e ordem da campanha). */
export function ArcPicker({ arcs, value, onChange }: { arcs: CampaignArc[]; value: string | null; onChange: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const current = arcs.find((a) => a.id === value) ?? null;
  // "Sem arco" só aparece para quem já está sem arco (sessões antigas ou de arco excluído).
  const options: (CampaignArc | null)[] = current ? arcs : [...arcs, null];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    // Foco no arco escolhido, para seguir pelas setas.
    const sel = list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]') ?? list.current?.querySelector('button');
    sel?.focus();
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const close = () => { setOpen(false); trigger.current?.focus(); };
  const pick = (id: string | null) => { onChange(id); close(); };
  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
  };

  return (
    <div className="camp-pick" ref={wrap}>
      <button ref={trigger} type="button" className={`camp-pill camp-pill-main${current ? ' set' : ' warn'}`} aria-haspopup="listbox" aria-expanded={open}
        title="Arco da campanha" onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}>
        {current ? <span className={`arc-dot arc-${current.status}`} /> : <Milestone size={14} />}
        <span className="camp-pill-text">{current ? current.title : 'Sem arco'}</span>
        <ChevronDown size={14} className={`camp-pick-caret${open ? ' up' : ''}`} />
      </button>
      {open && (
        <div ref={list} className="camp-pick-menu" role="listbox" aria-label="Arco da campanha" onKeyDown={onListKey}>
          {arcs.length === 0 && <p className="camp-pick-empty">Nenhum arco ainda. Crie os arcos na visão geral.</p>}
          {options.map((a, i) => {
            const on = (a?.id ?? null) === (current?.id ?? null);
            return (
              <button key={a?.id ?? 'sem-arco'} type="button" role="option" aria-selected={on} className={`camp-pick-opt${on ? ' on' : ''}`}
                onClick={() => pick(a?.id ?? null)}>
                {a ? <span className={`arc-dot arc-${a.status}`} /> : <Milestone size={13} className="muted" />}
                <span className="grow">
                  <span className="camp-pick-title">{a ? a.title : 'Sem arco'}</span>
                  <span className="camp-pick-sub">{a ? `Arco ${i + 1} · ${ARC_STATUS[a.status]}` : 'Fora dos capítulos da campanha'}</span>
                </span>
                {on && <Check size={14} className="gold" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
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
