// Exportar e importar fichas (PJs e NPCs) em arquivo .json.
import { useCallback, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import type { Character, CharacterKind, GameAction } from '../../model/types';
import { MAX_MESSAGE_CHARS } from '../../net/protocol';
import { downloadCharacters, pickFile, readCharacterFile } from '../../store/persistence';
import { useAct, type Ack } from '../act';
import { toast } from './toast';

/** Baixa as fichas num arquivo. `name` nomeia o arquivo quando são várias. */
export function ExportCharactersButton({ chars, name, className = 'btn btn-sm btn-ghost', title, children }: {
  chars: Character[]; name?: string; className?: string; title?: string; children?: ReactNode;
}) {
  return (
    <button className={className} disabled={!chars.length}
      title={title ?? (chars.length > 1 ? `Exportar ${chars.length} fichas (.json)` : 'Exportar ficha (.json)')}
      onClick={() => downloadCharacters(chars, name)}>
      {children ?? <Download size={14} />}
    </button>
  );
}

/**
 * Escolhe um arquivo de fichas e importa. Jogador: as fichas vão para a aprovação
 * do mestre. Mestre: `as: 'npc'` cria NPCs; `as: 'pc'` dá as fichas ao jogador `ownerId`.
 * Devolve null se nada foi importado (cancelou ou deu erro, já avisado).
 */
export function useImportCharacters() {
  const { act, role } = useAct();
  return useCallback(async (as: CharacterKind, ownerId?: string): Promise<Ack | null> => {
    const f = await pickFile('application/json,.json');
    if (!f) return null;
    let characters;
    try {
      characters = await readCharacterFile(f);
    } catch (e) {
      toast((e as Error).message, 'error');
      return null;
    }
    const action: GameAction = { type: 'character/import', characters, as, ...(ownerId ? { ownerId } : {}) };
    if (role === 'player' && JSON.stringify(action).length > MAX_MESSAGE_CHARS - 1000) {
      toast('Ficha grande demais para enviar pela sala. Mande o arquivo ao mestre para ele importar.', 'error');
      return null;
    }
    const many = characters.length > 1;
    const okText = role === 'player'
      ? `${many ? 'Fichas enviadas' : 'Ficha enviada'}! Aguarde a aprovação do mestre.`
      : many ? `${characters.length} fichas importadas.` : 'Ficha importada.';
    const r = await act(action, okText);
    return r.ok ? r : null;
  }, [act, role]);
}
