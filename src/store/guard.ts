// Validação e registro compartilhados pelo motor e pelos módulos de ações.
import type { LogEntry, TableState } from '../model/types';
import type { EngineCtx } from './engine';

export const MAX_LOG = 400;

/** Erro de regra: volta ao jogador como mensagem, sem mudar o estado. */
export class Fail extends Error {}
export const fail = (msg: string): never => { throw new Fail(msg); };

export function str(v: unknown, max: number, field: string, required = false): string {
  if (typeof v !== 'string') return fail(`${field} inválido.`);
  const s = v.trim();
  if (required && !s) fail(`${field} é obrigatório.`);
  if (s.length > max) fail(`${field} longo demais.`);
  return s;
}

export function int(v: unknown, min: number, max: number, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) return fail(`${field} inválido.`);
  if (v < min || v > max) fail(`${field} fora do limite (${min} a ${max}).`);
  return v;
}

export const record = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {});

export function log(s: TableState, ctx: EngineCtx, e: Omit<LogEntry, 'id' | 'at'>) {
  s.log.push({ id: ctx.newId(), at: ctx.now(), ...e });
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
}
