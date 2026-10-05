// Atributos do EVA 3. Valores vão de -1 a +4, comprados com 10 pontos.

export type AttrKey = 'FOR' | 'CON' | 'DES' | 'FE' | 'INT' | 'PRE';

export const ATTR_KEYS: AttrKey[] = ['FOR', 'CON', 'DES', 'FE', 'INT', 'PRE'];

export interface AttrInfo {
  key: AttrKey;
  short: string;
  name: string;
  description: string;
}

export const ATTRIBUTES: Record<AttrKey, AttrInfo> = {
  FOR: { key: 'FOR', short: 'FOR', name: 'Força', description: 'Testes físicos e poder bruto.' },
  CON: { key: 'CON', short: 'CON', name: 'Constituição', description: 'Resistência física e durabilidade.' },
  DES: { key: 'DES', short: 'DES', name: 'Destreza', description: 'Agilidade, defesa, manuseio.' },
  FE: { key: 'FE', short: 'FÉ', name: 'Fé', description: 'Acesso ao sagrado ou profano, resistência a maldições e tentações.' },
  INT: { key: 'INT', short: 'INT', name: 'Intelecto', description: 'Poder racional, acesso ao mundano, resistência a enganações e ilusões.' },
  PRE: { key: 'PRE', short: 'PRE', name: 'Presença', description: 'Carisma, sentidos, acesso ao outro plano.' },
};

export type Attributes = Record<AttrKey, number>;

export const ATTR_MIN = -1;
export const ATTR_MAX = 4;
export const POINT_BUDGET = 10;

/** Custo em pontos de cada valor. Negativo = devolve pontos. */
export const ATTR_COST: Record<number, number> = {
  [-1]: -1,
  0: 0,
  1: 1,
  2: 2,
  3: 4,
  4: 7,
};

export function emptyAttributes(): Attributes {
  return { FOR: 0, CON: 0, DES: 0, FE: 0, INT: 0, PRE: 0 };
}

export function attrCost(value: number): number {
  const c = ATTR_COST[value];
  if (c === undefined) throw new Error(`Valor de atributo inválido: ${value}`);
  return c;
}

export function pointsSpent(attrs: Attributes): number {
  return ATTR_KEYS.reduce((sum, k) => sum + attrCost(attrs[k]), 0);
}

export function pointsLeft(attrs: Attributes): number {
  return POINT_BUDGET - pointsSpent(attrs);
}

export function isValidAttributeSet(attrs: unknown): attrs is Attributes {
  if (!attrs || typeof attrs !== 'object') return false;
  const a = attrs as Record<string, unknown>;
  for (const k of ATTR_KEYS) {
    const v = a[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < ATTR_MIN || v > ATTR_MAX) return false;
  }
  return pointsLeft(a as Attributes) >= 0;
}

export function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
