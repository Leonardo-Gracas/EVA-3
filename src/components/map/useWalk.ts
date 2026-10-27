// Caminhada dos tokens: quando a posição de um token muda, ele percorre o caminho
// quadrado a quadrado em vez de pular. Só visual; o estado já está no destino.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Point } from '../../rules/grid';

/** Caminho do quadrado `from` ao `to` (inclusive); null = linha reta. */
export type RouteFn = (tokenId: string, from: Point, to: Point) => Point[] | null;

interface Walk { points: Point[]; lens: number[]; total: number; start: number; duration: number }

export interface WalkToken { id: string; x: number; y: number; dragging?: boolean; trail?: Point[] }

/** O rastro gravado serve se liga exatamente de onde o token estava até onde está. */
const trailFits = (trail: Point[] | undefined, from: Point, to: Point) => !!trail && trail.length > 1
  && trail[0].x === from.x && trail[0].y === from.y && trail[trail.length - 1].x === to.x && trail[trail.length - 1].y === to.y;

/** Velocidade da caminhada (ms por quadrado) e limites da duração total. */
const MS_PER_CELL = 130;
const MIN_MS = 180;
const MAX_MS = 3000;

/**
 * Com "reduzir animações" (comum no celular em economia de bateria) a caminhada continua:
 * ela mostra por onde o token foi, não é enfeite. Só fica mais rápida.
 */
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function makeWalk(points: Point[], now: number): Walk | null {
  if (points.length < 2) return null;
  const lens = [0];
  for (let i = 1; i < points.length; i++) lens.push(lens[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const total = lens[lens.length - 1];
  if (!total) return null;
  const speed = reduced() ? 0.5 : 1;
  return { points, lens, total, start: now, duration: Math.max(MIN_MS, Math.min(MAX_MS * speed, total * MS_PER_CELL * speed)) };
}

/** Posição na caminhada e índice do próximo ponto. */
function at(w: Walk, now: number): { x: number; y: number; next: number } | null {
  const t = (now - w.start) / w.duration;
  if (t >= 1) return null;
  // Passo constante, como quem anda.
  const d = t * w.total;
  let i = 1;
  while (i < w.lens.length - 1 && w.lens[i] < d) i++;
  const a = w.points[i - 1];
  const b = w.points[i];
  const seg = w.lens[i] - w.lens[i - 1] || 1;
  const f = (d - w.lens[i - 1]) / seg;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, next: i };
}

export interface WalkState {
  /** Posição mostrada (fração de quadrado) de quem está andando. */
  pos: Map<string, { x: number; y: number }>;
  /** O que falta do caminho de quem está andando, para desenhar a linha. */
  trails: Array<{ id: string; points: Point[] }>;
}

export function useWalk(tokens: WalkToken[], route?: RouteFn): WalkState {
  const prev = useRef(new Map<string, Point>());
  const walks = useRef(new Map<string, Walk>());
  const routeRef = useRef(route);
  routeRef.current = route;
  const [, setTick] = useState(0);
  const raf = useRef(0);

  useLayoutEffect(() => {
    const now = performance.now();
    const seen = new Set<string>();
    let started = false;
    for (const t of tokens) {
      seen.add(t.id);
      if (t.dragging) { walks.current.delete(t.id); continue; }
      const p = prev.current.get(t.id);
      prev.current.set(t.id, { x: t.x, y: t.y });
      if (!p || (p.x === t.x && p.y === t.y)) continue;
      // Se já estava andando, recomeça de onde parou (arredondado ao quadrado).
      const cur = walks.current.get(t.id);
      const here = cur ? at(cur, now) : null;
      const from = here ? { x: Math.round(here.x), y: Math.round(here.y) } : p;
      const pts = trailFits(t.trail, from, t) ? t.trail! : routeRef.current?.(t.id, from, t) ?? [from, { x: t.x, y: t.y }];
      const w = makeWalk(pts, now);
      if (w) { walks.current.set(t.id, w); started = true; } else walks.current.delete(t.id);
    }
    for (const id of [...prev.current.keys()]) if (!seen.has(id)) { prev.current.delete(id); walks.current.delete(id); }
    if (started) setTick((n) => n + 1);
  }, [tokens]);

  const active = walks.current.size > 0;
  useEffect(() => {
    if (!active) return;
    const loop = () => {
      const now = performance.now();
      for (const [id, w] of walks.current) if (!at(w, now)) walks.current.delete(id);
      setTick((n) => n + 1);
      if (walks.current.size) raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [active]);

  const now = performance.now();
  const pos = new Map<string, { x: number; y: number }>();
  const trails: WalkState['trails'] = [];
  for (const [id, w] of walks.current) {
    const p = at(w, now);
    if (!p) continue;
    pos.set(id, { x: p.x, y: p.y });
    trails.push({ id, points: [{ x: p.x, y: p.y }, ...w.points.slice(p.next)] });
  }
  return { pos, trails };
}
