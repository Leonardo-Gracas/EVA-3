// Tela de combate do mestre: a fila (ordem manual, arrastar ou ↑↓), a barra de
// turno sempre à mão e, ao lado, a ficha de quem está agindo.
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Crosshair, Eye, EyeOff, Flag, GripVertical, Heart, Play,
  Plus, Skull, Swords, Tag, Users, X, Zap,
} from 'lucide-react';
import type { Combat, Combatant, TableState } from '../../model/types';
import {
  combatantInfo, conditionAnchor, conditionRemaining, currentCombatant, nextUp, SIDE_LABELS, type CombatantInfo,
} from '../../store/combat';
import { deriveStats } from '../../rules/derive';
import { useAct } from '../act';
import Avatar from '../common/Avatar';
import ResourceAdjustModal, { peOps, pvOps, type AdjustStart, type AdjustTrack } from '../common/ResourceAdjust';
import CharacterSheet from '../sheet/CharacterSheet';
import { ThreatSheet } from '../gm/ThreatsPanel';
import { AddCombatantsModal, ConditionModal, EndCombatModal, GroupDamageModal } from './CombatModals';
import { ConditionChips, HealthBadge, pct, sideClass, useTopbarHeight, type ChipCondition } from './common';

interface Entry { cb: Combatant; info: CombatantInfo }

export default function CombatPanel({ table }: { table: TableState }) {
  const { act } = useAct();
  const combat = table.combat;

  if (!combat) {
    const pcs = Object.values(table.characters).filter((c) => c.kind === 'pc' && c.status === 'approved');
    const create = async (withPcs: boolean) => {
      const r = await act({ type: 'combat/create' });
      if (r.ok && withPcs && pcs.length) await act({ type: 'combat/add', refs: pcs.map((c) => ({ kind: 'character' as const, id: c.id })) });
    };
    return (
      <div className="combat-empty card">
        <Swords size={34} className="gold" />
        <h2>Nenhum combate aberto</h2>
        <p className="secondary">
          Monte a fila com personagens, NPCs e ameaças na ordem em que vão agir. Durante o combate, o app passa os turnos,
          conta as rodadas e as condições, e os jogadores acompanham tudo pelo celular.
        </p>
        <div className="row-wrap" style={{ justifyContent: 'center' }}>
          {pcs.length > 0 && (
            <button className="btn btn-primary btn-lg" onClick={() => void create(true)}>
              <Users size={16} /> Montar com os {pcs.length} personagens
            </button>
          )}
          <button className={`btn btn-lg${pcs.length ? '' : ' btn-primary'}`} onClick={() => void create(false)}>
            <Plus size={16} /> Fila vazia
          </button>
        </div>
      </div>
    );
  }
  return <CombatBoard table={table} combat={combat} />;
}

function CombatBoard({ table, combat }: { table: TableState; combat: Combat }) {
  const { act } = useAct();
  const root = useRef<HTMLDivElement>(null);
  useTopbarHeight(root);

  const entries: Entry[] = useMemo(
    () => combat.order.flatMap((cb) => { const info = combatantInfo(table, cb); return info ? [{ cb, info }] : []; }),
    [combat.order, table],
  );
  const current = currentCombatant(combat);
  const upNext = combat.round > 0 ? nextUp(table, combat) : undefined;
  const started = combat.round > 0;

  /** Quem aparece no detalhe; null = segue o turno. */
  const [focusId, setFocusId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [adjust, setAdjust] = useState<{ id: string; start: AdjustStart } | null>(null);
  const [condFor, setCondFor] = useState<string[] | null>(null);
  const [group, setGroup] = useState(false);
  const [ending, setEnding] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const focus = entries.find((e) => e.cb.id === focusId) ?? entries.find((e) => e.cb.id === current?.id) ?? entries[0];
  const following = !focusId || focusId === current?.id;

  // Seleção e foco de quem saiu da fila somem sozinhos.
  useEffect(() => {
    const ids = new Set(combat.order.map((x) => x.id));
    if (focusId && !ids.has(focusId)) setFocusId(null);
    if ([...selected].some((id) => !ids.has(id))) setSelected(new Set([...selected].filter((id) => ids.has(id))));
  }, [combat.order, focusId, selected]);

  // A cada turno novo, o detalhe volta a seguir quem está agindo.
  useEffect(() => { setFocusId(null); }, [current?.id, combat.round]);

  const next = () => act(started ? { type: 'combat/next' } : { type: 'combat/start' });
  const prev = () => act({ type: 'combat/prev' });

  // Atalhos: N = próximo turno, B = voltar. Ignora quando há campo ou modal em uso.
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

  const openDetail = (id: string) => { setFocusId(id); setDetailOpen(true); };

  // Alvos: clique alterna; Shift+clique marca o intervalo desde o último marcado.
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

  // Arrastar para reordenar (mouse). No toque, as setas ↑↓ fazem o mesmo.
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

  return (
    <div className="combat" ref={root}>
      {/* ── Barra de turno ── */}
      <div className="combat-bar">
        <div className="combat-round" aria-label={started ? `Rodada ${combat.round}` : 'Preparando'}>
          <span className="combat-round-lbl">{started ? 'Rodada' : 'Preparo'}</span>
          <span className="combat-round-num">{started ? combat.round : '—'}</span>
        </div>
        <div className="combat-now grow">
          {started && current ? (
            <>
              <div className="combat-now-who">
                <span className="tiny muted">Vez de</span>{' '}
                <strong>{combatantInfo(table, current)?.name ?? '?'}</strong>
              </div>
              <div className="tiny muted">{upNext ? <>A seguir: {combatantInfo(table, upNext)?.name}</> : 'Ninguém mais em condição de agir'}</div>
            </>
          ) : (
            <>
              <div className="combat-now-who"><strong>Montando a fila</strong></div>
              <div className="tiny muted">{combat.order.length ? 'Arrume a ordem e inicie quando estiver pronto.' : 'Adicione quem vai lutar.'}</div>
            </>
          )}
        </div>
        <div className="combat-controls">
          {started && (
            <button className="btn btn-icon" onClick={() => void prev()} title="Turno anterior (B)" aria-label="Turno anterior"><ChevronLeft size={18} /></button>
          )}
          <button className="btn btn-primary combat-next" disabled={!combat.order.length} onClick={() => void next()} title={started ? 'Próximo turno (N)' : 'Iniciar combate (N)'}>
            {started ? <>Próximo turno <ChevronRight size={16} /></> : <><Play size={15} /> Iniciar combate</>}
            <kbd className="desktop-only">N</kbd>
          </button>
          <button className="btn btn-icon btn-ghost" onClick={() => setEnding(true)} title="Encerrar combate" aria-label="Encerrar combate"><Flag size={16} /></button>
        </div>
      </div>

      <div className={`split split-master combat-split${detailOpen ? ' split-detail-open' : ''}`}>
        {/* ── Fila ── */}
        <div className="col split-list">
          <div className="row">
            <div className="card-title grow" style={{ margin: 0 }}>Fila · {combat.order.length}</div>
            <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}><Plus size={14} /> Adicionar</button>
          </div>

          {entries.length > 1 && (
            <div className="cbt-quickpick" role="group" aria-label="Marcar alvos">
              <Crosshair size={13} className="muted" />
              <span className="tiny muted">Marcar:</span>
              {threatCount > 0 && <button className="cbt-qp" onClick={() => pickGroup((e) => e.info.side === 'threat')}>Ameaças ({threatCount})</button>}
              {allyCount > 0 && <button className="cbt-qp" onClick={() => pickGroup((e) => e.info.side !== 'threat')}>Aliados ({allyCount})</button>}
              <button className="cbt-qp" onClick={() => pickGroup(() => true)}>Todos</button>
            </div>
          )}

          {entries.length === 0 && (
            <div className="empty col" style={{ alignItems: 'center' }}>
              <p>A fila está vazia.</p>
              <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Plus size={14} /> Adicionar combatentes</button>
            </div>
          )}

          <ol className={`cbt-list${selected.size ? ' cbt-targeting' : ''}`} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(null); }}>
            {entries.map(({ cb, info }, idx) => {
              const isTurn = cb.id === current?.id;
              const isNext = cb.id === upNext?.id;
              const sel = selected.has(cb.id);
              return (
                <li key={cb.id}
                  className={[
                    'cbt-row', sideClass(info.side), isTurn && 'cbt-current', info.down && 'cbt-down', sel && 'cbt-selected',
                    focus?.cb.id === cb.id && 'cbt-focus', dragId === cb.id && 'cbt-dragging',
                    dropAt === idx && 'cbt-drop-before', dropAt === idx + 1 && idx === entries.length - 1 && 'cbt-drop-after',
                  ].filter(Boolean).join(' ')}
                  draggable onDragStart={(e) => onDragStart(e, cb.id)} onDragOver={(e) => onDragOver(e, idx)} onDrop={onDrop}
                  onDragEnd={() => { setDragId(null); setDropAt(null); }}>
                  {/* Faixa de alvo: a lateral inteira da linha, com a cor do lado. */}
                  <button className="cbt-target" aria-pressed={sel} onClick={(e) => toggleSel(cb.id, e.shiftKey)}
                    title={sel ? 'Desmarcar alvo' : 'Marcar como alvo (Shift: intervalo)'} aria-label={`${sel ? 'Desmarcar' : 'Marcar'} ${info.name} como alvo`}>
                    {sel ? <Check size={16} strokeWidth={3} /> : <Crosshair size={16} />}
                  </button>
                  <div className="cbt-order">
                    <button className="cbt-arrow" disabled={idx === 0} onClick={() => void move(cb.id, idx - 1)} aria-label={`Subir ${info.name}`}><ChevronUp size={14} /></button>
                    <span className="cbt-grip" aria-hidden><GripVertical size={14} /></span>
                    <button className="cbt-arrow" disabled={idx === entries.length - 1} onClick={() => void move(cb.id, idx + 1)} aria-label={`Descer ${info.name}`}><ChevronDown size={14} /></button>
                  </div>
                  {/* div, não button: as condições dentro têm o próprio botão de remover. */}
                  <div className="cbt-main" role="button" tabIndex={0} aria-label={`Ver ficha de ${info.name}`}
                    onClick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey) toggleSel(cb.id, e.shiftKey); else openDetail(cb.id); }}
                    onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(cb.id); } }}>
                    <div className="row cbt-head">
                      {isTurn && <Play size={12} className="gold cbt-play" fill="currentColor" />}
                      {info.character && <Avatar config={info.character.avatar} size={24} />}
                      <strong className="cbt-name">{info.name}</strong>
                      {cb.hidden && <EyeOff size={12} className="muted" aria-label="Oculto dos jogadores" />}
                      {isNext && <span className="cbt-tag">a seguir</span>}
                      {info.down && <HealthBadge health={info.health} />}
                    </div>
                    <div className={`bar cbt-bar ${info.pv < 0 ? 'bar-neg' : 'bar-pv'}`}><div style={{ width: info.pv < 0 ? '100%' : pct(info.pv, info.pvMax) }} /></div>
                    <div className="row tiny cbt-sub">
                      <span className="pv mono">{info.pv}/{info.pvMax}</span>
                      {info.peMax > 0 && <span className="pe mono">{info.pe}/{info.peMax} PE</span>}
                      <span className="muted" title={`Defesa ${info.def} · RD física ${info.rdPhysical} · RD mágica ${info.rdMagic}`}>
                        DEF {info.def}{info.rdPhysical || info.rdMagic ? ` · RD ${info.rdPhysical}/${info.rdMagic}` : ''}
                        <span className="cbt-stats"> · {SIDE_LABELS[info.side]}</span>
                      </span>
                      <ConditionChips conditions={chips(cb)} onRemove={(id) => void act({ type: 'combat/conditionRemove', combatantId: cb.id, conditionId: id })} />
                    </div>
                  </div>
                  <div className="cbt-actions">
                    <button className="btn btn-sm" onClick={() => setAdjust({ id: cb.id, start: { track: 'pv', op: 'phys' } })} title="Dano"><Heart size={13} className="pv" /> Dano</button>
                    <button className="btn btn-sm btn-icon" onClick={() => setAdjust({ id: cb.id, start: { track: 'pv', op: 'heal' } })} title="Curar" aria-label={`Curar ${info.name}`}><Plus size={14} /></button>
                    <button className="btn btn-sm btn-icon" onClick={() => setCondFor([cb.id])} title="Condição" aria-label={`Condição em ${info.name}`}><Tag size={14} /></button>
                    <button className="btn btn-sm btn-icon btn-ghost" onClick={() => void act({ type: 'combat/hidden', combatantId: cb.id, hidden: !cb.hidden })}
                      title={cb.hidden ? 'Oculto dos jogadores — mostrar' : 'Visível aos jogadores — ocultar'} aria-label={cb.hidden ? 'Mostrar aos jogadores' : 'Ocultar dos jogadores'}>
                      {cb.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button className="btn btn-sm btn-icon btn-ghost" onClick={() => void act({ type: 'combat/remove', combatantIds: [cb.id] })} title="Tirar da fila" aria-label={`Tirar ${info.name} da fila`}><X size={14} /></button>
                  </div>
                </li>
              );
            })}
          </ol>

          {downIds.length > 0 && (
            <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => void act({ type: 'combat/remove', combatantIds: downIds })}>
              <Skull size={13} /> Tirar da fila os {downIds.length} fora de combate
            </button>
          )}
          {entries.length > 1 && (
            <div className="tiny muted">
              Arraste as linhas ou use ↑↓ para mudar a ordem. Toque na faixa da esquerda para marcar alvos
              <span className="desktop-only"> (Shift marca um intervalo; Ctrl+clique na linha também marca)</span>.
            </div>
          )}

          {selected.size > 0 && (
            <div className="cbt-selbar" role="toolbar" aria-label="Ações em grupo">
              <span className="small"><Crosshair size={13} className="pv" /> <strong>{selected.size}</strong> alvo{selected.size > 1 ? 's' : ''}</span>
              <span className="spacer" />
              <button className="btn btn-sm btn-danger" onClick={() => setGroup(true)}><Crosshair size={13} /> Dano / cura</button>
              <button className="btn btn-sm" onClick={() => setCondFor(selIds)}><Tag size={13} /> Condição</button>
              <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setSelected(new Set())} aria-label="Limpar seleção"><X size={14} /></button>
            </div>
          )}
        </div>

        {/* ── Detalhe ── */}
        <div className="split-detail">
          <button className="btn btn-sm btn-ghost split-back" onClick={() => setDetailOpen(false)}><ArrowLeft size={14} /> Fila</button>
          {focus ? (
            <div className="col gap-lg">
              {!following && started && current && (
                <button className="btn btn-sm combat-follow" onClick={() => setFocusId(null)}>
                  <Play size={12} /> Voltar para quem está agindo: {combatantInfo(table, current)?.name}
                </button>
              )}
              <FocusCard entry={focus} isTurn={focus.cb.id === current?.id} started={started} chips={chips(focus.cb)}
                onCondition={() => setCondFor([focus.cb.id])} />
              {focus.info.threat ? <ThreatSheet key={focus.cb.id} t={focus.info.threat} combatantId={focus.cb.id} templateName={table.threats[focus.cb.ref.id]?.name} />
                : focus.info.character ? <CharacterSheet ch={focus.info.character} ownerName={focus.info.character.kind === 'npc' ? undefined : table.players[focus.info.character.ownerId]?.name} />
                : null}
            </div>
          ) : <div className="empty">Adicione combatentes para ver as fichas aqui.</div>}
        </div>
      </div>

      {adding && <AddCombatantsModal table={table} combat={combat} onClose={() => setAdding(false)} />}
      {condFor && (
        <ConditionModal ids={condFor} names={condFor.map((id) => entries.find((e) => e.cb.id === id)?.info.name ?? '?')}
          anchor={current ? combatantInfo(table, current)?.name : undefined}
          onClose={() => setCondFor(null)} onDone={() => { if (condFor.length > 1) setSelected(new Set()); }} />
      )}
      {group && <GroupDamageModal table={table} combat={combat} ids={selIds} onClose={() => setGroup(false)} onDone={() => setSelected(new Set())} />}
      {ending && <EndCombatModal table={table} combat={combat} onClose={() => setEnding(false)} />}
      {adjustEntry && <AdjustModal entry={adjustEntry} start={adjust!.start} onClose={() => setAdjust(null)} />}
    </div>
  );
}

/** Cabeçalho do detalhe: o combatente na fila (turno, condições, visibilidade). */
function FocusCard({ entry, isTurn, started, chips, onCondition }: {
  entry: Entry; isTurn: boolean; started: boolean; chips: ChipCondition[]; onCondition: () => void;
}) {
  const { act } = useAct();
  const { cb, info } = entry;
  return (
    <div className={`card cbt-focus-card ${sideClass(info.side)}${isTurn ? ' cbt-current' : ''}`}>
      <div className="row-wrap">
        {isTurn ? <span className="badge badge-gold"><Play size={11} fill="currentColor" /> Agindo agora</span> : <span className="badge">{SIDE_LABELS[info.side]}</span>}
        {cb.hidden && <span className="badge"><EyeOff size={11} /> Oculto dos jogadores</span>}
        {info.down && <HealthBadge health={info.health} />}
        <span className="spacer" />
        {started && !isTurn && (
          <button className="btn btn-sm" onClick={() => void act({ type: 'combat/setTurn', combatantId: cb.id })} title="Passar a vez para este combatente">
            <Zap size={13} /> Dar a vez
          </button>
        )}
        <button className="btn btn-sm" onClick={onCondition}><Tag size={13} /> Condição</button>
      </div>
      {cb.conditions.length > 0 && (
        <div className="mt">
          <ConditionChips conditions={chips} onRemove={(id) => void act({ type: 'combat/conditionRemove', combatantId: cb.id, conditionId: id })} />
        </div>
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
