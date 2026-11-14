// Peças do caderno de campanha: salvamento automático, texto que cresce (com negrito e
// itálico), lista com marcação, o cartão de seção e os seletores de data e de arco.
import {
  Fragment, useEffect, useLayoutEffect, useRef, useState,
  type ClipboardEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject,
} from 'react';
import { Bold, CalendarDays, Check, ChevronDown, GripVertical, Italic, Milestone, Plus, X } from 'lucide-react';
import { ARC_STATUS, type CampaignArc, type CampaignCheck } from '../../model/types';
import { formatSessionDate } from '../../model/campaign';
import { LIMITS } from '../../rules/validate';
import { parseRich, richFromRuns, type RichNode, type RichRun } from './format';

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

// ── Negrito e itálico ────────────────────────────────────────────────────────
// Os campos de texto da campanha são editores que já mostram o negrito e o itálico (sem os
// asteriscos à vista) e quebram a linha quando o texto passa da largura. Por baixo, o texto
// continua guardado com as marcas do Markdown (**negrito** e *itálico*).

function renderRich(nodes: RichNode[]): ReactNode[] {
  return nodes.map((n, k) => (typeof n === 'string'
    ? <Fragment key={k}>{n}</Fragment>
    : n.kind === 'b' ? <strong key={k}>{renderRich(n.children)}</strong> : <em key={k}>{renderRich(n.children)}</em>));
}

/** Texto da campanha com **negrito** e *itálico* já aplicados. */
export function RichText({ text }: { text: string }) {
  return <>{renderRich(parseRich(text))}</>;
}

/** Monta no editor o texto com marcas, já formatado. */
function fillEditor(el: HTMLElement, text: string) {
  const build = (nodes: RichNode[], parent: Node) => {
    for (const n of nodes) {
      if (typeof n === 'string') {
        n.split('\n').forEach((part, k) => {
          if (k > 0) parent.appendChild(document.createElement('br'));
          if (part) parent.appendChild(document.createTextNode(part));
        });
      } else {
        const tag = document.createElement(n.kind === 'b' ? 'strong' : 'em');
        build(n.children, tag);
        parent.appendChild(tag);
      }
    }
  };
  el.replaceChildren();
  build(parseRich(text), el);
  // Uma quebra no fim só aparece na tela com outra <br> depois dela.
  if (text.endsWith('\n')) el.appendChild(document.createElement('br'));
}

const BLOCKS = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'PRE']);

/** Lê o editor de volta para o texto com marcas. */
function readEditor(el: HTMLElement): string {
  const runs: RichRun[] = [];
  let text = '';
  let afterBlock = false;
  const push = (t: string, b: boolean, i: boolean) => {
    if (!t) return;
    if (afterBlock && text && !text.endsWith('\n')) { runs.push({ text: '\n', b: false, i: false }); text += '\n'; }
    afterBlock = false;
    runs.push({ text: t, b, i });
    text += t;
  };
  const walk = (node: Node, b: boolean, i: boolean) => {
    node.childNodes.forEach((c) => {
      if (c.nodeType === Node.TEXT_NODE) { push((c.textContent ?? '').replace(/ /g, ' ').replace(/\r/g, ''), b, i); return; }
      if (!(c instanceof HTMLElement)) return;
      if (c.tagName === 'BR') { push('\n', b, i); return; }
      let cb = b, ci = i;
      if (c.tagName === 'B' || c.tagName === 'STRONG') cb = true;
      if (c.tagName === 'I' || c.tagName === 'EM') ci = true;
      const fw = c.style.fontWeight;
      if (fw) cb = fw === 'bold' || fw === 'bolder' || Number(fw) >= 600;
      const fs = c.style.fontStyle;
      if (fs) ci = fs === 'italic' || fs === 'oblique';
      const block = BLOCKS.has(c.tagName);
      if (block) afterBlock = true;
      walk(c, cb, ci);
      if (block) afterBlock = true;
    });
  };
  walk(el, false, false);
  // A <br> do fim só serve para mostrar a linha vazia: não é mais uma quebra.
  let last: Node | null = el.lastChild;
  while (last?.lastChild) last = last.lastChild;
  if (last instanceof HTMLElement && last.tagName === 'BR' && runs[runs.length - 1]?.text === '\n') runs.pop();
  return richFromRuns(runs);
}

/** Liga/desliga negrito ou itálico na seleção (ou no que for digitado a seguir), mantendo o Ctrl+Z. */
function applyFormat(el: HTMLElement, cmd: 'bold' | 'italic') {
  if (document.activeElement !== el) el.focus();
  try {
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(cmd);
  } catch { /* navegador sem execCommand: fica sem formatar */ }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Botões B e I (para o celular, sem atalho). Não tiram o foco do campo. */
function MarkButtons({ target, className = '' }: { target: (btn: HTMLElement) => HTMLElement | null | undefined; className?: string }) {
  const press = (btn: HTMLElement, cmd: 'bold' | 'italic') => { const el = target(btn); if (el) applyFormat(el, cmd); };
  return (
    <span className={`mark-bar ${className}`} onMouseDown={(e) => e.preventDefault()}>
      <button type="button" tabIndex={-1} title="Negrito (Ctrl+B)" aria-label="Negrito" onClick={(e) => press(e.currentTarget, 'bold')}><Bold size={13} /></button>
      <button type="button" tabIndex={-1} title="Itálico (Ctrl+I)" aria-label="Itálico" onClick={(e) => press(e.currentTarget, 'italic')}><Italic size={13} /></button>
    </span>
  );
}

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Com várias linhas (Enter quebra a linha); sem, Enter chama `onEnter`. */
  multiline?: boolean;
  minRows?: number;
  maxLength?: number;
  placeholder?: string;
  className?: string;
  onEnter?: () => void;
  onBlur?: (value: string) => void;
  'aria-label'?: string;
  enterKeyHint?: 'done' | 'enter' | 'next';
  editorRef?: RefObject<HTMLDivElement>;
}

/** Editor de texto com negrito e itálico à vista. O texto quebra a linha sozinho. */
function RichEditor({ value, onChange, multiline = false, minRows, maxLength, placeholder, className = '', onEnter, onBlur, editorRef, ...rest }: EditorProps) {
  const own = useRef<HTMLDivElement>(null);
  const ref = editorRef ?? own;
  // O texto que está no editor agora. Só redesenha quando o valor muda por fora.
  const shown = useRef<string | null>(null);
  const max = useRef(maxLength);
  max.current = maxLength;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || value === shown.current) return;
    shown.current = value;
    fillEditor(el, value);
  }, [value, ref]);

  // Não deixa digitar além do limite.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onBefore = (e: InputEvent) => {
      if (!max.current || !e.inputType.startsWith('insert')) return;
      if ((shown.current?.length ?? 0) >= max.current && window.getSelection()?.isCollapsed) e.preventDefault();
    };
    el.addEventListener('beforeinput', onBefore);
    return () => el.removeEventListener('beforeinput', onBefore);
  }, [ref]);

  const sync = () => {
    const el = ref.current;
    if (!el) return;
    let v = readEditor(el);
    if (!multiline) v = v.replace(/\n+/g, ' ');
    if (maxLength && v.length > maxLength) v = v.slice(0, maxLength);
    if (v === shown.current) return;
    shown.current = v;
    onChange(v);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'b' || k === 'i') { e.preventDefault(); applyFormat(e.currentTarget, k === 'b' ? 'bold' : 'italic'); return; }
      if (k === 'u') { e.preventDefault(); return; } // sublinhado não é guardado
    }
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!multiline) { onEnter?.(); return; }
      if ((shown.current?.length ?? 0) >= (maxLength ?? Infinity)) return;
      let ok = false;
      try { ok = document.execCommand('insertLineBreak'); } catch { ok = false; }
      if (!ok) document.execCommand('insertText', false, '\n');
    }
  };

  // Colar entra como texto puro (sem a formatação de onde veio).
  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    let t = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
    if (!multiline) t = t.replace(/\s*\n\s*/g, ' ');
    if (maxLength) {
      const selected = window.getSelection()?.toString().length ?? 0;
      t = t.slice(0, Math.max(0, maxLength - (shown.current?.length ?? 0) + selected));
    }
    if (t) document.execCommand('insertText', false, t);
  };

  return (
    <div ref={ref} className={`rich-edit ${className}${value ? '' : ' is-empty'}`} contentEditable suppressContentEditableWarning
      role="textbox" aria-multiline={multiline} aria-label={rest['aria-label']} aria-placeholder={placeholder} data-placeholder={placeholder}
      enterKeyHint={rest.enterKeyHint} tabIndex={0}
      style={multiline && minRows ? { minHeight: `calc(${(minRows * 1.6).toFixed(2)}em + 20px)` } : undefined}
      onInput={sync} onKeyDown={onKeyDown} onPaste={onPaste} onDrop={(e) => e.preventDefault()}
      onBlur={() => onBlur?.(shown.current ?? '')} />
  );
}

type FieldProps = Omit<EditorProps, 'multiline' | 'editorRef'>;

/** Caixa de texto da campanha: cresce com o conteúdo, com negrito e itálico (botões B e I ao editar). */
export function AutoTextarea({ minRows = 2, className = '', ...rest }: FieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="rich-field">
      <RichEditor multiline minRows={minRows} editorRef={ref} className={`textarea camp-text ${className}`} {...rest} />
      <MarkButtons target={() => ref.current} />
    </div>
  );
}

/**
 * Campo de uma linha só (Enter não quebra), mas que quebra na tela quando o texto é comprido.
 * Com `bar`, traz os próprios botões B e I; sem, quem usa põe os botões ao lado (como nas listas).
 */
export function RichLine({ bar = false, ...rest }: FieldProps & { bar?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="rich-line">
      <RichEditor editorRef={ref} {...rest} />
      {bar && <MarkButtons target={() => ref.current} />}
    </div>
  );
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

/** O campo de texto da linha em que está o botão (para os botões B e I). */
const rowInput = (btn: HTMLElement) => btn.closest('.check-row, .check-add')?.querySelector<HTMLElement>('.check-text');

/**
 * Lista com marcação: cada linha se edita no lugar; Enter no campo de baixo acrescenta.
 * `doneLabel` explica o que a marca quer dizer ("revelado", "pronto", "resolvido").
 * Com `sortable`, cada linha ganha uma alça à esquerda para arrastar (ou mover pelas setas).
 */
export function CheckList({ items, onChange, placeholder, doneLabel, max = 80, sortable = false }: {
  items: CampaignCheck[]; onChange: (items: CampaignCheck[]) => void; placeholder: string; doneLabel: string; max?: number; sortable?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const list = useRef<HTMLDivElement>(null);
  // Arrasto: `geo` guarda as medidas do início; `drag` só desenha.
  const geo = useRef<{ startY: number; mids: number[]; from: number; to: number } | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number; h: number } | null>(null);

  const add = () => {
    const text = draft.trim();
    if (!text || items.length >= max) return;
    onChange([...items, { id: tmpId(), text, done: false }]);
    setDraft('');
  };
  const set = (id: string, p: Partial<CampaignCheck>) => onChange(items.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || to === from) return;
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    onChange(next);
  };

  const startDrag = (e: ReactPointerEvent<HTMLButtonElement>, idx: number) => {
    if (e.button !== 0 || items.length < 2) return;
    e.preventDefault();
    const rows = [...(list.current?.querySelectorAll<HTMLElement>(':scope > .check-row') ?? [])];
    const rects = rows.map((r) => r.getBoundingClientRect());
    if (!rects[idx]) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    geo.current = { startY: e.clientY, mids: rects.map((r) => r.top + r.height / 2), from: idx, to: idx };
    setDrag({ from: idx, to: idx, dy: 0, h: rects[idx].height });
  };
  const moveDrag = (e: ReactPointerEvent) => {
    const g = geo.current;
    if (!g) return;
    const { mids, from } = g;
    // Não sai da lista: no máximo até a primeira ou a última linha.
    const dy = Math.max(mids[0] - mids[from], Math.min(mids[mids.length - 1] - mids[from], e.clientY - g.startY));
    const center = mids[from] + dy;
    g.to = mids.filter((m, i) => i !== from && m < center).length;
    setDrag((d) => d && { ...d, dy, to: g.to });
  };
  const endDrag = (commit: boolean) => {
    const g = geo.current;
    geo.current = null;
    setDrag(null);
    if (commit && g) move(g.from, g.to);
  };
  // Enquanto arrasta, a linha segue o dedo e as do caminho abrem espaço.
  const shift = (idx: number): string | undefined => {
    if (!drag) return undefined;
    if (idx === drag.from) return `translateY(${drag.dy}px)`;
    if (drag.from < drag.to && idx > drag.from && idx <= drag.to) return `translateY(${-drag.h}px)`;
    if (drag.to < drag.from && idx >= drag.to && idx < drag.from) return `translateY(${drag.h}px)`;
    return undefined;
  };

  return (
    <div ref={list} className={`checklist${sortable ? ' sortable' : ''}${drag ? ' is-dragging' : ''}`}>
      {items.map((x, idx) => (
        <div key={x.id} className={`check-row${x.done ? ' done' : ''}${drag?.from === idx ? ' dragging' : ''}`} style={{ transform: shift(idx) }}>
          {sortable && (
            <button type="button" className="check-grip" title="Arraste para reordenar" aria-label={`Mover "${x.text}" (setas para cima e para baixo)`}
              onPointerDown={(e) => startDrag(e, idx)} onPointerMove={moveDrag}
              onPointerUp={() => endDrag(true)} onPointerCancel={() => endDrag(false)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') { e.preventDefault(); move(idx, idx - 1); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); move(idx, idx + 1); }
              }}>
              <GripVertical size={14} />
            </button>
          )}
          <button type="button" className="check-box" aria-pressed={x.done} title={x.done ? `Desmarcar (${doneLabel})` : `Marcar como ${doneLabel}`}
            onClick={() => set(x.id, { done: !x.done })}>
            {x.done && <Check size={12} />}
          </button>
          <RichLine className="check-text" value={x.text} maxLength={LIMITS.campaignLine} aria-label="Texto"
            onChange={(v) => set(x.id, { text: v })}
            onBlur={(v) => { if (!v.trim()) onChange(items.filter((y) => y.id !== x.id)); }} />
          <MarkButtons target={rowInput} />
          <button type="button" className="check-del" title="Remover" onClick={() => onChange(items.filter((y) => y.id !== x.id))}><X size={13} /></button>
        </div>
      ))}
      {items.length < max && (
        <div className="check-add">
          <Plus size={13} className="muted" />
          <RichLine className="check-text" value={draft} maxLength={LIMITS.campaignLine} placeholder={placeholder} enterKeyHint="done"
            onChange={setDraft}
            onEnter={add}
            onBlur={add} />
          <MarkButtons target={rowInput} />
        </div>
      )}
    </div>
  );
}
