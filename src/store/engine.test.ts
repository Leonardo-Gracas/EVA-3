import { describe, expect, it } from 'vitest';
import { dispatch, newTable, type EngineCtx } from './engine';
import { buildPlayerView } from './views';
import { migrate } from './persistence';
import { deriveStats } from '../rules/derive';
import type { Actor, CharacterDraft, TableState } from '../model/types';
import { emptyAttributes } from '../rules/attributes';

let n = 0;
const ctx: EngineCtx = { now: () => 1000, newId: () => `id${++n}`, rng: () => 3 };
const gm: Actor = { role: 'gm', name: 'Mestre' };
const p1: Actor = { role: 'player', playerId: 'p1', name: 'Ana' };
const p2: Actor = { role: 'player', playerId: 'p2', name: 'Beto' };

const draft: CharacterDraft = {
  name: 'Mizael', concept: 'Padre', notes: '',
  attributes: { ...emptyAttributes(), FE: 3, CON: 2, PRE: 2 }, classId: 'acolito', abilityId: 'fortificado',
};

function setup(): { s: TableState; cid: string } {
  let s = newTable('Mesa', 'Mestre', 'ABCDEF', ctx);
  s.players.p1 = { id: 'p1', name: 'Ana', secretHash: 'x', firstSeen: 0, lastSeen: 0 };
  s.players.p2 = { id: 'p2', name: 'Beto', secretHash: 'y', firstSeen: 0, lastSeen: 0 };
  const r = dispatch(s, p1, { type: 'character/create', draft }, ctx);
  expect(r.ok).toBe(true);
  s = r.state;
  const cid = Object.keys(s.characters)[0];
  return { s, cid };
}

describe('motor', () => {
  it('ficha nasce pendente e só o mestre aprova', () => {
    const { s, cid } = setup();
    expect(s.characters[cid].status).toBe('pending');
    // PV: 10+2 + Fortificado 2+3 = 17
    expect(s.characters[cid].current.pv).toBe(17);
    expect(dispatch(s, p1, { type: 'character/approve', characterId: cid }, ctx).ok).toBe(false);
    const r = dispatch(s, gm, { type: 'character/approve', characterId: cid }, ctx);
    expect(r.ok && r.state.characters[cid].status).toBe('approved');
  });

  it('jogador não mexe em ficha alheia nem em ficha pendente', () => {
    const { s, cid } = setup();
    expect(dispatch(s, p1, { type: 'resource/set', characterId: cid, pv: 5, pe: 2 }, ctx)).toMatchObject({ ok: false, error: /aprovada/ });
    const ok = dispatch(s, gm, { type: 'character/approve', characterId: cid }, ctx).state;
    expect(dispatch(ok, p2, { type: 'resource/set', characterId: cid, pv: 5, pe: 2 }, ctx)).toMatchObject({ ok: false, error: /não é sua/ });
  });

  it('livre / solicitar / bloqueada', () => {
    const { s: s0, cid } = setup();
    let s = dispatch(s0, gm, { type: 'character/approve', characterId: cid }, ctx).state;
    // livre (padrão para PV/PE)
    let r = dispatch(s, p1, { type: 'resource/set', characterId: cid, pv: 10, pe: 2 }, ctx);
    expect(r.ok && r.state.characters[cid].current.pv).toBe(10);
    s = r.state;
    // solicitar
    s = dispatch(s, gm, { type: 'permissions/player', playerId: 'p1', key: 'resource_change', value: 'request' }, ctx).state;
    r = dispatch(s, p1, { type: 'resource/set', characterId: cid, pv: 4, pe: 2 }, ctx);
    expect(r.ok && r.requested).toBe(true);
    s = r.state;
    expect(s.characters[cid].current.pv).toBe(10);
    const req = s.requests[0];
    expect(req.summary).toContain('PV 10 → 4');
    r = dispatch(s, gm, { type: 'request/resolve', requestId: req.id, approve: true }, ctx);
    expect(r.ok && r.state.characters[cid].current.pv).toBe(4);
    s = r.state;
    // bloqueada
    s = dispatch(s, gm, { type: 'permissions/global', key: 'item_add', value: 'blocked' }, ctx).state;
    r = dispatch(s, p1, { type: 'item/add', characterId: cid, qty: 1, item: { name: 'Terço', type: 'catalisador_sagrado', description: '', damage: '', effects: { def: 0, rdPhysical: 0, rdMagic: 0 }, value: 5, durability: { pv: 5, rd: 2, def: 13 } } }, ctx);
    expect(r).toMatchObject({ ok: false, error: /bloqueou/ });
  });

  it('usar habilidade gasta PE e sobe de nível', () => {
    const { s: s0, cid } = setup();
    let s = dispatch(s0, gm, { type: 'character/approve', characterId: cid }, ctx).state;
    s = dispatch(s, gm, { type: 'level/up', characterId: cid, classId: 'acolito', abilityId: 'devocao' }, ctx).state;
    const c = s.characters[cid];
    expect(c.levels.length).toBe(2);
    // PE: 2 + (2+FÉ 3) = 7
    expect(c.current.pe).toBe(7);
    const r = dispatch(s, p1, { type: 'ability/use', characterId: cid, abilityId: 'devocao', pe: 1, pv: 0 }, ctx);
    expect(r.ok && r.state.characters[cid].current.pe).toBe(6);
    expect(dispatch(s, p1, { type: 'ability/use', characterId: cid, abilityId: 'devocao', pe: 99, pv: 0 }, ctx)).toMatchObject({ ok: false });
  });

  it('visão do jogador esconde fichas e rolagens alheias', () => {
    const { s: s0, cid } = setup();
    let s = dispatch(s0, gm, { type: 'character/approve', characterId: cid }, ctx).state;
    s = dispatch(s, gm, { type: 'roll', expr: '1d20', hidden: true }, ctx).state;
    const v2 = buildPlayerView(s, 'p2', new Set(['p1']));
    expect(v2.myCharacters).toHaveLength(0);
    expect(v2.others[0]).not.toHaveProperty('attributes');
    expect(v2.log.some((e) => e.kind === 'roll')).toBe(false);
  });

  it('NPC: só o mestre cria, nasce aprovado e fica oculto até liberar', () => {
    const { s: s0 } = setup();
    expect(dispatch(s0, p1, { type: 'npc/create', draft }, ctx)).toMatchObject({ ok: false });
    let s = dispatch(s0, gm, { type: 'npc/create', draft: { ...draft, name: 'Padre Otávio' } }, ctx).state;
    const npc = Object.values(s.characters).find((c) => c.kind === 'npc')!;
    expect(npc.status).toBe('approved');
    expect(buildPlayerView(s, 'p2', new Set()).others.some((c) => c.id === npc.id)).toBe(false);
    s = dispatch(s, gm, { type: 'npc/visibility', characterId: npc.id, visible: true }, ctx).state;
    expect(buildPlayerView(s, 'p2', new Set()).others.find((c) => c.id === npc.id)?.ownerName).toBe('NPC');
    expect(dispatch(s, p1, { type: 'resource/set', characterId: npc.id, pv: 1, pe: 0 }, ctx)).toMatchObject({ ok: false, error: /não é sua/ });
    expect(dispatch(s, gm, { type: 'level/up', characterId: npc.id, classId: 'acolito', abilityId: 'devocao' }, ctx).ok).toBe(true);
  });

  it('Ameaça: valores livres, duplicar, rolar e PV', () => {
    const { s: s0 } = setup();
    const data = {
      name: 'Possuído', concept: 'Corpo tomado', notes: '',
      attributes: { FOR: 8, CON: 6, DES: 2, FE: -3, INT: 0, PRE: 5 },
      pvMax: 60, peMax: 10, def: 14, von: 9, rdPhysical: 2, rdMagic: 0,
      attacks: [{ id: 'a1', name: 'Garras', bonus: 6, damage: '2d6+8', notes: '' }],
      abilities: [{ id: 'h1', name: 'Grito', cost: '3 PE', text: 'Atordoa.' }],
    };
    expect(dispatch(s0, p1, { type: 'threat/upsert', data }, ctx)).toMatchObject({ ok: false });
    let s = dispatch(s0, gm, { type: 'threat/upsert', data }, ctx).state;
    const t = Object.values(s.threats)[0];
    expect(t.current).toEqual({ pv: 60, pe: 10 });
    s = dispatch(s, gm, { type: 'threat/duplicate', threatId: t.id }, ctx).state;
    expect(Object.values(s.threats).map((x) => x.name)).toContain('Possuído 2');
    s = dispatch(s, gm, { type: 'roll', expr: 'd20', threatId: t.id, attr: 'FOR' }, ctx).state;
    expect(s.log[s.log.length - 1]?.roll?.total).toBe(3 + 8);
    s = dispatch(s, gm, { type: 'threat/resource', threatId: t.id, pv: -5, pe: 4 }, ctx).state;
    expect(s.threats[t.id].current).toEqual({ pv: -5, pe: 4 });
    expect(dispatch(s, gm, { type: 'threat/upsert', data: { ...data, attributes: { ...data.attributes, FOR: 99 } } }, ctx).ok).toBe(false);
    expect(buildPlayerView(s, 'p1', new Set()).threats).toHaveLength(0);
    expect(dispatch(s, p1, { type: 'roll', expr: 'd20', threatId: t.id }, ctx).ok).toBe(false);
  });

  it('itens: durabilidade, quebrado não protege, RD extra', () => {
    const { s: s0, cid } = setup();
    let s = dispatch(s0, gm, { type: 'character/approve', characterId: cid }, ctx).state;
    const shield = { name: 'Escudo', type: 'escudo' as const, description: '', damage: '', effects: { def: 2, rdPhysical: 1, rdMagic: 0 }, value: 30, durability: { pv: 15, rd: 8, def: 10 } };
    s = dispatch(s, gm, { type: 'item/add', characterId: cid, item: shield, qty: 1 }, ctx).state;
    const it = s.characters[cid].inventory[0];
    expect(it.pv).toBe(15);
    s = dispatch(s, gm, { type: 'item/equip', characterId: cid, itemId: it.id, equipped: true }, ctx).state;
    expect(deriveStats(s.characters[cid]).def).toBe(12);
    s = dispatch(s, p1, { type: 'item/durability', characterId: cid, itemId: it.id, pv: -4 }, ctx).state;
    expect(s.characters[cid].inventory[0].pv).toBe(0);
    expect(deriveStats(s.characters[cid]).def).toBe(10);
    s = dispatch(s, gm, { type: 'character/rdBonus', characterId: cid, physical: 3, magic: 1 }, ctx).state;
    // escudo quebrado: só o ajuste do mestre conta
    let d = deriveStats(s.characters[cid]);
    expect([d.rdPhysical, d.rdMagic]).toEqual([3, 1]);
    // reparado e equipado: soma DEF +2 e RD física +1 do escudo
    s = dispatch(s, gm, { type: 'item/durability', characterId: cid, itemId: it.id, pv: 15 }, ctx).state;
    d = deriveStats(s.characters[cid]);
    expect([d.def, d.rdPhysical, d.rdMagic]).toEqual([12, 4, 1]);
    // desequipado: nenhum efeito
    s = dispatch(s, gm, { type: 'item/equip', characterId: cid, itemId: it.id, equipped: false }, ctx).state;
    d = deriveStats(s.characters[cid]);
    expect([d.def, d.rdPhysical]).toEqual([10, 3]);
    expect(dispatch(s, p1, { type: 'character/rdBonus', characterId: cid, physical: 9, magic: 9 }, ctx).ok).toBe(false);
  });

  it('migra itens e ameaças antigos', () => {
    const { s: s0, cid } = setup();
    const old = structuredClone(s0) as any;
    old.characters[cid].inventory = [
      { id: 'x', name: 'Faca', type: 'arma', description: '', damage: '1d4', defBonus: 0, qty: 1, equipped: false },
      { id: 'y', name: 'Terço', type: 'catalisador', description: '', damage: '', defBonus: 1, qty: 1, equipped: true },
    ];
    delete old.characters[cid].rdBonus;
    old.threats = { t1: { id: 't1', name: 'Velho', rd: 4, attributes: {}, attacks: [], abilities: [], current: { pv: 1, pe: 0 } } };
    const m = migrate(old);
    expect(m.characters[cid].inventory[0]).toMatchObject({ value: 0, pv: 10, durability: { pv: 10, rd: 5, def: 12 } });
    expect(m.characters[cid].inventory[1]).toMatchObject({ type: 'catalisador_sagrado', effects: { def: 1, rdPhysical: 0, rdMagic: 0 } });
    expect(m.characters[cid].inventory[1]).not.toHaveProperty('defBonus');
    expect(m.threats.t1).toMatchObject({ rdPhysical: 4, rdMagic: 0 });
    expect(m.characters[cid].rdBonus).toEqual({ physical: 0, magic: 0 });
    expect(m.characters[cid]).toMatchObject({ movement: 9, gold: 0 });
  });

  it('item da biblioteca e item novo que vai para a biblioteca', () => {
    const { s: s0, cid } = setup();
    let s = dispatch(s0, gm, { type: 'character/approve', characterId: cid }, ctx).state;
    s = dispatch(s, gm, { type: 'permissions/global', key: 'item_add', value: 'free' }, ctx).state;
    const espada = { name: 'Espada', type: 'arma' as const, description: '', damage: '1d8', effects: { def: 0, rdPhysical: 0, rdMagic: 0 }, value: 10, durability: { pv: 10, rd: 5, def: 12 } };
    s = dispatch(s, gm, { type: 'library/upsert', item: espada }, ctx).state;
    const libId = Object.keys(s.itemLibrary)[0];
    expect(buildPlayerView(s, 'p1', new Set()).library.map((i) => i.name)).toEqual(['Espada']);
    // Da biblioteca: o motor usa o item da biblioteca, não o que o cliente mandou.
    let r = dispatch(s, p1, { type: 'item/add', characterId: cid, item: { ...espada, damage: '9d99' }, qty: 2, libraryId: libId }, ctx);
    expect(r.ok).toBe(true);
    s = r.state;
    expect(s.characters[cid].inventory[0]).toMatchObject({ name: 'Espada', damage: '1d8', qty: 2, libraryId: libId });
    // Criado no inventário: também entra na biblioteca.
    r = dispatch(s, p1, { type: 'item/add', characterId: cid, item: { ...espada, name: 'Adaga', damage: '1d4' }, qty: 1, toLibrary: true }, ctx);
    s = r.state;
    const adaga = Object.values(s.itemLibrary).find((i) => i.name === 'Adaga');
    expect(adaga).toBeDefined();
    expect(s.characters[cid].inventory[1]).toMatchObject({ name: 'Adaga', libraryId: adaga!.id });
    expect(dispatch(s, p1, { type: 'item/add', characterId: cid, item: espada, qty: 1, libraryId: 'nao-existe' }, ctx).ok).toBe(false);
  });

  it('ouro tem permissão própria e deslocamento é do mestre', () => {
    const { s: s0, cid } = setup();
    let s = dispatch(s0, gm, { type: 'character/approve', characterId: cid }, ctx).state;
    expect(s.characters[cid]).toMatchObject({ movement: 9, gold: 0 });
    // Padrão: solicitar.
    let r = dispatch(s, p1, { type: 'gold/set', characterId: cid, gold: 50 }, ctx);
    expect(r.ok && r.requested).toBe(true);
    s = dispatch(s, gm, { type: 'permissions/player', playerId: 'p1', key: 'gold_change', value: 'free' }, ctx).state;
    r = dispatch(s, p1, { type: 'gold/set', characterId: cid, gold: 50, reason: 'Recompensa' }, ctx);
    expect(r.ok && r.state.characters[cid].gold).toBe(50);
    s = r.state;
    expect(dispatch(s, p1, { type: 'gold/set', characterId: cid, gold: -1 }, ctx).ok).toBe(false);
    s = dispatch(s, gm, { type: 'permissions/player', playerId: 'p1', key: 'gold_change', value: 'blocked' }, ctx).state;
    expect(dispatch(s, p1, { type: 'gold/set', characterId: cid, gold: 10 }, ctx).ok).toBe(false);
    expect(dispatch(s, p1, { type: 'character/movement', characterId: cid, movement: 30 }, ctx).ok).toBe(false);
    r = dispatch(s, gm, { type: 'character/movement', characterId: cid, movement: 12 }, ctx);
    expect(r.ok && r.state.characters[cid].movement).toBe(12);
  });
});
