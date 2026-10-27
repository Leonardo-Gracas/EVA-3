// Combate do mestre, em versão compacta para ficar ao lado do mapa: a barra de turno e a
// fila. Cada linha mostra o essencial (vez, PV, condições) e o botão de dano; tocar na linha
// abre as outras ações dela. A faixa da esquerda marca alvos para dano e condição em grupo.
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Crosshair, Eye, EyeOff, FileText, Flag, Heart, Play, Plus, Skull, Tag, X, Zap,
} from 'lucide-react';
import type { Combat, Combatant, TableState } from '../../model/types';
import { combatantInfo, conditionAnchor, conditionRemaining, currentCombatant, nextUp, type CombatantInfo } from '../../store/combat';
import { deriveStats } from '../../rules/derive';
import { useAct } from '../act';
import Avatar from '../common/Avatar';
import Modal from '../common/Modal';
import ResourceAdjustModal, { peOps, pvOps, type AdjustStart, type AdjustTrack } from '../common/ResourceAdjust';
import CharacterSheet from '../sheet/CharacterSheet';
import { ThreatSheet } from '../gm/ThreatsPanel';
import { ThreatGlyph } from '../gm/ThreatIcon';
import { AddCombatantsModal, ConditionModal, EndCombatModal, GroupDamageModal } from './CombatModals';
import { ConditionChips, HealthBadge, pct, sideClass } from './common';

export interface Entry { cb: Combatant; info: CombatantInfo }

export function useEntries(table: TableState, combat: Combat): Entry[] {
  return useMemo(
    () => combat.order.flatMap((cb) => { const info = combatantInfo(table, cb); return info ? [{ cb, info }] : []; }),
    [combat.order, table],
  );
}

/**
 * Barra de turno: rodada, quem age e quem vem a seguir, e os botões de passar a vez.
 * Atalhos: N = próximo turno (ou iniciar), B = voltar.
 */
export function TurnBar({ table, combat }: { table: TableState; combat: Combat }) {
  const { act } = useAct();
  const started = combat.round > 0;
  const current = currentCombatant(combat);
  const upNext = started ? nextUp(table, combat) : undefined;
  const name = (cb?: Combatant) => (cb ? combatantInfo(table, cb)?.name ?? '?' : '');

  const next = () => act(started ? { type: 'combat/next' } : { type: 'combat/start' });
  const prev = () => act({ type: 'combat/prev' });
  const keys = useRef({ next, prev, started });
  keys.current = { next, prev, started };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable]') || document.querySelector('.modal-overlay')) return;
      const k = e.key.toLowerCase();
      if (k === 'n') { e.preventDefault(); void keys.current.next(); }
      else if (k === 'b' && keys.current.started) { e.preventDefault(); void keys.current.prev(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="ct-bar">
      <span className="pq-round" aria-label={started ? `Rodada ${combat.round}` : 'Preparando'}>{started ? `R${combat.round}` : 'Preparo'}</span>
      <span className="ct-now" aria-live="polite">
        {started && current ? (
          <><span className="muted">Vez de</span> <strong>{name(current)}</strong>{upNext && <span className="muted"> · a seguir: {name(upNext)}</span>}</>
        ) : (
          <span className="muted">{combat.order.length ? 'Arrume a ordem e inicie.' : 'Adicione quem vai lutar.'}</span>
        )}
      </span>
      {started && (
        <button className="btn btn-sm btn-icon" onClick={() => void prev()} title="Turno anterior (B)" aria-label="Turno anterior"><ChevronLeft size={16} /></button>
      )}
      <button className="btn btn-sm btn-primary ct-next" disabled={!combat.order.length} onClick={() => void next()} title={started ? 'Próximo turno (N)' : 'Iniciar combate (N)'}>
        {started ? <>Próximo <ChevronRight size={15} /></> : <><Play size={13} /> Iniciar</>}
      </button>
    </div>
  );
}

/**
 * A fila. `focusId`/`onFocus`: a linha aberta, controlada por fora (o mapa liga a linha ao
 * token escolhido); sem foco, abre a de quem está agindo.
 */
export function CombatTracker({ table, combat, focusId, onFocus }: {
  table: TableState; combat: Combat; focusId?: string | null; onFocus?: (id: string | null) => void;
}) {
  const { act } = useAct();
  const entries = useEntries(table, combat);
  const current = currentCombatant(combat);
  const started = combat.round > 0;
  const upNext = started ? nextUp(table, combat) : undefined;

  const [ownFocus, setOwnFocus] = useState<string | null>(null);
  const focus = focusId !== undefined ? focusId : ownFocus;
  const setFocus = (id: string | null) => { if (onFocus) onFocus(id); else setOwnFocus(id); };
  // '' = todas fechadas (o mestre fechou a linha); null = segue quem está agindo.
  const openId = focus === '' ? null : entries.some((e) => e.cb.id === focus) ? focus : current?.id ?? null;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [adjust, setAdjust] = useState<{ id: string; start: AdjustStart } | null>(null);
  const [condFor, setCondFor] = useState<string[] | null>(null);
  const [group, setGroup] = useState(false);
  const [ending, setEnding] = useState(false);
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  // Quem saiu da fila sai da seleção.
  useEffect(() => {
    const ids = new Set(combat.order.map((x) => x.id));
    if ([...selected].some((id) => !ids.has(id))) setSelected(new Set([...selected].filter((id) => ids.has(id))));
  }, [combat.order, selected]);

  const lastPick = useRef<string | null>(null);
  const toggleSel = (id: string, range = false) => {
    const from = lastPick.current ? entries.findIndex((e) => e.cb.id === lastPick.current) : -1;
    const to = entries.findIndex((e) => e.cb.id === id);
    setSelected((s) => {
      const n = new Set(s);
      if (range && from >= 0 && to >= 0) {
        const [a, b] = from < to ? [from, to] : [to, from];
        for (const e of entries.slice(a, b + 1)) n.add(e.cb.id);
      } else if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    lastPick.current = id;
  };
  const pickGroup = (filter: (e: Entry) => boolean) => {
    setSelected(new Set(entries.filter((e) => !e.info.down && filter(e)).map((e) => e.cb.id)));
    lastPick.current = null;
  };
  const threatCount = entries.filter((e) => e.info.side === 'threat' && !e.info.down).length;
  const allyCount = entries.filter((e) => e.info.side !== 'threat' && !e.info.down).length;

  const chips = (cb: Combatant) => cb.conditions.map((x) => {
    const anchor = conditionAnchor(table, combat, x);
    return {
      id: x.id, name: x.name, rounds: conditionRemaining(combat, x),
      hint: x.endsAtRound === null ? `${x.name}: até ser removida` : anchor ? `${x.name}: termina na vez de ${anchor}` : `${x.name}: termina no começo da rodada ${x.endsAtRound}`,
    };
  });
  const move = (id: string, to: number) => act({ type: 'combat/move', combatantId: id, to: Math.max(0, Math.min(combat.order.length - 1, to)) });
  const downIds = entries.filter((e) => e.info.down).map((e) => e.cb.id);
  const selIds = [...selected];

  // Arrastar para reordenar (mouse). No toque, ↑↓ na linha aberta.
  const onDragStart = (e: DragEvent, id: string) => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); };
  const onDragOver = (e: DragEvent, idx: number) => {
    if (!dragId) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropAt(e.clientY < r.top + r.height / 2 ? idx : idx + 1);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (dragId && dropAt !== null) {
      const from = combat.order.findIndex((x) => x.id === dragId);
      const to = dropAt > from ? dropAt - 1 : dropAt;
      if (from >= 0 && to !== from) void move(dragId, to);
    }
    setDragId(null);
    setDropAt(null);
  };

  const adjustEntry = adjust ? entries.find((e) => e.cb.id === adjust.id) : undefined;
  const sheetEntry = sheetFor ? entries.find((e) => e.cb.id === sheetFor) : undefined;

  return (
    <div className="ct col">
      <div className="ct-head">
        <span className="card-title" style={{ margin: 0 }}>Fila</span>
        <span className="tiny muted">{entries.length}</span>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => setAdding(true)}><Plus size={13} /> Adicionar</button>
        <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEnding(true)} title="Encerrar combate" aria-label="Encerrar combate"><Flag size={14} /></button>
      </div>

      {entries.length > 1 && (
        <div className="cbt-quickpick" role="group" aria-label="Marcar alvos">
          <Crosshair size={12} className="muted" />
          {threatCount > 0 && <button className="cbt-qp" onClick={() => pickGroup((e) => e.info.side === 'threat')}>Ameaças {threatCount}</button>}
          {allyCount > 0 && <button className="cbt-qp" onClick={() => pickGroup((e) => e.info.side !== 'threat')}>Aliados {allyCount}</button>}
          <button className="cbt-qp" onClick={() => pickGroup(() => true)}>Todos</button>
        </div>
      )}

      {entries.length === 0 && (
        <div className="empty col" style={{ alignItems: 'center', padding: 16 }}>
          <p className="small">A fila está vazia.</p>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Plus size={14} /> Adicionar combatentes</button>
        </div>
      )}

      <ol className={`ct-list${selected.size ? ' ct-targeting' : ''}`} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(null); }}>
        {entries.map(({ cb, info }, idx) => {
          const isTurn = cb.id === current?.id;
          const isNext = cb.id === upNext?.id;
          const sel = selected.has(cb.id);
          const open = cb.id === openId;
          const cond = chips(cb);
          return (
            <li key={cb.id}
              className={[
                'ct-row', sideClass(info.side), isTurn && 'on', info.down && 'down', sel && 'sel', open && 'open',
                dragId === cb.id && 'dragging', dropAt === idx && 'drop-before', dropAt === idx + 1 && idx === entries.length - 1 && 'drop-after',
              ].filter(Boolean).join(' ')}
              draggable onDragStart={(e) => onDragStart(e, cb.id)} onDragOver={(e) => onDragOver(e, idx)} onDrop={onDrop}
              onDragEnd={() => { setDragId(null); setDropAt(null); }}>
              <button className="ct-target" aria-pressed={sel} onClick={(e) => toggleSel(cb.id, e.shiftKey)}
                title={sel ? 'Desmarcar alvo' : 'Marcar como alvo (Shift: intervalo)'} aria-label={`${sel ? 'Desmarcar' : 'Marcar'} ${info.name} como alvo`}>
                {sel ? <Check size={14} strokeWidth={3} /> : <Crosshair size={14} />}
              </button>
              <button className="ct-main" onClick={() => setFocus(open ? '' : cb.id)} aria-expanded={open}
                title={open ? info.name : `${info.name}: mais ações`}>
                <span className="ct-pic">
                  {info.character
                    ? <Avatar config={info.character.avatar} size={28} />
                    : info.threat ? <span className={`map-token-threat threat-cat-${info.threat.category}`}><ThreatGlyph category={info.threat.category} size={14} /></span> : null}
                  {isTurn && <span className="pq-play"><Play size={8} fill="currentColor" /></span>}
                </span>
                <span className="ct-body">
                  <span className="ct-line">
                    <strong className="ct-name">{info.name}</strong>
                    {cb.hidden && <EyeOff size={11} className="muted" aria-label="Oculto dos jogadores" />}
                    {isNext && <span className="cbt-tag">a seguir</span>}
                    {info.down && <HealthBadge health={info.health} />}
                  </span>
                  <span className="ct-line">
                    <span className={`bar ct-hp ${info.pv < 0 ? 'neg' : ''}`}><span style={{ width: info.pv < 0 ? '100%' : pct(info.pv, info.pvMax) }} /></span>
                    <span className="mono tiny ct-pv">{info.pv}/{info.pvMax}</span>
                  </span>
                </span>
              </button>
              <button className="btn btn-sm ct-dmg" onClick={() => setAdjust({ id: cb.id, start: { track: 'pv', op: 'phys' } })} title={`Dano em ${info.name}`}>
                <Heart size={13} className="pv" /><span className="ct-dmg-label">Dano</span>
              </button>
              {cond.length > 0 && (
                <div className="ct-conds">
                  <ConditionChips conditions={cond} onRemove={(id) => void act({ type: 'combat/conditionRemove', combatantId: cb.id, conditionId: id })} />
                </div>
              )}
              {open && (
                <div className="ct-more">
                  <div className="tiny muted ct-stats">
                    DEF {info.def}{info.rdPhysical || info.rdMagic ? ` · RD ${info.rdPhysical}/${info.rdMagic}` : ''}
                    {info.peMax > 0 && <> · <span className="pe">PE {info.pe}/{info.peMax}</span></>}
                  </div>
                  <div className="ct-actions">
                    <button className="btn btn-sm" onClick={() => setAdjust({ id: cb.id, start: { track: 'pv', op: 'heal' } })}><Plus size={13} /> Curar</button>
                    {info.peMax > 0 && (
                      <button className="btn btn-sm" onClick={() => setAdjust({ id: cb.id, start: { track: 'pe', op: 'spend' } })}><Zap size={13} className="pe" /> PE</button>
                    )}
                    <button className="btn btn-sm" onClick={() => setCondFor([cb.id])}><Tag size={13} /> Condição</button>
                    {started && !isTurn && (
                      <button className="btn btn-sm" onClick={() => void act({ type: 'combat/setTurn', combatantId: cb.id })} title="Passar a vez para este combatente"><Play size={12} /> Dar a vez</button>
                    )}
                    <button className="btn btn-sm" onClick={() => setSheetFor(cb.id)}><FileText size={13} /> Ficha</button>
                    <span className="spacer" />
                    <button className="btn btn-sm btn-ghost btn-icon" disabled={idx === 0} onClick={() => void move(cb.id, idx - 1)} title="Subir na ordem" aria-label={`Subir ${info.name}`}><ChevronUp size={14} /></button>
                    <button className="btn btn-sm btn-ghost btn-icon" disabled={idx === entries.length - 1} onClick={() => void move(cb.id, idx + 1)} title="Descer na ordem" aria-label={`Descer ${info.name}`}><ChevronDown size={14} /></button>
                    <button className="btn btn-sm btn-ghost btn-icon" onClick={() => void act({ type: 'combat/hidden', combatantId: cb.id, hidden: !cb.hidden })}
                      title={cb.hidden ? 'Oculto dos jogadores — mostrar' : 'Visível aos jogadores — ocultar'} aria-label={cb.hidden ? 'Mostrar aos jogadores' : 'Ocultar dos jogadores'}>
                      {cb.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button className="btn btn-sm btn-ghost btn-icon" onClick={() => void act({ type: 'combat/remove', combatantIds: [cb.id] })} title="Tirar da fila" aria-label={`Tirar ${info.name} da fila`}><X size={14} /></button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {downIds.length > 0 && (
        <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => void act({ type: 'combat/remove', combatantIds: downIds })}>
          <Skull size={13} /> Tirar os {downIds.length} fora de combate
        </button>
      )}

      {selected.size > 0 && (
        <div className="cbt-selbar ct-selbar" role="toolbar" aria-label="Ações em grupo">
          <span className="small"><Crosshair size={13} className="pv" /> <strong>{selected.size}</strong></span>
          <span className="spacer" />
          <button className="btn btn-sm btn-danger" onClick={() => setGroup(true)}>Dano / cura</button>
          <button className="btn btn-sm" onClick={() => setCondFor(selIds)}><Tag size={13} /> Condição</button>
          <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setSelected(new Set())} aria-label="Limpar seleção"><X size={14} /></button>
        </div>
      )}

      {adding && <AddCombatantsModal table={table} combat={combat} onClose={() => setAdding(false)} />}
      {condFor && (
        <ConditionModal ids={condFor} names={condFor.map((id) => entries.find((e) => e.cb.id === id)?.info.name ?? '?')}
          anchor={current ? combatantInfo(table, current)?.name : undefined}
          onClose={() => setCondFor(null)} onDone={() => { if (condFor.length > 1) setSelected(new Set()); }} />
      )}
      {group && <GroupDamageModal table={table} combat={combat} ids={selIds} onClose={() => setGroup(false)} onDone={() => setSelected(new Set())} />}
      {ending && <EndCombatModal table={table} combat={combat} onClose={() => setEnding(false)} />}
      {adjustEntry && <AdjustModal entry={adjustEntry} start={adjust!.start} onClose={() => setAdjust(null)} />}
      {sheetEntry && (
        <Modal open width={760} title={sheetEntry.info.name} onClose={() => setSheetFor(null)}>
          {sheetEntry.info.threat
            ? <ThreatSheet key={sheetEntry.cb.id} t={sheetEntry.info.threat} combatantId={sheetEntry.cb.id} templateName={table.threats[sheetEntry.cb.ref.id]?.name} />
            : sheetEntry.info.character
              ? <CharacterSheet ch={sheetEntry.info.character} ownerName={sheetEntry.info.character.kind === 'npc' ? undefined : table.players[sheetEntry.info.character.ownerId]?.name} />
              : null}
        </Modal>
      )}
    </div>
  );
}

/** Dano, cura e PE de qualquer combatente pelo modal compartilhado. */
function AdjustModal({ entry, start, onClose }: { entry: Entry; start: AdjustStart; onClose: () => void }) {
  const { act } = useAct();
  const { info } = entry;
  const ch = info.character;
  const t = info.threat;
  const d = ch ? deriveStats(ch) : undefined;

  const set = async (pv: number, pe: number, reason: string) => {
    if (ch) return (await act({ type: 'resource/set', characterId: ch.id, pv, pe, reason })).ok;
    return (await act({ type: 'combat/resource', combatantId: entry.cb.id, pv, pe, reason })).ok;
  };
  const tracks: AdjustTrack[] = [
    {
      key: 'pv', label: 'PV', icon: <Heart size={16} color="var(--pv)" />, color: 'var(--pv)', barClass: 'bar-pv',
      current: info.pv, max: info.pvMax, min: ch ? info.pvMin : undefined, ops: pvOps(info.rdPhysical, info.rdMagic),
      status: (v) => {
        if (t) return v <= 0 && info.pv > 0 ? 'A ameaça é abatida (PV ≤ 0).' : undefined;
        if (v <= info.pvMin) return 'Fica com PV de morte: o personagem morre.';
        return v <= 0 && d?.unconsciousAtZero ? 'Fica inconsciente (PV ≤ 0).' : undefined;
      },
    },
    ...(info.peMax > 0 ? [{
      key: 'pe', label: 'PE', icon: <Zap size={16} color="var(--pe)" />, color: 'var(--pe)', barClass: 'bar-pe',
      current: info.pe, max: info.peMax, min: 0, ops: peOps(),
    }] : []),
  ];
  return (
    <ResourceAdjustModal title={`Ajustar ${info.name}`} tracks={tracks} start={start}
      onApply={(k, v, reason) => (k === 'pv' ? set(v, info.pe, reason) : set(info.pv, v, reason))}
      onClose={onClose} />
  );
}
