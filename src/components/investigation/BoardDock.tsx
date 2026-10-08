// Paleta flutuante do mural: arrastar Evidência/Fato para o quadro, desfazer, zoom e atalhos.
import type { PointerEvent as RPointerEvent } from 'react';
import { CheckCircle2, Keyboard, Maximize2, Minimize2, Minus, Plus, Redo2, Scan, Send, Undo2 } from 'lucide-react';
import { CLUE_KINDS, type ClueKind } from '../../model/types';
import type { PublishControl } from './ClueBoard';
import { CLUE_ICONS } from './clues';
import type { UndoApi } from './useUndo';

const KEYS: Record<ClueKind, string> = { evidencia: 'E', fato: 'F' };
const NEW_LABEL: Record<ClueKind, string> = { evidencia: 'Nova evidência', fato: 'Novo fato' };

export default function BoardDock({ editable, zoom, undo, publish, onChipDown, onZoom, onZoomReset, onFit, onHelp, full, onFullscreen }: {
  editable: boolean;
  zoom: number;
  undo?: UndoApi;
  publish?: PublishControl;
  /** Começa a arrastar um cartão novo da paleta (um toque sem arrastar cria no centro). */
  onChipDown: (kind: ClueKind, e: RPointerEvent<HTMLButtonElement>) => void;
  onZoom: (f: number) => void;
  onZoomReset: () => void;
  onFit: () => void;
  onHelp: () => void;
  full: boolean;
  onFullscreen: () => void;
}) {
  return (
    <div className="clue-dock" role="toolbar" aria-label="Ferramentas do mural">
      {editable && (
        <>
          <div className="clue-dock-group">
            {(['evidencia', 'fato'] as ClueKind[]).map((k) => {
              const Icon = CLUE_ICONS[k];
              return (
                <button key={k} type="button" className={`clue-dock-chip clue-dock-${k}`}
                  title={`Arraste para o quadro, ou toque para criar no centro (${KEYS[k]})`}
                  aria-label={`${NEW_LABEL[k]} (${KEYS[k]})`}
                  onPointerDown={(e) => onChipDown(k, e)}>
                  <Icon size={13} /> {CLUE_KINDS[k]}
                </button>
              );
            })}
          </div>
          <span className="clue-dock-sep" />
          <div className="clue-dock-group">
            <button type="button" className="btn btn-sm btn-ghost btn-icon" disabled={!undo?.canUndo} onClick={() => void undo?.undo()}
              title={undo?.undoLabel ? `Desfazer: ${undo.undoLabel} (Ctrl+Z)` : 'Desfazer (Ctrl+Z)'} aria-label="Desfazer"><Undo2 size={14} /></button>
            <button type="button" className="btn btn-sm btn-ghost btn-icon" disabled={!undo?.canRedo} onClick={() => void undo?.redo()}
              title={undo?.redoLabel ? `Refazer: ${undo.redoLabel} (Ctrl+Shift+Z)` : 'Refazer (Ctrl+Shift+Z)'} aria-label="Refazer"><Redo2 size={14} /></button>
          </div>
          <span className="clue-dock-sep" />
        </>
      )}
      <div className="clue-dock-group">
        <button type="button" className="btn btn-sm btn-ghost btn-icon" onClick={() => onZoom(1 / 1.2)} title="Afastar (−)" aria-label="Afastar"><Minus size={14} /></button>
        <button type="button" className="clue-dock-zoom mono" onClick={onZoomReset} title="Voltar a 100% (0)">{Math.round(zoom * 100)}%</button>
        <button type="button" className="btn btn-sm btn-ghost btn-icon" onClick={() => onZoom(1.2)} title="Aproximar (+)" aria-label="Aproximar"><Plus size={14} /></button>
        <button type="button" className="btn btn-sm btn-ghost btn-icon" onClick={onFit} title="Enquadrar tudo (1)" aria-label="Enquadrar tudo"><Scan size={14} /></button>
        <button type="button" className="btn btn-sm btn-ghost btn-icon" onClick={onFullscreen}
          title={full ? 'Sair da tela cheia (Esc)' : 'Tela cheia'} aria-label={full ? 'Sair da tela cheia' : 'Tela cheia'} aria-pressed={full}>
          {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
      {editable && (
        <>
          <span className="clue-dock-sep hide-sm" />
          <button type="button" className="btn btn-sm btn-ghost btn-icon hide-sm" onClick={onHelp} title="Atalhos de teclado (?)" aria-label="Atalhos de teclado">
            <Keyboard size={14} />
          </button>
        </>
      )}
      {publish && (
        <>
          <span className="clue-dock-sep" />
          {publish.first || publish.pending ? (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => void publish.run()}
              title={publish.first ? 'Mostrar o caso aos jogadores (Ctrl+S)' : 'Enviar as alterações aos jogadores (Ctrl+S)'}>
              <Send size={13} /> Publicar{publish.pending ? <span className="clue-dock-count">{publish.pending}</span> : null}
            </button>
          ) : (
            <span className="clue-dock-status" title="Os jogadores veem a versão atual"><CheckCircle2 size={13} /> Publicado</span>
          )}
        </>
      )}
    </div>
  );
}
