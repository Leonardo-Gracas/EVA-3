import { describe, expect, it } from 'vitest';
import { dispatch, newTable, type EngineCtx } from './engine';
import { ITEM_SETS } from './itemSets';
import { THREAT_SETS } from './threatSets';
import { backupContents, buildFullBackup, buildTableBackup, parseBackup } from './persistence';
import { restoreHostKey } from '../net/identity';
import { blankLayout } from '../model/map';
import type { BattleMap, TableState } from '../model/types';
import type { LocalPlaylist } from '../music/library';

let n = 0;
const ctx: EngineCtx = { now: () => 1000, newId: () => `id${++n}`, rng: () => 3 };
const KEY = 'a'.repeat(64);
const playlists: LocalPlaylist[] = [{ id: 'p1', name: 'Tensão', tracks: [{ id: 'abc', title: 'Faixa' }], createdAt: 1 }];

/** Mesa com um pouco de tudo: itens, ameaças, jogador, mapa e combate. */
function fullTable(): TableState {
  let t = newTable('Mesa cheia', 'Mestre', 'ABCDEF', ctx);
  const gm = { role: 'gm' as const, name: 'Mestre' };
  for (const item of ITEM_SETS[1].items) t = dispatch(t, gm, { type: 'library/upsert', item }, ctx).state;
  for (const data of THREAT_SETS[0].items) t = dispatch(t, gm, { type: 'threat/upsert', data }, ctx).state;
  t.players.p1 = { id: 'p1', name: 'Ana', secretHash: 'h', firstSeen: 1, lastSeen: 2 };
  const map = { id: 'm1', name: 'Porão', ...blankLayout(8, 6), tokens: {}, createdAt: 1, updatedAt: 1 } as unknown as BattleMap;
  t.maps.m1 = map;
  t.activeMapId = 'm1';
  t.combat = { round: 2, turn: 0, order: [], mapId: 'm1' } as unknown as TableState['combat'];
  return t;
}

/** Ida e volta pelo texto do arquivo, como no download. */
const roundTrip = (data: unknown) => parseBackup(JSON.parse(JSON.stringify(data)));

describe('backup de mesa', () => {
  it('leva a mesa inteira, a chave da sala e as playlists', () => {
    const t = fullTable();
    restoreHostKey(t.id, KEY);
    const b = roundTrip(buildTableBackup(t, playlists));
    expect(b.tables).toHaveLength(1);
    const [{ table, hostKey }] = b.tables;
    expect(hostKey).toBe(KEY);
    expect(table.roomCode).toBe('ABCDEF');
    expect(table.players.p1.name).toBe('Ana');
    expect(table.maps.m1.w).toBe(8);
    expect(table.activeMapId).toBe('m1');
    expect(table.combat?.round).toBe(2);
    expect(Object.keys(table.threats)).toEqual(Object.keys(t.threats));
    expect(Object.keys(table.itemLibrary)).toEqual(Object.keys(t.itemLibrary));
    expect(b.playlists.map((p) => p.name)).toEqual(['Tensão']);
  });

  it('resume o conteúdo para conferir antes de importar', () => {
    const c = backupContents(fullTable());
    expect(c).toMatchObject({ players: 1, maps: 1, combat: true });
    expect(c.threats).toBeGreaterThan(0);
    expect(c.items).toBeGreaterThan(0);
  });

  it('backup de todas as mesas devolve cada uma com a sua chave', () => {
    const a = fullTable();
    const b = newTable('Outra', 'Mestre', 'XYZ123', ctx);
    restoreHostKey(a.id, KEY);
    const r = roundTrip(buildFullBackup([a, b], playlists));
    expect(r.tables.map((e) => e.table.name)).toEqual(['Mesa cheia', 'Outra']);
    expect(r.tables[0].hostKey).toBe(KEY);
    expect(r.tables[1].hostKey).toBeUndefined();
    expect(r.playlists).toHaveLength(1);
  });

  it('continua lendo o formato antigo e a mesa solta', () => {
    const t = newTable('Antiga', 'Mestre', 'AAAAAA', ctx);
    const v1 = roundTrip({ app: 'eva3', version: 1, exportedAt: '2026-01-01T00:00:00Z', table: t });
    expect(v1.tables[0].table.name).toBe('Antiga');
    expect(v1.playlists).toEqual([]);
    expect(roundTrip(t).tables[0].table.id).toBe(t.id);
  });

  it('completa o que falta em mesas antigas', () => {
    const t = newTable('Velha', 'Mestre', 'AAAAAA', ctx) as Partial<TableState>;
    delete t.maps;
    delete t.combat;
    delete t.campaign;
    const [{ table }] = roundTrip({ app: 'eva3', version: 1, table: t }).tables;
    expect(table.maps).toEqual({});
    expect(table.combat).toBeNull();
    expect(table.campaign.sessions).toEqual({});
  });

  it('descarta chave de sala inválida', () => {
    const t = newTable('Mesa', 'Mestre', 'AAAAAA', ctx);
    expect(roundTrip({ app: 'eva3', version: 2, table: t, hostKey: 'xyz' }).tables[0].hostKey).toBeUndefined();
  });

  it('recusa arquivos que não são backup de mesa', () => {
    expect(() => parseBackup({ app: 'eva3', type: 'characters', characters: [] })).toThrow(/fichas/);
    expect(() => parseBackup({ app: 'eva3', type: 'all', tables: [] })).toThrow(/nenhuma mesa/);
    expect(() => parseBackup([1, 2])).toThrow(/não é um backup/);
    expect(() => parseBackup({ app: 'eva3', version: 2, table: { schema: 1 } })).toThrow(/não é um backup/);
    const t = newTable('Mesa', 'Mestre', 'AAAAAA', ctx);
    expect(() => parseBackup({ app: 'eva3', version: 2, table: { ...t, maps: [] } })).toThrow(/danificado/);
    expect(() => parseBackup({ app: 'eva3', type: 'all', tables: [{ table: t }, { table: t }] })).toThrow(/duas vezes/);
  });
});
