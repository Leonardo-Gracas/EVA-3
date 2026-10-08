// Rascunho × versão publicada de um caso. O mestre edita o rascunho à vontade; os jogadores
// só recebem a cópia congelada na última publicação.
import type { CaseSnapshot, ClueCard, InvestigationCase } from './types';

/** O que os jogadores veriam se o mestre publicasse agora: só cartões não ocultos e os fios entre eles. */
export function snapshotOf(k: InvestigationCase, now: number): CaseSnapshot {
  const cards = Object.fromEntries(Object.values(k.cards).filter((c) => !c.hidden).map((c) => [c.id, { ...c }]));
  return {
    title: k.title,
    description: k.description,
    cards,
    links: k.links.filter((l) => cards[l.from] && cards[l.to]).map((l) => ({ ...l })),
    publishedAt: now,
  };
}

/** Caso que os jogadores enxergam no mural. */
export function caseShown(k: InvestigationCase): boolean {
  return k.visible && !k.archived && !!k.published;
}

export interface CaseChanges {
  added: ClueCard[];
  removed: ClueCard[];
  /** Texto, tipo ou posição diferentes da versão publicada. */
  changed: number;
  links: number;
  /** Título ou resumo do caso. */
  info: boolean;
  total: number;
}

const sameCard = (a: ClueCard, b: ClueCard) => a.kind === b.kind && a.title === b.title && a.text === b.text && a.x === b.x && a.y === b.y;
const linkKey = (from: string, to: string) => (from < to ? `${from}|${to}` : `${to}|${from}`);

/** O que mudou para os jogadores desde a última publicação (edições em cartões ocultos não contam). */
export function caseChanges(k: InvestigationCase): CaseChanges {
  const next = snapshotOf(k, 0);
  const prev = k.published;
  const before = prev?.cards ?? {};
  const added = Object.values(next.cards).filter((c) => !before[c.id]);
  const removed = Object.values(before).filter((c) => !next.cards[c.id]);
  const changed = Object.values(next.cards).filter((c) => before[c.id] && !sameCard(c, before[c.id])).length;
  const a = new Set(next.links.map((l) => linkKey(l.from, l.to)));
  const b = new Set((prev?.links ?? []).map((l) => linkKey(l.from, l.to)));
  const links = [...a].filter((x) => !b.has(x)).length + [...b].filter((x) => !a.has(x)).length;
  const info = !!prev && (prev.title !== k.title || prev.description !== k.description);
  return { added, removed, changed, links, info, total: added.length + removed.length + changed + links + (info ? 1 : 0) };
}

/** O caso como chega ao jogador: a versão publicada, sem nada do rascunho. */
export function publishedCase(k: InvestigationCase): InvestigationCase {
  const p = k.published!;
  return {
    id: k.id, title: p.title, description: p.description, visible: true, archived: false,
    cards: p.cards, links: p.links, published: null, createdAt: k.createdAt, updatedAt: p.publishedAt,
  };
}
