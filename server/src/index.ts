import { DurableObject } from 'cloudflare:workers';

/**
 * Servidor de salas do EVA 3.
 *
 * O Worker recebe `wss://.../sala/CODIGO?modo=host&chave=...` (mestre) ou `?modo=player` (jogador) e entrega
 * a conexão ao Durable Object daquela sala. O objeto não guarda a mesa nem lê o jogo: só repassa mensagens.
 * Tudo o que um jogador manda vai só para o mestre, e o mestre manda cada mensagem para um jogador específico,
 * então um jogador nunca vê o segredo nem a visão dos outros.
 *
 * Quadros (texto):
 *   jogador → servidor   mensagem do jogo, repassada ao mestre como `ID\nmensagem`
 *   mestre  → servidor   `ID\nmensagem` (para o jogador ID) ou `{"t":"$close","to":ID}`
 *   servidor → mestre    `ID\nmensagem` ou controle: $ready (com os jogadores já conectados), $join, $leave
 *   servidor → jogador   mensagem do mestre ou controle: {"t":"$host","on":bool}
 *   "ping" → "pong"      respondido pela própria Cloudflare, sem acordar o objeto
 * Recusas e encerramentos chegam como fechamento com código 4000 e o motivo
 * (taken, nohost, full, invalid, replaced, expired) ou 4002 (o mestre fechou aquela conexão).
 *
 * O código fica preso ao mestre (hash da chave dele) até 30 dias sem ele aparecer: ninguém mais consegue
 * se passar pelo mestre daquela sala. Usa a API de hibernação: sem mensagens passando, o objeto sai da
 * memória e não gasta duração, mas as conexões continuam abertas.
 */

interface Env {
    ROOMS: DurableObjectNamespace<Room>;
    ALLOWED_ORIGINS?: string;
}

/** Dados de cada conexão, guardados no próprio WebSocket (sobrevivem à hibernação). */
interface Conn {
    id: string;
    host: boolean;
}

const HOST_ID = 'host';
/** Quanto tempo o código fica reservado para o mestre depois que ele sai. */
const CLAIM_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PLAYERS = 32;
const MAX_PLAYER_FRAME = 256 * 1024;
const MAX_HOST_FRAME = 16 * 1024 * 1024;
// Mesmo alfabeto do app (src/net/config.ts): sem 0/O, 1/I/L.
const CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/;
const KEY_RE = /^[0-9a-f]{32,128}$/;
const ID_RE = /^[0-9a-f]{16}$/;

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        const url = new URL(req.url);
        const match = url.pathname.match(/^\/sala\/([^/]+)$/);
        if (!match) {
            return new Response(url.pathname === '/' ? 'EVA 3: servidor de salas no ar.' : 'Não encontrado', {
                status: url.pathname === '/' ? 200 : 404,
            });
        }
        const code = match[1];
        if (!CODE_RE.test(code)) return new Response('Código de sala inválido', { status: 400 });
        if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Esperado WebSocket', { status: 426 });

        // Só o site do EVA 3 pode abrir salas (evita que outros consumam a cota grátis).
        const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
        if (allowed.length && !allowed.includes(req.headers.get('Origin') ?? '')) {
            return new Response('Origem não permitida', { status: 403 });
        }

        return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
    },
} satisfies ExportedHandler<Env>;

async function sha256(text: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
}

function newId(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => x.toString(16).padStart(2, '0')).join('');
}

export class Room extends DurableObject<Env> {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }

    async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url);
        const mode = url.searchParams.get('modo');

        const { 0: client, 1: socket } = new WebSocketPair();
        this.ctx.acceptWebSocket(socket);
        const done = () => new Response(null, { status: 101, webSocket: client });
        const reject = (reason: string) => {
            socket.close(4000, reason);
            return done();
        };

        if (mode === 'host') {
            const key = url.searchParams.get('chave') ?? '';
            if (!KEY_RE.test(key)) return reject('invalid');
            const hash = await sha256(key);
            const saved = await this.ctx.storage.get<string>('key');
            if (saved && saved !== hash) return reject('taken');
            if (!saved) await this.ctx.storage.put('key', hash);
            await this.ctx.storage.deleteAlarm();

            // A mesma mesa aberta em outra aba: a conexão nova fica com a sala.
            for (const ws of this.sockets()) {
                if (ws !== socket && this.conn(ws)?.host) {
                    ws.serializeAttachment(null);
                    this.safeClose(ws, 4000, 'replaced');
                }
            }
            socket.serializeAttachment({ id: HOST_ID, host: true } satisfies Conn);
            socket.send(JSON.stringify({ t: '$ready', peers: this.players().map((ws) => this.conn(ws)!.id) }));
            this.toPlayers(JSON.stringify({ t: '$host', on: true }));
            return done();
        }

        if (mode === 'player') {
            if (!(await this.ctx.storage.get<string>('key'))) return reject('nohost');
            if (this.players().length >= MAX_PLAYERS) return reject('full');
            const id = newId();
            socket.serializeAttachment({ id, host: false } satisfies Conn);
            const host = this.hostSocket();
            socket.send(JSON.stringify({ t: '$host', on: !!host }));
            if (host) this.safeSend(host, JSON.stringify({ t: '$join', id }));
            return done();
        }

        return reject('invalid');
    }

    async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
        const from = this.conn(ws);
        if (!from || typeof raw !== 'string') return;

        if (!from.host) {
            if (raw.length > MAX_PLAYER_FRAME) return;
            const host = this.hostSocket();
            // O id vem do servidor, antes da primeira quebra de linha: o jogador não consegue se passar por outro.
            if (host) this.safeSend(host, `${from.id}\n${raw}`);
            return;
        }

        if (raw.length > MAX_HOST_FRAME) return;
        const nl = raw.indexOf('\n');
        if (nl > 0) {
            const to = raw.slice(0, nl);
            if (!ID_RE.test(to)) return;
            const target = this.playerSocket(to);
            if (target) this.safeSend(target, raw.slice(nl + 1));
            return;
        }
        let msg: { t?: unknown; to?: unknown };
        try {
            msg = JSON.parse(raw);
        } catch {
            return;
        }
        if (msg?.t === '$close' && typeof msg.to === 'string') {
            const target = this.playerSocket(msg.to);
            if (target) {
                target.serializeAttachment(null);
                this.safeClose(target, 4002, 'closed');
            }
        }
    }

    async webSocketClose(ws: WebSocket) {
        await this.handleGone(ws);
    }

    async webSocketError(ws: WebSocket) {
        await this.handleGone(ws);
    }

    /** O mestre não voltou em 30 dias: o código fica livre de novo. */
    async alarm() {
        if (this.hostSocket()) return;
        for (const ws of this.sockets()) {
            ws.serializeAttachment(null);
            this.safeClose(ws, 4000, 'expired');
        }
        await this.ctx.storage.deleteAll();
    }

    private async handleGone(ws: WebSocket) {
        const gone = this.conn(ws);
        ws.serializeAttachment(null);
        this.safeClose(ws, 1000, 'bye');
        if (!gone) return;
        if (gone.host) {
            this.toPlayers(JSON.stringify({ t: '$host', on: false }));
            await this.ctx.storage.setAlarm(Date.now() + CLAIM_TTL_MS);
        } else {
            const host = this.hostSocket();
            if (host) this.safeSend(host, JSON.stringify({ t: '$leave', id: gone.id }));
        }
    }

    private sockets(): WebSocket[] {
        return this.ctx.getWebSockets();
    }

    private conn(ws: WebSocket): Conn | null {
        return (ws.deserializeAttachment() as Conn | null) ?? null;
    }

    private hostSocket(): WebSocket | undefined {
        return this.sockets().find((ws) => this.conn(ws)?.host);
    }

    private players(): WebSocket[] {
        return this.sockets().filter((ws) => {
            const c = this.conn(ws);
            return c && !c.host;
        });
    }

    private playerSocket(id: string): WebSocket | undefined {
        return this.players().find((ws) => this.conn(ws)?.id === id);
    }

    private toPlayers(data: string) {
        for (const ws of this.players()) this.safeSend(ws, data);
    }

    private safeSend(ws: WebSocket, data: string) {
        try {
            ws.send(data);
        } catch {
            /* conexão caindo; o close cuida dela */
        }
    }

    private safeClose(ws: WebSocket, code: number, reason: string) {
        try {
            ws.close(code, reason);
        } catch {
            /* já fechada */
        }
    }
}
