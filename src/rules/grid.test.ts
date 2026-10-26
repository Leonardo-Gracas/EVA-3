import { describe, expect, it } from 'vitest';
import {
  buildGrid, canEnd, costTo, extendPath, followPath, pathTo, reachableCells, reachFrom, squaresFor, stepCost, type GridSource,
} from './grid';
import { blankLayout, cellLabel, setWalls, wallAround } from '../model/map';
import type { MapObject } from '../model/types';

/** Mapa aberto w×h, com paredes e objetos opcionais. Linhas de texto: '.', '#', '~', '>'. */
function map(rows: string[], objects: MapObject[] = []): GridSource & { wallsH: string; wallsV: string } {
  const h = rows.length;
  const w = rows[0].length;
  const m = { ...blankLayout(w, h), cells: rows.join(''), objects };
  return m;
}

describe('deslocamento em quadrados', () => {
  it('9 m dá 6 quadrados; 1,5 m por quadrado', () => {
    expect(squaresFor(9)).toBe(6);
    expect(squaresFor(10)).toBe(6);
    expect(squaresFor(1.5)).toBe(1);
    expect(squaresFor(0)).toBe(0);
  });

  it('custo do passo', () => {
    expect(stepCost(1, false, 0)).toBe(1);
    expect(stepCost(1, true, 0)).toBe(1);
    expect(stepCost(1, true, 1)).toBe(2);
    expect(stepCost(2, false, 1)).toBe(2);
    expect(stepCost(2, true, 1)).toBe(4);
  });

  it('rótulo do quadrado', () => {
    expect(cellLabel(0, 0)).toBe('A1');
    expect(cellLabel(2, 6)).toBe('C7');
    expect(cellLabel(26, 0)).toBe('AA1');
  });
});

describe('alcance', () => {
  const open = map(Array(10).fill('..........'));

  it('reta custa um por quadrado', () => {
    const r = reachFrom(buildGrid(open), { x: 0, y: 0 }, 20);
    expect(costTo(r, 5, 0)).toBe(5);
    expect(costTo(r, 0, 7)).toBe(7);
  });

  it('diagonais alternam 1, 2, 1, 2...', () => {
    const r = reachFrom(buildGrid(open), { x: 0, y: 0 }, 20);
    expect(costTo(r, 1, 1)).toBe(1);
    expect(costTo(r, 2, 2)).toBe(3);
    expect(costTo(r, 5, 5)).toBe(1 + 2 + 1 + 2 + 1);
    // 2 diagonais + 1 reta: 1 + 2 + 1 = 4 (ou reta antes, mesmo custo).
    expect(costTo(r, 3, 2)).toBe(4);
  });

  it('a paridade carrega entre movimentos do mesmo turno', () => {
    const r = reachFrom(buildGrid(open), { x: 0, y: 0 }, 20, 1);
    expect(costTo(r, 1, 1)).toBe(2);
    expect(costTo(r, 2, 2)).toBe(3);
    const p = pathTo(r, 1, 1)!;
    expect(p.parity).toBe(0);
  });

  it('respeita o orçamento', () => {
    const r = reachFrom(buildGrid(open), { x: 0, y: 0 }, 6);
    expect(costTo(r, 6, 0)).toBe(6);
    expect(costTo(r, 7, 0)).toBe(-1);
    // 4 diagonais = 6: dá para (4,4), não para (5,5).
    expect(costTo(r, 4, 4)).toBe(6);
    expect(costTo(r, 5, 5)).toBe(-1);
  });

  it('terreno difícil e escada dobram o custo', () => {
    const g = buildGrid(map(['.~~..', '.....', '>....']));
    const r = reachFrom(g, { x: 0, y: 0 }, 20);
    expect(costTo(r, 1, 0)).toBe(2);
    // Contornar pela linha de baixo (4) sai mais barato que atravessar o terreno difícil (5).
    expect(costTo(r, 3, 0)).toBe(4);
    expect(costTo(r, 0, 2)).toBe(1 + 2);
    // Diagonal em terreno difícil: 2 ou 4.
    const d = reachFrom(buildGrid(map(['..', '.~'])), { x: 0, y: 0 }, 20);
    expect(costTo(d, 1, 1)).toBe(2);
  });

  it('vazio bloqueia', () => {
    const g = buildGrid(map(['.#.', '.#.', '...']));
    const r = reachFrom(g, { x: 0, y: 0 }, 20);
    expect(costTo(r, 1, 0)).toBe(-1);
    // Contorna por baixo sem cortar os cantos do vazio: 6 passos retos.
    expect(costTo(r, 2, 0)).toBe(6);
  });

  it('parede na linha bloqueia e a diagonal não corta o canto', () => {
    const m = map(['...', '...', '...']);
    // Parede vertical entre x=0 e x=1, na linha 0.
    setWalls(m, [{ o: 'v', x: 1, y: 0 }], true);
    const r = reachFrom(buildGrid(m), { x: 0, y: 0 }, 20);
    expect(costTo(r, 1, 0)).toBe(3); // desce, anda, sobe (a diagonal de (0,1) para (1,0) tocaria a parede)
    // De (0,1) para (1,0) seria diagonal tocando a parede: não pode.
    const r2 = reachFrom(buildGrid(m), { x: 0, y: 1 }, 20);
    expect(costTo(r2, 1, 0)).toBe(2);
  });

  it('obstáculo bloqueia, móvel é terreno difícil, decoração não muda nada', () => {
    const objects: MapObject[] = [
      { id: 'a', kind: 'prop', prop: 'pilar', label: '', x: 1, y: 0, w: 1, h: 1, effect: 'block', hidden: false },
      { id: 'b', kind: 'prop', prop: 'mesa', label: '', x: 0, y: 1, w: 1, h: 1, effect: 'difficult', hidden: false },
      { id: 'c', kind: 'prop', prop: 'outro', label: '', x: 2, y: 2, w: 1, h: 1, effect: 'none', hidden: false },
    ];
    const g = buildGrid(map(['...', '...', '...'], objects));
    const r = reachFrom(g, { x: 0, y: 0 }, 20);
    expect(costTo(r, 1, 0)).toBe(-1);
    expect(costTo(r, 0, 1)).toBe(2);
    // Não corta o canto do pilar: (0,0) → (1,1) exige (1,0) livre, então vai pela mesa (2 + 1).
    expect(costTo(r, 1, 1)).toBe(3);
    // A decoração não muda o custo: mesa (2), diagonal (1), reta (1).
    expect(costTo(r, 2, 2)).toBe(4);
  });

  it('porta aberta passa; fechada custa como terreno difícil; trancada bloqueia', () => {
    const door = (state: 'open' | 'closed' | 'locked'): MapObject => ({ id: 'd', kind: 'door', edge: { o: 'v', x: 1, y: 0 }, state, hidden: false });
    const base = map(['..']);
    setWalls(base, [{ o: 'v', x: 1, y: 0 }], true);
    for (const [state, cost] of [['open', 1], ['closed', 2], ['locked', -1]] as const) {
      const r = reachFrom(buildGrid({ ...base, objects: [door(state)] }), { x: 0, y: 0 }, 5);
      expect(costTo(r, 1, 0)).toBe(cost);
    }
    // Porta fechada para terreno difícil não soma: continua 2.
    const dif = map(['.~']);
    setWalls(dif, [{ o: 'v', x: 1, y: 0 }], true);
    expect(costTo(reachFrom(buildGrid({ ...dif, objects: [door('closed')] }), { x: 0, y: 0 }, 5), 1, 0)).toBe(2);
  });

  it('não passa na diagonal por porta fechada, só reto', () => {
    // Parede vertical com porta fechada entre as colunas 0 e 1, na linha 0; resto da coluna é parede.
    const m = map(['..', '..']);
    setWalls(m, [{ o: 'v', x: 1, y: 0 }, { o: 'v', x: 1, y: 1 }], true);
    const d: MapObject = { id: 'd', kind: 'door', edge: { o: 'v', x: 1, y: 0 }, state: 'closed', hidden: false };
    const r = reachFrom(buildGrid({ ...m, objects: [d] }), { x: 0, y: 1 }, 10);
    // Sobe (1), cruza a porta (2) e desce (1): 4. A diagonal direta não vale.
    expect(costTo(r, 1, 1)).toBe(4);
  });

  it('caminho exato: soma passo a passo e recusa passo inválido', () => {
    const g = buildGrid(map(['.....', '.#...', '.....']));
    // Reta 2, diagonal (1), reta: 4; a próxima diagonal custaria 2.
    expect(followPath(g, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 1 }, { x: 4, y: 1 }])).toEqual({ cost: 4, parity: 1 });
    expect(followPath(g, [{ x: 2, y: 0 }, { x: 3, y: 1 }, { x: 4, y: 2 }])).toEqual({ cost: 3, parity: 0 });
    expect(followPath(g, [{ x: 0, y: 0 }, { x: 2, y: 0 }])).toBeNull(); // pulo
    expect(followPath(g, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull(); // entra no vazio
    expect(followPath(g, [{ x: 0, y: 1 }, { x: 1, y: 2 }])).toBeNull(); // corta o canto do vazio
    expect(followPath(g, [{ x: 0, y: 0 }])).toBeNull();
  });

  it('rascunho de caminho: estende em linha, corta ao voltar e para no limite', () => {
    const g = buildGrid(map(['......', '......']));
    const a = extendPath(g, [{ x: 0, y: 0 }], { x: 3, y: 0 }, 0, 10);
    expect(a.map((p) => p.x)).toEqual([0, 1, 2, 3]);
    expect(extendPath(g, a, { x: 1, y: 0 }, 0, 10)).toHaveLength(2);
    expect(extendPath(g, [{ x: 0, y: 0 }], { x: 5, y: 0 }, 0, 2)).toHaveLength(3);
    // Desvio pedido quadrado a quadrado: desce e volta a subir, custo 1 + 1 + 1.
    const b = extendPath(g, extendPath(g, [{ x: 0, y: 0 }], { x: 0, y: 1 }, 0, 10), { x: 1, y: 1 }, 0, 10);
    expect(followPath(g, extendPath(g, b, { x: 1, y: 0 }, 0, 10))).toEqual({ cost: 3, parity: 0 });
  });

  it('atravessa tokens mas não termina neles', () => {
    const g = buildGrid(map(['.....']));
    const occupied = new Set([2]);
    const r = reachFrom(g, { x: 0, y: 0 }, 6, 0, occupied);
    expect(costTo(r, 4, 0)).toBe(4);
    expect(canEnd(r, 2, 0)).toBe(false);
    expect(canEnd(r, 3, 0)).toBe(true);
    expect(canEnd(r, 0, 0)).toBe(true);
    expect(reachableCells(r)).toEqual([1, 3, 4]);
  });

  it('caminho de menor custo', () => {
    const r = reachFrom(buildGrid(open), { x: 0, y: 0 }, 20);
    const p = pathTo(r, 2, 2)!;
    expect(p.cost).toBe(3);
    expect(p.cells[0]).toEqual({ x: 0, y: 0 });
    expect(p.cells[p.cells.length - 1]).toEqual({ x: 2, y: 2 });
    expect(p.cells).toHaveLength(3);
    expect(pathTo(reachFrom(buildGrid(open), { x: 0, y: 0 }, 2), 9, 9)).toBeNull();
  });

  it('parede em volta do piso', () => {
    const m = map(['#..', '#..']);
    wallAround(m);
    const r = reachFrom(buildGrid(m), { x: 1, y: 0 }, 20);
    expect(costTo(r, 2, 1)).toBe(1);
    // Linha vertical x=1 (entre vazio e piso) e a borda direita têm parede.
    expect(m.wallsV[0 * 4 + 1]).toBe('1');
    expect(m.wallsV[0 * 4 + 3]).toBe('1');
    expect(m.wallsV[0 * 4 + 2]).toBe('0');
  });
});
