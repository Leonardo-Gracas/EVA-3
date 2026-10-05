import { useSyncExternalStore } from 'react';
import { Store } from '../../net/emitter';

export type ToastKind = 'ok' | 'error' | 'request' | 'info';
interface Toast { id: number; kind: ToastKind; text: string }

const store = new Store<Toast[]>([]);
let seq = 0;

export function toast(text: string, kind: ToastKind = 'info') {
  const id = ++seq;
  store.set([...store.get(), { id, kind, text }].slice(-4));
  setTimeout(() => store.set(store.get().filter((t) => t.id !== id)), kind === 'error' ? 5000 : 3000);
}

export function Toasts() {
  const list = useSyncExternalStore(store.subscribe, store.get);
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>
      ))}
    </div>
  );
}
