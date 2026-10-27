// Mapa do jogador: vê o mapa aberto, o alcance da própria ficha e move a ficha.
// Dois jeitos de traçar: pelo caminho mais curto até o destino, ou quadrado a quadrado,
// pelo trajeto exato. O cálculo é o mesmo do motor (grid sem os ocultos).
// Em combate, a fila fica numa faixa sobre o mapa e os controles do turno, perto do polegar.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock, Footprints, Hourglass, LocateFixed, Map as MapIcon, Moon, Undo2, X } from 'lucide-react';
import type { MoveGateKind, PlayerCombatant, PlayerMapMove, PlayerMapToken, PlayerView } from '../../model/types';
import { MOVE_MODES } from '../../model/types';
import { cellLabel } from '../../model/map';
import {
  buildGrid, canEnd, costTo, extendPath, followPath, metersFor, pathTo, reachableCells, reachFrom, type Point,
} from '../../rules/grid';
import { useAct } from '../act';
import { notify, toast } from '../common/toast';
import Avatar from '../common/Avatar';
import { CombatStrip, describeCombatant, EndTurnButton } from '../combat/playerCombat';
import { useTopbarHeight } from '../combat/common';
import MapCanvas, { type MapFocus, type MapPointer, type PointerKind } from './MapCanvas';
import { PathModeToggle, usePathMode } from './pathMode';
import type { RouteFn } from './useWalk';

const GATE: Record<MoveGateKind, { label: string; cls: string }> = {
  free: { label: 'Livre', cls: 'badge-ok' },
  request: { label: 'Pedir', cls: 'badge-warn' },
  blocked: { label: 'Aguarde', cls: 'badge-err' },
};

const meters = (sq: number) => `${metersFor(sq).toLocaleString('pt-BR')} m`;
const squaresText = (n: number) => `${n} quadrado${n === 1 ? '' : 's'}`;
const same = (a: Point | null | undefined, b: Point | null | undefined) => !!a && !!b && a.x === b.x && a.y === b.y;
/** Zoom mínimo ao levar a câmera até alguém: dá para tocar nos quadrados com o dedo. */
const FOCUS_ZOOM = 0.9;

export default function PlayerMapView({ view }: { view: PlayerView }) {
  const m = view.map!;
  const c = view.combat;
  const { act } = useAct();
  const root = useRef<HTMLDivElement>(null);
  useTopbarHeight(root);
  const [sel, setSel] = useState<string | null>(null);
  /** Quadrado sob o mouse (mostra o caminho; o clique move). */
  const [hover, setHover] = useState<Point | null>(null);
  /** No toque: destino escolhido, esperando confirmar. */
  const [armed, setArmed] = useState<Point | null>(null);
  const [sending, setSending] = useState(false);
  const [pathMode, setPathMode] = usePathMode();
  /** Quadrado a quadrado: o trajeto que está sendo traçado (começa no personagem). */
  const [draft, setDraftState] = useState<Point[] | null>(null);
  const draftRef = useRef<Point[] | null>(null);
  const setDraft = (d: Point[] | null) => { draftRef.current = d; setDraftState(d); };
  /** Arrastando a própria ficha. */
  const dragging = useRef(false);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const focusN = useRef(0);
  const focusOn = useCallback((p: Point, opts?: Omit<MapFocus, 'x' | 'y' | 'n'>) => {
    focusN.current += 1;
    setFocus({ x: p.x, y: p.y, n: focusN.current, ...opts });
  }, []);

  const turnCb = c?.order.find((x) => x.id === c.turnId);
  const myTurn = turnCb?.mine ? turnCb : undefined;
  const turnMove = m.moves.find((mv) => m.tokens.find((t) => t.id === mv.tokenId)?.turn);
  const current: PlayerMapMove | undefined = m.moves.find((mv) => mv.characterId === sel) ?? turnMove ?? m.moves[0];
  const token = current ? m.tokens.find((t) => t.id === current.tokenId) : undefined;

  const grid = useMemo(() => buildGrid(m), [m]);
  const occupied = useMemo(() => new Set(m.tokens.filter((t) => t.id !== token?.id).map((t) => t.y * m.w + t.x)), [m.tokens, m.w, token?.id]);
  const reach = useMemo(
    () => (token && current ? reachFrom(grid, token, current.remaining, current.parity, occupied) : null),
    [grid, token, current, occupied],
  );
  const reachCells = useMemo(() => (reach && current?.gate !== 'blocked' ? reachableCells(reach) : []), [reach, current?.gate]);

  // O rascunho e o destino escolhido só valem enquanto o personagem está onde começam.
  useEffect(() => {
    const d = draftRef.current;
    if (d && (!token || d[0].x !== token.x || d[0].y !== token.y)) setDraft(null);
    setArmed(null);
  }, [token?.x, token?.y, token?.id]);
  useEffect(() => { setDraft(null); setArmed(null); }, [pathMode]);

  // Ao abrir o mapa: a câmera vai até a própria ficha.
  useEffect(() => {
    if (token) focusOn(token, { zoom: window.innerWidth < 640 ? FOCUS_ZOOM : undefined });
    // Só ao trocar de mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id]);

  // Começou a sua vez: seleciona quem age e leva a câmera até ele.
  const myTurnId = myTurn?.id;
  useEffect(() => {
    if (!myTurnId) return;
    setSel(null);
    const t = m.tokens.find((x) => x.combatantId === myTurnId);
    if (t) focusOn(t, { zoom: FOCUS_ZOOM, ping: true, smooth: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurnId]);

  // A própria ficha recebe o toque direto (sem virar rolagem): dá para arrastá-la no celular.
  const tokens = useMemo(() => m.tokens.map((t) => {
    const mv = t.mine ? m.moves.find((x) => x.tokenId === t.id) : undefined;
    return mv && mv.gate !== 'blocked' ? { ...t, grab: true } : t;
  }), [m.tokens, m.moves]);

  const pending = view.myRequests.filter((r) => r.status === 'pending' && r.action.type === 'map/move' && r.action.mapId === m.id);
  const ghosts = pending.map((r) => (r.action.type === 'map/move' ? { x: r.action.x, y: r.action.y } : { x: -1, y: -1 }));

  // Caminho mostrado: o rascunho (quadrado a quadrado) ou o mais curto até o destino escolhido / sob o mouse.
  const draftCost = draft && draft.length > 1 && current ? followPath(grid, draft, current.parity) : null;
  const dest = pathMode === 'auto' ? (armed ?? hover) : null;
  const target = dest && reach && costTo(reach, dest.x, dest.y) > 0 && canEnd(reach, dest.x, dest.y) ? dest : null;
  const autoPath = target && reach ? pathTo(reach, target.x, target.y) : null;
  const shown = draft && draftCost ? { cells: draft, cost: draftCost.cost } : autoPath;
  /** Movimento pronto para confirmar pelo botão. */
  const plan = draft && draftCost
    ? { to: draft[draft.length - 1], cost: draftCost.cost, cells: draft }
    : armed && autoPath ? { to: armed, cost: autoPath.cost, cells: undefined } : null;

  // Caminhada de quem não traz rastro: o mais curto no que o jogador vê.
  const route = useCallback<RouteFn>((_id, from, to) => pathTo(reachFrom(grid, from, Infinity), to.x, to.y)?.cells ?? null, [grid]);

  const clearPlan = () => { setDraft(null); setArmed(null); setHover(null); };

  const send = async (to: Point, cells?: Point[]) => {
    if (!current || sending) return;
    if (current.gate === 'blocked') { toast(current.reason ?? 'Você não pode se mover agora.', 'error'); return; }
    if (occupied.has(to.y * m.w + to.x)) { toast('Já tem alguém nesse quadrado.', 'info'); return; }
    setSending(true);
    const r = await act({
      type: 'map/move', mapId: m.id, characterId: current.characterId, x: to.x, y: to.y,
      ...(cells ? { path: cells } : {}),
    });
    setSending(false);
    if (r.ok) clearPlan();
  };

  const confirm = () => { if (plan) void send(plan.to, plan.cells); };

  const sendDraft = () => {
    const d = draftRef.current;
    if (d && d.length > 1) void send(d[d.length - 1], d);
  };

  /** Quadrado a quadrado: leva o rascunho até `cell` (ou corta nele). */
  const extendTo = (cell: Point) => {
    if (!token || !current) return;
    const base = draftRef.current ?? [{ x: token.x, y: token.y }];
    const next = extendPath(grid, base, cell, current.parity, current.remaining);
    if (!same(next[next.length - 1], cell) && !dragging.current) {
      toast(current.remaining ? 'Não dá para seguir por aí.' : 'Sem deslocamento restante neste turno.', 'info');
    }
    setDraft(next);
  };

  /** Toque num token que não é seu: diz quem é (no celular não há dica ao passar o mouse). */
  const describe = (t: PlayerMapToken) => {
    const cb = t.combatantId ? c?.order.find((x) => x.id === t.combatantId) : undefined;
    notify({ kind: 'info', text: cb && c ? describeCombatant(cb, c) : t.name, tag: 'combat-who', duration: 3500 });
  };

  const onPointer = (kind: PointerKind, p: MapPointer): boolean | void => {
    const cell = p.cell;
    if (kind === 'leave') {
      // O navegador tomou o gesto (rolagem, pinça): o arraste acaba sem mover.
      if (p.e.type === 'pointercancel') { dragging.current = false; if (p.e.pointerType !== 'mouse') setHover(null); }
      if (p.e.pointerType === 'mouse' && !dragging.current) setHover(null);
      return;
    }

    if (kind === 'down') {
      // Arrastar a própria ficha: no mais curto, leva até onde soltar; no exato, desenha o trajeto.
      const mine = cell ? m.tokens.find((t) => same(t, cell) && t.mine) : undefined;
      if (!mine || !mine.characterId) return false;
      setSel(mine.characterId);
      const mv = m.moves.find((x) => x.characterId === mine.characterId);
      if (!mv || mv.gate === 'blocked') return false;
      dragging.current = true;
      setArmed(null);
      if (pathMode === 'exact') setDraft([{ x: mine.x, y: mine.y }]);
      return true;
    }

    if (kind === 'move') {
      if (dragging.current) {
        if (!cell) return;
        if (pathMode === 'exact') extendTo(cell);
        else setHover(cell);
        return;
      }
      if (p.e.pointerType === 'mouse') setHover(cell);
      return;
    }

    if (kind === 'up') {
      if (!dragging.current) return;
      dragging.current = false;
      if (pathMode === 'exact') { sendDraft(); return; }
      if (cell && reach && costTo(reach, cell.x, cell.y) > 0 && canEnd(reach, cell.x, cell.y)) void send(cell);
      if (p.e.pointerType !== 'mouse') setHover(null);
      return;
    }

    // Toque / clique.
    if (!cell) return;
    const { x, y } = cell;
    const here = m.tokens.find((t) => t.x === x && t.y === y);
    if (here?.mine) {
      setSel(here.characterId ?? null);
      setHover(null);
      setArmed(null);
      if (pathMode === 'exact') setDraft([{ x, y }]);
      return;
    }
    if (here) { describe(here); return; }
    if (!current) return;
    if (current.gate === 'blocked') { toast(current.reason ?? 'Aguarde.', 'info'); return; }

    if (pathMode === 'exact') {
      const d = draftRef.current;
      // Tocar de novo no fim do trajeto confirma.
      if (d && d.length > 1 && same(d[d.length - 1], cell)) { sendDraft(); return; }
      extendTo(cell);
      return;
    }

    if (!reach || costTo(reach, x, y) <= 0 || !canEnd(reach, x, y)) {
      setArmed(null);
      toast(current.remaining ? 'Fora do alcance.' : 'Sem deslocamento restante neste turno.', 'info');
      return;
    }
    // No toque, o primeiro toque escolhe o destino; o botão (ou outro toque no mesmo quadrado) confirma.
    if (p.e.pointerType !== 'mouse') {
      if (same(armed, cell)) void send(cell);
      else setArmed({ x, y });
      return;
    }
    void send({ x, y });
  };

  // Atalhos: Backspace volta um passo, Enter confirma, Esc limpa.
  useEffect(() => {
    if (!draft && !armed) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape') { clearPlan(); return; }
      if (e.key === 'Enter') { e.preventDefault(); confirm(); return; }
      if (e.key === 'Backspace' && draft) {
        e.preventDefault();
        const d = draftRef.current;
        if (d && d.length > 1) setDraft(d.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pickCombatant = (x: PlayerCombatant) => {
    const t = m.tokens.find((tk) => tk.combatantId === x.id) ?? (x.characterId ? m.tokens.find((tk) => tk.characterId === x.characterId) : undefined);
    if (!t) return;
    if (t.mine && t.characterId) setSel(t.characterId);
    focusOn(t, { zoom: FOCUS_ZOOM, ping: true, smooth: true });
  };

  const request = current?.gate === 'request';
  const pathLabel = shown ? `${squaresText(shown.cost)} · ${meters(shown.cost)}${request ? ' · pedir' : ''}` : undefined;
  const steps = draft ? draft.length - 1 : 0;
  const noneLeft = !!current && current.remaining === 0 && current.gate !== 'blocked';

  const hint = !current
    ? m.dark ? 'Está escuro: sem seu personagem no mapa, você não vê nada.' : 'Seu personagem não está neste mapa. O mestre coloca os tokens.'
    : current.gate === 'blocked'
      ? `${current.reason ?? 'Aguarde.'}${turnCb && !myTurn ? ` Vez de ${turnCb.name}.` : ''}`
      : noneLeft
        ? 'Sem deslocamento restante neste turno.'
        : pathMode === 'exact'
          ? steps > 0 ? 'Continue tocando nos quadrados do trajeto.' : 'Toque nos quadrados, um a um, ou arraste a ficha.'
          : 'Toque no destino (ou arraste a ficha).';

  return (
    <div className="pmap" ref={root}>
      <div className="pmap-head">
        <MapIcon size={14} className="gold" />
        <strong className="pmap-name">{m.name}</strong>
        <span className="badge" title={MOVE_MODES[m.mode].hint}>{MOVE_MODES[m.mode].label}</span>
        {m.dark && <span className="badge pmap-dark" title="Você só vê o cômodo onde seu personagem está. Porta fechada tapa a vista."><Moon size={11} /> Escuro</span>}
        <span className="tiny muted hide-sm pmap-mode-hint">{MOVE_MODES[m.mode].hint}</span>
      </div>

      {pending.length > 0 && (
        <div className="small secondary row pmap-pending">
          <Clock size={14} /> Pedido de movimento para {pending.map((r) => (r.action.type === 'map/move' ? cellLabel(r.action.x, r.action.y) : '')).join(', ')} aguardando o mestre.
        </div>
      )}

      <MapCanvas
        grid={m} objects={m.objects} tokens={tokens} fitKey={m.id}
        reach={reachCells} reachTone={current?.gate ?? 'free'}
        dim={m.dim}
        path={shown?.cells} pathLabel={pathLabel}
        ghosts={ghosts}
        selectedTokenId={token?.id}
        hoverCell={hover && !shown ? hover : null}
        touch="pan"
        onPointer={onPointer}
        route={route}
        focus={focus}
        top={c ? <CombatStrip combat={c} tokens={m.tokens} onPick={pickCombatant} /> : undefined}
        dock={<>
          {m.moves.length > 1 && (
            <span className="pmap-chars" role="radiogroup" aria-label="Quem se move">
              {m.moves.map((mv) => {
                const t = m.tokens.find((x) => x.id === mv.tokenId);
                const on = mv.characterId === current?.characterId;
                return (
                  <button key={mv.characterId} role="radio" aria-checked={on} className={`pmap-char${on ? ' on' : ''}`}
                    onClick={() => { setSel(mv.characterId); clearPlan(); if (t) focusOn(t, { smooth: true }); }} title={t?.name}>
                    <Avatar config={t?.avatar} size={22} /><span className="hide-xs">{t?.name ?? 'Ficha'}</span>
                  </button>
                );
              })}
            </span>
          )}
          {current && <MoveMeter mv={current} plan={shown?.cost ?? 0} name={m.moves.length === 1 ? token?.name : undefined} />}
          {token && (
            <button className="btn btn-sm btn-ghost btn-icon" onClick={() => focusOn(token, { zoom: FOCUS_ZOOM, ping: true, smooth: true })}
              title="Centralizar no meu personagem" aria-label="Centralizar no meu personagem">
              <LocateFixed size={14} />
            </button>
          )}
        </>}
        bottom={(
          <div className={`pmap-actions${plan ? ' has-plan' : ''}${myTurn ? ' my-turn' : ''}`}>
            {plan ? (
              <>
                <span className="pmap-plan">
                  <span className="tiny muted">{request ? 'Pedir para ir a' : 'Ir para'}</span>
                  <strong>{cellLabel(plan.to.x, plan.to.y)}</strong>
                  <span className="tiny secondary">{squaresText(plan.cost)} · {meters(plan.cost)}</span>
                </span>
                {steps > 1 && (
                  <button className="btn btn-icon pmap-btn" onClick={() => setDraft(draft!.slice(0, -1))} title="Voltar um passo (Backspace)" aria-label="Voltar um passo">
                    <Undo2 size={16} />
                  </button>
                )}
                <button className="btn btn-icon pmap-btn" onClick={clearPlan} title="Cancelar (Esc)" aria-label="Cancelar o movimento"><X size={16} /></button>
                <button className="btn btn-primary pmap-btn pmap-go" disabled={sending} onClick={confirm} title="Confirmar (Enter)">
                  <Check size={16} /> {request ? 'Pedir' : 'Mover'}
                </button>
              </>
            ) : (
              <>
                {current && current.gate !== 'blocked' && !noneLeft && <PathModeToggle mode={pathMode} onChange={setPathMode} />}
                <span className="pmap-hint tiny muted">
                  {current?.gate === 'blocked' && <Hourglass size={12} />} {hint}
                </span>
                {myTurn && <EndTurnButton mine={myTurn} className={`btn pmap-btn pmap-end${noneLeft ? ' btn-primary pmap-end-glow' : ''}`} />}
              </>
            )}
          </div>
        )}
      />
    </div>
  );
}

/** Deslocamento do turno: um tracinho por quadrado (gastos, do caminho escolhido e livres). */
function MoveMeter({ mv, plan, name }: { mv: PlayerMapMove; plan: number; name?: string }) {
  const spent = mv.squares - mv.remaining;
  const after = Math.max(0, mv.remaining - plan);
  const segs = mv.squares > 0 && mv.squares <= 16;
  const title = mv.gate === 'blocked'
    ? (mv.reason ?? 'Aguarde.')
    : `Restam ${mv.remaining} de ${mv.squares} quadrados (${meters(mv.remaining)})${mv.gate === 'request' ? ' · o mestre aprova' : ''}`;
  return (
    <span className={`pmap-meter tone-${mv.gate}`} title={title} aria-label={title}>
      <Footprints size={14} />
      {name && <span className="pmap-meter-name hide-xs">{name}</span>}
      <span className="pmap-meter-num mono">
        {plan > 0 ? <><span className="muted">{mv.remaining}→</span><strong>{after}</strong></> : <strong>{mv.remaining}</strong>}
        <span className="muted">/{mv.squares}</span>
      </span>
      {segs ? (
        <span className="pmap-segs" aria-hidden="true">
          {Array.from({ length: mv.squares }, (_, i) => (
            <i key={i} className={i < spent ? 'used' : i < spent + plan ? 'plan' : ''} />
          ))}
        </span>
      ) : (
        <span className="pmap-bar" aria-hidden="true"><span style={{ width: `${(after / Math.max(1, mv.squares)) * 100}%` }} /></span>
      )}
      <span className={`badge ${GATE[mv.gate].cls} pmap-gate`}>{GATE[mv.gate].label}</span>
    </span>
  );
}
