// Leitura dos mapas: quem é cada token, quanto pode andar e se precisa pedir ao mestre.
// Usado pelo motor (validar), pela visão do jogador e pela tela do mestre.
import type {
  BattleMap, CombatSide, Combatant, MapObject, MapToken, MoveGateKind, TableState, ThreatCategory,
} from '../model/types';
import type { AvatarConfig } from '../model/avatar';
import { avatarFor } from '../model/avatar';
import { ambientOf, cellLabel, visionOf } from '../model/map';
import { carriedLight } from '../rules/derive';
import {
  buildGrid, canEnd, costTo, followPath, MAX_PATH, metersFor, pathTo, reachFrom, squaresFor, type Grid, type GridPath, type Point, type Reach,
} from '../rules/grid';
import { currentCombatant } from './combat';
import { sightArea, windowSources, type LightSource, type SightOptions, type Vision } from '../rules/vision';

/** O que os jogadores enxergam do mapa: sem portas secretas nem objetos ocultos. */
export const visibleObjects = (m: BattleMap): MapObject[] => Object.values(m.objects).filter((o) => !o.hidden);

/** Grid como o jogador vê. O motor valida o movimento do jogador com este mesmo grid. */
export const playerGrid = (m: BattleMap): Grid => buildGrid({ ...m, objects: visibleObjects(m) });

/** Grid completo, do mestre. */
export const fullGrid = (m: BattleMap): Grid => buildGrid({ ...m, objects: Object.values(m.objects) });

/**
 * De onde o jogador enxerga: os personagens (visíveis) dele neste mapa. Na visão
 * compartilhada, os personagens de todos os jogadores.
 */
export function eyesOf(s: TableState, m: BattleMap, ownerId: string): Point[] {
  const shared = visionOf(m) === 'shared';
  return Object.values(m.tokens).flatMap((t) => {
    const info = t.ref.kind === 'character' ? tokenInfo(s, t) : null;
    const ch = t.ref.kind === 'character' ? s.characters[t.ref.id] : undefined;
    if (!info || info.hidden || !ch) return [];
    const sees = shared ? ch.kind === 'pc' && ch.status === 'approved' : ch.ownerId === ownerId;
    return sees ? [{ x: t.x, y: t.y }] : [];
  });
}

/**
 * Fontes de luz do mapa: as luzes acesas (até as ocultas: o jogador vê a luz, não o objeto)
 * e quem carrega item que ilumina. As janelas entram à parte (dependem das linhas que o jogador vê).
 */
export function lightSourcesOf(s: TableState, m: BattleMap): LightSource[] {
  const out: LightSource[] = [];
  for (const o of Object.values(m.objects)) if (o.kind === 'light' && o.lit) out.push({ x: o.x, y: o.y, radius: o.radius });
  for (const t of Object.values(m.tokens)) {
    if (t.ref.kind !== 'character' || t.hidden) continue;
    const ch = s.characters[t.ref.id];
    const r = ch ? carriedLight(ch) : 0;
    if (r > 0) out.push({ x: t.x, y: t.y, radius: r });
  }
  return out;
}

/** Como a luz se espalha pelo mapa: fontes, janelas, céu aberto e a luz de fora. */
export function sightOptions(s: TableState, m: BattleMap, objects: MapObject[]): SightOptions {
  const ambient = ambientOf(m);
  return {
    sources: [...lightSourcesOf(s, m), ...windowSources(m, objects, ambient)],
    ...(m.outside ? { outside: m.outside } : {}),
    ambient,
  };
}

/** O que os personagens do jogador enxergam agora (visão escura). */
export function playerSight(s: TableState, m: BattleMap, ownerId: string, g: Grid = playerGrid(m)): Vision {
  return sightArea(g, m.cells, eyesOf(s, m, ownerId), sightOptions(s, m, visibleObjects(m)));
}

/**
 * Grid em que o jogador se move. Fora da visão aberta, só o que ele vê (e as soleiras das
 * portas): nenhum caminho passa pelo escuro.
 */
export function playerMoveGrid(s: TableState, m: BattleMap, ownerId: string): Grid {
  const g = playerGrid(m);
  if (visionOf(m) === 'open') return g;
  const vis = playerSight(s, m, ownerId, g);
  const mult = g.mult.slice();
  for (let i = 0; i < mult.length; i++) if (!vis.seen[i] && !vis.dim.has(i)) mult[i] = 0;
  return { ...g, mult };
}

/** Combatente da fila que o token representa (ficha na fila ou instância de ameaça). */
export function tokenCombatant(s: TableState, tok: MapToken): Combatant | undefined {
  const c = s.combat;
  if (!c || tok.ref.kind === 'creature') return undefined;
  if (tok.ref.kind === 'combatant') return c.order.find((x) => x.id === tok.ref.id);
  return c.order.find((x) => x.ref.kind === 'character' && x.ref.id === tok.ref.id);
}

export interface TokenInfo {
  name: string;
  side: CombatSide;
  /** Deslocamento em metros. */
  movement: number;
  avatar?: AvatarConfig;
  category?: ThreatCategory;
  characterId?: string;
  ownerId?: string;
  /** Oculto dos jogadores: o token ou o combatente dele. */
  hidden: boolean;
}

/** null = o token aponta para algo que não existe mais. */
export function tokenInfo(s: TableState, tok: MapToken): TokenInfo | null {
  if (tok.ref.kind === 'creature') {
    const t = tok.threat;
    return t ? { name: t.name, side: 'threat', movement: t.movement, category: t.category, hidden: tok.hidden } : null;
  }
  const cb = tokenCombatant(s, tok);
  if (tok.ref.kind === 'character') {
    const ch = s.characters[tok.ref.id];
    if (!ch) return null;
    return {
      name: ch.name, side: ch.kind === 'npc' ? 'npc' : 'pc', movement: ch.movement, avatar: avatarFor(ch),
      characterId: ch.id, ownerId: ch.ownerId, hidden: tok.hidden || !!cb?.hidden,
    };
  }
  const t = cb?.threat;
  if (!cb || !t) return null;
  return { name: t.name, side: 'threat', movement: t.movement, category: t.category, hidden: tok.hidden || cb.hidden };
}

export function tokenOfCharacter(m: BattleMap, characterId: string): MapToken | undefined {
  return Object.values(m.tokens).find((t) => t.ref.kind === 'character' && t.ref.id === characterId);
}

/** O combate aberto está neste mapa. */
export const combatOn = (s: TableState, m: BattleMap) => !!s.combat && s.combat.mapId === m.id;

/** É a vez do token no combate deste mapa. */
export function isTokenTurn(s: TableState, m: BattleMap, tok: MapToken): boolean {
  if (!combatOn(s, m)) return false;
  const cur = currentCombatant(s.combat);
  return !!cur && tokenCombatant(s, tok)?.id === cur.id;
}

export interface MoveGate {
  gate: MoveGateKind;
  /** O gasto soma no turno (modo por turnos, na vez do personagem). */
  accumulate: boolean;
  /** Sem limite de alcance: vai a qualquer lugar que vê. */
  unlimited: boolean;
  /** Na vez, com limite: passar do deslocamento vira pedido ao mestre. */
  extra: boolean;
  reason?: string;
}

/**
 * Como o jogador move a ficha agora, conforme o modo de locomoção do mapa.
 * Permissionado: qualquer lugar que vê, com a aprovação do mestre. Livre: o mesmo, sem pedir.
 * Turnos: na própria vez, até o deslocamento sem pedir (além dele, pedindo).
 */
export function moveGate(s: TableState, m: BattleMap, characterId: string): MoveGate {
  const open = { accumulate: false, unlimited: true, extra: false };
  if (s.activeMapId !== m.id) return { ...open, gate: 'blocked', reason: 'Este mapa não está aberto para os jogadores.' };
  if (m.mode === 'livre') return { ...open, gate: 'free' };
  if (m.mode === 'permissao') return { ...open, gate: 'request', reason: 'O mestre aprova cada movimento.' };
  const c = s.combat;
  if (!c || c.mapId !== m.id || !c.round) return { ...open, gate: 'request', reason: 'Fora de combate: peça ao mestre.' };
  const tok = tokenOfCharacter(m, characterId);
  const cb = tok ? tokenCombatant(s, tok) : undefined;
  if (!cb) return { ...open, gate: 'request', reason: 'Fora da fila do combate: peça ao mestre.' };
  if (currentCombatant(c)?.id === cb.id) return { gate: 'free', accumulate: true, unlimited: false, extra: true };
  return { gate: 'blocked', accumulate: false, unlimited: false, extra: false, reason: 'Aguarde sua vez.' };
}

export interface MoveBudget {
  /** Deslocamento inteiro, em quadrados. */
  squares: number;
  spent: number;
  parity: 0 | 1;
  remaining: number;
}

/** Quanto o token ainda anda. Só o modo por turno acumula o gasto. */
export function moveBudget(s: TableState, tok: MapToken, accumulate: boolean): MoveBudget {
  const info = tokenInfo(s, tok);
  const squares = squaresFor(info?.movement ?? 0);
  const c = s.combat;
  const cb = tokenCombatant(s, tok);
  const moved = accumulate && c?.moved && cb && c.moved.combatantId === cb.id && c.moved.round === c.round ? c.moved : null;
  const spent = moved ? Math.min(squares, moved.squares) : 0;
  return { squares, spent, parity: moved?.parity ?? 0, remaining: squares - spent };
}

/** Quadrados com tokens (para não terminar o movimento neles). `visibleOnly`: como o jogador vê. */
export function occupiedCells(s: TableState, m: BattleMap, exceptTokenId: string, visibleOnly: boolean): Set<number> {
  const out = new Set<number>();
  for (const t of Object.values(m.tokens)) {
    if (t.id === exceptTokenId) continue;
    if (visibleOnly) {
      const info = tokenInfo(s, t);
      if (!info || info.hidden) continue;
    }
    out.add(t.y * m.w + t.x);
  }
  return out;
}

export interface PlannedMove {
  token: MapToken;
  path: GridPath;
  budget: MoveBudget;
  accumulate: boolean;
  /** O caminho passa do deslocamento que resta (no modo por turnos, vira pedido). */
  over: boolean;
}

/**
 * Até onde o jogador chega com a ficha: o mesmo cálculo da tela dele. Sem limite de
 * alcance: o deslocamento só decide se o movimento precisa de pedido (modo por turnos).
 */
export function playerReach(s: TableState, m: BattleMap, tok: MapToken, accumulate: boolean): { reach: Reach; budget: MoveBudget } {
  const budget = moveBudget(s, tok, accumulate);
  const owner = tok.ref.kind === 'character' ? s.characters[tok.ref.id]?.ownerId ?? '' : '';
  const reach = reachFrom(playerMoveGrid(s, m, owner), tok, Infinity, budget.parity, occupiedCells(s, m, tok.id, true));
  return { reach, budget };
}

/** Caminho vindo da ação: lista de quadrados inteiros dentro do mapa, de tamanho razoável. */
export function cleanPath(m: Pick<BattleMap, 'w' | 'h'>, raw: unknown): Point[] | { error: string } {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_PATH + 1) return { error: 'Caminho inválido.' };
  const out: Point[] = [];
  for (const p of raw) {
    const x = (p as Point)?.x;
    const y = (p as Point)?.y;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= m.w || y >= m.h) return { error: 'Caminho inválido.' };
    out.push({ x, y });
  }
  return out;
}

/**
 * Confere o movimento do jogador até (x, y): pelo caminho mais curto ou, com `path`,
 * pelo caminho exato que ele traçou. Erro em texto, sem lançar.
 */
export function planPlayerMove(s: TableState, m: BattleMap, characterId: string, x: number, y: number, path?: unknown): PlannedMove | { error: string } {
  const token = tokenOfCharacter(m, characterId);
  const info = token ? tokenInfo(s, token) : null;
  if (!token || !info || info.hidden) return { error: 'Essa ficha não está no mapa.' };
  if (x === token.x && y === token.y) return { error: 'O personagem já está aí.' };
  const { accumulate } = moveGate(s, m, characterId);
  if (path !== undefined) {
    const cells = cleanPath(m, path);
    if ('error' in cells) return cells;
    const first = cells[0];
    const last = cells[cells.length - 1];
    if (first.x !== token.x || first.y !== token.y || last.x !== x || last.y !== y) return { error: 'O caminho não liga o personagem ao destino.' };
    const budget = moveBudget(s, token, accumulate);
    const walked = followPath(playerMoveGrid(s, m, s.characters[characterId]?.ownerId ?? ''), cells, budget.parity);
    if (!walked) return { error: 'O caminho passa por onde não dá para andar.' };
    if (occupiedCells(s, m, token.id, true).has(y * m.w + x)) return { error: 'Já tem alguém nesse quadrado.' };
    return { token, path: { cells, cost: walked.cost, parity: walked.parity }, budget, accumulate, over: walked.cost > budget.remaining };
  }
  const { reach, budget } = playerReach(s, m, token, accumulate);
  if (costTo(reach, x, y) < 0) return { error: 'Não dá para chegar aí.' };
  if (!canEnd(reach, x, y)) return { error: 'Já tem alguém nesse quadrado.' };
  const p = pathTo(reach, x, y)!;
  return { token, path: p, budget, accumulate, over: p.cost > budget.remaining };
}

/** "C7 em Cripta (4 quadrados, 6 m)". */
export function moveText(m: BattleMap, x: number, y: number, cost?: number): string {
  const c = cost !== undefined ? ` (${cost} quadrado${cost === 1 ? '' : 's'}, ${metersFor(cost).toLocaleString('pt-BR')} m)` : '';
  return `${cellLabel(x, y)} em ${m.name}${c}`;
}
