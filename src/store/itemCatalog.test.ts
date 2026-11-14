import { describe, expect, it } from 'vitest';
import { dispatch, newTable, type EngineCtx } from './engine';
import type { Actor } from '../model/types';
import { LIGHT_ITEMS, PLACEHOLDER_ITEMS, PLACEHOLDER_THREATS, placeholderTable } from './placeholder';
import { missingSetItems } from './itemSets';

const missingLightItems = (lib: Parameters<typeof missingSetItems>[0]) => missingSetItems(lib, LIGHT_ITEMS);

let n = 0;
const ctx: EngineCtx = { now: () => 1000, newId: () => `id${++n}`, rng: () => 3 };

describe('campanha de exemplo', () => {
  it('cria todos os itens e ameaças pelo motor, ameaças na ordem por força', () => {
    const s = placeholderTable('Mesa', 'Mestre','ABCDEF', ctx);
    expect(Object.keys(s.itemLibrary)).toHaveLength(PLACEHOLDER_ITEMS.length);
    const threats = Object.values(s.threats).sort((a, b) => a.createdAt - b.createdAt);
    expect(threats.map((t) => t.name)).toEqual(PLACEHOLDER_THREATS.map((t) => t.name));
    expect(threats.every((t) => t.current.pv === t.pvMax && t.attacks.every((a) => a.id))).toBe(true);
  });

  it('não repete nomes', () => {
    const names = [...PLACEHOLDER_ITEMS, ...PLACEHOLDER_THREATS].map((x) => x.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('itens de iluminação: mesa nova já tem; mesa antiga ganha os que faltam e a luz nos de mesmo nome', () => {
    const fresh = placeholderTable('Mesa', 'Mestre', 'ABCDEF', ctx);
    expect(missingLightItems(fresh.itemLibrary)).toEqual({ add: [], update: [] });
    expect(LIGHT_ITEMS.every((i) => (i.effects.light ?? 0) > 0)).toBe(true);

    // Biblioteca de antes: sem os itens novos, e a lanterna sem luz.
    let s = newTable('Mesa', 'Mestre', 'ABCDEF', ctx);
    const gm: Actor = { role: 'gm', name: 'Mestre' };
    const lanterna = LIGHT_ITEMS.find((i) => i.name === 'Lanterna tática')!;
    s = dispatch(s, gm, { type: 'library/upsert', item: { ...lanterna, name: ' lanterna TÁTICA', effects: { def: 0, rdPhysical: 0, rdMagic: 0 } } }, ctx).state;
    const gap = missingLightItems(s.itemLibrary);
    expect(gap.update).toHaveLength(1);
    expect(gap.update[0].item.effects.light).toBe(8);
    expect(gap.add).toHaveLength(LIGHT_ITEMS.length - 1);
    for (const u of gap.update) s = dispatch(s, gm, { type: 'library/upsert', item: u.item, itemId: u.id }, ctx).state;
    for (const item of gap.add) s = dispatch(s, gm, { type: 'library/upsert', item }, ctx).state;
    expect(missingLightItems(s.itemLibrary)).toEqual({ add: [], update: [] });
    expect(Object.values(s.itemLibrary).filter((i) => i.effects.light)).toHaveLength(LIGHT_ITEMS.length);
  });
});
