// Animação das rolagens: os dados giram juntos enquanto o resultado não chega
// (e por um tempo mínimo, para dar suspense), depois pousam e mostram o total.
// Cada dado tem a sua forma (d4 pirâmide, d6 cubo… e um molde genérico para d3, d17 etc.).
// Um 20 natural ganha raios, faíscas e a faixa de crítico; um 1, o tremor vermelho.
// O jogador também vê as rolagens abertas do mestre; das ocultas, só o 20 ou o 1.
import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { LogEntry } from '../model/types';
import { ATTRIBUTES, type AttrKey } from '../rules/attributes';
import { naturalD20, parseExpr } from '../rules/dice';
import { Store } from '../net/emitter';

interface Fx {
  id: number;
  who?: string;
  what: string;
  attr?: AttrKey;
  expr: string;
  /** Faces de cada dado, para girar antes do resultado chegar. */
  sides: number[];
  startedAt: number;
  entry?: LogEntry;
  /** Rolagem oculta do mestre: só o d20 e a faixa, sem total. */
  secret?: boolean;
  phase: 'rolling' | 'result';
}

/** Giro mínimo antes de revelar, mesmo que o resultado chegue antes. */
const MIN_ROLL_MS = 1100;
/** Sem resposta da mesa nesse tempo, desiste da animação. */
const GIVE_UP_MS = 8000;
const HOLD_MS = 2400;
const HOLD_CRIT_MS = 4200;
/** Dados desenhados; o resto vira "+N". */
const MAX_SHOWN = 12;

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

const testOf = (attr: AttrKey) => `Teste de ${ATTRIBUTES[attr].name}`;

/**
 * Começa o giro de uma rolagem feita aqui. `who` é o nome da ficha/ameaça que rola
 * (o mesmo que o motor grava). Devolve o id para cancelar (0: nada a animar).
 */
export function startRollFx(o: { who?: string; attr?: AttrKey; label?: string; expr: string }): number {
  const sides = (parseExpr(o.expr)?.terms ?? []).flatMap((t) => Array<number>(t.count).fill(t.sides));
  if (!sides.length) return 0;
  const id = ++seq;
  const what = o.attr ? (o.label ? `${o.label}: ${testOf(o.attr).toLowerCase()}` : testOf(o.attr)) : o.label || o.expr;
  store.set({ id, who: o.who, what, attr: o.attr, expr: o.expr, sides, startedAt: Date.now(), phase: 'rolling' });
  schedule(() => close(id), GIVE_UP_MS);
  return id;
}

/** A ação falhou: some sem resultado. */
export function cancelRollFx(id: number) {
  if (id) close(id);
}

/** Entrega o resultado à animação: revela depois do giro mínimo. */
function land(fx: Fx, e: LogEntry) {
  const reveal = () => {
    const cur = store.get();
    if (cur?.id !== fx.id) return;
    store.set({ ...cur, phase: 'result' });
    const nat = naturalD20(e.roll);
    navigator.vibrate?.(nat === 20 ? [40, 60, 40, 60, 140] : nat === 1 ? [120] : 25);
    schedule(() => close(fx.id), nat === 20 ? HOLD_CRIT_MS : HOLD_MS);
  };
  store.set({ ...fx, entry: e });
  const wait = Math.max(0, fx.startedAt + MIN_ROLL_MS - Date.now());
  if (wait) schedule(reveal, wait); else reveal();
}

/**
 * Entrega à animação a rolagem que ela espera. Devolve `true` se a entrada foi usada
 * (o aviso comum da rolagem fica dispensado).
 */
export function claimRollEntry(e: LogEntry): boolean {
  const fx = store.get();
  if (!fx || fx.entry || e.kind !== 'roll' || !e.roll) return false;
  if (e.roll.expr !== fx.expr || e.roll.attr !== fx.attr || e.characterName !== fx.who) return false;
  land(fx, e);
  return true;
}

/**
 * Roda a animação inteira para uma rolagem que chegou pronta (a do mestre, na tela
 * do jogador). Não interrompe outra animação: devolve `false` se o dado estiver ocupado.
 */
export function playRollFx(e: LogEntry): boolean {
  const r = e.roll;
  if (store.get() || !r?.dice.length) return false;
  const fx: Fx = e.secret
    ? { id: ++seq, what: 'Rolagem oculta do mestre', expr: r.expr, sides: [20], secret: true, startedAt: Date.now(), phase: 'rolling' }
    : {
      id: ++seq, who: e.characterName ?? e.actorName, what: r.attr ? testOf(r.attr) : e.text, attr: r.attr, expr: r.expr,
      sides: r.dice.map((d) => d.sides), startedAt: Date.now(), phase: 'rolling',
    };
  store.set(fx);
  land(fx, e);
  return true;
}

// ── Dados ───────────────────────────────────────────────────────────────────

interface Shape { body: string; face?: string; edges: string; nx: number; ny: number }

/** Silhuetas vistas de frente, em viewBox 0–100. */
const SHAPES: Record<number, Shape> = {
  4: { body: '50,4 96,86 4,86', face: '50,4 66,86 4,86', edges: 'M50,4 L66,86', nx: 40, ny: 62 },
  6: {
    body: '10,10 90,10 90,90 10,90', face: '21,21 79,21 79,79 21,79',
    edges: 'M10,10 L21,21 M90,10 L79,21 M90,90 L79,79 M10,90 L21,79', nx: 50, ny: 51,
  },
  8: { body: '50,4 94,50 50,96 6,50', face: '50,4 82,62 18,62', edges: 'M18,62 L50,96 M82,62 L50,96 M18,62 L6,50 M82,62 L94,50', nx: 50, ny: 44 },
  10: {
    body: '50,4 95,46 50,96 5,46', face: '50,4 76,52 50,64 24,52',
    edges: 'M24,52 L5,46 M76,52 L95,46 M50,64 L50,96 M24,52 L28,72 M76,52 L72,72', nx: 50, ny: 42,
  },
  12: {
    body: '50,6 93.7,37.8 77,89.2 23,89.2 6.3,37.8', face: '50,26 74.7,44 65.3,73 34.7,73 25.3,44',
    edges: 'M50,6 L50,26 M93.7,37.8 L74.7,44 M77,89.2 L65.3,73 M23,89.2 L34.7,73 M6.3,37.8 L25.3,44', nx: 50, ny: 53,
  },
  20: {
    body: '50,3 91,26.5 91,73.5 50,97 9,73.5 9,26.5', face: '50,20 77,67 23,67',
    edges: 'M50,3 L50,20 M91,26.5 L77,67 M91,26.5 L50,20 M9,26.5 L50,20 M9,26.5 L23,67 M50,97 L23,67 M50,97 L77,67 M91,73.5 L77,67 M9,73.5 L23,67',
    nx: 50, ny: 53,
  },
};
// O d100 usa o corpo do d10 (o dado percentual).
SHAPES[100] = SHAPES[10];

function Die({ sides, value }: { sides: number; value: number }) {
  const s = SHAPES[sides];
  const text = String(value);
  const size = (text.length >= 3 ? 19 : 25) - (sides === 4 ? 4 : 0);
  return (
    <svg className="fx-shape" viewBox="0 0 100 100" aria-hidden="true">
      {s ? (
        <>
          <polygon className="fx-shape-body" points={s.body} />
          {s.face && <polygon className="fx-shape-face" points={s.face} />}
          <path className="fx-shape-edge" d={s.edges} />
        </>
      ) : (
        <>
          <circle className="fx-shape-body" cx="50" cy="50" r="45" />
          <circle className="fx-shape-face" cx="50" cy="50" r="31" />
          <text className="fx-shape-tag" x="50" y="89" textAnchor="middle" dominantBaseline="middle">d{sides}</text>
        </>
      )}
      <text className="fx-shape-num" x={s?.nx ?? 50} y={s?.ny ?? 51} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: size }}>{text}</text>
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

const dieSize = (n: number) => (n === 1 ? 148 : n === 2 ? 112 : n <= 4 ? 88 : n <= 8 ? 68 : 56);
const signed = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v)}`;

export function RollFxOverlay() {
  const fx = useSyncExternalStore(store.subscribe, store.get);
  const [spin, setSpin] = useState<number[]>([]);
  const rolling = fx?.phase === 'rolling';

  // Números embaralhando em cada dado enquanto giram.
  useEffect(() => {
    if (!rolling || !fx) return;
    const shake = () => setSpin(fx.sides.slice(0, MAX_SHOWN).map((s) => 1 + Math.floor(Math.random() * s)));
    shake();
    const t = setInterval(shake, 70);
    return () => clearInterval(t);
  }, [rolling, fx?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!fx) return null;
  const r = fx.entry?.roll;
  const shown = !rolling && r ? r : null;
  const nat = naturalD20(shown ?? undefined);
  const tone = !shown ? 'spin' : nat === 20 ? 'crit' : nat === 1 ? 'fumble' : 'hit';
  const all = shown ? shown.dice.map((d) => ({ sides: d.sides, value: Math.abs(d.value) })) : fx.sides.map((s, i) => ({ sides: s, value: spin[i] ?? s }));
  const dice = all.slice(0, MAX_SHOWN);
  const many = dice.length > 1;

  return (
    <div className={`fx-overlay fx-${tone}`} onClick={() => close(fx.id)} role="status" aria-live="assertive">
      <div className="fx-stage" key={`${fx.id}-${tone}`}>
        {tone === 'crit' && <div className="fx-rays" aria-hidden="true" />}
        {tone === 'crit' && <Sparks />}
        <div className="fx-dice" style={{ '--die': `${dieSize(dice.length)}px` } as CSSProperties}>
          {dice.map((d, i) => (
            <div key={i} className={`fx-die${rolling ? ' fx-rolling' : ' fx-landed'}`}
              style={many ? (rolling
                ? { animationDelay: `${-((i * 137) % 520)}ms`, animationDirection: i % 2 ? 'reverse' : 'normal' }
                : { animationDelay: `${i * 45}ms` }) : undefined}>
              <Die sides={d.sides} value={d.value} />
            </div>
          ))}
          {all.length > MAX_SHOWN && <div className="fx-more">+{all.length - MAX_SHOWN}</div>}
        </div>
        <div className="fx-caption">
          {fx.who && <div className="fx-who">{fx.who}</div>}
          <div className="fx-what">{fx.what}</div>
        </div>
        {shown && (
          <div className="fx-result">
            {tone === 'crit' && <div className="fx-banner">Crítico!</div>}
            {tone === 'fumble' && <div className="fx-banner">Falha crítica</div>}
            {!fx.secret && <div className="fx-total">{shown.total}</div>}
            {!fx.secret && (nat !== null || many || shown.modifier !== 0) && (
              <div className="fx-break">
                {nat !== null ? <>d20 <strong>{nat}</strong></> : <>[{shown.dice.map((d) => signed(d.value)).join(', ')}]</>}
                {shown.modifier ? <> {shown.modifier > 0 ? '+' : '−'} {Math.abs(shown.modifier)}</> : null}
              </div>
            )}
          </div>
        )}
        {!shown && <div className="fx-hint">Rolando…</div>}
      </div>
    </div>
  );
}
