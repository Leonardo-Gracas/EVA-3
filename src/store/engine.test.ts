import { describe, expect, it } from 'vitest';
import { dispatch, newTable, type EngineCtx } from './engine';
import { buildPlayerView } from './views';
import { migrate } from './persistence';
import { caseChanges } from '../model/cases';
import { deriveStats } from '../rules/derive';
import type { Actor, CharacterDraft, TableState } from '../model/types';
import { emptyAttributes } from '../rules/attributes';
import { DEFAULT_AVATAR } from '../model/avatar';

let n = 0;
const ctx: EngineCtx = { now: () => 1000, newId: () => `id${++n}`, rng: () => 3 };
const gm: Actor = { role: 'gm', name: 'Mestre' };
const p1: Actor = { role: 'player', playerId: 'p1', name: 'Ana' };
const p2: Actor = { role: 'player', playerId: 'p2', name: 'Beto' };

const draft: CharacterDraft = {
  name: 'Mizael', concept: 'Padre', notes: '',
  attributes: { ...emptyAttributes(), FE: 3, CON: 2, PRE: 2 }, levels: [{ classId: 'acolito', abilityId: 'fortificado' }],
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

  it('aparência: livre para o dono mesmo pendente, sanitizada e visível aos outros', () => {
    const { s: s0, cid } = setup();
    expect(s0.characters[cid].avatar).toBeUndefined();
    const avatar = { ...DEFAULT_AVATAR, hair: 'longo', outfit: 'manto' } as const;
    let r = dispatch(s0, p1, { type: 'character/avatar', characterId: cid, avatar }, ctx);
    expect(r.ok && r.requested).toBeFalsy();
    expect(r.state.characters[cid].avatar).toEqual(avatar);
    expect(dispatch(r.state, p2, { type: 'character/avatar', characterId: cid, avatar }, ctx)).toMatchObject({ ok: false, error: /não é sua/ });
    // Lixo vindo da rede vira o padrão, campo a campo.
    r = dispatch(r.state, p1, { type: 'character/avatar', characterId: cid, avatar: { hair: 'moicano', skin: 's5', x: 1 } as never }, ctx);
    expect(r.state.characters[cid].avatar).toEqual({ ...DEFAULT_AVATAR, skin: 's5' });
    const s = dispatch(r.state, gm, { type: 'character/approve', characterId: cid }, ctx).state;
    expect(buildPlayerView(s, 'p2', new Set()).others[0].avatar).toEqual({ ...DEFAULT_AVATAR, skin: 's5' });
  });

  it('criar e reenviar ficha levam o avatar sanitizado', () => {
    const s0 = newTable('Mesa', 'Mestre', 'ABCDEF', ctx);
    s0.players.p1 = { id: 'p1', name: 'Ana', secretHash: 'x', firstSeen: 0, lastSeen: 0 };
    const r = dispatch(s0, p1, { type: 'character/create', draft: { ...draft, avatar: { ...DEFAULT_AVATAR, eyes: 'arco', y: 2 } as never } }, ctx);
    const c = Object.values(r.state.characters)[0];
    expect(c.avatar).toEqual({ ...DEFAULT_AVATAR, eyes: 'arco' });
    const re = dispatch(r.state, p1, { type: 'character/resubmit', characterId: c.id, draft }, ctx);
    expect(re.state.characters[c.id].avatar).toEqual({ ...DEFAULT_AVATAR, eyes: 'arco' });
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

  it('jogador rola sem ficha mesmo com characterId nulo (serialização do PeerJS)', () => {
    const { s } = setup();
    const r = dispatch(s, p1, { type: 'roll', expr: 'd20', characterId: null as unknown as undefined }, ctx);
    expect(r.ok).toBe(true);
    expect(r.state.log[r.state.log.length - 1]?.roll?.total).toBe(3);
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

  it('excluir jogador: só o mestre; leva fichas, combate, pedidos e permissões', () => {
    const { s: s0, cid } = setup();
    let s = dispatch(s0, gm, { type: 'character/approve', characterId: cid }, ctx).state;
    s = dispatch(s, gm, { type: 'combat/create' }, ctx).state;
    s = dispatch(s, gm, { type: 'combat/add', refs: [{ kind: 'character', id: cid }] }, ctx).state;
    s = dispatch(s, gm, { type: 'permissions/player', playerId: 'p1', key: 'resource_change', value: 'request' }, ctx).state;
    s = dispatch(s, p1, { type: 'resource/set', characterId: cid, pv: 4, pe: 2 }, ctx).state;
    expect(s.requests).toHaveLength(1);

    expect(dispatch(s, p2, { type: 'player/remove', playerId: 'p1' }, ctx)).toMatchObject({ ok: false });
    expect(dispatch(s, gm, { type: 'player/remove', playerId: 'nada' }, ctx)).toMatchObject({ ok: false, error: /não encontrado/ });
    s = dispatch(s, gm, { type: 'player/remove', playerId: 'p1' }, ctx).state;
    expect(s.players.p1).toBeUndefined();
    expect(s.players.p2).toBeDefined();
    expect(s.removedPlayers.p1).toBe(1000);
    expect(s.characters[cid]).toBeUndefined();
    expect(s.combat?.order).toHaveLength(0);
    expect(s.requests).toHaveLength(0);
    expect(s.permissions.perPlayer.p1).toBeUndefined();
    expect(s.log[s.log.length - 1].text).toBe('removeu Ana da mesa e excluiu a ficha de Mizael.');
    expect(buildPlayerView(s, 'p2', new Set()).players.map((p) => p.id)).toEqual(['p2']);
    // Mesa antiga, sem a lista de removidos.
    const old = structuredClone(s) as Partial<TableState>;
    delete old.removedPlayers;
    expect(migrate(old as TableState).removedPlayers).toEqual({});
  });

  it('nome da campanha: só o mestre renomeia', () => {
    const { s: s0 } = setup();
    expect(dispatch(s0, p1, { type: 'table/rename', name: 'Outra' }, ctx)).toMatchObject({ ok: false });
    expect(dispatch(s0, gm, { type: 'table/rename', name: '   ' }, ctx)).toMatchObject({ ok: false });
    const s = dispatch(s0, gm, { type: 'table/rename', name: '  Nova Campanha  ' }, ctx).state;
    expect(buildPlayerView(s, 'p1', new Set()).table.name).toBe('Nova Campanha');
  });

  it('nível inicial: o mestre define e a ficha do jogador precisa seguir', () => {
    const { s: s0 } = setup();
    expect(dispatch(s0, p1, { type: 'table/startLevel', level: 3 }, ctx)).toMatchObject({ ok: false });
    expect(dispatch(s0, gm, { type: 'table/startLevel', level: 13 }, ctx)).toMatchObject({ ok: false });
    const s = dispatch(s0, gm, { type: 'table/startLevel', level: 3 }, ctx).state;
    expect(buildPlayerView(s, 'p1', new Set()).table.startLevel).toBe(3);
    expect(dispatch(s, p1, { type: 'character/create', draft }, ctx)).toMatchObject({ ok: false, error: /nível 3/ });
    const lv3: CharacterDraft = { ...draft, levels: [...draft.levels, { classId: 'acolito', abilityId: 'clareza' }, { classId: 'acolito', abilityId: 'oracao' }] };
    const r = dispatch(s, p1, { type: 'character/create', draft: lv3 }, ctx);
    expect(r.ok).toBe(true);
    const c = Object.values(r.state.characters).find((x) => x.levels.length === 3)!;
    const d = deriveStats(c);
    expect(c.current).toEqual({ pv: d.pvMax, pe: d.peMax, clareza: d.clarezaMax });
    expect(d.abilities.map((a) => a.id)).toEqual(['fortificado', 'clareza', 'oracao']);
  });

  it('NPC: o mestre escolhe o nível, seguindo a progressão', () => {
    const { s } = setup();
    const lv3: CharacterDraft = { ...draft, name: 'Padre Otávio', levels: [...draft.levels, { classId: 'acolito', abilityId: 'clareza' }, { classId: 'acolito', abilityId: 'oracao' }] };
    expect(dispatch(s, gm, { type: 'npc/create', draft: lv3 }, ctx).ok).toBe(true);
    const skip: CharacterDraft = { ...lv3, levels: [lv3.levels[0], lv3.levels[2], lv3.levels[1]] };
    expect(dispatch(s, gm, { type: 'npc/create', draft: skip }, ctx)).toMatchObject({ ok: false, error: /Nível 2/ });
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

  it('rolagem do mestre: aberta chega inteira; oculta, só o 20 ou 1 natural', () => {
    const { s: s0 } = setup();
    const data = {
      name: 'Possuído', concept: '', notes: '',
      attributes: { FOR: 8, CON: 6, DES: 2, FE: -3, INT: 0, PRE: 5 },
      pvMax: 60, peMax: 10, def: 14, von: 9, rdPhysical: 2, rdMagic: 0, attacks: [], abilities: [],
    };
    let s = dispatch(s0, gm, { type: 'threat/upsert', data }, ctx).state;
    const t = Object.values(s.threats)[0];
    const nat20: EngineCtx = { ...ctx, rng: () => 20 };
    s = dispatch(s, gm, { type: 'roll', expr: 'd20+6', threatId: t.id, label: 'Ataque: Garras' }, ctx).state;
    s = dispatch(s, gm, { type: 'roll', expr: 'd20', threatId: t.id, attr: 'FOR', hidden: true }, ctx).state;
    s = dispatch(s, gm, { type: 'roll', expr: 'd20', threatId: t.id, attr: 'FOR', hidden: true }, nat20).state;
    s = dispatch(s, gm, { type: 'roll', expr: '2d20', threatId: t.id, hidden: true }, nat20).state;
    s = dispatch(s, p2, { type: 'roll', expr: 'd20', hidden: true }, nat20).state;
    const rolls = buildPlayerView(s, 'p1', new Set()).log.filter((e) => e.roll);
    expect(rolls).toHaveLength(2);
    expect(rolls[0]).toMatchObject({ characterName: 'Possuído', roll: { expr: 'd20+6', modifier: 6, total: 9 } });
    expect(rolls[1]).toEqual({
      id: s.log[s.log.length - 3].id, at: 1000, kind: 'roll', actorName: 'Mestre', text: 'rolagem oculta', hidden: true, secret: true,
      roll: { expr: 'd20', dice: [{ sides: 20, value: 20 }], modifier: 0, total: 20 },
    });
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
    delete old.characters[cid].current.clareza;
    delete old.cases;
    old.threats ={ t1: { id: 't1', name: 'Velho', rd: 4, attributes: {}, attacks: [], abilities: [], current: { pv: 1, pe: 0 } } };
    const m = migrate(old);
    expect(m.characters[cid].inventory[0]).toMatchObject({ value: 0, pv: 10, durability: { pv: 10, rd: 5, def: 12 } });
    expect(m.characters[cid].inventory[1]).toMatchObject({ type: 'catalisador_sagrado', effects: { def: 1, rdPhysical: 0, rdMagic: 0 } });
    expect(m.characters[cid].inventory[1]).not.toHaveProperty('defBonus');
    expect(m.threats.t1).toMatchObject({ rdPhysical: 4, rdMagic: 0 });
    expect(m.characters[cid].rdBonus).toEqual({ physical: 0, magic: 0 });
    expect(m.characters[cid]).toMatchObject({ movement: 9, gold: 0 });
    expect(m.characters[cid].current.clareza).toBe(6);
    expect(m.cases).toEqual({});
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

  it('Clareza: nasce cheia, ajusta junto com PV/PE e acompanha o nível', () => {
    const { s: s0, cid } = setup();
    let s = dispatch(s0, gm, { type: 'character/approve', characterId: cid }, ctx).state;
    // 6 + INT 0
    expect(s.characters[cid].current.clareza).toBe(6);
    let r = dispatch(s, p1, { type: 'resource/set', characterId: cid, pv: 17, pe: 2, clareza: 3, reason: 'Apuração' }, ctx);
    expect(r.ok && r.state.characters[cid].current.clareza).toBe(3);
    expect(r.state.log[r.state.log.length - 1].text).toContain('Clareza 6 → 3');
    s = r.state;
    // Sem clareza (ou null, como chega pelo PeerJS): não muda.
    r = dispatch(s, p1, { type: 'resource/set', characterId: cid, pv: 10, pe: 2, clareza: null as unknown as undefined }, ctx);
    expect(r.ok && r.state.characters[cid].current).toEqual({ pv: 10, pe: 2, clareza: 3 });
    s = r.state;
    expect(dispatch(s, p1, { type: 'resource/set', characterId: cid, pv: 10, pe: 2, clareza: 7 }, ctx).ok).toBe(false);
    // Lampejos: + PRE 2 de Clareza total, somado também ao atual.
    s = dispatch(s, gm, { type: 'level/up', characterId: cid, classId: 'vidente', abilityId: 'lampejos' }, ctx).state;
    expect(deriveStats(s.characters[cid]).clarezaMax).toBe(8);
    expect(s.characters[cid].current.clareza).toBe(5);
  });

  it('descanso: só o mestre, só os escolhidos, mortos não descansam', () => {
    const { s: s0, cid } = setup();
    let s = dispatch(s0, gm, { type: 'character/approve', characterId: cid }, ctx).state;
    s = dispatch(s, gm, { type: 'npc/create', draft: { ...draft, name: 'Morto' } }, ctx).state;
    s = dispatch(s, gm, { type: 'npc/create', draft: { ...draft, name: 'Vivo' } }, ctx).state;
    const byName = (name: string) => Object.values(s.characters).find((c) => c.name === name)!.id;
    const [dead, alive] = [byName('Morto'), byName('Vivo')];
    s = dispatch(s, gm, { type: 'resource/set', characterId: cid, pv: 1, pe: 0, clareza: 0 }, ctx).state;
    s = dispatch(s, gm, { type: 'resource/set', characterId: dead, pv: -10, pe: 0, clareza: 0 }, ctx).state;
    s = dispatch(s, gm, { type: 'resource/set', characterId: alive, pv: 1, pe: 0, clareza: 0 }, ctx).state;
    expect(dispatch(s, p1, { type: 'rest', characterIds: [cid] }, ctx)).toMatchObject({ ok: false, error: /mestre/ });
    s = dispatch(s, gm, { type: 'rest', characterIds: [cid, dead] }, ctx).state;
    expect(s.characters[cid].current).toEqual({ pv: 17, pe: 2, clareza: 6 });
    expect(s.characters[dead].current.pv).toBe(-10);
    expect(s.characters[alive].current.pv).toBe(1);
    expect(s.log[s.log.length - 1].text).toBe('Descanso: Mizael recuperou PV, PE e Clareza.');
    expect(dispatch(s, gm, { type: 'rest', characterIds: [dead] }, ctx).ok).toBe(false);
  });

  it('mural: o jogador só vê a versão publicada, nunca o rascunho', () => {
    const { s: s0 } = setup();
    expect(dispatch(s0, p1, { type: 'case/upsert', title: 'Mansão', description: '' }, ctx)).toMatchObject({ ok: false });
    let s = dispatch(s0, gm, { type: 'case/upsert', title: 'Mansão', description: 'Quem matou o barão?' }, ctx).state;
    const caseId = Object.keys(s.cases)[0];
    const view = () => buildPlayerView(s, 'p1', new Set()).cases;
    const logs = () => s.log.length;
    expect(view()).toHaveLength(0);

    // Montar o rascunho não vaza nada: nem o caso, nem avisos no registro.
    const before = logs();
    s = dispatch(s, gm, { type: 'clue/upsert', caseId, kind: 'evidencia', title: 'Faca', text: 'Ensanguentada' }, ctx).state;
    s = dispatch(s, gm, { type: 'clue/upsert', caseId, kind: 'fato', title: 'A faca é da cozinha', text: '', hidden: true }, ctx).state;
    const [faca, fato] = Object.values(s.cases[caseId].cards).map((c) => c.id);
    expect(dispatch(s, p1, { type: 'clue/link', caseId, from: faca, to: fato }, ctx).ok).toBe(false);
    s = dispatch(s, gm, { type: 'clue/link', caseId, from: faca, to: fato }, ctx).state;
    expect(dispatch(s, gm, { type: 'clue/link', caseId, from: fato, to: faca }, ctx)).toMatchObject({ ok: false, error: /já estão/ });
    expect(dispatch(s, gm, { type: 'clue/link', caseId, from: faca, to: faca }, ctx).ok).toBe(false);
    expect(logs()).toBe(before);
    expect(view()).toHaveLength(0);
    expect(caseChanges(s.cases[caseId])).toMatchObject({ total: 1, added: [{ id: faca }] });

    // Primeira publicação: só o que não está oculto.
    expect(dispatch(s, p1, { type: 'case/publish', caseId }, ctx).ok).toBe(false);
    s = dispatch(s, gm, { type: 'case/publish', caseId }, ctx).state;
    expect(s.log[s.log.length - 1].text).toBe('abriu o caso Mansão no mural, com nova evidência: Faca.');
    expect(Object.keys(view()[0].cards)).toEqual([faca]);
    expect(view()[0].links).toHaveLength(0);
    expect(caseChanges(s.cases[caseId]).total).toBe(0);
    expect(dispatch(s, gm, { type: 'case/publish', caseId }, ctx)).toMatchObject({ ok: false, error: /Nada novo/ });

    // Depois de publicado, mexer no rascunho também não chega ao jogador.
    const published = view();
    s = dispatch(s, gm, { type: 'clue/hidden', caseId, cardIds: [fato], hidden: false }, ctx).state;
    s = dispatch(s, gm, { type: 'clue/move', caseId, moves: [{ cardId: faca, x: 99999, y: -5 }] }, ctx).state;
    s = dispatch(s, gm, { type: 'case/upsert', caseId, title: 'Mansão Albuquerque', description: '' }, ctx).state;
    expect(s.cases[caseId].cards[faca]).toMatchObject({ x: 2200, y: 0 });
    expect(view()).toEqual(published);
    expect(caseChanges(s.cases[caseId])).toMatchObject({ added: [{ id: fato }], changed: 1, links: 1, info: true, total: 4 });

    s = dispatch(s, gm, { type: 'case/publish', caseId }, ctx).state;
    expect(s.log[s.log.length - 1].text).toBe('atualizou o mural do caso Mansão Albuquerque: novo fato: A faca é da cozinha.');
    expect(view()[0]).toMatchObject({ title: 'Mansão Albuquerque', links: [{ from: faca, to: fato }] });
    expect(view()[0].cards[faca]).toMatchObject({ x: 2200, y: 0 });

    // Retirar e arquivar escondem; o rascunho continua com o mestre.
    s = dispatch(s, gm, { type: 'case/unpublish', caseId }, ctx).state;
    expect(view()).toHaveLength(0);
    s = dispatch(s, gm, { type: 'case/publish', caseId }, ctx).state;
    expect(view()).toHaveLength(1);
    s = dispatch(s, gm, { type: 'case/archive', caseId, archived: true }, ctx).state;
    expect(view()).toHaveLength(0);
    expect(dispatch(s, gm, { type: 'case/publish', caseId }, ctx)).toMatchObject({ ok: false, error: /Reabra/ });
    s = dispatch(s, gm, { type: 'clue/delete', caseId, cardIds: [fato] }, ctx).state;
    expect(s.cases[caseId].links).toHaveLength(0);
  });

  it('mural: caso antigo já visível vira a primeira versão publicada', () => {
    const { s: s0 } = setup();
    const old = structuredClone(s0) as any;
    const card = (id: string, hidden: boolean) => ({ id, kind: 'evidencia', title: id, text: '', x: 0, y: 0, hidden, createdAt: 1, updatedAt: 1 });
    old.cases = {
      k1: { id: 'k1', title: 'Aberto', description: '', visible: true, archived: false, cards: { c1: card('c1', false), c2: card('c2', true) }, links: [], createdAt: 1, updatedAt: 5 },
      k2: { id: 'k2', title: 'Rascunho', description: '', visible: false, archived: false, cards: {}, links: [], createdAt: 2, updatedAt: 5 },
    };
    const m = migrate(old);
    expect(Object.keys(m.cases.k1.published!.cards)).toEqual(['c1']);
    expect(m.cases.k2.published).toBeNull();
    expect(buildPlayerView(m, 'p1', new Set()).cases.map((k) => k.id)).toEqual(['k1']);
  });

  it('mural: lotes, id do que foi criado e restauração para desfazer', () => {
    const { s: s0 } = setup();
    let s = dispatch(s0, gm, { type: 'case/upsert', title: 'Mansão', description: '' }, ctx).state;
    const caseId = Object.keys(s.cases)[0];
    const add = (title: string) => {
      const r = dispatch(s, gm, { type: 'clue/upsert', caseId, kind: 'evidencia', title, text: '', hidden: true }, ctx);
      s = r.state;
      return (r as { id: string }).id;
    };
    const [a, b, c] = [add('Faca'), add('Bilhete'), add('Pegadas')];
    expect(Object.keys(s.cases[caseId].cards)).toEqual([a, b, c]);
    const linked = dispatch(s, gm, { type: 'clue/link', caseId, from: a, to: b }, ctx);
    s = linked.state;
    const linkId = (linked as { id: string }).id;
    expect(s.cases[caseId].links[0].id).toBe(linkId);

    // Revelar vários (com repetição) e publicar: um aviso só, com todas as pistas novas.
    s = dispatch(s, gm, { type: 'clue/hidden', caseId, cardIds: [a, b, a], hidden: false }, ctx).state;
    const logs = s.log.length;
    s = dispatch(s, gm, { type: 'case/publish', caseId }, ctx).state;
    expect(s.log.length).toBe(logs + 1);
    expect(s.log[s.log.length - 1].text).toBe('abriu o caso Mansão no mural, com novas pistas: Faca e Bilhete.');
    expect(dispatch(s, gm, { type: 'clue/hidden', caseId, cardIds: [], hidden: true }, ctx).ok).toBe(false);
    expect(dispatch(s, gm, { type: 'clue/hidden', caseId, cardIds: ['nao-existe'], hidden: true }, ctx).ok).toBe(false);

    s = dispatch(s, gm, { type: 'clue/move', caseId, moves: [{ cardId: a, x: 10, y: 20 }, { cardId: b, x: 30, y: 40 }] }, ctx).state;
    expect([s.cases[caseId].cards[a].x, s.cases[caseId].cards[b].y]).toEqual([10, 40]);

    // Excluir e restaurar: mesmos ids, fio de volta.
    const snapshot = { cards: [s.cases[caseId].cards[a], s.cases[caseId].cards[b]], links: s.cases[caseId].links };
    s = dispatch(s, gm, { type: 'clue/delete', caseId, cardIds: [a, b] }, ctx).state;
    expect(Object.keys(s.cases[caseId].cards)).toEqual([c]);
    expect(dispatch(s, p1, { type: 'clue/restore', caseId, ...snapshot }, ctx).ok).toBe(false);
    s = dispatch(s, gm, { type: 'clue/restore', caseId, ...snapshot }, ctx).state;
    expect(Object.keys(s.cases[caseId].cards).sort()).toEqual([a, b, c].sort());
    expect(s.cases[caseId].links).toEqual([{ id: linkId, from: a, to: b }]);
    expect(dispatch(s, gm, { type: 'clue/restore', caseId, ...snapshot }, ctx)).toMatchObject({ ok: false, error: /já está/ });
    // Fio órfão (ponta que não existe) é ignorado.
    s = dispatch(s, gm, { type: 'clue/restore', caseId, cards: [], links: [{ id: 'x1', from: a, to: 'sumiu' }] }, ctx).state;
    expect(s.cases[caseId].links).toHaveLength(1);
  });
});
