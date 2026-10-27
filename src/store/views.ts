// O que cada jogador recebe: só a própria ficha completa e dados públicos.
import type {
  LogEntry, PlayerCombat, PlayerCombatant, PlayerMap, PlayerMapMove, PlayerMapToken, PlayerView, TableState,
} from '../model/types';
import { combatOn, isTokenTurn, moveBudget, moveGate, playerGrid, tokenCombatant, tokenInfo, visibleObjects } from './maps';
import { followPath } from '../rules/grid';
import { effectivePermissions } from '../model/permissions';
import { caseShown, publishedCase } from '../model/cases';
import { avatarFor } from '../model/avatar';
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
        ...(c.avatar ? { avatar: c.avatar } : {}),
      })),
    threats: Object.values(s.threats ?? {})
      .filter((t) => t.visible)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((t) => ({ id: t.id, name: t.name, concept: t.concept })),
    myRequests: s.requests.filter((r) => r.playerId === playerId).slice(-40),
    permissions: effectivePermissions(s.permissions, playerId),
    log: s.log.flatMap((e) => entryFor(e, playerId)).slice(-LOG_FOR_PLAYERS),
    combat: buildPlayerCombat(s, playerId),
    // Só a versão publicada: o rascunho do mestre nunca sai do navegador dele.
    cases: Object.values(s.cases ?? {})
      .filter(caseShown)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(publishedCase),
    map: buildPlayerMap(s, playerId),
  };
}

/** O mapa aberto, como o jogador vê: sem o que está oculto, com quanto cada ficha dele anda. */
function buildPlayerMap(s: TableState, playerId: string): PlayerMap | null {
  const m = s.activeMapId ? s.maps?.[s.activeMapId] : undefined;
  if (!m) return null;
  const tokens: PlayerMapToken[] = [];
  const moves: PlayerMapMove[] = [];
  const grid = playerGrid(m);
  const here = combatOn(s, m);
  for (const t of Object.values(m.tokens)) {
    const info = tokenInfo(s, t);
    if (!info || info.hidden) continue;
    const cb = here ? tokenCombatant(s, t) : undefined;
    const ch = info.characterId ? s.characters[info.characterId] : undefined;
    const mine = !!ch && ch.ownerId === playerId;
    // NPC que o mestre não revelou aparece no mapa, mas sem nome.
    const name = ch?.kind === 'npc' && !ch.visible ? 'Desconhecido' : info.name;
    tokens.push({
      id: t.id, x: t.x, y: t.y, name, side: info.side,
      ...(info.avatar ? { avatar: info.avatar } : {}),
      ...(info.category ? { category: info.category } : {}),
      mine,
      ...(mine ? { characterId: ch!.id } : {}),
      turn: isTokenTurn(s, m, t),
      ...(cb ? { combatantId: cb.id } : {}),
      // Rastro só se o jogador consegue andar por ele: não entrega porta secreta.
      ...(t.trail && followPath(grid, t.trail) ? { trail: t.trail } : {}),
    });
    if (mine && ch!.status === 'approved') {
      const g = moveGate(s, m, ch!.id);
      const b = moveBudget(s, t, g.accumulate);
      moves.push({
        characterId: ch!.id, tokenId: t.id, squares: b.squares, remaining: b.remaining, parity: b.parity, gate: g.gate,
        ...(g.reason ? { reason: g.reason } : {}),
      });
    }
  }
  return {
    id: m.id, name: m.name, w: m.w, h: m.h, cells: m.cells, wallsH: m.wallsH, wallsV: m.wallsV, mode: m.mode,
    objects: visibleObjects(m), tokens, moves,
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
      ...(info.character ? { avatar: avatarFor(info.character) } : {}),
      side: info.side,
      mine,
      ...(mine ? { characterId: info.character!.id } : {}),
      health: info.health,
      conditions: cb.conditions.map((x) => ({ id: x.id, name: x.name, rounds: conditionRemaining(c, x) })),
    });
  }
  return { round: c.round, turnId: turnCb && !turnCb.hidden ? turnCb.id : null, order };
}
