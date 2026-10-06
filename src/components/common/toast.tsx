import { useSyncExternalStore, type ReactNode } from 'react';
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
      {list.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
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
      ))}
    </div>
  );
}
