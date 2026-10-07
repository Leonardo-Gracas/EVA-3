// Rolagem de dados. Quem rola é sempre o navegador do mestre (o jogador só pede),
// então ninguém consegue forjar resultado.
import type { RollResult } from '../model/types';

export type Rng = (sides: number) => number;

export const cryptoRng: Rng = (sides) => {
  // Rejeição para evitar viés do módulo.
  const max = Math.floor(0x100000000 / sides) * sides;
  const buf = new Uint32Array(1);
  let v = 0;
  do {
    crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= max);
  return (v % sides) + 1;
};

interface Term { sign: 1 | -1; count: number; sides: number }

const MAX_DICE = 50;
const MAX_SIDES = 1000;

/** Aceita "d20", "2d6+3", "1d20 + 2 - 1d4", "5". */
export function parseExpr(raw: string): { terms: Term[]; modifier: number } | null {
  const s = raw.replace(/\s+/g, '').toLowerCase();
  if (!s || s.length > 60) return null;
  if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(s)) return null;
  const terms: Term[] = [];
  let modifier = 0;
  let dice = 0;
  for (const m of s.matchAll(/([+-]?)(\d*d\d+|\d+)/g)) {
    const sign = m[1] === '-' ? -1 : 1;
    const body = m[2];
    if (body.includes('d')) {
      const [c, f] = body.split('d');
      const count = c ? Number(c) : 1;
      const sides = Number(f);
      if (count < 1 || sides < 2 || sides > MAX_SIDES) return null;
      dice += count;
      if (dice > MAX_DICE) return null;
      terms.push({ sign, count, sides });
    } else {
      modifier += sign * Number(body);
    }
  }
  return { terms, modifier };
}

export function rollExpr(expr: string, extraModifier = 0, rng: Rng = cryptoRng): RollResult | null {
  const p = parseExpr(expr);
  if (!p) return null;
  const dice: RollResult['dice'] = [];
  let total = 0;
  for (const t of p.terms) {
    for (let i = 0; i < t.count; i++) {
      const v = rng(t.sides);
      dice.push({ sides: t.sides, value: t.sign * v });
      total += t.sign * v;
    }
  }
  const modifier = p.modifier + extraModifier;
  total += modifier;
  return { expr, dice, modifier, total };
}

/** O d20 de uma rolagem de um dado só (o que decide crítico e falha crítica). */
export function naturalD20(r?: RollResult): number | null {
  const d = r?.dice;
  return d && d.length === 1 && d[0].sides === 20 ? d[0].value : null;
}
