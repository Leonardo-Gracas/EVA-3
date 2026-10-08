// Um cartão do mural. Lê como papel preso na cortiça; em edição, o próprio cartão vira o formulário.
import {
  useLayoutEffect, useRef, type HTMLAttributes, type KeyboardEvent, type PointerEvent as RPointerEvent, type RefObject, type TextareaHTMLAttributes,
} from 'react';
import { ArrowLeftRight, Eye, EyeOff } from 'lucide-react';
import { CLUE_KINDS, CLUE_SIZE, type ClueKind } from '../../model/types';
import { LIMITS } from '../../rules/validate';
import { CLUE_ICONS, OPPOSITE } from './clues';

export interface CardDraft {
  kind: ClueKind;
  title: string;
  text: string;
  hidden: boolean;
}

export interface CardFlags {
  selected?: boolean;
  /** Fora da seleção e sem ligação com ela: esmaece. */
  dim?: boolean;
  /** Ligado ao cartão selecionado. */
  near?: boolean;
  /** Alvo de um fio sendo puxado. */
  target?: boolean;
  dragging?: boolean;
}

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onPointerDown'> {
  id: string;
  card: CardDraft;
  x: number;
  y: number;
  /** Mestre: alfinete puxável e cursor de arrastar. */
  editable: boolean;
  flags: CardFlags;
  edit?: { set: (p: Partial<CardDraft>) => void; commit: () => void; cancel: () => void };
  onCardDown?: (e: RPointerEvent<HTMLDivElement>) => void;
  onPinDown?: (e: RPointerEvent<HTMLSpanElement>) => void;
}

/** Não deixa o botão roubar o foco do campo (o clique fora confirma a edição). */
const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

export default function ClueCardView({ id, card, x, y, editable, flags, edit, onCardDown, onPinDown, className, ...rest }: Props) {
  const Icon = CLUE_ICONS[card.kind];
  const cls = [
    'clue', `clue-${card.kind}`, className,
    card.hidden && 'clue-hidden',
    editable && !edit && 'clue-drag',
    flags.dragging && 'clue-dragging',
    flags.selected && 'clue-sel',
    flags.dim && 'clue-dim',
    flags.near && 'clue-near',
    flags.target && 'clue-target',
    edit && 'clue-editing',
  ].filter(Boolean).join(' ');

  return (
    <div {...rest} data-clue-id={id} className={cls} style={{ left: x, top: y, width: CLUE_SIZE.w }}
      role="button" tabIndex={edit ? -1 : 0} aria-label={`${CLUE_KINDS[card.kind]}: ${card.title || 'sem título'}`} aria-pressed={!!flags.selected}
      onPointerDown={edit ? undefined : onCardDown}
      onBlur={edit ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) edit.commit(); } : undefined}>
      <span className={`clue-pin${editable && !edit ? ' clue-pin-handle' : ''}`}
        title={editable && !edit ? 'Arraste até outro cartão para ligar' : undefined}
        onPointerDown={editable && !edit ? onPinDown : undefined} />
      {edit ? (
        <>
          <div className="clue-kind">
            <button type="button" className="clue-chip-btn" onMouseDown={keepFocus} onClick={() => edit.set({ kind: OPPOSITE[card.kind] })}
              title={`Trocar para ${CLUE_KINDS[OPPOSITE[card.kind]].toLowerCase()}`}>
              <Icon size={11} /> {CLUE_KINDS[card.kind]} <ArrowLeftRight size={10} />
            </button>
            <button type="button" className="clue-chip-btn" style={{ marginLeft: 'auto' }} onMouseDown={keepFocus}
              onClick={() => edit.set({ hidden: !card.hidden })} title={card.hidden ? 'Oculto dos jogadores' : 'Visível aos jogadores'}
              aria-label={card.hidden ? 'Oculto dos jogadores' : 'Visível aos jogadores'}>
              {card.hidden ? <EyeOff size={11} /> : <Eye size={11} />}
            </button>
          </div>
          <EditFields card={card} edit={edit} />
        </>
      ) : (
        <>
          <div className="clue-kind"><Icon size={11} /> {CLUE_KINDS[card.kind]}{card.hidden && <EyeOff size={11} style={{ marginLeft: 'auto' }} aria-label="Oculto" />}</div>
          <div className="clue-title">{card.title}</div>
          {card.text && <div className="clue-text">{card.text}</div>}
        </>
      )}
    </div>
  );
}

function EditFields({ card, edit }: { card: CardDraft; edit: NonNullable<Props['edit']> }) {
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Entra com o cursor no fim do título.
  useLayoutEffect(() => {
    const t = titleRef.current;
    if (!t) return;
    t.focus({ preventScroll: true });
    t.setSelectionRange(t.value.length, t.value.length);
  }, []);

  const common = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); edit.cancel(); return true; }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'Enter' || e.key.toLowerCase() === 's')) { e.preventDefault(); edit.commit(); return true; }
    return false;
  };

  return (
    <>
      <AutoTextarea inputRef={titleRef} className="clue-title-input" value={card.title} maxLength={LIMITS.clueTitle}
        placeholder={card.kind === 'fato' ? 'O que foi provado?' : 'O que foi encontrado?'} aria-label="Título"
        onChange={(v) => edit.set({ title: v.replace(/\n/g, ' ') })}
        onKeyDown={(e) => {
          if (common(e)) return;
          // Enter no título vai para a descrição.
          if (e.key === 'Enter') { e.preventDefault(); textRef.current?.focus(); }
        }} />
      <AutoTextarea inputRef={textRef} className="clue-text-input" value={card.text} maxLength={LIMITS.clueText}
        placeholder="Detalhes (opcional)" aria-label="Descrição" onChange={(v) => edit.set({ text: v })} onKeyDown={(e) => { common(e); }} />
      <div className="clue-edit-hint">Ctrl+Enter salva · Esc cancela</div>
    </>
  );
}

/** Campo que cresce com o texto, sem barra de rolagem. */
function AutoTextarea({ inputRef, value, onChange, ...rest }: {
  inputRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (v: string) => void;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'>) {
  useLayoutEffect(() => {
    const t = inputRef.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
  }, [inputRef, value]);
  return <textarea {...rest} ref={inputRef} rows={1} value={value} onChange={(e) => onChange(e.target.value)} />;
}
