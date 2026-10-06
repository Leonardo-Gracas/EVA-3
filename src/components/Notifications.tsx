// Avisos da mesa: resultado de rolagens, pedidos chegando para o mestre (com
// aprovar/negar no próprio aviso) e respostas do mestre para o jogador.
import { useEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, ClipboardList, Dices, Eye, X } from 'lucide-react';
import type { Character, LogEntry, PendingRequest, TableState } from '../model/types';
import { PERMISSION_LABELS } from '../model/permissions';
import { useAct } from './act';
import { dismissTag, notify } from './common/toast';

/** Chama `onNew` para itens que surgirem depois da primeira renderização. */
function useNewItems<T>(items: T[], key: (t: T) => string, onNew: (t: T) => void) {
  const seen = useRef<Set<string> | null>(null);
  const cb = useRef(onNew);
  cb.current = onNew;
  useEffect(() => {
    if (!seen.current) { seen.current = new Set(items.map(key)); return; }
    for (const it of items) {
      const k = key(it);
      if (seen.current.has(k)) continue;
      seen.current.add(k);
      cb.current(it);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
}

/** Chama `onChange` quando o status de um item muda (ignora o estado inicial). */
function useStatusChanges<T extends { id: string; status: string }>(items: T[], onChange: (t: T, before: string) => void) {
  const prev = useRef<Map<string, string> | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    const next = new Map(items.map((t) => [t.id, t.status]));
    if (prev.current) {
      for (const it of items) {
        const before = prev.current.get(it.id);
        if (before !== undefined && before !== it.status) cb.current(it, before);
      }
    }
    prev.current = next;
  }, [items]);
}

// ── Rolagens ────────────────────────────────────────────────────────────────

function RollBody({ e }: { e: LogEntry }) {
  const r = e.roll!;
  const d20 = r.dice.length === 1 && r.dice[0].sides === 20 ? r.dice[0].value : null;
  const vs = r.target !== undefined ? (r.total > r.target ? 'acerto' : 'falha') : null;
  return (
    <div className="row">
      <div className={`roll-total${d20 === 20 ? ' crit' : d20 === 1 ? ' fumble' : ''}`}>{r.total}</div>
      <div className="grow">
        <div className="small secondary">{e.text}</div>
        <div className="roll-dice">
          [{r.dice.map((x) => `${x.value < 0 ? '−' : ''}${Math.abs(x.value)}`).join(', ')}]
          {r.modifier ? ` ${r.modifier > 0 ? '+' : '−'} ${Math.abs(r.modifier)}` : ''}
          {d20 === 20 && <strong className="crit"> · crítico!</strong>}
          {d20 === 1 && <strong className="fumble"> · falha crítica</strong>}
          {vs && <> · alvo {r.target} → <strong className={vs === 'acerto' ? 'crit' : 'fumble'}>{vs}</strong></>}
        </div>
      </div>
    </div>
  );
}

/** Mostra como aviso as rolagens novas que passarem em `show`. */
export function useRollToasts(log: LogEntry[], show: (e: LogEntry) => boolean) {
  useNewItems(log, (e) => e.id, (e) => {
    if (e.kind !== 'roll' || !e.roll || !show(e)) return;
    notify({
      kind: 'roll',
      title: <><Dices size={13} /> {e.characterName ?? e.actorName}{e.hidden ? ' (oculta)' : ''}</>,
      text: <RollBody e={e} />,
      duration: 7000,
    });
  });
}

// ── Mestre: pedidos e fichas ────────────────────────────────────────────────

function requestTitle(table: TableState, r: PendingRequest) {
  const player = table.players[r.playerId]?.name ?? 'Jogador';
  const ch = table.characters[r.characterId]?.name;
  return `${player}${ch && ch !== player ? ` (${ch})` : ''}`;
}

/** Avisos do mestre: cada pedido novo chega com Aprovar/Negar; fichas novas com Ver/Aprovar. */
export function GmNotifications({ table, onOpenSheet }: { table: TableState; onOpenSheet: (id: string) => void }) {
  const { act } = useAct();
  const resolve = (id: string, approve: boolean) => act({ type: 'request/resolve', requestId: id, approve });
  const pending = table.requests.filter((r) => r.status === 'pending');
  const chars = Object.values(table.characters);

  useNewItems(pending, (r) => r.id, (r) => {
    notify({
      kind: 'request',
      tag: `req:${r.id}`,
      duration: 0,
      title: <>{requestTitle(table, r)} <span className="badge badge-warn">{PERMISSION_LABELS[r.permission].label}</span></>,
      text: r.summary,
      actions: [
        { label: <><Check size={13} /> Aprovar</>, className: 'btn btn-sm btn-primary', run: () => resolve(r.id, true) },
        { label: <><X size={13} /> Negar</>, className: 'btn btn-sm btn-danger', run: () => resolve(r.id, false) },
      ],
    });
  });

  // Resolvido por outro caminho (aba Pedidos, sino): some o aviso.
  useStatusChanges(table.requests, (r) => { if (r.status !== 'pending') dismissTag(`req:${r.id}`); });

  const sheetToast = (c: Character) => notify({
    kind: 'request',
    tag: `sheet:${c.id}`,
    duration: 0,
    title: <><ClipboardList size={13} /> Ficha para aprovar</>,
    text: <><strong>{c.name}</strong> — {table.players[c.ownerId]?.name ?? 'Jogador'}</>,
    actions: [
      { label: <><Eye size={13} /> Ver ficha</>, run: () => onOpenSheet(c.id) },
      { label: <><Check size={13} /> Aprovar</>, className: 'btn btn-sm btn-primary', run: () => act({ type: 'character/approve', characterId: c.id }, 'Ficha aprovada.') },
    ],
  });
  useNewItems(chars.filter((c) => c.status === 'pending'), (c) => `${c.id}:${c.updatedAt}`, sheetToast);
  useStatusChanges(chars, (c) => { if (c.status !== 'pending') dismissTag(`sheet:${c.id}`); });

  return null;
}

/** Sino no topo: tudo que espera o mestre, resolvível sem trocar de aba. */
export function GmInbox({ table, onOpenSheet, onOpenRequests }: { table: TableState; onOpenSheet: (id: string) => void; onOpenRequests: () => void }) {
  const { act } = useAct();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pending = table.requests.filter((r) => r.status === 'pending');
  const sheets = Object.values(table.characters).filter((c) => c.status === 'pending');
  const total = pending.length + sheets.length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const resolve = (id: string, approve: boolean) => act({ type: 'request/resolve', requestId: id, approve });
  const resolveAll = async (approve: boolean) => {
    for (const r of pending) await resolve(r.id, approve);
  };

  return (
    <div className="inbox" ref={box}>
      <button className={`btn btn-sm btn-ghost inbox-btn${total ? ' has' : ''}`} onClick={() => setOpen(!open)}
        title={total ? `${total} aguardando você` : 'Nada aguardando'} aria-expanded={open}>
        <Bell size={15} />{total > 0 && <span className="count">{total}</span>}
      </button>
      {open && (
        <div className="inbox-panel" role="dialog" aria-label="Aguardando o mestre">
          <div className="inbox-head">
            <strong>Aguardando você</strong>
            <span className="spacer" />
            {pending.length > 1 && (
              <>
                <button className="btn btn-sm btn-primary" onClick={() => void resolveAll(true)} title="Aprovar todos os pedidos"><CheckCheck size={13} /> Todos</button>
                <button className="btn btn-sm btn-danger" onClick={() => void resolveAll(false)} title="Negar todos os pedidos"><X size={13} /> Todos</button>
              </>
            )}
          </div>
          <div className="inbox-list">
            {total === 0 && <div className="empty">Nenhum pedido aguardando.</div>}
            {sheets.map((c) => (
              <div key={c.id} className="inbox-item">
                <div className="grow">
                  <div><ClipboardList size={12} className="gold" /> <strong>{c.name}</strong> <span className="badge badge-warn">Ficha</span></div>
                  <div className="tiny muted">{table.players[c.ownerId]?.name ?? 'Jogador'}</div>
                </div>
                <button className="btn btn-sm" onClick={() => { onOpenSheet(c.id); setOpen(false); }} title="Ver ficha"><Eye size={13} /></button>
                <button className="btn btn-sm btn-primary" onClick={() => act({ type: 'character/approve', characterId: c.id }, 'Ficha aprovada.')} title="Aprovar ficha"><Check size={13} /></button>
              </div>
            ))}
            {pending.map((r) => (
              <div key={r.id} className="inbox-item">
                <div className="grow">
                  <div><strong>{requestTitle(table, r)}</strong> <span className="badge">{PERMISSION_LABELS[r.permission].label}</span></div>
                  <div className="small secondary">{r.summary}</div>
                </div>
                <button className="btn btn-sm btn-primary" onClick={() => resolve(r.id, true)} title="Aprovar"><Check size={13} /></button>
                <button className="btn btn-sm btn-danger" onClick={() => resolve(r.id, false)} title="Negar"><X size={13} /></button>
              </div>
            ))}
          </div>
          <button className="btn btn-sm btn-ghost btn-block" onClick={() => { onOpenRequests(); setOpen(false); }}>Ver histórico de pedidos</button>
        </div>
      )}
    </div>
  );
}

// ── Jogador: respostas do mestre ────────────────────────────────────────────

export function PlayerNotifications({ requests, characters }: { requests: PendingRequest[]; characters: Character[] }) {
  useStatusChanges(requests, (r) => {
    if (r.status === 'approved') notify({ kind: 'ok', title: 'Pedido aprovado', text: r.summary, duration: 5000 });
    else if (r.status === 'denied') notify({ kind: 'error', title: r.error ? 'Pedido não aplicado' : 'Pedido negado', text: r.error ? `${r.summary} — ${r.error}` : r.summary, duration: 6000 });
  });
  useStatusChanges(characters, (c) => {
    if (c.status === 'approved') notify({ kind: 'ok', title: 'Ficha aprovada', text: `${c.name} está pronta para jogar.`, duration: 6000 });
    else if (c.status === 'rejected') notify({ kind: 'error', title: 'Ficha devolvida', text: c.rejectReason ? `${c.name}: ${c.rejectReason}` : `${c.name} precisa de ajustes.`, duration: 8000 });
  });
  return null;
}
