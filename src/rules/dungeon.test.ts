import { describe, expect, it } from 'vitest';
import { allConnected, cleanDungeonParams, DUNGEON_DEFAULTS, generateDungeon } from './dungeon';
import { mulberry32 } from './random';
import { edgeKey, hasWall, isOpen, terrainAt } from '../model/map';

describe('aleatório com semente', () => {
  it('mesma semente, mesma sequência', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(xs[0]);
  });
});

describe('gerador de masmorra', () => {
  it('é determinístico pela semente', () => {
    const a = generateDungeon(DUNGEON_DEFAULTS, 7);
    const b = generateDungeon(DUNGEON_DEFAULTS, 7);
    const c = generateDungeon(DUNGEON_DEFAULTS, 8);
    expect(b).toEqual(a);
    expect(c.layout.cells).not.toBe(a.layout.cells);
  });

  it('prende os parâmetros nos limites', () => {
    const p = cleanDungeonParams({ w: 999, h: 3, rooms: 0, roomMin: 50, roomMax: 50, corridor: 9, doors: 2 });
    expect(p.w).toBe(80);
    expect(p.h).toBe(12);
    expect(p.rooms).toBe(1);
    expect(p.roomMax).toBeLessThanOrEqual(8);
    expect(p.roomMin).toBeLessThanOrEqual(p.roomMax);
    expect(p.corridor).toBe(3);
    expect(p.doors).toBe(1);
  });

  it('em 200 sementes: salas no mapa, tudo conectado, parede em toda borda do piso, portas nas entradas', () => {
    for (let seed = 0; seed < 200; seed++) {
      const params = { ...DUNGEON_DEFAULTS, corridor: 1 + (seed % 3), w: 30 + (seed % 25), h: 24 + (seed % 17) };
      const { layout: m, rooms, doors } = generateDungeon(params, seed);
      expect(m.cells).toHaveLength(m.w * m.h);
      expect(m.wallsH).toHaveLength((m.h + 1) * m.w);
      expect(m.wallsV).toHaveLength(m.h * (m.w + 1));
      expect(rooms.length).toBeGreaterThan(0);
      for (const rm of rooms) {
        expect(rm.x).toBeGreaterThanOrEqual(1);
        expect(rm.y).toBeGreaterThanOrEqual(1);
        expect(rm.x + rm.w).toBeLessThanOrEqual(m.w - 1);
        expect(rm.y + rm.h).toBeLessThanOrEqual(m.h - 1);
      }
      expect(allConnected(m, rooms, new Set(doors.map(edgeKey)))).toBe(true);
      // Toda fronteira piso/vazio tem parede.
      const open = (x: number, y: number) => isOpen(terrainAt(m, x, y));
      for (let y = 0; y <= m.h; y++) {
        for (let x = 0; x < m.w; x++) if (open(x, y - 1) !== open(x, y)) expect(hasWall(m, { o: 'h', x, y })).toBe(true);
      }
      for (let y = 0; y < m.h; y++) {
        for (let x = 0; x <= m.w; x++) if (open(x - 1, y) !== open(x, y)) expect(hasWall(m, { o: 'v', x, y })).toBe(true);
      }
      // Porta: parede ligada, piso dos dois lados e uma sala de um dos lados.
      const inRoom = (x: number, y: number) => rooms.some((r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h);
      for (const d of doors) {
        expect(hasWall(m, d)).toBe(true);
        const [a, b] = d.o === 'h' ? [[d.x, d.y - 1], [d.x, d.y]] : [[d.x - 1, d.y], [d.x, d.y]];
        expect(open(a[0], a[1]) && open(b[0], b[1])).toBe(true);
        expect(inRoom(a[0], a[1]) || inRoom(b[0], b[1])).toBe(true);
      }
    }
  });

  it('sem portas quando a chance é zero', () => {
    expect(generateDungeon({ ...DUNGEON_DEFAULTS, doors: 0 }, 3).doors).toHaveLength(0);
  });
});
