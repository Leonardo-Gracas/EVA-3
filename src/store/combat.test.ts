import { describe, expect, it } from 'vitest';
import { dispatch, newTable, type EngineCtx } from './engine';
import { buildPlayerView } from './views';
import { conditionRemaining } from './combat';
import type { Actor, CharacterDraft, GameAction, TableState, ThreatData } from '../model/types';
import { emptyAttributes } from '../rules/attributes';

let n = 0;
const ctx: EngineCtx = { now: () => 1000, newId: () => `id${++n}`, rng: () => 3 };
const gm: Actor = { role: 'gm', name: 'Mestre' };
const p1: Actor = { role: 'player', playerId: 'p1', name: 'Ana' };
const p2: Actor = { role: 'player', playerId: 'p2', name: 'Beto' };

const draft: CharacterDraft = {
  name: 'Mizael', concept: 'Padre', notes: '',
  attributes: { ...emptyAttributes(), FE: 3, CON: 2, PRE: 2 }, levels: [{ classId: 'acolito', abilityId: 'fortificado' }],
};

const goblin: ThreatData = {
  name: 'Goblin', concept: '', attributes: emptyAttributes(), pvMax: 10, peMax: 0, def: 12, von: 10,
  rdPhysical: 2, rdMagic: 0, attacks: [], abilities: [], notes: '',
};

function ok(s: TableState, actor: Actor, a: GameAction): TableState {
  const r = dispatch(s, actor, a, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** Mesa com uma ficha aprovada de p1, um goblin no livro e um combate com os dois. */
function setup() {
  let s = newTable('Mesa', 'Mestre', 'ABCDEF', ctx);
  s.players.p1 = { id: 'p1', name: 'Ana', secretHash: 'x', firstSeen: 0, lastSeen: 0 };
  s.players.p2 = { id: 'p2', name: 'Beto', secretHash: 'y', firstSeen: 0, lastSeen: 0 };
  s = ok(s, p1, { type: 'character/create', draft });
  const cid = Object.keys(s.characters)[0];
  s = ok(s, gm, { type: 'character/approve', characterId: cid });
  s = ok(s, gm, { type: 'threat/upsert', data: goblin });
  const tid = Object.keys(s.threats)[0];
  s = ok(s, gm, { type: 'combat/create' });
  s = ok(s, gm, { type: 'combat/add', refs: [{ kind: 'character', id: cid }, { kind: 'threat', id: tid }] });
  const [pcCb, gobCb] = s.combat!.order.map((x) => x.id);
  return { s, cid, tid, pcCb, gobCb };
}

const turnId = (s: TableState) => s.combat!.order[s.combat!.turn].id;
const conds = (s: TableState, id: string) => s.combat!.order.find((x) => x.id === id)!.conditions;
const pvOf = (s: TableState, id: string) => s.combat!.order.find((x) => x.id === id)!.threat!.current.pv;

describe('combate', () => {
  it('só o mestre monta e conduz', () => {
    const { s } = setup();
    expect(dispatch(s, p1, { type: 'combat/start' }, ctx)).toMatchObject({ ok: false, error: /mestre/ });
    expect(dispatch(s, p1, { type: 'combat/create' }, ctx).ok).toBe(false);
  });

  it('o livro é só molde: ameaças viram instâncias numeradas e o livro não muda', () => {
    let { s, cid, tid, gobCb } = setup();
    s = ok(s, gm, { type: 'combat/add', refs: [{ kind: 'character', id: cid }] });
    expect(s.combat!.order).toHaveLength(2);
    s = ok(s, gm, { type: 'combat/add', refs: [{ kind: 'threat', id: tid }], qty: 2 });
    expect(Object.keys(s.threats)).toEqual([tid]);
    expect(s.combat!.order.slice(1).map((x) => x.threat!.name)).toEqual(['Goblin 1', 'Goblin 2', 'Goblin 3']);
    // Dano na instância não toca o molde nem as outras instâncias.
    s = ok(s, gm, { type: 'combat/resource', combatantId: gobCb, pv: 3, pe: 0 });
    expect(pvOf(s, gobCb)).toBe(3);
    expect(s.threats[tid].current.pv).toBe(10);
    expect(pvOf(s, s.combat!.order[2].id)).toBe(10);
    // Apagar o molde não tira as instâncias da fila; encerrar não mexe no livro.
    s = ok(s, gm, { type: 'threat/delete', threatId: tid });
    expect(s.combat!.order).toHaveLength(4);
    s = ok(s, gm, { type: 'combat/end' });
    expect(s.combat).toBeNull();
  });

  it('turnos dão a volta, contam rodadas e pulam abatidos', () => {
    let { s, tid, pcCb, gobCb } = setup();
    s = ok(s, gm, { type: 'combat/add', refs: [{ kind: 'threat', id: tid }] });
    const gob2 = s.combat!.order[2].id;
    s = ok(s, gm, { type: 'combat/start' });
    expect(s.combat!.round).toBe(1);
    expect(turnId(s)).toBe(pcCb);
    s = ok(s, gm, { type: 'combat/resource', combatantId: gobCb, pv: 0, pe: 0 });
    s = ok(s, gm, { type: 'combat/next' });
    expect(turnId(s)).toBe(gob2);
    s = ok(s, gm, { type: 'combat/next' });
    expect(s.combat!.round).toBe(2);
    expect(turnId(s)).toBe(pcCb);
    expect(s.log.some((e) => e.text === 'Rodada 2 começou.')).toBe(true);
    s = ok(s, gm, { type: 'combat/prev' });
    expect(s.combat!.round).toBe(1);
    expect(turnId(s)).toBe(gob2);
  });

  it('mover mantém a vez de quem está agindo', () => {
    let { s, pcCb, gobCb } = setup();
    s = ok(s, gm, { type: 'combat/start' });
    s = ok(s, gm, { type: 'combat/move', combatantId: gobCb, to: 0 });
    expect(s.combat!.order.map((x) => x.id)).toEqual([gobCb, pcCb]);
    expect(turnId(s)).toBe(pcCb);
  });

  describe('duração das condições', () => {
    /** Fila A, B, C, D (Mizael + 3 goblins); começa na vez de A. */
    function four() {
      let { s, tid, pcCb } = setup();
      s = ok(s, gm, { type: 'combat/add', refs: [{ kind: 'threat', id: tid }], qty: 2 });
      const [a, b, c, d] = s.combat!.order.map((x) => x.id);
      s = ok(s, gm, { type: 'combat/start' });
      expect(turnId(s)).toBe(pcCb);
      return { s, a, b, c, d };
    }

    it('dura exatamente as rodadas pedidas e acaba na vez de quem aplicou', () => {
      let { s, a, b, c, d } = four();
      s = ok(s, gm, { type: 'combat/next' }); // vez de B (rodada 1)
      s = ok(s, gm, { type: 'combat/conditionAdd', combatantIds: [d], name: 'Atordoado', rounds: 1 });
      expect(conditionRemaining(s.combat!, conds(s, d)[0])).toBe(1);
      for (const who of [c, d, a]) { // C, D (o alvo) e A, já na rodada 2
        s = ok(s, gm, { type: 'combat/next' });
        expect(turnId(s)).toBe(who);
        expect(conds(s, d)).toHaveLength(1);
        expect(conditionRemaining(s.combat!, conds(s, d)[0])).toBe(1);
      }
      s = ok(s, gm, { type: 'combat/next' }); // vez de B na rodada 2: acabou
      expect(turnId(s)).toBe(b);
      expect(conds(s, d)).toHaveLength(0);
      expect(s.log.some((e) => /Atordoado de Goblin 3 acabou/.test(e.text))).toBe(true);
    });

    it('segue quem aplicou quando a ordem muda', () => {
      let { s, a, b, d } = four();
      s = ok(s, gm, { type: 'combat/next' }); // vez de B
      s = ok(s, gm, { type: 'combat/conditionAdd', combatantIds: [a], name: 'Caído', rounds: 1 });
      s = ok(s, gm, { type: 'combat/move', combatantId: b, to: 3 }); // A C D B — B continua agindo
      expect(turnId(s)).toBe(b);
      s = ok(s, gm, { type: 'combat/next' }); // rodada 2, vez de A
      s = ok(s, gm, { type: 'combat/next' }); // C
      s = ok(s, gm, { type: 'combat/next' }); // D
      expect(turnId(s)).toBe(d);
      expect(conds(s, a)).toHaveLength(1);
      s = ok(s, gm, { type: 'combat/next' }); // B, na nova posição
      expect(turnId(s)).toBe(b);
      expect(conds(s, a)).toHaveLength(0);
    });

    it('se quem aplicou sai da fila, acaba na mesma posição (agora de quem a ocupa)', () => {
      let { s, a, b, c } = four();
      s = ok(s, gm, { type: 'combat/next' }); // vez de B
      s = ok(s, gm, { type: 'combat/conditionAdd', combatantIds: [a], name: 'Cego', rounds: 1 });
      s = ok(s, gm, { type: 'combat/remove', combatantIds: [b] }); // a vez passa para C
      expect(turnId(s)).toBe(c);
      expect(conds(s, a)[0].sourceId).toBe(c);
      s = ok(s, gm, { type: 'combat/next' }); // D
      s = ok(s, gm, { type: 'combat/next' }); // A, rodada 2
      expect(conds(s, a)).toHaveLength(1);
      s = ok(s, gm, { type: 'combat/next' }); // C, onde B estava
      expect(conds(s, a)).toHaveLength(0);
    });

    it('acaba mesmo se quem aplicou estiver fora de combate (a vez passa da posição)', () => {
      let { s, a, b, c } = four();
      s = ok(s, gm, { type: 'combat/next' }); // B
      s = ok(s, gm, { type: 'combat/conditionAdd', combatantIds: [a], name: 'Sangrando', rounds: 1 });
      s = ok(s, gm, { type: 'combat/resource', combatantId: b, pv: 0, pe: 0 });
      s = ok(s, gm, { type: 'combat/next' }); // C
      s = ok(s, gm, { type: 'combat/next' }); // D
      s = ok(s, gm, { type: 'combat/next' }); // A, rodada 2
      expect(conds(s, a)).toHaveLength(1);
      s = ok(s, gm, { type: 'combat/next' }); // pula B (abatido) e vai a C
      expect(turnId(s)).toBe(c);
      expect(conds(s, a)).toHaveLength(0);
    });

    it('antes do combate, conta a partir da rodada 1; "até remover" não acaba', () => {
      let { s, pcCb, gobCb } = setup();
      s = ok(s, gm, { type: 'combat/conditionAdd', combatantIds: [gobCb], name: 'Fúria', rounds: 1 });
      s = ok(s, gm, { type: 'combat/conditionAdd', combatantIds: [pcCb], name: 'Postura', rounds: null });
      s = ok(s, gm, { type: 'combat/start' });
      s = ok(s, gm, { type: 'combat/next' }); // goblin, rodada 1
      expect(conds(s, gobCb)).toHaveLength(1);
      s = ok(s, gm, { type: 'combat/next' }); // rodada 2
      expect(conds(s, gobCb)).toHaveLength(0);
      for (let i = 0; i < 6; i++) s = ok(s, gm, { type: 'combat/next' });
      expect(conds(s, pcCb)).toHaveLength(1);
    });
  });

  it('jogador encerra só o turno do próprio personagem', () => {
    let { s, pcCb, gobCb } = setup();
    s = ok(s, gm, { type: 'combat/start' });
    expect(dispatch(s, p2, { type: 'combat/endTurn', combatantId: pcCb }, ctx)).toMatchObject({ ok: false, error: /seu personagem/ });
    expect(dispatch(s, p1, { type: 'combat/endTurn', combatantId: gobCb }, ctx).ok).toBe(false);
    s = ok(s, p1, { type: 'combat/endTurn', combatantId: pcCb });
    expect(turnId(s)).toBe(gobCb);
    // Toque repetido não pula a vez do goblin.
    expect(dispatch(s, p1, { type: 'combat/endTurn', combatantId: pcCb }, ctx).ok).toBe(false);
  });

  it('dano em grupo usa a RD de cada alvo e atinge a instância', () => {
    let { s, cid, tid, pcCb, gobCb } = setup();
    const pv0 = s.characters[cid].current.pv;
    s = ok(s, gm, { type: 'combat/groupDamage', combatantIds: [pcCb, gobCb], op: 'phys', amount: 5 });
    expect(s.characters[cid].current.pv).toBe(pv0 - 5);
    expect(pvOf(s, gobCb)).toBe(10 - 3);
    expect(s.threats[tid].current.pv).toBe(10);
    s = ok(s, gm, { type: 'combat/groupDamage', combatantIds: [gobCb], op: 'heal', amount: 50 });
    expect(pvOf(s, gobCb)).toBe(10);
  });

  it('jogador não rola pela ameaça em combate', () => {
    const { s, gobCb } = setup();
    expect(dispatch(s, p1, { type: 'roll', expr: 'd20', combatantId: gobCb }, ctx).ok).toBe(false);
    const r = dispatch(s, gm, { type: 'roll', expr: 'd20', combatantId: gobCb, attr: 'DES' }, ctx);
    expect(r.ok && r.state.log[r.state.log.length - 1].characterName).toBe('Goblin');
  });

  it('excluir a ficha tira da fila e passa a vez', () => {
    let { s, cid, gobCb } = setup();
    s = ok(s, gm, { type: 'combat/start' });
    s = ok(s, gm, { type: 'character/delete', characterId: cid });
    expect(s.combat!.order.map((x) => x.id)).toEqual([gobCb]);
    expect(s.combat!.turn).toBe(0);
  });

  it('jogador não vê ocultos nem números dos outros', () => {
    let { s, cid, gobCb } = setup();
    s = ok(s, gm, { type: 'combat/resource', combatantId: gobCb, pv: 4, pe: 0 });
    let v = buildPlayerView(s, 'p1', new Set());
    expect(v.combat!.order.map((x) => [x.name, x.mine, x.health])).toEqual([['Mizael', true, 'ileso'], ['Goblin', false, 'muito-ferido']]);
    expect(v.combat!.order[0].characterId).toBe(cid);
    expect(JSON.stringify(v.combat)).not.toMatch(/"pv"/);
    s = ok(s, gm, { type: 'combat/hidden', combatantId: gobCb, hidden: true });
    s = ok(s, gm, { type: 'combat/start' });
    s = ok(s, gm, { type: 'combat/next' });
    v = buildPlayerView(s, 'p2', new Set());
    expect(v.combat!.order.map((x) => x.name)).toEqual(['Mizael']);
    expect(v.combat!.turnId).toBeNull();
  });
});
