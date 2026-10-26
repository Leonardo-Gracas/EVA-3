import { describe, expect, it } from 'vitest';
import type { HouseShape, MapGenParams, MapPreset } from '../../model/types';
import { PROP_KINDS, TERRAIN_CHAR } from '../../model/types';
import { edgeKey, hasWall, isOpen, terrainAt } from '../../model/map';
import { generateDungeon } from '../dungeon';
import { cleanMapParams, describeRooms, generateMap, type GeneratedMap, PRESET_DEFAULTS } from './index';
import { flood, ZONE } from './shared';

const params = (preset: MapPreset, extra: Partial<MapGenParams> = {}): MapGenParams =>
  cleanMapParams({ preset, ...PRESET_DEFAULTS[preset], furnish: true, w: 36, h: 28, ...extra });

const size = (seed: number) => ({ w: 14 + (seed * 7) % 50, h: 13 + (seed * 11) % 40 });

/** Quadrados abertos e sem móvel que bloqueia formam um pedaço só (portas contam como passagem). */
function components(g: GeneratedMap): number {
  const { w, h } = g.layout;
  const blocked = new Uint8Array(w * h);
  for (const p of g.props) if (p.effect === 'block') for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) blocked[y * w + x] = 1;
  const keys = new Set(g.doors.map(edgeKey));
  const seen = new Uint8Array(w * h);
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || g.layout.cells[i] === TERRAIN_CHAR.void || blocked[i]) continue;
    n++;
    const s = flood(g.layout, keys, [i], blocked);
    for (let k = 0; k < w * h; k++) if (s[k]) seen[k] = 1;
  }
  return n;
}

function checkCommon(g: GeneratedMap) {
  const m = g.layout;
  expect(m.cells).toHaveLength(m.w * m.h);
  expect(m.wallsH).toHaveLength((m.h + 1) * m.w);
  expect(m.wallsV).toHaveLength(m.h * (m.w + 1));
  expect(g.doors.length + g.props.length).toBeLessThanOrEqual(500);
  const open = (x: number, y: number) => isOpen(terrainAt(m, x, y));
  for (const d of g.doors) {
    expect(hasWall(m, d)).toBe(true);
    const [a, b] = d.o === 'h' ? [[d.x, d.y - 1], [d.x, d.y]] : [[d.x - 1, d.y], [d.x, d.y]];
    expect(open(a[0], a[1]) && open(b[0], b[1])).toBe(true);
  }
  const used = new Set<number>();
  for (const p of g.props) {
    expect(p.w).toBeGreaterThanOrEqual(1);
    expect(p.h).toBeGreaterThanOrEqual(1);
    expect(Math.max(p.w, p.h)).toBeLessThanOrEqual(10);
    expect(p.x >= 0 && p.y >= 0 && p.x + p.w <= m.w && p.y + p.h <= m.h).toBe(true);
    expect(p.effect).toBe(PROP_KINDS[p.prop].effect);
    for (let y = p.y; y < p.y + p.h; y++) {
      for (let x = p.x; x < p.x + p.w; x++) {
        const i = y * m.w + x;
        expect(used.has(i)).toBe(false);
        used.add(i);
        expect(m.cells[i] === TERRAIN_CHAR.floor || m.cells[i] === TERRAIN_CHAR.difficult).toBe(true);
      }
    }
  }
}

describe('gerador de mapas', () => {
  it('é determinístico e a mobília não mexe na planta', () => {
    for (const preset of ['dungeon', 'house', 'temple', 'outdoor'] as MapPreset[]) {
      const a = generateMap(params(preset), 11);
      const b = generateMap(params(preset), 11);
      expect(b.layout).toEqual(a.layout);
      expect(b.props).toEqual(a.props);
      const bare = generateMap(params(preset, { furnish: false }), 11);
      expect(bare.props).toHaveLength(0);
      expect(bare.layout.wallsH).toBe(a.layout.wallsH);
      expect(bare.layout.wallsV).toBe(a.layout.wallsV);
      expect(bare.doors).toEqual(a.doors);
    }
  });

  it('masmorra sem mobília é a mesma de antes', () => {
    const p = params('dungeon', { furnish: false });
    const g = generateMap(p, 5);
    expect(g.layout).toEqual(generateDungeon(p, 5).layout);
  });

  it('ação antiga (sem tipo) vira masmorra sem móveis', () => {
    const p = cleanMapParams({ w: 30, h: 20, rooms: 5, roomMin: 4, roomMax: 8, corridor: 1, doors: 0.5 } as Partial<MapGenParams>);
    expect(p.preset).toBe('dungeon');
    expect(p.furnish).toBe(false);
  });

  it('casa: planta sem vazio, tudo ligado, cômodos encostados nos corredores', () => {
    let touching = 0;
    let total = 0;
    for (let seed = 0; seed < 120; seed++) {
      const g = generateMap(params('house', { ...size(seed), corridor: 1 + (seed % 2) }), seed);
      checkCommon(g);
      const { w, h } = g.layout;
      // Dentro da casa é tudo piso (sem vazio), e cômodos + corredores cobrem a planta toda.
      let foot = 0;
      for (let i = 0; i < w * h; i++) {
        expect(g.layout.cells[i]).not.toBe(TERRAIN_CHAR.void);
        if (g.zone[i] === ZONE.room || g.zone[i] === ZONE.corridor) foot++;
      }
      const roomCells = g.rooms.reduce((s, r) => s + r.w * r.h, 0);
      const corrCells = [...g.zone].filter((z) => z === ZONE.corridor).length;
      expect(roomCells + corrCells).toBe(foot);
      expect(components(g)).toBe(1);
      expect(g.rooms.some((r) => r.kind === 'sala')).toBe(true);
      for (const rm of g.rooms) {
        total++;
        let t = false;
        for (let x = rm.x; x < rm.x + rm.w && !t; x++) {
          t = g.zone[(rm.y - 1) * w + x] === ZONE.corridor || g.zone[(rm.y + rm.h) * w + x] === ZONE.corridor;
        }
        for (let y = rm.y; y < rm.y + rm.h && !t; y++) {
          t = g.zone[y * w + rm.x - 1] === ZONE.corridor || g.zone[y * w + rm.x + rm.w] === ZONE.corridor;
        }
        if (t) touching++;
      }
    }
    expect(touching / total).toBeGreaterThan(0.75);
  });

  it('casa: o formato aparece na planta', () => {
    const footprint = (shape: HouseShape, seed: number) => {
      const g = generateMap(params('house', { shape, w: 40, h: 32 }), seed);
      const { w, h } = g.layout;
      let n = 0;
      let x1 = w;
      let y1 = h;
      let x2 = 0;
      let y2 = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const z = g.zone[y * w + x];
          if (z !== ZONE.room && z !== ZONE.corridor) continue;
          n++;
          x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y);
        }
      }
      return { fill: n / ((x2 - x1 + 1) * (y2 - y1 + 1)), aspect: Math.max(x2 - x1 + 1, y2 - y1 + 1) / Math.min(x2 - x1 + 1, y2 - y1 + 1) };
    };
    for (let seed = 0; seed < 20; seed++) {
      expect(footprint('square', seed).fill).toBe(1);
      expect(footprint('long', seed).aspect).toBeGreaterThanOrEqual(1.8);
      for (const s of ['L', 'T', 'U'] as HouseShape[]) expect(footprint(s, seed).fill).toBeLessThan(0.95);
    }
  });

  it('templo: nave, santuário com degraus, tudo ligado', () => {
    for (let seed = 0; seed < 120; seed++) {
      const g = generateMap(params('temple', size(seed)), seed);
      checkCommon(g);
      expect(g.rooms.filter((r) => r.kind === 'nave')).toHaveLength(1);
      expect(g.rooms.filter((r) => r.kind === 'santuario')).toHaveLength(1);
      expect(g.layout.cells.includes(TERRAIN_CHAR.stairs)).toBe(true);
      expect(components(g)).toBe(1);
      // Salas laterais vêm aos pares.
      const side = g.rooms.filter((r) => !['nave', 'santuario', 'vestibulo'].includes(r.kind));
      expect(side.length % 2).toBe(0);
    }
  });

  it('cenário aberto: tudo ligado, construções no mapa', () => {
    for (let seed = 0; seed < 120; seed++) {
      const g = generateMap(params('outdoor', { ...size(seed), rooms: seed % 6 }), seed);
      checkCommon(g);
      expect(components(g)).toBe(1);
      for (const rm of g.rooms) expect(['cabana', 'ruina']).toContain(rm.kind);
    }
  });

  it('masmorra com mobília: não separa nada que estava ligado', () => {
    for (let seed = 0; seed < 80; seed++) {
      const p = params('dungeon', { ...size(seed), corridor: 1 + (seed % 3) });
      const bare = generateMap({ ...p, furnish: false }, seed);
      const full = generateMap(p, seed);
      checkCommon(full);
      expect(components(full)).toBe(components(bare));
      expect(full.rooms.every((r) => r.kind !== 'generic')).toBe(true);
    }
  });

  it('descreve os cômodos', () => {
    const r = (kind: GeneratedMap['rooms'][number]['kind']) => ({ x: 0, y: 0, w: 1, h: 1, kind });
    expect(describeRooms([r('sala'), r('quarto'), r('quarto'), r('banheiro')])).toBe('sala de estar, 2 quartos e banheiro');
  });
});
