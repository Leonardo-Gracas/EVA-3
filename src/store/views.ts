// O que cada jogador recebe: só a própria ficha completa e dados públicos.
import type {
  BattleMap, LogEntry, MapObject, MapRoof, PlayerCombat, PlayerCombatant, PlayerMap, PlayerMapMove, PlayerMapToken, PlayerRelation, PlayerRoof,
  PlayerView, TableState,
} from '../model/types';
import { TERRAIN_CHAR } from '../model/types';
import { ambientOf, objectCells, visionOf } from '../model/map';
import type { Vision } from '../rules/vision';
import { combatOn, eyesOf, isTokenTurn, moveBudget, moveGate, playerGrid, playerSight, tokenCombatant, tokenInfo, visibleObjects } from './maps';
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
    relations: buildPlayerRelations(s, playerId),
  };
}

/** Quem os personagens do jogador conhecem. Do NPC, só o que se vê ao conhecê-lo: nome, conceito e aparência. */
function buildPlayerRelations(s: TableState, playerId: string): PlayerRelation[] {
  const out: PlayerRelation[] = [];
  for (const r of s.relations ?? []) {
    const pc = s.characters[r.pcId];
    const npc = s.characters[r.npcId];
    if (!pc || !npc || pc.ownerId !== playerId) continue;
    out.push({
      characterId: pc.id,
      npc: { id: npc.id, name: npc.name, concept: npc.concept, ...(npc.avatar ? { avatar: npc.avatar } : {}) },
      mine: r.pc,
      theirs: r.npc,
      createdAt: r.createdAt,
    });
  }
  return out;
}

/** O mapa aberto, como o jogador vê: sem o que está oculto, com quanto cada ficha dele anda. */
function buildPlayerMap(s: TableState, playerId: string): PlayerMap | null {
  const m = s.activeMapId ? s.maps?.[s.activeMapId] : undefined;
  if (!m) return null;
  const tokens: PlayerMapToken[] = [];
  const moves: PlayerMapMove[] = [];
  const grid = playerGrid(m);
  const here = combatOn(s, m);
  // Visão individual ou compartilhada: só o que os personagens enxergam (o resto nem sai daqui).
  const vision = visionOf(m);
  const vis = vision !== 'open' ? playerSight(s, m, playerId, grid) : null;
  // Telhados: o interior coberto não sai daqui (tokens, móveis e luzes lá dentro).
  const roofs = coveringRoofs(s, m, playerId);
  const covered = new Uint8Array(m.w * m.h);
  for (const rf of roofs) for (const i of rf.cells) covered[i] = 1;
  const sees = (x: number, y: number) => (!vis || vis.seen[y * m.w + x] === 1) && !covered[y * m.w + x];
  const shown = (o: MapObject) => objectCells(o).every(([x, y]) => !covered[y * m.w + x]);
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
        ...(g.unlimited ? { unlimited: true } : {}),
        ...(g.extra ? { extra: true } : {}),
        ...(g.reason ? { reason: g.reason } : {}),
      });
    }
  }
  const base = { id: m.id, name: m.name, w: m.w, h: m.h, mode: m.mode, vision, tokens, moves };
  const roofsFor = (keep: (i: number) => boolean): { roofs?: PlayerRoof[] } => {
    const out = roofs.flatMap((rf) => {
      const cells = rf.cells.filter(keep);
      return cells.length ? [{ id: rf.id, label: rf.label, cells }] : [];
    });
    return out.length ? { roofs: out } : {};
  };
  if (!vis) {
    return { ...base, cells: m.cells, wallsH: m.wallsH, wallsV: m.wallsV, objects: visibleObjects(m).filter(shown), ...roofsFor(() => true) };
  }
  let light = '';
  for (let i = 0; i < m.w * m.h; i++) light += vis.seen[i] ? vis.light[i] : '0';
  const dark = darkLayout(m, vis);
  return {
    ...base, ...dark, objects: dark.objects.filter(shown), dark: true, dim: [...vis.dim], ambient: ambientOf(m), light,
    // No escuro, o telhado cobre só o que o jogador enxerga dele.
    ...roofsFor((i) => vis.seen[i] === 1 || vis.dim.has(i)),
  };
}

/** Telhados que cobrem o interior para o jogador: os fechados, sem personagem dele lá dentro. */
function coveringRoofs(s: TableState, m: BattleMap, playerId: string): MapRoof[] {
  if (!m.roofs) return [];
  const eyes = new Set(eyesOf(s, m, playerId).map((e) => e.y * m.w + e.x));
  return Object.values(m.roofs).filter((rf) => !rf.open && !rf.cells.some((i) => eyes.has(i)));
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
    if (o.kind === 'door' || o.kind === 'window') return o.edge.o === 'h' ? nearH(o.edge.x, o.edge.y) : nearV(o.edge.x, o.edge.y);
    // Luz (acesa ou apagada): só a que está num quadrado visto.
    if (o.kind === 'light') return vis.seen[o.y * w + o.x] === 1;
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
