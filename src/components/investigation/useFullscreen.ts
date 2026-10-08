// Tela cheia do mural. O mural cobre a janela (CSS) e, onde o navegador deixa, a página
// entra em tela cheia de verdade (some a barra do navegador). Pedimos a tela cheia do
// documento, não do mural: assim modais e avisos (Desfazer) continuam aparecendo por cima.
// No iPhone o Safari não tem a API para páginas: fica só a cobertura da janela.
import { useCallback, useEffect, useState } from 'react';

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };

const fsDoc = () => document as FsDocument;
const nativeActive = () => !!(document.fullscreenElement ?? fsDoc().webkitFullscreenElement);

function exitNative() {
  if (!nativeActive()) return;
  const d = fsDoc();
  if (d.exitFullscreen) d.exitFullscreen().catch(() => undefined);
  else d.webkitExitFullscreen?.();
}

async function enterNative() {
  const el = document.documentElement as FsElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else el.webkitRequestFullscreen?.();
  } catch { /* recusado ou sem suporte: segue só com a cobertura da janela */ }
}

export function useFullscreen() {
  const [full, setFull] = useState(false);

  const enter = useCallback(() => {
    setFull(true);
    void enterNative();
  }, []);

  /** A tela cheia nativa sai na limpeza do efeito abaixo. */
  const exit = useCallback(() => setFull(false), []);

  const toggle = useCallback(() => (full ? exit() : enter()), [full, enter, exit]);

  // Saiu da tela cheia pelo navegador (Esc, gesto de voltar): o mural sai junto.
  useEffect(() => {
    if (!full) return;
    let was = nativeActive();
    const onChange = () => {
      const now = nativeActive();
      if (was && !now) setFull(false);
      was = now;
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [full]);

  // Página por trás não rola; ao desmontar (troca de aba ou de caso) a tela cheia acaba.
  useEffect(() => {
    if (!full) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prev;
      exitNative();
    };
  }, [full]);

  return { full, toggle, exit };
}
