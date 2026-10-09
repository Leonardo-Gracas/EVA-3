import { describe, expect, it } from 'vitest';
import type { EngineCtx } from './engine';
import { PLACEHOLDER_ITEMS, PLACEHOLDER_THREATS, placeholderTable } from './placeholder';

let n = 0;
const ctx: EngineCtx = { now: () => 1000, newId: () => `id${++n}`, rng: () => 3 };

describe('campanha de exemplo', () => {
  it('cria todos os itens e ameaças pelo motor, ameaças na ordem por força', () => {
    const s = placeholderTable('Mestre', 'ABCDEF', ctx);
    expect(Object.keys(s.itemLibrary)).toHaveLength(PLACEHOLDER_ITEMS.length);
    const threats = Object.values(s.threats).sort((a, b) => a.createdAt - b.createdAt);
    expect(threats.map((t) => t.name)).toEqual(PLACEHOLDER_THREATS.map((t) => t.name));
    expect(threats.every((t) => t.current.pv === t.pvMax && t.attacks.every((a) => a.id))).toBe(true);
  });

  it('não repete nomes', () => {
    const names = [...PLACEHOLDER_ITEMS, ...PLACEHOLDER_THREATS].map((x) => x.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
