import { describe, expect, it } from 'vitest';
import { dispatch, newTable, type EngineCtx } from './engine';
import { buildPlayerView } from './views';
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
    r = dispatch(s, p1, { type: 'item/add', characterId: cid, qty: 1, item: { name: 'Terço', type: 'catalisador', description: '', damage: '', defBonus: 0 } }, ctx);
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
});
