import { describe, expect, it } from 'vitest';
import { dispatch, newTable, type EngineCtx } from './engine';
import { buildPlayerView } from './views';
import { migrate } from './persistence';
import type { Actor, CharacterDraft, GameAction, TableState, ThreatData } from '../model/types';
import { emptyAttributes } from '../rules/attributes';
import { hasWall } from '../model/map';
import { DUNGEON_DEFAULTS } from '../rules/dungeon';
import { fullGrid } from './maps';

let n = 0;
const ctx: EngineCtx = { now: () => 1000, newId: () => `id${++n}`, rng: () => 3 };
const gm: Actor = { role: 'gm', name: 'Mestre' };
const p1: Actor = { role: 'player', playerId: 'p1', name: 'Ana' };
const p2: Actor = { role: 'player', playerId: 'p2', name: 'Beto' };

const draft = (name: string): CharacterDraft => ({
  name, concept: 'Padre', notes: '',
  attributes: { ...emptyAttributes(), FE: 3, CON: 2, PRE: 2 }, levels: [{ classId: 'acolito', abilityId: 'fortificado' }],
});

const goblin: ThreatData = {
  name: 'Goblin', concept: '', category: 'etereo', attributes: emptyAttributes(), pvMax: 10, peMax: 0, def: 12, von: 10,
  rdPhysical: 0, rdMagic: 0, movement: 6, attacks: [], abilities: [], notes: '',
};

function ok(s: TableState, actor: Actor, a: GameAction): TableState {
  const r = dispatch(s, actor, a, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function run(s: TableState, actor: Actor, a: GameAction) {
  return dispatch(s, actor, a, ctx);
}

/** Mesa com uma ficha aprovada de cada jogador (9 m = 6 quadrados) e um mapa 10×10 aberto, com a ficha de Ana em A1. */
function setup() {
  let s = newTable('Mesa', 'Mestre', 'ABCDEF', ctx);
  s.players.p1 = { id: 'p1', name: 'Ana', secretHash: 'x', firstSeen: 0, lastSeen: 0 };
  s.players.p2 = { id: 'p2', name: 'Beto', secretHash: 'y', firstSeen: 0, lastSeen: 0 };
  s = ok(s, p1, { type: 'character/create', draft: draft('Mizael') });
  const ana = Object.keys(s.characters)[0];
  s = ok(s, p2, { type: 'character/create', draft: draft('Bento') });
  const beto = Object.keys(s.characters).find((id) => id !== ana)!;
  s = ok(s, gm, { type: 'character/approve', characterId: ana });
  s = ok(s, gm, { type: 'character/approve', characterId: beto });
  const r = dispatch(s, gm, { type: 'map/create', name: 'Cripta', w: 10, h: 10 }, ctx);
  if (!r.ok) throw new Error(r.error);
  s = r.state;
  const mapId = r.id!;
  s = ok(s, gm, { type: 'map/activate', mapId });
  s = ok(s, gm, { type: 'map/tokenPlace', mapId, refs: [{ kind: 'character', id: ana }], x: 0, y: 0 });
  s = ok(s, gm, { type: 'map/tokenPlace', mapId, refs: [{ kind: 'character', id: beto }], x: 9, y: 9 });
  return { s, ana, beto, mapId };
}

const pos = (s: TableState, mapId: string, characterId: string) => {
  const t = Object.values(s.maps[mapId].tokens).find((x) => x.ref.id === characterId)!;
  return { x: t.x, y: t.y };
};

describe('mapas: edição', () => {
  it('só o mestre edita', () => {
    const { s, mapId } = setup();
    expect(run(s, p1, { type: 'map/create', name: 'X', w: 5, h: 5 })).toMatchObject({ ok: false, error: /mestre/ });
    expect(run(s, p1, { type: 'map/paint', mapId, terrain: 'void', cells: [0] })).toMatchObject({ ok: false, error: /mestre/ });
    expect(run(s, p1, { type: 'map/activate', mapId: null })).toMatchObject({ ok: false });
  });

  it('cria, pinta, põe paredes e portas', () => {
    let { s, mapId } = setup();
    expect(s.maps[mapId].cells).toBe('.'.repeat(100));
    s = ok(s, gm, { type: 'map/paint', mapId, terrain: 'difficult', cells: [1, 2] });
    expect(s.maps[mapId].cells.slice(0, 4)).toBe('.~~.');
    s = ok(s, gm, { type: 'map/walls', mapId, edges: [{ o: 'v', x: 5, y: 0 }, { o: 'h', x: 2, y: 3 }], on: true });
    expect(hasWall(s.maps[mapId], { o: 'v', x: 5, y: 0 })).toBe(true);
    // Porta liga a parede da linha.
    s = ok(s, gm, { type: 'map/objectUpsert', mapId, object: { id: '', kind: 'door', edge: { o: 'v', x: 5, y: 1 }, state: 'closed', hidden: false } });
    const door = Object.values(s.maps[mapId].objects)[0];
    expect(hasWall(s.maps[mapId], { o: 'v', x: 5, y: 1 })).toBe(true);
    s = ok(s, gm, { type: 'map/door', mapId, objectId: door.id, state: 'open' });
    expect(fullGrid(s.maps[mapId]).blockV[1 * 11 + 5]).toBe(0);
    // Tirar a parede leva a porta junto.
    s = ok(s, gm, { type: 'map/walls', mapId, edges: [{ o: 'v', x: 5, y: 1 }], on: false });
    expect(s.maps[mapId].objects[door.id]).toBeUndefined();
    expect(run(s, gm, { type: 'map/walls', mapId, edges: [{ o: 'v', x: 99, y: 0 }], on: true })).toMatchObject({ ok: false, error: /fora do mapa/ });
    expect(run(s, gm, { type: 'map/create', name: 'X', w: 2, h: 5 })).toMatchObject({ ok: false });
  });

  it('gerar troca o desenho e acomoda os tokens no piso', () => {
    let { s, mapId, ana } = setup();
    const params = { ...DUNGEON_DEFAULTS, w: 30, h: 20 };
    s = ok(s, gm, { type: 'map/generate', mapId, params, seed: 5 });
    const m = s.maps[mapId];
    expect([m.w, m.h]).toEqual([30, 20]);
    expect(Object.values(m.objects).every((o) => o.kind === 'door')).toBe(true);
    const p = pos(s, mapId, ana);
    expect(fullGrid(m).mult[p.y * m.w + p.x]).toBeGreaterThan(0);
    // Mesma semente, mesmo mapa.
    const again = ok(s, gm, { type: 'map/generate', mapId, params, seed: 5 }).maps[mapId];
    expect(again.cells).toBe(m.cells);
    expect(again.wallsV).toBe(m.wallsV);
  });

  it('gerar casa mobiliada põe os móveis, e o desenho volta pelo desfazer', () => {
    let { s, mapId, ana } = setup();
    const params = { ...DUNGEON_DEFAULTS, preset: 'house' as const, shape: 'L' as const, furnish: true, w: 30, h: 24 };
    s = ok(s, gm, { type: 'map/generate', mapId, params, seed: 9 });
    const m = s.maps[mapId];
    const props = Object.values(m.objects).filter((o) => o.kind === 'prop');
    expect(props.length).toBeGreaterThan(5);
    const p = pos(s, mapId, ana);
    expect(fullGrid(m).mult[p.y * m.w + p.x]).toBeGreaterThan(0);
    // O desenho gerado passa pela validação do desfazer sem perder nada.
    const layout = { w: m.w, h: m.h, cells: m.cells, wallsH: m.wallsH, wallsV: m.wallsV, objects: m.objects };
    s = ok(s, gm, { type: 'map/paint', mapId, terrain: 'void', cells: [0, 1, 2] });
    s = ok(s, gm, { type: 'map/restore', mapId, layout });
    expect(Object.keys(s.maps[mapId].objects)).toHaveLength(Object.keys(m.objects).length);
  });

  it('redimensionar desloca o conteúdo', () => {
    let { s, mapId, ana } = setup();
    s = ok(s, gm, { type: 'map/paint', mapId, terrain: 'stairs', cells: [0] });
    s = ok(s, gm, { type: 'map/resize', mapId, w: 12, h: 11, dx: 2, dy: 1 });
    const m = s.maps[mapId];
    expect([m.w, m.h]).toEqual([12, 11]);
    expect(m.cells[1 * 12 + 2]).toBe('>');
    expect(m.cells[0]).toBe('#');
    expect(pos(s, mapId, ana)).toEqual({ x: 2, y: 1 });
  });

  it('desfazer restaura o desenho; dados inválidos falham', () => {
    let { s, mapId } = setup();
    const before = s.maps[mapId];
    const layout = { w: before.w, h: before.h, cells: before.cells, wallsH: before.wallsH, wallsV: before.wallsV, objects: before.objects };
    s = ok(s, gm, { type: 'map/paint', mapId, terrain: 'void', cells: [5, 6, 7] });
    s = ok(s, gm, { type: 'map/restore', mapId, layout });
    expect(s.maps[mapId].cells).toBe(before.cells);
    expect(run(s, gm, { type: 'map/restore', mapId, layout: { ...layout, cells: 'x' } })).toMatchObject({ ok: false });
  });

  it('excluir limpa o mapa aberto, o vínculo e os pedidos', () => {
    let { s, mapId, ana } = setup();
    s = ok(s, gm, { type: 'map/update', mapId, mode: 'permissao' });
    s = ok(s, p1, { type: 'map/move', mapId, characterId: ana, x: 1, y: 0 });
    s = ok(s, gm, { type: 'combat/create' });
    s = ok(s, gm, { type: 'map/link', mapId });
    s = ok(s, gm, { type: 'map/delete', mapId });
    expect(s.activeMapId).toBeNull();
    expect(s.combat!.mapId).toBeNull();
    expect(s.requests.filter((r) => r.status === 'pending')).toHaveLength(0);
  });
});

describe('mapas: locomoção', () => {
  it('livre: até o deslocamento a cada movimento, sem acumular', () => {
    let { s, mapId, ana } = setup();
    expect(run(s, p1, { type: 'map/move', mapId, characterId: ana, x: 7, y: 0 })).toMatchObject({ ok: false, error: /alcance/ });
    s = ok(s, p1, { type: 'map/move', mapId, characterId: ana, x: 6, y: 0 });
    s = ok(s, p1, { type: 'map/move', mapId, characterId: ana, x: 9, y: 3 });
    expect(pos(s, mapId, ana)).toEqual({ x: 9, y: 3 });
    // Ficha alheia, quadrado ocupado.
    expect(run(s, p2, { type: 'map/move', mapId, characterId: ana, x: 8, y: 3 })).toMatchObject({ ok: false, error: /não é sua/ });
    expect(run(s, p1, { type: 'map/move', mapId, characterId: ana, x: 9, y: 9 })).toMatchObject({ ok: false });
  });

  it('paredes e portas fechadas bloqueiam o jogador; o mestre teletransporta', () => {
    let { s, mapId, ana } = setup();
    const wall = Array.from({ length: 10 }, (_, y) => ({ o: 'v' as const, x: 2, y }));
    s = ok(s, gm, { type: 'map/walls', mapId, edges: wall, on: true });
    expect(run(s, p1, { type: 'map/move', mapId, characterId: ana, x: 2, y: 0 })).toMatchObject({ ok: false });
    s = ok(s, gm, { type: 'map/objectUpsert', mapId, object: { id: '', kind: 'door', edge: { o: 'v', x: 2, y: 0 }, state: 'open', hidden: false } });
    s = ok(s, p1, { type: 'map/move', mapId, characterId: ana, x: 2, y: 0 });
    const tok = Object.values(s.maps[mapId].tokens).find((t) => t.ref.id === ana)!;
    s = ok(s, gm, { type: 'map/move', mapId, tokenId: tok.id, x: 0, y: 9 });
    expect(pos(s, mapId, ana)).toEqual({ x: 0, y: 9 });
  });

  it('porta secreta é parede para o jogador', () => {
    let { s, mapId, ana } = setup();
    const wall = Array.from({ length: 10 }, (_, y) => ({ o: 'v' as const, x: 2, y }));
    s = ok(s, gm, { type: 'map/walls', mapId, edges: wall, on: true });
    s = ok(s, gm, { type: 'map/objectUpsert', mapId, object: { id: '', kind: 'door', edge: { o: 'v', x: 2, y: 0 }, state: 'open', hidden: true } });
    expect(run(s, p1, { type: 'map/move', mapId, characterId: ana, x: 2, y: 0 })).toMatchObject({ ok: false });
    const v = buildPlayerView(s, 'p1', new Set()).map!;
    expect(v.objects).toHaveLength(0);
    expect(v.wallsV[0 * 11 + 2]).toBe('1');
  });

  it('mapa fechado: ninguém se move', () => {
    let { s, mapId, ana } = setup();
    s = ok(s, gm, { type: 'map/activate', mapId: null });
    expect(run(s, p1, { type: 'map/move', mapId, characterId: ana, x: 1, y: 0 })).toMatchObject({ ok: false, error: /não está aberto/ });
    expect(buildPlayerView(s, 'p1', new Set()).map).toBeNull();
  });

  it('permissionado: todo movimento vira pedido; o novo substitui o anterior', () => {
    let { s, mapId, ana } = setup();
    s = ok(s, gm, { type: 'map/update', mapId, mode: 'permissao' });
    const r = run(s, p1, { type: 'map/move', mapId, characterId: ana, x: 3, y: 0 });
    expect(r).toMatchObject({ ok: true, requested: true });
    s = r.state;
    expect(pos(s, mapId, ana)).toEqual({ x: 0, y: 0 });
    s = ok(s, p1, { type: 'map/move', mapId, characterId: ana, x: 2, y: 2 });
    const pending = s.requests.filter((x) => x.status === 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].permission).toBe('map_move');
    expect(pending[0].summary).toMatch(/C3 em Cripta \(3 quadrados, 4,5 m\)/);
    // Pedido que daria erro nem entra.
    expect(run(s, p1, { type: 'map/move', mapId, characterId: ana, x: 9, y: 0 })).toMatchObject({ ok: false, error: /alcance/ });
    s = ok(s, gm, { type: 'request/resolve', requestId: pending[0].id, approve: true });
    expect(pos(s, mapId, ana)).toEqual({ x: 2, y: 2 });
    s = ok(s, p1, { type: 'map/move', mapId, characterId: ana, x: 3, y: 3 });
    s = ok(s, gm, { type: 'request/resolve', requestId: s.requests[s.requests.length - 1].id, approve: false });
    expect(pos(s, mapId, ana)).toEqual({ x: 2, y: 2 });
  });

  it('por turno: quem age anda até o deslocamento no turno; fora da vez espera; fora da fila pede', () => {
    let { s, mapId, ana, beto } = setup();
    s = ok(s, gm, { type: 'map/update', mapId, mode: 'turno' });
    // Sem combate vinculado: pede.
    expect(run(s, p1, { type: 'map/move', mapId, characterId: ana, x: 1, y: 0 })).toMatchObject({ ok: true, requested: true });
    s = ok(s, gm, { type: 'threat/upsert', data: goblin });
    const tid = Object.keys(s.threats)[0];
    s = ok(s, gm, { type: 'combat/create' });
    s = ok(s, gm, { type: 'combat/add', refs: [{ kind: 'character', id: ana }] });
    s = ok(s, gm, { type: 'combat/add', refs: [{ kind: 'threat', id: tid }] });
    s = ok(s, gm, { type: 'map/link', mapId });
    s = ok(s, gm, { type: 'combat/start' });
    const gob = s.combat!.order[1];
    s = ok(s, gm, { type: 'map/tokenPlace', mapId, refs: [{ kind: 'combatant', id: gob.id }], x: 5, y: 5 });

    // Vez de Ana: 1 diagonal (1) + 1 diagonal (2) = 3; depois 3 retas; depois acabou.
    s = ok(s, p1, { type: 'map/move', mapId, characterId: ana, x: 1, y: 1 });
    s = ok(s, p1, { type: 'map/move', mapId, characterId: ana, x: 2, y: 2 });
    let mv = buildPlayerView(s, 'p1', new Set()).map!.moves[0];
    expect(mv).toMatchObject({ squares: 6, remaining: 3, parity: 0, gate: 'free' });
    s = ok(s, p1, { type: 'map/move', mapId, characterId: ana, x: 5, y: 2 });
    expect(run(s, p1, { type: 'map/move', mapId, characterId: ana, x: 6, y: 2 })).toMatchObject({ ok: false, error: /Sem deslocamento/ });

    // Beto está fora da fila: pede ao mestre.
    expect(run(s, p2, { type: 'map/move', mapId, characterId: beto, x: 8, y: 9 })).toMatchObject({ ok: true, requested: true });

    // Vez do goblin: Ana espera.
    s = ok(s, gm, { type: 'combat/next' });
    expect(run(s, p1, { type: 'map/move', mapId, characterId: ana, x: 5, y: 3 })).toMatchObject({ ok: false, error: /Aguarde sua vez/ });
    expect(buildPlayerView(s, 'p1', new Set()).map!.moves[0].gate).toBe('blocked');
    // Mestre move o goblin na vez dele: conta no turno.
    const gobTok = Object.values(s.maps[mapId].tokens).find((t) => t.ref.kind === 'combatant')!;
    s = ok(s, gm, { type: 'map/move', mapId, tokenId: gobTok.id, x: 5, y: 8 });
    expect(s.combat!.moved).toMatchObject({ combatantId: gob.id, squares: 3 });

    // Rodada 2, vez de Ana de novo: deslocamento inteiro.
    s = ok(s, gm, { type: 'combat/next' });
    mv = buildPlayerView(s, 'p1', new Set()).map!.moves[0];
    expect(mv).toMatchObject({ remaining: 6, gate: 'free' });
    s = ok(s, p1, { type: 'map/move', mapId, characterId: ana, x: 5, y: 7 });

    // Fim do combate: a ameaça sai do mapa, a ficha fica.
    s = ok(s, gm, { type: 'combat/end' });
    const kinds = Object.values(s.maps[mapId].tokens).map((t) => t.ref.kind);
    expect(kinds).not.toContain('combatant');
    expect(kinds.filter((k) => k === 'character')).toHaveLength(2);
  });

  it('sair da fila tira a ameaça do mapa; excluir a ficha tira o token', () => {
    let { s, mapId, beto } = setup();
    s = ok(s, gm, { type: 'threat/upsert', data: goblin });
    s = ok(s, gm, { type: 'combat/create' });
    s = ok(s, gm, { type: 'combat/add', refs: [{ kind: 'threat', id: Object.keys(s.threats)[0] }] });
    const gob = s.combat!.order[0];
    s = ok(s, gm, { type: 'map/tokenPlace', mapId, refs: [{ kind: 'combatant', id: gob.id }] });
    expect(Object.keys(s.maps[mapId].tokens)).toHaveLength(3);
    s = ok(s, gm, { type: 'combat/remove', combatantIds: [gob.id] });
    expect(Object.keys(s.maps[mapId].tokens)).toHaveLength(2);
    s = ok(s, gm, { type: 'character/delete', characterId: beto });
    expect(Object.values(s.maps[mapId].tokens).map((t) => t.ref.id)).not.toContain(beto);
  });

  it('ameaça do livro vai direto para o quadrado escolhido (abre combate em preparação se preciso)', () => {
    let { s, mapId } = setup();
    s = ok(s, gm, { type: 'threat/upsert', data: goblin });
    const tid = Object.keys(s.threats)[0];
    expect(s.combat).toBeFalsy();
    s = ok(s, gm, { type: 'map/tokenPlace', mapId, refs: [{ kind: 'threat', id: tid }], x: 4, y: 3 });
    expect(s.combat).toMatchObject({ round: 0, mapId });
    expect(s.combat!.order).toHaveLength(1);
    const first = Object.values(s.maps[mapId].tokens).find((t) => t.ref.kind === 'combatant')!;
    expect([first.x, first.y]).toEqual([4, 3]);
    // Cada colocação é uma instância nova, numerada.
    s = ok(s, gm, { type: 'map/tokenPlace', mapId, refs: [{ kind: 'threat', id: tid }], x: 4, y: 3 });
    expect(s.combat!.order.map((c) => c.threat!.name)).toEqual(['Goblin 1', 'Goblin 2']);
    const second = Object.values(s.maps[mapId].tokens).find((t) => t.ref.kind === 'combatant' && t.id !== first.id)!;
    expect(second.x !== 4 || second.y !== 3).toBe(true);
    expect(run(s, p1, { type: 'map/tokenPlace', mapId, refs: [{ kind: 'threat', id: tid }] })).toMatchObject({ ok: false });
    expect(run(s, gm, { type: 'map/tokenPlace', mapId, refs: [{ kind: 'threat', id: 'nada' }] })).toMatchObject({ ok: false, error: /Ameaça/ });
  });

  it('caminho exato: o jogador anda pelo trajeto que traçou, e todos veem o rastro', () => {
    let { s, mapId, ana } = setup();
    // Ana em A1 com 6 quadrados: desvio em U até C1 custa 1+1+1+1 = 4 (o direto custaria 2).
    const path = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 0 }];
    s = ok(s, p1, { type: 'map/move', mapId, characterId: ana, x: 2, y: 0, path });
    const tok = Object.values(s.maps[mapId].tokens).find((t) => t.ref.id === ana)!;
    expect([tok.x, tok.y]).toEqual([2, 0]);
    expect(tok.trail).toEqual(path);
    expect(buildPlayerView(s, 'p2', new Set()).map!.tokens.find((t) => t.id === tok.id)!.trail).toEqual(path);
    // Caminho que não começa no personagem, que pula ou que passa do deslocamento: recusado.
    expect(run(s, p1, { type: 'map/move', mapId, characterId: ana, x: 4, y: 0, path: [{ x: 3, y: 0 }, { x: 4, y: 0 }] })).toMatchObject({ ok: false, error: /não liga/ });
    expect(run(s, p1, { type: 'map/move', mapId, characterId: ana, x: 4, y: 0, path: [{ x: 2, y: 0 }, { x: 4, y: 0 }] })).toMatchObject({ ok: false, error: /não dá para andar/ });
    const long = Array.from({ length: 8 }, (_, i) => ({ x: 2 + i, y: 0 }));
    expect(run(s, p1, { type: 'map/move', mapId, characterId: ana, x: 9, y: 0, path: long })).toMatchObject({ ok: false, error: /passa do deslocamento/ });
    // Mestre também traça, sem limite.
    s = ok(s, gm, { type: 'map/move', mapId, tokenId: tok.id, x: 2, y: 2, path: [{ x: 2, y: 0 }, { x: 3, y: 1 }, { x: 2, y: 2 }] });
    expect(s.maps[mapId].tokens[tok.id].trail).toHaveLength(3);
  });

  it('rastro que passa por porta secreta não vai para os jogadores', () => {
    let { s, mapId, ana } = setup();
    const wall = Array.from({ length: 10 }, (_, y) => ({ o: 'v' as const, x: 1, y }));
    s = ok(s, gm, { type: 'map/walls', mapId, edges: wall, on: true });
    s = ok(s, gm, { type: 'map/objectUpsert', mapId, object: { id: '', kind: 'door', edge: { o: 'v', x: 1, y: 0 }, state: 'open', hidden: true } });
    const tok = Object.values(s.maps[mapId].tokens).find((t) => t.ref.id === ana)!;
    s = ok(s, gm, { type: 'map/move', mapId, tokenId: tok.id, x: 2, y: 0 });
    expect(s.maps[mapId].tokens[tok.id].trail).toHaveLength(3);
    expect(buildPlayerView(s, 'p2', new Set()).map!.tokens.find((t) => t.id === tok.id)!.trail).toBeUndefined();
  });

  it('jogador atravessa porta fechada pagando o dobro; trancada não passa', () => {
    let { s, mapId, ana } = setup();
    // Parede vertical entre as colunas 0 e 1, de cima a baixo, com uma porta fechada em A1|B1.
    const wall = Array.from({ length: 10 }, (_, y) => ({ o: 'v' as const, x: 1, y }));
    s = ok(s, gm, { type: 'map/walls', mapId, edges: wall, on: true });
    s = ok(s, gm, { type: 'map/objectUpsert', mapId, object: { id: '', kind: 'door', edge: { o: 'v', x: 1, y: 0 }, state: 'locked', hidden: false } });
    const door = Object.values(s.maps[mapId].objects).find((o) => o.kind === 'door')!;
    expect(run(s, p1, { type: 'map/move', mapId, characterId: ana, x: 1, y: 0 })).toMatchObject({ ok: false });
    s = ok(s, gm, { type: 'map/door', mapId, objectId: door.id, state: 'closed' });
    const v = buildPlayerView(s, 'p1', new Set()).map!;
    expect(v.objects).toHaveLength(1);
    s = ok(s, p1, { type: 'map/move', mapId, characterId: ana, x: 1, y: 0 });
    expect(pos(s, mapId, ana)).toEqual({ x: 1, y: 0 });
  });
});

describe('mapas: visão do jogador', () => {
  it('sem ocultos, com nomes protegidos e o alcance das próprias fichas', () => {
    let { s, mapId, ana, beto } = setup();
    s = ok(s, gm, { type: 'npc/create', draft: draft('Vulto') });
    const npc = Object.values(s.characters).find((c) => c.kind === 'npc')!;
    s = ok(s, gm, { type: 'map/tokenPlace', mapId, refs: [{ kind: 'character', id: npc.id }] });
    const betoTok = Object.values(s.maps[mapId].tokens).find((t) => t.ref.id === beto)!;
    s = ok(s, gm, { type: 'map/tokenHidden', mapId, tokenIds: [betoTok.id], hidden: true });
    s = ok(s, gm, { type: 'map/objectUpsert', mapId, object: { id: '', kind: 'prop', prop: 'barril', label: '', x: 4, y: 4, w: 1, h: 1, effect: 'block', hidden: true } });
    const v = buildPlayerView(s, 'p1', new Set()).map!;
    expect(v.name).toBe('Cripta');
    expect(v.tokens.map((t) => t.name).sort()).toEqual(['Desconhecido', 'Mizael']);
    expect(v.tokens.find((t) => t.mine)).toMatchObject({ characterId: ana, side: 'pc' });
    expect(v.objects).toHaveLength(0);
    expect(v.moves).toEqual([{ characterId: ana, tokenId: expect.any(String), squares: 6, remaining: 6, parity: 0, gate: 'free' }]);
    // Beto não vê a própria ficha oculta como dele para mover.
    expect(buildPlayerView(s, 'p2', new Set()).map!.moves).toHaveLength(0);
  });

  it('migração completa campos de mapa', () => {
    const { s } = setup();
    const old = structuredClone(s) as Partial<TableState>;
    delete old.maps;
    delete old.activeMapId;
    const m = migrate(old as TableState);
    expect(m.maps).toEqual({});
    expect(m.activeMapId).toBeNull();
  });
});
