// Salas: código curto ditado na mesa. Adaptado do EVA S (client/src/online/config.ts).
import { SERVER_URL } from './socket';

// Sem 0/O, 1/I/L: o código é ditado em voz alta. O servidor (server/src/index.ts) usa o mesmo alfabeto.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

export function newRoomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

export const isValidCode = (code: string) => new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`).test(code);

export function inviteLink(code: string): string {
  return `${window.location.origin}/sala/${code}`;
}

/** Código no caminho /sala/CODIGO, se houver. */
export function codeFromPath(): string | null {
  const m = window.location.pathname.match(/^\/sala\/([A-Za-z0-9]+)\/?$/);
  if (!m) return null;
  const c = normalizeCode(m[1]);
  return isValidCode(c) ? c : null;
}

/** Endereço WebSocket da sala no servidor de salas. */
export function roomUrl(code: string, params: Record<string, string>): string {
  return `${SERVER_URL}/sala/${encodeURIComponent(code.toUpperCase())}?${new URLSearchParams(params)}`;
}

export const serverConfigured = () => SERVER_URL !== '';
