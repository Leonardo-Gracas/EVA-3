// Teclado do mural. Mesmo cuidado dos atalhos do combate: nada acontece enquanto se digita
// num campo ou com um modal aberto, e o listener é ligado uma vez só.
import { useEffect, useRef } from 'react';
import { typingIn } from './clues';

/** Devolve true quando a tecla foi usada (o padrão do navegador é cancelado). */
export type ShortcutHandler = (e: KeyboardEvent) => boolean;

export function useBoardShortcuts(handler: ShortcutHandler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Um cartão já tratou a tecla (Enter/Espaço com foco nele).
      if (e.defaultPrevented || typingIn(e.target) || document.querySelector('.modal-overlay')) return;
      if (ref.current(e)) e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
