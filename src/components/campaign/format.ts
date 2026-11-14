// Negrito e itálico nos textos da campanha, guardados no jeito do Markdown: **negrito** e *itálico*.
// O texto salvo continua sendo texto puro; o editor mostra a formatação e esconde as marcas.

export type RichNode = string | { kind: 'b' | 'i'; children: RichNode[] };

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

/** Um trecho do editor com a formatação que está à vista. */
export interface RichRun { text: string; b: boolean; i: boolean }

/** Põe a marca em volta de cada linha do trecho, com os espaços das pontas do lado de fora. */
function wrapLines(text: string, mark: string): string {
  return text.split('\n').map((line) => {
    const m = /^(\s*)(.*?)(\s*)$/.exec(line)!;
    return m[2] ? m[1] + mark + m[2] + mark + m[3] : line;
  }).join('\n');
}

/** Agrupa trechos vizinhos que têm o mesmo valor em `key`. */
function groupBy(runs: RichRun[], key: 'b' | 'i'): RichRun[][] {
  const out: RichRun[][] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last[0][key] === r[key]) last.push(r);
    else out.push([r]);
  }
  return out;
}

/** Converte o que está no editor (trechos com negrito/itálico) de volta para o texto com marcas. */
export function richFromRuns(runs: RichRun[]): string {
  const clean = runs.filter((r) => r.text);
  return groupBy(clean, 'b').map((bg) => {
    const inner = groupBy(bg, 'i').map((ig) => {
      const text = ig.map((r) => r.text).join('');
      return ig[0].i ? wrapLines(text, '*') : text;
    }).join('');
    return bg[0].b ? wrapLines(inner, '**') : inner;
  }).join('');
}
