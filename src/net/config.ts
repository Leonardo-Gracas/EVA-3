// Salas: código curto ditado na mesa + id do PeerJS derivado dele.
// Adaptado do EVA S (client/src/online/config.ts).

const PEER_PREFIX = 'eva3-sala-';
export const peerIdFor = (code: string) => `${PEER_PREFIX}${code.toUpperCase()}`;

// Sem 0/O, 1/I/L: o código é ditado em voz alta.
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

function iceServers(): RTCIceServer[] | undefined {
  const raw = import.meta.env.VITE_ICE_SERVERS;
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

/**
 * Opções do PeerJS. Por padrão usa o servidor público gratuito (0.peerjs.com),
 * que só apresenta mestre e jogadores — os dados vão direto de navegador para
 * navegador. Dá para apontar para um servidor próprio via variáveis VITE_PEER_*.
 */
export function peerOptions(): Record<string, unknown> {
  const env = import.meta.env;
  const opts: Record<string, unknown> = { debug: 1 };
  if (env.VITE_PEER_HOST) {
    opts.host = env.VITE_PEER_HOST;
    if (env.VITE_PEER_PORT) opts.port = Number(env.VITE_PEER_PORT);
    if (env.VITE_PEER_PATH) opts.path = env.VITE_PEER_PATH;
    opts.secure = env.VITE_PEER_SECURE ? env.VITE_PEER_SECURE === '1' : window.location.protocol === 'https:';
  }
  const ice = iceServers();
  if (ice) opts.config = { iceServers: ice };
  return opts;
}
