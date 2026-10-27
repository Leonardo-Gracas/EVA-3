// O que cada jogador recebe: só a própria ficha completa e dados públicos.
import type {
  BattleMap, LogEntry, PlayerCombat, PlayerCombatant, PlayerMap, PlayerMapMove, PlayerMapToken, PlayerView, TableState,
} from '../model/types';
import { TERRAIN_CHAR } from '../model/types';
import { visibleArea, type Vision } from '../rules/vision';
import { combatOn, eyesOf, isTokenTurn, moveBudget, moveGate, playerGrid, tokenCombatant, tokenInfo, visibleObjects } from './maps';
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
  // Visão escura: só o cômodo dos próprios personagens (o resto nem sai daqui).
  const vis = m.dark ? visibleArea(grid, m.cells, eyesOf(s, m, playerId)) : null;
  const sees = (x: number, y: number) => !vis || vis.seen[y * m.w + x] === 1;
  for (const t of Object.values(m.tokens)) {
    const info = tokenInfo(s, t);
    if (!info || info.hidden || !sees(t.x, t.y)) continue;
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
      // Rastro só se o jogador consegue andar por ele (não entrega porta secreta) e, no escuro, se viu o caminho todo.
      ...(t.trail && followPath(grid, t.trail) && t.trail.every((p) => sees(p.x, p.y)) ? { trail: t.trail } : {}),
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
  const base = { id: m.id, name: m.name, w: m.w, h: m.h, mode: m.mode, tokens, moves };
  if (!vis) return { ...base, cells: m.cells, wallsH: m.wallsH, wallsV: m.wallsV, objects: visibleObjects(m) };
  return { ...base, ...darkLayout(m, vis), dark: true, dim: [...vis.dim] };
}

/**
 * O desenho cortado pela visão: o que não se vê vira vazio, e só ficam as paredes, portas e
 * móveis encostados no que se vê (as soleiras contam, para dar para chegar à porta).
 */
function darkLayout(m: BattleMap, vis: Vision): Pick<PlayerMap, 'cells' | 'wallsH' | 'wallsV' | 'objects'> {
  const { w, h } = m;
  const known = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && (vis.seen[y * w + x] === 1 || vis.dim.has(y * w + x));
  const voidChar = TERRAIN_CHAR.void;
  let cells = '';
  for (let i = 0; i < w * h; i++) cells += known(i % w, Math.floor(i / w)) ? m.cells[i] : voidChar;
  // Linha horizontal (x, y): entre (x, y-1) e (x, y). Vertical (x, y): entre (x-1, y) e (x, y).
  const nearH = (x: number, y: number) => known(x, y - 1) || known(x, y);
  const nearV = (x: number, y: number) => known(x - 1, y) || known(x, y);
  let wallsH = '';
  for (let i = 0; i < (h + 1) * w; i++) wallsH += m.wallsH[i] === '1' && nearH(i % w, Math.floor(i / w)) ? '1' : '0';
  let wallsV = '';
  for (let i = 0; i < h * (w + 1); i++) wallsV += m.wallsV[i] === '1' && nearV(i % (w + 1), Math.floor(i / (w + 1))) ? '1' : '0';
  const objects = visibleObjects(m).filter((o) => {
    if (o.kind === 'door') return o.edge.o === 'h' ? nearH(o.edge.x, o.edge.y) : nearV(o.edge.x, o.edge.y);
    for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) if (vis.seen[y * w + x] === 1) return true;
    return false;
  });
  return { cells, wallsH, wallsV, objects };
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
      ...(cb.threat ? { category: cb.threat.category } : {}),
      side: info.side,
      mine,
      ...(mine ? { characterId: info.character!.id } : {}),
      health: info.health,
      conditions: cb.conditions.map((x) => ({ id: x.id, name: x.name, rounds: conditionRemaining(c, x) })),
    });
  }
  return { round: c.round, turnId: turnCb && !turnCb.hidden ? turnCb.id : null, order };
}
