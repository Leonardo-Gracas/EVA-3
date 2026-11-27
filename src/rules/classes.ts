// Classes do EVA 3: as quatro classes base (níveis 1 a 9, máximo de 2 por personagem),
// os títulos das combinações e as classes especialistas (níveis 10 a 12).
import type { AttrKey } from './attributes';

export type BaseClassId = 'combatente' | 'acolito' | 'ocultista' | 'vidente';
export type SpecialistId = 'necromago';
export type ClassId = BaseClassId | SpecialistId;

// Ordem de exibição: o Combatente fica por último.
export const CLASS_IDS: BaseClassId[] = ['acolito', 'ocultista', 'vidente', 'combatente'];
export const SPECIALIST_IDS: SpecialistId[] = ['necromago'];
export const ALL_CLASS_IDS: ClassId[] = [...CLASS_IDS, ...SPECIALIST_IDS];

export const MAX_LEVEL = 12;
export const MAX_CLASSES = 2;
/** Nível na classe para quem fica em uma classe só ganhar o título (Veterano, Exorcista…). */
export const PURE_TITLE_LEVEL = 9;
/** Nível do personagem que define a classe especialista; os níveis seguintes vão para ela. */
export const SPECIALIST_LEVEL = 9;

export interface ClassInfo {
  id: ClassId;
  name: string;
  tagline: string;
  description: string;
  /** PV no primeiro nível do personagem: base + CON. */
  pvInitial: number;
  /** PV ganho por nível seguinte: base + atributo (CON nas classes base). */
  pvPerLevel: number;
  pvAttr: AttrKey | null;
  /** PE no primeiro nível do personagem. */
  peInitial: number;
  /** PE ganho por nível seguinte: base + atributo (quando houver). */
  pePerLevel: number;
  peAttr: AttrKey | null;
  color: string;
  /** Classe especialista: as classes base que a formam (iguais para quem ficou em uma só). */
  from?: [BaseClassId, BaseClassId];
}

export const CLASSES: Record<ClassId, ClassInfo> = {
  combatente: {
    id: 'combatente',
    name: 'Combatente',
    tagline: 'Para um combatente, a magia é perda de tempo.',
    description:
      'Lutador nato. Tem algum problema? Violência só não resolve quando é pouca. Seus poderes melhoram situações de combate e o estrago feito por seus golpes. Também te torna mais experiente, fazendo com que seja mais difícil de ser acertado ou danificado gravemente.',
    pvInitial: 12,
    pvPerLevel: 4,
    pvAttr: 'CON',
    peInitial: 3,
    pePerLevel: 2,
    peAttr: null,
    color: '#c0563f',
  },
  acolito: {
    id: 'acolito',
    name: 'Acólito',
    tagline: 'Para um acólito, a magia é sagrada.',
    description:
      'Conhecedor da barreira entre o sagrado e o mundano, e vigia dela. Sua fé é ferramenta e escudo: abençoa lâminas, cura aliados e repreende o que não deveria estar aqui. Onde a corrupção se manifesta, é o primeiro a erguer o catalisador e o último a recuar. Também é o único capaz de expurgar uma entidade de vez, se tiver forças para pagar o preço.',
    pvInitial: 10,
    pvPerLevel: 3,
    pvAttr: 'CON',
    peInitial: 2,
    pePerLevel: 2,
    peAttr: 'FE',
    color: '#d9b45a',
  },
  ocultista: {
    id: 'ocultista',
    name: 'Ocultista',
    tagline: 'Para um ocultista, a magia é ciência.',
    description:
      'Conhecedor das artes místicas e ocultas. Não reza nem pede: entende. Estuda as regras por trás da realidade e a manipula como ela pede pra ser manipulada, dobrando fogo, metal, raízes e temperatura à sua vontade. Seu conhecimento vai além do permitido, e alguns de seus caminhos cobram em sangue e alma o que outros jamais ousariam pagar.',
    pvInitial: 8,
    pvPerLevel: 2,
    pvAttr: 'CON',
    peInitial: 2,
    pePerLevel: 2,
    peAttr: 'INT',
    color: '#8a6fd6',
  },
  vidente: {
    id: 'vidente',
    name: 'Vidente',
    tagline: 'Para um vidente, a magia é arte.',
    description:
      'Enxerga o mundo de uma maneira diferente, mais profunda. Trespassa limites da realidade que outros não conseguem. Enxerga futuro, presente e passado com precisão sobrenatural. Também é o mais propício a ser contatado pelo outro lado.',
    pvInitial: 6,
    pvPerLevel: 2,
    pvAttr: 'CON',
    peInitial: 2,
    pePerLevel: 2,
    peAttr: 'PRE',
    color: '#4fa3b8',
  },
  necromago: {
    id: 'necromago',
    name: 'Necromago',
    tagline: 'Para um necromago, a morte é só mais uma porta.',
    description:
      'Ocultista e Vidente que atravessou a fronteira entre os vivos e os mortos. Toma corpos para si, convoca as tormentas esquecidas do mundo dos mortos e reescreve o Vinculum dos espíritos, mesmo sabendo o preço desse pecado.',
    pvInitial: 0,
    pvPerLevel: 6,
    pvAttr: null,
    peInitial: 0,
    pePerLevel: 6,
    peAttr: null,
    color: '#7f86d8',
    from: ['ocultista', 'vidente'],
  },
};

/** Título pela dupla de classes. A ordem não importa. */
const TITLES: Record<string, string> = {
  'combatente+combatente': 'Veterano',
  'acolito+combatente': 'Paladino',
  'combatente+ocultista': 'Bruxo',
  'combatente+vidente': 'Sentinela',
  'acolito+acolito': 'Exorcista',
  'acolito+ocultista': 'Mago',
  'acolito+vidente': 'Peregrino',
  'ocultista+ocultista': 'Feiticeiro',
  'ocultista+vidente': 'Necromago',
  'vidente+vidente': 'Oráculo',
};

export function titleFor(a: BaseClassId, b: BaseClassId): string {
  const key = [a, b].sort().join('+');
  return TITLES[key] ?? `${CLASSES[a].name}/${CLASSES[b].name}`;
}

/** Todas as combinações, para a tela de referência. */
export function allTitles(): Array<{ a: BaseClassId; b: BaseClassId; title: string }> {
  const out: Array<{ a: BaseClassId; b: BaseClassId; title: string }> = [];
  CLASS_IDS.forEach((a, i) => {
    CLASS_IDS.slice(i).forEach((b) => out.push({ a, b, title: titleFor(a, b) }));
  });
  return out;
}

export function isSpecialist(c: ClassId): c is SpecialistId {
  return (SPECIALIST_IDS as string[]).includes(c);
}

/**
 * Classe especialista da combinação (a ordem não importa; `b` igual a `a` para quem
 * ficou em uma classe só). null enquanto a especialista dessa combinação não existe.
 */
export function specialistFor(a: BaseClassId, b: BaseClassId = a): SpecialistId | null {
  const key = [a, b].sort().join('+');
  return SPECIALIST_IDS.find((s) => [...CLASSES[s].from!].sort().join('+') === key) ?? null;
}
