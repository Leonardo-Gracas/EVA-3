import { useState } from 'react';
import type { PlayerView } from '../../model/types';
import ClueBoard from './ClueBoard';

/** Aba Investigação do jogador: os casos abertos pelo mestre, só para consulta. */
export default function CasesView({ view }: { view: PlayerView }) {
  const [selected, setSelected] = useState<string | null>(null);
  // Sem escolha (ou o caso sumiu): o mais recente.
  const current = view.cases.find((k) => k.id === selected) ?? view.cases[view.cases.length - 1];

  if (!current) {
    return <div className="empty">Nenhum caso aberto. Quando o mestre abrir uma investigação, o mural aparece aqui.</div>;
  }

  return (
    <div className="col gap-lg">
      {view.cases.length > 1 && (
        <div className="row-wrap">
          {view.cases.map((k) => (
            <button key={k.id} className={`btn btn-sm${k.id === current.id ? ' btn-primary' : ''}`} onClick={() => setSelected(k.id)}>{k.title}</button>
          ))}
        </div>
      )}
      <div className="card card-gold">
        <div className="sheet-title">Caso</div>
        <h2 className="sheet-name">{current.title}</h2>
        {current.description && <p className="secondary pre" style={{ marginTop: 6 }}>{current.description}</p>}
      </div>
      <ClueBoard kase={current} />
    </div>
  );
}
