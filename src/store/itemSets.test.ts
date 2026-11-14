import { describe, expect, it } from 'vitest';
import { dispatch, MAX_LIBRARY, newTable, type EngineCtx } from './engine';
import type { Actor, ItemData, TableState } from '../model/types';
import { ITEM_SETS, installedSetItems, missingSetItems } from './itemSets';
import { CATALOG_ITEMS } from './itemCatalog';

let n = 0;
const ctx: EngineCtx = { now: () => 1000, newId: () => `id${++n}`, rng: () => 3 };
const gm: Actor = { role: 'gm', name: 'Mestre' };

function importInto(s: TableState, items: ItemData[]): TableState {
  const gap = missingSetItems(s.itemLibrary, items);
  for (const u of gap.update) s = dispatch(s, gm, { type: 'library/upsert', item: u.item, itemId: u.id }, ctx).state;
  for (const item of gap.add) {
    const r = dispatch(s, gm, { type: 'library/upsert', item }, ctx);
    if (!r.ok) throw new Error(`${item.name}: ${r.error}`);
    s = r.state;
  }
  return s;
}

describe('conjuntos de itens', () => {
  it('os conjuntos, cada um com armas, ferramentas e nomes sem repetir', () => {
    expect(ITEM_SETS.map((x) => x.name)).toEqual(['Iluminação', 'Medieval', 'Old School', 'Contemporâneo', 'Ocultismo']);
    for (const set of ITEM_SETS) {
      const names = set.items.map((i) => i.name);
      expect(new Set(names).size, set.name).toBe(names.length);
      if (set.id !== 'iluminacao') {
        expect(set.items.some((i) => i.type === 'arma'), set.name).toBe(true);
        expect(set.items.some((i) => i.type === 'equipamento'), set.name).toBe(true);
        expect(set.items.some((i) => i.effects.light), set.name).toBe(true);
      }
    }
  });

  it('todo item do catálogo está em algum conjunto', () => {
    const inSets = new Set(ITEM_SETS.flatMap((x) => x.items.map((i) => i.name)));
    expect(CATALOG_ITEMS.filter((i) => !inSets.has(i.name)).map((i) => i.name)).toEqual([]);
  });

  it('o mesmo nome é o mesmo item em todos os conjuntos e no catálogo', () => {
    const byName = new Map<string, ItemData>();
    for (const it of [...CATALOG_ITEMS, ...ITEM_SETS.flatMap((x) => x.items)]) {
      const seen = byName.get(it.name);
      if (seen) expect(it, it.name).toEqual(seen);
      else byName.set(it.name, it);
    }
  });

  it('todos passam pelo motor e cabem juntos na biblioteca', () => {
    let s = newTable('Mesa', 'Mestre', 'ABCDEF', ctx);
    s = importInto(s, ITEM_SETS.flatMap((x) => x.items));
    expect(Object.keys(s.itemLibrary).length).toBeLessThanOrEqual(MAX_LIBRARY);
    for (const set of ITEM_SETS) expect(missingSetItems(s.itemLibrary, set.items), set.name).toEqual({ add: [], update: [] });
  });

  it('importar só traz o que falta, pelo nome', () => {
    let s = newTable('Mesa', 'Mestre', 'ABCDEF', ctx);
    const medieval = ITEM_SETS.find((x) => x.id === 'medieval')!;
    s = dispatch(s, gm, { type: 'library/upsert', item: { ...medieval.items[0], name: ` ${medieval.items[0].name.toUpperCase()} ` } }, ctx).state;
    const gap = missingSetItems(s.itemLibrary, medieval.items);
    expect(gap.add).toHaveLength(medieval.items.length - 1);
    expect(gap.update).toEqual([]);
    // Dois conjuntos com itens em comum: cada um entra uma vez.
    const both = ITEM_SETS.filter((x) => x.id === 'medieval' || x.id === 'iluminacao').flatMap((x) => x.items);
    const names = missingSetItems({}, both).add.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('desimportar: marca o que é do conjunto e poupa o editado e o que é de outro conjunto em uso', () => {
    const set = (id: string) => ITEM_SETS.find((x) => x.id === id)!;
    let s = newTable('Mesa', 'Mestre', 'ABCDEF', ctx);
    expect(installedSetItems(s.itemLibrary, 'medieval')).toEqual([]);
    s = importInto(s, [...set('medieval').items, ...set('iluminacao').items]);

    let list = installedSetItems(s.itemLibrary, 'medieval');
    expect(list).toHaveLength(set('medieval').items.length);
    expect(list.every((r) => !r.changed)).toBe(true);
    expect(list.find((r) => r.name === 'Tocha')!.alsoIn).toEqual(['Iluminação']);
    expect(list.find((r) => r.name === 'Adaga')!.alsoIn).toEqual([]);

    // Editado pelo mestre: continua listado, mas como diferente do conjunto.
    const adaga = list.find((r) => r.name === 'Adaga')!;
    s = dispatch(s, gm, { type: 'library/upsert', item: { ...s.itemLibrary[adaga.id], value: 99 }, itemId: adaga.id }, ctx).state;
    list = installedSetItems(s.itemLibrary, 'medieval');
    expect(list.find((r) => r.name === 'Adaga')!.changed).toBe(true);

    // Remove o que vem marcado: o Medieval sai, a Adaga editada e a iluminação ficam.
    for (const r of list.filter((x) => !x.changed && !x.alsoIn.length)) s = dispatch(s, gm, { type: 'library/delete', itemId: r.id }, ctx).state;
    expect(installedSetItems(s.itemLibrary, 'medieval').map((r) => r.name).sort())
      .toEqual(['Adaga', ...set('medieval').items.filter((i) => set('iluminacao').items.some((l) => l.name === i.name)).map((i) => i.name)].sort());
    expect(missingSetItems(s.itemLibrary, set('iluminacao').items)).toEqual({ add: [], update: [] });
  });
});
