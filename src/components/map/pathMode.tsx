// Como o movimento é traçado: pelo caminho mais curto até o destino, ou quadrado a quadrado,
// pelo trajeto exato que a pessoa escolher. Preferência deste navegador.
import { useState } from 'react';
import { Footprints, Route } from 'lucide-react';

export type PathMode = 'auto' | 'exact';

const KEY = 'eva.map.pathMode';

function read(): PathMode {
  try { return localStorage.getItem(KEY) === 'exact' ? 'exact' : 'auto'; } catch { return 'auto'; }
}

export function usePathMode(): [PathMode, (m: PathMode) => void] {
  const [mode, setMode] = useState<PathMode>(read);
  const set = (m: PathMode) => {
    setMode(m);
    try { localStorage.setItem(KEY, m); } catch { /* sem armazenamento: vale só nesta aba */ }
  };
  return [mode, set];
}

export const PATH_HINT: Record<PathMode, string> = {
  auto: 'Mais curto: escolha o destino e o personagem vai pelo menor caminho.',
  exact: 'Quadrado a quadrado: clique em cada quadrado (ou arraste a partir do personagem) para traçar o trajeto exato.',
};

export function PathModeToggle({ mode, onChange }: { mode: PathMode; onChange: (m: PathMode) => void }) {
  return (
    <div className="seg map-path-mode" role="radiogroup" aria-label="Como traçar o movimento">
      <button role="radio" aria-checked={mode === 'auto'} className={mode === 'auto' ? 'on-inherit' : ''} onClick={() => onChange('auto')} title={PATH_HINT.auto}>
        <Route size={13} /> <span className="pm-long">Mais curto</span><span className="pm-short">Curto</span>
      </button>
      <button role="radio" aria-checked={mode === 'exact'} className={mode === 'exact' ? 'on-inherit' : ''} onClick={() => onChange('exact')} title={PATH_HINT.exact}>
        <Footprints size={13} /> <span className="pm-long">Quadrado a quadrado</span><span className="pm-short">Exato</span>
      </button>
    </div>
  );
}
