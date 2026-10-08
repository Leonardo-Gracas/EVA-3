// Avatar do personagem (estilo picrew): só IDs de opção trafegam e ficam salvos
// (~170 bytes). O desenho é feito na tela, em SVG, a partir desses IDs.
//
// IDs nunca mudam nem somem: avatares salvos dependem deles. Opção nova entra
// no catálogo e, num campo novo, o `sanitizeAvatar` preenche o padrão.

export const SKINS = [
  { id: 's1', label: 'Muito clara', fill: '#f1dccb', shade: '#dcc0ab', ink: '#4b362c', blush: '#e89a96' },
  { id: 's2', label: 'Clara', fill: '#e3c3a6', shade: '#cba78a', ink: '#4b362c', blush: '#de8f84' },
  { id: 's3', label: 'Média clara', fill: '#c99f80', shade: '#b08568', ink: '#45302a', blush: '#c97a6a' },
  { id: 's4', label: 'Média', fill: '#a87a5c', shade: '#8f6449', ink: '#3a271e', blush: '#a8604f' },
  { id: 's5', label: 'Escura', fill: '#7d5842', shade: '#684735', ink: '#2c1e17', blush: '#86463b' },
  { id: 's6', label: 'Muito escura', fill: '#5a3f30', shade: '#4a3327', ink: '#241812', blush: '#6e3a30' },
] as const;

/** Formato do rosto: do mais marcado (quadrado) ao mais suave (delicado). */
export const FACES = [
  { id: 'oval', label: 'Oval' },
  { id: 'quadrado', label: 'Quadrado' },
  { id: 'delicado', label: 'Delicado' },
  { id: 'redondo', label: 'Redondo' },
] as const;

export const HAIRS = [
  { id: 'curto', label: 'Curto' },
  { id: 'lateral', label: 'Repartido' },
  { id: 'cacheado', label: 'Cacheado' },
  { id: 'longo', label: 'Longo' },
  { id: 'rabo', label: 'Rabo de cavalo' },
  { id: 'coque', label: 'Coque' },
  { id: 'raspado', label: 'Raspado' },
  { id: 'careca', label: 'Careca' },
] as const;

/** `brow`: tom um pouco mais escuro, para as sobrancelhas. */
export const HAIR_COLORS = [
  { id: 'preto', label: 'Preto', fill: '#2b2422', brow: '#221b19' },
  { id: 'castanho_escuro', label: 'Castanho escuro', fill: '#4a3a33', brow: '#3a2c26' },
  { id: 'castanho', label: 'Castanho', fill: '#6e5240', brow: '#523c2f' },
  { id: 'ruivo', label: 'Ruivo', fill: '#9a5b3e', brow: '#7a4530' },
  { id: 'loiro', label: 'Loiro', fill: '#c4a46c', brow: '#9c7f4e' },
  { id: 'grisalho', label: 'Grisalho', fill: '#9d9790', brow: '#76716b' },
  { id: 'branco', label: 'Branco', fill: '#d8d2c8', brow: '#a9a297' },
  { id: 'lavanda', label: 'Lavanda', fill: '#8b80ab', brow: '#6a6087' },
] as const;

/** Barbas acompanham o maxilar de cada formato de rosto. */
export const BEARDS = [
  { id: 'nenhuma', label: 'Nenhuma' },
  { id: 'sombra', label: 'Por fazer' },
  { id: 'bigode', label: 'Bigode' },
  { id: 'cavanhaque', label: 'Cavanhaque' },
  { id: 'cheia', label: 'Cheia' },
  { id: 'longa', label: 'Longa' },
] as const;

export const BROWS = [
  { id: 'retas', label: 'Neutras' },
  { id: 'franzidas', label: 'Franzidas' },
  { id: 'preocupadas', label: 'Preocupadas' },
  { id: 'arqueadas', label: 'Arqueadas' },
  { id: 'erguidas', label: 'Erguidas' },
] as const;

export const EYES = [
  { id: 'amendoa', label: 'Amêndoa' },
  { id: 'firme', label: 'Intenso' },
  { id: 'oval', label: 'Oval' },
  { id: 'ponto', label: 'Ponto' },
  { id: 'sonolento', label: 'Cansado' },
  { id: 'arco', label: 'Sorridente' },
] as const;

export const EYE_COLORS = [
  { id: 'castanho', label: 'Castanho', fill: '#7a5a44' },
  { id: 'verde', label: 'Verde', fill: '#7d9a78' },
  { id: 'azul', label: 'Azul', fill: '#7c97b3' },
  { id: 'cinza', label: 'Cinza', fill: '#8f9399' },
  { id: 'ambar', label: 'Âmbar', fill: '#b8925a' },
  { id: 'violeta', label: 'Violeta', fill: '#958ab8' },
] as const;

export const NOSES = [
  { id: 'ponto', label: 'Ponto' },
  { id: 'linha', label: 'Linha' },
  { id: 'botao', label: 'Botão' },
  { id: 'nenhum', label: 'Nenhum' },
] as const;

/** Do mais contido ao mais expansivo. */
export const MOUTHS = [
  { id: 'neutra', label: 'Neutra' },
  { id: 'seria', label: 'Fechada' },
  { id: 'canto', label: 'Meio sorriso' },
  { id: 'sorriso', label: 'Sorriso' },
  { id: 'aberta', label: 'Riso' },
  { id: 'espanto', label: 'Espanto' },
] as const;

/** Roupas predefinidas: formato e cores fixos, em tons apagados da paleta do site. */
export const OUTFITS = [
  { id: 'casaco', label: 'Casaco', fill: '#b39565', detail: '#8a7149' },
  { id: 'manto', label: 'Manto', fill: '#8d82b8', detail: '#d6bd85' },
  { id: 'armadura', label: 'Armadura', fill: '#8e9aa6', detail: '#aab5c0' },
  { id: 'tunica', label: 'Túnica', fill: '#8aa892', detail: '#6d8a75' },
  { id: 'colete', label: 'Colete', fill: '#9a5a60', detail: '#d9cfc0' },
  { id: 'capuz', label: 'Capuz', fill: '#7f7b78', detail: '#66625f' },
  { id: 'terno', label: 'Terno', fill: '#3b3b42', detail: '#7a3a40' },
  { id: 'tunica_capuz', label: 'Túnica com capuz', fill: '#2e2a2d', detail: '#4a434b' },
  { id: 'batina', label: 'Batina', fill: '#29262b', detail: '#e8e2d6' },
  { id: 'sobretudo', label: 'Sobretudo', fill: '#6b5a48', detail: '#88735b' },
  { id: 'camisa', label: 'Camisa', fill: '#c9bfae', detail: '#a89e8d' },
  { id: 'jaqueta', label: 'Jaqueta', fill: '#4a3b33', detail: '#6a564b' },
] as const;

/** Fundos escuros e apagados (destacam a pele em tons claros), e um claro. */
export const BACKGROUNDS = [
  { id: 'carvao', label: 'Carvão', fill: '#3d3429' },
  { id: 'ouro', label: 'Ouro velho', fill: '#4d4130' },
  { id: 'vinho', label: 'Vinho', fill: '#4a2c30' },
  { id: 'violeta', label: 'Violeta', fill: '#383452' },
  { id: 'petroleo', label: 'Petróleo', fill: '#263e40' },
  { id: 'musgo', label: 'Musgo', fill: '#33402f' },
  { id: 'aco', label: 'Aço', fill: '#353b45' },
  { id: 'areia', label: 'Areia', fill: '#9c8d74' },
] as const;

export type SkinId = (typeof SKINS)[number]['id'];
export type FaceId = (typeof FACES)[number]['id'];
export type HairId = (typeof HAIRS)[number]['id'];
export type HairColorId = (typeof HAIR_COLORS)[number]['id'];
export type BeardId = (typeof BEARDS)[number]['id'];
export type BrowsId = (typeof BROWS)[number]['id'];
export type EyesId = (typeof EYES)[number]['id'];
export type EyeColorId = (typeof EYE_COLORS)[number]['id'];
export type NoseId = (typeof NOSES)[number]['id'];
export type MouthId = (typeof MOUTHS)[number]['id'];
export type OutfitId = (typeof OUTFITS)[number]['id'];
export type BackgroundId = (typeof BACKGROUNDS)[number]['id'];

export interface AvatarConfig {
  /** Versão do formato, para acrescentar opções sem quebrar avatares salvos. */
  v: 1;
  skin: SkinId;
  face: FaceId;
  hair: HairId;
  hairColor: HairColorId;
  beard: BeardId;
  brows: BrowsId;
  eyes: EyesId;
  eyeColor: EyeColorId;
  nose: NoseId;
  mouth: MouthId;
  outfit: OutfitId;
  bg: BackgroundId;
}

/** Padrão sóbrio: expressão neutra; o jogador puxa para o alegre se quiser. */
export const DEFAULT_AVATAR: AvatarConfig = {
  v: 1, skin: 's3', face: 'oval', hair: 'curto', hairColor: 'castanho_escuro', beard: 'nenhuma', brows: 'retas',
  eyes: 'amendoa', eyeColor: 'castanho', nose: 'ponto', mouth: 'neutra', outfit: 'casaco', bg: 'carvao',
};

/** Catálogo de cada campo: a mesma tabela serve ao sanitizador e ao sorteio. */
const CATALOG = {
  skin: SKINS, face: FACES, hair: HAIRS, hairColor: HAIR_COLORS, beard: BEARDS, brows: BROWS, eyes: EYES,
  eyeColor: EYE_COLORS, nose: NOSES, mouth: MOUTHS, outfit: OUTFITS, bg: BACKGROUNDS,
} satisfies { [K in Exclude<keyof AvatarConfig, 'v'>]: ReadonlyArray<{ id: AvatarConfig[K] }> };
type Field = keyof typeof CATALOG;
const FIELDS = Object.keys(CATALOG) as Field[];
/** O `satisfies` acima garante a correspondência campo ↔ catálogo; aqui basta a lista de ids. */
const idsOf = (f: Field) => CATALOG[f] as ReadonlyArray<{ id: string }>;

/**
 * Sorteia um avatar inteiro. Barba sai em 1 de cada 3 (para não dominar o sorteio).
 * `rng` devolve [0, 1); os testes passam um fixo.
 */
export function randomAvatar(rng: () => number = Math.random): AvatarConfig {
  const any = <T>(list: readonly T[]) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  const out = { v: 1, ...Object.fromEntries(FIELDS.map((f) => [f, any(idsOf(f)).id])) } as AvatarConfig;
  if (rng() >= 1 / 3) out.beard = 'nenhuma';
  return out;
}

function pick<T extends { id: string }>(list: readonly T[], v: unknown, fallback: T['id']): T['id'] {
  return typeof v === 'string' && list.some((o) => o.id === v) ? (v as T['id']) : fallback;
}

/** Aceita qualquer coisa: campo desconhecido vira o padrão, chaves extras somem. */
export function sanitizeAvatar(raw: unknown): AvatarConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = Object.fromEntries(FIELDS.map((f) => [f, pick(idsOf(f), r[f], DEFAULT_AVATAR[f])]));
  return { v: 1, ...out } as AvatarConfig;
}

export function sameAvatar(a: AvatarConfig, b: AvatarConfig): boolean {
  return (Object.keys(DEFAULT_AVATAR) as Array<keyof AvatarConfig>).every((k) => a[k] === b[k]);
}

/**
 * Avatar a desenhar: fichas antigas (sem avatar) usam o padrão, e avatares salvos
 * antes de um campo existir ganham o padrão desse campo.
 */
export function avatarFor(ch: { avatar?: AvatarConfig | null }): AvatarConfig {
  return ch.avatar ? sanitizeAvatar(ch.avatar) : DEFAULT_AVATAR;
}
