import { describe, expect, it } from 'vitest';
import {
  avatarFor, DEFAULT_AVATAR, OUTFITS, randomAvatar, sameAvatar, sanitizeAvatar, SKINS, type AvatarConfig,
} from './avatar';

describe('avatar', () => {
  it('lixo vira o padrão', () => {
    for (const raw of [null, undefined, 42, 'x', [], {}]) expect(sanitizeAvatar(raw)).toEqual(DEFAULT_AVATAR);
  });

  it('troca só o campo desconhecido e remove chaves extras', () => {
    const out = sanitizeAvatar({ v: 9, skin: 's6', hair: 'moicano', eyes: 5, outfit: 'capuz', svg: '<script>' });
    expect(out).toEqual({ ...DEFAULT_AVATAR, skin: 's6', outfit: 'capuz' });
    expect(Object.keys(out).sort()).toEqual(Object.keys(DEFAULT_AVATAR).sort());
  });

  it('configuração válida passa igual e é pequena', () => {
    const cfg: AvatarConfig = {
      v: 1, skin: SKINS[5].id, face: 'quadrado', hair: 'cacheado', hairColor: 'ruivo', beard: 'cavanhaque', brows: 'franzidas',
      eyes: 'firme', eyeColor: 'violeta', nose: 'nenhum', mouth: 'canto', outfit: OUTFITS[OUTFITS.length - 1].id, bg: 'petroleo',
    };
    expect(sanitizeAvatar(cfg)).toEqual(cfg);
    expect(sameAvatar(sanitizeAvatar(cfg), cfg)).toBe(true);
    expect(sameAvatar(cfg, DEFAULT_AVATAR)).toBe(false);
    expect(JSON.stringify(cfg).length).toBeLessThan(240);
  });

  it('ficha sem avatar desenha o padrão', () => {
    expect(avatarFor({})).toBe(DEFAULT_AVATAR);
    expect(avatarFor({ avatar: null })).toBe(DEFAULT_AVATAR);
  });

  it('avatar salvo antes dos campos novos ganha o padrão deles e mantém o resto', () => {
    const old = { v: 1, skin: 's2', hair: 'longo', eyes: 'oval', eyeColor: 'verde', nose: 'linha', mouth: 'sorriso', outfit: 'manto' };
    expect(avatarFor({ avatar: old as never })).toEqual({
      ...old, face: DEFAULT_AVATAR.face, brows: DEFAULT_AVATAR.brows, bg: DEFAULT_AVATAR.bg,
      hairColor: DEFAULT_AVATAR.hairColor, beard: DEFAULT_AVATAR.beard,
    });
  });

  it('sorteio só gera opções válidas, inclusive nos extremos do rng', () => {
    for (const r of [0, 0.5, 0.999999]) {
      const a = randomAvatar(() => r);
      expect(sanitizeAvatar(a)).toEqual(a);
    }
    // Uma chamada por campo (12) e a última decide se a barba sorteada fica (1 em 3).
    expect(randomAvatar(() => 0.99).beard).toBe('nenhuma');
    let n = 0;
    expect(randomAvatar(() => (++n <= 12 ? 0.99 : 0.1)).beard).toBe('longa');
  });
});
