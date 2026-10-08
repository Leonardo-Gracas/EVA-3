// Valores derivados da ficha: tudo que é calculado e nunca digitado.
import { ATTRIBUTES, type Attributes, type AttrKey } from './attributes';
import { CLASSES, CLASS_IDS, titleFor, type ClassId } from './classes';
import { getAbility, type Ability, type Scaled } from './abilities';
import type { Character, LevelPick } from '../model/types';

export interface Derived {
  level: number;
  classLevels: Record<ClassId, number>;
  /** Classes na ordem em que foram adquiridas. */
  classes: ClassId[];
  title: string;
  pvMax: number;
  peMax: number;
  /** Clareza: recurso de investigação, renovado no descanso. */
  clarezaMax: number;
  def: number;
  von: number;
  rdPhysical: number;
  rdMagic: number;
  /** +1 nos testes de todos os atributos a cada nível par. */
  testBonus: number;
  /** PV em que o personagem morre. */
  deathAt: number;
  /** false com Inabalável. */
  unconsciousAtZero: boolean;
  abilities: Ability[];
  damageAttrs: AttrKey[];
  breakdown: {
    pv: string[];
    pe: string[];
    clareza: string[];
    def: string[];
    rdPhysical: string[];
    rdMagic: string[];
  };
}

/** Clareza total = 6 + INT (+ efeitos de habilidade, como Lampejos). */
export const CLAREZA_BASE = 6;

function scaled(s: Scaled, attrs: Attributes): number {
  return s.base + (s.attr ? attrs[s.attr] : 0);
}

function scaledLabel(s: Scaled): string {
  if (!s.attr) return `${s.base}`;
  const a = ATTRIBUTES[s.attr].short;
  return s.base ? `${s.base} + ${a}` : a;
}

export function classLevelsOf(levels: LevelPick[]): Record<ClassId, number> {
  const out = Object.fromEntries(CLASS_IDS.map((c) => [c, 0])) as Record<ClassId, number>;
  for (const l of levels) out[l.classId] += 1;
  return out;
}

export function classOrder(levels: LevelPick[]): ClassId[] {
  const seen: ClassId[] = [];
  for (const l of levels) if (!seen.includes(l.classId)) seen.push(l.classId);
  return seen;
}

export function titleOf(levels: LevelPick[]): string {
  const order = classOrder(levels);
  if (order.length === 0) return '—';
  if (order.length === 1) {
    const c = order[0];
    return levels.length >= 2 ? titleFor(c, c) : CLASSES[c].name;
  }
  return titleFor(order[0], order[1]);
}

export function deathThreshold(pvMax: number): number {
  return Math.min(-10, -Math.floor(pvMax / 2));
}

export function deriveStats(
  ch: Pick<Character, 'attributes' | 'levels' | 'permanentLoss'> & { inventory?: Character['inventory']; rdBonus?: Character['rdBonus'] },
): Derived {
  const attrs = ch.attributes;
  const levels = ch.levels;
  const classLevels = classLevelsOf(levels);
  const classes = classOrder(levels);

  const bdPv: string[] = [];
  const bdPe: string[] = [];
  const bdClareza: string[] = [];
  const bdRdP: string[] = [];
  const bdRdM: string[] = [];
  const bdDef: string[] = [`10 base`, `${attrs.DES >= 0 ? '+' : ''}${attrs.DES} DES`];

  let pv = 0;
  let pe = 0;
  levels.forEach((l, i) => {
    const c = CLASSES[l.classId];
    if (i === 0) {
      const g = Math.max(1, c.pvInitial + attrs.CON);
      pv += g;
      bdPv.push(`Nível 1 (${c.name}): ${c.pvInitial} + CON = ${g}`);
      pe += c.peInitial;
      bdPe.push(`Nível 1 (${c.name}): ${c.peInitial}`);
    } else {
      const g = Math.max(1, c.pvPerLevel + attrs.CON);
      pv += g;
      bdPv.push(`Nível ${i + 1} (${c.name}): ${c.pvPerLevel} + CON = ${g}`);
      const ge = Math.max(0, c.pePerLevel + (c.peAttr ? attrs[c.peAttr] : 0));
      pe += ge;
      bdPe.push(`Nível ${i + 1} (${c.name}): ${c.pePerLevel}${c.peAttr ? ` + ${ATTRIBUTES[c.peAttr].short}` : ''} = ${ge}`);
    }
  });

  const abilities = levels
    .map((l) => (l.abilityId ? getAbility(l.abilityId) : undefined))
    .filter((a): a is Ability => !!a);

  let clareza = CLAREZA_BASE + attrs.INT;
  bdClareza.push(`Base: ${CLAREZA_BASE} + INT = ${clareza}`);

  let def = 10 + attrs.DES;
  let rdMagic = 0;
  let rdPhysical = 0;
  let unconsciousAtZero = true;
  const damageAttrs: AttrKey[] = [];

  for (const a of abilities) {
    const e = a.effect;
    if (!e) continue;
    if (e.pvMax) { const v = scaled(e.pvMax, attrs); pv += v; bdPv.push(`${a.name}: ${scaledLabel(e.pvMax)} = ${v}`); }
    if (e.peMax) { const v = scaled(e.peMax, attrs); pe += v; bdPe.push(`${a.name}: ${scaledLabel(e.peMax)} = ${v}`); }
    if (e.clarezaMax) { const v = scaled(e.clarezaMax, attrs); clareza += v; bdClareza.push(`${a.name}: ${scaledLabel(e.clarezaMax)} = ${v}`); }
    if (e.def) { const v = scaled(e.def, attrs); def += v; bdDef.push(`${v >= 0 ? '+' : ''}${v} ${a.name}`); }
    if (e.rdMagic) { rdMagic += e.rdMagic; bdRdM.push(`+${e.rdMagic} ${a.name}`); }
    if (e.rdPhysical) { rdPhysical += e.rdPhysical; bdRdP.push(`+${e.rdPhysical} ${a.name}`); }
    if (e.noUnconscious) unconsciousAtZero = false;
    if (e.damageAttr) damageAttrs.push(e.damageAttr);
  }

  for (const it of ch.inventory ?? []) {
    // Só item equipado e inteiro (PV > 0) aplica efeitos.
    if (!it.equipped || (it.pv ?? 1) <= 0 || !it.effects) continue;
    const e = it.effects;
    if (e.def) { def += e.def; bdDef.push(`${e.def >= 0 ? '+' : ''}${e.def} ${it.name}`); }
    if (e.rdPhysical) { rdPhysical += e.rdPhysical; bdRdP.push(`${e.rdPhysical >= 0 ? '+' : ''}${e.rdPhysical} ${it.name}`); }
    if (e.rdMagic) { rdMagic += e.rdMagic; bdRdM.push(`${e.rdMagic >= 0 ? '+' : ''}${e.rdMagic} ${it.name}`); }
  }

  if (ch.rdBonus) {
    rdPhysical += ch.rdBonus.physical;
    rdMagic += ch.rdBonus.magic;
    if (ch.rdBonus.physical) bdRdP.push(`${ch.rdBonus.physical >= 0 ? '+' : ''}${ch.rdBonus.physical} ajuste do mestre`);
    if (ch.rdBonus.magic) bdRdM.push(`${ch.rdBonus.magic >= 0 ? '+' : ''}${ch.rdBonus.magic} ajuste do mestre`);
  }

  const loss = ch.permanentLoss ?? { pv: 0, pe: 0 };
  if (loss.pv) { pv -= loss.pv; bdPv.push(`Perda permanente: -${loss.pv}`); }
  if (loss.pe) { pe -= loss.pe; bdPe.push(`Perda permanente: -${loss.pe}`); }

  pv = Math.max(1, pv);
  pe = Math.max(0, pe);
  clareza = Math.max(0, clareza);

  return {
    level: levels.length,
    classLevels,
    classes,
    title: titleOf(levels),
    pvMax: pv,
    peMax: pe,
    clarezaMax: clareza,
    def,
    von: 10 + attrs.FE,
    rdPhysical: Math.max(0, rdPhysical),
    rdMagic: Math.max(0, rdMagic),
    testBonus: Math.floor(levels.length / 2),
    deathAt: deathThreshold(pv),
    unconsciousAtZero,
    abilities,
    damageAttrs,
    breakdown: { pv: bdPv, pe: bdPe, clareza: bdClareza, def: bdDef, rdPhysical: bdRdP, rdMagic: bdRdM },
  };
}

export type Condition = 'ok' | 'inconsciente' | 'morto' | 'sem-pe';

export function conditionOf(ch: Character, d: Derived = deriveStats(ch)): Condition {
  if (ch.current.pv <= d.deathAt) return 'morto';
  if (ch.current.pv <= 0 && d.unconsciousAtZero) return 'inconsciente';
  if (ch.current.pe <= 0) return 'sem-pe';
  return 'ok';
}

/** Bônus total de teste de um atributo: valor + bônus de nível par. */
export function testModifier(ch: Pick<Character, 'attributes' | 'levels'>, attr: AttrKey): number {
  return ch.attributes[attr] + Math.floor(ch.levels.length / 2);
}
