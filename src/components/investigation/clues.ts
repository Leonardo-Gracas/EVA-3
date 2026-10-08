// Peças comuns do mural: ícones, geometria dos cartões e dos fios.
import { Lightbulb, Search } from 'lucide-react';
import { BOARD_SIZE, CLUE_SIZE, type ClueKind } from '../../model/types';

export const CLUE_ICONS: Record<ClueKind, typeof Search> = { evidencia: Search, fato: Lightbulb };

/** Puxar o alfinete para o vazio cria o tipo oposto: de uma evidência nasce um fato. */
export const OPPOSITE: Record<ClueKind, ClueKind> = { evidencia: 'fato', fato: 'evidencia' };

/** O fio sai do alfinete, no topo do cartão. */
export const PIN_Y = 2;

export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 2;

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const clampX = (x: number) => clamp(Math.round(x), 0, BOARD_SIZE.w - CLUE_SIZE.w);
export const clampY = (y: number) => clamp(Math.round(y), 0, BOARD_SIZE.h - CLUE_SIZE.h);

export const pinOf = (p: Point): Point => ({ x: p.x + CLUE_SIZE.w / 2, y: p.y + PIN_Y });

/** Fio levemente caído entre dois alfinetes: caminho SVG e ponto do meio. */
export function stringPath(a: Point, b: Point): { d: string; mid: Point } {
  const sag = Math.min(60, Math.hypot(b.x - a.x, b.y - a.y) * 0.08);
  const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + sag };
  return {
    d: `M${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`,
    // Ponto da curva em t = 0,5.
    mid: { x: (a.x + 2 * c.x + b.x) / 4, y: (a.y + 2 * c.y + b.y) / 4 },
  };
}

export const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function rectFrom(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/** Campo de texto ativo: os atalhos do mural não valem enquanto se digita. */
export function typingIn(t: EventTarget | null): boolean {
  return !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
}
