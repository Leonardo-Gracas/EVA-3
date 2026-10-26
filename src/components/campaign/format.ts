// Negrito e itálico nos textos da campanha, no jeito do Markdown: **negrito** e *itálico*.
// O texto continua sendo texto puro; só a exibição interpreta as marcas.

export type RichNode = string | { kind: 'b' | 'i'; children: RichNode[] };
export type Mark = '**' | '*';

// Negrito: ** colado no texto dos dois lados. Itálico: * colado no texto, sem ser parte de **.
// Nenhum dos dois atravessa linhas, para um asterisco solto não formatar o resto do texto.
const RICH = /\*\*(?=\S)([^\n]*?\S)\*\*(?!\*)|\*(?=[^\s*])([^\n]*?[^\s*])\*(?!\*)/;

export function parseRich(text: string): RichNode[] {
  const out: RichNode[] = [];
  let rest = text;
  for (let m = RICH.exec(rest); m; m = RICH.exec(rest)) {
    if (m.index > 0) out.push(rest.slice(0, m.index));
    out.push(m[1] !== undefined ? { kind: 'b', children: parseRich(m[1]) } : { kind: 'i', children: parseRich(m[2]) });
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) out.push(rest);
  return out;
}

/** Há alguma formatação de verdade no texto? */
export function hasRich(text: string): boolean {
  return text.includes('*') && RICH.test(text);
}

/** Troca a faixa [from, to) por `insert` e deixa selecionado [selStart, selEnd). */
export interface TextEdit { from: number; to: number; insert: string; selStart: number; selEnd: number }

const starsBefore = (v: string, i: number) => { let n = 0; while (i - n - 1 >= 0 && v[i - n - 1] === '*') n++; return n; };
const starsAfter = (v: string, i: number) => { let n = 0; while (i + n < v.length && v[i + n] === '*') n++; return n; };
// Quantos asteriscos de cada lado querem dizer que a marca está ligada (*** = negrito e itálico).
const isOn = (mark: Mark, k: number) => (mark === '**' ? k >= 2 : k % 2 === 1);

/** Liga ou desliga a marca num trecho de uma linha, já sem espaços nas pontas. */
function toggleLine(t: string, mark: Mark): string {
  const n = mark.length;
  const lead = starsAfter(t, 0);
  const trail = starsBefore(t, t.length);
  if (lead < t.length && isOn(mark, Math.min(lead, trail))) return t.slice(n, t.length - n);
  return mark + t + mark;
}

/**
 * O que Ctrl+B / Ctrl+I fazem com a seleção: envolve com a marca ou, se já estiver marcada
 * (por dentro ou por fora da seleção), tira. Sem seleção, abre o par e põe o cursor no meio.
 * Seleção de várias linhas: cada linha é marcada à parte.
 */
export function toggleMark(value: string, start: number, end: number, mark: Mark): TextEdit {
  const n = mark.length;
  let s = start, e = end;
  while (s < e && /\s/.test(value[s])) s++;
  while (e > s && /\s/.test(value[e - 1])) e--;
  const inner = value.slice(s, e);

  if (inner.includes('\n')) {
    const lines = inner.split('\n').map((line) => {
      const m = /^(\s*)(.*?)(\s*)$/.exec(line)!;
      return { pre: m[1], core: m[2], post: m[3] };
    });
    const cores = lines.filter((l) => l.core);
    const allOn = cores.every((l) => {
      const lead = starsAfter(l.core, 0);
      return lead < l.core.length && isOn(mark, Math.min(lead, starsBefore(l.core, l.core.length)));
    });
    const insert = lines.map((l) => {
      if (!l.core) return l.pre + l.post;
      const core = allOn ? l.core.slice(n, l.core.length - n) : mark + l.core + mark;
      return l.pre + core + l.post;
    }).join('\n');
    return { from: s, to: e, insert, selStart: s, selEnd: s + insert.length };
  }

  // Marca dentro da seleção: "**texto**" selecionado inteiro.
  if (inner) {
    const toggled = toggleLine(inner, mark);
    if (toggled.length < inner.length) return { from: s, to: e, insert: toggled, selStart: s, selEnd: s + toggled.length };
  }

  // Marca por fora da seleção (ou em volta do cursor): **|texto|**.
  if (isOn(mark, Math.min(starsBefore(value, s), starsAfter(value, e)))) {
    return { from: s - n, to: e + n, insert: inner, selStart: s - n, selEnd: e - n };
  }

  return { from: s, to: e, insert: mark + inner + mark, selStart: s + n, selEnd: e + n };
}
