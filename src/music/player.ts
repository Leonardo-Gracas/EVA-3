// Player de trilha sonora do mestre: um único iframe do YouTube, controlado daqui.
// Só existe na tela do mestre; nada disto passa pela mesa nem chega aos jogadores.
import { Store } from '../net/emitter';
import { toast } from '../components/common/toast';
import { fillTrackInfo, prefsStore, type Repeat } from './library';
import { loadYouTubeApi, playerErrorText, YTState, type Track, type YTPlayer } from './youtube';

export type QueueSource =
  | { kind: 'local'; id: string; name: string }
  | { kind: 'account'; id: string; name: string }
  | { kind: 'link'; name: string };

export interface PlayerState {
  /** Player criado e pronto para receber comandos. */
  ready: boolean;
  loadError: string | null;
  source: QueueSource | null;
  /** Fila na ordem em que toca (embaralhada quando o aleatório está ligado). */
  queue: Track[];
  current: Track | null;
  playing: boolean;
  buffering: boolean;
  time: number;
  duration: number;
  /** Vídeos que o YouTube recusou nesta fila. */
  failed: string[];
}

const EMPTY: PlayerState = {
  ready: false, loadError: null, source: null, queue: [], current: null,
  playing: false, buffering: false, time: 0, duration: 0, failed: [],
};

export const playerStore = new Store<PlayerState>(EMPTY);

let player: YTPlayer | null = null;
let pending: (() => void)[] = [];
/** Fila na ordem original, para desligar o aleatório. */
let baseQueue: Track[] = [];
let tick: ReturnType<typeof setInterval> | null = null;
let skipTimer: ReturnType<typeof setTimeout> | null = null;
/** A fila veio de um link de playlist e quem manda na ordem é o player. */
let listMode = false;

const p = () => playerStore.get();

function run(fn: (pl: YTPlayer) => void) {
  if (player && p().ready) fn(player);
  else pending.push(() => player && fn(player));
}

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Ordem de tocar: com aleatório, a faixa escolhida primeiro e o resto embaralhado. */
function order(tracks: Track[], start: number, shuffle: boolean): { queue: Track[]; index: number } {
  if (!shuffle || tracks.length < 2) return { queue: tracks, index: Math.max(0, Math.min(start, tracks.length - 1)) };
  const first = tracks[start] ?? tracks[0];
  return { queue: [first, ...shuffled(tracks.filter((t) => t !== first))], index: 0 };
}

function applyRepeat(pl: YTPlayer, repeat: Repeat) {
  pl.setLoop(repeat !== 'off');
}

function startTick() {
  if (tick) return;
  tick = setInterval(() => {
    if (!player) return;
    const time = player.getCurrentTime() || 0;
    const duration = player.getDuration() || 0;
    const s = p();
    if (Math.abs(s.time - time) > 0.25 || s.duration !== duration) playerStore.patch({ time, duration });
  }, 500);
}

function stopTick() {
  if (tick) clearInterval(tick);
  tick = null;
}

/** Lê do player qual vídeo está tocando e completa a fila com o que se descobriu. */
function syncCurrent() {
  if (!player) return;
  const data = player.getVideoData();
  const id = data.video_id;
  if (!id) return;
  let { queue } = p();
  // Playlist aberta por link: a lista de vídeos só aparece depois de carregar.
  if (listMode) {
    const ids = player.getPlaylist() ?? [id];
    if (ids.join() !== queue.map((t) => t.id).join()) {
      const known = new Map(queue.map((t) => [t.id, t]));
      queue = ids.map((v) => known.get(v) ?? { id: v, title: '' });
      baseQueue = queue;
      // Com o aleatório ligado, a fila passa a ser nossa já embaralhada, a partir da faixa atual.
      if (prefsStore.get().shuffle && queue.length > 1) {
        listMode = false;
        const start = Math.max(0, queue.findIndex((t) => t.id === id));
        const o = order(queue, start, true);
        queue = o.queue;
        player.loadPlaylist(queue.map((t) => t.id), o.index, player.getCurrentTime() || 0);
      }
    }
  }
  const title = data.title ?? '';
  const channel = data.author ?? '';
  if (title) {
    queue = queue.map((t) => (t.id === id && !t.title ? { ...t, title, channel: t.channel || channel } : t));
    baseQueue = baseQueue.map((t) => (t.id === id && !t.title ? { ...t, title, channel: t.channel || channel } : t));
    fillTrackInfo(id, title, channel);
  }
  const current = queue.find((t) => t.id === id) ?? { id, title, channel };
  playerStore.patch({ queue, current, duration: player.getDuration() || p().duration });
}

function onState(state: number) {
  if (state === YTState.Playing) {
    playerStore.patch({ playing: true, buffering: false });
    startTick();
    syncCurrent();
  } else if (state === YTState.Buffering) {
    playerStore.patch({ buffering: true });
    syncCurrent();
  } else if (state === YTState.Paused) {
    playerStore.patch({ playing: false, buffering: false });
    stopTick();
  } else if (state === YTState.Ended) {
    // Repetir a faixa: volta para ela antes que o player passe para a próxima.
    if (prefsStore.get().repeat === 'one' && player) {
      const i = player.getPlaylistIndex();
      if (i >= 0) { player.playVideoAt(i); return; }
      player.seekTo(0, true);
      return;
    }
    playerStore.patch({ playing: false, buffering: false });
    stopTick();
  } else if (state === YTState.Cued) {
    playerStore.patch({ playing: false, buffering: false });
    syncCurrent();
  } else if (state === YTState.Unstarted) {
    syncCurrent();
  }
}

function onError(code: number) {
  const s = p();
  const id = player?.getVideoData().video_id ?? s.current?.id;
  const failed = id && !s.failed.includes(id) ? [...s.failed, id] : s.failed;
  playerStore.patch({ failed, playing: false, buffering: false });
  const name = s.queue.find((t) => t.id === id)?.title;
  const left = s.queue.filter((t) => !failed.includes(t.id)).length;
  toast(`${name ? `“${name}”: ` : ''}${playerErrorText(code)}${left > 0 && s.queue.length > 1 ? ' Pulando para a próxima.' : ''}`, 'error');
  if (left > 0 && s.queue.length > 1) {
    if (skipTimer) clearTimeout(skipTimer);
    skipTimer = setTimeout(() => player?.nextVideo(), 900);
  }
}

/** Cria o player dentro de `container` (que o React não deve tocar). Devolve a função de desmontar. */
export function attachPlayer(container: HTMLElement): () => void {
  let alive = true;
  const el = document.createElement('div');
  container.appendChild(el);
  loadYouTubeApi().then((YT) => {
    if (!alive) return;
    player = new YT.Player(el, {
      width: '100%',
      height: '100%',
      host: 'https://www.youtube.com',
      playerVars: {
        playsinline: 1,
        rel: 0,
        disablekb: 1,
        origin: window.location.origin,
        widget_referrer: window.location.href,
      },
      events: {
        onReady: () => {
          if (!alive || !player) return;
          const prefs = prefsStore.get();
          player.setVolume(prefs.volume);
          if (prefs.muted) player.mute();
          applyRepeat(player, prefs.repeat);
          playerStore.patch({ ready: true, loadError: null });
          const queued = pending;
          pending = [];
          queued.forEach((f) => f());
        },
        onStateChange: (e) => alive && onState(e.data),
        onError: (e) => alive && onError(e.data),
      },
    });
  }).catch((e: Error) => {
    if (alive) playerStore.patch({ loadError: e.message });
  });
  return () => {
    alive = false;
    stopTick();
    if (skipTimer) clearTimeout(skipTimer);
    try { player?.destroy(); } catch { /* já saiu */ }
    player = null;
    pending = [];
    baseQueue = [];
    listMode = false;
    container.replaceChildren();
    playerStore.set(EMPTY);
  };
}

// ── Comandos ──────────────────────────────────────────────

/** Toca uma lista de faixas a partir de `start`. */
export function playTracks(source: QueueSource, tracks: Track[], start = 0) {
  if (!tracks.length) return;
  const { queue, index } = order(tracks, start, prefsStore.get().shuffle);
  baseQueue = tracks;
  listMode = false;
  playerStore.patch({ source, queue, current: queue[index], failed: [], time: 0, duration: 0, buffering: true });
  run((pl) => pl.loadPlaylist(queue.map((t) => t.id), index));
}

/** Toca um link colado: um vídeo, uma playlist ou um vídeo dentro de uma playlist. */
export function playLink(link: { videoId?: string; playlistId?: string }) {
  if (link.playlistId) {
    baseQueue = [];
    listMode = true;
    playerStore.patch({ source: { kind: 'link', name: 'Playlist do YouTube' }, queue: [], current: null, failed: [], time: 0, duration: 0, buffering: true });
    run((pl) => pl.loadPlaylist({ list: link.playlistId!, listType: 'playlist' }));
  } else if (link.videoId) {
    playTracks({ kind: 'link', name: 'Link do YouTube' }, [{ id: link.videoId, title: '' }]);
  }
}

export function togglePlay() {
  const s = p();
  if (!s.current && !s.queue.length) return;
  run((pl) => (s.playing ? pl.pauseVideo() : pl.playVideo()));
}

export function next() {
  run((pl) => pl.nextVideo());
}

/** Volta ao começo da faixa; se ela acabou de começar, vai para a anterior. */
export function prev() {
  run((pl) => {
    if (pl.getCurrentTime() > 4) pl.seekTo(0, true);
    else pl.previousVideo();
  });
}

/** Toca a faixa de índice `i` da fila atual. */
export function playAt(i: number) {
  run((pl) => pl.playVideoAt(i));
}

export function seek(sec: number) {
  playerStore.patch({ time: sec });
  run((pl) => pl.seekTo(sec, true));
}

export function setVolume(volume: number) {
  const v = Math.max(0, Math.min(100, Math.round(volume)));
  prefsStore.patch({ volume: v, muted: v === 0 ? prefsStore.get().muted : false });
  run((pl) => { pl.setVolume(v); if (v > 0) pl.unMute(); });
}

export function toggleMute() {
  const muted = !prefsStore.get().muted;
  prefsStore.patch({ muted });
  run((pl) => (muted ? pl.mute() : pl.unMute()));
}

export function cycleRepeat() {
  const modes: Repeat[] = ['all', 'one', 'off'];
  const repeat = modes[(modes.indexOf(prefsStore.get().repeat) + 1) % modes.length];
  prefsStore.patch({ repeat });
  run((pl) => applyRepeat(pl, repeat));
}

/** Liga ou desliga o aleatório sem interromper a faixa que está tocando. */
export function toggleShuffle() {
  const shuffle = !prefsStore.get().shuffle;
  prefsStore.patch({ shuffle });
  const s = p();
  if (!player || !s.ready || !baseQueue.length || !s.current) {
    run((pl) => pl.setShuffle(shuffle));
    return;
  }
  const cur = s.current;
  const start = Math.max(0, baseQueue.findIndex((t) => t.id === cur.id));
  const { queue, index } = order(baseQueue, start, shuffle);
  const at = player.getCurrentTime() || 0;
  const ids = queue.map((t) => t.id);
  if (listMode) {
    // Daqui em diante a fila é nossa; o embaralhamento do próprio player sai de cena.
    player.setShuffle(false);
    listMode = false;
  }
  playerStore.patch({ queue });
  if (s.playing) player.loadPlaylist(ids, index, at);
  else player.cuePlaylist(ids, index, at);
}
