import { ArrowRight, Minus, Plus } from 'lucide-react';
import { isStackable, type ItemData } from '../../model/types';

const MAX = 999;

/** Quantidade sugerida ao entregar: o pacote cheio (munição, kits) ou 1 item. */
export function defaultQty(it: Pick<ItemData, 'pack'>): number {
  return Math.max(1, it.pack);
}

export function parseQty(v: string): number {
  return Math.max(1, Math.min(MAX, parseInt(v, 10) || 1));
}

/** Atalhos de quantidade: pacotes inteiros para munição, poucos itens para o resto. */
function presets(it: Pick<ItemData, 'type' | 'pack'>): Array<{ n: number; label: string }> {
  if (it.pack > 1) {
    return [
      { n: it.pack, label: `1 pacote · ${it.pack}` },
      { n: Math.min(MAX, it.pack * 2), label: `2 pacotes · ${Math.min(MAX, it.pack * 2)}` },
      { n: 1, label: 'Avulso · 1' },
    ];
  }
  return (isStackable(it) ? [1, 2, 3, 5, 10] : [1, 2, 3]).map((n) => ({ n, label: String(n) }));
}

/**
 * Quantidade a entregar ou adicionar: atalhos de pacote, −/+ grandes e campo
 * livre. `have` mostra quanto o personagem já tem quando a entrega soma na pilha.
 */
export default function QtyPicker({ item, value, onChange, have, id = 'qty-picker' }: {
  item: Pick<ItemData, 'type' | 'pack'>;
  value: string;
  onChange: (v: string) => void;
  have?: number;
  id?: string;
}) {
  const n = parseQty(value);
  const set = (v: number) => onChange(String(Math.max(1, Math.min(MAX, v))));
  return (
    <div className="qty-picker">
      <label className="label" htmlFor={id}>
        Quantidade{item.pack > 1 && <span className="muted"> · pacote de {item.pack}</span>}
      </label>
      <div className="chips qty-presets" role="group" aria-label="Atalhos de quantidade">
        {presets(item).map((p) => (
          <button key={p.label} type="button" className={`chip${n === p.n ? ' on' : ''}`} aria-pressed={n === p.n}
            onClick={() => set(p.n)}>{p.label}</button>
        ))}
      </div>
      <div className="qty-row">
        <button type="button" className="qty-btn" onClick={() => set(n - 1)} disabled={n <= 1} aria-label="Diminuir 1"><Minus size={18} /></button>
        <input id={id} className="input adj-input" inputMode="numeric" autoComplete="off" value={value} placeholder="1"
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} />
        <button type="button" className="qty-btn" onClick={() => set(n + 1)} disabled={n >= MAX} aria-label="Aumentar 1"><Plus size={18} /></button>
      </div>
      {have !== undefined && (
        <div className="qty-have">
          Já tem <strong>{have}</strong> <ArrowRight size={13} /> fica com <strong>{Math.min(MAX, have + n)}</strong>
        </div>
      )}
    </div>
  );
}
