import { describe, expect, it } from 'vitest';
import { parseRich, richFromRuns, type RichNode, type RichRun } from './format';

const b = (...children: RichNode[]): RichNode => ({ kind: 'b', children });
const i = (...children: RichNode[]): RichNode => ({ kind: 'i', children });

describe('parseRich', () => {
  it('texto sem marcas fica igual', () => {
    expect(parseRich('nada aqui')).toEqual(['nada aqui']);
    expect(parseRich('')).toEqual([]);
  });

  it('negrito e itálico', () => {
    expect(parseRich('o **padre** mente e *sabe*')).toEqual(['o ', b('padre'), ' mente e ', i('sabe')]);
    expect(parseRich('*a*')).toEqual([i('a')]);
  });

  it('negrito e itálico juntos e aninhados', () => {
    expect(parseRich('***os dois***')).toEqual([b(i('os dois'))]);
    expect(parseRich('*fala **muito** baixo*')).toEqual([i('fala ', b('muito'), ' baixo')]);
  });

  it('asterisco solto ou com espaço não formata', () => {
    expect(parseRich('2 * 3 * 4')).toEqual(['2 * 3 * 4']);
    expect(parseRich('** solto **')).toEqual(['** solto **']);
    expect(parseRich('**sem fim')).toEqual(['**sem fim']);
  });

  it('não atravessa linhas', () => {
    expect(parseRich('**uma\noutra**')).toEqual(['**uma\noutra**']);
  });
});

const run = (text: string, b = false, it = false): RichRun => ({ text, b, i: it });

describe('richFromRuns', () => {
  it('texto simples fica igual', () => {
    expect(richFromRuns([run('nada aqui')])).toBe('nada aqui');
    expect(richFromRuns([])).toBe('');
  });

  it('marca negrito e itálico', () => {
    expect(richFromRuns([run('o '), run('padre', true), run(' mente e '), run('sabe', false, true)])).toBe('o **padre** mente e *sabe*');
    expect(richFromRuns([run('os dois', true, true)])).toBe('***os dois***');
  });

  it('junta trechos vizinhos com a mesma formatação', () => {
    expect(richFromRuns([run('pa', true), run('dre', true)])).toBe('**padre**');
  });

  it('deixa os espaços das pontas fora das marcas', () => {
    expect(richFromRuns([run('o'), run(' padre ', true), run('mente')])).toBe('o **padre** mente');
    expect(richFromRuns([run('a'), run('  ', true), run('b')])).toBe('a  b');
  });

  it('marca cada linha à parte', () => {
    expect(richFromRuns([run('um\ndois', true)])).toBe('**um**\n**dois**');
    expect(richFromRuns([run('um\n\ndois', true)])).toBe('**um**\n\n**dois**');
  });

  it('itálico dentro do negrito', () => {
    const md = richFromRuns([run('fala ', true), run('muito', true, true), run(' baixo', true)]);
    expect(parseRich(md)).toEqual([b('fala ', i('muito'), ' baixo')]);
  });

  it('ida e volta pelo parseRich', () => {
    const md = richFromRuns([run('o '), run('padre', true), run(' sabe de '), run('tudo', false, true), run('.')]);
    expect(parseRich(md)).toEqual(['o ', b('padre'), ' sabe de ', i('tudo'), '.']);
  });
});
