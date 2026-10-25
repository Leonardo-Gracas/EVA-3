// Conexão WebSocket com o servidor de salas (pasta server/), com ping e reconexão automática.
// Usada pelo mestre (host.ts) e pelo jogador (guest.ts).

/** Mantém a conexão viva em redes que derrubam conexões ociosas e detecta conexões mortas. */
const PING_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000];

/** Servidor de salas publicado (server/, conta Cloudflare do Leo). */
const PROD_SERVER_URL = 'wss://eva3-salas.leo-gracas.workers.dev';

/** Endereço do servidor: VITE_SERVER_URL no build, se definido; senão o local em dev e o publicado no site. */
export const SERVER_URL = (import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? 'ws://localhost:8787' : PROD_SERVER_URL))
  .trim()
  .replace(/^http/, 'ws')
  .replace(/\/+$/, '');

export interface RelayHandlers {
  /** Quadro de texto vindo do servidor (o "pong" já é tratado aqui). */
  onFrame(data: string): void;
  /** A conexão caiu sem motivo conhecido; a reconexão já está agendada. */
  onDown(): void;
  /** O servidor recusou ou encerrou a conexão com um motivo. Devolve false para não tentar de novo. */
  onEnd(reason: string, code: number): boolean;
}

export class RelaySocket {
  private ws: WebSocket | null = null;
  private stopped = true;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private url: () => string, private h: RelayHandlers) {}

  get open(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.retries = 0;
    window.addEventListener('online', this.resume);
    document.addEventListener('visibilitychange', this.resume);
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    window.removeEventListener('online', this.resume);
    document.removeEventListener('visibilitychange', this.resume);
    this.clearTimers();
    this.discard(1000);
  }

  /** Reconecta já (por exemplo, depois de trocar o código da sala). */
  restart(): void {
    if (this.stopped) return;
    this.retries = 0;
    this.connect();
  }

  send(data: string): boolean {
    if (!this.open) return false;
    try {
      this.ws!.send(data);
      return true;
    } catch {
      return false;
    }
  }

  private connect() {
    this.clearTimers();
    this.discard();
    if (this.stopped) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url());
    } catch {
      this.down();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.pingTimer = setInterval(() => this.ping(), PING_MS);
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws || typeof e.data !== 'string') return;
      if (this.pongTimer) { clearTimeout(this.pongTimer); this.pongTimer = null; }
      if (e.data === 'pong') return;
      // Só zera a espera entre tentativas quando o servidor de fato aceitou: recusas fecham sem mandar nada.
      this.retries = 0;
      this.h.onFrame(e.data);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      if (this.stopped) return;
      if (e.code >= 4000 && e.code < 4100) {
        if (this.h.onEnd(e.reason, e.code)) this.schedule();
        else this.stop();
        return;
      }
      this.down();
    };
  }

  /** Fecha a conexão atual sem disparar os handlers dela. */
  private discard(code?: number) {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    try { ws.close(code); } catch { /* ignore */ }
  }

  private down() {
    this.h.onDown();
    this.schedule();
  }

  private schedule() {
    if (this.stopped || this.retryTimer) return;
    const delay = RETRY_DELAYS_MS[Math.min(this.retries, RETRY_DELAYS_MS.length - 1)];
    this.retries += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  private ping() {
    if (!this.open || this.pongTimer) return;
    this.send('ping');
    this.pongTimer = setTimeout(() => {
      // Sem resposta: a conexão morreu sem avisar (troca de rede, celular dormindo).
      this.pongTimer = null;
      this.clearTimers();
      this.discard();
      this.down();
    }, PONG_TIMEOUT_MS);
  }

  private clearTimers() {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.pongTimer) { clearTimeout(this.pongTimer); this.pongTimer = null; }
  }

  /** Voltou a rede ou a aba: confere a conexão na hora, sem esperar o timer. */
  private resume = () => {
    if (this.stopped || document.visibilityState === 'hidden') return;
    if (this.ws?.readyState === WebSocket.CONNECTING) return;
    if (this.open) { this.ping(); return; }
    this.retries = 0;
    this.connect();
  };
}
