// Ações dos mapas. Todas do mestre, menos `map/move`, que o jogador usa
// conforme o modo de locomoção (o portão fica no dispatch; aqui só a regra do movimento).
import { MAX_COMBATANTS, nameInstances, threatInstance } from './combat';
import type {
  Actor, BattleMap, Combatant, DoorState, EdgeRef, MapAction, MapDoor, MapLayout, MapObject, MapToken, MoveMode, PropEffect,
  PropKind, TableState, Terrain, TokenRef,
} from '../model/types';
import { DOOR_STATES, MAP_LIMITS, MOVE_MODES, PROP_EFFECTS, PROP_KINDS, TERRAIN_CHAR, TERRAINS } from '../model/types';
import { blankLayout, edgeIndex, sameEdge, setChars, setWalls, terrainAt, wallAround } from '../model/map';
import { generateMap } from '../rules/mapgen';
import { followPath, pathTo, reachFrom, type Point } from '../rules/grid';
import type { EngineCtx } from './engine';
import { fail, int, log, record, str } from './guard';
import { cleanPath, fullGrid, moveText, planPlayerMove, tokenCombatant } from './maps';

export const MAX_MAPS = 40;
const MAX_OBJECTS = 500;
const MAX_TOKENS = 100;
const MAX_EDGES = 2 * (MAP_LIMITS.max + 1) * MAP_LIMITS.max;
const MAX_NAME = 60;
const MAX_PROP_SIDE = 10;

export function getMap(s: TableState, id: unknown): BattleMap {
  const m = typeof id === 'string' ? s.maps[id] : undefined;
  return m ?? fail('Mapa não encontrado.');
}

const side = (v: unknown, field: string) => int(v, MAP_LIMITS.min, MAP_LIMITS.max, field);

function terrain(v: unknown): Terrain {
  return typeof v === 'string' && v in TERRAINS ? v as Terrain : fail('Terreno inválido.');
}

function cleanEdge(m: Pick<BattleMap, 'w' | 'h'>, raw: unknown): EdgeRef {
  const r = record(raw);
  if (r.o !== 'h' && r.o !== 'v') return fail('Linha inválida.');
  const e: EdgeRef = { o: r.o, x: int(r.x, 0, MAP_LIMITS.max, 'Linha'), y: int(r.y, 0, MAP_LIMITS.max, 'Linha') };
  if (edgeIndex(m, e) < 0) fail('Linha fora do mapa.');
  return e;
}

/** Objeto vindo do editor. `id` vazio ou desconhecido: objeto novo. */
function cleanObject(m: Pick<BattleMap, 'w' | 'h'>, raw: unknown, id: string): MapObject {
  const r = record(raw);
  const hidden = !!r.hidden;
  if (r.kind === 'door') {
    const state = typeof r.state === 'string' && r.state in DOOR_STATES ? r.state as DoorState : 'closed';
    return { id, kind: 'door', edge: cleanEdge(m, r.edge), state, hidden };
  }
  if (r.kind !== 'prop') return fail('Objeto inválido.');
  const prop = typeof r.prop === 'string' && r.prop in PROP_KINDS ? r.prop as PropKind : 'outro';
  const effect = typeof r.effect === 'string' && r.effect in PROP_EFFECTS ? r.effect as PropEffect : PROP_KINDS[prop].effect;
  const w = int(r.w ?? 1, 1, MAX_PROP_SIDE, 'Largura');
  const h = int(r.h ?? 1, 1, MAX_PROP_SIDE, 'Altura');
  const x = int(r.x, 0, m.w - 1, 'Posição');
  const y = int(r.y, 0, m.h - 1, 'Posição');
  if (x + w > m.w || y + h > m.h) fail('O objeto não cabe no mapa.');
  return { id, kind: 'prop', prop, label: str(r.label ?? '', 40, 'Rótulo'), x, y, w, h, effect, hidden };
}

/** Desenho inteiro vindo do editor (desfazer): tamanhos exatos e caracteres válidos. */
function cleanLayout(raw: unknown, ctx: EngineCtx): MapLayout {
  const r = record(raw);
  const w = side(r.w, 'Largura');
  const h = side(r.h, 'Altura');
  const exact = (v: unknown, len: number, re: RegExp, field: string) =>
    (typeof v === 'string' && v.length === len && re.test(v) ? v : fail(`${field} inválido.`));
  const chars = Object.values(TERRAIN_CHAR).map((c) => `\\${c}`).join('');
  const layout: MapLayout = {
    w, h,
    cells: exact(r.cells, w * h, new RegExp(`^[${chars}]*$`), 'Terreno'),
    wallsH: exact(r.wallsH, (h + 1) * w, /^[01]*$/, 'Paredes'),
    wallsV: exact(r.wallsV, h * (w + 1), /^[01]*$/, 'Paredes'),
    objects: {},
  };
  const objs = Object.values(record(r.objects));
  if (objs.length > MAX_OBJECTS) fail('Objetos demais no mapa.');
  for (const o of objs) {
    const oid = record(o).id;
    const id = typeof oid === 'string' && /^[\w-]{1,40}$/.test(oid) && !layout.objects[oid] ? oid : ctx.newId();
    layout.objects[id] = cleanObject(layout, o, id);
  }
  return layout;
}

/** Quadrado livre mais perto de (x, y): passável e sem token. */
function freeCellNear(m: BattleMap, x: number, y: number, skipTokenId?: string): { x: number; y: number } {
  const g = fullGrid(m);
  const taken = new Set(Object.values(m.tokens).filter((t) => t.id !== skipTokenId).map((t) => t.y * m.w + t.x));
  const cx = Math.max(0, Math.min(m.w - 1, x));
  const cy = Math.max(0, Math.min(m.h - 1, y));
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let yy = 0; yy < m.h; yy++) {
    for (let xx = 0; xx < m.w; xx++) {
      const i = yy * m.w + xx;
      if (!g.mult[i] || taken.has(i)) continue;
      const d = Math.max(Math.abs(xx - cx), Math.abs(yy - cy)) * 1000 + Math.abs(xx - cx) + Math.abs(yy - cy);
      if (d < bestD) { bestD = d; best = { x: xx, y: yy }; }
    }
  }
  return best ?? { x: cx, y: cy };
}

/** Depois de trocar o desenho: token fora do mapa ou em quadrado bloqueado vai para o livre mais perto. */
function settleTokens(m: BattleMap) {
  const g = fullGrid(m);
  for (const t of Object.values(m.tokens)) {
    const inside = t.x >= 0 && t.y >= 0 && t.x < m.w && t.y < m.h;
    if (inside && g.mult[t.y * m.w + t.x]) continue;
    Object.assign(t, freeCellNear(m, t.x, t.y, t.id));
  }
}

function applyLayout(m: BattleMap, layout: MapLayout) {
  Object.assign(m, layout);
  settleTokens(m);
}

/** Tira tokens de todos os mapas. */
export function dropTokens(s: TableState, drop: (t: MapToken) => boolean) {
  for (const m of Object.values(s.maps ?? {})) {
    for (const t of Object.values(m.tokens)) if (drop(t)) delete m.tokens[t.id];
  }
}

function tokenIds(m: BattleMap, v: unknown): string[] {
  if (!Array.isArray(v) || !v.length) return fail('Escolha ao menos um token.');
  if (v.length > MAX_TOKENS) fail('Tokens demais de uma vez.');
  return [...new Set(v.map((id) => (typeof id === 'string' && m.tokens[id] ? id : fail('Token não encontrado.'))))];
}

const refKey = (r: TokenRef) => `${r.kind}:${r.id}`;

export function applyMapAction(s: TableState, actor: Actor, a: MapAction, ctx: EngineCtx): string | undefined {
  const now = ctx.now();
  const who = actor.name;

  switch (a.type) {
    case 'map/create': {
      if (Object.keys(s.maps).length >= MAX_MAPS) fail('Limite de mapas atingido.');
      const w = side(a.w, 'Largura');
      const h = side(a.h, 'Altura');
      const layout = blankLayout(w, h, a.fill === undefined ? 'floor' : terrain(a.fill));
      if (a.walls) wallAround(layout);
      const m: BattleMap = {
        id: ctx.newId(), name: str(a.name, MAX_NAME, 'Nome do mapa', true), ...layout,
        tokens: {}, mode: 'livre', createdAt: now, updatedAt: now,
      };
      s.maps[m.id] = m;
      return m.id;
    }

    case 'map/update': {
      const m = getMap(s, a.mapId);
      if (a.name !== undefined) m.name = str(a.name, MAX_NAME, 'Nome do mapa', true);
      if (a.mode !== undefined) {
        if (!(typeof a.mode === 'string' && a.mode in MOVE_MODES)) fail('Modo de locomoção inválido.');
        const changed = m.mode !== a.mode;
        m.mode = a.mode as MoveMode;
        if (changed && s.activeMapId === m.id) {
          log(s, ctx, { kind: 'system', actorName: who, text: `mudou a locomoção em ${m.name} para ${MOVE_MODES[m.mode].label.toLowerCase()}.` });
        }
      }
      m.updatedAt = now;
      return m.id;
    }

    case 'map/delete': {
      const m = getMap(s, a.mapId);
      delete s.maps[m.id];
      if (s.activeMapId === m.id) s.activeMapId = null;
      if (s.combat?.mapId === m.id) s.combat.mapId = null;
      s.requests = s.requests.filter((r) => !(r.status === 'pending' && r.action.type === 'map/move' && r.action.mapId === m.id));
      return;
    }

    case 'map/duplicate': {
      const src = getMap(s, a.mapId);
      if (Object.keys(s.maps).length >= MAX_MAPS) fail('Limite de mapas atingido.');
      const copy: BattleMap = {
        ...structuredClone(src),
        id: ctx.newId(),
        name: `${src.name} (cópia)`.slice(0, MAX_NAME),
        createdAt: now,
        updatedAt: now,
      };
      // Instâncias de ameaça pertencem ao combate, não ao desenho.
      for (const t of Object.values(copy.tokens)) if (t.ref.kind === 'combatant') delete copy.tokens[t.id];
      s.maps[copy.id] = copy;
      return copy.id;
    }

    case 'map/resize': {
      const m = getMap(s, a.mapId);
      const w = side(a.w, 'Largura');
      const h = side(a.h, 'Altura');
      const dx = int(a.dx ?? 0, -MAP_LIMITS.max, MAP_LIMITS.max, 'Deslocamento');
      const dy = int(a.dy ?? 0, -MAP_LIMITS.max, MAP_LIMITS.max, 'Deslocamento');
      const fill = a.fill === undefined ? 'void' : terrain(a.fill);
      const next = blankLayout(w, h, fill);
      const cells = next.cells.split('');
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const ox = x - dx;
          const oy = y - dy;
          if (ox >= 0 && oy >= 0 && ox < m.w && oy < m.h) cells[y * w + x] = TERRAIN_CHAR[terrainAt(m, ox, oy)];
        }
      }
      next.cells = cells.join('');
      const wh = next.wallsH.split('');
      for (let y = 0; y <= h; y++) {
        for (let x = 0; x < w; x++) {
          const i = edgeIndex(m, { o: 'h', x: x - dx, y: y - dy });
          if (i >= 0 && m.wallsH[i] === '1') wh[y * w + x] = '1';
        }
      }
      next.wallsH = wh.join('');
      const wv = next.wallsV.split('');
      for (let y = 0; y < h; y++) {
        for (let x = 0; x <= w; x++) {
          const i = edgeIndex(m, { o: 'v', x: x - dx, y: y - dy });
          if (i >= 0 && m.wallsV[i] === '1') wv[y * (w + 1) + x] = '1';
        }
      }
      next.wallsV = wv.join('');
      for (const o of Object.values(m.objects)) {
        if (o.kind === 'door') {
          const edge = { ...o.edge, x: o.edge.x + dx, y: o.edge.y + dy };
          if (edgeIndex(next, edge) >= 0) next.objects[o.id] = { ...o, edge };
        } else {
          const p = { ...o, x: o.x + dx, y: o.y + dy };
          if (p.x >= 0 && p.y >= 0 && p.x + p.w <= w && p.y + p.h <= h) next.objects[o.id] = p;
        }
      }
      for (const t of Object.values(m.tokens)) { t.x += dx; t.y += dy; }
      applyLayout(m, next);
      m.updatedAt = now;
      return;
    }

    case 'map/paint': {
      const m = getMap(s, a.mapId);
      const t = terrain(a.terrain);
      if (!Array.isArray(a.cells) || !a.cells.length) fail('Nada para pintar.');
      if (a.cells.length > m.w * m.h) fail('Quadrados demais de uma vez.');
      const idx = a.cells.map((i) => int(i, 0, m.w * m.h - 1, 'Quadrado'));
      m.cells = setChars(m.cells, idx, TERRAIN_CHAR[t]);
      m.updatedAt = now;
      return;
    }

    case 'map/walls': {
      const m = getMap(s, a.mapId);
      if (!Array.isArray(a.edges) || !a.edges.length) fail('Nenhuma linha escolhida.');
      if (a.edges.length > MAX_EDGES) fail('Linhas demais de uma vez.');
      const edges = a.edges.map((e) => cleanEdge(m, e));
      setWalls(m, edges, !!a.on);
      // Tirar a parede tira a porta que estava nela.
      if (!a.on) {
        for (const o of Object.values(m.objects)) {
          if (o.kind === 'door' && edges.some((e) => sameEdge(e, o.edge))) delete m.objects[o.id];
        }
      }
      m.updatedAt = now;
      return;
    }

    case 'map/objectUpsert': {
      const m = getMap(s, a.mapId);
      const rawId = record(a.object).id;
      const existing = typeof rawId === 'string' ? m.objects[rawId] : undefined;
      if (!existing && Object.keys(m.objects).length >= MAX_OBJECTS) fail('Limite de objetos no mapa.');
      const o = cleanObject(m, a.object, existing?.id ?? ctx.newId());
      if (existing && existing.kind !== o.kind) fail('Objeto inválido.');
      if (o.kind === 'door') {
        // Uma porta por linha; a porta fica na parede.
        for (const x of Object.values(m.objects)) {
          if (x.kind === 'door' && x.id !== o.id && sameEdge(x.edge, o.edge)) delete m.objects[x.id];
        }
        setWalls(m, [o.edge], true);
      }
      m.objects[o.id] = o;
      m.updatedAt = now;
      return o.id;
    }

    case 'map/objectRemove': {
      const m = getMap(s, a.mapId);
      if (!Array.isArray(a.objectIds) || !a.objectIds.length) fail('Nada para remover.');
      for (const id of a.objectIds) {
        if (typeof id !== 'string' || !m.objects[id]) fail('Objeto não encontrado.');
        delete m.objects[id];
      }
      m.updatedAt = now;
      return;
    }

    case 'map/door': {
      const m = getMap(s, a.mapId);
      const d = (typeof a.objectId === 'string' ? m.objects[a.objectId] : undefined) as MapDoor | undefined;
      if (!d || d.kind !== 'door') fail('Porta não encontrada.');
      if (!(typeof a.state === 'string' && a.state in DOOR_STATES)) fail('Estado de porta inválido.');
      d!.state = a.state;
      m.updatedAt = now;
      return;
    }

    case 'map/generate': {
      const m = getMap(s, a.mapId);
      const seed = int(a.seed, 0, 2 ** 31, 'Semente');
      const d = generateMap(record(a.params), seed);
      const layout = d.layout;
      for (const e of d.doors) {
        const id = ctx.newId();
        layout.objects[id] = { id, kind: 'door', edge: e, state: 'closed', hidden: false };
      }
      for (const pr of d.props) {
        const id = ctx.newId();
        layout.objects[id] = { id, kind: 'prop', ...pr, hidden: false };
      }
      applyLayout(m, layout);
      m.updatedAt = now;
      return;
    }

    case 'map/restore': {
      const m = getMap(s, a.mapId);
      applyLayout(m, cleanLayout(a.layout, ctx));
      m.updatedAt = now;
      return;
    }

    case 'map/link': {
      const c = s.combat ?? fail('Nenhum combate aberto.');
      c.mapId = a.mapId === null ? null : getMap(s, a.mapId).id;
      c.moved = undefined;
      return;
    }

    case 'map/activate': {
      if (a.mapId === null) {
        s.activeMapId = null;
        return;
      }
      const m = getMap(s, a.mapId);
      if (s.activeMapId === m.id) return;
      s.activeMapId = m.id;
      log(s, ctx, { kind: 'system', actorName: who, text: `abriu o mapa ${m.name}.` });
      return;
    }

    case 'map/tokenPlace': {
      const m = getMap(s, a.mapId);
      if (!Array.isArray(a.refs) || !a.refs.length) fail('Escolha quem entra no mapa.');
      if (a.refs.length > MAX_TOKENS) fail('Tokens demais de uma vez.');
      const at = a.x !== undefined && a.y !== undefined
        ? { x: int(a.x, 0, m.w - 1, 'Posição'), y: int(a.y, 0, m.h - 1, 'Posição') }
        : null;
      const have = new Map(Object.values(m.tokens).map((t) => [refKey(t.ref), t]));
      let last: string | undefined;
      for (const raw of a.refs) {
        const r = record(raw);
        let ref: TokenRef;
        if (r.kind === 'character') {
          const ch = typeof r.id === 'string' ? s.characters[r.id] : undefined;
          if (!ch) fail('Ficha não encontrada.');
          if (ch!.status !== 'approved') fail(`A ficha de ${ch!.name} ainda não foi aprovada.`);
          ref = { kind: 'character', id: ch!.id };
        } else if (r.kind === 'combatant') {
          const cb = s.combat?.order.find((x) => x.id === r.id);
          if (!cb) fail('Combatente não encontrado na fila.');
          // Ficha na fila vira token da ficha (o mesmo token dentro e fora do combate).
          ref = cb!.ref.kind === 'character' ? { kind: 'character', id: cb!.ref.id } : { kind: 'combatant', id: cb!.id };
        } else if (r.kind === 'threat') {
          // Molde do livro: entra na fila do combate (abre um em preparação, ligado a este mapa, se não houver).
          const t = typeof r.id === 'string' ? s.threats[r.id] : undefined;
          if (!t) fail('Ameaça não encontrada.');
          if (!s.combat) s.combat = { id: ctx.newId(), round: 0, turn: 0, order: [], startedAt: now, mapId: m.id };
          const c = s.combat;
          if (c.order.length >= MAX_COMBATANTS) fail(`Máximo de ${MAX_COMBATANTS} combatentes.`);
          const cb: Combatant = { id: ctx.newId(), hidden: false, conditions: [], ref: { kind: 'threat', id: t!.id }, threat: threatInstance(t!, t!.name) };
          c.order.push(cb);
          nameInstances(c, t!.id, t!.name);
          if (c.round > 0) log(s, ctx, { kind: 'system', actorName: who, text: `${cb.threat!.name} entrou no combate.`, hidden: true });
          ref = { kind: 'combatant', id: cb.id };
        } else {
          return fail('Token inválido.');
        }
        const ex = have.get(refKey(ref));
        if (ex) {
          if (at && a.refs.length === 1) Object.assign(ex, freeCellNear(m, at.x, at.y, ex.id));
          last = ex.id;
          continue;
        }
        if (Object.keys(m.tokens).length >= MAX_TOKENS) fail(`Máximo de ${MAX_TOKENS} tokens no mapa.`);
        const pos = freeCellNear(m, at?.x ?? Math.floor(m.w / 2), at?.y ?? Math.floor(m.h / 2));
        const tok: MapToken = { id: ctx.newId(), ref, ...pos, hidden: false };
        m.tokens[tok.id] = tok;
        have.set(refKey(ref), tok);
        last = tok.id;
      }
      m.updatedAt = now;
      return last;
    }

    case 'map/tokenRemove': {
      const m = getMap(s, a.mapId);
      for (const id of tokenIds(m, a.tokenIds)) delete m.tokens[id];
      return;
    }

    case 'map/tokenHidden': {
      const m = getMap(s, a.mapId);
      for (const id of tokenIds(m, a.tokenIds)) m.tokens[id].hidden = !!a.hidden;
      return;
    }

    case 'map/move': {
      const m = getMap(s, a.mapId);
      const x = int(a.x, 0, m.w - 1, 'Posição');
      const y = int(a.y, 0, m.h - 1, 'Posição');

      if (actor.role === 'gm') {
        // Mestre: teletransporta, sem limite. Na vez do token, o caminho conta no turno.
        const tok = (typeof a.tokenId === 'string' ? m.tokens[a.tokenId] : undefined) ?? fail('Token não encontrado.');
        if (tok.x === x && tok.y === y) return;
        const c = s.combat;
        const cb = tokenCombatant(s, tok);
        const turn = !!(c && c.round && c.mapId === m.id && m.mode === 'turno' && cb && c.order[c.turn]?.id === cb.id);
        const before = turn && c!.moved?.combatantId === cb!.id && c!.moved.round === c!.round ? c!.moved : null;
        const g = fullGrid(m);
        // Caminho traçado pelo mestre (exato) ou o mais curto; sem caminho possível, teletransporta.
        let p: { cells: Point[]; cost: number; parity: 0 | 1 } | null = null;
        if (a.path !== undefined) {
          const cells = cleanPath(m, a.path);
          if ('error' in cells) return fail(cells.error);
          const first = cells[0];
          const last = cells[cells.length - 1];
          if (first.x !== tok.x || first.y !== tok.y || last.x !== x || last.y !== y) fail('O caminho não liga o token ao destino.');
          const walked = followPath(g, cells, before?.parity ?? 0);
          if (!walked) fail('O caminho passa por onde não dá para andar.');
          p = { cells, ...walked! };
        } else {
          p = pathTo(reachFrom(g, tok, Infinity, before?.parity ?? 0), x, y);
        }
        if (turn && p) c!.moved = { combatantId: cb!.id, round: c!.round, squares: (before?.squares ?? 0) + p.cost, parity: p.parity };
        tok.x = x;
        tok.y = y;
        if (p) tok.trail = p.cells; else delete tok.trail;
        return;
      }

      if (typeof a.characterId !== 'string') return fail('Escolha a ficha.');
      if (s.activeMapId !== m.id) fail('Este mapa não está aberto.');
      const plan = planPlayerMove(s, m, a.characterId, x, y, a.path);
      if ('error' in plan) return fail(plan.error);
      const { token, path, budget, accumulate } = plan;
      token.x = x;
      token.y = y;
      token.trail = path.cells;
      const c = s.combat;
      const cb = tokenCombatant(s, token);
      if (accumulate && c && cb) {
        c.moved = { combatantId: cb.id, round: c.round, squares: budget.spent + path.cost, parity: path.parity };
      }
      return;
    }

    default:
      return fail('Ação desconhecida.');
  }
}

/** Resumo do pedido de movimento. */
export function describeMapMove(s: TableState, a: Extract<MapAction, { type: 'map/move' }>): string {
  const m = s.maps[a.mapId];
  const ch = a.characterId ? s.characters[a.characterId] : undefined;
  const n = ch?.name ?? 'ficha';
  if (!m) return `${n}: mover no mapa`;
  const plan = a.characterId ? planPlayerMove(s, m, a.characterId, a.x, a.y, a.path) : null;
  const exact = a.path !== undefined ? ', caminho traçado' : '';
  return `${n}: mover para ${moveText(m, a.x, a.y, plan && !('error' in plan) ? plan.path.cost : undefined)}${exact}`;
}

