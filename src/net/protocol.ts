import type { GameAction, PlayerView } from '../model/types';

export const PROTOCOL_VERSION = 4;

/** Mensagens maiores que isso (em JSON) o mestre descarta sem responder. */
export const MAX_MESSAGE_CHARS = 200_000;

export type GuestMsg =
  | { t: 'hello'; v: number; clientId: string; secret: string; name: string }
  | { t: 'action'; id: number; action: GameAction }
  | { t: 'ping' };

export type HostMsg =
  | { t: 'welcome'; playerId: string }
  | { t: 'denied'; reason: string }
  /** O mestre excluiu este jogador da mesa: a visão some e a sala sai da sessão. */
  | { t: 'removed' }
  | { t: 'view'; view: PlayerView }
  | { t: 'ack'; id: number; ok: boolean; error?: string; requested?: boolean; message?: string }
  | { t: 'pong' };
