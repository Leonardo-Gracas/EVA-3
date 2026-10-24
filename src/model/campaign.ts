// Caderno de campanha do mestre: valores iniciais e consultas simples.
import type { Campaign, CampaignSession, CampaignSessionData } from './types';

export function emptyCampaign(title = ''): Campaign {
  return { title, premise: '', notes: '', threads: [], arcs: [], sessions: {} };
}

export function emptySessionData(number = 0, arcId: string | null = null): CampaignSessionData {
  return {
    number,
    title: '',
    date: '',
    arcId,
    status: 'planejada',
    plan: { goal: '', opening: '', outline: '', secrets: [], cast: [], prep: [] },
    report: { attendees: [], guests: '', live: '', recap: '', hooks: '' },
  };
}

/** Sessões em ordem de número (a ordem da campanha). */
export function sessionsInOrder(c: Campaign): CampaignSession[] {
  return Object.values(c.sessions).sort((a, b) => a.number - b.number || a.createdAt - b.createdAt);
}

/** Próxima sessão a jogar: a planejada de menor número. */
export function nextSession(c: Campaign): CampaignSession | undefined {
  return sessionsInOrder(c).find((s) => s.status === 'planejada');
}

export function sessionLabel(s: Pick<CampaignSessionData, 'number' | 'title'>): string {
  return s.title.trim() || `Sessão ${s.number}`;
}

/** "2026-10-24" por extenso e curto, em português; vazio se não houver data. */
export function formatSessionDate(date: string, short = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return short
    ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/** Hoje no fuso local, como AAAA-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
