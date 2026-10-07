// Modais da tela de combate do mestre: adicionar à fila, dano em grupo,
// condições e encerrar.
import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowRight, Check, Minus, Plus, Search, Skull, Users, VenetianMask } from 'lucide-react';
import type { Combat, CombatantRef, GroupDamageOp, TableState } from '../../model/types';
import { characterInfo, combatantInfo, GROUP_OPS, groupDamageResult, rdFor, threatInfo } from '../../store/combat';
import { hostStore } from '../../net/host';
import { useAct } from '../act';
import Modal from '../common/Modal';
import { AmountSteps, STEPS } from '../common/ResourceAdjust';
import ConfirmModal from '../common/ConfirmModal';
import ThreatEditor from '../gm/ThreatEditor';
import { pct, roundsLabel } from './common';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ── Adicionar à fila ─────────────────────────────────────────────────────────

/** Escolha em lote: marca fichas e ameaças (com quantidade) e adiciona tudo de uma vez. */
export function AddCombatantsModal({ table, combat, onClose }: { table: TableState; combat: Combat; onClose: () => void }) {
  const { act } = useAct();
  const [q, setQ] = useState('');
  /** id → quantidade (fichas sempre 1). */
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const inCombat = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of combat.order) m.set(x.ref.id, (m.get(x.ref.id) ?? 0) + 1);
    return m;
  }, [combat.order]);

  const match = (name: string, extra = '') => !q || norm(`${name} ${extra}`).includes(norm(q));
  const chars = Object.values(table.characters).filter((c) => c.status === 'approved');
  const pcs = chars.filter((c) => c.kind === 'pc' && match(c.name, table.players[c.ownerId]?.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const npcs = chars.filter((c) => c.kind === 'npc' && match(c.name, c.concept)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const threats = Object.values(table.threats)
    .filter((t) => match(t.name, t.concept))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const freePcs = pcs.filter((c) => !inCombat.has(c.id));

  const toggle = (id: string) => setPicked((p) => {
    const next = { ...p };
    if (next[id]) delete next[id]; else next[id] = 1;
    return next;
  });
  const setQty = (id: string, n: number) => setPicked((p) => ({ ...p, [id]: Math.max(1, Math.min(20, n)) }));
  const total = Object.values(picked).reduce((a, b) => a + b, 0);

  const add = async () => {
    setBusy(true);
    const ids = Object.keys(picked);
    const charRefs: CombatantRef[] = ids.filter((id) => table.characters[id]).map((id) => ({ kind: 'character', id }));
    const single: CombatantRef[] = ids.filter((id) => table.threats[id] && picked[id] === 1).map((id) => ({ kind: 'threat', id }));
    let ok = true;
    if (charRefs.length || single.length) ok = (await act({ type: 'combat/add', refs: [...charRefs, ...single] })).ok;
    for (const id of ids.filter((x) => table.threats[x] && picked[x] > 1)) {
      if (!ok) break;
      ok = (await act({ type: 'combat/add', refs: [{ kind: 'threat', id }], qty: picked[id] })).ok;
    }
    setBusy(false);
    if (ok) onClose();
  };

  const row = ({ id, name, sub, pv, qty }: { id: string; name: string; sub?: string; pv: string; qty?: boolean }) => {
    const on = !!picked[id];
    const already = inCombat.has(id);
    const locked = already && !qty; // ficha já na fila
    return (
      <div key={id} className={`pick-row${on ? ' on' : ''}${locked ? ' locked' : ''}`}>
        <button type="button" className="pick-main" disabled={locked} onClick={() => toggle(id)} aria-pressed={on}>
          <span className="pick-box">{(on || locked) && <Check size={13} />}</span>
          <span className="grow">
            <strong>{name}</strong>
            {sub && <span className="tiny muted"> · {sub}</span>}
            {already && <span className="tiny gold"> · {qty ? `já na fila ×${inCombat.get(id)}` : 'na fila'}</span>}
          </span>
          <span className="tiny pv">{pv}</span>
        </button>
        {qty && on && (
          <span className="pick-qty" aria-label="Quantidade">
            <button type="button" className="btn btn-icon btn-sm" onClick={() => setQty(id, picked[id] - 1)} aria-label="Menos"><Minus size={13} /></button>
            <span className="mono">×{picked[id]}</span>
            <button type="button" className="btn btn-icon btn-sm" onClick={() => setQty(id, picked[id] + 1)} aria-label="Mais"><Plus size={13} /></button>
          </span>
        )}
      </div>
    );
  };

  return (
    <Modal open width={620} title="Adicionar ao combate" onClose={onClose}
      footer={
        <>
          <span className="tiny muted">{total ? `${total} selecionado${total > 1 ? 's' : ''}` : 'Toque para marcar'}</span>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!total || busy} onClick={() => void add()}>
            <Plus size={14} /> Adicionar{total ? ` ${total}` : ''}
          </button>
        </>
      }>
      <div className="col gap-lg">
        <div className="row"><Search size={14} className="muted" />
          <input className="input" autoFocus placeholder="Buscar por nome" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <section className="col">
          <div className="row">
            <div className="menu-title grow"><Users size={12} /> Personagens dos jogadores</div>
            {freePcs.length > 1 && (
              <button className="btn btn-sm btn-ghost" onClick={() => setPicked((p) => ({ ...p, ...Object.fromEntries(freePcs.map((c) => [c.id, 1])) }))}>
                Marcar todos ({freePcs.length})
              </button>
            )}
          </div>
          {pcs.length === 0 && <div className="tiny muted">Nenhuma ficha aprovada{q ? ' com esse nome' : ''}.</div>}
          {pcs.map((c) => {
            const i = characterInfo(c);
            return row({ id: c.id, name: c.name, sub: table.players[c.ownerId]?.name, pv: `${i.pv}/${i.pvMax} PV` });
          })}
        </section>

        {npcs.length > 0 && (
          <section className="col">
            <div className="menu-title"><VenetianMask size={12} /> NPCs</div>
            {npcs.map((c) => {
              const i = characterInfo(c);
              return row({ id: c.id, name: c.name, sub: c.concept, pv: `${i.pv}/${i.pvMax} PV` });
            })}
          </section>
        )}

        <section className="col">
          <div className="row">
            <div className="menu-title grow"><Skull size={12} /> Ameaças</div>
            <button className="btn btn-sm btn-ghost" onClick={() => setCreating(true)}><Plus size={13} /> Nova ameaça</button>
          </div>
          {threats.length === 0 && <div className="tiny muted">{q ? 'Nenhuma ameaça com esse nome.' : 'Nenhuma ameaça criada ainda.'}</div>}
          {threats.map((t) => {
            const i = threatInfo(t);
            return row({ id: t.id, name: t.name, sub: t.concept, pv: `${i.pv}/${i.pvMax} PV`, qty: true });
          })}
          <div className="tiny muted">O livro é só o molde: cada ameaça entra na fila como uma entidade própria, com PV e PE separados. Com mais de uma, elas são numeradas (Goblin 1, Goblin 2…).</div>
        </section>
      </div>

      {creating && (
        <ThreatEditor title="Nova ameaça" onClose={() => setCreating(false)}
          onSave={async (data) => {
            const before = new Set(Object.keys(table.threats));
            const r = await act({ type: 'threat/upsert', data }, 'Ameaça criada.');
            if (r.ok) {
              const fresh = Object.keys(hostStore.get().table?.threats ?? {}).find((id) => !before.has(id));
              if (fresh) setPicked((p) => ({ ...p, [fresh]: 1 }));
            }
            return r.ok;
          }} />
      )}
    </Modal>
  );
}

// ── Dano em grupo ────────────────────────────────────────────────────────────

export function GroupDamageModal({ table, combat, ids, onClose, onDone }: {
  table: TableState; combat: Combat; ids: string[]; onClose: () => void; onDone: () => void;
}) {
  const { act } = useAct();
  const [op, setOp] = useState<GroupDamageOp>('phys');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const n = parseInt(amount, 10);
  const valid = n > 0;

  const rows = ids.flatMap((id) => {
    const cb = combat.order.find((x) => x.id === id);
    const info = cb && combatantInfo(table, cb);
    if (!info) return [];
    const next = valid ? groupDamageResult(op, n, info) : info.pv;
    return [{ id, info, next, rd: rdFor(op, info) }];
  });
  const changed = rows.filter((r) => r.next !== r.info.pv).length;
  const tone = GROUP_OPS[op].tone;

  const apply = async () => {
    if (!valid || !changed || busy) return;
    setBusy(true);
    const r = await act({ type: 'combat/groupDamage', combatantIds: ids, op, amount: n, reason: reason.trim() || undefined }, `${GROUP_OPS[op].label} aplicado em ${changed}.`);
    setBusy(false);
    if (r.ok) { onDone(); onClose(); }
  };

  return (
    <Modal open width={560} title={`${tone === 'up' ? 'Cura' : 'Dano'} em grupo · ${ids.length} alvo${ids.length > 1 ? 's' : ''}`} onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className={`btn ${tone === 'down' ? 'btn-danger' : 'btn-primary'}`} disabled={!valid || !changed || busy} onClick={() => void apply()}>
            {valid ? `Aplicar em ${changed} alvo${changed === 1 ? '' : 's'}` : 'Aplicar'}
          </button>
        </>
      }>
      <form className="col gap-lg" onSubmit={(e) => { e.preventDefault(); void apply(); }}>
        <div className="adj-ops" role="radiogroup" aria-label="Operação">
          {(Object.keys(GROUP_OPS) as GroupDamageOp[]).map((k) => (
            <button type="button" role="radio" aria-checked={k === op} key={k}
              className={`adj-op adj-${GROUP_OPS[k].tone}${k === op ? ' on' : ''}`} onClick={() => setOp(k)}>
              {GROUP_OPS[k].tone === 'down' ? <Minus size={13} /> : <Plus size={13} />} {GROUP_OPS[k].label}
            </button>
          ))}
        </div>

        <div className="field">
          <label className="label" htmlFor="grp-amount">Quantidade {op === 'phys' || op === 'mag' ? <span className="muted">(antes da RD de cada alvo)</span> : null}</label>
          <input id="grp-amount" className="input adj-input" autoFocus inputMode="numeric" autoComplete="off" value={amount} placeholder="0"
            onFocus={(e) => e.target.select()} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
          <AmountSteps steps={STEPS} onBump={(d) => setAmount(String(Math.max(0, (n || 0) + d)))} />
        </div>

        <div className="grp-preview">
          {rows.map(({ id, info, next, rd }) => {
            const delta = next - info.pv;
            const falls = info.pv > 0 && next <= 0;
            return (
              <div key={id} className="grp-row">
                <div className="row">
                  <strong className="grow">{info.name}</strong>
                  {rd > 0 && valid && <span className="tiny muted">RD {rd}</span>}
                  <span className="mono muted">{info.pv}</span>
                  <ArrowRight size={13} className="muted" />
                  <span className="mono"><strong>{next}</strong><span className="muted">/{info.pvMax}</span></span>
                  {delta !== 0 && <span className={`badge ${delta < 0 ? 'badge-err' : 'badge-ok'}`}>{delta > 0 ? `+${delta}` : delta}</span>}
                </div>
                <div className="bar bar-pv adj-bar" style={{ height: 6, '--c': 'var(--pv)' } as CSSProperties}>
                  <div style={{ width: pct(Math.min(info.pv, next), info.pvMax) }} />
                  {delta !== 0 && (
                    <div className={delta < 0 ? 'adj-loss' : 'adj-gain'}
                      style={{ left: pct(Math.min(info.pv, next), info.pvMax), width: `calc(${pct(Math.max(info.pv, next), info.pvMax)} - ${pct(Math.min(info.pv, next), info.pvMax)})` }} />
                  )}
                </div>
                {falls && <div className="adj-warn">{info.threat ? 'Cai (PV ≤ 0).' : next <= info.pvMin ? 'Morre.' : 'Cai inconsciente (PV ≤ 0).'}</div>}
                {valid && rd >= n && op !== 'heal' && <div className="tiny muted">A RD absorve todo o dano.</div>}
              </div>
            );
          })}
        </div>

        <div className="field">
          <label className="label" htmlFor="grp-reason">Motivo <span className="muted">(opcional, vai para o registro)</span></label>
          <input id="grp-reason" className="input" value={reason} maxLength={120} placeholder="Ex.: bola de fogo" onChange={(e) => setReason(e.target.value)} />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ── Condições ────────────────────────────────────────────────────────────────

const SUGGESTED = ['Atordoado', 'Caído', 'Agarrado', 'Cego', 'Envenenado', 'Sangrando', 'Amedrontado', 'Postura', 'Fúria'];
const DURATIONS = [1, 2, 3, 5, 10];

export function ConditionModal({ names, ids, anchor, onClose, onDone }: {
  names: string[]; ids: string[];
  /** Quem está agindo agora: a condição termina quando a vez voltar a ele. */
  anchor?: string;
  onClose: () => void; onDone?: () => void;
}) {
  const { act } = useAct();
  const [name, setName] = useState('');
  const [rounds, setRounds] = useState<number | null>(1);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const dur = custom ? parseInt(custom, 10) || null : rounds;

  const apply = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const r = await act({ type: 'combat/conditionAdd', combatantIds: ids, name: name.trim(), rounds: dur });
    setBusy(false);
    if (r.ok) { onDone?.(); onClose(); }
  };

  return (
    <Modal open width={480} title={`Condição · ${names.length > 2 ? `${names.length} alvos` : names.join(' e ')}`} onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!name.trim() || busy} onClick={() => void apply()}>
            Aplicar{name.trim() ? ` ${name.trim()}` : ''}{dur ? ` · ${roundsLabel(dur)}` : ''}
          </button>
        </>
      }>
      <form className="col gap-lg" onSubmit={(e) => { e.preventDefault(); void apply(); }}>
        <div className="field">
          <label className="label" htmlFor="cond-name">Condição</label>
          <input id="cond-name" className="input" autoFocus maxLength={40} value={name} placeholder="Ex.: Atordoado" onChange={(e) => setName(e.target.value)} />
          <div className="row-wrap">
            {SUGGESTED.map((s) => (
              <button type="button" key={s} className={`btn btn-sm${name === s ? ' btn-primary' : ''}`} onClick={() => setName(s)}>{s}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Duração</span>
          <div className="row-wrap">
            {DURATIONS.map((d) => (
              <button type="button" key={d} className={`btn btn-sm${!custom && rounds === d ? ' btn-primary' : ''}`} onClick={() => { setCustom(''); setRounds(d); }}>{roundsLabel(d)}</button>
            ))}
            <button type="button" className={`btn btn-sm${!custom && rounds === null ? ' btn-primary' : ''}`} onClick={() => { setCustom(''); setRounds(null); }}>Até remover</button>
            <input className="input" style={{ width: 84 }} inputMode="numeric" placeholder="Outra" aria-label="Outra duração em rodadas" value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, '').slice(0, 2))} />
          </div>
          <div className="tiny muted">
            {dur
              ? anchor
                ? <>Termina quando a vez voltar a <strong>{anchor}</strong> {dur === 1 ? 'na próxima rodada' : `daqui a ${dur} rodadas`}, mesmo que a ordem mude. O fim vai para o registro.</>
                : <>Termina no começo da rodada {dur + 1} (o combate ainda não começou).</>
              : 'Fica até você remover.'}
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ── Encerrar ─────────────────────────────────────────────────────────────────

export function EndCombatModal({ table, combat, onClose }: { table: TableState; combat: Combat; onClose: () => void }) {
  const { act } = useAct();
  const down = combat.order.filter((x) => combatantInfo(table, x)?.down).length;
  return (
    <ConfirmModal title="Encerrar combate" confirmLabel="Encerrar combate" onClose={onClose}
      onConfirm={async () => (await act({ type: 'combat/end' }, 'Combate encerrado.')).ok}>
      <div className="col">
        <p>
          {combat.round > 0
            ? <>O combate durou <strong>{combat.round} rodada{combat.round > 1 ? 's' : ''}</strong> com {combat.order.length} combatentes{down ? `, ${down} fora de combate` : ''}.</>
            : <>O combate ainda não começou. A fila será descartada.</>}
        </p>
        <p className="small secondary">
          PV e PE das fichas de personagens e NPCs ficam como estão. As ameaças da fila e as condições somem com o combate;
          o livro de ameaças não muda.
        </p>
      </div>
    </ConfirmModal>
  );
}
