import type { GameAction, PlayerView } from '../model/types';

export const PROTOCOL_VERSION = 5;

/** Mensagens maiores que isso (em JSON) o mestre descarta sem responder. */
export const MAX_MESSAGE_CHARS = 200_000;

export type GuestMsg =
  | { t: 'hello'; v: number; clientId: string; secret: string; name: string }
  | { t: 'action'; id: number; action: GameAction };

export type HostMsg =
  | { t: 'welcome'; playerId: string }
  | { t: 'denied'; reason: string }
  /** O mestre excluiu este jogador da mesa: a visão some e a sala sai da sessão. */
  | { t: 'removed' }
  | { t: 'view'; view: PlayerView }
  | { t: 'ack'; id: number; ok: boolean; error?: string; requested?: boolean; message?: string };

// Controle do servidor de salas (server/src/index.ts). Os tipos começam com "$" para não se misturar ao jogo.

/** Servidor → mestre. Mensagens dos jogadores chegam como `ID\nJSON`. */
export type RelayToHost =
  | { t: '$ready'; peers: string[] }
  | { t: '$join'; id: string }
  | { t: '$leave'; id: string };

/** Servidor → jogador: o mestre está (ou não) conectado à sala. */
export type RelayToGuest = { t: '$host'; on: boolean };
