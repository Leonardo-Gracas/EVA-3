// Ações sobre a seleção, presas logo acima dela no quadro. Fica do mesmo tamanho em qualquer zoom.
import { Copy, Eye, EyeOff, Link2, Pencil, Trash2 } from 'lucide-react';
import type { Rect } from './clues';

export default function SelectionToolbar({ box, zoom, count, anyVisible, onEdit, onToggleHidden, onDuplicate, onLink, onDelete }: {
  /** Caixa da seleção, em coordenadas do quadro. */
  box: Rect;
  zoom: number;
  count: number;
  /** Algum selecionado está visível: o botão oculta todos; senão revela. */
  anyVisible: boolean;
  onEdit: () => void;
  onToggleHidden: () => void;
  onDuplicate: () => void;
  onLink: () => void;
  onDelete: () => void;
}) {
  // Sem espaço acima (topo do quadro): vai para baixo da seleção.
  const above = box.y > 60 / zoom;
  const style = {
    left: box.x,
    top: above ? box.y - 12 / zoom : box.y + box.h + 12 / zoom,
    transform: `scale(${1 / zoom})${above ? ' translateY(-100%)' : ''}`,
  };
  return (
    <div className="clue-seltools" style={style} role="toolbar" aria-label="Ações da seleção" onPointerDown={(e) => e.stopPropagation()}>
      {count > 1 && <span className="clue-seltools-count">{count} selecionados</span>}
      {count === 1 && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={onEdit} title="Editar texto (Enter)"><Pencil size={13} /> Editar</button>
      )}
      <button type="button" className="btn btn-sm btn-ghost" onClick={onToggleHidden} title={anyVisible ? 'Ocultar dos jogadores (H)' : 'Revelar aos jogadores (H)'}>
        {anyVisible ? <><EyeOff size={13} /> Ocultar</> : <><Eye size={13} /> Revelar</>}
      </button>
      {count > 1 && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={onLink} title="Ligar o primeiro selecionado aos demais (L)"><Link2 size={13} /> Ligar</button>
      )}
      <button type="button" className="btn btn-sm btn-ghost btn-icon" onClick={onDuplicate} title="Duplicar (Ctrl+D)" aria-label="Duplicar"><Copy size={13} /></button>
      <button type="button" className="btn btn-sm btn-ghost btn-icon clue-seltools-danger" onClick={onDelete} title="Excluir (Del)" aria-label="Excluir"><Trash2 size={13} /></button>
    </div>
  );
}
