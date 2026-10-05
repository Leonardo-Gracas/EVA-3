import { Check, X } from 'lucide-react';
import type { PendingRequest, TableState } from '../../model/types';
import { PERMISSION_LABELS } from '../../model/permissions';
import { useAct } from '../act';

function when(at: number) {
  return new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function RequestStatus({ r }: { r: PendingRequest }) {
  if (r.status === 'pending') return <span className="badge badge-warn">Pendente</span>;
  if (r.status === 'approved') return <span className="badge badge-ok">Aprovado</span>;
  return <span className="badge badge-err" title={r.error}>{r.error ? 'Não aplicado' : 'Negado'}</span>;
}

export default function RequestsPanel({ table }: { table: TableState }) {
  const { act } = useAct();
  const pending = table.requests.filter((r) => r.status === 'pending');
  const done = table.requests.filter((r) => r.status !== 'pending').slice(-30).reverse();
  const name = (id: string) => table.players[id]?.name ?? 'Jogador';

  return (
    <div className="col gap-lg">
      <div className="card">
        <div className="card-title">Pendentes ({pending.length})</div>
        {pending.length === 0 && <div className="empty">Nenhum pedido aguardando.</div>}
        <div className="col">
          {pending.map((r) => (
            <div key={r.id} className="log-entry">
              <div className="row-wrap">
                <div className="grow">
                  <div><strong>{name(r.playerId)}</strong> <span className="badge">{PERMISSION_LABELS[r.permission].label}</span></div>
                  <div className="secondary">{r.summary}</div>
                  <div className="tiny muted">{when(r.createdAt)}</div>
                </div>
                <button className="btn btn-sm btn-primary" onClick={() => act({ type: 'request/resolve', requestId: r.id, approve: true })}><Check size={14} /> Aprovar</button>
                <button className="btn btn-sm btn-danger" onClick={() => act({ type: 'request/resolve', requestId: r.id, approve: false })}><X size={14} /> Negar</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {done.length > 0 && (
        <div className="card">
          <div className="card-title">Resolvidos</div>
          <div className="col">
            {done.map((r) => (
              <div key={r.id} className="row-wrap small">
                <RequestStatus r={r} />
                <strong>{name(r.playerId)}</strong>
                <span className="secondary grow">{r.summary}{r.error ? ` — ${r.error}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
