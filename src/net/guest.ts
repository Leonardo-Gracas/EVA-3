// Jogador: conecta à sala pelo servidor de salas (Cloudflare), recebe a sua visão da mesa e
// envia ações ao mestre. Reconexão adaptada do EVA S (online/guestRuntime.ts).
import type { GameAction, PlayerView } from '../model/types';
import { roomUrl, serverConfigured } from './config';
import type { Identity } from './identity';
import { Store } from './emitter';
import { RelaySocket } from './socket';
import { PROTOCOL_VERSION, type GuestMsg, type HostMsg, type RelayToGuest } from './protocol';

export type GuestStatus = 'idle' | 'connecting' | 'online' | 'host-offline' | 'reconnecting' | 'denied' | 'removed' | 'error';

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

let relay: RelaySocket | null = null;
let identity: Identity | null = null;
let seq = 0;
let stopped = true;
const pending = new Map<number, { resolve: (a: Ack) => void; timer: ReturnType<typeof setTimeout> }>();

function failPending(error: string) {
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.resolve({ ok: false, error });
    pending.delete(id);
  }
}

function send(msg: GuestMsg): boolean {
  // JSON.stringify já descarta campos `undefined`.
  return relay?.send(JSON.stringify(msg)) ?? false;
}

export function sendAction(action: GameAction): Promise<Ack> {
  if (!relay?.open || guestStore.get().status !== 'online') {
    return Promise.resolve({ ok: false, error: 'Sem conexão com o mestre.' });
  }
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, error: 'O mestre demorou para responder.' });
    }, ACK_TIMEOUT);
    pending.set(id, { resolve, timer });
    if (!send({ t: 'action', id, action })) {
      clearTimeout(timer);
      pending.delete(id);
      resolve({ ok: false, error: 'Sem conexão com o mestre.' });
    }
  });
}

function hostAway() {
  failPending('A conexão com o mestre caiu.');
  guestStore.patch({
    status: 'host-offline',
    message: guestStore.get().everConnected
      ? 'O mestre saiu da sala. Aguardando ele voltar...'
      : 'O mestre ainda não está na sala. Aguardando ele abrir...',
  });
}

function onFrame(raw: string) {
  if (stopped) return;
  let msg: HostMsg | RelayToGuest;
  try { msg = JSON.parse(raw) as HostMsg | RelayToGuest; } catch { return; }
  if (!msg || typeof msg !== 'object') return;
  switch (msg.t) {
    case '$host':
      if (msg.on && identity) {
        guestStore.patch({ status: 'connecting', message: 'Conectando ao mestre...' });
        send({ t: 'hello', v: PROTOCOL_VERSION, clientId: identity.clientId, secret: identity.secret, name: identity.name });
      } else if (!msg.on) {
        hostAway();
      }
      break;
    case 'welcome':
      guestStore.patch({ status: 'online', message: 'Conectado', everConnected: true, playerId: msg.playerId });
      break;
    case 'denied':
      stopped = true;
      relay?.stop();
      guestStore.patch({ status: 'denied', message: msg.reason });
      break;
    case 'removed':
      stopped = true;
      relay?.stop();
      failPending('O mestre removeu você desta mesa.');
      guestStore.patch({ status: 'removed', message: 'O mestre removeu você desta mesa.', playerId: null, view: null });
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
}

function onDown() {
  failPending('A conexão com o mestre caiu.');
  guestStore.patch({ status: 'reconnecting', message: 'Conexão perdida. Reconectando...' });
}

function onEnd(reason: string): boolean {
  failPending('A conexão com o mestre caiu.');
  if (reason === 'nohost' || reason === 'expired') {
    guestStore.patch({
      status: 'host-offline',
      message: guestStore.get().everConnected
        ? 'O mestre saiu da sala. Aguardando ele voltar...'
        : 'Sala não encontrada. Confira o código ou peça para o mestre abrir a sala.',
    });
    return true;
  }
  if (reason === 'full') {
    guestStore.patch({ status: 'error', message: 'A sala está cheia.' });
    return false;
  }
  guestStore.patch({ status: 'reconnecting', message: 'Conexão perdida. Reconectando...' });
  return true;
}

export function startGuest(code: string, id: Identity): void {
  const cur = guestStore.get();
  if (!stopped && cur.code === code) return; // monta duas vezes em dev
  stopGuest();
  stopped = false;
  identity = id;
  guestStore.set({ code, status: 'connecting', message: 'Conectando à sala...', everConnected: false, playerId: null, view: null });
  if (!serverConfigured()) {
    guestStore.patch({ status: 'error', message: 'Servidor de salas não configurado (VITE_SERVER_URL).' });
    return;
  }
  relay = new RelaySocket(() => roomUrl(code, { modo: 'player' }), { onFrame, onDown, onEnd });
  relay.start();
}

export function stopGuest(): void {
  stopped = true;
  relay?.stop();
  relay = null;
  failPending('Você saiu da sala.');
  guestStore.set({ code: '', status: 'idle', message: '', everConnected: false, playerId: null, view: null });
}
