// Identidade local: nome de usuário + id e segredo deste navegador.
// O segredo nunca sai em texto puro para a tabela do mestre: lá fica só o hash.

const KEY = 'eva3_identity';

export interface Identity {
  name: string;
  clientId: string;
  secret: string;
}

function rand(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Identity;
    if (typeof v.name === 'string' && v.name && typeof v.clientId === 'string' && typeof v.secret === 'string') return v;
  } catch { /* storage indisponível */ }
  return null;
}

export function saveIdentityName(name: string): Identity {
  const prev = loadIdentity();
  const id: Identity = { name, clientId: prev?.clientId ?? rand(12), secret: prev?.secret ?? rand(32) };
  try { localStorage.setItem(KEY, JSON.stringify(id)); } catch { /* segue só na memória */ }
  return id;
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
}

// Última sala (para "voltar" após F5). sessionStorage: cada aba é uma sala.
export type RoomSession = { role: 'host'; tableId: string } | { role: 'player'; code: string };

const ROOM_KEY = 'eva3_room';
const LAST_JOIN = 'eva3_last_join';

export function getRoom(): RoomSession | null {
  try {
    const raw = sessionStorage.getItem(ROOM_KEY);
    return raw ? (JSON.parse(raw) as RoomSession) : null;
  } catch { return null; }
}

export function setRoom(r: RoomSession | null): void {
  try {
    if (r) sessionStorage.setItem(ROOM_KEY, JSON.stringify(r));
    else sessionStorage.removeItem(ROOM_KEY);
    if (r?.role === 'player') localStorage.setItem(LAST_JOIN, r.code);
  } catch { /* ignore */ }
}

export function lastJoinCode(): string {
  try { return localStorage.getItem(LAST_JOIN) ?? ''; } catch { return ''; }
}
