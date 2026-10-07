// O que cada jogador recebe: só a própria ficha completa e dados públicos.
import type { LogEntry, PlayerCombat, PlayerCombatant, PlayerView, TableState } from '../model/types';
import { effectivePermissions } from '../model/permissions';
import { titleOf } from '../rules/derive';
import { naturalD20 } from '../rules/dice';
import { combatantInfo, conditionRemaining, currentCombatant } from './combat';

const LOG_FOR_PLAYERS = 150;

export function buildPlayerView(s: TableState, playerId: string, online: Set<string>): PlayerView {
  const me = s.players[playerId];
  const chars = Object.values(s.characters).sort((a, b) => a.createdAt - b.createdAt);
  return {
    table: { id: s.id, name: s.name, gmName: s.gmName, startLevel: s.startLevel },
    me: { id: playerId, name: me?.name ?? 'Jogador' },
    players: Object.values(s.players).map((p) => ({ id: p.id, name: p.name, online: online.has(p.id) })),
    myCharacters: chars.filter((c) => c.ownerId === playerId),
    library: Object.values(s.itemLibrary ?? {}).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    others: chars
      .filter((c) => c.ownerId !== playerId && c.status === 'approved' && (c.kind !== 'npc' || c.visible))
      .map((c) => ({
        id: c.id,
        kind: c.kind,
        ownerId: c.ownerId,
        ownerName: c.kind === 'npc' ? 'NPC' : s.players[c.ownerId]?.name ?? '—',
        name: c.name,
        concept: c.concept,
        level: c.levels.length,
        title: titleOf(c.levels),
        status: c.status,
      })),
    threats: Object.values(s.threats ?? {})
      .filter((t) => t.visible)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((t) => ({ id: t.id, name: t.name, concept: t.concept })),
    myRequests: s.requests.filter((r) => r.playerId === playerId).slice(-40),
    permissions: effectivePermissions(s.permissions, playerId),
    log: s.log.flatMap((e) => entryFor(e, playerId)).slice(-LOG_FOR_PLAYERS),
    combat: buildPlayerCombat(s, playerId),
  };
}

/**
 * Entradas ocultas ficam com o mestre (e com o jogador que rolou). Da rolagem oculta
 * do mestre que deu 20 ou 1 natural, o jogador recebe só o d20 — para sentir a pressão.
 */
function entryFor(e: LogEntry, playerId: string): LogEntry[] {
  if (!e.hidden || e.playerId === playerId) return [e];
  const nat = e.playerId ? null : naturalD20(e.roll);
  if (nat !== 20 && nat !== 1) return [];
  return [{
    id: e.id, at: e.at, kind: 'roll', actorName: e.actorName, text: 'rolagem oculta', hidden: true, secret: true,
    roll: { expr: 'd20', dice: [{ sides: 20, value: nat }], modifier: 0, total: nat },
  }];
}

/** Fila sem os ocultos; dos outros, só o estado descritivo (nunca números). */
function buildPlayerCombat(s: TableState, playerId: string): PlayerCombat | null {
  const c = s.combat;
  if (!c) return null;
  const turnCb = currentCombatant(c);
  const order: PlayerCombatant[] = [];
  for (const cb of c.order) {
    if (cb.hidden) continue;
    const info = combatantInfo(s, cb);
    if (!info) continue;
    const mine = !!info.character && info.character.ownerId === playerId;
    order.push({
      id: cb.id,
      name: info.name,
      side: info.side,
      mine,
      ...(mine ? { characterId: info.character!.id } : {}),
      health: info.health,
      conditions: cb.conditions.map((x) => ({ id: x.id, name: x.name, rounds: conditionRemaining(c, x) })),
    });
  }
  return { round: c.round, turnId: turnCb && !turnCb.hidden ? turnCb.id : null, order };
}
