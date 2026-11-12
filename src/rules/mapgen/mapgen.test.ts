import { describe, expect, it } from 'vitest';
import type { EdgeRef, HouseModel, HouseShape, HouseSize, MapGenParams, MapPreset } from '../../model/types';
import { HOUSE_MODELS, HOUSE_SIZES, PROP_KINDS, TERRAIN_CHAR } from '../../model/types';
import { edgeKey, hasWall, isOpen, terrainAt } from '../../model/map';
import { generateDungeon } from '../dungeon';
import { cleanMapParams, describeRooms, generateFloors, generateMap, type GeneratedMap, newMapSize, PRESET_DEFAULTS } from './index';
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

/** Para onde o cômodo tem passagem (vão ou porta): tipo do cômodo vizinho, 'corredor' ou 'fora'. */
function passagesOf(g: GeneratedMap, rm: GeneratedMap['rooms'][number]): string[] {
  const { w, h, wallsH, wallsV } = g.layout;
  const keys = new Set(g.doors.map(edgeKey));
  const owner = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return 'fora';
    const o = g.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    return o ? o.kind : g.zone[y * w + x] === ZONE.corridor ? 'corredor' : 'fora';
  };
  const out: string[] = [];
  const pass = (o: 'h' | 'v', x: number, y: number) => (o === 'h' ? wallsH[y * w + x] : wallsV[y * (w + 1) + x]) !== '1' || keys.has(`${o}${x},${y}`);
  for (let x = rm.x; x < rm.x + rm.w; x++) {
    if (pass('h', x, rm.y)) out.push(owner(x, rm.y - 1));
    if (pass('h', x, rm.y + rm.h)) out.push(owner(x, rm.y + rm.h));
  }
  for (let y = rm.y; y < rm.y + rm.h; y++) {
    if (pass('v', rm.x, y)) out.push(owner(rm.x - 1, y));
    if (pass('v', rm.x + rm.w, y)) out.push(owner(rm.x + rm.w, y));
  }
  return out;
}

/** Pedaços de corredor separados uns dos outros. */
function corridorGroups(g: GeneratedMap): number {
  const { w, h } = g.layout;
  const seen = new Uint8Array(w * h);
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || g.zone[i] !== ZONE.corridor) continue;
    n++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % w;
      for (const k of [j - w, j + w, x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1]) {
        if (k < 0 || k >= w * h || seen[k] || g.zone[k] !== ZONE.corridor) continue;
        seen[k] = 1;
        stack.push(k);
      }
    }
  }
  return n;
}

function checkCommon(g: GeneratedMap) {
  const m = g.layout;
  expect(m.cells).toHaveLength(m.w * m.h);
  expect(m.wallsH).toHaveLength((m.h + 1) * m.w);
  expect(m.wallsV).toHaveLength(m.h * (m.w + 1));
  expect(g.doors.length + g.props.length + g.windows.length + g.lights.length).toBeLessThanOrEqual(500);
  const open = (x: number, y: number) => isOpen(terrainAt(m, x, y));
  for (const d of g.doors) {
    expect(hasWall(m, d)).toBe(true);
    const [a, b] = d.o === 'h' ? [[d.x, d.y - 1], [d.x, d.y]] : [[d.x - 1, d.y], [d.x, d.y]];
    expect(open(a[0], a[1]) && open(b[0], b[1])).toBe(true);
  }
  // Janela: numa parede sem porta, entre um quadrado coberto e um a céu aberto.
  const doorKeys = new Set(g.doors.map(edgeKey));
  const sky = (x: number, y: number) => g.outside?.[y * m.w + x] === '1';
  for (const wnd of g.windows) {
    expect(hasWall(m, wnd)).toBe(true);
    expect(doorKeys.has(edgeKey(wnd))).toBe(false);
    const [a, b] = wnd.o === 'h' ? [[wnd.x, wnd.y - 1], [wnd.x, wnd.y]] : [[wnd.x - 1, wnd.y], [wnd.x, wnd.y]];
    expect(open(a[0], a[1]) && open(b[0], b[1])).toBe(true);
    expect(sky(a[0], a[1]) !== sky(b[0], b[1])).toBe(true);
  }
  expect(new Set(g.windows.map(edgeKey)).size).toBe(g.windows.length);
  // Luz: num quadrado aberto, uma por quadrado; na parede, encostada numa parede de verdade.
  const lit = new Set<number>();
  for (const l of g.lights) {
    expect(open(l.x, l.y)).toBe(true);
    expect(l.radius).toBeGreaterThan(0);
    expect(lit.has(l.y * m.w + l.x)).toBe(false);
    lit.add(l.y * m.w + l.x);
    if (l.mount === 'parede') {
      const e = { n: { o: 'h', x: l.x, y: l.y }, s: { o: 'h', x: l.x, y: l.y + 1 }, w: { o: 'v', x: l.x, y: l.y }, e: { o: 'v', x: l.x + 1, y: l.y } }[l.side!] as EdgeRef;
      expect(hasWall(m, e)).toBe(true);
    }
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

  it('janelas e luzes: coerentes com o ambiente, sem mexer na planta nem nos móveis', () => {
    let withWindows = 0;
    for (const preset of ['dungeon', 'house', 'temple', 'outdoor'] as MapPreset[]) {
      for (let seed = 1; seed <= 20; seed++) {
        const g = generateMap(params(preset, { lights: true, ...size(seed) }), seed);
        checkCommon(g);
        const plain = generateMap(params(preset, { ...size(seed) }), seed);
        expect(g.layout).toEqual(plain.layout);
        expect(g.props).toEqual(plain.props);
        expect(plain.windows).toHaveLength(0);
        expect(plain.lights).toHaveLength(0);
        expect(generateMap(params(preset, { lights: true, ...size(seed) }), seed)).toEqual(g);
        if (preset === 'dungeon') {
          expect(g.windows).toHaveLength(0);
          expect(g.outside).toBeUndefined();
        } else {
          expect(g.outside).toMatch(/1/);
        }
        if (preset === 'house' || preset === 'temple') {
          expect(g.lights.length).toBeGreaterThan(0);
          if (g.windows.length) withWindows++;
        }
        // Luz sobre móvel fica em cima de um móvel.
        for (const l of g.lights.filter((x) => x.mount === 'mesa')) {
          expect(g.props.some((p) => l.x >= p.x && l.y >= p.y && l.x < p.x + p.w && l.y < p.y + p.h)).toBe(true);
        }
      }
    }
    expect(withWindows).toBeGreaterThanOrEqual(36);
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

  it('casa e hotel: planta sem vazio, tudo ligado, sem passar por banheiro, quartos com saída boa', () => {
    const models = Object.keys(HOUSE_MODELS) as HouseModel[];
    const sizes = Object.keys(HOUSE_SIZES) as HouseSize[];
    for (let seed = 0; seed < 150; seed++) {
      const model = models[seed % models.length];
      const [lo, hi] = HOUSE_MODELS[model].rooms;
      const g = generateMap(params('house', {
        ...size(seed), model, size: sizes[seed % 3], rooms: lo + (seed % (hi - lo + 1)), corridor: 1 + (seed % 3),
      }), seed);
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
      // Tirando os banheiros, todo o resto continua ligado: ninguém passa por banheiro.
      const bath = new Uint8Array(w * h);
      for (const rm of g.rooms) if (rm.kind === 'banheiro') for (let y = rm.y; y < rm.y + rm.h; y++) for (let x = rm.x; x < rm.x + rm.w; x++) bath[y * w + x] = 1;
      const keys = new Set(g.doors.map(edgeKey));
      const start = [...bath].findIndex((b) => !b);
      const seen = flood(g.layout, keys, [start], bath);
      for (let i = 0; i < w * h; i++) if (!bath[i]) expect(seen[i]).toBe(1);
      // Quarto abre para corredor ou cômodo social (no casebre, para o cômodo principal). Mapa
      // pequeno demais para o modelo vira casebre.
      const social = ['sala', 'jantar', 'entrada', 'recepcao', 'taverna'];
      const casebre = !g.rooms.some((r) => social.includes(r.kind));
      const ok = new Set([...social, ...(casebre ? ['cozinha'] : [])]);
      for (const rm of g.rooms) {
        if (rm.kind !== 'quarto') continue;
        const exits = passagesOf(g, rm);
        expect(exits.some((k) => k === 'corredor' || ok.has(k))).toBe(true);
      }
    }
  });

  it('casa: pouco corredor, um só, e os cômodos de uma casa', () => {
    for (let seed = 0; seed < 60; seed++) {
      const k = 1 + (seed % 5);
      const g = generateMap(params('house', { model: 'casa', rooms: k, w: 40, h: 30 }), seed);
      const kinds = g.rooms.map((r) => r.kind);
      expect(kinds.filter((x) => x === 'quarto')).toHaveLength(k);
      for (const x of ['sala', 'cozinha', 'banheiro'] as const) expect(kinds).toContain(x);
      const corr = [...g.zone].filter((z) => z === ZONE.corridor).length;
      const built = [...g.zone].filter((z) => z === ZONE.corridor || z === ZONE.room).length;
      expect(corr / built).toBeLessThan(0.15);
      expect(corridorGroups(g)).toBeLessThanOrEqual(1);
    }
  });

  it('hotel e estalagem: o número de quartos pedido, todos na porta do corredor', () => {
    for (let seed = 0; seed < 40; seed++) {
      const model: HouseModel = seed % 2 ? 'hotel' : 'estalagem';
      const shapes = HOUSE_MODELS[model].shapes;
      const k = model === 'hotel' ? 8 + (seed % 20) : 2 + (seed % 12);
      const g = generateMap(params('house', { model, shape: shapes[seed % shapes.length], rooms: k, w: 70, h: 60 }), seed);
      const quartos = g.rooms.filter((r) => r.kind === 'quarto');
      expect(quartos).toHaveLength(k);
      for (const rm of quartos) expect(passagesOf(g, rm)).toContain('corredor');
    }
  });

  it('casa: mapa pequeno demais cabe com menos quartos, sem sair do mapa', () => {
    for (const model of Object.keys(HOUSE_MODELS) as HouseModel[]) {
      const g = generateMap(params('house', { model, rooms: HOUSE_MODELS[model].rooms[1], w: 12, h: 12 }), 3);
      checkCommon(g);
      expect(components(g)).toBe(1);
      expect(g.rooms.length).toBeGreaterThan(0);
      for (const rm of g.rooms) expect(rm.x >= 1 && rm.y >= 1 && rm.x + rm.w <= 11 && rm.y + rm.h <= 11).toBe(true);
    }
  });

  it('casa: o formato aparece na planta', () => {
    const footprint = (shape: HouseShape, seed: number, model: HouseModel = 'casa', rooms = 4) => {
      const g = generateMap(params('house', { model, shape, rooms, w: 60, h: 50 }), seed);
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
      expect(footprint('long', seed).aspect).toBeGreaterThanOrEqual(2);
      expect(footprint('L', seed).fill).toBeLessThan(1);
      for (const s of ['L', 'T', 'U'] as HouseShape[]) expect(footprint(s, seed, 'hotel', 24).fill).toBeLessThan(0.95);
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

describe('andares', () => {
  const stairsAt = (g: GeneratedMap) => [...g.layout.cells].flatMap((c, i) => (c === TERRAIN_CHAR.stairs ? [i] : []));

  it('um andar só é o mesmo mapa de sempre', () => {
    const p = params('dungeon', { lights: true });
    const [only] = generateFloors(p, 21);
    expect(only.layout.cells).toBe(generateMap(p, 21).layout.cells);
    expect(only.label).toBe('');
  });

  it('a casa tem a mesma planta em todos os andares e uma escada nos mesmos quadrados', () => {
    for (const model of ['casa', 'casarao', 'estalagem', 'hotel'] as HouseModel[]) {
      for (let seed = 1; seed <= 6; seed++) {
        const fl = generateFloors({ preset: 'house', model, floors: 3, furnish: true, lights: true, ...newMapSize('house', model) }, seed * 37);
        expect(fl.map((f) => f.label)).toEqual(['Térreo', '1º andar', '2º andar']);
        const st = stairsAt(fl[0]);
        expect(st.length).toBeGreaterThan(0);
        for (const f of fl) {
          expect(stairsAt(f)).toEqual(st);
          // Nenhum móvel em cima da escada, e o andar continua ligado.
          for (const pr of f.props) for (const i of st) expect(i % f.layout.w >= pr.x && i % f.layout.w < pr.x + pr.w && Math.floor(i / f.layout.w) >= pr.y && Math.floor(i / f.layout.w) < pr.y + pr.h).toBe(false);
          expect(components(f)).toBe(1);
        }
        // Lá em cima: sem quintal (vazio), sem cozinha e sem porta para fora; janelas continuam.
        const up = fl[1];
        for (let i = 0; i < up.zone.length; i++) if (up.zone[i] === ZONE.outside) expect(up.layout.cells[i]).toBe(TERRAIN_CHAR.void);
        expect(up.rooms.some((rm) => rm.kind === 'cozinha' || rm.kind === 'taverna')).toBe(false);
        expect(up.windows.length).toBeGreaterThan(0);
        expect(up.rooms.map((rm) => [rm.x, rm.y, rm.w, rm.h])).toEqual(fl[0].rooms.map((rm) => [rm.x, rm.y, rm.w, rm.h]));
      }
    }
  });

  it('casa com andares: a maioria dos quartos fica em cima; às vezes escritório ou sala de vassouras', () => {
    const upKinds = new Set<string>();
    for (const model of ['casa', 'casarao'] as HouseModel[]) {
      for (let seed = 1; seed <= 25; seed++) {
        const fl = generateFloors({ preset: 'house', model, floors: 2, furnish: true, ...newMapSize('house', model) }, seed * 61);
        const q = fl.map((f) => f.rooms.filter((rm) => rm.kind === 'quarto').length);
        expect(q[0]).toBeLessThanOrEqual(1);
        expect(q[1]).toBeGreaterThan(q[0]);
        // A planta coube inteira: o aviso de quartos que não couberam não aparece à toa.
        expect(fl[0].fitted).toBeGreaterThanOrEqual(HOUSE_MODELS[model].rooms[2]);
        expect(fl[0].rooms.some((rm) => rm.kind === 'cozinha')).toBe(true);
        for (const rm of fl[1].rooms) upKinds.add(rm.kind);
      }
    }
    expect(upKinds.has('vassouras')).toBe(true);
    expect(upKinds.has('escritorio')).toBe(true);
    // Um andar só: os quartos ficam no térreo, como sempre.
    const one = generateFloors({ preset: 'house', model: 'casa', furnish: true, ...newMapSize('house', 'casa') }, 61)[0];
    expect(one.rooms.filter((rm) => rm.kind === 'quarto').length).toBe(HOUSE_MODELS.casa.rooms[2]);
  });

  it('hospedagem com andares: quartos de hóspede em todos os andares', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const fl = generateFloors({ preset: 'house', model: 'hotel', floors: 3, ...newMapSize('house', 'hotel') }, seed * 29);
      for (const f of fl) expect(f.rooms.filter((rm) => rm.kind === 'quarto').length).toBeGreaterThanOrEqual(HOUSE_MODELS.hotel.rooms[2]);
    }
  });

  it('cada nível da masmorra tem escada para o vizinho no mesmo lugar', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const p = { preset: 'dungeon' as const, floors: 4, furnish: true, ...newMapSize('dungeon', 'casa') };
      const fl = generateFloors(p, seed * 53);
      const bare = generateFloors({ ...p, furnish: false }, seed * 53);
      expect(fl.map((f) => f.label)).toEqual(['Nível 1', 'Nível 2', 'Nível 3', 'Nível 4']);
      for (let k = 1; k < fl.length; k++) {
        const common = stairsAt(fl[k]).filter((i) => stairsAt(fl[k - 1]).includes(i));
        expect(common.length).toBeGreaterThan(0);
      }
      // A mobília não separa nada que o nível tinha ligado.
      fl.forEach((f, k) => expect(components(f)).toBe(components(bare[k])));
    }
  });

  it('templo, cenário aberto e casebre têm um andar só', () => {
    expect(cleanMapParams({ preset: 'temple', floors: 3 }).floors).toBe(1);
    expect(cleanMapParams({ preset: 'outdoor', floors: 3 }).floors).toBe(1);
    expect(cleanMapParams({ preset: 'house', model: 'casebre', floors: 3 }).floors).toBe(1);
    expect(cleanMapParams({ preset: 'house', model: 'hotel', floors: 9 }).floors).toBe(4);
  });
});

describe('exterior', () => {
  const builtCells = (g: GeneratedMap) => [...g.layout.cells].map((c, i) => (g.zone[i] === ZONE.room || g.zone[i] === ZONE.corridor ? c : '-')).join('');

  it('quintal é o padrão e não muda nada', () => {
    for (const preset of ['house', 'temple'] as MapPreset[]) {
      const p = { preset, furnish: true, lights: true, ...newMapSize(preset, 'casa') };
      const a = generateMap(p, 17);
      const b = generateMap({ ...p, exterior: 'quintal' }, 17);
      expect(b.layout.cells).toBe(a.layout.cells);
      expect(b.props).toEqual(a.props);
    }
    expect(cleanMapParams({ preset: 'dungeon', exterior: 'rua' }).exterior).toBe('quintal');
  });

  it('rua: calçadas com postes na frente, prédio igual, tudo ligado', () => {
    for (const [preset, model] of [['house', 'casa'], ['house', 'hotel'], ['temple', 'casa']] as Array<[MapPreset, HouseModel]>) {
      for (let seed = 1; seed <= 8; seed++) {
        const p = { preset, model, furnish: true, lights: true, ...newMapSize(preset, model, 'rua') };
        const g = generateMap({ ...p, exterior: 'rua' }, seed * 13);
        const yard = generateMap(p, seed * 13);
        // A casa fica igual (o templo encolhe para dar lugar à rua).
        if (preset === 'house') expect(builtCells(g)).toBe(builtCells(yard));
        expect(g.sidewalk?.length).toBeGreaterThan(0);
        expect(g.lights.some((l) => l.label === 'Poste de lampião')).toBe(true);
        // Nada de árvore na rua nem na calçada.
        for (const pr of g.props) if (pr.prop === 'arvore') expect(g.zone[pr.y * g.layout.w + pr.x]).not.toBe(ZONE.path);
        expect(components(g)).toBe(1);
      }
    }
  });

  it('floresta: mata e árvores em volta, trilha da porta até a borda, tudo ligado', () => {
    for (const [preset, model] of [['house', 'casa'], ['house', 'estalagem'], ['temple', 'casa']] as Array<[MapPreset, HouseModel]>) {
      for (let seed = 1; seed <= 8; seed++) {
        const g = generateMap({ preset, model, exterior: 'floresta', furnish: true, lights: true, ...newMapSize(preset, model, 'floresta') }, seed * 19);
        const { w, h } = g.layout;
        expect(g.props.filter((pr) => pr.prop === 'arvore').length).toBeGreaterThan(40);
        expect(g.layout.cells.includes(TERRAIN_CHAR.difficult)).toBe(true);
        const trail = [...g.zone].flatMap((z, i) => (z === ZONE.path ? [i] : []));
        expect(trail.some((i) => i % w === 0 || i % w === w - 1 || i < w || i >= w * (h - 1))).toBe(true);
        expect(components(g)).toBe(1);
      }
    }
  });

  it('casa de dois andares na rua: só o térreo tem rua; em cima é vazio', () => {
    const fl = generateFloors({ preset: 'house', model: 'casarao', floors: 2, exterior: 'rua', furnish: true, lights: true, ...newMapSize('house', 'casarao', 'rua') }, 41);
    expect(fl[0].sidewalk?.length).toBeGreaterThan(0);
    for (let i = 0; i < fl[1].zone.length; i++) if (fl[1].zone[i] === ZONE.path) expect(fl[1].layout.cells[i]).toBe(TERRAIN_CHAR.void);
  });
});
