// Visão escura: cada um só enxerga o cômodo em que está. O "cômodo" é tudo o que se alcança
// a partir do personagem sem atravessar parede nem porta fechada ou trancada (porta aberta
// deixa ver o outro lado). Móveis não tapam a vista; o vazio é o fim do mapa.
// Puro: o motor corta a visão do jogador com isto e a tela do mestre mostra o que ninguém vê.
import { TERRAIN_CHAR } from '../model/types';
import { EDGE, edgeOf, type Grid, type Point } from './grid';

export interface Vision {
  /** Por quadrado: 1 = visto. */
  seen: Uint8Array;
  /**
   * Soleiras: o quadrado logo depois de uma porta fechada (destrancada) na borda do que se vê.
   * Fica à meia-luz: dá para ir até a porta e atravessar, sem ver quem está do outro lado.
   */
  dim: Set<number>;
}

const STEPS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** `cells`: o terreno do mapa (o vazio não se vê). `g`: as linhas como o jogador enxerga. */
export function visibleArea(g: Grid, cells: string, starts: Point[]): Vision {
  const seen = new Uint8Array(g.w * g.h);
  const dim = new Set<number>();
  const voidChar = TERRAIN_CHAR.void;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < g.w && y < g.h;
  const queue: number[] = [];
  for (const p of starts) {
    if (!inside(p.x, p.y)) continue;
    const i = p.y * g.w + p.x;
    if (!seen[i]) { seen[i] = 1; queue.push(i); }
  }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    const x = i % g.w;
    const y = (i - x) / g.w;
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(nx, ny)) continue;
      const ni = ny * g.w + nx;
      if (seen[ni] || cells[ni] === voidChar) continue;
      const e = edgeOf(g, x, y, dx, dy);
      if (e === EDGE.free) { seen[ni] = 1; queue.push(ni); }
      else if (e === EDGE.closedDoor) dim.add(ni);
    }
  }
  for (const i of dim) if (seen[i]) dim.delete(i);
  return { seen, dim };
}
