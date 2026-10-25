// YouTube: leitura de links, miniaturas, título via oEmbed e carregamento da API do iframe.

export interface Track {
  /** ID do vídeo (11 caracteres). */
  id: string;
  /** Vazio enquanto o título não é conhecido. */
  title: string;
  channel?: string;
}

export interface YouTubeLink {
  videoId?: string;
  playlistId?: string;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID = /^[A-Za-z0-9_-]{10,64}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);

/** Lê um link do YouTube (vídeo, playlist ou os dois) ou um ID de vídeo puro. */
export function parseYouTube(input: string): YouTubeLink | null {
  const raw = input.trim();
  if (!raw) return null;
  if (VIDEO_ID.test(raw)) return { videoId: raw };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  let videoId: string | undefined;
  if (host === 'youtu.be') {
    videoId = url.pathname.split('/')[1];
  } else if (HOSTS.has(host)) {
    const [, first, second] = url.pathname.split('/');
    if (first === 'watch') videoId = url.searchParams.get('v') ?? undefined;
    else if (['shorts', 'embed', 'live', 'v'].includes(first)) videoId = second;
  } else {
    return null;
  }
  const list = url.searchParams.get('list') ?? undefined;
  const out: YouTubeLink = {};
  if (videoId && VIDEO_ID.test(videoId)) out.videoId = videoId;
  // Mixes automáticos (RD…) não carregam no player incorporado: fica só o vídeo.
  if (list && LIST_ID.test(list) && !(list.startsWith('RD') && out.videoId)) out.playlistId = list;
  return out.videoId || out.playlistId ? out : null;
}

/** Vários links colados de uma vez (um por linha ou separados por espaço): só os vídeos, sem repetir. */
export function parseVideoIds(text: string): string[] {
  const ids: string[] = [];
  for (const part of text.split(/\s+/)) {
    const id = parseYouTube(part)?.videoId;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export const thumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
/** Capa maior (4:3 com faixas pretas; cortada para 16:9 na tela). */
export const artUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export type OEmbed = { ok: true; title: string; channel: string } | { ok: false; blocked: boolean };

// Consultas ao oEmbed: no máximo algumas ao mesmo tempo (uma playlist pode ter 200 vídeos).
const MAX_PARALLEL = 6;
let active = 0;
const waiting: (() => void)[] = [];

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** oEmbed do YouTube: título e canal, sem conta. 401/403/404 = vídeo proibido fora do site, privado ou inexistente. */
async function oembed(url: string): Promise<OEmbed> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
    if (r.status === 401 || r.status === 403 || r.status === 404) return { ok: false, blocked: true };
    if (!r.ok) return { ok: false, blocked: false };
    const j = await r.json() as { title?: string; author_name?: string };
    return { ok: true, title: j.title ?? '', channel: j.author_name ?? '' };
  } catch {
    return { ok: false, blocked: false };
  }
}

const infoCache = new Map<string, Promise<OEmbed>>();

/** Título e canal de um vídeo (com cache; falhas de rede são tentadas de novo na próxima vez). */
export function fetchVideoInfo(id: string): Promise<OEmbed> {
  let pr = infoCache.get(id);
  if (!pr) {
    pr = limited(() => oembed(watchUrl(id)));
    infoCache.set(id, pr);
    pr.then((r) => { if (!r.ok && !r.blocked) infoCache.delete(id); });
  }
  return pr;
}

/** Nome de uma playlist pública ou não listada. */
export async function fetchPlaylistTitle(listId: string): Promise<string> {
  const r = await limited(() => oembed(`https://www.youtube.com/playlist?list=${listId}`));
  return r.ok ? r.title : '';
}

// ── API do iframe (https://developers.google.com/youtube/iframe_api_reference) ──

export const YTState = { Unstarted: -1, Ended: 0, Playing: 1, Paused: 2, Buffering: 3, Cued: 5 } as const;

export interface YTPlayer {
  loadVideoById(videoId: string, startSeconds?: number): void;
  cueVideoById(videoId: string, startSeconds?: number): void;
  cuePlaylist(args: { list: string; listType: 'playlist' }): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  getPlaylist(): string[] | null;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData(): { video_id?: string; title?: string; author?: string };
  destroy(): void;
}

interface YTPlayerOptions {
  width?: string | number;
  height?: string | number;
  host?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: { target: YTPlayer }) => void;
    onStateChange?: (e: { data: number; target: YTPlayer }) => void;
    onError?: (e: { data: number; target: YTPlayer }) => void;
  };
}

interface YTNamespace {
  Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Carrega https://www.youtube.com/iframe_api uma vez. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      s.remove();
      reject(new Error('Não foi possível carregar o player do YouTube.'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

/** Mensagem para os códigos de erro do player. */
export function playerErrorText(code: number): string {
  if (code === 101 || code === 150) return 'O dono do vídeo não deixa tocar fora do YouTube.';
  if (code === 100) return 'Vídeo removido ou privado.';
  if (code === 153) return 'O YouTube recusou o player (referência do site ausente).';
  return 'O YouTube não conseguiu tocar este vídeo.';
}
