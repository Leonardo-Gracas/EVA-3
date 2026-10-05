import type { GameAction, PlayerView } from '../model/types';

export const PROTOCOL_VERSION = 1;

export type GuestMsg =
  | { t: 'hello'; v: number; clientId: string; secret: string; name: string }
  | { t: 'action'; id: number; action: GameAction }
  | { t: 'ping' };

export type HostMsg =
  | { t: 'welcome'; playerId: string }
  | { t: 'denied'; reason: string }
  | { t: 'view'; view: PlayerView }
  | { t: 'ack'; id: number; ok: boolean; error?: string; requested?: boolean; message?: string }
  | { t: 'pong' };
