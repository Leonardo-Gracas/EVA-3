/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Servidor de salas (Cloudflare Worker), ex.: wss://eva3-salas.SEU-USUARIO.workers.dev */
  readonly VITE_SERVER_URL?: string;
  /** ID de cliente OAuth (Google Cloud) para o mestre ligar a conta do YouTube na trilha sonora. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
