// Motor da mesa: toda mudança passa por aqui, no navegador do mestre.
// Jogador nunca altera estado direto — manda uma GameAction, o motor confere
// dono da ficha, regra e permissão (livre / solicitar / bloqueada) e aplica.
import type {
  Actor, Character, CharacterDraft, CharacterKind, Combat, Combatant, CombatThreat, GameAction, InventoryItem, ItemData, ItemType, LogEntry,
  PendingRequest, TableState, Threat, ThreatData,
} from '../model/types';
import { DEFAULT_DURABILITY, DEFAULT_MOVEMENT, GM_OWNER, ITEM_TYPES } from '../model/types';
import {
  DEFAULT_PERMISSIONS, effectivePermissions, isPermissionKey, isPermissionValue, permissionFor, PERMISSION_LABELS,
} from '../model/permissions';
import { ATTR_KEYS, ATTRIBUTES, fmtMod } from '../rules/attributes';
import { CLASSES } from '../rules/classes';
import { getAbility } from '../rules/abilities';
import { deriveStats } from '../rules/derive';
import { LIMITS, validateDraft, validateLevelPick } from '../rules/validate';
import { cryptoRng, rollExpr, type Rng } from '../rules/dice';
import { combatantInfo, conditionExpired, GROUP_OPS, groupDamageResult, rdFor } from './combat';

export interface EngineCtx {
  now: () => number;
  newId: () => string;
  rng: Rng;
}

export const defaultCtx: EngineCtx = {
  now: () => Date.now(),
  newId: () => {
    const b = new Uint8Array(9);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  },
  rng: cryptoRng,
};

export type DispatchResult =
  | { ok: true; state: TableState; requested?: boolean; message?: string }
  | { ok: false; state: TableState; error: string };

const MAX_LOG = 400;
const MAX_REQUESTS_KEPT = 200;
const MAX_PENDING_PER_PLAYER = 20;
const MAX_CHARACTERS_PER_PLAYER = 10;
const MAX_ITEMS = 200;
const MAX_LIBRARY = 500;
const MAX_NPCS = 200;
const MAX_THREATS = 300;
const MAX_GOLD = 9_999_999;
const MAX_COMBATANTS = 60;
const MAX_CONDITIONS = 12;
const MAX_SPAWN = 20;

// ── Criação ──────────────────────────────────────────────────────────────────

export function newTable(name: string, gmName: string, roomCode: string, ctx: EngineCtx = defaultCtx): TableState {
  const now = ctx.now();
  return {
    schema: 1,
    id: ctx.newId(),
    name: name.trim().slice(0, LIMITS.tableName) || 'Mesa sem nome',
    gmName,
    roomCode,
    createdAt: now,
    updatedAt: now,
    players: {},
    characters: {},
    threats: {},
    itemLibrary: {},
    permissions: { global: { ...DEFAULT_PERMISSIONS }, perPlayer: {} },
    requests: [],
    log: [],
    combat: null,
  };
}

// ── Utilidades ───────────────────────────────────────────────────────────────

class Fail extends Error {}
const fail = (msg: string): never => { throw new Fail(msg); };

function str(v: unknown, max: number, field: string, required = false): string {
  if (typeof v !== 'string') return fail(`${field} inválido.`);
  const s = v.trim();
  if (required && !s) fail(`${field} é obrigatório.`);
  if (s.length > max) fail(`${field} longo demais.`);
  return s;
}

function int(v: unknown, min: number, max: number, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) return fail(`${field} inválido.`);
  if (v < min || v > max) fail(`${field} fora do limite (${min} a ${max}).`);
  return v;
}

function cleanItem(raw: unknown): ItemData {
  if (!raw || typeof raw !== 'object') return fail('Item inválido.');
  const r = raw as Record<string, unknown>;
  const type = (typeof r.type === 'string' && r.type in ITEM_TYPES ? r.type : 'outro') as ItemType;
  const dur = (r.durability && typeof r.durability === 'object' ? r.durability : DEFAULT_DURABILITY[type]) as Record<string, unknown>;
  return {
    name: str(r.name, LIMITS.itemName, 'Nome do item', true),
    type,
    description: str(r.description ?? '', LIMITS.itemText, 'Descrição'),
    damage: str(r.damage ?? '', LIMITS.itemDamage, 'Dano'),
    effects: (() => {
      const e = (r.effects && typeof r.effects === 'object' ? r.effects : {}) as Record<string, unknown>;
      return {
        def: int(e.def ?? r.defBonus ?? 0, -20, 20, 'Bônus de DEF'),
        rdPhysical: int(e.rdPhysical ?? 0, -20, 20, 'Bônus de RD física'),
        rdMagic: int(e.rdMagic ?? 0, -20, 20, 'Bônus de RD mágica'),
      };
    })(),
    value: int(r.value ?? 0, 0, 9_999_999, 'Valor'),
    durability: {
      pv: int(dur.pv, 1, 9999, 'PV do item'),
      rd: int(dur.rd ?? 0, 0, 99, 'RD do item'),
      def: int(dur.def ?? 10, 0, 99, 'Defesa do item'),
    },
  };
}

function cleanDraft(raw: unknown): CharacterDraft {
  const err = validateDraft(raw);
  if (err) fail(err);
  const d = raw as CharacterDraft;
  const attributes = Object.fromEntries(ATTR_KEYS.map((k) => [k, d.attributes[k]])) as CharacterDraft['attributes'];
  return {
    name: d.name.trim(),
    concept: d.concept.trim(),
    notes: d.notes,
    attributes,
    classId: d.classId,
    abilityId: d.abilityId ?? null,
  };
}

function getChar(s: TableState, id: unknown): Character {
  const c = typeof id === 'string' ? s.characters[id] : undefined;
  return c ?? fail('Ficha não encontrada.');
}

function getThreat(s: TableState, id: unknown): Threat {
  const t = typeof id === 'string' ? s.threats[id] : undefined;
  return t ?? fail('Ameaça não encontrada.');
}

function buildCharacter(draft: CharacterDraft, ownerId: string, kind: CharacterKind, ctx: EngineCtx): Character {
  const now = ctx.now();
  const c: Character = {
    id: ctx.newId(),
    kind,
    visible: false,
    ownerId,
    name: draft.name,
    concept: draft.concept,
    attributes: draft.attributes,
    levels: [{ classId: draft.classId, abilityId: draft.abilityId }],
    current: { pv: 0, pe: 0 },
    permanentLoss: { pv: 0, pe: 0 },
    rdBonus: { physical: 0, magic: 0 },
    movement: DEFAULT_MOVEMENT,
    gold: 0,
    inventory: [],
    notes: draft.notes,
    status: kind === 'npc' ? 'approved' : 'pending',
    createdAt: now,
    updatedAt: now,
  };
  const d = deriveStats(c);
  c.current = { pv: d.pvMax, pe: d.peMax };
  return c;
}

const THREAT_ATTR_MIN = -10;
const THREAT_ATTR_MAX = 30;
const MAX_THREAT_ENTRIES = 30;

function cleanThreat(raw: unknown, ctx: EngineCtx): ThreatData {
  if (!raw || typeof raw !== 'object') return fail('Ameaça inválida.');
  const r = raw as Record<string, unknown>;
  const attrsRaw = (r.attributes ?? {}) as Record<string, unknown>;
  const attributes = Object.fromEntries(
    ATTR_KEYS.map((k) => [k, int(attrsRaw[k] ?? 0, THREAT_ATTR_MIN, THREAT_ATTR_MAX, `${ATTRIBUTES[k].short}`)]),
  ) as ThreatData['attributes'];
  const list = (v: unknown, field: string): Record<string, unknown>[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) return fail(`${field} inválido.`);
    if (v.length > MAX_THREAT_ENTRIES) fail(`Máximo de ${MAX_THREAT_ENTRIES} ${field.toLowerCase()}.`);
    return v.map((x) => (x && typeof x === 'object' ? x as Record<string, unknown> : fail(`${field} inválido.`)));
  };
  const id = (v: unknown) => (typeof v === 'string' && /^[\w-]{1,40}$/.test(v) ? v : ctx.newId());
  return {
    name: str(r.name, LIMITS.name, 'Nome', true),
    concept: str(r.concept ?? '', LIMITS.concept, 'Descrição'),
    attributes,
    pvMax: int(r.pvMax, 1, 9999, 'PV máximo'),
    peMax: int(r.peMax ?? 0, 0, 9999, 'PE máximo'),
    def: int(r.def, 0, 99, 'Defesa'),
    von: int(r.von, 0, 99, 'Vontade'),
    rdPhysical: int(r.rdPhysical ?? r.rd ?? 0, 0, 99, 'RD física'),
    rdMagic: int(r.rdMagic ?? 0, 0, 99, 'RD mágica'),
    attacks: list(r.attacks, 'Ataques').map((a) => ({
      id: id(a.id),
      name: str(a.name, LIMITS.itemName, 'Nome do ataque', true),
      bonus: int(a.bonus ?? 0, -20, 50, 'Bônus de ataque'),
      damage: str(a.damage ?? '', LIMITS.itemDamage, 'Dano'),
      notes: str(a.notes ?? '', 300, 'Observação do ataque'),
    })),
    abilities: list(r.abilities, 'Habilidades').map((a) => ({
      id: id(a.id),
      name: str(a.name, LIMITS.itemName, 'Nome da habilidade', true),
      cost: str(a.cost ?? '', 40, 'Custo'),
      text: str(a.text ?? '', LIMITS.itemText, 'Texto da habilidade'),
    })),
    notes: str(r.notes ?? '', LIMITS.notes, 'Anotações'),
  };
}

function log(s: TableState, ctx: EngineCtx, e: Omit<LogEntry, 'id' | 'at'>) {
  s.log.push({ id: ctx.newId(), at: ctx.now(), ...e });
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
}

function clampCurrent(c: Character) {
  const d = deriveStats(c);
  c.current.pv = Math.max(d.deathAt, Math.min(d.pvMax, c.current.pv));
  c.current.pe = Math.max(0, Math.min(d.peMax, c.current.pe));
}

/** Cópia de uma ameaça com PV/PE cheios e o próximo número livre no nome. */
function duplicateThreat(s: TableState, src: Threat, ctx: EngineCtx): Threat {
  if (Object.keys(s.threats).length >= MAX_THREATS) fail('Limite de ameaças atingido.');
  const base = src.name.replace(/ \d+$/, '');
  const same = Object.values(s.threats).filter((t) => t.name.replace(/ \d+$/, '') === base).length;
  const now = ctx.now();
  const copy: Threat = {
    ...structuredClone(src),
    id: ctx.newId(),
    name: `${base} ${same + 1}`.slice(0, LIMITS.name),
    current: { pv: src.pvMax, pe: src.peMax },
    visible: false,
    createdAt: now,
    updatedAt: now,
  };
  s.threats[copy.id] = copy;
  return copy;
}

// ── Combate ──────────────────────────────────────────────────────────────────

function getCombat(s: TableState): Combat {
  return s.combat ?? fail('Nenhum combate aberto.');
}

function getCombatant(c: Combat, id: unknown): Combatant {
  return c.order.find((x) => x.id === id) ?? fail('Combatente não encontrado na fila.');
}

function combatantName(s: TableState, cb: Combatant): string {
  return combatantInfo(s, cb)?.name ?? '?';
}

/** Depois de mexer na fila, mantém o turno em quem estava agindo (ou na posição de reserva). */
function keepTurn(c: Combat, currentId: string | undefined, fallback: number) {
  const idx = currentId ? c.order.findIndex((x) => x.id === currentId) : -1;
  c.turn = idx >= 0 ? idx : Math.max(0, Math.min(fallback, c.order.length - 1));
}

/** Ao começar um turno, encerra as condições cujo ponto final a vez alcançou. */
function startTurn(s: TableState, c: Combat, ctx: EngineCtx) {
  for (const cb of c.order) {
    const ended = cb.conditions.filter((x) => conditionExpired(c, x));
    if (!ended.length) continue;
    cb.conditions = cb.conditions.filter((x) => !ended.includes(x));
    const name = combatantName(s, cb);
    log(s, ctx, {
      kind: 'system', actorName: 'Combate', characterName: name,
      text: `${ended.map((x) => x.name).join(', ')} de ${name} ${ended.length > 1 ? 'acabaram' : 'acabou'}.`, hidden: cb.hidden,
    });
  }
}

/**
 * Quem sai da fila deixa a posição para o seguinte: as condições ancoradas
 * nele passam a terminar na vez de quem ficou no lugar. Se era o último da
 * fila, o lugar dele é o fim da rodada, ou seja, o começo da seguinte.
 */
function reanchorConditions(before: Combatant[], removed: Set<string>) {
  const kept = before.filter((x) => !removed.has(x.id));
  for (const cb of kept) {
    for (const cond of cb.conditions) {
      if (!cond.sourceId || !removed.has(cond.sourceId)) continue;
      const i = before.findIndex((x) => x.id === cond.sourceId);
      const heir = before.slice(i + 1).find((x) => !removed.has(x.id));
      if (heir) {
        cond.sourceId = heir.id;
      } else {
        cond.sourceId = kept[0]?.id ?? null;
        if (cond.endsAtRound !== null) cond.endsAtRound += 1;
      }
    }
  }
}

/** Nova instância de ameaça a partir do molde do livro, com PV/PE cheios. */
function threatInstance(t: Threat, name: string): CombatThreat {
  const { id: _id, current: _c, visible: _v, createdAt: _a, updatedAt: _u, ...data } = structuredClone(t);
  return { ...data, name: name.slice(0, LIMITS.name), current: { pv: t.pvMax, pe: t.peMax } };
}

/**
 * Numera as instâncias de um mesmo molde: uma só fica "Goblin"; a partir de
 * duas, "Goblin 1", "Goblin 2"... sem renumerar quem já tinha número.
 */
function nameInstances(c: Combat, templateId: string, base: string) {
  const group = c.order.filter((x) => x.ref.kind === 'threat' && x.ref.id === templateId && x.threat);
  if (group.length < 2) return;
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`);
  const used = new Set(group.map((x) => Number(re.exec(x.threat!.name)?.[1])).filter((n) => n > 0));
  let next = 1;
  for (const x of group) {
    if (re.test(x.threat!.name)) continue;
    while (used.has(next)) next += 1;
    x.threat!.name = `${base} ${next}`.slice(0, LIMITS.name);
    used.add(next);
  }
}

/** Passa a vez para frente ou para trás, pulando quem está fora de combate. */
function advance(s: TableState, ctx: EngineCtx, dir: 1 | -1) {
  const c = getCombat(s);
  if (!c.round) fail('Inicie o combate primeiro.');
  const n = c.order.length;
  if (!n) fail('A fila está vazia.');
  let idx = c.turn;
  let round = c.round;
  for (let step = 0; step < n; step++) {
    idx += dir;
    if (idx >= n) { idx = 0; round += 1; }
    if (idx < 0) {
      if (round <= 1) fail('Este já é o primeiro turno.');
      idx = n - 1;
      round -= 1;
    }
    if (!combatantInfo(s, c.order[idx])?.down) {
      if (round > c.round) log(s, ctx, { kind: 'system', actorName: 'Combate', text: `Rodada ${round} começou.` });
      c.turn = idx;
      c.round = round;
      if (dir === 1) startTurn(s, c, ctx);
      return;
    }
  }
  fail('Todos os combatentes estão fora de combate.');
}

/** Remove combatentes da fila; se quem agia saiu, a vez passa ao seguinte. */
function removeCombatants(s: TableState, ctx: EngineCtx, drop: (cb: Combatant) => boolean) {
  const c = s.combat;
  if (!c || !c.order.some(drop)) return;
  const cur = c.order[c.turn];
  const removedBefore = c.order.slice(0, c.turn).filter(drop).length;
  const curRemoved = !!cur && drop(cur);
  const before = c.order;
  c.order = c.order.filter((x) => !drop(x));
  reanchorConditions(before, new Set(before.filter(drop).map((x) => x.id)));
  keepTurn(c, curRemoved ? undefined : cur?.id, c.turn - removedBefore);
  if (!curRemoved || !c.round || !c.order.length) return;
  if (combatantInfo(s, c.order[c.turn])?.down) {
    c.turn = (c.turn - 1 + c.order.length) % c.order.length;
    try { advance(s, ctx, 1); } catch (e) { if (!(e instanceof Fail)) throw e; }
  } else {
    startTurn(s, c, ctx);
  }
}

/** Ficha excluída sai da fila. (Ameaças não: a instância independe do molde.) */
function dropCharacterFromCombat(s: TableState, ctx: EngineCtx, characterId: string) {
  removeCombatants(s, ctx, (x) => x.ref.kind === 'character' && x.ref.id === characterId);
}

function itemLabel(it: ItemData, qty?: number) {
  return `${it.name}${qty && qty > 1 ? ` ×${qty}` : ''}`;
}

// ── Autorização (dono / papel) ───────────────────────────────────────────────

const GM_ONLY = new Set<GameAction['type']>([
  'character/approve', 'character/reject', 'character/permanentLoss', 'character/rdBonus', 'character/movement',
  'npc/create', 'npc/visibility',
  'threat/upsert', 'threat/duplicate', 'threat/delete', 'threat/resource', 'threat/visibility',
  'library/upsert', 'library/delete', 'library/give',
  'combat/create', 'combat/end', 'combat/add', 'combat/remove', 'combat/move', 'combat/start', 'combat/next', 'combat/prev',
  'combat/setTurn', 'combat/hidden', 'combat/conditionAdd', 'combat/conditionRemove', 'combat/groupDamage', 'combat/resource',
  'permissions/global', 'permissions/player', 'request/resolve', 'table/rename', 'log/clear',
]);

function authorize(s: TableState, actor: Actor, a: GameAction) {
  if (actor.role === 'gm') return;
  if (GM_ONLY.has(a.type)) fail('Apenas o mestre pode fazer isso.');
  if (a.type === 'roll' && (a.threatId || a.combatantId)) fail('Apenas o mestre rola pelas ameaças.');
  // O PeerJS serializa `undefined` como `null`: os dois significam "sem ficha".
  if ('characterId' in a && a.characterId != null) {
    const c = getChar(s, a.characterId);
    if (c.ownerId !== actor.playerId) fail('Essa ficha não é sua.');
    const needsApproved = !['character/resubmit', 'character/delete'].includes(a.type);
    if (needsApproved && c.status !== 'approved') fail('A ficha ainda não foi aprovada pelo mestre.');
  }
}

// ── Aplicação ────────────────────────────────────────────────────────────────

function apply(s: TableState, actor: Actor, a: GameAction, ctx: EngineCtx): string | undefined {
  const now = ctx.now();
  const who = actor.name;

  switch (a.type) {
    case 'character/create': {
      if (actor.role !== 'player') return fail('Apenas jogadores criam fichas.');
      const draft = cleanDraft(a.draft);
      const mine = Object.values(s.characters).filter((c) => c.ownerId === actor.playerId);
      if (mine.length >= MAX_CHARACTERS_PER_PLAYER) fail('Limite de fichas atingido.');
      const c = buildCharacter(draft, actor.playerId, 'pc', ctx);
      s.characters[c.id] = c;
      log(s, ctx, { kind: 'system', actorName: who, characterName: c.name, text: `enviou a ficha de ${c.name} para aprovação.` });
      return c.id;
    }

    case 'npc/create': {
      const draft = cleanDraft(a.draft);
      const npcs = Object.values(s.characters).filter((c) => c.kind === 'npc');
      if (npcs.length >= MAX_NPCS) fail('Limite de NPCs atingido.');
      const c = buildCharacter(draft, GM_OWNER, 'npc', ctx);
      s.characters[c.id] = c;
      return c.id;
    }

    case 'npc/visibility': {
      const c = getChar(s, a.characterId);
      if (c.kind !== 'npc') fail('Só NPCs têm visibilidade.');
      c.visible = !!a.visible;
      c.updatedAt = now;
      return;
    }

    case 'threat/upsert': {
      const data = cleanThreat(a.data, ctx);
      if (a.threatId) {
        const t = getThreat(s, a.threatId);
        Object.assign(t, data, { updatedAt: now });
        t.current.pv = Math.min(t.current.pv, t.pvMax);
        t.current.pe = Math.min(t.current.pe, t.peMax);
        return t.id;
      }
      if (Object.keys(s.threats).length >= MAX_THREATS) fail('Limite de ameaças atingido.');
      const t: Threat = { ...data, id: ctx.newId(), current: { pv: data.pvMax, pe: data.peMax }, visible: false, createdAt: now, updatedAt: now };
      s.threats[t.id] = t;
      return t.id;
    }

    case 'threat/duplicate': {
      return duplicateThreat(s, getThreat(s, a.threatId), ctx).id;
    }

    case 'threat/delete': {
      const t = getThreat(s, a.threatId);
      delete s.threats[t.id];
      return;
    }

    case 'threat/resource': {
      const t = getThreat(s, a.threatId);
      const pv = int(a.pv, -9999, t.pvMax, 'PV');
      const pe = int(a.pe, 0, t.peMax, 'PE');
      const before = { ...t.current };
      t.current = { pv, pe };
      t.updatedAt = now;
      const parts: string[] = [];
      if (before.pv !== pv) parts.push(`PV ${before.pv} → ${pv}`);
      if (before.pe !== pe) parts.push(`PE ${before.pe} → ${pe}`);
      if (!parts.length) return;
      const reason = a.reason ? str(a.reason, 120, 'Motivo') : '';
      log(s, ctx, { kind: 'resource', actorName: who, characterName: t.name, text: `${t.name}: ${parts.join(', ')}${reason ? ` (${reason})` : ''}.`, hidden: !t.visible });
      return;
    }

    case 'threat/visibility': {
      const t = getThreat(s, a.threatId);
      t.visible = !!a.visible;
      t.updatedAt = now;
      return;
    }

    case 'character/resubmit': {
      const c = getChar(s, a.characterId);
      if (c.status === 'approved') fail('Ficha aprovada não pode ser refeita.');
      const draft = cleanDraft(a.draft);
      Object.assign(c, {
        name: draft.name, concept: draft.concept, notes: draft.notes, attributes: draft.attributes,
        levels: [{ classId: draft.classId, abilityId: draft.abilityId }],
        status: 'pending', rejectReason: undefined, updatedAt: now,
      });
      const d = deriveStats(c);
      c.current = { pv: d.pvMax, pe: d.peMax };
      log(s, ctx, { kind: 'system', actorName: who, characterName: c.name, text: `reenviou a ficha de ${c.name}.` });
      return;
    }

    case 'character/approve': {
      const c = getChar(s, a.characterId);
      if (c.status === 'approved') return;
      c.status = 'approved';
      c.rejectReason = undefined;
      const d = deriveStats(c);
      c.current = { pv: d.pvMax, pe: d.peMax };
      c.updatedAt = now;
      log(s, ctx, { kind: 'system', actorName: who, characterName: c.name, text: `aprovou a ficha de ${c.name}.` });
      return;
    }

    case 'character/reject': {
      const c = getChar(s, a.characterId);
      if (c.status === 'approved') fail('Ficha já aprovada.');
      c.status = 'rejected';
      c.rejectReason = str(a.reason ?? '', 300, 'Motivo');
      c.updatedAt = now;
      log(s, ctx, { kind: 'system', actorName: who, characterName: c.name, text: `devolveu a ficha de ${c.name} para ajustes.` });
      return;
    }

    case 'character/delete': {
      const c = getChar(s, a.characterId);
      if (actor.role === 'player' && c.status === 'approved') fail('Só o mestre pode excluir uma ficha aprovada.');
      delete s.characters[c.id];
      dropCharacterFromCombat(s, ctx, c.id);
      s.requests = s.requests.filter((r) => r.characterId !== c.id || r.status !== 'pending');
      log(s, ctx, { kind: 'system', actorName: who, characterName: c.name, text: `excluiu a ficha de ${c.name}.` });
      return;
    }

    case 'character/permanentLoss': {
      const c = getChar(s, a.characterId);
      c.permanentLoss = { pv: int(a.pv, 0, 999, 'Perda de PV'), pe: int(a.pe, 0, 999, 'Perda de PE') };
      clampCurrent(c);
      c.updatedAt = now;
      log(s, ctx, { kind: 'resource', actorName: who, characterName: c.name, text: `definiu perda permanente de ${c.name}: ${c.permanentLoss.pv} PV, ${c.permanentLoss.pe} PE.` });
      return;
    }

    case 'resource/set': {
      const c = getChar(s, a.characterId);
      const d = deriveStats(c);
      const pv = int(a.pv, d.deathAt - 999, d.pvMax, 'PV');
      const pe = int(a.pe, 0, d.peMax, 'PE');
      const before = { ...c.current };
      c.current = { pv: Math.max(d.deathAt, pv), pe };
      c.updatedAt = now;
      const parts: string[] = [];
      if (before.pv !== c.current.pv) parts.push(`PV ${before.pv} → ${c.current.pv}`);
      if (before.pe !== c.current.pe) parts.push(`PE ${before.pe} → ${c.current.pe}`);
      if (!parts.length) return;
      const reason = a.reason ? str(a.reason, 120, 'Motivo') : '';
      log(s, ctx, { kind: 'resource', actorName: who, characterName: c.name, text: `${c.name}: ${parts.join(', ')}${reason ? ` (${reason})` : ''}.` });
      return;
    }

    case 'ability/use': {
      const c = getChar(s, a.characterId);
      const ab = getAbility(String(a.abilityId));
      if (!ab || !c.levels.some((l) => l.abilityId === ab.id)) fail('Habilidade não encontrada na ficha.');
      if (ab!.passive) fail('Habilidade passiva não precisa ser usada.');
      const d = deriveStats(c);
      let pe = int(a.pe, 0, 999, 'PE');
      let pv = int(a.pv, 0, 999, 'PV');
      let extra = '';
      if (ab!.id === 'cssml') pe = c.current.pe;
      if (pe > c.current.pe) fail(`PE insuficiente (${c.current.pe} disponível).`);
      c.current.pe -= pe;
      if (ab!.id === 'bravura') {
        const gain = pe * 2;
        pv = 0;
        c.current.pv = Math.min(d.pvMax, c.current.pv + gain);
        extra = ` e converteu em ${gain} PV`;
      } else if (ab!.id === 'oracao') {
        const r = rollExpr('1d6', 0, ctx.rng)!;
        c.current.pe = Math.min(d.peMax, c.current.pe + r.total);
        extra = ` e recuperou ${r.total} PE (1d6)`;
      }
      if (pv) c.current.pv = Math.max(d.deathAt, c.current.pv - pv);
      c.updatedAt = now;
      const cost = [pe ? `${pe} PE` : '', pv ? `${pv} PV` : ''].filter(Boolean).join(' e ');
      const note = a.note ? str(a.note, 160, 'Nota') : '';
      log(s, ctx, {
        kind: 'ability', actorName: who, characterName: c.name,
        text: `${c.name} usou ${ab!.name}${cost ? ` (−${cost})` : ''}${extra}${note ? ` — ${note}` : ''}.`,
      });
      return;
    }

    case 'level/up': {
      const c = getChar(s, a.characterId);
      const pick = { classId: a.classId, abilityId: a.abilityId ?? null };
      const err = validateLevelPick(c.attributes, c.levels, pick);
      if (err) fail(err);
      const before = deriveStats(c);
      c.levels.push(pick);
      const after = deriveStats(c);
      c.current.pv += after.pvMax - before.pvMax;
      c.current.pe += after.peMax - before.peMax;
      clampCurrent(c);
      c.updatedAt = now;
      const ab = pick.abilityId ? getAbility(pick.abilityId) : null;
      log(s, ctx, {
        kind: 'level', actorName: who, characterName: c.name,
        text: `${c.name} chegou ao nível ${after.level} (${CLASSES[pick.classId].name}${ab ? `, ${ab.name}` : ''}).`,
      });
      return;
    }

    case 'item/add': {
      const c = getChar(s, a.characterId);
      if (c.inventory.length >= MAX_ITEMS) fail('Inventário cheio.');
      const qty = int(a.qty ?? 1, 1, 999, 'Quantidade');
      let item: ItemData;
      let libraryId: string | undefined;
      if (a.libraryId) {
        // Da biblioteca: vale o item como está lá agora, não o que o cliente mandou.
        const lib = s.itemLibrary[a.libraryId] ?? fail('Item não encontrado na biblioteca.');
        const { id: _id, createdAt: _c, updatedAt: _u, ...data } = lib;
        item = structuredClone(data);
        libraryId = lib.id;
      } else {
        item = cleanItem(a.item);
        if (a.toLibrary) {
          if (Object.keys(s.itemLibrary).length >= MAX_LIBRARY) fail('Biblioteca cheia.');
          libraryId = ctx.newId();
          s.itemLibrary[libraryId] = { ...structuredClone(item), id: libraryId, createdAt: now, updatedAt: now };
        }
      }
      c.inventory.push({ ...item, id: ctx.newId(), qty, equipped: false, pv: item.durability.pv, ...(libraryId ? { libraryId } : {}) });
      c.updatedAt = now;
      log(s, ctx, { kind: 'item', actorName: who, characterName: c.name, text: `${c.name} recebeu ${itemLabel(item, qty)}.` });
      return;
    }

    case 'item/update': {
      const c = getChar(s, a.characterId);
      const it = c.inventory.find((i) => i.id === a.itemId) ?? fail('Item não encontrado.');
      const item = cleanItem(a.item);
      const qty = int(a.qty ?? it.qty, 1, 999, 'Quantidade');
      // Item inteiro continua inteiro se o máximo mudar; avariado mantém o dano.
      const pv = it.pv >= it.durability.pv ? item.durability.pv : Math.min(it.pv, item.durability.pv);
      Object.assign(it, item, { qty, pv });
      c.updatedAt = now;
      log(s, ctx, { kind: 'item', actorName: who, characterName: c.name, text: `${c.name} editou ${itemLabel(item, qty)}.` });
      return;
    }

    case 'item/remove': {
      const c = getChar(s, a.characterId);
      const it = c.inventory.find((i) => i.id === a.itemId) ?? fail('Item não encontrado.');
      c.inventory = c.inventory.filter((i) => i.id !== it.id);
      clampCurrent(c);
      c.updatedAt = now;
      log(s, ctx, { kind: 'item', actorName: who, characterName: c.name, text: `${c.name} descartou ${itemLabel(it, it.qty)}.` });
      return;
    }

    case 'item/equip': {
      const c = getChar(s, a.characterId);
      const it = c.inventory.find((i) => i.id === a.itemId) ?? fail('Item não encontrado.');
      it.equipped = !!a.equipped;
      c.updatedAt = now;
      log(s, ctx, { kind: 'item', actorName: who, characterName: c.name, text: `${c.name} ${it.equipped ? 'equipou' : 'desequipou'} ${it.name}.` });
      return;
    }

    case 'item/durability': {
      const c = getChar(s, a.characterId);
      const it = c.inventory.find((i) => i.id === a.itemId) ?? fail('Item não encontrado.');
      const pv = Math.max(0, Math.min(it.durability.pv, int(a.pv, -9999, 9999, 'PV do item')));
      if (pv === it.pv) return;
      const before = it.pv;
      it.pv = pv;
      c.updatedAt = now;
      const reason = a.reason ? str(a.reason, 120, 'Motivo') : '';
      log(s, ctx, {
        kind: 'item', actorName: who, characterName: c.name,
        text: `${it.name} de ${c.name}: PV ${before} → ${pv}${pv === 0 ? ' (quebrado)' : ''}${reason ? ` (${reason})` : ''}.`,
      });
      return;
    }

    case 'character/rdBonus': {
      const c = getChar(s, a.characterId);
      c.rdBonus = { physical: int(a.physical, -99, 99, 'RD física'), magic: int(a.magic, -99, 99, 'RD mágica') };
      c.updatedAt = now;
      return;
    }

    case 'character/movement': {
      const c = getChar(s, a.characterId);
      c.movement = int(a.movement, 0, 999, 'Deslocamento');
      c.updatedAt = now;
      return;
    }

    case 'gold/set': {
      const c = getChar(s, a.characterId);
      const gold = int(a.gold, 0, MAX_GOLD, 'Ouro');
      if (gold === c.gold) return;
      const before = c.gold;
      c.gold = gold;
      c.updatedAt = now;
      const reason = a.reason ? str(a.reason, 120, 'Motivo') : '';
      log(s, ctx, { kind: 'item', actorName: who, characterName: c.name, text: `${c.name}: ouro ${before} → ${gold}${reason ? ` (${reason})` : ''}.` });
      return;
    }

    case 'notes/update': {
      const c = getChar(s, a.characterId);
      if (typeof a.notes !== 'string' || a.notes.length > LIMITS.notes) fail('Anotações longas demais.');
      c.notes = a.notes;
      c.updatedAt = now;
      return;
    }

    case 'library/upsert': {
      const item = cleanItem(a.item);
      if (a.itemId) {
        const ex = s.itemLibrary[a.itemId] ?? fail('Item não encontrado.');
        Object.assign(ex, item, { updatedAt: now });
      } else {
        if (Object.keys(s.itemLibrary).length >= MAX_LIBRARY) fail('Biblioteca cheia.');
        const id = ctx.newId();
        s.itemLibrary[id] = { ...item, id, createdAt: now, updatedAt: now };
      }
      return;
    }

    case 'library/delete': {
      if (!s.itemLibrary[a.itemId]) fail('Item não encontrado.');
      delete s.itemLibrary[a.itemId];
      return;
    }

    case 'library/give': {
      const lib = s.itemLibrary[a.itemId] ?? fail('Item não encontrado.');
      const c = getChar(s, a.characterId);
      if (c.inventory.length >= MAX_ITEMS) fail('Inventário cheio.');
      const qty = int(a.qty ?? 1, 1, 999, 'Quantidade');
      const { id: _id, createdAt: _c, updatedAt: _u, ...data } = lib;
      const inv: InventoryItem = { ...structuredClone(data), id: ctx.newId(), qty, equipped: false, libraryId: lib.id, pv: data.durability.pv };
      c.inventory.push(inv);
      c.updatedAt = now;
      log(s, ctx, { kind: 'item', actorName: who, characterName: c.name, text: `${c.name} recebeu ${itemLabel(lib, qty)} do mestre.` });
      return;
    }

    case 'permissions/global': {
      if (!isPermissionKey(a.key) || !isPermissionValue(a.value)) fail('Permissão inválida.');
      s.permissions.global[a.key] = a.value;
      return;
    }

    case 'permissions/player': {
      if (!s.players[a.playerId]) fail('Jogador não encontrado.');
      if (!isPermissionKey(a.key) || (a.value !== null && !isPermissionValue(a.value))) fail('Permissão inválida.');
      const p = { ...(s.permissions.perPlayer[a.playerId] ?? {}) };
      if (a.value === null) delete p[a.key];
      else p[a.key] = a.value;
      s.permissions.perPlayer[a.playerId] = p;
      return;
    }

    case 'request/resolve': {
      const req = s.requests.find((r) => r.id === a.requestId) ?? fail('Pedido não encontrado.');
      if (req.status !== 'pending') fail('Pedido já resolvido.');
      req.resolvedAt = now;
      const player = s.players[req.playerId];
      const reqActor: Actor = { role: 'player', playerId: req.playerId, name: player?.name ?? 'Jogador' };
      if (!a.approve) {
        req.status = 'denied';
        log(s, ctx, { kind: 'request', actorName: who, text: `negou o pedido de ${reqActor.name}: ${req.summary}`, playerId: req.playerId });
        return;
      }
      try {
        authorize(s, reqActor, req.action);
        apply(s, reqActor, req.action, ctx);
        req.status = 'approved';
        log(s, ctx, { kind: 'request', actorName: who, text: `aprovou o pedido de ${reqActor.name}: ${req.summary}`, playerId: req.playerId });
      } catch (e) {
        if (!(e instanceof Fail)) throw e;
        req.status = 'denied';
        req.error = e.message;
        log(s, ctx, { kind: 'request', actorName: who, text: `pedido de ${reqActor.name} não pôde ser aplicado: ${e.message}`, playerId: req.playerId });
      }
      return;
    }

    case 'roll': {
      const label = a.label ? str(a.label, 80, 'Rótulo') : '';
      let extra = 0;
      let charName: string | undefined;
      let levelBonus: number | undefined;
      let attr = a.attr;
      if (attr !== undefined && !ATTR_KEYS.includes(attr)) fail('Atributo inválido.');
      if (a.combatantId) {
        const t = getCombatant(getCombat(s), a.combatantId).threat ?? fail('Só ameaças em combate rolam por aqui.');
        charName = t.name;
        if (attr) extra = t.attributes[attr];
      } else if (a.threatId) {
        const t = getThreat(s, a.threatId);
        charName = t.name;
        if (attr) extra = t.attributes[attr];
      } else if (a.characterId) {
        const c = getChar(s, a.characterId);
        charName = c.name;
        if (attr) {
          levelBonus = Math.floor(c.levels.length / 2);
          extra = c.attributes[attr] + levelBonus;
        }
      } else if (attr) {
        fail('Escolha uma ficha para rolar atributo.');
      }
      const expr = typeof a.expr === 'string' && a.expr.trim() ? a.expr.trim() : 'd20';
      const r = rollExpr(expr, extra, ctx.rng) ?? fail('Expressão de dados inválida. Ex.: d20, 2d6+3');
      if (attr) { r.attr = attr; r.levelBonus = levelBonus; }
      if (a.target !== undefined && a.target !== null) r.target = int(a.target, 0, 999, 'Alvo');
      const what = attr ? `teste de ${ATTRIBUTES[attr].name} (${fmtMod(extra)})` : expr;
      log(s, ctx, {
        kind: 'roll', actorName: who, characterName: charName,
        text: `${label ? `${label}: ` : ''}${what}`,
        roll: r,
        hidden: !!a.hidden,
        playerId: actor.role === 'player' ? actor.playerId : undefined,
      });
      return;
    }

    case 'combat/create': {
      if (s.combat) fail('Já existe um combate aberto.');
      s.combat = { id: ctx.newId(), round: 0, turn: 0, order: [], startedAt: now };
      return;
    }

    case 'combat/end': {
      const c = getCombat(s);
      if (c.round > 0) {
        const down = c.order.filter((cb) => combatantInfo(s, cb)?.down).length;
        log(s, ctx, {
          kind: 'system', actorName: who,
          text: `encerrou o combate após ${c.round} rodada${c.round > 1 ? 's' : ''}${down ? ` (${down} fora de combate)` : ''}.`,
        });
      }
      s.combat = null;
      return;
    }

    case 'combat/add': {
      const c = getCombat(s);
      if (!Array.isArray(a.refs) || !a.refs.length) fail('Escolha quem entra no combate.');
      const qty = int(a.qty ?? 1, 1, MAX_SPAWN, 'Quantidade');
      const added: Combatant[] = [];
      const push = (cb: Omit<Combatant, 'id' | 'hidden' | 'conditions'>) => {
        if (c.order.length >= MAX_COMBATANTS) fail(`Máximo de ${MAX_COMBATANTS} combatentes.`);
        const full: Combatant = { id: ctx.newId(), hidden: false, conditions: [], ...cb };
        c.order.push(full);
        added.push(full);
      };
      for (const ref of a.refs) {
        if (ref?.kind === 'character') {
          const ch = getChar(s, ref.id);
          if (ch.status !== 'approved') fail(`A ficha de ${ch.name} ainda não foi aprovada.`);
          if (!c.order.some((x) => x.ref.id === ch.id)) push({ ref: { kind: 'character', id: ch.id } });
        } else if (ref?.kind === 'threat') {
          // O livro é só o molde: cada entidade na fila é uma instância própria.
          const t = getThreat(s, ref.id);
          for (let i = 0; i < qty; i++) push({ ref: { kind: 'threat', id: t.id }, threat: threatInstance(t, t.name) });
          nameInstances(c, t.id, t.name);
        } else {
          fail('Combatente inválido.');
        }
      }
      if (c.round > 0 && added.length) {
        const names = added.map((x) => combatantName(s, x));
        log(s, ctx, { kind: 'system', actorName: who, text: `${names.join(', ')} ${names.length > 1 ? 'entraram' : 'entrou'} no combate.`, hidden: true });
      }
      return;
    }

    case 'combat/resource': {
      const cb = getCombatant(getCombat(s), a.combatantId);
      const t = cb.threat ?? fail('Só ameaças em combate usam este ajuste.');
      const pv = int(a.pv, -9999, t.pvMax, 'PV');
      const pe = int(a.pe, 0, t.peMax, 'PE');
      const before = { ...t.current };
      t.current = { pv, pe };
      const parts: string[] = [];
      if (before.pv !== pv) parts.push(`PV ${before.pv} → ${pv}`);
      if (before.pe !== pe) parts.push(`PE ${before.pe} → ${pe}`);
      if (!parts.length) return;
      const reason = a.reason ? str(a.reason, 120, 'Motivo') : '';
      log(s, ctx, { kind: 'resource', actorName: who, characterName: t.name, text: `${t.name}: ${parts.join(', ')}${reason ? ` (${reason})` : ''}.`, hidden: cb.hidden });
      return;
    }

    case 'combat/remove': {
      getCombat(s);
      const ids = new Set(Array.isArray(a.combatantIds) ? a.combatantIds : []);
      if (!ids.size) fail('Nada para remover.');
      removeCombatants(s, ctx, (x) => ids.has(x.id));
      return;
    }

    case 'combat/move': {
      const c = getCombat(s);
      const cb = getCombatant(c, a.combatantId);
      const to = int(a.to, 0, Math.max(0, c.order.length - 1), 'Posição');
      const cur = c.order[c.turn]?.id;
      c.order = c.order.filter((x) => x.id !== cb.id);
      c.order.splice(to, 0, cb);
      keepTurn(c, cur, c.turn);
      return;
    }

    case 'combat/start': {
      const c = getCombat(s);
      if (c.round > 0) fail('O combate já começou.');
      if (!c.order.length) fail('Adicione alguém à fila primeiro.');
      const first = c.order.findIndex((x) => !combatantInfo(s, x)?.down);
      if (first < 0) fail('Todos os combatentes estão fora de combate.');
      c.round = 1;
      c.turn = first;
      c.startedAt = now;
      log(s, ctx, { kind: 'system', actorName: who, text: 'iniciou o combate. Rodada 1.' });
      startTurn(s, c, ctx);
      return;
    }

    case 'combat/next': {
      advance(s, ctx, 1);
      return;
    }

    case 'combat/prev': {
      advance(s, ctx, -1);
      return;
    }

    case 'combat/endTurn': {
      const c = getCombat(s);
      const cur = c.round ? c.order[c.turn] : undefined;
      // O id evita que um toque duplo pule o turno de outro.
      if (!cur || cur.id !== a.combatantId) fail('Não é a vez desse personagem.');
      if (actor.role === 'player') {
        const ch = cur!.ref.kind === 'character' ? s.characters[cur!.ref.id] : undefined;
        if (!ch || ch.ownerId !== actor.playerId) fail('Não é a vez do seu personagem.');
      }
      advance(s, ctx, 1);
      return;
    }

    case 'combat/setTurn': {
      const c = getCombat(s);
      if (!c.round) fail('Inicie o combate primeiro.');
      const idx = c.order.findIndex((x) => x.id === a.combatantId);
      if (idx < 0) fail('Combatente não encontrado na fila.');
      c.turn = idx;
      startTurn(s, c, ctx);
      return;
    }

    case 'combat/hidden': {
      const cb = getCombatant(getCombat(s), a.combatantId);
      cb.hidden = !!a.hidden;
      return;
    }

    case 'combat/conditionAdd': {
      const c = getCombat(s);
      const name = str(a.name, 40, 'Condição', true);
      const rounds = a.rounds === null || a.rounds === undefined ? null : int(a.rounds, 1, 99, 'Duração');
      const ids = Array.isArray(a.combatantIds) ? a.combatantIds : [];
      if (!ids.length) fail('Escolha quem recebe a condição.');
      // Termina na vez de quem está agindo agora, N rodadas adiante.
      const source = c.round > 0 ? c.order[c.turn] : undefined;
      const timing = {
        rounds,
        sourceId: source?.id ?? null,
        endsAtRound: rounds === null ? null : source ? c.round + rounds : rounds + 1,
      };
      for (const cb of ids.map((id) => getCombatant(c, id))) {
        // A mesma condição de novo renova a duração em vez de duplicar.
        const same = cb.conditions.find((x) => x.name.toLowerCase() === name.toLowerCase());
        if (same) { Object.assign(same, timing); continue; }
        if (cb.conditions.length >= MAX_CONDITIONS) fail(`${combatantName(s, cb)} já tem condições demais.`);
        cb.conditions.push({ id: ctx.newId(), name, ...timing });
      }
      return;
    }

    case 'combat/conditionRemove': {
      const cb = getCombatant(getCombat(s), a.combatantId);
      cb.conditions = cb.conditions.filter((x) => x.id !== a.conditionId);
      return;
    }

    case 'combat/groupDamage': {
      const c = getCombat(s);
      const op = a.op in GROUP_OPS ? a.op : fail('Operação inválida.');
      const amount = int(a.amount, 1, 9999, 'Quantidade');
      const ids = Array.isArray(a.combatantIds) ? [...new Set(a.combatantIds)] : [];
      if (!ids.length) fail('Escolha os alvos.');
      const parts: string[] = [];
      let allHidden = true;
      for (const cb of ids.map((id) => getCombatant(c, id))) {
        const info = combatantInfo(s, cb) ?? fail('Combatente sem ficha.');
        const pv = groupDamageResult(op, amount, info);
        if (!cb.hidden) allHidden = false;
        if (pv === info.pv) continue;
        if (info.character) {
          info.character.current.pv = pv;
          info.character.updatedAt = now;
        } else {
          info.threat!.current.pv = pv;
        }
        const rd = rdFor(op, info);
        parts.push(`${info.name} ${info.pv} → ${pv}${rd ? ` (RD ${rd})` : ''}`);
      }
      if (!parts.length) return;
      const reason = a.reason ? str(a.reason, 120, 'Motivo') : '';
      log(s, ctx, {
        kind: 'resource', actorName: who,
        text: `${GROUP_OPS[op].label} ${amount}${reason ? ` (${reason})` : ''}: ${parts.join('; ')}.`,
        hidden: allHidden,
      });
      return;
    }

    case 'table/rename': {
      s.name = str(a.name, LIMITS.tableName, 'Nome da mesa', true);
      return;
    }

    case 'log/clear': {
      s.log = [];
      return;
    }

    default:
      fail('Ação desconhecida.');
  }
}

// ── Resumo legível (fila de pedidos) ─────────────────────────────────────────

export function describeAction(s: TableState, a: GameAction): string {
  const c = 'characterId' in a && a.characterId ? s.characters[a.characterId] : undefined;
  const n = c?.name ?? 'ficha';
  switch (a.type) {
    case 'resource/set': {
      const parts: string[] = [];
      if (c && c.current.pv !== a.pv) parts.push(`PV ${c.current.pv} → ${a.pv}`);
      if (c && c.current.pe !== a.pe) parts.push(`PE ${c.current.pe} → ${a.pe}`);
      return `${n}: ${parts.join(', ') || 'sem mudança'}${a.reason ? ` (${a.reason})` : ''}`;
    }
    case 'ability/use': {
      const ab = getAbility(a.abilityId);
      const cost = [a.pe ? `${a.pe} PE` : '', a.pv ? `${a.pv} PV` : ''].filter(Boolean).join(' e ');
      return `${n}: usar ${ab?.name ?? a.abilityId}${cost ? ` (−${cost})` : ''}${a.note ? ` — ${a.note}` : ''}`;
    }
    case 'level/up': {
      const ab = a.abilityId ? getAbility(a.abilityId) : null;
      return `${n}: subir para nível ${(c?.levels.length ?? 0) + 1} — ${CLASSES[a.classId]?.name ?? a.classId}${ab ? `, ${ab.name}` : ''}`;
    }
    case 'item/add': {
      const lib = a.libraryId ? s.itemLibrary[a.libraryId] : undefined;
      return `${n}: adicionar ${itemLabel(lib ?? a.item, a.qty)}${lib ? ' (da biblioteca)' : a.toLibrary ? ' (novo, vai para a biblioteca)' : ''}`;
    }
    case 'gold/set': return `${n}: ouro ${c?.gold ?? '?'} → ${a.gold}${a.reason ? ` (${a.reason})` : ''}`;
    case 'item/update': {
      const it = c?.inventory.find((i) => i.id === a.itemId);
      return `${n}: editar ${it?.name ?? 'item'} → ${itemLabel(a.item, a.qty)}`;
    }
    case 'item/remove': {
      const it = c?.inventory.find((i) => i.id === a.itemId);
      return `${n}: remover ${it ? itemLabel(it, it.qty) : 'item'}`;
    }
    case 'item/equip': {
      const it = c?.inventory.find((i) => i.id === a.itemId);
      return `${n}: ${a.equipped ? 'equipar' : 'desequipar'} ${it?.name ?? 'item'}`;
    }
    case 'item/durability': {
      const it = c?.inventory.find((i) => i.id === a.itemId);
      return `${n}: ${it?.name ?? 'item'} PV ${it?.pv ?? '?'} → ${a.pv}${a.reason ? ` (${a.reason})` : ''}`;
    }
    case 'notes/update': return `${n}: editar anotações`;
    default: return a.type;
  }
}

// ── Entrada principal ────────────────────────────────────────────────────────

export function dispatch(state: TableState, actor: Actor, action: GameAction, ctx: EngineCtx = defaultCtx): DispatchResult {
  if (!action || typeof action !== 'object' || typeof (action as GameAction).type !== 'string') {
    return { ok: false, state, error: 'Ação inválida.' };
  }
  const draft: TableState = structuredClone(state);
  try {
    authorize(draft, actor, action);

    if (actor.role === 'player') {
      const key = permissionFor(action);
      if (key) {
        const perm = effectivePermissions(draft.permissions, actor.playerId)[key];
        if (perm === 'blocked') fail(`O mestre bloqueou: ${PERMISSION_LABELS[key].label}.`);
        if (perm === 'request') {
          // Ensaia num clone para não enfileirar pedido que daria erro.
          apply(structuredClone(draft), actor, action, ctx);
          const pending = draft.requests.filter((r) => r.playerId === actor.playerId && r.status === 'pending');
          if (pending.length >= MAX_PENDING_PER_PLAYER) fail('Muitos pedidos pendentes. Aguarde o mestre.');
          const req: PendingRequest = {
            id: ctx.newId(),
            playerId: actor.playerId,
            characterId: (action as { characterId: string }).characterId,
            permission: key,
            action: structuredClone(action),
            summary: describeAction(draft, action),
            status: 'pending',
            createdAt: ctx.now(),
          };
          draft.requests.push(req);
          // Mantém todos os pendentes e só os resolvidos mais recentes.
          const resolved = draft.requests.filter((r) => r.status !== 'pending');
          if (resolved.length > MAX_REQUESTS_KEPT) {
            const drop = new Set(resolved.slice(0, resolved.length - MAX_REQUESTS_KEPT).map((r) => r.id));
            draft.requests = draft.requests.filter((r) => !drop.has(r.id));
          }
          draft.updatedAt = ctx.now();
          return { ok: true, state: draft, requested: true, message: 'Pedido enviado ao mestre.' };
        }
      }
    }

    apply(draft, actor, action, ctx);
    draft.updatedAt = ctx.now();
    return { ok: true, state: draft };
  } catch (e) {
    if (e instanceof Fail) return { ok: false, state, error: e.message };
    console.error(e);
    return { ok: false, state, error: 'Erro interno ao aplicar a ação.' };
  }
}
