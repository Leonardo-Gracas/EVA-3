import { describe, expect, it } from 'vitest';
import { dispatch, newTable, type EngineCtx } from './engine';
import type { Actor, TableState, ThreatData } from '../model/types';
import { THREAT_SETS, installedThreatSet, missingThreats } from './threatSets';

let n = 0;
const ctx: EngineCtx = { now: () => 1000, newId: () => `id${++n}`, rng: () => 3 };
const gm: Actor = { role: 'gm', name: 'Mestre' };
const set = (id: string) => THREAT_SETS.find((x) => x.id === id)!;

function importInto(s: TableState, items: ThreatData[]): TableState {
  for (const data of missingThreats(s.threats, items)) {
    const r = dispatch(s, gm, { type: 'threat/upsert', data }, ctx);
    if (!r.ok) throw new Error(`${data.name}: ${r.error}`);
    s = r.state;
  }
  return s;
}

describe('conjuntos de ameaças', () => {
  it('três classes, nomes sem repetir, com o que cada uma promete', () => {
    expect(THREAT_SETS.map((x) => x.name)).toEqual(['Ocultistas', 'Criminosos', 'Selvagens']);
    const all = THREAT_SETS.flatMap((x) => x.items);
    expect(new Set(all.map((t) => t.name)).size).toBe(all.length);

    const occult = set('ocultistas').items;
    expect(occult.filter((t) => t.category === 'etereo' && t.concept.includes('Fantasma')).length).toBeGreaterThanOrEqual(3);
    expect(occult.some((t) => t.category === 'demoniaco' && t.concept.includes('Demônio encarnado'))).toBe(true);
    expect(occult.some((t) => t.category === 'demoniaco' && t.concept.includes('Demônio possessor'))).toBe(true);

    const crime = set('criminosos').items;
    expect(crime.filter((t) => /Chefão|Chefe mafiosa/.test(t.concept)).length).toBeGreaterThanOrEqual(2);
    expect(crime.filter((t) => t.name === 'Brutamontes' || t.concept.includes('Brutamontes')).length).toBeGreaterThanOrEqual(2);

    expect(set('selvagens').items.filter((t) => t.category === 'animal').length).toBeGreaterThanOrEqual(8);
  });

  it('cada classe vai de Fraco a Chefe', () => {
    for (const s of THREAT_SETS) {
      for (const tier of ['Fraco', 'Comum', 'Forte', 'Elite', 'Chefe']) {
        expect(s.items.some((t) => t.concept.startsWith(`${tier} · `)), `${s.name}: ${tier}`).toBe(true);
      }
    }
  });

  it('todas passam pelo motor sem mudar, e importar só traz o que falta', () => {
    let s = newTable('Mesa', 'Mestre', 'ABCDEF', ctx);
    s = importInto(s, set('criminosos').items);
    expect(Object.keys(s.threats)).toHaveLength(set('criminosos').items.length);
    expect(missingThreats(s.threats, set('criminosos').items)).toEqual([]);
    s = importInto(s, THREAT_SETS.flatMap((x) => x.items));
    for (const x of THREAT_SETS) {
      const list = installedThreatSet(s.threats, x.id);
      expect(list, x.name).toHaveLength(x.items.length);
      expect(list.filter((r) => r.changed).map((r) => r.name), x.name).toEqual([]);
    }
    expect(Object.values(s.threats).every((t) => t.current.pv === t.pvMax && t.attacks.every((a) => a.id))).toBe(true);
  });

  it('desimportar poupa a ameaça editada', () => {
    let s = importInto(newTable('Mesa', 'Mestre', 'ABCDEF', ctx), set('selvagens').items);
    const lobo = Object.values(s.threats).find((t) => t.name === 'Lobo')!;
    s = dispatch(s, gm, { type: 'threat/upsert', threatId: lobo.id, data: { ...lobo, pvMax: 20 } }, ctx).state;
    const list = installedThreatSet(s.threats, 'selvagens');
    expect(list.find((r) => r.name === 'Lobo')!.changed).toBe(true);
    for (const r of list.filter((x) => !x.changed)) s = dispatch(s, gm, { type: 'threat/delete', threatId: r.id }, ctx).state;
    expect(Object.values(s.threats).map((t) => t.name)).toEqual(['Lobo']);
  });
});
