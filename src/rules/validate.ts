// Validação de criação de ficha e subida de nível. Roda no mestre (autoridade)
// e também na tela, para mostrar o que é permitido antes de enviar.
import { isValidAttributeSet, type Attributes } from './attributes';
import { CLASS_IDS, CLASSES, MAX_CLASSES, MAX_LEVEL, type ClassId } from './classes';
import { abilitiesOf, getAbility, type Ability } from './abilities';
import { classLevelsOf, classOrder } from './derive';
import type { CharacterDraft, LevelPick } from '../model/types';

export const LIMITS = {
  name: 60,
  concept: 200,
  notes: 4000,
  itemName: 80,
  itemText: 1000,
  itemDamage: 40,
  tableName: 60,
  userName: 32,
  caseTitle: 80,
  caseText: 1000,
  clueTitle: 80,
  clueText: 1000,
};

export function isClassId(v: unknown): v is ClassId {
  return typeof v === 'string' && (CLASS_IDS as string[]).includes(v);
}

/** Classes que podem receber o próximo nível. */
export function classesAvailable(levels: LevelPick[]): ClassId[] {
  if (levels.length >= MAX_LEVEL) return [];
  const owned = classOrder(levels);
  if (owned.length >= MAX_CLASSES) return owned;
  return CLASS_IDS;
}

export interface AbilityOption {
  ability: Ability;
  eligible: boolean;
  reason?: string;
}

/**
 * Habilidades da classe que recebe o nível, marcando quais podem ser escolhidas.
 * O requisito de nível é o nível NA CLASSE já contando o nível que está sendo ganho.
 */
export function abilityOptions(attrs: Attributes, levels: LevelPick[], classId: ClassId): AbilityOption[] {
  const classLevel = classLevelsOf(levels)[classId] + 1;
  const taken = new Set(levels.map((l) => l.abilityId).filter(Boolean) as string[]);
  return abilitiesOf(classId).map((ability) => {
    if (taken.has(ability.id)) return { ability, eligible: false, reason: 'Já possui' };
    if (ability.minClassLevel > classLevel) {
      return { ability, eligible: false, reason: `Requer ${ability.minClassLevel}º nível de ${CLASSES[classId].name}` };
    }
    const req = ability.requires;
    if (req?.attr && attrs[req.attr.key] < req.attr.min) {
      return { ability, eligible: false, reason: `Requer ${req.attr.key === 'FE' ? 'FÉ' : req.attr.key} ${req.attr.min}+` };
    }
    if (req?.ability && !taken.has(req.ability)) {
      return { ability, eligible: false, reason: `Requer ${getAbility(req.ability)?.name ?? req.ability}` };
    }
    return { ability, eligible: true };
  });
}

export function validateLevelPick(attrs: Attributes, levels: LevelPick[], pick: LevelPick): string | null {
  if (levels.length >= MAX_LEVEL) return `Nível máximo é ${MAX_LEVEL}.`;
  if (!isClassId(pick.classId)) return 'Classe inválida.';
  if (!classesAvailable(levels).includes(pick.classId)) return `Máximo de ${MAX_CLASSES} classes por personagem.`;
  const options = abilityOptions(attrs, levels, pick.classId);
  const eligible = options.filter((o) => o.eligible);
  if (pick.abilityId === null) {
    return eligible.length ? 'Escolha uma habilidade.' : null;
  }
  const opt = options.find((o) => o.ability.id === pick.abilityId);
  if (!opt) return 'Habilidade não pertence a essa classe.';
  if (!opt.eligible) return `${opt.ability.name}: ${opt.reason}.`;
  return null;
}

/**
 * Ajusta os níveis depois de mudar atributos ou um nível anterior: classe que não
 * cabe mais (3ª classe) volta para a classe do nível de antes, e habilidade que
 * deixou de cumprir requisito (ou já foi pega antes) é desmarcada.
 */
export function sanitizeLevels(attrs: Attributes, levels: LevelPick[]): LevelPick[] {
  const out: LevelPick[] = [];
  for (const l of levels) {
    let pick = l;
    if (!classesAvailable(out).includes(pick.classId)) pick = { classId: out[out.length - 1].classId, abilityId: null };
    if (pick.abilityId && !abilityOptions(attrs, out, pick.classId).find((o) => o.ability.id === pick.abilityId)?.eligible) {
      pick = { ...pick, abilityId: null };
    }
    out.push(pick);
  }
  return out;
}

/** Muda o nível do rascunho: corta os níveis a mais ou repete a última classe, sem habilidade. */
export function resizeLevels(attrs: Attributes, levels: LevelPick[], level: number): LevelPick[] {
  const n = Math.max(1, Math.min(MAX_LEVEL, level));
  if (levels.length >= n) return levels.slice(0, n);
  const last = levels[levels.length - 1]?.classId ?? CLASS_IDS[0];
  return sanitizeLevels(attrs, [...levels, ...Array.from({ length: n - levels.length }, () => ({ classId: last, abilityId: null }))]);
}

/** Primeiro nível (índice) inválido do rascunho e o motivo, ou null se todos valem. */
export function firstInvalidLevel(attrs: Attributes, levels: LevelPick[]): { index: number; error: string } | null {
  for (let i = 0; i < levels.length; i++) {
    const l = levels[i];
    const error = l && typeof l === 'object'
      ? validateLevelPick(attrs, levels.slice(0, i), { classId: l.classId, abilityId: l.abilityId ?? null })
      : 'Nível inválido.';
    if (error) return { index: i, error };
  }
  return null;
}

/** `level`: nível exigido (o nível inicial da mesa, para jogadores). */
export function validateDraft(d: unknown, level?: number): string | null {
  if (!d || typeof d !== 'object') return 'Ficha inválida.';
  const draft = d as CharacterDraft;
  if (typeof draft.name !== 'string' || !draft.name.trim()) return 'Dê um nome ao personagem.';
  if (draft.name.length > LIMITS.name) return 'Nome longo demais.';
  if (typeof draft.concept !== 'string' || draft.concept.length > LIMITS.concept) return 'Conceito longo demais.';
  if (typeof draft.notes !== 'string' || draft.notes.length > LIMITS.notes) return 'Anotações longas demais.';
  if (!isValidAttributeSet(draft.attributes)) return 'Distribuição de atributos inválida.';
  if (!Array.isArray(draft.levels) || draft.levels.length < 1 || draft.levels.length > MAX_LEVEL) return 'Nível inválido.';
  if (level !== undefined && draft.levels.length !== level) return `Personagens desta mesa começam no nível ${level}.`;
  if (!draft.levels.every((l) => l && typeof l === 'object' && isClassId(l.classId))) return 'Escolha uma classe.';
  const bad = firstInvalidLevel(draft.attributes, draft.levels);
  if (!bad) return null;
  return draft.levels.length > 1 ? `Nível ${bad.index + 1}: ${bad.error}` : bad.error;
}
