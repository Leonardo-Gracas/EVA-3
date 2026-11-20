import { describe, expect, it } from 'vitest';
import { createPlaylist, libraryStore, setTrackAlias, validPlaylists } from './library';

const tracks = () => libraryStore.get().find((p) => p.name === 'Apelidos')!.tracks;

describe('apelidos das faixas', () => {
  it('dá, troca e tira o apelido de uma faixa', () => {
    const id = createPlaylist('Apelidos', [{ id: 'aaaaaaaaaaa', title: 'Epic Battle Music 10 Hours' }, { id: 'bbbbbbbbbbb', title: 'Rain' }]);
    setTrackAlias(id, 0, '  Chefe final  ');
    expect(tracks()[0].alias).toBe('Chefe final');
    expect(tracks()[1].alias).toBeUndefined();
    setTrackAlias(id, 0, 'Epic Battle Music 10 Hours');
    expect(tracks()[0]).not.toHaveProperty('alias');
    setTrackAlias(id, 1, 'Chuva');
    setTrackAlias(id, 1, '');
    expect(tracks()[1]).not.toHaveProperty('alias');
  });

  it('mantém o apelido ao ler um backup e descarta apelidos inválidos', () => {
    const [p] = validPlaylists([{ id: 'p', name: 'X', createdAt: 1, tracks: [
      { id: 'aaaaaaaaaaa', title: 'A', alias: 'Taverna' },
      { id: 'bbbbbbbbbbb', title: 'B', alias: '   ' },
      { id: 'ccccccccccc', title: 'C', alias: 3 },
    ] }]);
    expect(p.tracks.map((t) => t.alias)).toEqual(['Taverna', undefined, undefined]);
  });
});
