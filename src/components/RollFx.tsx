// Animação das rolagens de atributo: o d20 gira enquanto o resultado não chega
// (e por um tempo mínimo, para dar suspense), depois pousa e mostra o total.
// Um 20 natural ganha raios, faíscas e a faixa de crítico; um 1, o tremor vermelho.
import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { LogEntry } from '../model/types';
import { ATTRIBUTES, type AttrKey } from '../rules/attributes';
import { Store } from '../net/emitter';

interface Fx {
  id: number;
  charName: string;
  attr: AttrKey;
  startedAt: number;
  entry?: LogEntry;
  phase: 'rolling' | 'result';
}

/** Giro mínimo antes de revelar, mesmo que o resultado chegue antes. */
const MIN_ROLL_MS = 1100;
/** Sem resposta da mesa nesse tempo, desiste da animação. */
const GIVE_UP_MS = 8000;
const HOLD_MS = 2400;
const HOLD_CRIT_MS = 4200;

const store = new Store<Fx | null>(null);
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function schedule(fn: () => void, ms: number) {
  clearTimeout(timer);
  timer = setTimeout(fn, ms);
}

function close(id?: number) {
  if (id !== undefined && store.get()?.id !== id) return;
  clearTimeout(timer);
  store.set(null);
}

const natural = (e?: LogEntry) => {
  const d = e?.roll?.dice;
  return d && d.length === 1 && d[0].sides === 20 ? d[0].value : null;
};

/** Começa o giro de um teste de atributo. Devolve o id para cancelar. */
export function startRollFx(charName: string, attr: AttrKey): number {
  const id = ++seq;
  store.set({ id, charName, attr, startedAt: Date.now(), phase: 'rolling' });
  schedule(() => close(id), GIVE_UP_MS);
  return id;
}

/** A ação falhou: some sem resultado. */
export function cancelRollFx(id: number) {
  close(id);
}

/**
 * Entrega à animação a rolagem que ela espera. Devolve `true` se a entrada foi usada
 * (o aviso comum da rolagem fica dispensado).
 */
export function claimRollEntry(e: LogEntry): boolean {
  const fx = store.get();
  if (!fx || fx.entry || e.kind !== 'roll' || !e.roll) return false;
  if (e.roll.attr !== fx.attr || e.characterName !== fx.charName) return false;
  const reveal = () => {
    const cur = store.get();
    if (cur?.id !== fx.id) return;
    store.set({ ...cur, phase: 'result' });
    const nat = natural(e);
    navigator.vibrate?.(nat === 20 ? [40, 60, 40, 60, 140] : nat === 1 ? [120] : 25);
    schedule(() => close(fx.id), nat === 20 ? HOLD_CRIT_MS : HOLD_MS);
  };
  store.set({ ...fx, entry: e });
  const wait = Math.max(0, fx.startedAt + MIN_ROLL_MS - Date.now());
  if (wait) schedule(reveal, wait); else reveal();
  return true;
}

function Die({ value, tone }: { value: number; tone: string }) {
  return (
    <svg className={`fx-d20 fx-d20-${tone}`} viewBox="0 0 100 100" aria-hidden="true">
      <polygon className="fx-d20-body" points="50,3 91,26.5 91,73.5 50,97 9,73.5 9,26.5" />
      <polygon className="fx-d20-face" points="50,20 77,67 23,67" />
      <path className="fx-d20-edge" d="M50,3 L50,20 M91,26.5 L77,67 M91,26.5 L50,20 M9,26.5 L50,20 M9,26.5 L23,67 M50,97 L23,67 M50,97 L77,67 M91,73.5 L77,67 M9,73.5 L23,67" />
      <text className="fx-d20-num" x="50" y="53" textAnchor="middle" dominantBaseline="middle">{value}</text>
    </svg>
  );
}

function Sparks() {
  // Posições sorteadas uma vez por crítico.
  const sparks = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    a: (360 / 28) * i + Math.random() * 10,
    d: 90 + Math.random() * 110,
    s: 3 + Math.random() * 5,
    delay: Math.random() * 120,
  })), []);
  return (
    <div className="fx-sparks" aria-hidden="true">
      {sparks.map((p, i) => (
        <span key={i} style={{ '--a': `${p.a}deg`, '--d': `${p.d}px`, '--s': `${p.s}px`, animationDelay: `${p.delay}ms` } as CSSProperties} />
      ))}
    </div>
  );
}

export function RollFxOverlay() {
  const fx = useSyncExternalStore(store.subscribe, store.get);
  const [spin, setSpin] = useState(20);
  const rolling = fx?.phase === 'rolling';

  // Números embaralhando enquanto o dado gira.
  useEffect(() => {
    if (!rolling) return;
    const t = setInterval(() => setSpin((v) => {
      let n = v;
      while (n === v) n = 1 + Math.floor(Math.random() * 20);
      return n;
    }), 70);
    return () => clearInterval(t);
  }, [rolling, fx?.id]);

  if (!fx) return null;
  const r = fx.entry?.roll;
  const nat = natural(fx.entry);
  const shown = !rolling && r;
  const tone = !shown ? 'spin' : nat === 20 ? 'crit' : nat === 1 ? 'fumble' : 'hit';
  const attrName = ATTRIBUTES[fx.attr].name;

  return (
    <div className={`fx-overlay fx-${tone}`} onClick={() => close(fx.id)} role="status" aria-live="assertive">
      <div className="fx-stage" key={`${fx.id}-${tone}`}>
        {tone === 'crit' && <div className="fx-rays" aria-hidden="true" />}
        {tone === 'crit' && <Sparks />}
        <div className={`fx-die${rolling ? ' fx-rolling' : ' fx-landed'}`}>
          <Die value={shown ? nat ?? r.total : spin} tone={tone} />
        </div>
        <div className="fx-caption">
          <div className="fx-who">{fx.charName}</div>
          <div className="fx-what">Teste de {attrName}</div>
        </div>
        {shown && (
          <div className="fx-result">
            {tone === 'crit' && <div className="fx-banner">Crítico!</div>}
            {tone === 'fumble' && <div className="fx-banner">Falha crítica</div>}
            <div className="fx-total">{r.total}</div>
            <div className="fx-break">
              d20 <strong>{nat ?? '?'}</strong>
              {r.modifier ? <> {r.modifier > 0 ? '+' : '−'} {Math.abs(r.modifier)}</> : null}
            </div>
          </div>
        )}
        {!shown && <div className="fx-hint">Rolando…</div>}
      </div>
    </div>
  );
}
