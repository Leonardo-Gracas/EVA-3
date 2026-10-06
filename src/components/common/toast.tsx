import { useRef, useSyncExternalStore, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Store } from '../../net/emitter';

export type ToastKind = 'ok' | 'error' | 'request' | 'info' | 'roll';

export interface ToastAction {
  label: ReactNode;
  className?: string;
  /** Fecha o aviso depois de rodar (padrão). */
  run: () => unknown;
}

interface Toast {
  id: number;
  kind: ToastKind;
  title?: ReactNode;
  text?: ReactNode;
  actions?: ToastAction[];
  /** Identifica o aviso para fechá-lo de fora (ex.: pedido resolvido em outra tela). */
  tag?: string;
}

export interface NotifyOptions extends Omit<Toast, 'id'> {
  /** Milissegundos na tela. 0 = fica até ser fechado. */
  duration?: number;
}

const MAX_TOASTS = 5;
const store = new Store<Toast[]>([]);
let seq = 0;

export function dismiss(id: number) {
  store.set(store.get().filter((t) => t.id !== id));
}

export function dismissTag(tag: string) {
  if (store.get().some((t) => t.tag === tag)) store.set(store.get().filter((t) => t.tag !== tag));
}

/** Aviso completo: título, corpo livre, botões e duração. */
export function notify({ duration, ...t }: NotifyOptions): number {
  const id = ++seq;
  const list = t.tag ? store.get().filter((x) => x.tag !== t.tag) : store.get();
  store.set([...list, { id, ...t }].slice(-MAX_TOASTS));
  const ms = duration ?? (t.kind === 'error' ? 5000 : 3000);
  if (ms > 0) setTimeout(() => dismiss(id), ms);
  return id;
}

export function toast(text: string, kind: ToastKind = 'info') {
  notify({ text, kind });
}

export function Toasts() {
  const list = useSyncExternalStore(store.subscribe, store.get);
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => <ToastCard key={t.id} t={t} />)}
    </div>
  );
}

/** Deslocamento (px) que separa um toque de um arrasto. */
const DRAG_SLOP = 8;
const SWIPE_MS = 180;

/** Aviso que fecha no X ou ao ser arrastado para o lado. */
function ToastCard({ t }: { t: Toast }) {
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; at: number; dx: number; on: boolean } | null>(null);
  const moved = useRef(false);

  const slide = (dx: number, animate: boolean) => {
    const n = el.current;
    if (!n) return;
    n.style.transition = animate ? `transform ${SWIPE_MS}ms ease, opacity ${SWIPE_MS}ms ease` : 'none';
    n.style.transform = dx ? `translateX(${dx}px)` : '';
    n.style.opacity = dx ? `${Math.max(0, 1 - Math.abs(dx) / n.offsetWidth)}` : '';
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    moved.current = false;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), dx: 0, on: false };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.on) {
      const dy = e.clientY - d.y;
      // Gesto vertical: deixa a página rolar.
      if (Math.abs(dy) > DRAG_SLOP && Math.abs(dy) > Math.abs(dx)) { drag.current = null; return; }
      if (Math.abs(dx) < DRAG_SLOP) return;
      d.on = true;
      moved.current = true;
      el.current?.setPointerCapture(e.pointerId);
    }
    d.dx = dx;
    slide(dx, false);
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !d.on) return;
    const w = el.current?.offsetWidth ?? 300;
    const speed = Math.abs(d.dx) / Math.max(1, performance.now() - d.at);
    if (Math.abs(d.dx) > w * 0.35 || (speed > 0.5 && Math.abs(d.dx) > 30)) {
      slide(Math.sign(d.dx) * (w + 40), true);
      setTimeout(() => dismiss(t.id), SWIPE_MS);
    } else {
      slide(0, true);
    }
  };
  // Um arrasto não pode terminar acionando um botão do aviso.
  const onClickCapture = (e: MouseEvent) => {
    if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false; }
  };

  return (
    <div ref={el} className={`toast toast-${t.kind}`}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClickCapture={onClickCapture}>
      <div className="toast-main">
        <div className="grow">
          {t.title && <div className="toast-title">{t.title}</div>}
          {t.text && <div className="toast-text">{t.text}</div>}
        </div>
        <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Fechar aviso"><X size={14} /></button>
      </div>
      {t.actions && t.actions.length > 0 && (
        <div className="toast-actions">
          {t.actions.map((a, i) => (
            <button key={i} className={a.className ?? 'btn btn-sm'} onClick={async () => { await a.run(); dismiss(t.id); }}>{a.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
