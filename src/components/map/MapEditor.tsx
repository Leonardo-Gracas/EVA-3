// Editor do mapa (mestre). Editar: terreno, paredes nas linhas, portas, móveis, gerar e
// redimensionar, com desfazer. Mesa: tokens, alcance e movimento sem limite.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Armchair, BrickWall, Check, DoorClosed, DoorOpen, Eraser, Eye, EyeOff, Link2, Link2Off, Lock, Unlock, MousePointer2, Paintbrush,
  Moon, Redo2, Scaling, Sun, Swords, Trash2, Undo2, Users, Wand2, X,
} from 'lucide-react';
import type {
  BattleMap, DoorState, EdgeRef, GameAction, MapDoor, MapLayout, MapObject, MapProp, MoveMode, PlaceRef, PropEffect, PropKind, TableState, Terrain,
} from '../../model/types';
import { DOOR_STATES, MAP_CELL_M, MAP_LIMITS, MOVE_MODES, PROP_EFFECTS, PROP_KINDS, TERRAIN_CHAR, TERRAINS } from '../../model/types';
import { cellLabel, edgeKey, hasWall, objectCells, sameEdge, terrainAt } from '../../model/map';
import { costTo, extendPath, followPath, metersFor, pathTo, reachableCells, reachFrom, type Point } from '../../rules/grid';
import { fullGrid, isTokenTurn, moveBudget, occupiedCells, playerGrid, tokenCombatant } from '../../store/maps';
import { visibleArea } from '../../rules/vision';
import { currentCombatant } from '../../store/combat';
import { hostStore } from '../../net/host';
import { useAct } from '../act';
import Modal from '../common/Modal';
import { SubTabs } from '../room/TopBar';
import { useUndo } from '../investigation/useUndo';
import { CombatTracker, TurnBar } from '../combat/CombatTracker';
import MapCanvas, { PROP_ICONS, type MapFocus, type MapPointer, type PointerKind } from './MapCanvas';
import MapGenerateModal from './MapGenerateModal';
import { edgesBetween, lineCells, rectCells } from './mapRender';
import { gmTokens } from './tokens';
import TokensPanel, { type Armed } from './TokensPanel';
import { PathModeToggle, usePathMode } from './pathMode';
import type { RouteFn } from './useWalk';

type Mode = 'edit' | 'play';
type Tool = 'select' | 'terrain' | 'wall' | 'door' | 'prop' | 'erase';

type Stroke =
  | { kind: 'paint'; cells: Set<number>; last: { x: number; y: number } }
  | { kind: 'rect'; for: 'terrain' | 'prop'; start: { x: number; y: number }; end: { x: number; y: number } }
  | { kind: 'walls'; on: boolean; start: EdgeRef; edges: Map<string, EdgeRef> }
  | { kind: 'erase'; cells: Set<number>; edges: Map<string, EdgeRef> }
  | { kind: 'token'; tokenId: string; at: { x: number; y: number } };

const TOOLS: Array<{ id: Tool; label: string; icon: JSX.Element; hint: string }> = [
  { id: 'select', label: 'Selecionar', icon: <MousePointer2 size={14} />, hint: 'Toque num móvel ou numa porta para editar.' },
  { id: 'terrain', label: 'Terreno', icon: <Paintbrush size={14} />, hint: 'Pinte os quadrados. Shift ou "Retângulo" pinta uma área.' },
  { id: 'wall', label: 'Parede', icon: <BrickWall size={14} />, hint: 'Clique ou arraste sobre as linhas do grid. Começar numa parede apaga.' },
  { id: 'door', label: 'Porta', icon: <DoorClosed size={14} />, hint: 'Clique numa linha para pôr uma porta. Clique de novo: fechada → aberta → trancada.' },
  { id: 'prop', label: 'Móvel', icon: <Armchair size={14} />, hint: 'Clique num quadrado ou arraste para o tamanho.' },
  { id: 'erase', label: 'Borracha', icon: <Eraser size={14} />, hint: 'Apaga paredes, portas e móveis por onde passar.' },
];

const layoutOf = (m: BattleMap): MapLayout => ({ w: m.w, h: m.h, cells: m.cells, wallsH: m.wallsH, wallsV: m.wallsV, objects: m.objects });

const metersLabel = (sq: number) => `${sq} quadrado${sq === 1 ? '' : 's'} · ${metersFor(sq).toLocaleString('pt-BR')} m`;

export default function MapEditor({ table, map, onBack }: { table: TableState; map: BattleMap; onBack: () => void }) {
  const { act } = useAct();
  const linked = table.combat?.mapId === map.id;
  const [mode, setMode] = useState<Mode>(() => (linked || Object.keys(map.tokens).length ? 'play' : 'edit'));
  const [tool, setTool] = useState<Tool>('terrain');
  const [terrain, setTerrain] = useState<Terrain>('floor');
  const [rectMode, setRectMode] = useState(false);
  const [propKind, setPropKind] = useState<PropKind>('mesa');
  const [selObj, setSelObj] = useState<string | null>(null);
  const [selTok, setSelTok] = useState<string | null>(null);
  const [hover, setHover] = useState<{ cell: { x: number; y: number } | null; edge: EdgeRef | null } | null>(null);
  const strokeRef = useRef<Stroke | null>(null);
  const [stroke, setStrokeState] = useState<Stroke | null>(null);
  const setStroke = (s: Stroke | null) => { strokeRef.current = s; setStrokeState(s); };
  const [gen, setGen] = useState(false);
  const [resizing, setResizing] = useState(false);
  /** Mesa: o que vai para o mapa no próximo clique. */
  const [armed, setArmed] = useState<Armed | null>(null);
  /** Mesa: porta com o balão de ações aberto. */
  const [doorPop, setDoorPop] = useState<string | null>(null);
  /** Mesa: caminho mais curto ou quadrado a quadrado (trajeto exato). */
  const [pathMode, setPathMode] = usePathMode();
  const [draft, setDraftState] = useState<Point[] | null>(null);
  const draftRef = useRef<Point[] | null>(null);
  const setDraft = (d: Point[] | null) => { draftRef.current = d; setDraftState(d); };
  /** Token sendo arrastado no quadrado a quadrado (o trajeto se desenha por onde o ponteiro passa). */
  const dragTok = useRef<string | null>(null);
  const [name, setName] = useState(map.name);
  useEffect(() => setName(map.name), [map.name]);

  const run = useCallback((a: GameAction) => act(a), [act]);
  const undo = useUndo(map.id, run);
  const mapRef = useRef(map);
  mapRef.current = map;

  /** Ações de edição com desfazer: guarda o desenho de antes e o de depois. */
  const edit = useCallback(async (label: string, actions: GameAction[], okText?: string) => {
    const before = layoutOf(mapRef.current);
    let last: string | undefined;
    for (const a of actions) {
      const r = await act(a, okText);
      if (!r.ok) return null;
      last = r.id;
    }
    const after = hostStore.get().table?.maps[map.id];
    if (after) {
      undo.push({
        label,
        undo: [{ type: 'map/restore', mapId: map.id, layout: before }],
        redo: [{ type: 'map/restore', mapId: map.id, layout: layoutOf(after) }],
      });
    }
    return last ?? '';
  }, [act, map.id, undo]);

  const objects = useMemo(() => Object.values(map.objects), [map.objects]);
  // Na mesa, todo token se pega com o dedo (o gesto que começa nele não rola o mapa).
  const tokens = useMemo(() => gmTokens(table, map).map((t) => (mode === 'play' ? { ...t, grab: true } : t)), [table, map, mode]);
  const selected = selObj ? map.objects[selObj] : undefined;
  const selToken = selTok ? map.tokens[selTok] : undefined;

  // ── Combate ligado ao mapa: a linha aberta na fila acompanha o token escolhido. ──
  const combat = table.combat;
  /** O combate é deste mapa (ou de nenhum): a fila fica aqui. */
  const combatHere = !!combat && (!combat.mapId || linked);
  const tokenOfCb = useMemo(() => {
    const out = new Map<string, string>();
    for (const t of Object.values(map.tokens)) { const cb = tokenCombatant(table, t); if (cb) out.set(cb.id, t.id); }
    return out;
  }, [table, map.tokens]);
  /** Linha aberta na fila; null = segue quem está agindo. */
  const [focusCb, setFocusCb] = useState<string | null>(null);
  const [camera, setCamera] = useState<MapFocus | null>(null);
  const cameraN = useRef(0);
  const lookAt = useCallback((tokenId: string) => {
    const t = mapRef.current.tokens[tokenId];
    if (!t) return;
    cameraN.current += 1;
    setCamera({ x: t.x, y: t.y, n: cameraN.current, ping: true, smooth: true });
  }, []);
  useEffect(() => {
    const cb = selToken ? tokenCombatant(table, selToken) : undefined;
    if (cb) setFocusCb(cb.id);
    // Só quando o mestre escolhe outro token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selTok]);
  // Turno novo: quem age fica escolhido no mapa (alcance à vista, pronto para mover).
  const turnId = currentCombatant(combat)?.id;
  useEffect(() => {
    setFocusCb(null);
    if (!turnId || !linked || mode !== 'play') return;
    const tok = tokenOfCb.get(turnId);
    if (tok) { setSelTok(tok); lookAt(tok); }
    // Só quando a vez muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId, combat?.round]);
  const focusFromTracker = (id: string | null) => {
    setFocusCb(id);
    if (!id) { if (id === '') setSelTok(null); return; }
    const tok = tokenOfCb.get(id);
    setSelTok(tok ?? null);
    if (tok) lookAt(tok);
  };
  // Visão escura: o mestre vê tudo, com sombra no que nenhum jogador vê agora.
  const fog = useMemo(() => {
    if (!map.dark || mode !== 'play') return undefined;
    const eyes = Object.values(map.tokens).flatMap((t) => {
      const ch = t.ref.kind === 'character' ? table.characters[t.ref.id] : undefined;
      return ch && ch.kind === 'pc' && ch.status === 'approved' && !t.hidden ? [{ x: t.x, y: t.y }] : [];
    });
    const { seen } = visibleArea(playerGrid(map), map.cells, eyes);
    const out: number[] = [];
    for (let i = 0; i < map.w * map.h; i++) if (!seen[i] && map.cells[i] !== TERRAIN_CHAR.void) out.push(i);
    return out;
  }, [map, table.characters, mode]);

  // Quem está no mapa e ainda não está na fila: fichas e criaturas soltas.
  const missing = Object.values(map.tokens).filter((t) => (t.ref.kind === 'creature' && !!t.threat)
    || (t.ref.kind === 'character' && table.characters[t.ref.id]?.status === 'approved'
      && !combat?.order.some((x) => x.ref.kind === 'character' && x.ref.id === t.ref.id))).length;
  const combatAll = () => act({ type: 'map/combat', mapId: map.id }, combat ? 'Combate trazido para este mapa.' : 'Combate aberto com todos do mapa.');

  useEffect(() => { if (selObj && !map.objects[selObj]) setSelObj(null); }, [map.objects, selObj]);
  useEffect(() => { if (selTok && !map.tokens[selTok]) setSelTok(null); }, [map.tokens, selTok]);
  useEffect(() => { if (doorPop && map.objects[doorPop]?.kind !== 'door') setDoorPop(null); }, [map.objects, doorPop]);
  useEffect(() => { if (mode !== 'play') { setArmed(null); setDoorPop(null); setDraft(null); } }, [mode]);
  useEffect(() => { if (pathMode === 'auto') setDraft(null); }, [pathMode]);
  // O trajeto só vale para o token escolhido, a partir de onde ele está.
  useEffect(() => {
    const d = draftRef.current;
    if (d && (!selToken || d[0].x !== selToken.x || d[0].y !== selToken.y)) setDraft(null);
  }, [selToken?.id, selToken?.x, selToken?.y]);

  // Caminhada dos tokens: o mesmo caminho mais curto que o mestre vê.
  const grid = useMemo(() => fullGrid(map), [map]);
  const route = useCallback<RouteFn>((_id, from, to) => pathTo(reachFrom(grid, from, Infinity), to.x, to.y)?.cells ?? null, [grid]);

  const placeAt = useCallback(async (ref: PlaceRef, x: number, y: number) => {
    await act({ type: 'map/tokenPlace', mapId: map.id, refs: [ref], x, y });
  }, [act, map.id]);

  const onDropToken = useCallback((data: string, cell: { x: number; y: number }) => {
    try {
      const ref = JSON.parse(data) as PlaceRef;
      if (ref && typeof ref.id === 'string') void placeAt(ref, cell.x, cell.y);
    } catch { /* arraste de outra coisa */ }
  }, [placeAt]);

  // Mesa: alcance do token escolhido (guia para o mestre, que move sem limite).
  const guide = useMemo(() => {
    if (mode !== 'play' || !selToken) return null;
    const turn = map.mode === 'turno' && isTokenTurn(table, map, selToken);
    const budget = moveBudget(table, selToken, turn);
    const g = fullGrid(map);
    const occupied = occupiedCells(table, map, selToken.id, false);
    const reach = reachFrom(g, selToken, budget.remaining, budget.parity, occupied);
    const free = reachFrom(g, selToken, Infinity, budget.parity, occupied);
    return { budget, reach, free, cells: reachableCells(reach), turn };
  }, [mode, selToken, table, map]);

  const tokenAt = (x: number, y: number) => Object.values(map.tokens).find((t) => t.x === x && t.y === y);
  const propAt = (x: number, y: number) => objects.find((o): o is MapProp => o.kind === 'prop' && x >= o.x && y >= o.y && x < o.x + o.w && y < o.y + o.h);
  const doorAt = (e: EdgeRef | null) => (e ? objects.find((o) => o.kind === 'door' && sameEdge(o.edge, e)) : undefined);

  const moveToken = async (tokenId: string, x: number, y: number, path?: Point[]) => {
    const t = map.tokens[tokenId];
    if (!t || (t.x === x && t.y === y)) return;
    const r = await act({ type: 'map/move', mapId: map.id, tokenId, x, y, ...(path ? { path } : {}) });
    if (r.ok && path) setDraft(null);
  };

  /** Quadrado a quadrado: leva o trajeto do token escolhido até `cell` (ou corta nele). O mestre não tem limite. */
  const extendDraft = (cell: { x: number; y: number }) => {
    if (!selToken) return;
    const base = draftRef.current ?? [{ x: selToken.x, y: selToken.y }];
    setDraft(extendPath(grid, base, cell, guide?.budget.parity ?? 0, Infinity));
  };

  const sendDraft = () => {
    const d = draftRef.current;
    if (selToken && d && d.length > 1) void moveToken(selToken.id, d[d.length - 1].x, d[d.length - 1].y, d);
  };

  const commit = async (s: Stroke) => {
    switch (s.kind) {
      case 'paint': {
        const ch = TERRAIN_CHAR[terrain];
        const cells = [...s.cells].filter((i) => map.cells[i] !== ch);
        if (cells.length) await edit(`Pintar ${TERRAINS[terrain].label.toLowerCase()}`, [{ type: 'map/paint', mapId: map.id, terrain, cells }]);
        return;
      }
      case 'rect': {
        if (s.for === 'terrain') {
          const ch = TERRAIN_CHAR[terrain];
          const cells = rectCells(s.start.x, s.start.y, s.end.x, s.end.y, map.w, map.h).filter((i) => map.cells[i] !== ch);
          if (cells.length) await edit(`Pintar ${TERRAINS[terrain].label.toLowerCase()}`, [{ type: 'map/paint', mapId: map.id, terrain, cells }]);
          return;
        }
        const r = propRect(s.start, s.end);
        const id = await edit(`Pôr ${PROP_KINDS[propKind].label.toLowerCase()}`, [{
          type: 'map/objectUpsert', mapId: map.id,
          object: { id: '', kind: 'prop', prop: propKind, label: '', ...r, effect: PROP_KINDS[propKind].effect, hidden: false },
        }]);
        if (id) setSelObj(id);
        return;
      }
      case 'walls': {
        const edges = [...s.edges.values()];
        if (edges.length) await edit(s.on ? 'Pôr parede' : 'Tirar parede', [{ type: 'map/walls', mapId: map.id, edges, on: s.on }]);
        return;
      }
      case 'erase': {
        const props = new Set<string>();
        for (const i of s.cells) {
          const p = propAt(i % map.w, Math.floor(i / map.w));
          if (p) props.add(p.id);
        }
        const edges = [...s.edges.values()].filter((e) => hasWall(map, e) || doorAt(e));
        const actions: GameAction[] = [];
        if (props.size) actions.push({ type: 'map/objectRemove', mapId: map.id, objectIds: [...props] });
        if (edges.length) actions.push({ type: 'map/walls', mapId: map.id, edges, on: false });
        if (actions.length) await edit('Apagar', actions);
        return;
      }
      case 'token':
        await moveToken(s.tokenId, s.at.x, s.at.y);
    }
  };

  const onPointer = (kind: PointerKind, p: MapPointer): boolean | void => {
    const { cell, edge } = p;
    const s = strokeRef.current;

    if (kind === 'leave') {
      setHover(null);
      return;
    }

    if (mode === 'play') {
      if (kind === 'move') {
        setHover({ cell, edge: null });
        if (dragTok.current && cell) extendDraft(cell);
        else if (s?.kind === 'token' && cell) setStroke({ ...s, at: cell });
        return;
      }
      if (kind === 'down') {
        if (armed) return false;
        const t = cell ? tokenAt(cell.x, cell.y) : undefined;
        if (!t) return false;
        setSelTok(t.id);
        setDoorPop(null);
        if (pathMode === 'exact') {
          // Arrastar desenha o trajeto; o token só anda ao soltar.
          dragTok.current = t.id;
          setDraft([{ x: t.x, y: t.y }]);
        } else {
          setStroke({ kind: 'token', tokenId: t.id, at: { x: t.x, y: t.y } });
        }
        return true;
      }
      if (kind === 'up') {
        if (dragTok.current) {
          dragTok.current = null;
          sendDraft();
          return;
        }
        if (s?.kind === 'token') {
          setStroke(null);
          void commit(s);
        }
        return;
      }
      if (kind === 'tap') {
        // Colocar o que está armado no painel.
        if (armed && cell) {
          void placeAt(armed.ref, cell.x, cell.y);
          if (!armed.repeat) setArmed(null);
          return;
        }
        // Porta: balão para abrir, fechar, trancar ou destrancar.
        const d = doorAt(edge);
        if (d) { setDoorPop(d.id === doorPop ? null : d.id); return; }
        setDoorPop(null);
        if (!cell) return;
        const t = tokenAt(cell.x, cell.y);
        if (t) return;
        if (!selToken) return;
        if (pathMode === 'exact') {
          const d = draftRef.current;
          // Clicar de novo no fim do trajeto confirma.
          if (d && d.length > 1 && d[d.length - 1].x === cell.x && d[d.length - 1].y === cell.y) sendDraft();
          else extendDraft(cell);
          return;
        }
        void moveToken(selToken.id, cell.x, cell.y);
      }
      return;
    }

    // Editar
    const wantsEdge = tool === 'wall' || tool === 'door' || tool === 'erase' || tool === 'select';
    if (kind === 'move') {
      setHover({ cell: wantsEdge && edge ? null : cell, edge: wantsEdge ? edge : null });
      if (!s) return;
      if (s.kind === 'paint' && cell) {
        const next = new Set(s.cells);
        for (const [x, y] of lineCells(s.last.x, s.last.y, cell.x, cell.y)) next.add(y * map.w + x);
        setStroke({ ...s, cells: next, last: cell });
      } else if (s.kind === 'rect' && cell) {
        setStroke({ ...s, end: cell });
      } else if (s.kind === 'walls' && edge) {
        const next = new Map(s.edges);
        for (const e of edgesBetween(s.start, edge)) next.set(edgeKey(e), e);
        setStroke({ ...s, edges: next });
      } else if (s.kind === 'erase') {
        const cells = new Set(s.cells);
        const edges = new Map(s.edges);
        if (edge) edges.set(edgeKey(edge), edge);
        else if (cell) cells.add(cell.y * map.w + cell.x);
        setStroke({ ...s, cells, edges });
      }
      return;
    }
    if (kind === 'down') {
      if (tool === 'terrain' && cell) {
        if (rectMode || p.e.shiftKey) setStroke({ kind: 'rect', for: 'terrain', start: cell, end: cell });
        else setStroke({ kind: 'paint', cells: new Set([cell.y * map.w + cell.x]), last: cell });
        return true;
      }
      if (tool === 'prop' && cell) {
        setStroke({ kind: 'rect', for: 'prop', start: cell, end: cell });
        return true;
      }
      if (tool === 'wall' && edge) {
        setStroke({ kind: 'walls', on: !hasWall(map, edge), start: edge, edges: new Map([[edgeKey(edge), edge]]) });
        return true;
      }
      if (tool === 'erase' && (edge || cell)) {
        setStroke({
          kind: 'erase',
          cells: new Set(!edge && cell ? [cell.y * map.w + cell.x] : []),
          edges: new Map(edge ? [[edgeKey(edge), edge]] : []),
        });
        return true;
      }
      return false;
    }
    if (kind === 'up') {
      if (s) {
        setStroke(null);
        void commit(s);
      }
      return;
    }
    if (kind === 'tap') {
      if (tool === 'door' && edge) {
        const d = doorAt(edge);
        if (d && d.kind === 'door') {
          const next: DoorState = d.state === 'closed' ? 'open' : d.state === 'open' ? 'locked' : 'closed';
          void act({ type: 'map/door', mapId: map.id, objectId: d.id, state: next });
          setSelObj(d.id);
        } else {
          void edit('Pôr porta', [{ type: 'map/objectUpsert', mapId: map.id, object: { id: '', kind: 'door', edge, state: 'closed', hidden: false } }])
            .then((id) => { if (id) setSelObj(id); });
        }
        return;
      }
      if (tool === 'select') {
        const d = doorAt(edge);
        const pr = cell ? propAt(cell.x, cell.y) : undefined;
        setSelObj(d?.id ?? pr?.id ?? null);
      }
    }
  };

  // Atalhos: desfazer/refazer, apagar o objeto escolhido, Esc solta a seleção.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); void (e.shiftKey ? undo.redo() : undo.undo()); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); void undo.redo(); return; }
      // Trajeto em andamento: Esc limpa, Enter anda, Backspace volta um passo.
      const d = draftRef.current;
      if (mode === 'play' && d) {
        if (e.key === 'Escape') { setDraft(null); return; }
        if (e.key === 'Enter') { e.preventDefault(); sendDraft(); return; }
        if (e.key === 'Backspace') { e.preventDefault(); if (d.length > 1) setDraft(d.slice(0, -1)); return; }
      }
      if (e.key === 'Escape') { setSelObj(null); setSelTok(null); setArmed(null); setDoorPop(null); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selObj && mode === 'edit') {
        e.preventDefault();
        void edit('Apagar objeto', [{ type: 'map/objectRemove', mapId: map.id, objectIds: [selObj] }]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, selObj, mode, edit, map.id, selToken]);

  // Prévia do traço em andamento.
  const preview = (() => {
    if (!stroke) return null;
    if (stroke.kind === 'paint') return { cells: [...stroke.cells], erase: terrain === 'void' };
    if (stroke.kind === 'rect') {
      if (stroke.for === 'terrain') return { cells: rectCells(stroke.start.x, stroke.start.y, stroke.end.x, stroke.end.y, map.w, map.h), erase: terrain === 'void' };
      return { rect: propRect(stroke.start, stroke.end) };
    }
    if (stroke.kind === 'walls') return { edges: [...stroke.edges.values()], erase: !stroke.on };
    if (stroke.kind === 'erase') {
      const cells: number[] = [];
      for (const i of stroke.cells) {
        const pr = propAt(i % map.w, Math.floor(i / map.w));
        if (pr) for (const [x, y] of objectCells(pr)) cells.push(y * map.w + x);
      }
      return { cells, edges: [...stroke.edges.values()], erase: true };
    }
    return null;
  })();

  // Mesa: caminho até o quadrado sob o ponteiro (ou até onde o token está sendo arrastado).
  // No quadrado a quadrado, mostra o trajeto traçado; senão, o mais curto até o ponteiro.
  const draftWalk = draft && draft.length > 1 ? followPath(grid, draft, guide?.budget.parity ?? 0) : null;
  const target = draft || pathMode === 'exact' ? null : stroke?.kind === 'token' ? stroke.at : mode === 'play' && !armed ? hover?.cell : null;
  const autoPath = guide && target && (target.x !== selToken?.x || target.y !== selToken?.y) ? pathTo(guide.free, target.x, target.y) : null;
  const path = draft && draftWalk ? { cells: draft, cost: draftWalk.cost } : autoPath;
  const pathCost = draft && draftWalk ? draftWalk.cost : autoPath ? costTo(guide!.free, target!.x, target!.y) : -1;
  const pathLabel = path ? `${metersLabel(pathCost)}${guide && pathCost > guide.budget.remaining ? ' · além do deslocamento' : ''}` : undefined;

  // Destinos pedidos pelos jogadores, à espera de aprovação.
  const ghosts = table.requests.flatMap((r) => (r.status === 'pending' && r.action.type === 'map/move' && r.action.mapId === map.id
    ? [{ x: r.action.x, y: r.action.y }] : []));

  const shownTokens = stroke?.kind === 'token'
    ? tokens.map((t) => (t.id === stroke.tokenId ? { ...t, x: stroke.at.x, y: stroke.at.y, dragging: true } : t))
    : tokens;

  const popDoor = doorPop ? map.objects[doorPop] : undefined;
  const popover = mode === 'play' && popDoor?.kind === 'door' ? {
    x: popDoor.edge.o === 'h' ? popDoor.edge.x + 0.5 : popDoor.edge.x,
    y: popDoor.edge.o === 'h' ? popDoor.edge.y : popDoor.edge.y + 0.5,
    content: <DoorActions door={popDoor} onClose={() => setDoorPop(null)}
      onState={(state) => act({ type: 'map/door', mapId: map.id, objectId: popDoor.id, state }, DOOR_DONE[state])} />,
  } : null;

  const playHint = armed
    ? `Clique num quadrado para colocar ${armed.name}. Esc cancela.`
    : pathMode === 'exact'
      ? 'Escolha um token e clique quadrado a quadrado (ou arraste a partir dele). Clique no fim, ou Enter, para andar.'
      : 'Toque num token para ver o alcance; arraste ou toque no destino para mover. Toque numa porta para abrir ou trancar.';
  const steps = draft ? draft.length - 1 : 0;
  const playDock = (
    <>
      <PathModeToggle mode={pathMode} onChange={setPathMode} />
      {steps > 0 ? (
        <span className="map-draft-bar">
          <span className="tiny muted">{steps} passo{steps === 1 ? '' : 's'}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => setDraft(draft!.slice(0, -1))} title="Voltar um passo (Backspace)"><Undo2 size={13} /> Passo</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setDraft(null)} title="Apagar o trajeto (Esc)"><X size={13} /> Limpar</button>
          <button className="btn btn-sm btn-primary" disabled={!draftWalk} onClick={sendDraft} title="Andar pelo trajeto (Enter)"><Check size={13} /> Mover</button>
        </span>
      ) : <span className="tiny muted map-dock-hint">{playHint}</span>}
    </>
  );

  const saveName = () => {
    const n = name.trim();
    if (n && n !== map.name) void act({ type: 'map/update', mapId: map.id, name: n });
    else setName(map.name);
  };

  return (
    <div className="col gap-lg">
      <div className="row-wrap map-head">
        <button className="btn btn-sm btn-ghost" onClick={onBack}><ArrowLeft size={14} /> Mapas</button>
        <input className="input map-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={saveName}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} aria-label="Nome do mapa" />
        <span className="tiny muted">{map.w} × {map.h} · {(map.w * MAP_CELL_M).toLocaleString('pt-BR')} × {(map.h * MAP_CELL_M).toLocaleString('pt-BR')} m</span>
        <span className="spacer" />
        <SubTabs<Mode> label="Modo do editor" value={mode} onChange={setMode} tabs={[
          { id: 'edit', label: 'Editar', icon: <Paintbrush size={14} /> },
          { id: 'play', label: 'Mesa', icon: <Users size={14} />, total: Object.keys(map.tokens).length },
        ]} />
      </div>

      <div className="map-editor">
        <div className="col" style={{ minWidth: 0 }}>
          {mode === 'edit' && (
            <div className="map-tools">
              {TOOLS.map((t) => (
                <button key={t.id} className={`btn btn-sm${tool === t.id ? ' btn-primary' : ' btn-ghost'}`} onClick={() => setTool(t.id)} title={t.hint}>
                  {t.icon}<span className="map-tool-label">{t.label}</span>
                </button>
              ))}
              <span className="spacer" />
              <button className="btn btn-sm btn-ghost btn-icon" disabled={!undo.canUndo} onClick={() => void undo.undo()} title={undo.undoLabel ? `Desfazer: ${undo.undoLabel} (Ctrl+Z)` : 'Desfazer'} aria-label="Desfazer"><Undo2 size={14} /></button>
              <button className="btn btn-sm btn-ghost btn-icon" disabled={!undo.canRedo} onClick={() => void undo.redo()} title={undo.redoLabel ? `Refazer: ${undo.redoLabel}` : 'Refazer'} aria-label="Refazer"><Redo2 size={14} /></button>
            </div>
          )}
          <MapCanvas
            grid={map} objects={objects} tokens={shownTokens} fitKey={map.id}
            reach={guide?.cells} reachTone={guide?.turn ? 'free' : 'request'}
            fog={fog}
            path={path?.cells} pathLabel={pathLabel}
            ghosts={mode === 'play' ? ghosts : undefined}
            preview={preview}
            selectedObjectId={mode === 'edit' ? selObj : null}
            selectedTokenId={mode === 'play' ? selTok : null}
            hoverCell={hover?.cell && !(mode === 'play' && path) ? hover.cell : null}
            hoverEdge={mode === 'edit' ? hover?.edge ?? null : null}
            showHidden
            touch={mode === 'edit' && tool !== 'select' && tool !== 'door' ? 'none' : 'pan'}
            onPointer={onPointer}
            route={route}
            onDropToken={mode === 'play' ? onDropToken : undefined}
            popover={popover}
            focus={camera}
            top={mode === 'play' && combat && combatHere ? <TurnBar table={table} combat={combat} /> : undefined}
            dock={mode === 'edit' ? <span className="tiny muted map-dock-hint">{TOOLS.find((t) => t.id === tool)?.hint}</span> : playDock}
          />
        </div>

        <aside className="col map-side">
          {mode === 'edit' && <SessionCard table={table} map={map} />}
          {mode === 'edit' ? (
            <>
              {tool === 'terrain' && (
                <div className="card col">
                  <div className="card-title">Terreno</div>
                  <div className="map-swatches">
                    {(Object.keys(TERRAINS) as Terrain[]).map((t) => (
                      <button key={t} className={`map-swatch${terrain === t ? ' on' : ''}`} onClick={() => setTerrain(t)} title={TERRAINS[t].hint}>
                        <span className={`map-swatch-color map-sw-${t}`} />{TERRAINS[t].label}
                      </button>
                    ))}
                  </div>
                  <label className="row small"><input type="checkbox" checked={rectMode} onChange={(e) => setRectMode(e.target.checked)} /> Retângulo (ou segure Shift)</label>
                </div>
              )}
              {tool === 'prop' && (
                <div className="card col">
                  <div className="card-title">Móvel ou obstáculo</div>
                  <div className="map-swatches">
                    {(Object.keys(PROP_KINDS) as PropKind[]).map((k) => {
                      const Icon = PROP_ICONS[k];
                      return (
                        <button key={k} className={`map-swatch${propKind === k ? ' on' : ''}`} onClick={() => setPropKind(k)}
                          title={`${PROP_KINDS[k].label}: ${PROP_EFFECTS[PROP_KINDS[k].effect].toLowerCase()}`}>
                          <Icon size={14} />{PROP_KINDS[k].label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="tiny muted">Efeito padrão: {PROP_EFFECTS[PROP_KINDS[propKind].effect].toLowerCase()}. Dá para trocar depois de pôr.</div>
                </div>
              )}
              {selected && <ObjectCard map={map} o={selected} onEdit={edit} onClose={() => setSelObj(null)} />}
              <div className="card col">
                <div className="card-title">Mapa</div>
                <button className="btn btn-sm" onClick={() => setGen(true)}><Wand2 size={14} /> Gerar mapa</button>
                <button className="btn btn-sm" onClick={() => setResizing(true)}><Scaling size={14} /> Redimensionar</button>
                <Legend />
              </div>
            </>
          ) : (
            <>
              {/* Na mesa: a fila do combate (quando há), depois os tokens. */}
              {combat && combatHere ? (
                <div className="card col ct-card">
                  {!linked && (
                    <div className="tok-hint">
                      <Swords size={14} /><span>Combate sem mapa.</span><span className="spacer" />
                      <button className="btn btn-sm" onClick={() => void combatAll()}><Link2 size={13} /> Usar este mapa</button>
                    </div>
                  )}
                  {linked && missing > 0 && (
                    <button className="btn btn-sm btn-ghost" onClick={() => void combatAll()} title="Põe no fim da fila quem está no mapa e ainda não luta">
                      <Users size={13} /> Pôr na fila {missing === 1 ? 'quem falta' : `os ${missing} que faltam`} do mapa
                    </button>
                  )}
                  <CombatTracker table={table} combat={combat} focusId={focusCb} onFocus={focusFromTracker} />
                </div>
              ) : combat ? (
                <div className="card col">
                  <div className="card-title" style={{ margin: 0 }}><Swords size={14} /> Combate em outro mapa</div>
                  <div className="tiny muted">A fila está ligada a {table.maps[combat.mapId!]?.name ?? 'outro mapa'}.</div>
                  <button className="btn btn-sm" onClick={() => void combatAll()}><Link2 size={13} /> Trazer o combate para cá</button>
                </div>
              ) : (
                <div className="card col">
                  <button className="btn btn-primary" disabled={!missing} onClick={() => void combatAll()}>
                    <Swords size={15} /> Combate com todos do mapa{missing ? ` (${missing})` : ''}
                  </button>
                  <div className="tiny muted">
                    {missing
                      ? 'Abre a fila com todos que estão no mapa, na ordem: jogadores, NPCs e ameaças. Quem for colocado depois entra no fim da fila.'
                      : 'Coloque fichas e ameaças no mapa para abrir um combate com elas.'}
                  </div>
                </div>
              )}
              <TokensPanel table={table} map={map} selTok={selTok} setSelTok={setSelTok} armed={armed} setArmed={setArmed}
                guide={guide ? { squares: guide.budget.squares, remaining: guide.budget.remaining, turn: guide.turn } : null} />
              <SessionCard table={table} map={map} />
            </>
          )}
        </aside>
      </div>

      {gen && (
        <MapGenerateModal w={map.w} h={map.h} onClose={() => setGen(false)}
          onApply={async (params, seed) => (await edit('Gerar mapa', [{ type: 'map/generate', mapId: map.id, params, seed }], 'Mapa gerado.')) !== null} />
      )}
      {resizing && <ResizeModal map={map} onClose={() => setResizing(false)}
        onApply={async (a) => (await edit('Redimensionar', [a], 'Mapa redimensionado.')) !== null} />}
    </div>
  );
}

function propRect(a: { x: number; y: number }, b: { x: number; y: number }) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.min(10, Math.abs(a.x - b.x) + 1), h: Math.min(10, Math.abs(a.y - b.y) + 1) };
}

/** Modo de locomoção, mostrar aos jogadores e vínculo com o combate. */
function SessionCard({ table, map }: { table: TableState; map: BattleMap }) {
  const { act } = useAct();
  const active = table.activeMapId === map.id;
  const combat = table.combat;
  const linked = combat?.mapId === map.id;
  return (
    <div className={`card col${active ? ' card-gold' : ''}`}>
      <div className="card-title">Mesa</div>
      <button className={`btn btn-sm${active ? '' : ' btn-primary'}`}
        onClick={() => act({ type: 'map/activate', mapId: active ? null : map.id }, active ? 'Mapa escondido dos jogadores.' : 'Mapa aberto aos jogadores.')}>
        {active ? <><EyeOff size={14} /> Esconder dos jogadores</> : <><Eye size={14} /> Mostrar aos jogadores</>}
      </button>
      {active && <div className="tiny muted">Os jogadores veem as mudanças na hora.</div>}
      <div className="field">
        <span className="label">Locomoção</span>
        <div className="map-modes" role="radiogroup" aria-label="Modo de locomoção">
          {(Object.keys(MOVE_MODES) as MoveMode[]).map((m) => (
            <button key={m} role="radio" aria-checked={map.mode === m} className={`map-mode${map.mode === m ? ' on' : ''}`}
              onClick={() => act({ type: 'map/update', mapId: map.id, mode: m })} title={MOVE_MODES[m].hint}>
              {MOVE_MODES[m].label}
            </button>
          ))}
        </div>
        <span className="tiny muted">{MOVE_MODES[map.mode].hint}</span>
      </div>
      <div className="field">
        <span className="label">Visão</span>
        <div className="map-modes map-modes-2" role="radiogroup" aria-label="Visão dos jogadores">
          <button role="radio" aria-checked={!map.dark} className={`map-mode${!map.dark ? ' on' : ''}`}
            onClick={() => act({ type: 'map/update', mapId: map.id, dark: false })} title="Os jogadores veem o mapa inteiro">
            <Sun size={12} /> Tudo à vista
          </button>
          <button role="radio" aria-checked={!!map.dark} className={`map-mode${map.dark ? ' on' : ''}`}
            onClick={() => act({ type: 'map/update', mapId: map.id, dark: true })} title="Cada jogador só vê o cômodo onde o personagem dele está">
            <Moon size={12} /> Escuro
          </button>
        </div>
        <span className="tiny muted">
          {map.dark
            ? 'Cada jogador só vê o cômodo do próprio personagem; porta fechada tapa a vista, aberta deixa ver o outro lado. Na Mesa, a sombra marca o que nenhum jogador vê.'
            : 'Os jogadores veem o mapa inteiro (menos o que estiver oculto).'}
        </span>
      </div>
      {combat && linked && (
        <div className="row-wrap">
          <span className="badge badge-err"><Swords size={11} /> Combate neste mapa{combat.round ? ` · rodada ${combat.round}` : ''}</span>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={() => act({ type: 'map/link', mapId: null })} title="A fila continua, sem mapa"><Link2Off size={13} /> Desvincular</button>
        </div>
      )}
      {map.mode === 'turno' && !linked && <div className="tiny" style={{ color: 'var(--warning)' }}>Por turno sem combate neste mapa: todo movimento de jogador vira pedido.</div>}
    </div>
  );
}

function ObjectCard({ map, o, onEdit, onClose }: {
  map: BattleMap; o: MapObject;
  onEdit: (label: string, actions: GameAction[]) => Promise<string | null>;
  onClose: () => void;
}) {
  const save = (patch: Partial<MapObject>) => onEdit('Editar objeto', [{ type: 'map/objectUpsert', mapId: map.id, object: { ...o, ...patch } as MapObject }]);
  const remove = () => onEdit('Apagar objeto', [{ type: 'map/objectRemove', mapId: map.id, objectIds: [o.id] }]);
  const [label, setLabel] = useState(o.kind === 'prop' ? o.label : '');
  useEffect(() => { if (o.kind === 'prop') setLabel(o.label); }, [o]);

  return (
    <div className="card col">
      <div className="row">
        <div className="card-title" style={{ margin: 0 }}>{o.kind === 'door' ? 'Porta' : PROP_KINDS[o.prop].label}</div>
        <span className="spacer" />
        <button className="btn btn-sm btn-ghost btn-icon" onClick={onClose} aria-label="Fechar"><X size={14} /></button>
      </div>
      {o.kind === 'door' ? (
        <>
          <div className="seg">
            {(Object.keys(DOOR_STATES) as DoorState[]).map((st) => (
              <button key={st} className={o.state === st ? 'on-inherit' : ''} onClick={() => save({ state: st })}>{DOOR_STATES[st]}</button>
            ))}
          </div>
          <div className="tiny muted">Aberta: passagem livre. Fechada: atravessar custa como terreno difícil. Trancada: ninguém passa. Linha {o.edge.o === 'h' ? 'horizontal' : 'vertical'} em {cellLabel(o.edge.x, o.edge.y)}.</div>
          <label className="row small"><input type="checkbox" checked={o.hidden} onChange={(e) => save({ hidden: e.target.checked })} /> Porta secreta (para os jogadores é parede)</label>
        </>
      ) : (
        <>
          <div className="field">
            <label className="label">Tipo</label>
            <select className="input" value={o.prop} onChange={(e) => {
              const prop = e.target.value as PropKind;
              void save({ prop, effect: PROP_KINDS[prop].effect });
            }}>
              {(Object.keys(PROP_KINDS) as PropKind[]).map((k) => <option key={k} value={k}>{PROP_KINDS[k].label}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Rótulo</label>
            <input className="input" value={label} maxLength={40} placeholder={PROP_KINDS[o.prop].label}
              onChange={(e) => setLabel(e.target.value)} onBlur={() => { if (label !== o.label) void save({ label }); }} />
          </div>
          <div className="field">
            <span className="label">Efeito</span>
            <div className="seg">
              {(Object.keys(PROP_EFFECTS) as PropEffect[]).map((ef) => (
                <button key={ef} className={o.effect === ef ? 'on-inherit' : ''} onClick={() => save({ effect: ef })}>{PROP_EFFECTS[ef]}</button>
              ))}
            </div>
          </div>
          <div className="row-wrap">
            <label className="field small secondary">Largura
              <input className="input mono" type="number" min={1} max={10} style={{ width: 70 }} value={o.w}
                onChange={(e) => { const v = Math.max(1, Math.min(10, +e.target.value || 1)); if (o.x + v <= map.w) void save({ w: v }); }} />
            </label>
            <label className="field small secondary">Altura
              <input className="input mono" type="number" min={1} max={10} style={{ width: 70 }} value={o.h}
                onChange={(e) => { const v = Math.max(1, Math.min(10, +e.target.value || 1)); if (o.y + v <= map.h) void save({ h: v }); }} />
            </label>
          </div>
          <label className="row small"><input type="checkbox" checked={o.hidden} onChange={(e) => save({ hidden: e.target.checked })} /> Oculto dos jogadores</label>
        </>
      )}
      <button className="btn btn-sm btn-danger" onClick={() => void remove()}><Trash2 size={13} /> Apagar</button>
    </div>
  );
}

function Legend() {
  return (
    <div className="map-legend tiny muted">
      {(Object.keys(TERRAINS) as Terrain[]).map((t) => (
        <span key={t} className="row" style={{ gap: 6 }}><span className={`map-swatch-color map-sw-${t}`} />{TERRAINS[t].label}: {TERRAINS[t].hint}</span>
      ))}
      <span>Diagonal custa 1, 2, 1, 2... e não corta canto de parede.</span>
      <span>Porta aberta é livre; fechada custa como terreno difícil (só em linha reta); trancada bloqueia.</span>
    </div>
  );
}

const DOOR_DONE: Record<DoorState, string> = { open: 'Porta aberta.', closed: 'Porta fechada.', locked: 'Porta trancada.' };

/** Balão da porta no modo Mesa: o estado e as ações que fazem sentido a partir dele. */
function DoorActions({ door, onState, onClose }: { door: MapDoor; onState: (s: DoorState) => unknown; onClose: () => void }) {
  const actions: Array<{ to: DoorState; label: string; icon: JSX.Element; primary?: boolean }> = door.state === 'open'
    ? [{ to: 'closed', label: 'Fechar', icon: <DoorClosed size={13} />, primary: true }, { to: 'locked', label: 'Trancar', icon: <Lock size={13} /> }]
    : door.state === 'closed'
      ? [{ to: 'open', label: 'Abrir', icon: <DoorOpen size={13} />, primary: true }, { to: 'locked', label: 'Trancar', icon: <Lock size={13} /> }]
      : [{ to: 'closed', label: 'Destrancar', icon: <Unlock size={13} />, primary: true }, { to: 'open', label: 'Abrir', icon: <DoorOpen size={13} /> }];
  const effect = door.state === 'open' ? 'passagem livre' : door.state === 'closed' ? 'atravessar custa o dobro' : 'ninguém passa';
  return (
    <>
      <div className="map-popover-head">
        {door.state === 'locked' ? <Lock size={14} /> : door.state === 'open' ? <DoorOpen size={14} /> : <DoorClosed size={14} />}
        <span className="grow"><strong>Porta {DOOR_STATES[door.state].toLowerCase()}</strong>{door.hidden ? ' · secreta' : ''}<br />{effect}</span>
        <button className="btn btn-sm btn-ghost btn-icon" onClick={onClose} aria-label="Fechar"><X size={13} /></button>
      </div>
      <div className="map-popover-actions">
        {actions.map((a) => (
          <button key={a.to} className={`btn btn-sm${a.primary ? ' btn-primary' : ''}`} onClick={() => void onState(a.to)}>{a.icon} {a.label}</button>
        ))}
      </div>
    </>
  );
}

function ResizeModal({ map, onApply, onClose }: {
  map: BattleMap; onApply: (a: GameAction) => Promise<boolean>; onClose: () => void;
}) {
  const [w, setW] = useState(String(map.w));
  const [h, setH] = useState(String(map.h));
  const [anchor, setAnchor] = useState<'tl' | 'center'>('tl');
  // Mapa de piso até a borda cresce com piso; masmorra (borda vazia) cresce com vazio.
  const [fill, setFill] = useState<Terrain>(terrainAt(map, 0, 0) !== 'void' ? 'floor' : 'void');
  const num = (v: string) => Math.max(MAP_LIMITS.min, Math.min(MAP_LIMITS.max, parseInt(v, 10) || 0));
  const nw = num(w);
  const nh = num(h);
  const dx = anchor === 'center' ? Math.floor((nw - map.w) / 2) : 0;
  const dy = anchor === 'center' ? Math.floor((nh - map.h) / 2) : 0;
  const shrinks = nw < map.w || nh < map.h;
  const apply = async () => { if (await onApply({ type: 'map/resize', mapId: map.id, w: nw, h: nh, dx, dy, fill })) onClose(); };
  return (
    <Modal open title="Redimensionar mapa" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={apply}>Aplicar</button></>}>
      <form className="col gap-lg" onSubmit={(e) => { e.preventDefault(); void apply(); }}>
        <div className="row-wrap">
          <label className="field small secondary">Largura
            <input className="input mono" style={{ width: 80 }} inputMode="numeric" value={w} onChange={(e) => setW(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="field small secondary">Altura
            <input className="input mono" style={{ width: 80 }} inputMode="numeric" value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, ''))} />
          </label>
          <span className="tiny muted" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}>de {map.w} × {map.h} ({MAP_LIMITS.min} a {MAP_LIMITS.max})</span>
        </div>
        <div className="field">
          <span className="label">O desenho atual fica</span>
          <div className="row-wrap">
            <button type="button" className={`chip${anchor === 'tl' ? ' on' : ''}`} onClick={() => setAnchor('tl')}>No canto de cima à esquerda</button>
            <button type="button" className={`chip${anchor === 'center' ? ' on' : ''}`} onClick={() => setAnchor('center')}>No centro</button>
          </div>
        </div>
        <div className="field">
          <span className="label">Área nova</span>
          <div className="row-wrap">
            <button type="button" className={`chip${fill === 'floor' ? ' on' : ''}`} onClick={() => setFill('floor')}>Piso</button>
            <button type="button" className={`chip${fill === 'void' ? ' on' : ''}`} onClick={() => setFill('void')}>Vazio</button>
          </div>
        </div>
        {shrinks && <p className="small" style={{ color: 'var(--warning)' }}>O que ficar fora do novo tamanho some (dá para desfazer).</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
