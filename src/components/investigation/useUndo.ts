// Desfazer/refazer do mural. Cada entrada guarda as ações que voltam e que repetem o passo;
// elas passam pelo motor como qualquer outra ação do mestre.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameAction } from '../../model/types';
import type { Ack } from '../act';

export interface UndoEntry {
  label: string;
  undo: GameAction[];
  redo: GameAction[];
}

const MAX_ENTRIES = 50;

export interface UndoApi {
  push: (e: UndoEntry) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  /** Desfaz só se a entrada ainda for a última (botão "Desfazer" de um aviso antigo não mexe em outra coisa). */
  undoIf: (e: UndoEntry) => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
}

export function useUndo(resetKey: string, run: (a: GameAction) => Promise<Ack>): UndoApi {
  const past = useRef<UndoEntry[]>([]);
  const future = useRef<UndoEntry[]>([]);
  const busy = useRef(false);
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  useEffect(() => {
    past.current = [];
    future.current = [];
    bump();
  }, [resetKey]);

  const runAll = async (actions: GameAction[]) => {
    for (const a of actions) if (!(await run(a)).ok) return false;
    return true;
  };

  const push = useCallback((e: UndoEntry) => {
    past.current = [...past.current.slice(-(MAX_ENTRIES - 1)), e];
    future.current = [];
    bump();
  }, []);

  /** Tira a entrada de uma pilha, roda e põe na outra. Se o motor recusar, o histórico daquele lado se perde. */
  const step = useCallback(async (from: typeof past, to: typeof past, pick: (e: UndoEntry) => GameAction[]) => {
    if (busy.current) return;
    const e = from.current[from.current.length - 1];
    if (!e) return;
    busy.current = true;
    from.current = from.current.slice(0, -1);
    const ok = await runAll(pick(e));
    if (ok) to.current = [...to.current, e];
    else to.current = [];
    busy.current = false;
    bump();
    // `run` muda quando o mestre troca; a pilha não depende disso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const undo = useCallback(() => step(past, future, (e) => e.undo), [step]);
  const redo = useCallback(() => step(future, past, (e) => e.redo), [step]);
  const undoIf = useCallback(async (e: UndoEntry) => {
    if (past.current[past.current.length - 1] === e) await undo();
  }, [undo]);

  const top = past.current[past.current.length - 1];
  const next = future.current[future.current.length - 1];
  return useMemo(() => ({
    push, undo, redo, undoIf,
    canUndo: !!top, canRedo: !!next, undoLabel: top?.label, redoLabel: next?.label,
  }), [push, undo, redo, undoIf, top, next]);
}
