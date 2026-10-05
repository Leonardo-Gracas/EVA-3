import type { ActionPermission, PermissionKey, TableState } from '../../model/types';
import { PERMISSION_KEYS, PERMISSION_LABELS, PERMISSION_VALUES } from '../../model/permissions';
import { useAct } from '../act';

function Seg({ value, inherit, onChange }: {
  value: ActionPermission | null;
  inherit?: boolean;
  onChange: (v: ActionPermission | null) => void;
}) {
  return (
    <div className="seg">
      {inherit && <button className={value === null ? 'on-inherit' : ''} onClick={() => onChange(null)}>Padrão</button>}
      {PERMISSION_VALUES.map((p) => (
        <button key={p.value} className={value === p.value ? `on-${p.value}` : ''} onClick={() => onChange(p.value)}>{p.label}</button>
      ))}
    </div>
  );
}

export default function PermissionsPanel({ table }: { table: TableState }) {
  const { act } = useAct();
  const players = Object.values(table.players).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const setGlobal = (key: PermissionKey, value: ActionPermission | null) => {
    if (value) void act({ type: 'permissions/global', key, value });
  };

  return (
    <div className="col gap-lg">
      <div className="card">
        <div className="card-title">Permissões da mesa</div>
        <p className="small secondary mb">
          <strong>Livre</strong>: o jogador faz direto. <strong>Solicitar</strong>: vira pedido na aba Pedidos. <strong>Bloqueada</strong>: só o mestre faz.
          Criar ficha sempre passa pela sua aprovação; atributos nunca mudam depois disso.
        </p>
        <div className="perm-scroll">
          <table className="perm">
            <thead><tr><th>Ação</th><th>Todos os jogadores</th></tr></thead>
            <tbody>
              {PERMISSION_KEYS.map((k) => (
                <tr key={k}>
                  <td><div>{PERMISSION_LABELS[k].label}</div><div className="tiny muted">{PERMISSION_LABELS[k].hint}</div></td>
                  <td><Seg value={table.permissions.global[k]} onChange={(v) => setGlobal(k, v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {players.map((p) => {
        const own = table.permissions.perPlayer[p.id] ?? {};
        const overrides = Object.keys(own).length;
        return (
          <details key={p.id} className="card">
            <summary className="row" style={{ cursor: 'pointer' }}>
              <strong>{p.name}</strong>
              {overrides > 0 && <span className="badge badge-gold">{overrides} exceç{overrides > 1 ? 'ões' : 'ão'}</span>}
            </summary>
            <div className="perm-scroll mt">
              <table className="perm">
                <tbody>
                  {PERMISSION_KEYS.map((k) => (
                    <tr key={k}>
                      <td>{PERMISSION_LABELS[k].label}</td>
                      <td><Seg inherit value={own[k] ?? null} onChange={(v) => act({ type: 'permissions/player', playerId: p.id, key: k, value: v })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
    </div>
  );
}
