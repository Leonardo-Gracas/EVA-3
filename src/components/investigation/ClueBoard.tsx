// Mural de um caso: quadro de cortiça com cartões de evidência e fato ligados por fios.
// Mestre: arrasta da paleta, digita no próprio cartão, puxa o alfinete para ligar, seleciona
// vários (Shift), desfaz (Ctrl+Z) e usa atalhos. Jogador: só consulta.
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react';
import { X } from 'lucide-react';
import {
  BOARD_SIZE, CLUE_KINDS, CLUE_SIZE, type ClueCard, type ClueKind, type ClueLink, type GameAction, type InvestigationCase,
} from '../../model/types';
import { useAct } from '../act';
import { dismissTag, notify } from '../common/toast';
import BoardDock from './BoardDock';
import ClueCardView, { type CardDraft } from './ClueCardView';
import SelectionToolbar from './SelectionToolbar';
import ShortcutsHelp from './ShortcutsHelp';
import { CLUE_ICONS, OPPOSITE, clampX, clampY, intersects, pinOf, rectFrom, stringPath, type Point, type Rect } from './clues';
import { useBoardShortcuts } from './useBoardShortcuts';
import { useBoardView } from './useBoardView';
import { useFullscreen } from './useFullscreen';
import { useUndo, type UndoEntry } from './useUndo';

/** Movimento mínimo (px de tela) para um toque virar arraste. */
const DRAG_START = 4;
/** Setas: o movimento vai ao mestre (e vira um passo de desfazer) depois desta pausa. */
const NUDGE_COMMIT_MS = 400;
const DUP_OFFSET = 30;
/** Puxar o alfinete menos que isso (px do quadro) e soltar no vazio não cria nada. */
const PIN_MIN_PULL = 40;
const DRAFT_ID = 'rascunho';
const UNDO_TAG = 'clue-undo';

/** Edição no próprio cartão. Sem `id`: rascunho de um cartão novo, que só existe aqui até salvar. */
interface Editing extends CardDraft { id?: string; x: number; y: number; linkFrom?: string }

type Gesture =
  | { kind: 'card'; pointerId: number; start: Point; grab: Point; ids: string[]; origin: Record<string, Point>; moved: boolean; toggle?: string; narrow?: string }
  | { kind: 'pin'; pointerId: number; from: string; at: Point; target: string | null; moved: boolean }
  | { kind: 'marquee'; pointerId: number; start: Point; at: Point; base: string[] }
  | { kind: 'pan'; pointerId: number; sx: number; sy: number; left: number; top: number; moved: boolean }
  | { kind: 'ghost'; pointerId: number; clue: ClueKind; cx: number; cy: number; sx: number; sy: number; moved: boolean };

/** Publicação do caso (só mestre): `first` = ainda é rascunho; `pending` = alterações por enviar. */
export interface PublishControl { pending: number; first: boolean; run: () => void | Promise<void> }

export default function ClueBoard({ kase, editable = false, publish }: { kase: InvestigationCase; editable?: boolean; publish?: PublishControl }) {
  const { act } = useAct();
  const caseId = kase.id;
  const wrapRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const kaseRef = useRef(kase);
  kaseRef.current = kase;

  const [sel, setSelState] = useState<string[]>([]);
  const selRef = useRef(sel);
  const setSel = useCallback((v: string[]) => { selRef.current = v; setSelState(v); }, []);

  const [editing, setEditingState] = useState<Editing | null>(null);
  const editingRef = useRef(editing);
  const setEditing = useCallback((v: Editing | null) => { editingRef.current = v; setEditingState(v); }, []);

  /** Posições otimistas durante arrastes e setas, até o mestre confirmar. */
  const [override, setOverrideState] = useState<Record<string, Point>>({});
  const overrideRef = useRef(override);
  const setOverride = useCallback((v: Record<string, Point>) => { overrideRef.current = v; setOverrideState(v); }, []);

  const gRef = useRef<Gesture | null>(null);
  const [gesture, setGestureState] = useState<Gesture | null>(null);
  const setGesture = useCallback((v: Gesture | null) => { gRef.current = v; setGestureState(v); }, []);

  const [hoverLink, setHoverLink] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const lastClient = useRef<Point | null>(null);
  const panMoved = useRef(false);
  const focusNext = useRef<string | null>(null);
  const nudgeRef = useRef<{ origin: Record<string, Point>; timer: number } | null>(null);

  const cards = useMemo(() => Object.values(kase.cards).sort((a, b) => a.createdAt - b.createdAt), [kase.cards]);
  const selected = sel.filter((id) => kase.cards[id]);
  const posOf = (id: string): Point => overrideRef.current[id] ?? kaseRef.current.cards[id] ?? { x: 0, y: 0 };
  const heightOf = (id: string) =>
    (boardRef.current?.querySelector<HTMLElement>(`[data-clue-id="${id}"]`)?.offsetHeight) || CLUE_SIZE.h;
  const boxOf = (ids: string[]): Rect | null => {
    if (!ids.length) return null;
    const rs = ids.map((id) => { const p = posOf(id); return { x: p.x, y: p.y, w: CLUE_SIZE.w, h: heightOf(id) }; });
    const x = Math.min(...rs.map((r) => r.x));
    const y = Math.min(...rs.map((r) => r.y));
    return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
  };

  // Pinça com dois dedos: o arraste que o primeiro dedo começou é cancelado.
  const view = useBoardView(wrapRef, caseId, () => boxOf(Object.keys(kaseRef.current.cards)), () => {
    if (gRef.current) { const p = lastClient.current; endGesture(p?.x ?? 0, p?.y ?? 0, true); }
  });
  const fullscreen = useFullscreen();
  const run = useCallback((a: GameAction) => act(a), [act]);
  const history = useUndo(caseId, run);
  // Desfazer ou refazer por qualquer caminho tira da tela o aviso "Desfazer", que deixaria de valer.
  const undo = useMemo(() => ({
    ...history,
    undo: () => { dismissTag(UNDO_TAG); return history.undo(); },
    redo: () => { dismissTag(UNDO_TAG); return history.redo(); },
  }), [history]);

  // Outro caso: começa limpo.
  useEffect(() => {
    setSel([]);
    setEditing(null);
    setOverride({});
    setGesture(null);
  }, [caseId, setSel, setEditing, setOverride, setGesture]);

  // Devolve o foco ao cartão depois de editar, para seguir pelo teclado.
  useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    const el = boardRef.current?.querySelector<HTMLElement>(`[data-clue-id="${id}"]`);
    if (el) { el.focus({ preventScroll: true }); focusNext.current = null; }
  });

  const undoToast = (text: string, entry: UndoEntry) => notify({
    kind: 'info', text, tag: UNDO_TAG, duration: 6000,
    actions: [{ label: 'Desfazer', run: () => history.undoIf(entry) }],
  });

  // ── Edição no cartão ──────────────────────────────────────

  const commitEdit = async () => {
    const e = editingRef.current;
    if (!e) return;
    setEditing(null);
    const title = e.title.trim();
    const text = e.text.trim();
    if (!title) return;
    const k = kaseRef.current;
    if (e.id) {
      const old = k.cards[e.id];
      if (!old) return;
      focusNext.current = e.id;
      if (old.title === title && old.text === text && old.kind === e.kind && old.hidden === e.hidden) return;
      const base = { type: 'clue/upsert' as const, caseId, cardId: e.id };
      const r = await act({ ...base, kind: e.kind, title, text, hidden: e.hidden });
      if (r.ok) {
        undo.push({
          label: `Editar ${title}`,
          undo: [{ ...base, kind: old.kind, title: old.title, text: old.text, hidden: old.hidden }],
          redo: [{ ...base, kind: e.kind, title, text, hidden: e.hidden }],
        });
      }
      return;
    }
    const x = clampX(e.x);
    const y = clampY(e.y);
    const r = await act({ type: 'clue/upsert', caseId, kind: e.kind, title, text, hidden: e.hidden, x, y });
    if (!r.ok || !r.id) return;
    const now = Date.now();
    const card: ClueCard = { id: r.id, kind: e.kind, title, text, hidden: e.hidden, x, y, createdAt: now, updatedAt: now };
    const links: ClueLink[] = [];
    if (e.linkFrom && kaseRef.current.cards[e.linkFrom]) {
      const l = await act({ type: 'clue/link', caseId, from: e.linkFrom, to: r.id });
      if (l.ok && l.id) links.push({ id: l.id, from: e.linkFrom, to: r.id });
    }
    undo.push({
      label: `Criar ${title}`,
      undo: [{ type: 'clue/delete', caseId, cardIds: [r.id] }],
      redo: [{ type: 'clue/restore', caseId, cards: [card], links }],
    });
    setSel([r.id]);
    focusNext.current = r.id;
  };

  const cancelEdit = () => {
    const e = editingRef.current;
    setEditing(null);
    if (e?.id) focusNext.current = e.id;
  };

  const beginEdit = (id: string) => {
    const c = kaseRef.current.cards[id];
    if (!c) return;
    setSel([id]);
    setEditing({ id, kind: c.kind, title: c.title, text: c.text, hidden: c.hidden, x: c.x, y: c.y });
  };

  /** Rascunho com o centro do topo em `at` (onde o ponteiro soltou). */
  const startDraft = async (kind: ClueKind, at: Point, linkFrom?: string) => {
    if (editingRef.current) await commitEdit();
    setSel([]);
    setEditing({ kind, title: '', text: '', hidden: false, x: clampX(at.x - CLUE_SIZE.w / 2), y: clampY(at.y - 16), linkFrom });
  };

  // ── Operações com desfazer ────────────────────────────────

  const commitMove = async (origin: Record<string, Point>, next: Record<string, Point>) => {
    const ids = Object.keys(next);
    const moves = ids
      .filter((id) => kaseRef.current.cards[id] && (next[id].x !== origin[id]?.x || next[id].y !== origin[id]?.y))
      .map((id) => ({ cardId: id, x: next[id].x, y: next[id].y }));
    if (moves.length) {
      const r = await act({ type: 'clue/move', caseId, moves });
      if (r.ok) {
        undo.push({
          label: moves.length > 1 ? `Mover ${moves.length} cartões` : 'Mover cartão',
          undo: [{ type: 'clue/move', caseId, moves: moves.map((m) => ({ cardId: m.cardId, ...origin[m.cardId] })) }],
          redo: [{ type: 'clue/move', caseId, moves }],
        });
      }
    }
    const rest = { ...overrideRef.current };
    for (const id of ids) delete rest[id];
    setOverride(rest);
  };

  const removeCards = async (ids: string[]) => {
    const k = kaseRef.current;
    const cs = ids.map((id) => k.cards[id]).filter(Boolean);
    if (!cs.length) return;
    const gone = new Set(cs.map((c) => c.id));
    const links = k.links.filter((l) => gone.has(l.from) || gone.has(l.to));
    const r = await act({ type: 'clue/delete', caseId, cardIds: [...gone] });
    if (!r.ok) return;
    const entry: UndoEntry = {
      label: cs.length > 1 ? `Excluir ${cs.length} cartões` : `Excluir ${cs[0].title}`,
      undo: [{ type: 'clue/restore', caseId, cards: cs, links }],
      redo: [{ type: 'clue/delete', caseId, cardIds: [...gone] }],
    };
    undo.push(entry);
    setSel([]);
    undoToast(cs.length > 1 ? `${cs.length} cartões excluídos.` : `“${cs[0].title}” excluído.`, entry);
  };

  const toggleHidden = async (ids: string[]) => {
    const cs = ids.map((id) => kaseRef.current.cards[id]).filter(Boolean);
    const hidden = cs.some((c) => !c.hidden);
    const changed = cs.filter((c) => c.hidden !== hidden).map((c) => c.id);
    if (!changed.length) return;
    const n = changed.length;
    const r = await act({ type: 'clue/hidden', caseId, cardIds: changed, hidden },
      hidden ? (n > 1 ? `${n} cartões ocultos dos jogadores.` : 'Oculto dos jogadores.') : (n > 1 ? `${n} cartões revelados.` : 'Revelado aos jogadores.'));
    if (r.ok) {
      undo.push({
        label: hidden ? 'Ocultar' : 'Revelar',
        undo: [{ type: 'clue/hidden', caseId, cardIds: changed, hidden: !hidden }],
        redo: [{ type: 'clue/hidden', caseId, cardIds: changed, hidden }],
      });
    }
  };

  const duplicate = async (ids: string[]) => {
    const copies: ClueCard[] = [];
    for (const c of ids.map((id) => kaseRef.current.cards[id]).filter(Boolean)) {
      const x = clampX(c.x + DUP_OFFSET);
      const y = clampY(c.y + DUP_OFFSET);
      const r = await act({ type: 'clue/upsert', caseId, kind: c.kind, title: c.title, text: c.text, hidden: c.hidden, x, y });
      if (!r.ok || !r.id) break;
      copies.push({ ...c, id: r.id, x, y });
    }
    if (!copies.length) return;
    undo.push({
      label: copies.length > 1 ? `Duplicar ${copies.length} cartões` : 'Duplicar cartão',
      undo: [{ type: 'clue/delete', caseId, cardIds: copies.map((c) => c.id) }],
      redo: [{ type: 'clue/restore', caseId, cards: copies, links: [] }],
    });
    setSel(copies.map((c) => c.id));
  };

  const isLinked = (a: string, b: string) =>
    kaseRef.current.links.some((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a));

  /** Liga `from` a cada um de `tos` (pula os já ligados) num só passo de desfazer. */
  const linkMany = async (from: string, tos: string[]) => {
    const made: ClueLink[] = [];
    for (const to of tos) {
      if (to === from || isLinked(from, to)) continue;
      const r = await act({ type: 'clue/link', caseId, from, to });
      if (r.ok && r.id) made.push({ id: r.id, from, to });
    }
    if (!made.length) {
      if (tos.length) notify({ kind: 'info', text: 'Esses cartões já estão ligados.' });
      return;
    }
    undo.push({
      label: made.length > 1 ? `Ligar ${made.length} cartões` : 'Ligar cartões',
      undo: made.map((l) => ({ type: 'clue/unlink' as const, caseId, linkId: l.id })),
      redo: [{ type: 'clue/restore', caseId, cards: [], links: made }],
    });
  };

  const unlink = async (l: ClueLink) => {
    setHoverLink(null);
    const r = await act({ type: 'clue/unlink', caseId, linkId: l.id });
    if (!r.ok) return;
    const entry: UndoEntry = {
      label: 'Remover ligação',
      undo: [{ type: 'clue/restore', caseId, cards: [], links: [l] }],
      redo: [{ type: 'clue/unlink', caseId, linkId: l.id }],
    };
    undo.push(entry);
    undoToast('Ligação removida.', entry);
  };

  /** Setas: move na hora e manda ao mestre numa vez só, depois da pausa. */
  const nudge = (dx: number, dy: number) => {
    const ids = selRef.current.filter((id) => kaseRef.current.cards[id]);
    if (!ids.length) return;
    const n = nudgeRef.current ?? { origin: Object.fromEntries(ids.map((id) => [id, posOf(id)])), timer: 0 };
    window.clearTimeout(n.timer);
    const next = { ...overrideRef.current };
    for (const id of ids) {
      n.origin[id] ??= posOf(id);
      const p = posOf(id);
      next[id] = { x: clampX(p.x + dx), y: clampY(p.y + dy) };
    }
    setOverride(next);
    n.timer = window.setTimeout(() => {
      nudgeRef.current = null;
      const moved = Object.fromEntries(Object.keys(n.origin).map((id) => [id, overrideRef.current[id] ?? n.origin[id]]));
      void commitMove(n.origin, moved);
    }, NUDGE_COMMIT_MS);
    nudgeRef.current = n;
  };

  const centerOn = (id: string) => {
    setSel([id]);
    const w = wrapRef.current;
    const p = kaseRef.current.cards[id];
    if (!w || !p) return;
    w.scrollTo({
      left: (p.x + CLUE_SIZE.w / 2) * view.zoom - w.clientWidth / 2,
      top: (p.y + heightOf(id) / 2) * view.zoom - w.clientHeight / 2,
      behavior: 'smooth',
    });
  };

  // ── Gestos ────────────────────────────────────────────────

  const cardUnder = (cx: number, cy: number): string | null => {
    const el = document.elementFromPoint(cx, cy)?.closest<HTMLElement>('[data-clue-id]');
    const id = el?.dataset.clueId;
    return id && id !== DRAFT_ID ? id : null;
  };

  /** Aplica a posição do ponteiro ao gesto em curso (também chamado pela rolagem automática). */
  const applyPointer = (cx: number, cy: number) => {
    const g = gRef.current;
    if (!g) return;
    view.trackPointer(cx, cy);
    if (g.kind === 'card') {
      if (!g.moved && Math.hypot(cx - g.start.x, cy - g.start.y) < DRAG_START) return;
      if (!g.moved) view.startAutoScroll(() => lastClient.current && applyPointer(lastClient.current.x, lastClient.current.y));
      const b = view.clientToBoard(cx, cy);
      const next = { ...overrideRef.current };
      for (const id of g.ids) next[id] = { x: clampX(g.origin[id].x + b.x - g.grab.x), y: clampY(g.origin[id].y + b.y - g.grab.y) };
      setOverride(next);
      if (!g.moved) setGesture({ ...g, moved: true });
    } else if (g.kind === 'pin') {
      if (!g.moved) view.startAutoScroll(() => lastClient.current && applyPointer(lastClient.current.x, lastClient.current.y));
      const target = cardUnder(cx, cy);
      setGesture({ ...g, at: view.clientToBoard(cx, cy), target: target === g.from ? null : target, moved: true });
    } else if (g.kind === 'marquee') {
      const at = view.clientToBoard(cx, cy);
      const r = rectFrom(g.start, at);
      const hits = Object.keys(kaseRef.current.cards).filter((id) => {
        const p = posOf(id);
        return intersects(r, { x: p.x, y: p.y, w: CLUE_SIZE.w, h: heightOf(id) });
      });
      setSel([...new Set([...g.base, ...hits])]);
      setGesture({ ...g, at });
    } else if (g.kind === 'pan') {
      const w = wrapRef.current;
      if (!w) return;
      w.scrollLeft = g.left - (cx - g.sx);
      w.scrollTop = g.top - (cy - g.sy);
      if (!g.moved && Math.hypot(cx - g.sx, cy - g.sy) > DRAG_START) gRef.current = { ...g, moved: true };
    } else if (g.kind === 'ghost') {
      const moved = g.moved || Math.hypot(cx - g.sx, cy - g.sy) > DRAG_START;
      setGesture({ ...g, cx, cy, moved });
    }
  };

  const endGesture = (cx: number, cy: number, cancelled = false) => {
    const g = gRef.current;
    if (!g) return;
    view.stopAutoScroll();
    setGesture(null);
    if (g.kind === 'card') {
      if (cancelled) {
        const rest = { ...overrideRef.current };
        for (const id of g.ids) delete rest[id];
        setOverride(rest);
      } else if (g.moved) {
        void commitMove(g.origin, Object.fromEntries(g.ids.map((id) => [id, overrideRef.current[id] ?? g.origin[id]])));
      } else if (g.toggle) {
        setSel(selRef.current.filter((id) => id !== g.toggle));
      } else if (g.narrow && selRef.current.length > 1) {
        setSel([g.narrow]);
      }
    } else if (g.kind === 'pin' && !cancelled) {
      if (g.target) void linkMany(g.from, [g.target]);
      else if (g.moved && view.insideView(cx, cy)) {
        const from = posOf(g.from);
        const pulled = Math.hypot(g.at.x - from.x - CLUE_SIZE.w / 2, g.at.y - from.y);
        const fromCard = kaseRef.current.cards[g.from];
        if (fromCard && pulled > PIN_MIN_PULL) void startDraft(OPPOSITE[fromCard.kind], g.at, g.from);
      }
    } else if (g.kind === 'pan') {
      panMoved.current = g.moved;
    } else if (g.kind === 'ghost' && !cancelled) {
      if (!g.moved) void startDraft(g.clue, { x: view.viewCenter().x, y: view.viewCenter().y - 40 });
      else if (view.insideView(cx, cy)) void startDraft(g.clue, view.clientToBoard(cx, cy));
    }
  };

  const onStageMove = (e: RPointerEvent) => {
    lastClient.current = { x: e.clientX, y: e.clientY };
    if (gRef.current?.pointerId === e.pointerId) applyPointer(e.clientX, e.clientY);
  };
  const onStageUp = (e: RPointerEvent) => { if (gRef.current?.pointerId === e.pointerId) endGesture(e.clientX, e.clientY); };
  const onStageCancel = (e: RPointerEvent) => { if (gRef.current?.pointerId === e.pointerId) endGesture(e.clientX, e.clientY, true); };

  const onCardDown = (c: ClueCard, e: RPointerEvent<HTMLDivElement>) => {
    if (!editable || e.button !== 0) return;
    const cur = selRef.current;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    let ids: string[];
    let toggle: string | undefined;
    let narrow: string | undefined;
    if (additive && cur.includes(c.id)) { ids = cur; toggle = c.id; }
    else if (additive) { ids = [...cur, c.id]; setSel(ids); }
    else if (cur.includes(c.id)) { ids = cur; narrow = c.id; }
    else { ids = [c.id]; setSel(ids); }
    ids = ids.filter((id) => kaseRef.current.cards[id]);
    e.currentTarget.setPointerCapture(e.pointerId);
    setGesture({
      kind: 'card', pointerId: e.pointerId, start: { x: e.clientX, y: e.clientY }, grab: view.clientToBoard(e.clientX, e.clientY),
      ids, origin: Object.fromEntries(ids.map((id) => [id, posOf(id)])), moved: false, toggle, narrow,
    });
  };

  const onPinDown = (c: ClueCard, e: RPointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setGesture({ kind: 'pin', pointerId: e.pointerId, from: c.id, at: view.clientToBoard(e.clientX, e.clientY), target: null, moved: false });
  };

  const onBoardDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.button !== 0 || e.pointerType !== 'mouse') return;
    const w = wrapRef.current;
    if (!w) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (editable && e.shiftKey) {
      const at = view.clientToBoard(e.clientX, e.clientY);
      setGesture({ kind: 'marquee', pointerId: e.pointerId, start: at, at, base: selRef.current });
    } else {
      setGesture({ kind: 'pan', pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, left: w.scrollLeft, top: w.scrollTop, moved: false });
    }
  };

  /** Toque ou clique no fundo (sem arrastar): limpa a seleção. */
  const onBoardClick = (e: RMouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (panMoved.current) { panMoved.current = false; return; }
    setSel([]);
  };

  const onChipDown = (clue: ClueKind, e: RPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setGesture({ kind: 'ghost', pointerId: e.pointerId, clue, cx: e.clientX, cy: e.clientY, sx: e.clientX, sy: e.clientY, moved: false });
  };

  // ── Teclado ───────────────────────────────────────────────

  useBoardShortcuts((e) => {
    const k = e.key;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod && !e.altKey) {
      if (k === '+' || k === '=') { view.zoomBy(1.2); return true; }
      if (k === '-' || k === '_') { view.zoomBy(1 / 1.2); return true; }
      if (k === '0') { view.zoomTo(1); return true; }
      if (k === '1') { view.fit(); return true; }
      if (k === 'Escape') {
        if (gRef.current) { const p = lastClient.current; endGesture(p?.x ?? 0, p?.y ?? 0, true); return true; }
        if (selRef.current.length) { setSel([]); return true; }
        if (fullscreen.full) { fullscreen.exit(); return true; }
        return false;
      }
    }
    if (!editable) return false;
    if (k === '?') { setHelp(true); return true; }
    const sel = selRef.current.filter((id) => kaseRef.current.cards[id]);
    if (mod && !e.altKey) {
      const key = k.toLowerCase();
      if (key === 'z' && !e.shiftKey) { void undo.undo(); return true; }
      if ((key === 'z' && e.shiftKey) || key === 'y') { void undo.redo(); return true; }
      if (key === 'a') { setSel(Object.keys(kaseRef.current.cards)); return true; }
      if (key === 'd' && sel.length) { void duplicate(sel); return true; }
      if (key === 's') {
        if (publish && (publish.first || publish.pending)) void publish.run();
        return true;
      }
      return false;
    }
    if (e.altKey) return false;
    const key = k.toLowerCase();
    if ((key === 'e' || key === 'f') && !e.repeat) {
      const p = lastClient.current && view.insideView(lastClient.current.x, lastClient.current.y)
        ? view.clientToBoard(lastClient.current.x, lastClient.current.y)
        : { x: view.viewCenter().x, y: view.viewCenter().y - 40 };
      void startDraft(key === 'e' ? 'evidencia' : 'fato', p);
      return true;
    }
    if (!sel.length) return false;
    if ((k === 'Enter' || k === 'F2') && sel.length === 1) { beginEdit(sel[0]); return true; }
    if ((k === 'Delete' || k === 'Backspace') && !e.repeat) { void removeCards(sel); return true; }
    if (key === 'h' && !e.repeat) { void toggleHidden(sel); return true; }
    if (key === 'l' && !e.repeat && sel.length > 1) { void linkMany(sel[0], sel.slice(1)); return true; }
    const step = e.shiftKey ? 50 : 10;
    const arrows: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    if (arrows[k]) { nudge(arrows[k].x, arrows[k].y); return true; }
    return false;
  });

  // ── Desenho ───────────────────────────────────────────────

  const single = selected.length === 1 ? selected[0] : null;
  const near = useMemo(() => {
    const out = new Set<string>();
    if (!single) return out;
    for (const l of kase.links) {
      if (l.from === single) out.add(l.to);
      if (l.to === single) out.add(l.from);
    }
    return out;
  }, [kase.links, single]);
  const selSet = new Set(selected);
  const draft = editing && !editing.id ? editing : null;
  const zoom = view.zoom;
  const dragging = gesture?.kind === 'card' && gesture.moved;
  const selBox = editable && !editing && !dragging && gesture?.kind !== 'marquee' ? boxOf(selected) : null;
  const detail = single && !editing ? kase.cards[single] : undefined;

  const rubber = (() => {
    if (gesture?.kind === 'pin' && gesture.moved) {
      const a = pinOf(posOf(gesture.from));
      const b = gesture.target ? pinOf(posOf(gesture.target)) : gesture.at;
      return stringPath(a, b).d;
    }
    if (draft?.linkFrom && kase.cards[draft.linkFrom]) return stringPath(pinOf(posOf(draft.linkFrom)), pinOf(draft)).d;
    return null;
  })();

  const marquee = gesture?.kind === 'marquee' ? rectFrom(gesture.start, gesture.at) : null;
  const ghost = gesture?.kind === 'ghost' && gesture.moved ? gesture : null;
  const GhostIcon = ghost ? CLUE_ICONS[ghost.clue] : null;

  return (
    <div className={`col${fullscreen.full ? ' clue-full' : ''}`}>
      <div className={`clue-stage${gesture?.kind === 'pan' ? ' clue-panning' : ''}`}
        onPointerMove={onStageMove} onPointerUp={onStageUp} onPointerCancel={onStageCancel}
        onPointerLeave={() => { if (!gRef.current) lastClient.current = null; }}>
        <div ref={wrapRef} className="clue-wrap">
          <div style={{ width: BOARD_SIZE.w * zoom, height: BOARD_SIZE.h * zoom, position: 'relative' }}>
            <div ref={boardRef} className={`clue-board${gesture?.kind === 'pin' ? ' clue-linking' : ''}`}
              style={{ width: BOARD_SIZE.w, height: BOARD_SIZE.h, transform: `scale(${zoom})` }}
              onPointerDown={onBoardDown} onClick={onBoardClick}
              onDoubleClick={editable ? (e) => { if (e.target === e.currentTarget) void startDraft('evidencia', view.clientToBoard(e.clientX, e.clientY)); } : undefined}>
              <svg className="clue-strings" width={BOARD_SIZE.w} height={BOARD_SIZE.h} aria-hidden="true">
                {kase.links.map((l) => {
                  if (!kase.cards[l.from] || !kase.cards[l.to]) return null;
                  const { d } = stringPath(pinOf(posOf(l.from)), pinOf(posOf(l.to)));
                  const hot = selSet.has(l.from) || selSet.has(l.to) || hoverLink === l.id;
                  return (
                    <g key={l.id} className={`clue-string${hot ? ' hot' : single ? ' dim' : ''}`}>
                      <path d={d} className="clue-string-line" />
                      {editable && !gesture && (
                        <path d={d} className="clue-string-hit"
                          onPointerEnter={() => setHoverLink(l.id)} onPointerLeave={() => setHoverLink((h) => (h === l.id ? null : h))}
                          onClick={() => setHoverLink(l.id)} />
                      )}
                    </g>
                  );
                })}
                {rubber && <path d={rubber} className="clue-string-rubber" />}
              </svg>

              {editable && !gesture && kase.links.map((l) => {
                if (!kase.cards[l.from] || !kase.cards[l.to]) return null;
                if (hoverLink !== l.id && !selSet.has(l.from) && !selSet.has(l.to)) return null;
                const { mid } = stringPath(pinOf(posOf(l.from)), pinOf(posOf(l.to)));
                return (
                  <button key={l.id} type="button" className="clue-unlink" title="Remover ligação" aria-label="Remover ligação"
                    style={{ left: mid.x, top: mid.y, transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
                    onPointerEnter={() => setHoverLink(l.id)} onPointerLeave={() => setHoverLink((h) => (h === l.id ? null : h))}
                    onPointerDown={(e) => e.stopPropagation()} onClick={() => void unlink(l)}>
                    <X size={12} />
                  </button>
                );
              })}

              {cards.map((c) => {
                const p = posOf(c.id);
                const isEditing = editing?.id === c.id;
                return (
                  <ClueCardView key={c.id} id={c.id} x={p.x} y={p.y} editable={editable}
                    card={isEditing && editing ? editing : c}
                    flags={{
                      selected: selSet.has(c.id),
                      dim: !!single && single !== c.id && !near.has(c.id) && !editing,
                      near: near.has(c.id),
                      target: gesture?.kind === 'pin' && gesture.target === c.id,
                      dragging: gesture?.kind === 'card' && gesture.moved && gesture.ids.includes(c.id),
                    }}
                    edit={isEditing ? { set: (v) => editingRef.current && setEditing({ ...editingRef.current, ...v }), commit: () => void commitEdit(), cancel: cancelEdit } : undefined}
                    onCardDown={(e) => onCardDown(c, e)}
                    onPinDown={(e) => onPinDown(c, e)}
                    onClick={editable ? undefined : () => setSel(single === c.id ? [] : [c.id])}
                    onDoubleClick={editable ? () => beginEdit(c.id) : undefined}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                      e.preventDefault();
                      if (editable && e.key === 'Enter' && single === c.id) beginEdit(c.id);
                      else setSel(single === c.id && !editable ? [] : [c.id]);
                    }} />
                );
              })}

              {draft && (
                <ClueCardView id={DRAFT_ID} x={draft.x} y={draft.y} editable card={draft} flags={{}}
                  edit={{ set: (v) => editingRef.current && setEditing({ ...editingRef.current, ...v }), commit: () => void commitEdit(), cancel: cancelEdit }} />
              )}

              {marquee && <div className="clue-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}

              {selBox && (
                <SelectionToolbar box={selBox} zoom={zoom} count={selected.length}
                  anyVisible={selected.some((id) => !kase.cards[id].hidden)}
                  onEdit={() => beginEdit(selected[0])}
                  onToggleHidden={() => void toggleHidden(selected)}
                  onDuplicate={() => void duplicate(selected)}
                  onLink={() => void linkMany(selected[0], selected.slice(1))}
                  onDelete={() => void removeCards(selected)} />
              )}
            </div>
          </div>
        </div>

        <BoardDock editable={editable} zoom={zoom} undo={editable ? undo : undefined} publish={editable ? publish : undefined} onChipDown={onChipDown}
          onZoom={view.zoomBy} onZoomReset={() => view.zoomTo(1)} onFit={view.fit} onHelp={() => setHelp(true)}
          full={fullscreen.full} onFullscreen={fullscreen.toggle} />

        {!cards.length && !draft && (
          <div className="clue-empty">
            {editable ? (
              <>
                <strong>Mural vazio</strong>
                <span>Arraste <b>Evidência</b> ou <b>Fato</b> da paleta para cá, ou dê dois cliques no quadro.</span>
                <span>Depois, puxe o alfinete de um cartão até outro para ligá-los.</span>
              </>
            ) : <span>Nenhuma pista revelada ainda.</span>}
          </div>
        )}

        {ghost && GhostIcon && (
          <div className={`clue-ghost clue-ghost-${ghost.clue}`} style={{ left: ghost.cx, top: ghost.cy }} aria-hidden="true">
            <GhostIcon size={13} /> {CLUE_KINDS[ghost.clue]}
          </div>
        )}
      </div>

      {detail && (
        <div className="card clue-detail">
          <div className="row">
            <span className={`badge ${detail.kind === 'fato' ? 'badge-ok' : 'badge-gold'}`}>{CLUE_KINDS[detail.kind]}</span>
            {detail.hidden && <span className="badge">Oculto</span>}
            <strong className="grow">{detail.title}</strong>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSel([])} aria-label="Fechar"><X size={14} /></button>
          </div>
          {detail.text && <p className="secondary pre mt">{detail.text}</p>}
          {near.size > 0 && (
            <div className="row-wrap mt">
              <span className="tiny muted">Ligado a</span>
              {[...near].map((id) => kase.cards[id] && (
                <button key={id} className="btn btn-sm" onClick={() => centerOn(id)}>{kase.cards[id].title}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
    </div>
  );
}
