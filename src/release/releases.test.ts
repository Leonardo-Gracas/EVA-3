import { describe, expect, it } from 'vitest';
import { RELEASES, VERSION } from './releases';
import pkg from '../../package.json';

const parse = (v: string) => v.split('.').map(Number);
const newer = (a: string, b: string) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

describe('versões', () => {
  it('seguem MAIOR.MENOR.AJUSTE, com data e notas', () => {
    for (const r of RELEASES) {
      expect(r.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.title.trim()).not.toBe('');
      expect(r.notes.length).toBeGreaterThan(0);
    }
  });

  it('vêm da mais nova para a mais antiga, sem repetir', () => {
    for (let i = 1; i < RELEASES.length; i++) expect(newer(RELEASES[i - 1].version, RELEASES[i].version)).toBe(true);
  });

  it('o package.json está na versão atual', () => {
    expect(pkg.version).toBe(VERSION);
  });
});
