// Ponte única entre a tela e a mesa. No mestre aplica direto pelo motor; no
// jogador envia ao mestre. A tela não precisa saber de qual lado está.
import { createContext, useContext, useCallback, type ReactNode } from 'react';
import type { ActionPermission, GameAction, LibraryItem, Permissions, PermissionKey } from '../model/types';
import { toast } from './common/toast';

export interface Ack { ok: boolean; error?: string; requested?: boolean; message?: string }

export interface ActApi {
  role: 'gm' | 'player';
  /** Permissões efetivas (jogador). O mestre pode tudo. */
  permissions: Permissions | null;
  /** Biblioteca de itens do mestre (o jogador recebe uma cópia na visão). */
  library: LibraryItem[];
  send: (a: GameAction) => Promise<Ack>;
}

const Ctx = createContext<ActApi | null>(null);

export function ActProvider({ value, children }: { value: ActApi; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAct() {
  const api = useContext(Ctx);
  if (!api) throw new Error('ActProvider ausente');

  /** Envia e mostra o resultado. `okText` aparece quando aplicado direto. */
  const act = useCallback(async (a: GameAction, okText?: string): Promise<Ack> => {
    const r = await api.send(a);
    if (!r.ok) toast(r.error ?? 'Não foi possível.', 'error');
    else if (r.requested) toast(r.message ?? 'Pedido enviado ao mestre.', 'request');
    else if (okText) toast(okText, 'ok');
    return r;
  }, [api]);

  const perm = useCallback((key: PermissionKey): ActionPermission => {
    if (api.role === 'gm' || !api.permissions) return 'free';
    return api.permissions[key];
  }, [api]);

  return { act, perm, role: api.role, library: api.library };
}

export function permHint(p: ActionPermission): string | undefined {
  if (p === 'request') return 'Precisa da aprovação do mestre';
  if (p === 'blocked') return 'Bloqueado pelo mestre';
  return undefined;
}
