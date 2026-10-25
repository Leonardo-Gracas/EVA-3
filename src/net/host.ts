// O mestre como servidor: guarda a mesa em memória, aplica as ações pelo motor,
// salva no IndexedDB e abre a sala no servidor de salas (Cloudflare). Cada jogador recebe só a sua visão.
// O servidor só repassa mensagens: as dos jogadores chegam aqui como `ID\nJSON` e as nossas saem do mesmo jeito.
// Estrutura de reconexão e limites adaptados do EVA S (online/host/hostRuntime.ts).
import type { Actor, GameAction, TableState } from '../model/types';
import { dispatch, defaultCtx, type DispatchResult } from '../store/engine';
import { buildPlayerView } from '../store/views';
import { saveTable, requestPersistentStorage } from '../store/persistence';
import { newRoomCode, roomUrl, serverConfigured } from './config';
import { hostKeyFor, sha256 } from './identity';
import { Store } from './emitter';
import { RelaySocket } from './socket';
import { MAX_MESSAGE_CHARS, PROTOCOL_VERSION, type GuestMsg, type HostMsg, type RelayToHost } from './protocol';
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

const RATE_PER_SEC = 10;
const RATE_BURST = 40;

interface ConnInfo {
  playerId: string | null;
  allow: () => boolean;
  /** Última visão enviada (JSON), para não reenviar a mesma coisa. */
  lastView?: string;
}

let relay: RelaySocket | null = null;
let stopped = true;
/** Conexões dos jogadores, pelo id que o servidor de salas deu a cada uma. */
const conns = new Map<string, ConnInfo>();

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

function send(conn: string, msg: HostMsg) {
  relay?.send(`${conn}\n${JSON.stringify(msg)}`);
}

/** Pede ao servidor para fechar a conexão de um jogador (depois de avisá-lo). */
function closeConn(conn: string) {
  conns.delete(conn);
  setTimeout(() => { relay?.send(JSON.stringify({ t: '$close', to: conn })); }, 300);
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

function sendRemoved(conn: string) {
  send(conn, { t: 'removed' });
  closeConn(conn);
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

async function handleHello(conn: string, info: ConnInfo, msg: Extract<GuestMsg, { t: 'hello' }>) {
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
    closeConn(conn);
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

function onPlayerMessage(conn: string, raw: string) {
  let info = conns.get(conn);
  if (!info) { info = { playerId: null, allow: rateLimiter() }; conns.set(conn, info); }
  if (!info.allow()) {
    if (raw.includes('"action"')) {
      try {
        const m = JSON.parse(raw) as GuestMsg;
        if (m?.t === 'action') send(conn, { t: 'ack', id: Number(m.id) || 0, ok: false, error: 'Muitas ações seguidas. Espere um pouco.' });
      } catch { /* ignore */ }
    }
    return;
  }
  if (raw.length > MAX_MESSAGE_CHARS) return;
  let msg: GuestMsg;
  try { msg = JSON.parse(raw) as GuestMsg; } catch { return; }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
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
      // A visão nova chega antes do ack (o WebSocket é ordenado): a tela já tem o resultado.
      broadcastNow();
      send(conn, { t: 'ack', id, ok: true, requested: res.requested, message: res.message });
    } else {
      send(conn, { t: 'ack', id, ok: false, error: res.error });
    }
  }
}

function dropConn(conn: string) {
  if (!conns.delete(conn)) return;
  hostStore.patch({ online: [...onlineIds()] });
  scheduleBroadcast();
}

// ── Sala ─────────────────────────────────────────────────────────────────────

function onFrame(raw: string) {
  if (stopped) return;
  const nl = raw.indexOf('\n');
  if (nl > 0 && raw[0] !== '{') { onPlayerMessage(raw.slice(0, nl), raw.slice(nl + 1)); return; }
  let msg: RelayToHost;
  try { msg = JSON.parse(raw) as RelayToHost; } catch { return; }
  switch (msg?.t) {
    case '$ready':
      // Conexão (re)aberta: quem já estava na sala manda o hello de novo e é reidentificado.
      conns.clear();
      for (const id of msg.peers) conns.set(id, { playerId: null, allow: rateLimiter() });
      hostStore.patch({ status: 'online', message: 'Sala aberta', online: [] });
      break;
    case '$join':
      conns.set(msg.id, { playerId: null, allow: rateLimiter() });
      break;
    case '$leave':
      dropConn(msg.id);
      break;
    default:
      break;
  }
}

function onDown() {
  conns.clear();
  hostStore.patch({ status: 'reconnecting', message: 'Reconectando ao servidor de salas...', online: [] });
}

function onEnd(reason: string): boolean {
  conns.clear();
  hostStore.patch({ online: [] });
  if (reason === 'taken') {
    // O código está reservado para outro mestre (por exemplo, a mesa veio de um backup de outro navegador).
    const t = table();
    commit({ ...t, roomCode: newRoomCode() });
    hostStore.patch({ status: 'opening', message: 'Código ocupado. Gerando outro...' });
    return true;
  }
  if (reason === 'replaced') {
    hostStore.patch({ status: 'error', message: 'Esta mesa foi aberta em outra aba ou navegador. Recarregue a página para trazê-la de volta para cá.' });
    return false;
  }
  if (reason === 'invalid') {
    hostStore.patch({ status: 'error', message: 'O servidor de salas recusou a conexão. Recarregue a página.' });
    return false;
  }
  hostStore.patch({ status: 'reconnecting', message: 'Reconectando ao servidor de salas...' });
  return true;
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
  if (!serverConfigured()) {
    hostStore.patch({ status: 'error', message: 'Servidor de salas não configurado (VITE_SERVER_URL).' });
    return;
  }
  const key = hostKeyFor(t.id);
  relay = new RelaySocket(() => roomUrl(table().roomCode, { modo: 'host', chave: key }), { onFrame, onDown, onEnd });
  relay.start();
}

export function stopHost(): void {
  if (stopped) return;
  stopped = true;
  void flush();
  window.removeEventListener('beforeunload', beforeUnload);
  relay?.stop();
  relay = null;
  conns.clear();
  hostStore.set({ table: null, status: 'idle', message: '', online: [], lastSavedAt: null, saveError: null });
}
