import { describe, expect, it } from 'vitest';
import { formatTime, parseVideoIds, parseYouTube } from './youtube';

describe('parseYouTube', () => {
  it('lê os formatos de link de vídeo', () => {
    const id = 'dQw4w9WgXcQ';
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&t=42s`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://music.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}?si=abc`,
      `youtu.be/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/live/${id}`,
      id,
    ]) {
      expect(parseYouTube(url), url).toEqual({ videoId: id });
    }
  });

  it('lê playlists, com ou sem vídeo', () => {
    const list = 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG';
    expect(parseYouTube(`https://www.youtube.com/playlist?list=${list}`)).toEqual({ playlistId: list });
    expect(parseYouTube(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${list}&index=3`)).toEqual({ videoId: 'dQw4w9WgXcQ', playlistId: list });
  });

  it('ignora mixes automáticos quando há vídeo', () => {
    expect(parseYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ')).toEqual({ videoId: 'dQw4w9WgXcQ' });
  });

  it('recusa o que não é do YouTube', () => {
    expect(parseYouTube('')).toBeNull();
    expect(parseYouTube('https://vimeo.com/123456')).toBeNull();
    expect(parseYouTube('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTube('https://www.youtube.com/watch?v=curto')).toBeNull();
    expect(parseYouTube('qualquer coisa')).toBeNull();
  });
});

describe('parseVideoIds', () => {
  it('separa vários links, sem repetir e sem playlists soltas', () => {
    const text = `https://youtu.be/dQw4w9WgXcQ
      https://www.youtube.com/watch?v=9bZkp7q19f0  https://youtu.be/dQw4w9WgXcQ
      https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG`;
    expect(parseVideoIds(text)).toEqual(['dQw4w9WgXcQ', '9bZkp7q19f0']);
  });
});

describe('formatTime', () => {
  it('formata minutos e horas', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.7)).toBe('1:05');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(Number.NaN)).toBe('0:00');
  });
});
