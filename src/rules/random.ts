// Aleatório com semente: a mesma semente sempre dá a mesma sequência.
// Serve para o gerador de mapas (a prévia do mestre e o motor chegam ao mesmo mapa).

/** Números em [0, 1). */
export type SeededRng = () => number;

export function mulberry32(seed: number): SeededRng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inteiro de a a b, inclusive. */
export const randInt = (r: SeededRng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

/** Semente nova (para "Outra versão"). */
export const newSeed = () => Math.floor(Math.random() * 2 ** 31);
