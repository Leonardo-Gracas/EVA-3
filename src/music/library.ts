// Playlists montadas no EVA e preferências do player. Ficam no navegador do mestre
// (localStorage), fora da mesa: não entram no backup nem chegam aos jogadores.
import { Store } from '../net/emitter';
import type { Track } from './youtube';

export interface LocalPlaylist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
}

export type Repeat = 'all' | 'one' | 'off';
export type MusicTab = 'fila' | 'sistema';

export interface MusicPrefs {
  volume: number;
  muted: boolean;
  repeat: Repeat;
  shuffle: boolean;
  tab: MusicTab;
  /** Segundos de transição entre faixas (0 = corte seco). */
  crossfade: number;
}

export const CROSSFADE_STEPS = [0, 3, 5, 8, 12];

const LIB_KEY = 'eva3.music.playlists';
const PREFS_KEY = 'eva3.music.prefs';
const DEFAULT_PREFS: MusicPrefs = { volume: 60, muted: false, repeat: 'all', shuffle: false, tab: 'sistema', crossfade: 5 };

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* segue só na memória */ }
}

function validPlaylists(v: unknown): LocalPlaylist[] {
  if (!Array.isArray(v)) return [];
  return v.filter((p): p is LocalPlaylist => !!p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.tracks))
    .map((p) => ({ ...p, tracks: p.tracks.filter((t) => t && typeof t.id === 'string').map((t) => ({ ...t, title: t.title ?? '' })) }));
}

export const libraryStore = new Store<LocalPlaylist[]>(validPlaylists(read(LIB_KEY)));
function validPrefs(v: Partial<MusicPrefs> | null): MusicPrefs {
  const prefs = { ...DEFAULT_PREFS, ...v };
  if (prefs.tab !== 'fila' && prefs.tab !== 'sistema') prefs.tab = DEFAULT_PREFS.tab;
  if (!CROSSFADE_STEPS.includes(prefs.crossfade)) prefs.crossfade = DEFAULT_PREFS.crossfade;
  return prefs;
}

export const prefsStore = new Store<MusicPrefs>(validPrefs(read<Partial<MusicPrefs>>(PREFS_KEY)));

libraryStore.subscribe(() => write(LIB_KEY, libraryStore.get()));
prefsStore.subscribe(() => write(PREFS_KEY, prefsStore.get()));

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function update(id: string, fn: (p: LocalPlaylist) => LocalPlaylist) {
  libraryStore.set(libraryStore.get().map((p) => (p.id === id ? fn(p) : p)));
}

export function createPlaylist(name: string, tracks: Track[] = []): string {
  const id = newId();
  libraryStore.set([...libraryStore.get(), { id, name: name.trim() || 'Nova playlist', tracks, createdAt: Date.now() }]);
  return id;
}

export function renamePlaylist(id: string, name: string) {
  update(id, (p) => ({ ...p, name }));
}

export function deletePlaylist(id: string) {
  libraryStore.set(libraryStore.get().filter((p) => p.id !== id));
}

/** Acrescenta faixas no fim; as que já estão na playlist ficam onde estão. Devolve quantas entraram. */
export function addTracks(id: string, tracks: Track[]): number {
  let added = 0;
  update(id, (p) => {
    const have = new Set(p.tracks.map((t) => t.id));
    const fresh = tracks.filter((t) => !have.has(t.id) && have.add(t.id));
    added = fresh.length;
    return { ...p, tracks: [...p.tracks, ...fresh] };
  });
  return added;
}

export function removeTrack(id: string, index: number) {
  update(id, (p) => ({ ...p, tracks: p.tracks.filter((_, i) => i !== index) }));
}

export function moveTrack(id: string, from: number, to: number) {
  update(id, (p) => {
    if (to < 0 || to >= p.tracks.length) return p;
    const tracks = [...p.tracks];
    const [t] = tracks.splice(from, 1);
    tracks.splice(to, 0, t);
    return { ...p, tracks };
  });
}

/** Completa título e canal de um vídeo em todas as playlists que ainda não os têm. */
export function fillTrackInfo(videoId: string, title: string, channel?: string) {
  if (!title) return;
  const list = libraryStore.get();
  if (!list.some((p) => p.tracks.some((t) => t.id === videoId && (!t.title || (channel && !t.channel))))) return;
  libraryStore.set(list.map((p) => ({
    ...p,
    tracks: p.tracks.map((t) => (t.id === videoId ? { ...t, title: t.title || title, channel: t.channel || channel } : t)),
  })));
}
