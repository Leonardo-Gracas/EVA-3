// Altura que cabe na tela a partir de onde o elemento começa (sem rolar a página):
// grava em `--map-h` no próprio elemento.
import { useEffect, type RefObject } from 'react';

const BOTTOM_GAP = 12;
const MIN_H = 440;

export function useFitHeight(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const nav = parseFloat(getComputedStyle(document.body).getPropertyValue('--bottom-nav-h')) || 0;
      el.style.setProperty('--map-h', `${Math.max(MIN_H, Math.floor(window.innerHeight - top - nav - BOTTOM_GAP))}px`);
    };
    sync();
    window.addEventListener('resize', sync);
    // O topo muda quando algo acima cresce (barra de abas, avisos).
    const ro = new ResizeObserver(sync);
    ro.observe(document.body);
    return () => { window.removeEventListener('resize', sync); ro.disconnect(); };
  }, [ref]);
}
