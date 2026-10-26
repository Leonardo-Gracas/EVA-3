import { describe, expect, it } from 'vitest';
import { hasRich, parseRich, toggleMark, type Mark, type RichNode, type TextEdit } from './format';

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

  it('hasRich', () => {
    expect(hasRich('o **padre**')).toBe(true);
    expect(hasRich('2 * 3')).toBe(false);
    expect(hasRich('sem nada')).toBe(false);
  });
});

/** Aplica a edição e marca a seleção com [ ]. */
function run(text: string, mark: Mark) {
  const start = text.indexOf('['), end = text.indexOf(']') - 1;
  const value = text.replace('[', '').replace(']', '');
  const ed: TextEdit = toggleMark(value, start, end, mark);
  const out = value.slice(0, ed.from) + ed.insert + value.slice(ed.to);
  return out.slice(0, ed.selStart) + '[' + out.slice(ed.selStart, ed.selEnd) + ']' + out.slice(ed.selEnd);
}

describe('toggleMark', () => {
  it('envolve a seleção', () => {
    expect(run('o [padre] mente', '**')).toBe('o **[padre]** mente');
    expect(run('o [padre] mente', '*')).toBe('o *[padre]* mente');
  });

  it('não leva os espaços das pontas para dentro da marca', () => {
    expect(run('o[ padre ]mente', '**')).toBe('o **[padre]** mente');
  });

  it('sem seleção, abre o par com o cursor no meio; de novo, desfaz', () => {
    expect(run('a []b', '**')).toBe('a **[]**b');
    expect(run('a **[]**b', '**')).toBe('a []b');
  });

  it('tira a marca de fora ou de dentro da seleção', () => {
    expect(run('o **[padre]** mente', '**')).toBe('o [padre] mente');
    expect(run('o [**padre**] mente', '**')).toBe('o [padre] mente');
    expect(run('o *[padre]* mente', '*')).toBe('o [padre] mente');
  });

  it('negrito e itálico se combinam', () => {
    expect(run('**[padre]**', '*')).toBe('***[padre]***');
    expect(run('***[padre]***', '*')).toBe('**[padre]**');
    expect(run('***[padre]***', '**')).toBe('*[padre]*');
    // Itálico não confunde o negrito com uma marca de itálico.
    expect(run('**[padre]**', '**')).toBe('[padre]');
  });

  it('várias linhas: cada uma à parte, e desfaz do mesmo jeito', () => {
    expect(run('[um\n  dois\n\ntrês]', '**')).toBe('[**um**\n  **dois**\n\n**três**]');
    expect(run('[**um**\n**dois**]', '**')).toBe('[um\ndois]');
  });
});
