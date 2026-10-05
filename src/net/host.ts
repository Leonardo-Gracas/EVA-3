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
}

let peer: Peer | null = null;
let stopped = true;
let idTakenRetries = 0;
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
    if (info.playerId) send(conn, { t: 'view', view: buildPlayerView(t, info.playerId, online) });
  }
}

function scheduleBroadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(broadcastNow, 30);
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

function openPeer() {
  peer?.destroy();
  const code = table().roomCode;
  const p = new Peer(peerIdFor(code), peerOptions());
  peer = p;

  p.on('open', () => {
    if (peer !== p) return;
    idTakenRetries = 0;
    hostStore.patch({ status: 'online', message: 'Sala aberta' });
  });
  p.on('connection', attach);
  p.on('disconnected', () => {
    if (peer !== p || stopped) return;
    hostStore.patch({ status: 'reconnecting', message: 'Reconectando ao servidor de salas...' });
    setTimeout(() => { if (!p.destroyed && peer === p) p.reconnect(); }, 1500);
  });
  p.on('error', (err: { type?: string }) => {
    if (peer !== p || stopped) return;
    const type = err?.type;
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
    if (type === 'peer-unavailable') return;
    if (type === 'browser-incompatible') {
      hostStore.patch({ status: 'error', message: 'Este navegador não suporta WebRTC.' });
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
  for (const c of conns.keys()) c.close();
  conns.clear();
  peer?.destroy();
  peer = null;
  hostStore.set({ table: null, status: 'idle', message: '', online: [], lastSavedAt: null, saveError: null });
}
