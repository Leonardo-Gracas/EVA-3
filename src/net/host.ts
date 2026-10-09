// O mestre como servidor: guarda a mesa em memória, aplica as ações pelo motor,
// salva no IndexedDB e abre a sala no PeerJS. Cada jogador recebe só a sua visão.
// Estrutura de reconexão e limites adaptados do EVA S (online/host/hostRuntime.ts).
import Peer, { type DataConnection } from 'peerjs';
import type { Actor, GameAction, TableState } from '../model/types';
import { dispatch, defaultCtx, type DispatchResult } from '../store/engine';
import { buildPlayerView } from '../store/views';
import { saveTable, requestPersistentStorage } from '../store/persistence';
import { newRoomCode, peerIdFor, peerOptions } from './config';
import { sha256 } from './identity';
import { Store } from './emitter';
import { PROTOCOL_VERSION, type GuestMsg, type HostMsg } from './protocol';
import { LIMITS } from '../rules/validate';

export type HostStatus = 'idle' | 'opening' | 'online' | 'reconnecting' | 'error';

export interface HostSnapshot {
  table: TableState | null;
  status: HostStatus;
  message: string;
  online: string[];
  lastSavedAt: number | null;
  saveError: string | null;
}

export const hostStore = new Store<HostSnapshot>({
  table: null, status: 'idle', message: '', online: [], lastSavedAt: null, saveError: null,
});

const MAX_MESSAGE_CHARS = 200_000;
const RATE_PER_SEC = 10;
const RATE_BURST = 40;

interface ConnInfo {
  playerId: string | null;
  allow: () => boolean;
  /** Última visão enviada (JSON), para não reenviar a mesma coisa. */
  lastView?: string;
}

let peer: Peer | null = null;
let stopped = true;
let idTakenRetries = 0;
let signalTimer: ReturnType<typeof setTimeout> | null = null;
let signalRetries = 0;
const SIGNAL_RETRY_BASE = 1500;
const SIGNAL_RETRY_MAX = 15000;
const conns = new Map<DataConnection, ConnInfo>();

// ── Estado + persistência ────────────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let broadcastTimer: ReturnType<typeof setTimeout> | null = null;

function table(): TableState {
  const t = hostStore.get().table;
  if (!t) throw new Error('Nenhuma mesa aberta');
  return t;
}

function onlineIds(): Set<string> {
  const s = new Set<string>();
  for (const info of conns.values()) if (info.playerId) s.add(info.playerId);
  return s;
}

function commit(next: TableState) {
  next = kickRemoved(next);
  hostStore.patch({ table: next, online: [...onlineIds()] });
  scheduleSave();
  scheduleBroadcast();
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void flush(); }, 400);
}

export async function flush(): Promise<void> {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const t = hostStore.get().table;
  if (!t) return;
  try {
    await saveTable(t);
    hostStore.patch({ lastSavedAt: Date.now(), saveError: null });
  } catch (err) {
    hostStore.patch({ saveError: (err as Error)?.message ?? 'Falha ao salvar no navegador' });
  }
}

function send(conn: DataConnection, msg: HostMsg) {
  if (conn.open) {
    try { conn.send(msg); } catch { /* canal fechando */ }
  }
}

function broadcastNow() {
  if (broadcastTimer) { clearTimeout(broadcastTimer); broadcastTimer = null; }
  const t = hostStore.get().table;
  if (!t) return;
  const online = onlineIds();
  for (const [conn, info] of conns) {
    if (!info.playerId) continue;
    // Só envia se a visão deste jogador mudou: mexer no rascunho do mural, por exemplo, não gera tráfego.
    const view = buildPlayerView(t, info.playerId, online);
    const key = JSON.stringify(view);
    if (key === info.lastView) continue;
    info.lastView = key;
    send(conn, { t: 'view', view });
  }
}

function scheduleBroadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(broadcastNow, 30);
}

function sendRemoved(conn: DataConnection) {
  send(conn, { t: 'removed' });
  setTimeout(() => conn.close(), 300);
}

function withoutMark(t: TableState, ids: string[]): TableState {
  const marks = { ...t.removedPlayers };
  for (const id of ids) delete marks[id];
  return { ...t, removedPlayers: marks };
}

/** Desconecta quem o mestre excluiu. Avisado na hora, o jogador não precisa mais da marca de removido. */
function kickRemoved(t: TableState): TableState {
  const kicked: string[] = [];
  for (const [conn, info] of conns) {
    if (!info.playerId || t.players[info.playerId]) continue;
    kicked.push(info.playerId);
    info.playerId = null;
    info.lastView = undefined;
    sendRemoved(conn);
  }
  return kicked.some((id) => id in t.removedPlayers) ? withoutMark(t, kicked) : t;
}

// ── Ações do mestre ──────────────────────────────────────────────────────────

export function gmDispatch(action: GameAction): DispatchResult {
  const t = table();
  const actor: Actor = { role: 'gm', name: t.gmName };
  const res = dispatch(t, actor, action, defaultCtx);
  if (res.ok) commit(res.state);
  return res;
}

// ── Conexões dos jogadores ───────────────────────────────────────────────────

function rateLimiter() {
  let tokens = RATE_BURST;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(RATE_BURST, tokens + ((now - last) / 1000) * RATE_PER_SEC);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

function size(msg: unknown): number {
  try { return JSON.stringify(msg)?.length ?? 0; } catch { return Infinity; }
}

async function handleHello(conn: DataConnection, info: ConnInfo, msg: Extract<GuestMsg, { t: 'hello' }>) {
  if (msg.v !== PROTOCOL_VERSION) {
    send(conn, { t: 'denied', reason: 'Versão do app diferente da do mestre. Recarregue a página.' });
    return;
  }
  const clientId = typeof msg.clientId === 'string' && /^[0-9a-f]{8,64}$/.test(msg.clientId) ? msg.clientId : null;
  const secret = typeof msg.secret === 'string' && msg.secret.length >= 32 && msg.secret.length <= 128 ? msg.secret : null;
  const name = typeof msg.name === 'string' ? msg.name.trim().slice(0, LIMITS.userName) : '';
  if (!clientId || !secret || !name) {
    send(conn, { t: 'denied', reason: 'Identificação inválida.' });
    return;
  }
  const hash = await sha256(secret);
  const t = table();
  const existing = t.players[clientId];
  if (!existing && clientId in t.removedPlayers) {
    // Excluído enquanto estava fora: fica sabendo agora. Se entrar de novo, volta como jogador novo.
    commit(withoutMark(t, [clientId]));
    sendRemoved(conn);
    return;
  }
  if (existing && existing.secretHash !== hash) {
    send(conn, { t: 'denied', reason: 'Esse jogador já está registrado nesta mesa com outro navegador.' });
    setTimeout(() => conn.close(), 300);
    return;
  }
  const now = Date.now();
  const next: TableState = {
    ...t,
    players: {
      ...t.players,
      [clientId]: existing
        ? { ...existing, name, lastSeen: now }
        : { id: clientId, name, secretHash: hash, firstSeen: now, lastSeen: now },
    },
  };
  if (!existing) {
    next.log = [...t.log, { id: defaultCtx.newId(), at: now, kind: 'system', actorName: name, text: 'entrou na mesa pela primeira vez.' }];
  }
  info.playerId = clientId;
  // Novo hello: o cliente começa do zero e precisa da visão completa.
  info.lastView = undefined;
  commit(next);
  broadcastNow();
  send(conn, { t: 'welcome', playerId: clientId });
}

function attach(conn: DataConnection) {
  const info: ConnInfo = { playerId: null, allow: rateLimiter() };

  conn.on('open', () => {
    conns.set(conn, info);
  });

  conn.on('data', (raw: unknown) => {
    const msg = raw as GuestMsg;
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
    if (msg.t === 'ping') { send(conn, { t: 'pong' }); return; }
    if (!info.allow()) {
      if (msg.t === 'action') send(conn, { t: 'ack', id: Number(msg.id) || 0, ok: false, error: 'Muitas ações seguidas. Espere um pouco.' });
      return;
    }
    if (size(msg) > MAX_MESSAGE_CHARS) return;
    if (msg.t === 'hello') { void handleHello(conn, info, msg); return; }
    if (msg.t === 'action') {
      const id = Number(msg.id);
      if (!Number.isSafeInteger(id)) return;
      if (!info.playerId) { send(conn, { t: 'ack', id, ok: false, error: 'Conexão não identificada.' }); return; }
      const t = table();
      const player = t.players[info.playerId];
      const actor: Actor = { role: 'player', playerId: info.playerId, name: player?.name ?? 'Jogador' };
      const res = dispatch(t, actor, msg.action, defaultCtx);
      if (res.ok) {
        commit(res.state);
        // A visão nova chega antes do ack (canal ordenado): a tela já tem o resultado.
        broadcastNow();
        send(conn, { t: 'ack', id, ok: true, requested: res.requested, message: res.message });
      } else {
        send(conn, { t: 'ack', id, ok: false, error: res.error });
      }
    }
  });

  const drop = () => {
    if (!conns.delete(conn)) return;
    hostStore.patch({ online: [...onlineIds()] });
    scheduleBroadcast();
  };
  conn.on('close', drop);
  conn.on('error', drop);
}

// ── Sala ─────────────────────────────────────────────────────────────────────

/**
 * Reconecta só ao servidor de salas (sinalização). Os canais com os jogadores são P2P e
 * continuam vivos sem ele: recriar o Peer aqui derrubaria a mesa inteira a cada oscilação.
 */
function retrySignal(p: Peer) {
  if (signalTimer) return;
  const delay = Math.min(SIGNAL_RETRY_MAX, SIGNAL_RETRY_BASE * 2 ** signalRetries);
  signalRetries += 1;
  signalTimer = setTimeout(() => {
    signalTimer = null;
    if (stopped || peer !== p) return;
    if (p.destroyed) openPeer();
    else if (p.disconnected) p.reconnect();
  }, delay);
}

function signalLost() {
  const players = onlineIds().size;
  hostStore.patch({
    status: 'reconnecting',
    message: players ? 'Reconectando ao servidor de salas... (quem já está na mesa continua conectado)' : 'Reconectando ao servidor de salas...',
  });
}

function openPeer() {
  if (signalTimer) { clearTimeout(signalTimer); signalTimer = null; }
  peer?.destroy();
  const code = table().roomCode;
  const p = new Peer(peerIdFor(code), peerOptions());
  peer = p;
  /** Já registrou o código no servidor: dali em diante o PeerJS só desconecta, não destrói. */
  let opened = false;

  p.on('open', () => {
    if (peer !== p) return;
    opened = true;
    idTakenRetries = 0;
    signalRetries = 0;
    hostStore.patch({ status: 'online', message: 'Sala aberta' });
  });
  p.on('connection', attach);
  p.on('disconnected', () => {
    // Antes de abrir, quem cuida é o handler de erro (recria o Peer).
    if (peer !== p || stopped || !opened) return;
    signalLost();
    retrySignal(p);
  });
  p.on('error', (err: { type?: string }) => {
    if (peer !== p || stopped) return;
    const type = err?.type;
    if (type === 'peer-unavailable') return;
    if (type === 'browser-incompatible') {
      hostStore.patch({ status: 'error', message: 'Este navegador não suporta WebRTC.' });
      return;
    }
    // Sala já aberta e só a sinalização caiu: reconecta sem tocar nos jogadores.
    // Inclui `unavailable-id` ao reconectar, enquanto o servidor ainda segura o socket antigo.
    if (opened && !p.destroyed) {
      signalLost();
      retrySignal(p);
      return;
    }
    if (type === 'unavailable-id') {
      // Após um F5 o servidor ainda segura o código antigo por alguns segundos.
      if (idTakenRetries < 4) {
        idTakenRetries += 1;
        hostStore.patch({ status: 'reconnecting', message: 'Recuperando o código da sala...' });
        setTimeout(() => { if (!stopped) openPeer(); }, 2500);
      } else {
        idTakenRetries = 0;
        const t = table();
        commit({ ...t, roomCode: newRoomCode() });
        hostStore.patch({ status: 'opening', message: 'Código ocupado. Gerando outro...' });
        openPeer();
      }
      return;
    }
    hostStore.patch({ status: 'reconnecting', message: 'Sem conexão com o servidor de salas. Tentando de novo...' });
    setTimeout(() => { if (!stopped && peer === p) openPeer(); }, 4000);
  });
}

function beforeUnload(e: BeforeUnloadEvent) {
  void flush();
  if (onlineIds().size > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
}

export function startHost(t: TableState): void {
  if (!stopped && hostStore.get().table?.id === t.id) return; // StrictMode monta duas vezes
  stopHost();
  stopped = false;
  hostStore.set({ table: t, status: 'opening', message: 'Abrindo a sala...', online: [], lastSavedAt: null, saveError: null });
  void requestPersistentStorage();
  void flush();
  window.addEventListener('beforeunload', beforeUnload);
  openPeer();
}

export function stopHost(): void {
  if (stopped) return;
  stopped = true;
  void flush();
  window.removeEventListener('beforeunload', beforeUnload);
  if (signalTimer) { clearTimeout(signalTimer); signalTimer = null; }
  signalRetries = 0;
  for (const c of conns.keys()) c.close();
  conns.clear();
  peer?.destroy();
  peer = null;
  hostStore.set({ table: null, status: 'idle', message: '', online: [], lastSavedAt: null, saveError: null });
}
