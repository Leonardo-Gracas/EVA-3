// Mostrar ou esconder os ícones das fontes de luz no mapa (a luz continua igual).
// Preferência deste navegador.
import { useState } from 'react';
import { Lightbulb, LightbulbOff } from 'lucide-react';

const KEY = 'eva.map.lightIcons';

function read(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function useLightIcons(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(read);
  const set = (v: boolean) => {
    setOn(v);
    try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* sem armazenamento: vale só nesta aba */ }
  };
  return [on, set];
}

export function LightIconsToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button className="btn btn-sm btn-ghost btn-icon" aria-pressed={!on} onClick={() => onChange(!on)}
      title={on ? 'Esconder os ícones das fontes de luz (fica só a luz)' : 'Mostrar os ícones das fontes de luz'}
      aria-label={on ? 'Esconder ícones de luz' : 'Mostrar ícones de luz'}>
      {on ? <Lightbulb size={14} /> : <LightbulbOff size={14} />}
    </button>
  );
}
