import { describe, expect, it } from 'vitest';
import { cellsPath, edgesBetween, gridPath, lineCells, nearestEdge, rectCells, runsPath, wallsPath } from './mapRender';

describe('desenho do mapa', () => {
  it('um retângulo por sequência de terreno na linha', () => {
    expect(runsPath('..##.', 5, 1, '#')).toBe('M2 0h2v1h-2z');
    expect(runsPath('#..#', 2, 2, '#')).toBe('M0 0h1v1h-1zM1 1h1v1h-1z');
    expect(runsPath('....', 4, 1, '#')).toBe('');
  });

  it('quadrados soltos viram sequências', () => {
    expect(cellsPath([2, 1, 0, 4], 5)).toBe('M0 0h3v1h-3zM4 0h1v1h-1z');
    expect(cellsPath([5], 5)).toBe('M0 1h1v1h-1z');
  });

  it('paredes vizinhas emendam', () => {
    // 2×1: linhas horizontais (2 linhas × 2), verticais (1 × 3).
    expect(wallsPath('1100', '000', 2, 1)).toBe('M0 0H2');
    expect(wallsPath('0000', '101', 2, 1)).toBe('M0 0V1M2 0V1');
    expect(gridPath(1, 1)).toBe('M0 0V1M1 0V1M0 0H1M0 1H1');
  });

  it('linha mais perto do ponteiro', () => {
    expect(nearestEdge(1.05, 0.5, 4, 4)).toEqual({ o: 'v', x: 1, y: 0 });
    expect(nearestEdge(2.5, 3.9, 4, 4)).toEqual({ o: 'h', x: 2, y: 4 });
    expect(nearestEdge(1.5, 1.5, 4, 4)).toBeNull();
    expect(nearestEdge(9, 1, 4, 4)).toBeNull();
  });

  it('arrastar na mesma linha pega as linhas do meio', () => {
    expect(edgesBetween({ o: 'h', x: 3, y: 1 }, { o: 'h', x: 1, y: 1 })).toEqual([
      { o: 'h', x: 1, y: 1 }, { o: 'h', x: 2, y: 1 }, { o: 'h', x: 3, y: 1 },
    ]);
    expect(edgesBetween({ o: 'h', x: 3, y: 1 }, { o: 'v', x: 1, y: 1 })).toEqual([{ o: 'v', x: 1, y: 1 }]);
  });

  it('retângulo e linha de quadrados', () => {
    expect(rectCells(2, 1, 0, 0, 3, 3)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(rectCells(-5, 0, 0, 0, 3, 3)).toEqual([0]);
    expect(lineCells(0, 0, 3, 0)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(lineCells(1, 1, 1, 1)).toEqual([[1, 1]]);
  });
});
