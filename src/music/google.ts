// Conta do YouTube do mestre: login Google (só leitura) para listar as playlists dele.
// Tudo roda no navegador; o token vale cerca de 1 hora e é renovado quando preciso.
// Anúncios não dependem disto: quem tem YouTube Premium e está logado no youtube.com
// neste navegador já assiste sem anúncios no player incorporado.
import { Store } from '../net/emitter';
import type { Track } from './youtube';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const API = 'https://www.googleapis.com/youtube/v3';
const TOKEN_KEY = 'eva3.music.token';
const CONNECTED_KEY = 'eva3.music.connected';
/** Teto de faixas lidas de uma playlist (o player incorporado também para em 200). */
const MAX_TRACKS = 200;

export const accountConfigured = Boolean(CLIENT_ID);

export interface Account {
  status: 'off' | 'connecting' | 'on';
  name?: string;
  avatar?: string;
  error?: string;
}

export interface AccountPlaylist {
  id: string;
  title: string;
  count: number;
  thumb?: string;
}

interface SavedToken { token: string; exp: number }

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken(o?: { prompt?: string }): void }
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(c: {
        client_id: string; scope: string; prompt?: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type: string; message?: string }) => void;
      }): TokenClient;
      revoke(token: string, done?: () => void): void;
    };
  };
}

declare global {
  interface Window { google?: Gis }
}

function readToken(): SavedToken | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as SavedToken | null;
    return t && t.exp > Date.now() + 60_000 ? t : null;
  } catch {
    return null;
  }
}

let saved: SavedToken | null = readToken();
const wasConnected = (() => { try { return localStorage.getItem(CONNECTED_KEY) === '1'; } catch { return false; } })();

export const accountStore = new Store<Account>({ status: wasConnected && accountConfigured ? 'on' : 'off' });

let gisPromise: Promise<Gis> | null = null;
function loadGis(): Promise<Gis> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (gisPromise) return gisPromise;
  gisPromise = new Promise<Gis>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google ? resolve(window.google) : reject(new Error('Login do Google indisponível.')));
    s.onerror = () => { gisPromise = null; s.remove(); reject(new Error('Não foi possível carregar o login do Google.')); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

function requestToken(prompt: '' | 'consent' | 'select_account'): Promise<string> {
  return loadGis().then((g) => new Promise<string>((resolve, reject) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (!r.access_token) { reject(new Error(r.error_description || r.error || 'Login cancelado.')); return; }
        saved = { token: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000 };
        try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(saved)); } catch { /* só na memória */ }
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Janela de login fechada.' : e.type === 'popup_failed_to_open' ? 'O navegador bloqueou a janela de login.' : (e.message || 'Login cancelado.'))),
    });
    client.requestAccessToken({ prompt });
  }));
}

/** Há um token válido: dá para chamar a API sem abrir a janela de login. */
export const hasToken = () => Boolean(saved && saved.exp > Date.now() + 60_000);

async function token(): Promise<string> {
  if (saved && saved.exp > Date.now() + 60_000) return saved.token;
  return requestToken('');
}

async function api<T>(path: string, params: Record<string, string>, retry = true): Promise<T> {
  const t = await token();
  const r = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${t}` } });
  if (r.status === 401 && retry) {
    saved = null;
    return api(path, params, false);
  }
  if (!r.ok) {
    const body = await r.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message || `YouTube respondeu ${r.status}.`);
  }
  return r.json() as Promise<T>;
}

type Thumbs = Record<string, { url: string } | undefined>;
const pickThumb = (t?: Thumbs) => t?.medium?.url ?? t?.default?.url;

async function loadProfile() {
  const r = await api<{ items?: { snippet: { title: string; thumbnails?: Thumbs } }[] }>('channels', { part: 'snippet', mine: 'true' });
  const ch = r.items?.[0]?.snippet;
  accountStore.set({ status: 'on', name: ch?.title ?? 'Conta conectada', avatar: pickThumb(ch?.thumbnails) });
}

/** Abre o login do Google. Chame direto de um clique, senão o navegador bloqueia a janela. */
export async function connectAccount() {
  if (!accountConfigured) return;
  accountStore.set({ status: 'connecting' });
  try {
    await requestToken('select_account');
    try { localStorage.setItem(CONNECTED_KEY, '1'); } catch { /* ok */ }
    await loadProfile();
  } catch (e) {
    accountStore.set({ status: 'off', error: (e as Error).message });
  }
}

export function disconnectAccount() {
  const t = saved?.token;
  saved = null;
  try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(CONNECTED_KEY); } catch { /* ok */ }
  accountStore.set({ status: 'off' });
  if (t) window.google?.accounts.oauth2.revoke(t);
}

/** Nome e foto do canal, quando a conexão foi lembrada de outra visita. */
export async function ensureProfile() {
  const a = accountStore.get();
  if (a.status !== 'on' || a.name || !hasToken()) return;
  try { await loadProfile(); } catch (e) { accountStore.set({ status: 'on', name: 'Conta conectada', error: (e as Error).message }); }
}

export async function listMyPlaylists(): Promise<AccountPlaylist[]> {
  const out: AccountPlaylist[] = [];
  let pageToken = '';
  do {
    const r = await api<{
      nextPageToken?: string;
      items?: { id: string; snippet: { title: string; thumbnails?: Thumbs }; contentDetails?: { itemCount?: number } }[];
    }>('playlists', { part: 'snippet,contentDetails', mine: 'true', maxResults: '50', ...(pageToken ? { pageToken } : {}) });
    for (const p of r.items ?? []) out.push({ id: p.id, title: p.snippet.title, count: p.contentDetails?.itemCount ?? 0, thumb: pickThumb(p.snippet.thumbnails) });
    pageToken = r.nextPageToken ?? '';
  } while (pageToken && out.length < 500);
  return out;
}

const HIDDEN_TITLES = new Set(['Private video', 'Deleted video', 'Vídeo privado', 'Vídeo excluído']);

export async function listPlaylistTracks(playlistId: string): Promise<Track[]> {
  const out: Track[] = [];
  let pageToken = '';
  do {
    const r = await api<{
      nextPageToken?: string;
      items?: { snippet: { title: string; videoOwnerChannelTitle?: string; resourceId?: { videoId?: string } }; status?: { privacyStatus?: string } }[];
    }>('playlistItems', { part: 'snippet,status', playlistId, maxResults: '50', ...(pageToken ? { pageToken } : {}) });
    for (const it of r.items ?? []) {
      const id = it.snippet.resourceId?.videoId;
      if (!id || it.status?.privacyStatus === 'private' || HIDDEN_TITLES.has(it.snippet.title)) continue;
      out.push({ id, title: it.snippet.title, channel: it.snippet.videoOwnerChannelTitle?.replace(/ - Topic$/, '') });
    }
    pageToken = r.nextPageToken ?? '';
  } while (pageToken && out.length < MAX_TRACKS);
  return out.slice(0, MAX_TRACKS);
}
