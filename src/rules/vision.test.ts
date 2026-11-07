import { describe, expect, it } from 'vitest';
import { buildGrid, canStep } from './grid';
import { blankLayout, setWalls } from '../model/map';
import type { EdgeRef, MapObject } from '../model/types';
import { fullLight, lightMap, lineOfSight, MAX_SIGHT, sightArea, windowSources, type LightSource } from './vision';

/** Mapa a partir de linhas de texto ('.', '#'), com paredes e objetos opcionais. */
function layout(rows: string[], walls: EdgeRef[] = [], objects: MapObject[] = []) {
  const h = rows.length;
  const w = rows[0].length;
  const m = { ...blankLayout(w, h), cells: rows.join(''), objects };
  setWalls(m, walls, true);
  return { ...m, grid: buildGrid(m) };
}

const open10 = Array(10).fill('..........');
const column = (x: number, h = 10): EdgeRef[] => Array.from({ length: h }, (_, y) => ({ o: 'v', x, y }));
const win = (edge: EdgeRef): MapObject => ({ id: `w${edge.x}${edge.y}`, kind: 'window', edge, hidden: false });
const door = (edge: EdgeRef, state: 'open' | 'closed' | 'locked'): MapObject => ({ id: 'd', kind: 'door', edge, state, hidden: false });
const count = (a: Uint8Array) => a.reduce((s, v) => s + (v ? 1 : 0), 0);

describe('linha de visão', () => {
  it('campo aberto vê tudo; parede tapa', () => {
    const m = layout(open10);
    expect(lineOfSight(m.grid, m.cells, 0, 0, 9, 9)).toBe(true);
    expect(lineOfSight(m.grid, m.cells, 0, 3, 9, 7)).toBe(true);
    const walled = layout(open10, column(5));
    expect(lineOfSight(walled.grid, walled.cells, 0, 0, 9, 0)).toBe(false);
    expect(lineOfSight(walled.grid, walled.cells, 0, 0, 4, 9)).toBe(true);
  });

  it('janela deixa ver mas não passar; porta fechada tapa, aberta não', () => {
    const w = layout(open10, column(5), [win({ o: 'v', x: 5, y: 0 })]);
    expect(lineOfSight(w.grid, w.cells, 0, 0, 9, 0)).toBe(true);
    expect(canStep(w.grid, 4, 0, 1, 0)).toBe(false);
    const closed = layout(open10, column(5), [door({ o: 'v', x: 5, y: 0 }, 'closed')]);
    expect(lineOfSight(closed.grid, closed.cells, 0, 0, 9, 0)).toBe(false);
    const opened = layout(open10, column(5), [door({ o: 'v', x: 5, y: 0 }, 'open')]);
    expect(lineOfSight(opened.grid, opened.cells, 0, 0, 9, 0)).toBe(true);
  });

  it('o vazio (rocha) tapa a vista', () => {
    const m = layout(['.....#....', ...Array(9).fill('..........')]);
    expect(lineOfSight(m.grid, m.cells, 0, 0, 9, 0)).toBe(false);
    expect(lineOfSight(m.grid, m.cells, 0, 1, 9, 1)).toBe(true);
  });

  it('bem na quina: basta um dos lados livre', () => {
    // Ponta de uma parede: dá para ver passando rente.
    const tip = layout(open10, [{ o: 'v', x: 5, y: 0 }]);
    expect(lineOfSight(tip.grid, tip.cells, 4, 1, 5, 0)).toBe(true);
    // Canto fechado em L: não se vê através.
    const corner = layout(open10, [{ o: 'v', x: 5, y: 1 }, { o: 'h', x: 4, y: 1 }]);
    expect(lineOfSight(corner.grid, corner.cells, 4, 1, 5, 0)).toBe(false);
  });
});

describe('luz', () => {
  it('raio: tocha alcança mais que vela; parede corta a luz', () => {
    const m = layout(open10);
    const vela = lightMap(m.grid, m.cells, [{ x: 5, y: 5, radius: 2 }]);
    const tocha = lightMap(m.grid, m.cells, [{ x: 5, y: 5, radius: 5 }]);
    expect(count(vela)).toBeGreaterThan(9);
    expect(count(tocha)).toBeGreaterThan(count(vela) * 3);
    expect(vela[5 * 10 + 5]).toBe(4);
    expect(vela[5 * 10 + 7]).toBeGreaterThan(0);
    expect(vela[5 * 10 + 8]).toBe(0);
    const walled = layout(open10, column(6));
    const cut = lightMap(walled.grid, walled.cells, [{ x: 5, y: 5, radius: 5 }]);
    expect(cut[5 * 10 + 6]).toBe(0);
    expect(cut[5 * 10 + 4]).toBeGreaterThan(0);
  });

  it('no escuro, só os 8 vizinhos (sem atravessar parede)', () => {
    const m = layout(open10);
    const v = sightArea(m.grid, m.cells, [{ x: 5, y: 5 }], { sources: [], ambient: 'breu' });
    expect(count(v.seen)).toBe(9);
    expect(count(v.light)).toBe(0);
    const walled = layout(open10, column(5));
    const vw = sightArea(walled.grid, walled.cells, [{ x: 4, y: 5 }], { sources: [], ambient: 'breu' });
    expect(count(vw.seen)).toBe(6);
    expect(vw.seen[5 * 10 + 5]).toBe(0);
  });

  it('vê o que está aceso em linha reta, de longe', () => {
    const m = layout(open10);
    const vela: LightSource = { x: 0, y: 0, radius: 2 };
    const v = sightArea(m.grid, m.cells, [{ x: 9, y: 9 }], { sources: [vela], ambient: 'breu' });
    expect(v.seen[0]).toBe(1);
    expect(v.seen[2]).toBe(1);
    expect(v.seen[3]).toBe(0);
    expect(v.light[0]).toBe(4);
    // Com uma parede no meio, a luz está lá, mas não se vê.
    const walled = layout(open10, column(5));
    const vw = sightArea(walled.grid, walled.cells, [{ x: 9, y: 9 }], { sources: [vela], ambient: 'breu' });
    expect(vw.seen[0]).toBe(0);
  });

  it('tudo iluminado: vale só a linha de visão', () => {
    const walled = layout(open10, column(5));
    const v = sightArea(walled.grid, walled.cells, [{ x: 0, y: 0 }], { sources: [], ambient: 'geral' });
    expect(count(v.seen)).toBe(50);
  });

  it('janela: de dia ilumina para dentro e deixa ver lá fora; no breu, nada', () => {
    // Interior à esquerda (x < 5), céu aberto à direita, janela em (5, 5).
    let outside = '';
    for (let i = 0; i < 100; i++) outside += i % 10 >= 5 ? '1' : '0';
    const objs = [win({ o: 'v', x: 5, y: 5 })];
    const m = { ...layout(open10, column(5), objs), outside };
    const src = windowSources(m, objs, 'dia');
    expect(src).toEqual([{ x: 4, y: 5, radius: 6, cap: 4 }]);
    const v = sightArea(m.grid, m.cells, [{ x: 0, y: 5 }], { sources: src, outside, ambient: 'dia' });
    expect(v.seen[5 * 10 + 4]).toBe(1);
    expect(v.seen[5 * 10 + 8]).toBe(1); // lá fora, pela janela
    expect(v.seen[0 * 10 + 8]).toBe(0); // lá fora, atrás da parede
    expect(windowSources(m, objs, 'breu')).toEqual([]);
    const dark = sightArea(m.grid, m.cells, [{ x: 0, y: 5 }], { sources: [], outside, ambient: 'breu' });
    expect(dark.seen[5 * 10 + 4]).toBe(0);
    expect(dark.seen[5 * 10 + 8]).toBe(0);
  });

  it('luar: o céu aberto só se vê de perto', () => {
    const m = layout(Array(3).fill('....................'));
    const outside = '1'.repeat(60);
    const v = sightArea(m.grid, m.cells, [{ x: 0, y: 1 }], { sources: [], outside, ambient: 'luar' });
    expect(v.seen[1 * 20 + 6]).toBe(1);
    expect(v.seen[1 * 20 + 8]).toBe(0);
    expect(v.light[1 * 20 + 6]).toBe(1);
    // O mestre vê a luz do luar no mapa inteiro.
    expect(fullLight(m.grid, m.cells, { sources: [], outside, ambient: 'luar' })[1 * 20 + 19]).toBe(1);
  });

  it('soleira: do outro lado de uma porta fechada que se vê', () => {
    const m = layout(open10, column(5), [door({ o: 'v', x: 5, y: 0 }, 'closed')]);
    const v = sightArea(m.grid, m.cells, [{ x: 0, y: 0 }], { sources: [], ambient: 'geral' });
    expect([...v.dim]).toEqual([5]);
  });

  it('mapa grande, tudo aceso, vários olhos: rápido', () => {
    const rows = Array(80).fill('.'.repeat(80));
    const m = layout(rows);
    const t0 = performance.now();
    const eyes = [{ x: 5, y: 5 }, { x: 40, y: 40 }, { x: 70, y: 10 }, { x: 10, y: 70 }, { x: 75, y: 75 }];
    const v = sightArea(m.grid, m.cells, eyes, { sources: [], outside: '1'.repeat(6400), ambient: 'dia' });
    expect(count(v.seen)).toBeGreaterThan(MAX_SIGHT * MAX_SIGHT);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
