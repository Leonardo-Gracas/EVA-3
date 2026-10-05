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

export function validateDraft(d: unknown): string | null {
  if (!d || typeof d !== 'object') return 'Ficha inválida.';
  const draft = d as CharacterDraft;
  if (typeof draft.name !== 'string' || !draft.name.trim()) return 'Dê um nome ao personagem.';
  if (draft.name.length > LIMITS.name) return 'Nome longo demais.';
  if (typeof draft.concept !== 'string' || draft.concept.length > LIMITS.concept) return 'Conceito longo demais.';
  if (typeof draft.notes !== 'string' || draft.notes.length > LIMITS.notes) return 'Anotações longas demais.';
  if (!isValidAttributeSet(draft.attributes)) return 'Distribuição de atributos inválida.';
  if (!isClassId(draft.classId)) return 'Escolha uma classe.';
  return validateLevelPick(draft.attributes, [], { classId: draft.classId, abilityId: draft.abilityId ?? null });
}
