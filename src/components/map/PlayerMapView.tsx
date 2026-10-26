// Mapa do jogador: vê o mapa aberto, o alcance da própria ficha e move a ficha.
// Dois jeitos de traçar: pelo caminho mais curto até o destino, ou quadrado a quadrado,
// pelo trajeto exato. O cálculo é o mesmo do motor (grid sem os ocultos).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock, Footprints, Hand, Map as MapIcon, Undo2, X } from 'lucide-react';
import type { MoveGateKind, PlayerMapMove, PlayerView } from '../../model/types';
import { MOVE_MODES } from '../../model/types';
import { cellLabel } from '../../model/map';
import {
  buildGrid, canEnd, costTo, extendPath, followPath, metersFor, pathTo, reachableCells, reachFrom, type Point,
} from '../../rules/grid';
import { useAct } from '../act';
import { toast } from '../common/toast';
import MapCanvas, { type MapPointer, type PointerKind } from './MapCanvas';
import { PATH_HINT, PathModeToggle, usePathMode } from './pathMode';
import type { RouteFn } from './useWalk';

const GATE: Record<MoveGateKind, { label: string; cls: string }> = {
  free: { label: 'Livre', cls: 'badge-ok' },
  request: { label: 'Pedir ao mestre', cls: 'badge-warn' },
  blocked: { label: 'Aguarde', cls: 'badge-err' },
};

const meters = (sq: number) => `${metersFor(sq).toLocaleString('pt-BR')} m`;
const same = (a: Point | null | undefined, b: Point | null | undefined) => !!a && !!b && a.x === b.x && a.y === b.y;

export default function PlayerMapView({ view }: { view: PlayerView }) {
  const m = view.map!;
  const { act } = useAct();
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [sending, setSending] = useState(false);
  const [pathMode, setPathMode] = usePathMode();
  /** Quadrado a quadrado: o trajeto que está sendo traçado (começa no personagem). */
  const [draft, setDraftState] = useState<Point[] | null>(null);
  const draftRef = useRef<Point[] | null>(null);
  const setDraft = (d: Point[] | null) => { draftRef.current = d; setDraftState(d); };
  /** Arrastando a própria ficha. */
  const dragging = useRef(false);

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

  // O rascunho só vale enquanto o personagem está onde ele começa.
  useEffect(() => {
    const d = draftRef.current;
    if (d && (!token || d[0].x !== token.x || d[0].y !== token.y)) setDraft(null);
  }, [token?.x, token?.y, token?.id]);
  useEffect(() => { if (pathMode === 'auto') setDraft(null); }, [pathMode]);

  const pending = view.myRequests.filter((r) => r.status === 'pending' && r.action.type === 'map/move' && r.action.mapId === m.id);
  const ghosts = pending.map((r) => (r.action.type === 'map/move' ? { x: r.action.x, y: r.action.y } : { x: -1, y: -1 }));

  // Caminho mostrado: o rascunho (quadrado a quadrado) ou o mais curto até o quadrado sob o ponteiro.
  const draftCost = draft && draft.length > 1 && current ? followPath(grid, draft, current.parity) : null;
  const target = pathMode === 'auto' && hover && reach && costTo(reach, hover.x, hover.y) > 0 && canEnd(reach, hover.x, hover.y) ? hover : null;
  const autoPath = target && reach ? pathTo(reach, target.x, target.y) : null;
  const shown = draft && draftCost ? { cells: draft, cost: draftCost.cost } : autoPath;

  // Caminhada de quem não traz rastro: o mais curto no que o jogador vê.
  const route = useCallback<RouteFn>((_id, from, to) => pathTo(reachFrom(grid, from, Infinity), to.x, to.y)?.cells ?? null, [grid]);

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
    if (r.ok) { setHover(null); setDraft(null); }
  };

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

  const onPointer = (kind: PointerKind, p: MapPointer): boolean | void => {
    const cell = p.cell;
    if (kind === 'leave') { if (p.e.pointerType === 'mouse' && !dragging.current) setHover(null); return; }

    if (kind === 'down') {
      // Arrastar a própria ficha: no mais curto, leva até onde soltar; no exato, desenha o trajeto.
      const mine = cell ? m.tokens.find((t) => same(t, cell) && t.mine) : undefined;
      if (!mine || !mine.characterId) return false;
      setSel(mine.characterId);
      const mv = m.moves.find((x) => x.characterId === mine.characterId);
      if (!mv || mv.gate === 'blocked') return false;
      dragging.current = true;
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
      return;
    }

    // Toque / clique.
    if (!cell) return;
    const { x, y } = cell;
    const mine = m.tokens.find((t) => t.x === x && t.y === y && t.mine);
    if (mine) {
      setSel(mine.characterId ?? null);
      setHover(null);
      if (pathMode === 'exact') setDraft([{ x, y }]);
      return;
    }
    if (current?.gate === 'blocked') { toast(current.reason ?? 'Aguarde.', 'info'); return; }

    if (pathMode === 'exact') {
      const d = draftRef.current;
      // Tocar de novo no fim do trajeto confirma.
      if (d && d.length > 1 && same(d[d.length - 1], cell)) { sendDraft(); return; }
      extendTo(cell);
      return;
    }

    if (!reach || costTo(reach, x, y) <= 0 || !canEnd(reach, x, y)) {
      if (current) toast(current.remaining ? 'Fora do alcance.' : 'Sem deslocamento restante neste turno.', 'info');
      return;
    }
    // No toque, o primeiro toque mostra o caminho; o segundo, no mesmo quadrado, confirma.
    if (p.e.pointerType !== 'mouse' && (hover?.x !== x || hover?.y !== y)) { setHover({ x, y }); return; }
    void send({ x, y });
  };

  // Atalhos do trajeto: Backspace volta um passo, Enter confirma, Esc limpa.
  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape') { setDraft(null); return; }
      if (e.key === 'Enter') { e.preventDefault(); sendDraft(); return; }
      if (e.key === 'Backspace') {
        e.preventDefault();
        const d = draftRef.current;
        if (d && d.length > 1) setDraft(d.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const request = current?.gate === 'request' ? ' · pedir' : '';
  const pathLabel = shown
    ? draft
      ? `${shown.cost} de ${current?.remaining ?? 0} quadrados · ${meters(shown.cost)}${request}`
      : `${shown.cost} quadrado${shown.cost === 1 ? '' : 's'} · ${meters(shown.cost)}${request}`
    : undefined;

  const steps = draft ? draft.length - 1 : 0;

  return (
    <div className="col gap-lg">
      <div className="row-wrap">
        <div className="grow">
          <div className="card-title" style={{ marginBottom: 2 }}><MapIcon size={14} /> {m.name}</div>
          <div className="tiny muted">Locomoção: {MOVE_MODES[m.mode].label.toLowerCase()}. {MOVE_MODES[m.mode].hint}</div>
        </div>
        {view.combat?.round ? <span className="badge">Rodada {view.combat.round}</span> : null}
      </div>

      {m.moves.length > 0 ? (
        <div className="row-wrap map-moves">
          {m.moves.map((mv) => {
            const t = m.tokens.find((x) => x.id === mv.tokenId);
            const on = mv.characterId === current?.characterId;
            return (
              <button key={mv.characterId} className={`map-move-chip${on ? ' on' : ''}`} onClick={() => setSel(mv.characterId)}>
                <Footprints size={14} />
                <span className="grow">
                  <strong>{t?.name ?? 'Ficha'}</strong>
                  <span className="tiny secondary">
                    {mv.gate === 'blocked' ? (mv.reason ?? 'Aguarde.') : `Restam ${mv.remaining} de ${mv.squares} quadrados (${meters(mv.remaining)})`}
                  </span>
                </span>
                <span className={`badge ${GATE[mv.gate].cls}`} title={mv.reason}>{mv.gate === 'request' ? <Hand size={11} /> : null}{GATE[mv.gate].label}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="empty small">Seu personagem não está neste mapa. O mestre coloca os tokens.</div>
      )}

      {pending.length > 0 && (
        <div className="small secondary row" style={{ gap: 6 }}>
          <Clock size={14} /> Pedido de movimento para {pending.map((r) => (r.action.type === 'map/move' ? cellLabel(r.action.x, r.action.y) : '')).join(', ')} aguardando o mestre.
        </div>
      )}

      <MapCanvas
        grid={m} objects={m.objects} tokens={m.tokens} fitKey={m.id}
        reach={reachCells} reachTone={current?.gate ?? 'free'}
        path={shown?.cells} pathLabel={pathLabel}
        ghosts={ghosts}
        selectedTokenId={token?.id}
        hoverCell={hover && !shown ? hover : null}
        touch="pan"
        onPointer={onPointer}
        route={route}
        dock={<>
          {m.moves.length > 0 && <PathModeToggle mode={pathMode} onChange={setPathMode} />}
          {steps > 0 ? (
            <span className="map-draft-bar">
              <span className="tiny muted">{steps} passo{steps === 1 ? '' : 's'}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => setDraft(draft!.slice(0, -1))} title="Voltar um passo (Backspace)"><Undo2 size={13} /> Passo</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setDraft(null)} title="Apagar o trajeto (Esc)"><X size={13} /> Limpar</button>
              <button className="btn btn-sm btn-primary" disabled={sending || !draftCost} onClick={sendDraft} title="Andar pelo trajeto (Enter)">
                <Check size={13} /> {current?.gate === 'request' ? 'Pedir' : 'Mover'}
              </button>
            </span>
          ) : (
            <span className="tiny muted map-dock-hint">
              {current?.gate === 'blocked' ? current.reason
                : pathMode === 'exact' ? `${PATH_HINT.exact} Toque no fim para confirmar.`
                  : 'Toque no destino para ver o caminho; toque de novo (ou arraste a ficha) para mover.'}
            </span>
          )}
        </>}
      />
    </div>
  );
}
