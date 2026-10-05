// Store mínimo compatível com useSyncExternalStore.
export class Store<T> {
  private listeners = new Set<() => void>();
  constructor(private value: T) {}
  get = (): T => this.value;
  set(next: T) {
    this.value = next;
    for (const l of this.listeners) l();
  }
  patch(p: Partial<T>) {
    this.set({ ...this.value, ...p });
  }
  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  };
}
