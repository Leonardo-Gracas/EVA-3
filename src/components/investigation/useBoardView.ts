// Câmera do mural: zoom, rolagem, conversão de coordenadas e rolagem automática nas bordas.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { BOARD_SIZE } from '../../model/types';
import { clamp, ZOOM_MAX, ZOOM_MIN, type Point, type Rect } from './clues';

/** Faixa da borda (px de tela) que rola o quadro durante um arraste. */
const EDGE = 44;
const EDGE_SPEED = 18;
const FIT_MARGIN = 60;
const FIT_MAX = 1.25;

export interface BoardView {
  zoom: number;
  zoomTo: (z: number, anchor?: Point) => void;
  zoomBy: (f: number) => void;
  /** Enquadra todos os cartões (ou o centro do quadro, se não houver nenhum). */
  fit: () => void;
  clientToBoard: (cx: number, cy: number) => Point;
  insideView: (cx: number, cy: number) => boolean;
  /** Centro da área visível, em coordenadas do quadro. */
  viewCenter: () => Point;
  /** Rolagem automática enquanto algo é arrastado perto da borda; `onScroll` refaz a posição do arraste. */
  startAutoScroll: (onScroll: () => void) => void;
  stopAutoScroll: () => void;
  trackPointer: (cx: number, cy: number) => void;
}

export function useBoardView(wrapRef: RefObject<HTMLDivElement>, fitKey: string, measure: () => Rect | null): BoardView {
  const [zoom, setZoom] = useState(() => (window.innerWidth < 640 ? 0.6 : 1));
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const pointer = useRef<Point | null>(null);
  const auto = useRef<{ raf: number } | null>(null);
  const measureRef = useRef(measure);
  measureRef.current = measure;

  /** Viewport em px de tela relativo ao conteúdo rolável. */
  const local = (w: HTMLDivElement, cx: number, cy: number): Point => {
    const r = w.getBoundingClientRect();
    return { x: cx - r.left - w.clientLeft, y: cy - r.top - w.clientTop };
  };

  const clientToBoard = useCallback((cx: number, cy: number): Point => {
    const w = wrapRef.current;
    if (!w) return { x: 0, y: 0 };
    const p = local(w, cx, cy);
    const z = zoomRef.current;
    return { x: (p.x + w.scrollLeft) / z, y: (p.y + w.scrollTop) / z };
  }, [wrapRef]);

  const insideView = useCallback((cx: number, cy: number) => {
    const w = wrapRef.current;
    if (!w) return false;
    const r = w.getBoundingClientRect();
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  }, [wrapRef]);

  const viewCenter = useCallback((): Point => {
    const w = wrapRef.current;
    const z = zoomRef.current;
    if (!w) return { x: BOARD_SIZE.w / 2, y: BOARD_SIZE.h / 2 };
    return { x: (w.scrollLeft + w.clientWidth / 2) / z, y: (w.scrollTop + w.clientHeight / 2) / z };
  }, [wrapRef]);

  /** Troca o zoom mantendo parado o ponto do quadro sob `anchor` (ou o centro da tela). */
  const zoomTo = useCallback((target: number, anchor?: Point) => {
    const w = wrapRef.current;
    const z = zoomRef.current;
    const next = clamp(Math.round(target * 100) / 100, ZOOM_MIN, ZOOM_MAX);
    if (!w || next === z) return;
    const a = anchor ? local(w, anchor.x, anchor.y) : { x: w.clientWidth / 2, y: w.clientHeight / 2 };
    const b = { x: (w.scrollLeft + a.x) / z, y: (w.scrollTop + a.y) / z };
    // Renderiza já, para a rolagem nova valer sobre o tamanho novo do quadro.
    flushSync(() => setZoom(next));
    zoomRef.current = next;
    w.scrollLeft = b.x * next - a.x;
    w.scrollTop = b.y * next - a.y;
  }, [wrapRef]);

  const zoomBy = useCallback((f: number) => zoomTo(zoomRef.current * f), [zoomTo]);

  const fit = useCallback(() => {
    const w = wrapRef.current;
    if (!w) return;
    const box = measureRef.current();
    const target: Rect = box
      ? { x: box.x - FIT_MARGIN, y: box.y - FIT_MARGIN, w: box.w + FIT_MARGIN * 2, h: box.h + FIT_MARGIN * 2 }
      : { x: BOARD_SIZE.w / 2 - w.clientWidth / 2, y: BOARD_SIZE.h / 2 - w.clientHeight / 2, w: w.clientWidth, h: w.clientHeight };
    const next = clamp(Math.min(w.clientWidth / target.w, w.clientHeight / target.h, FIT_MAX), ZOOM_MIN, ZOOM_MAX);
    flushSync(() => setZoom(next));
    zoomRef.current = next;
    w.scrollLeft = (target.x + target.w / 2) * next - w.clientWidth / 2;
    w.scrollTop = (target.y + target.h / 2) * next - w.clientHeight / 2;
  }, [wrapRef]);

  // Ao abrir outro caso: enquadra depois que os cartões aparecem.
  useEffect(() => {
    const raf = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(raf);
  }, [fitKey, fit]);

  // Ctrl/⌘ + roda: zoom no ponto do cursor. Precisa de listener não passivo para impedir o zoom da página.
  useEffect(() => {
    const w = wrapRef.current;
    if (!w) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.002), { x: e.clientX, y: e.clientY });
    };
    w.addEventListener('wheel', onWheel, { passive: false });
    return () => w.removeEventListener('wheel', onWheel);
  }, [wrapRef, zoomTo]);

  const trackPointer = useCallback((cx: number, cy: number) => { pointer.current = { x: cx, y: cy }; }, []);

  const stopAutoScroll = useCallback(() => {
    if (auto.current) cancelAnimationFrame(auto.current.raf);
    auto.current = null;
  }, []);

  const startAutoScroll = useCallback((onScroll: () => void) => {
    stopAutoScroll();
    const speed = (d: number) => (d < EDGE ? Math.ceil(((EDGE - d) / EDGE) * EDGE_SPEED) : 0);
    const tick = () => {
      const w = wrapRef.current;
      const p = pointer.current;
      if (w && p) {
        const r = w.getBoundingClientRect();
        const dx = speed(p.x - r.left) ? -Math.min(EDGE_SPEED, speed(p.x - r.left)) : Math.min(EDGE_SPEED, speed(r.right - p.x));
        const dy = speed(p.y - r.top) ? -Math.min(EDGE_SPEED, speed(p.y - r.top)) : Math.min(EDGE_SPEED, speed(r.bottom - p.y));
        if (dx || dy) {
          const [left, top] = [w.scrollLeft, w.scrollTop];
          w.scrollLeft += dx;
          w.scrollTop += dy;
          if (w.scrollLeft !== left || w.scrollTop !== top) onScroll();
        }
      }
      auto.current = { raf: requestAnimationFrame(tick) };
    };
    auto.current = { raf: requestAnimationFrame(tick) };
  }, [wrapRef, stopAutoScroll]);

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  return { zoom, zoomTo, zoomBy, fit, clientToBoard, insideView, viewCenter, startAutoScroll, stopAutoScroll, trackPointer };
}
