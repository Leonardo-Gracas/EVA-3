// Motor da mesa: toda mudança passa por aqui, no navegador do mestre.
// Jogador nunca altera estado direto — manda uma GameAction, o motor confere
// dono da ficha, regra e permissão (livre / solicitar / bloqueada) e aplica.
import type {
  Actor, Character, CharacterDraft, GameAction, InventoryItem, ItemData, ItemType, LogEntry,
  PendingRequest, TableState,
} from '../model/types';
import { ITEM_TYPES } from '../model/types';
import {
  DEFAULT_PERMISSIONS, effectivePermissions, isPermissionKey, isPermissionValue, permissionFor, PERMISSION_LABELS,
} from '../model/permissions';
import { ATTR_KEYS, ATTRIBUTES, fmtMod } from '../rules/attributes';
import { CLASSES } from '../rules/classes';
import { getAbility } from '../rules/abilities';
import { deriveStats } from '../rules/derive';
import { LIMITS, validateDraft, validateLevelPick } from '../rules/validate';
import { cryptoRng, rollExpr, type Rng } from '../rules/dice';

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
    itemLibrary: {},
    permissions: { global: { ...DEFAULT_PERMISSIONS }, perPlayer: {} },
    requests: [],
    log: [],
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
  return {
    name: str(r.name, LIMITS.itemName, 'Nome do item', true),
    type,
    description: str(r.description ?? '', LIMITS.itemText, 'Descrição'),
    damage: str(r.damage ?? '', LIMITS.itemDamage, 'Dano'),
    defBonus: int(r.defBonus ?? 0, -20, 20, 'Bônus de DEF'),
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

function log(s: TableState, ctx: EngineCtx, e: Omit<LogEntry, 'id' | 'at'>) {
  s.log.push({ id: ctx.newId(), at: ctx.now(), ...e });
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
}

function clampCurrent(c: Character) {
  const d = deriveStats(c);
  c.current.pv = Math.max(d.deathAt, Math.min(d.pvMax, c.current.pv));
  c.current.pe = Math.max(0, Math.min(d.peMax, c.current.pe));
}

function itemLabel(it: ItemData, qty?: number) {
  return `${it.name}${qty && qty > 1 ? ` ×${qty}` : ''}`;
}

// ── Autorização (dono / papel) ───────────────────────────────────────────────

const GM_ONLY = new Set<GameAction['type']>([
  'character/approve', 'character/reject', 'character/permanentLoss',
  'library/upsert', 'library/delete', 'library/give',
  'permissions/global', 'permissions/player', 'request/resolve', 'table/rename', 'log/clear',
]);

function authorize(s: TableState, actor: Actor, a: GameAction) {
  if (actor.role === 'gm') return;
  if (GM_ONLY.has(a.type)) fail('Apenas o mestre pode fazer isso.');
  if ('characterId' in a && a.characterId !== undefined) {
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
      const c: Character = {
        id: ctx.newId(),
        ownerId: actor.playerId,
        name: draft.name,
        concept: draft.concept,
        attributes: draft.attributes,
        levels: [{ classId: draft.classId, abilityId: draft.abilityId }],
        current: { pv: 0, pe: 0 },
        permanentLoss: { pv: 0, pe: 0 },
        inventory: [],
        notes: draft.notes,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      const d = deriveStats(c);
      c.current = { pv: d.pvMax, pe: d.peMax };
      s.characters[c.id] = c;
      log(s, ctx, { kind: 'system', actorName: who, characterName: c.name, text: `enviou a ficha de ${c.name} para aprovação.` });
      return c.id;
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
      const item = cleanItem(a.item);
      const qty = int(a.qty ?? 1, 1, 999, 'Quantidade');
      c.inventory.push({ ...item, id: ctx.newId(), qty, equipped: false });
      c.updatedAt = now;
      log(s, ctx, { kind: 'item', actorName: who, characterName: c.name, text: `${c.name} recebeu ${itemLabel(item, qty)}.` });
      return;
    }

    case 'item/update': {
      const c = getChar(s, a.characterId);
      const it = c.inventory.find((i) => i.id === a.itemId) ?? fail('Item não encontrado.');
      const item = cleanItem(a.item);
      const qty = int(a.qty ?? it.qty, 1, 999, 'Quantidade');
      Object.assign(it, item, { qty });
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
      const inv: InventoryItem = { ...data, id: ctx.newId(), qty, equipped: false, libraryId: lib.id };
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
      if (a.characterId) {
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
    case 'item/add': return `${n}: adicionar ${itemLabel(a.item, a.qty)}`;
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
