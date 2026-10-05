// O que cada jogador recebe: só a própria ficha completa e dados públicos.
import type { PlayerView, TableState } from '../model/types';
import { effectivePermissions } from '../model/permissions';
import { titleOf } from '../rules/derive';

const LOG_FOR_PLAYERS = 150;

export function buildPlayerView(s: TableState, playerId: string, online: Set<string>): PlayerView {
  const me = s.players[playerId];
  const chars = Object.values(s.characters).sort((a, b) => a.createdAt - b.createdAt);
  return {
    table: { id: s.id, name: s.name, gmName: s.gmName },
    me: { id: playerId, name: me?.name ?? 'Jogador' },
    players: Object.values(s.players).map((p) => ({ id: p.id, name: p.name, online: online.has(p.id) })),
    myCharacters: chars.filter((c) => c.ownerId === playerId),
    others: chars
      .filter((c) => c.ownerId !== playerId && c.status === 'approved')
      .map((c) => ({
        id: c.id,
        ownerId: c.ownerId,
        ownerName: s.players[c.ownerId]?.name ?? '—',
        name: c.name,
        concept: c.concept,
        level: c.levels.length,
        title: titleOf(c.levels),
        status: c.status,
      })),
    myRequests: s.requests.filter((r) => r.playerId === playerId).slice(-40),
    permissions: effectivePermissions(s.permissions, playerId),
    log: s.log.filter((e) => !e.hidden || e.playerId === playerId).slice(-LOG_FOR_PLAYERS),
  };
}
