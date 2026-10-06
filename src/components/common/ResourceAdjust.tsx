import { useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, Minus, Plus, RotateCcw } from 'lucide-react';
import type { PermissionKey } from '../../model/types';
import ActButton from './ActButton';
import Modal from './Modal';

// Modal único para alterar PV, PE, durabilidade e ouro: escolhe o recurso, a
// operação e a quantidade, mostra o resultado antes de aplicar e aplica
// num clique (ou Enter). Usado na ficha, nas ameaças e no inventário.

export interface AdjustOp {
  key: string;
  label: string;
  /** Sentido da alteração: define a cor do botão e da prévia. */
  tone: 'down' | 'up';
  /** Novo valor (antes dos limites) a partir do atual e da quantidade. */
  compute: (cur: number, n: number) => number;
  reason: (n: number) => string;
  /** Explicação curta do que a operação faz (ex.: "RD 3 absorve parte"). */
  hint?: string;
}

export interface AdjustTrack {
  key: string;
  label: string;
  icon: ReactNode;
  /** Cor do recurso (variável CSS). */
  color: string;
  barClass: string;
  current: number;
  /** Maior valor possível; sem limite (e sem barra) quando omitido, como no ouro. */
  max?: number;
  /** Menor valor possível; sem limite quando omitido. */
  min?: number;
  ops: AdjustOp[];
  /** Aviso sobre o valor resultante (ex.: "Fica inconsciente"). */
  status?: (v: number) => string | undefined;
  /** Atalhos de quantidade; padrão CHIPS. */
  chips?: number[];
}

export interface AdjustStart { track?: string; op?: string }

const SET = 'set';
const CHIPS = [1, 2, 3, 5, 10, 15, 20, 25, 30, 35];

const clamp = (t: AdjustTrack, v: number) => Math.min(t.max ?? Infinity, t.min === undefined ? v : Math.max(t.min, v));
const pctOf = (v: number, max: number) => Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100));
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export default function ResourceAdjustModal({ title, tracks, start, perm, onApply, onRestoreAll, onClose }: {
  title: string;
  tracks: AdjustTrack[];
  start?: AdjustStart;
  /** Permissão exigida para aplicar (jogador); o mestre não precisa. */
  perm?: PermissionKey;
  onApply: (track: string, value: number, reason: string) => Promise<boolean>;
  /** Ação extra "restaurar tudo" (ex.: PV e PE juntos). */
  onRestoreAll?: { label: string; run: () => Promise<boolean> };
  onClose: () => void;
}) {
  const [trackKey, setTrackKey] = useState(start?.track ?? tracks[0].key);
  const t = tracks.find((x) => x.key === trackKey) ?? tracks[0];
  const [opKey, setOpKey] = useState(start?.op ?? t.ops[0].key);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const isSet = opKey === SET;
  const op = t.ops.find((o) => o.key === opKey);
  const n = parseInt(amount, 10);
  const valid = !Number.isNaN(n) && (isSet || n > 0);
  const next = valid ? clamp(t, isSet ? n : op!.compute(t.current, n)) : t.current;
  const delta = next - t.current;
  const autoReason = isSet ? `Definido em ${next}` : op && valid ? op.reason(n) : '';
  const warn = delta !== 0 ? t.status?.(next) : undefined;

  const pickTrack = (k: string) => {
    const nt = tracks.find((x) => x.key === k)!;
    setTrackKey(k);
    if (opKey !== SET && !nt.ops.some((o) => o.key === opKey)) setOpKey(nt.ops[0].key);
    if (opKey === SET) setAmount(String(nt.current));
  };
  const pickOp = (k: string) => {
    setOpKey(k);
    if (k === SET) setAmount(String(t.current));
    else if (opKey === SET) setAmount('');
  };
  const bump = (d: number) => {
    const base = Number.isNaN(n) ? (isSet ? t.current : 0) : n;
    const v = base + d;
    setAmount(String(isSet ? clamp(t, v) : Math.max(0, v)));
  };

  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) onClose();
  };
  const apply = () => {
    if (!delta || busy) return;
    void run(() => onApply(t.key, next, reason.trim() || autoReason));
  };

  const tone = isSet ? (delta < 0 ? 'down' : 'up') : op?.tone ?? 'down';
  const lo = Math.min(t.current, next);
  const hi = Math.max(t.current, next);

  return (
    <Modal open title={title} onClose={onClose}
      footer={
        <>
          {onRestoreAll && (
            <ActButtonOr perm={perm} className="btn btn-ghost" disabled={busy} onClick={() => void run(onRestoreAll.run)}>
              <RotateCcw size={14} /> {onRestoreAll.label}
            </ActButtonOr>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancelar</button>
          <ActButtonOr perm={perm} className={`btn ${tone === 'down' ? 'btn-danger' : 'btn-primary'}`} disabled={!delta || busy} onClick={apply}>
            {delta ? `Aplicar ${signed(delta)} ${t.label}` : 'Aplicar'}
          </ActButtonOr>
        </>
      }>
      <form className="col gap-lg" onSubmit={(e) => { e.preventDefault(); apply(); }}>
        {tracks.length > 1 && (
          <div className="adj-tracks">
            {tracks.map((x) => (
              <button type="button" key={x.key} className={`adj-track${x.key === t.key ? ' on' : ''}`}
                style={{ '--c': x.color } as CSSProperties} onClick={() => pickTrack(x.key)}>
                {x.icon}
                <span className="adj-track-label">{x.label}</span>
                <span className="mono">{x.current}{x.max !== undefined && <span className="muted"> / {x.max}</span>}</span>
              </button>
            ))}
          </div>
        )}

        <div className="adj-ops" role="radiogroup" aria-label="Operação">
          {t.ops.map((o) => (
            <button type="button" role="radio" aria-checked={o.key === opKey} key={o.key}
              className={`adj-op adj-${o.tone}${o.key === opKey ? ' on' : ''}`} onClick={() => pickOp(o.key)}>
              {o.tone === 'down' ? <Minus size={13} /> : <Plus size={13} />} {o.label}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={isSet}
            className={`adj-op adj-set${isSet ? ' on' : ''}`} onClick={() => pickOp(SET)}>
            = Definir
          </button>
        </div>

        <div className="field">
          <label className="label" htmlFor="adj-amount">{isSet ? `Novo valor de ${t.label}` : 'Quantidade'}</label>
          <div className="adj-amount">
            <button type="button" className="btn btn-icon" onClick={() => bump(-1)} aria-label="Diminuir"><Minus size={16} /></button>
            <input id="adj-amount" className="input adj-input" autoFocus inputMode="numeric" autoComplete="off"
              value={amount} placeholder="0"
              onFocus={(e) => e.target.select()}
              onChange={(e) => setAmount(e.target.value.replace(isSet && (t.min ?? -1) < 0 ? /[^\d-]/g : /[^\d]/g, ''))} />
            <button type="button" className="btn btn-icon" onClick={() => bump(1)} aria-label="Aumentar"><Plus size={16} /></button>
          </div>
          <div className="row-wrap">
            {isSet ? (
              <>
                {t.max !== undefined && <button type="button" className="btn btn-sm" onClick={() => setAmount(String(t.max))}>Máximo ({t.max})</button>}
                {t.min !== undefined && t.min >= 0 && <button type="button" className="btn btn-sm" onClick={() => setAmount(String(t.min))}>Zerar</button>}
              </>
            ) : (t.chips ?? CHIPS).map((c) => (
              <button type="button" key={c} className="btn btn-sm adj-chip" onClick={() => setAmount(String(c))}>{c}</button>
            ))}
          </div>
          {op?.hint && !isSet && <div className="tiny muted">{op.hint}</div>}
        </div>

        <div className="adj-preview" style={{ '--c': t.color } as CSSProperties}>
          <div className="row">
            <span className="vital-label" style={{ color: t.color }}>{t.label}</span>
            <span className="adj-from mono">{t.current}</span>
            <ArrowRight size={16} className="muted" />
            <span className="vital-num">{next}</span>
            {t.max !== undefined && <span className="vital-max">/ {t.max}</span>}
            <span className="spacer" />
            {delta !== 0 && <span className={`badge ${delta < 0 ? 'badge-err' : 'badge-ok'}`}>{signed(delta)}</span>}
          </div>
          {t.max !== undefined && (
            <div className={`bar adj-bar ${next < 0 && t.min !== undefined && t.min < 0 ? 'bar-neg' : t.barClass}`}>
              <div style={{ width: `${pctOf(lo, t.max)}%` }} />
              {delta !== 0 && (
                <div className={delta < 0 ? 'adj-loss' : 'adj-gain'}
                  style={{ left: `${pctOf(lo, t.max)}%`, width: `${pctOf(hi, t.max) - pctOf(lo, t.max)}%` }} />
              )}
            </div>
          )}
          {!isSet && valid && op && next !== op.compute(t.current, n) && (
            <div className="tiny muted">Limitado {t.max !== undefined && next >= t.max ? `ao máximo (${t.max})` : `ao mínimo (${t.min})`}.</div>
          )}
          {warn && <div className="adj-warn">{warn}</div>}
        </div>

        <div className="field">
          <label className="label" htmlFor="adj-reason">Motivo <span className="muted">(opcional, vai para o registro)</span></label>
          <input id="adj-reason" className="input" value={reason} maxLength={120} placeholder={autoReason || 'Ex.: golpe do ogro'}
            onChange={(e) => setReason(e.target.value)} />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function ActButtonOr({ perm, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { perm?: PermissionKey }) {
  return perm ? <ActButton perm={perm} {...rest} /> : <button {...rest} />;
}

// ── Operações prontas ────────────────────────────────────────

/** Operações de PV: dano com RD física/mágica, dano direto e cura. */
export function pvOps(rdPhysical: number, rdMagic: number): AdjustOp[] {
  const withRd = (kind: string, rd: number): AdjustOp => ({
    key: kind === 'físico' ? 'phys' : 'mag',
    label: `Dano ${kind}`,
    tone: 'down',
    compute: (cur, n) => cur - Math.max(0, n - rd),
    reason: (n) => `Dano ${kind} ${n}${rd ? ` − RD ${rd}` : ''}`,
    hint: rd ? `A RD ${kind === 'físico' ? 'física' : 'mágica'} (${rd}) é descontada do dano.` : `Sem RD ${kind === 'físico' ? 'física' : 'mágica'}.`,
  });
  return [
    withRd('físico', rdPhysical),
    withRd('mágico', rdMagic),
    { key: 'direct', label: 'Dano direto', tone: 'down', compute: (c, n) => c - n, reason: (n) => `Dano direto ${n}`, hint: 'Ignora a RD.' },
    { key: 'heal', label: 'Cura', tone: 'up', compute: (c, n) => c + n, reason: (n) => `Cura ${n}` },
  ];
}

/** Operações de PE: gasto e recuperação. */
export function peOps(): AdjustOp[] {
  return [
    { key: 'spend', label: 'Gastar', tone: 'down', compute: (c, n) => c - n, reason: (n) => `Gasto de ${n} PE` },
    { key: 'recover', label: 'Recuperar', tone: 'up', compute: (c, n) => c + n, reason: (n) => `Recuperou ${n} PE` },
  ];
}

/** Operações de ouro: ganho e gasto. */
export function goldOps(): AdjustOp[] {
  return [
    { key: 'spend', label: 'Gastar', tone: 'down', compute: (c, n) => c - n, reason: (n) => `Gastou ${n} de ouro` },
    { key: 'gain', label: 'Ganhar', tone: 'up', compute: (c, n) => c + n, reason: (n) => `Ganhou ${n} de ouro` },
  ];
}
