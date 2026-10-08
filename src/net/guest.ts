// Jogador: conecta no navegador do mestre por P2P, recebe a sua visão da mesa e
// envia ações. Reconexão adaptada do EVA S (online/guestRuntime.ts).
import Peer, { type DataConnection } from 'peerjs';
import type { GameAction, PlayerView } from '../model/types';
import { peerIdFor, peerOptions } from './config';
import type { Identity } from './identity';
import { Store } from './emitter';
import { PROTOCOL_VERSION, type HostMsg } from './protocol';

export type GuestStatus = 'idle' | 'connecting' | 'online' | 'host-offline' | 'reconnecting' | 'denied' | 'error';

export interface GuestSnapshot {
  code: string;
  status: GuestStatus;
  message: string;
  everConnected: boolean;
  playerId: string | null;
  view: PlayerView | null;
}

export const guestStore = new Store<GuestSnapshot>({
  code: '', status: 'idle', message: '', everConnected: false, playerId: null, view: null,
});

export interface Ack { ok: boolean; error?: string; requested?: boolean; message?: string }

const ACK_TIMEOUT = 15000;

let peer: Peer | null = null;
let conn: DataConnection | null = null;
let identity: Identity | null = null;
let seq = 0;
let stopped = true;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let signalTimer: ReturnType<typeof setTimeout> | null = null;
let signalRetries = 0;
/** O Peer atual já pegou um id no servidor (só então `reconnect()` serve). */
let peerOpened = false;
const SIGNAL_RETRY_BASE = 1500;
const SIGNAL_RETRY_MAX = 15000;
const pending = new Map<number, { resolve: (a: Ack) => void; timer: ReturnType<typeof setTimeout> }>();

function failPending(error: string) {
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.resolve({ ok: false, error });
    pending.delete(id);
  }
}

export function sendAction(action: GameAction): Promise<Ack> {
  if (!conn?.open || guestStore.get().status !== 'online') {
    return Promise.resolve({ ok: false, error: 'Sem conexão com o mestre.' });
  }
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, error: 'O mestre demorou para responder.' });
    }, ACK_TIMEOUT);
    pending.set(id, { resolve, timer });
    // A serialização binária do PeerJS transforma campos `undefined` em `null`; o JSON os remove.
    conn!.send({ t: 'action', id, action: JSON.parse(JSON.stringify(action)) as GameAction });
  });
}

function scheduleReconnect(delay = 2500) {
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

/**
 * Reconecta só ao servidor de salas (sinalização). O canal com o mestre é P2P e continua vivo
 * sem ele: fechá-lo a cada oscilação do servidor fazia a conexão cair e voltar à toa.
 */
function retrySignal(p: Peer) {
  if (signalTimer) return;
  const delay = Math.min(SIGNAL_RETRY_MAX, SIGNAL_RETRY_BASE * 2 ** signalRetries);
  signalRetries += 1;
  signalTimer = setTimeout(() => {
    signalTimer = null;
    if (stopped || peer !== p) return;
    if (p.destroyed || !peerOpened) openPeer();
    else if (p.disconnected) p.reconnect();
  }, delay);
}

function connect() {
  if (stopped) return;
  if (!peer || peer.destroyed) { openPeer(); return; }
  // O `open` do Peer chama connect() de novo quando a sinalização voltar.
  if (peer.disconnected) { retrySignal(peer); return; }
  if (!peer.open) return;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  conn?.close();
  const code = guestStore.get().code;
  const c = peer.connect(peerIdFor(code), { reliable: true });
  conn = c;

  c.on('open', () => {
    if (conn !== c || !identity) return;
    c.send({ t: 'hello', v: PROTOCOL_VERSION, clientId: identity.clientId, secret: identity.secret, name: identity.name });
  });

  c.on('data', (raw: unknown) => {
    if (conn !== c) return;
    const msg = raw as HostMsg;
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'welcome':
        guestStore.patch({ status: 'online', message: 'Conectado', everConnected: true, playerId: msg.playerId });
        break;
      case 'denied':
        stopped = true;
        guestStore.patch({ status: 'denied', message: msg.reason });
        break;
      case 'view':
        guestStore.patch({ view: msg.view });
        break;
      case 'ack': {
        const p = pending.get(msg.id);
        if (!p) return;
        clearTimeout(p.timer);
        pending.delete(msg.id);
        p.resolve({ ok: msg.ok, error: msg.error, requested: msg.requested, message: msg.message });
        break;
      }
      default:
        break;
    }
  });

  const lost = () => {
    if (conn !== c) return;
    conn = null;
    failPending('A conexão com o mestre caiu.');
    if (!stopped) {
      guestStore.patch({ status: 'reconnecting', message: 'Conexão perdida. Reconectando...' });
      scheduleReconnect();
    }
  };
  c.on('close', lost);
  c.on('error', lost);
}

export function startGuest(code: string, id: Identity): void {
  const cur = guestStore.get();
  if (!stopped && cur.code === code) return; // StrictMode monta duas vezes
  stopGuest();
  stopped = false;
  identity = id;
  guestStore.set({ code, status: 'connecting', message: 'Conectando ao mestre...', everConnected: false, playerId: null, view: null });
  openPeer();

  // Mantém o canal vivo em redes móveis que derrubam conexões ociosas.
  pingTimer = setInterval(() => { if (conn?.open) conn.send({ t: 'ping' }); }, 20000);
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', resume);
}

/** Voltou a rede ou a aba: se o canal caiu enquanto isso, tenta já, sem esperar o timer. */
function resume() {
  if (stopped || document.visibilityState === 'hidden' || conn?.open) return;
  const s = guestStore.get().status;
  if (s === 'denied' || s === 'error') return;
  signalRetries = 0;
  if (signalTimer) { clearTimeout(signalTimer); signalTimer = null; }
  connect();
}

function openPeer() {
  if (signalTimer) { clearTimeout(signalTimer); signalTimer = null; }
  conn = null;
  peer?.destroy();
  peerOpened = false;
  const p = new Peer(peerOptions());
  peer = p;
  p.on('open', () => {
    if (peer !== p || stopped) return;
    peerOpened = true;
    signalRetries = 0;
    // Sinalização voltou com o canal ainda aberto: nada a refazer.
    if (!conn?.open) connect();
  });
  p.on('disconnected', () => {
    if (peer === p && !stopped) retrySignal(p);
  });
  p.on('error', (err: { type?: string }) => {
    if (peer !== p || stopped) return;
    const type = err?.type;
    if (type === 'browser-incompatible') {
      guestStore.patch({ status: 'error', message: 'Este navegador não suporta WebRTC.' });
      return;
    }
    // Erro do servidor de salas com o canal do mestre aberto: segue jogando e reconecta por trás.
    if (conn?.open && type !== 'peer-unavailable') {
      retrySignal(p);
      return;
    }
    if (type === 'peer-unavailable') {
      guestStore.patch({
        status: 'host-offline',
        message: guestStore.get().everConnected
          ? 'O mestre saiu da sala. Aguardando ele voltar...'
          : 'Sala não encontrada. Confira o código ou peça para o mestre abrir a sala.',
      });
      scheduleReconnect(3000);
      return;
    }
    guestStore.patch({ status: 'reconnecting', message: 'Problema de rede. Tentando de novo...' });
    scheduleReconnect(4000);
  });
}

export function stopGuest(): void {
  stopped = true;
  window.removeEventListener('online', resume);
  document.removeEventListener('visibilitychange', resume);
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (signalTimer) { clearTimeout(signalTimer); signalTimer = null; }
  signalRetries = 0;
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  failPending('Você saiu da sala.');
  conn?.close();
  peer?.destroy();
  conn = null;
  peer = null;
  guestStore.set({ code: '', status: 'idle', message: '', everConnected: false, playerId: null, view: null });
}
