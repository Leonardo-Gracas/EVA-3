// Player de trilha sonora do mestre. Dois iframes do YouTube ("decks") se revezam: perto do fim
// de uma faixa, a próxima começa no deck livre com volume zero e sobe enquanto a atual desce
// (crossfade), inclusive quando a faixa repete nela mesma. A fila é controlada daqui.
// Só existe na tela do mestre; nada disto passa pela mesa nem chega aos jogadores.
import { Store } from '../net/emitter';
import { toast } from '../components/common/toast';
import { CROSSFADE_STEPS, fillTrackInfo, prefsStore } from './library';
import { fetchPlaylistTitle, fetchVideoInfo, loadYouTubeApi, playerErrorText, YTState, type Track, type YTPlayer } from './youtube';

export type QueueSource =
  | { kind: 'local'; id: string; name: string }
  | { kind: 'link'; name: string };

export interface PlayerState {
  /** Os dois players estão prontos para receber comandos. */
  ready: boolean;
  loadError: string | null;
  source: QueueSource | null;
  /** Fila na ordem em que toca (embaralhada quando o aleatório está ligado). */
  queue: Track[];
  /** Posição da faixa atual na fila (-1 = nada). */
  index: number;
  current: Track | null;
  playing: boolean;
  buffering: boolean;
  time: number;
  duration: number;
  /** Vídeos que o YouTube recusou nesta fila. */
  failed: string[];
}

const EMPTY: PlayerState = {
  ready: false, loadError: null, source: null, queue: [], index: -1, current: null,
  playing: false, buffering: false, time: 0, duration: 0, failed: [],
};

export const playerStore = new Store<PlayerState>(EMPTY);

interface Deck {
  layer: HTMLElement;
  pl: YTPlayer | null;
  ready: boolean;
  /** Fração do volume do mestre que este deck toca (0 a 1). */
  gain: number;
  /** Vídeo carregado ou preparado neste deck. */
  videoId: string | null;
  /** O vídeo está carregado e parado no começo, pronto para tocar na hora. */
  cued: boolean;
  /** Carregando o próximo vídeo mudo, para pausá-lo assim que começar (já com dados no buffer). */
  warming: boolean;
}

interface Fade {
  out: Deck;
  ms: number;
  /** Quando o deck que entra começou a tocar (o fade só anda a partir daí). */
  started: number | null;
}

/** Quanto antes da transição o próximo vídeo já fica carregado no deck livre. */
const PRELOAD_S = 12;
/** Transição máxima ao pular de faixa na mão. */
const MANUAL_FADE_S = 1.5;
/** Transição máxima ao trocar de playlist com música tocando. */
const SWITCH_FADE_S = 3;

let decks: Deck[] = [];
let active = 0;
let host: HTMLElement | null = null;
/** Muda a cada recriação dos players: eventos de players antigos são ignorados. */
let generation = 0;
let pending: (() => void)[] = [];
/** Fila na ordem original, para desligar o aleatório e para salvar. */
let baseQueue: Track[] = [];
let fade: Fade | null = null;
let tick: ReturnType<typeof setInterval> | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let skipTimer: ReturnType<typeof setTimeout> | null = null;
/** Pedido de link de playlist em andamento (um novo cancela o anterior). */
let linkRequest = 0;
/** Títulos já pedidos ao YouTube e ainda sem resposta. */
const asking = new Set<string>();

// Só em desenvolvimento: deixa os decks à vista para testes no navegador.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__musicDecks = () => decks.map((d) => d.pl);

const p = () => playerStore.get();
const A = () => decks[active];
const B = () => decks[1 - active];
const allReady = () => decks.length === 2 && decks.every((d) => d.ready && d.pl);

function run(fn: () => void) {
  if (allReady()) fn();
  else pending.push(fn);
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

// ── Volume ────────────────────────────────────────────────

function applyVolume(d: Deck) {
  if (!d.pl || !d.ready) return;
  const { volume, muted } = prefsStore.get();
  if (muted) { d.pl.mute(); return; }
  d.pl.unMute();
  d.pl.setVolume(Math.round(volume * d.gain));
}

// ── Títulos ───────────────────────────────────────────────

/** Completa título e canal de um vídeo na fila, na faixa atual e nas playlists do sistema. */
function applyInfo(id: string, title: string, channel: string) {
  if (!title) return;
  const fix = (t: Track) => (t.id === id && !t.title ? { ...t, title, channel: t.channel || channel } : t);
  baseQueue = baseQueue.map(fix);
  fillTrackInfo(id, title, channel);
  const s = p();
  if (s.queue.some((t) => t.id === id && !t.title) || (s.current?.id === id && !s.current.title)) {
    playerStore.patch({ queue: s.queue.map(fix), current: s.current && fix(s.current) });
  }
}

/** Busca no YouTube o título das faixas da fila que ainda não têm nome. */
function fillTitles() {
  for (const t of p().queue) {
    if (t.title || asking.has(t.id)) continue;
    asking.add(t.id);
    fetchVideoInfo(t.id).then((r) => {
      asking.delete(t.id);
      if (r.ok) applyInfo(t.id, r.title, r.channel);
      // Proibido fora do YouTube, privado ou apagado: já aparece marcado na fila.
      else if (r.blocked && !p().failed.includes(t.id)) playerStore.patch({ failed: [...p().failed, t.id] });
    });
  }
}

// ── Fila ──────────────────────────────────────────────────

/**
 * Próxima faixa a tocar. Sozinho (fim da faixa), respeita repetir faixa e o fim da fila sem repetição;
 * na mão, sempre avança. Pula vídeos que o YouTube recusou.
 */
function nextIndex(manual: boolean): number | null {
  const { queue, index, failed } = p();
  if (!queue.length) return null;
  const { loop, repeatList } = prefsStore.get();
  if (!manual && loop && !failed.includes(queue[index]?.id)) return index;
  for (let k = 1; k <= queue.length; k++) {
    const i = index + k;
    if (i >= queue.length && !repeatList && !manual) return null;
    const j = i % queue.length;
    if (!failed.includes(queue[j].id)) return j;
  }
  return null;
}

function setLayers(top: Deck, opacity: number) {
  for (const d of decks) {
    d.layer.style.zIndex = d === top ? '2' : '1';
    if (d !== top && !fade) d.layer.style.opacity = '0';
  }
  top.layer.style.opacity = String(opacity);
}

/**
 * Aquece o próximo vídeo no deck livre: começa a tocar mudo e pausa no segundo zero assim que
 * houver dados. Só "enfileirar" não basta: o YouTube ainda levaria segundos para carregar na hora H.
 */
function prepare(i: number) {
  const d = B();
  const t = p().queue[i];
  if (!t || !d.pl || fade || d.videoId === t.id) return;
  d.videoId = t.id;
  d.cued = false;
  d.warming = true;
  d.gain = 0;
  applyVolume(d);
  d.pl.loadVideoById(t.id, 0);
}

/**
 * Passa para a faixa `to` da fila no deck livre. A atual segue tocando e sai em `ms`
 * milissegundos enquanto a nova entra; com `ms` = 0, a troca é um corte assim que a nova começa.
 */
function crossTo(to: number, ms: number, start = 0) {
  const t = p().queue[to];
  if (!t) return;
  if (fade) finishFade();
  const out = A();
  const inn = B();
  inn.gain = 0;
  applyVolume(inn);
  // Aquecido (ou ainda aquecendo) com este vídeo: é só soltar.
  if (inn.videoId === t.id && (inn.cued || inn.warming) && start === 0) inn.pl!.playVideo();
  else inn.pl!.loadVideoById(t.id, start);
  inn.videoId = t.id;
  inn.cued = false;
  inn.warming = false;
  active = 1 - active;
  // Sem nada tocando, não há o que esvair: a nova entra direto.
  fade = { out, ms: p().playing ? ms : 0, started: null };
  setLayers(inn, 0);
  playerStore.patch({ index: to, current: t, buffering: true, time: start, duration: 0 });
}

function stepFade() {
  if (!fade || fade.started == null) return;
  const x = fade.ms ? Math.min(1, (performance.now() - fade.started) / fade.ms) : 1;
  // Potência constante: o volume somado não afunda no meio da transição.
  A().gain = Math.sin((x * Math.PI) / 2);
  fade.out.gain = Math.cos((x * Math.PI) / 2);
  applyVolume(A());
  applyVolume(fade.out);
  A().layer.style.opacity = String(x);
  if (x >= 1) finishFade();
}

/** Conclui a transição na hora: a nova faixa no volume cheio, a antiga parada. */
function finishFade() {
  if (fadeTimer) clearInterval(fadeTimer);
  fadeTimer = null;
  const f = fade;
  fade = null;
  if (!f) return;
  A().gain = 1;
  applyVolume(A());
  f.out.gain = 0;
  try { f.out.pl?.stopVideo(); } catch { /* já parou */ }
  f.out.videoId = null;
  f.out.cued = false;
  f.out.warming = false;
  setLayers(A(), 1);
}

/** A faixa que entrava falhou: a anterior volta a ser a atual, no volume cheio. */
function abortFade() {
  if (fadeTimer) clearInterval(fadeTimer);
  fadeTimer = null;
  const f = fade;
  fade = null;
  if (!f) return false;
  const failedDeck = A();
  try { failedDeck.pl?.stopVideo(); } catch { /* ok */ }
  failedDeck.videoId = null;
  failedDeck.cued = false;
  failedDeck.warming = false;
  active = decks.indexOf(f.out);
  A().gain = 1;
  applyVolume(A());
  setLayers(A(), 1);
  const back = p().queue.findIndex((t) => t.id === A().videoId);
  if (back >= 0) playerStore.patch({ index: back, current: p().queue[back], buffering: false });
  return true;
}

// ── Relógio ───────────────────────────────────────────────

function startTick() {
  if (tick) return;
  tick = setInterval(onTick, 250);
}

function stopTick() {
  if (tick) clearInterval(tick);
  tick = null;
}

function onTick() {
  const d = A();
  if (!d?.pl) return;
  const time = d.pl.getCurrentTime() || 0;
  const duration = d.pl.getDuration() || 0;
  const s = p();
  if (Math.abs(s.time - time) > 0.2 || s.duration !== duration) playerStore.patch({ time, duration });
  // Transmissões ao vivo não têm fim.
  if (!s.playing || fade || duration <= 0) return;
  const xf = prefsStore.get().crossfade;
  const remaining = duration - time;
  if (remaining > xf + PRELOAD_S) return;
  const n = nextIndex(false);
  if (n == null) return;
  prepare(n);
  if (xf > 0 && remaining <= xf) crossTo(n, Math.max(0, remaining - 0.25) * 1000);
}

// ── Eventos dos decks ─────────────────────────────────────

function onState(d: Deck, state: number) {
  if (d !== A()) {
    // Deck livre: o próximo vídeo começou a tocar mudo, então já tem dados; pausa no começo.
    if (state === YTState.Playing && d.warming && d.pl) {
      d.pl.pauseVideo();
      d.pl.seekTo(0, true);
      d.warming = false;
      d.cued = true;
    } else if (state === YTState.Cued) {
      d.cued = true;
    }
    return;
  }
  if (state === YTState.Playing) {
    playerStore.patch({ playing: true, buffering: false });
    startTick();
    if (fade && fade.started == null) {
      // Se a nova demorou a começar, a transição encolhe para caber no que resta da antiga.
      const outPl = fade.out.pl;
      const left = outPl && outPl.getPlayerState() === YTState.Playing ? (outPl.getDuration() || 0) - (outPl.getCurrentTime() || 0) : 0;
      if (left > 0) fade.ms = Math.min(fade.ms, left * 1000);
      else if (outPl && outPl.getPlayerState() !== YTState.Playing) fade.ms = 0;
      fade.started = performance.now();
      if (fade.ms > 0) fadeTimer = setInterval(stepFade, 50);
      stepFade();
    }
    const data = d.pl?.getVideoData();
    if (data?.video_id) applyInfo(data.video_id, data.title ?? '', data.author ?? '');
    playerStore.patch({ duration: d.pl?.getDuration() || p().duration });
  } else if (state === YTState.Buffering) {
    playerStore.patch({ buffering: true });
  } else if (state === YTState.Paused) {
    if (fade) return;
    playerStore.patch({ playing: false, buffering: false });
    stopTick();
  } else if (state === YTState.Ended) {
    // A transição não começou a tempo (ou está desligada): segue para a próxima agora.
    const n = nextIndex(false);
    if (n == null) {
      playerStore.patch({ playing: false, buffering: false, time: 0 });
      stopTick();
      return;
    }
    crossTo(n, 0);
  } else if (state === YTState.Cued) {
    d.cued = true;
    playerStore.patch({ buffering: false });
  }
}

function onError(d: Deck, code: number) {
  if (d !== A()) {
    // O próximo vídeo falhou ao carregar: fica marcado e o relógio escolhe outro.
    if (d.videoId) markFailed(d.videoId, code);
    d.videoId = null;
    d.warming = false;
    return;
  }
  const s = p();
  const id = d.videoId ?? s.current?.id;
  if (id) markFailed(id, code);
  if (abortFade()) return; // a anterior continua tocando; o relógio tenta a seguinte
  playerStore.patch({ playing: false, buffering: false });
  const n = nextIndex(true);
  if (n != null && n !== p().index) {
    if (skipTimer) clearTimeout(skipTimer);
    skipTimer = setTimeout(() => crossTo(n, 0), 900);
  }
}

function markFailed(id: string, code: number) {
  const s = p();
  if (s.failed.includes(id)) return;
  playerStore.patch({ failed: [...s.failed, id] });
  const name = s.queue.find((t) => t.id === id)?.title;
  toast(`${name ? `“${name}”: ` : ''}${playerErrorText(code)}`, 'error');
}

// ── Montagem ──────────────────────────────────────────────

/** Cria os dois players em `host`; `resume` roda quando os dois ficam prontos. */
function createDecks(resume?: () => void) {
  if (!host) return;
  const gen = ++generation;
  host.replaceChildren();
  const els: HTMLElement[] = [];
  decks = [0, 1].map(() => {
    const layer = document.createElement('div');
    layer.className = 'music-layer';
    const el = document.createElement('div');
    layer.appendChild(el);
    host!.appendChild(layer);
    els.push(el);
    return { layer, pl: null, ready: false, gain: 0, videoId: null, cued: false, warming: false };
  });
  active = 0;
  decks[0].gain = 1;
  setLayers(decks[0], 1);
  loadYouTubeApi().then((YT) => {
    if (gen !== generation) return;
    decks.forEach((d, k) => {
      d.pl = new YT.Player(els[k], {
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
            if (gen !== generation) return;
            d.ready = true;
            applyVolume(d);
            if (!allReady()) return;
            playerStore.patch({ ready: true, loadError: null });
            resume?.();
            const queued = pending;
            pending = [];
            queued.forEach((f) => f());
          },
          onStateChange: (e) => { if (gen === generation) onState(d, e.data); },
          onError: (e) => { if (gen === generation) onError(d, e.data); },
        },
      });
    });
  }).catch((e: Error) => {
    if (gen === generation) playerStore.patch({ loadError: e.message });
  });
}

function destroyDecks() {
  stopTick();
  if (fadeTimer) clearInterval(fadeTimer);
  if (skipTimer) clearTimeout(skipTimer);
  fadeTimer = null;
  fade = null;
  for (const d of decks) {
    try { d.pl?.destroy(); } catch { /* já saiu */ }
  }
  decks = [];
}

/** Cria o player dentro de `container` (que o React não deve tocar). Devolve a função de desmontar. */
export function attachPlayer(container: HTMLElement): () => void {
  host = container;
  createDecks();
  return () => {
    generation++;
    linkRequest++;
    destroyDecks();
    host = null;
    pending = [];
    baseQueue = [];
    container.replaceChildren();
    playerStore.set(EMPTY);
  };
}

/**
 * Recria os players e continua a faixa de onde estava. Serve para os iframes passarem a usar a
 * sessão do youtube.com depois que o mestre entra na conta (Premium = sem anúncios).
 */
export function reloadPlayer() {
  if (!host) return;
  const s = p();
  const at = A()?.pl?.getCurrentTime() || s.time;
  const wasPlaying = s.playing;
  const t = s.queue[s.index];
  destroyDecks();
  playerStore.patch({ ready: false, playing: false, buffering: wasPlaying });
  createDecks(t ? () => {
    const d = A();
    d.videoId = t.id;
    if (wasPlaying) d.pl!.loadVideoById(t.id, at);
    else d.pl!.cueVideoById(t.id, at);
  } : undefined);
}

/** A fila na ordem original (sem o aleatório), para salvar como playlist. */
export const originalQueue = (): Track[] => (baseQueue.length ? baseQueue : p().queue);

// ── Comandos ──────────────────────────────────────────────

const manualFade = () => Math.min(prefsStore.get().crossfade, MANUAL_FADE_S) * 1000;

/** Toca uma lista de faixas a partir de `start`. Com música tocando, uma entra enquanto a outra sai. */
export function playTracks(source: QueueSource, tracks: Track[], start = 0) {
  if (!tracks.length) return;
  linkRequest++;
  const { queue, index } = order(tracks, start, prefsStore.get().shuffle);
  baseQueue = tracks;
  playerStore.patch({ source, queue, failed: [] });
  fillTitles();
  run(() => crossTo(index, Math.min(prefsStore.get().crossfade, SWITCH_FADE_S) * 1000));
}

/** Toca um link colado: um vídeo, uma playlist ou um vídeo dentro de uma playlist. */
export function playLink(link: { videoId?: string; playlistId?: string }) {
  const listId = link.playlistId;
  if (!listId) {
    if (link.videoId) playTracks({ kind: 'link', name: 'Link do YouTube' }, [{ id: link.videoId, title: '' }]);
    return;
  }
  const req = ++linkRequest;
  playerStore.patch({ buffering: true });
  const title = fetchPlaylistTitle(listId);
  run(() => {
    // O deck livre abre a playlist só para descobrir os vídeos dela.
    if (fade) finishFade();
    const d = B();
    d.videoId = null;
    d.cued = false;
    d.warming = false;
    d.gain = 0;
    applyVolume(d);
    d.pl!.cuePlaylist({ list: listId, listType: 'playlist' });
    const since = Date.now();
    const poll = setInterval(() => {
      if (req !== linkRequest) { clearInterval(poll); return; }
      const ids = d.pl?.getPlaylist();
      if (ids?.length) {
        clearInterval(poll);
        const source: QueueSource = { kind: 'link', name: 'Playlist do YouTube' };
        const start = link.videoId ? Math.max(0, ids.indexOf(link.videoId)) : 0;
        playTracks(source, ids.map((id) => ({ id, title: '' })), start);
        title.then((name) => { if (name && p().source === source) playerStore.patch({ source: { kind: 'link', name } }); });
      } else if (Date.now() - since > 15000) {
        clearInterval(poll);
        playerStore.patch({ buffering: false });
        toast('Não consegui abrir essa playlist. Ela pode ser privada ou não existir.', 'error');
      }
    }, 300);
  });
}

export function togglePlay() {
  const s = p();
  if (!s.queue.length) return;
  run(() => {
    if (fade) finishFade();
    const d = A();
    if (!d.videoId) { crossTo(Math.max(0, s.index), 0); return; }
    if (s.playing) d.pl!.pauseVideo();
    else d.pl!.playVideo();
  });
}

export function next() {
  run(() => {
    const n = nextIndex(true);
    if (n != null) crossTo(n, manualFade());
  });
}

/** Volta ao começo da faixa; se ela acabou de começar, vai para a anterior. */
export function prev() {
  run(() => {
    const s = p();
    if (!s.queue.length) return;
    if (s.queue.length === 1 || (A().pl?.getCurrentTime() ?? 0) > 4) { seek(0); return; }
    const i = (s.index - 1 + s.queue.length) % s.queue.length;
    crossTo(i, manualFade());
  });
}

/** Toca a faixa de índice `i` da fila atual. */
export function playAt(i: number) {
  run(() => crossTo(i, manualFade()));
}

export function seek(sec: number) {
  playerStore.patch({ time: sec });
  run(() => {
    if (fade) finishFade();
    A().pl!.seekTo(sec, true);
  });
}

export function setVolume(volume: number) {
  const v = Math.max(0, Math.min(100, Math.round(volume)));
  prefsStore.patch({ volume: v, muted: v === 0 ? prefsStore.get().muted : false });
  decks.forEach(applyVolume);
}

export function toggleMute() {
  prefsStore.patch({ muted: !prefsStore.get().muted });
  decks.forEach(applyVolume);
}

/** Liga ou desliga "voltar ao começo da fila depois da última faixa". */
export function toggleRepeatList() {
  prefsStore.patch({ repeatList: !prefsStore.get().repeatList });
}

/** Liga ou desliga "recomeçar a faixa quando acabar". */
export function toggleLoop() {
  prefsStore.patch({ loop: !prefsStore.get().loop });
}

/** Troca a duração da transição entre faixas (desligada, 3, 5, 8 ou 12 segundos). */
export function cycleCrossfade() {
  const i = CROSSFADE_STEPS.indexOf(prefsStore.get().crossfade);
  prefsStore.patch({ crossfade: CROSSFADE_STEPS[(i + 1) % CROSSFADE_STEPS.length] });
}

/** Liga ou desliga o aleatório. A faixa atual segue tocando; muda só a ordem das próximas. */
export function toggleShuffle() {
  const shuffle = !prefsStore.get().shuffle;
  prefsStore.patch({ shuffle });
  const s = p();
  if (!s.current || !baseQueue.length) return;
  const cur = s.current;
  const start = Math.max(0, baseQueue.findIndex((t) => t.id === cur.id));
  const { queue, index } = order(baseQueue, start, shuffle);
  playerStore.patch({ queue, index });
}
