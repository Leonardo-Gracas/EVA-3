import { describe, expect, it } from 'vitest';
import { emptyAttributes, pointsLeft, isValidAttributeSet } from './attributes';
import { deriveStats, deathThreshold, titleOf } from './derive';
import { abilityOptions, validateDraft, validateLevelPick, classesAvailable } from './validate';
import { parseExpr, rollExpr } from './dice';
import type { LevelPick } from '../model/types';

const noLoss = { pv: 0, pe: 0 };

describe('atributos', () => {
  it('custo segue a tabela', () => {
    const a = { ...emptyAttributes(), FOR: 4, CON: 3 }; // 7 + 4 = 11
    expect(pointsLeft(a)).toBe(-1);
    expect(isValidAttributeSet(a)).toBe(false);
    const b = { ...a, PRE: -1 }; // devolve 1
    expect(pointsLeft(b)).toBe(0);
    expect(isValidAttributeSet(b)).toBe(true);
  });
  it('rejeita fora da faixa', () => {
    expect(isValidAttributeSet({ ...emptyAttributes(), FOR: 5 })).toBe(false);
    expect(isValidAttributeSet({ ...emptyAttributes(), FOR: -2 })).toBe(false);
  });
});

describe('PV/PE pelas faixas do livro', () => {
  const lv = (n: number, c: LevelPick['classId']): LevelPick[] => Array.from({ length: n }, () => ({ classId: c, abilityId: null }));
  it('Acólito', () => {
    const at = (CON: number, FE: number) => ({ ...emptyAttributes(), CON, FE });
    expect(deriveStats({ attributes: at(0, 0), levels: lv(1, 'acolito'), permanentLoss: noLoss }).pvMax).toBe(10);
    expect(deriveStats({ attributes: at(4, 0), levels: lv(1, 'acolito'), permanentLoss: noLoss }).pvMax).toBe(14);
    const l6min = deriveStats({ attributes: at(0, 0), levels: lv(6, 'acolito'), permanentLoss: noLoss });
    const l6max = deriveStats({ attributes: at(4, 4), levels: lv(6, 'acolito'), permanentLoss: noLoss });
    expect([l6min.pvMax, l6max.pvMax]).toEqual([25, 49]);
    expect([l6min.peMax, l6max.peMax]).toEqual([12, 32]);
    const l9max = deriveStats({ attributes: at(4, 4), levels: lv(9, 'acolito'), permanentLoss: noLoss });
    expect([l9max.pvMax, l9max.peMax]).toEqual([70, 50]);
  });
  it('Combatente', () => {
    const d = deriveStats({ attributes: { ...emptyAttributes(), CON: 4 }, levels: lv(9, 'combatente'), permanentLoss: noLoss });
    expect(d.pvMax).toBe(80);
    expect(d.peMax).toBe(19);
  });
  it('Vidente e Ocultista', () => {
    expect(deriveStats({ attributes: emptyAttributes(), levels: lv(9, 'vidente'), permanentLoss: noLoss }).pvMax).toBe(22);
    expect(deriveStats({ attributes: { ...emptyAttributes(), CON: 4 }, levels: lv(9, 'ocultista'), permanentLoss: noLoss }).pvMax).toBe(60);
  });
  it('bônus de teste em nível par, DEF e VON', () => {
    const d = deriveStats({ attributes: { ...emptyAttributes(), DES: 2, FE: 3 }, levels: lv(5, 'combatente'), permanentLoss: noLoss });
    expect(d.testBonus).toBe(2);
    expect(d.def).toBe(12);
    expect(d.von).toBe(13);
  });
});

describe('habilidades passivas', () => {
  it('somam na ficha', () => {
    const attrs = { ...emptyAttributes(), FE: 2, PRE: 3, CON: 1 };
    const levels: LevelPick[] = [
      { classId: 'acolito', abilityId: 'fortificado' },
      { classId: 'vidente', abilityId: 'sexto-sentido' },
      { classId: 'acolito', abilityId: 'clareza' },
    ];
    const d = deriveStats({ attributes: attrs, levels, permanentLoss: noLoss });
    // PV: 10+1 (ac 1) + 2+1 (vid) + 3+1 (ac) + 2+FÉ(4) = 11+3+4+4 = 22
    expect(d.pvMax).toBe(22);
    // PE: 2 + (2+PRE=5) + (2+FÉ=4) + clareza(2+FÉ=4) = 15
    expect(d.peMax).toBe(15);
    expect(d.def).toBe(13);
    expect(d.title).toBe('Peregrino');
  });
});

describe('morte e títulos', () => {
  it('limiar é o mais negativo', () => {
    expect(deathThreshold(12)).toBe(-10);
    expect(deathThreshold(40)).toBe(-20);
    expect(deathThreshold(41)).toBe(-20);
  });
  it('títulos', () => {
    expect(titleOf([{ classId: 'combatente', abilityId: null }])).toBe('Combatente');
    expect(titleOf([{ classId: 'combatente', abilityId: null }, { classId: 'combatente', abilityId: null }])).toBe('General');
    expect(titleOf([{ classId: 'ocultista', abilityId: null }, { classId: 'combatente', abilityId: null }])).toBe('Bruxo');
  });
});

describe('progressão', () => {
  it('máximo de 2 classes', () => {
    const levels: LevelPick[] = [{ classId: 'acolito', abilityId: 'fortificado' }, { classId: 'vidente', abilityId: 'lampejos' }];
    expect(classesAvailable(levels)).toEqual(['acolito', 'vidente']);
    expect(validateLevelPick(emptyAttributes(), levels, { classId: 'ocultista', abilityId: 'estudo' })).toMatch(/Máximo/);
  });
  it('requisito de nível de classe', () => {
    const levels: LevelPick[] = [{ classId: 'acolito', abilityId: 'fortificado' }];
    expect(validateLevelPick(emptyAttributes(), levels, { classId: 'acolito', abilityId: 'oracao' })).toMatch(/3º nível/);
    const l2: LevelPick[] = [...levels, { classId: 'acolito', abilityId: 'clareza' }];
    expect(validateLevelPick(emptyAttributes(), l2, { classId: 'acolito', abilityId: 'oracao' })).toBeNull();
  });
  it('Violência exige FOR 1+, Cronus exige Premonição', () => {
    expect(validateLevelPick(emptyAttributes(), [], { classId: 'combatente', abilityId: 'violencia' })).toMatch(/FOR 1\+/);
    const v5: LevelPick[] = Array.from({ length: 5 }, (_, i) => ({ classId: 'vidente' as const, abilityId: ['lampejos', 'sexto-sentido', 'personalidade', 'memorium-vitre', 'religare'][i] }));
    const opts = abilityOptions(emptyAttributes(), v5, 'vidente');
    expect(opts.find((o) => o.ability.id === 'cronus')?.eligible).toBe(false);
  });
  it('sem habilidade só quando não há opção', () => {
    expect(validateLevelPick(emptyAttributes(), [], { classId: 'acolito', abilityId: null })).toMatch(/Escolha/);
  });
  it('rascunho válido', () => {
    expect(validateDraft({ name: 'Mizael', concept: '', notes: '', attributes: { ...emptyAttributes(), FE: 3, PRE: 2, INT: 2, DES: 1, CON: 1 }, classId: 'acolito', abilityId: 'devocao' })).toBeNull();
  });
});

describe('dados', () => {
  it('interpreta expressões', () => {
    expect(parseExpr('2d6+3')).toEqual({ terms: [{ sign: 1, count: 2, sides: 6 }], modifier: 3 });
    expect(parseExpr('d20')).not.toBeNull();
    expect(parseExpr('abc')).toBeNull();
    expect(parseExpr('100d6')).toBeNull();
  });
  it('rola com rng fixo', () => {
    const r = rollExpr('2d6+1', 2, () => 4)!;
    expect(r.total).toBe(11);
  });
});
