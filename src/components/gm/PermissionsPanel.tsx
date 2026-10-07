import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { LIMITS } from '../../rules/validate';
import type { ActionPermission, PermissionKey, TableState } from '../../model/types';
import { MAX_LEVEL } from '../../rules/classes';
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

  const setStartLevel = (level: number) => act({ type: 'table/startLevel', level }, `Novos personagens começam no nível ${level}.`);

  const [name, setName] = useState(table.name);
  useEffect(() => setName(table.name), [table.name]);
  const trimmedName = name.trim();
  const rename = () => {
    if (trimmedName && trimmedName !== table.name) void act({ type: 'table/rename', name: trimmedName }, `Campanha renomeada para "${trimmedName}".`);
  };

  return (
    <div className="col gap-lg">
      <div className="card">
        <div className="card-title">Campanha</div>
        <form className="row-wrap" onSubmit={(e) => { e.preventDefault(); rename(); }}>
          <input className="input" style={{ flex: 1, minWidth: 0 }} value={name} maxLength={LIMITS.tableName}
            aria-label="Nome da campanha" placeholder="Nome da campanha" onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn btn-sm" disabled={!trimmedName || trimmedName === table.name}>Salvar nome</button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Criação de personagem</div>
        <div className="row-wrap">
          <span>Nível inicial</span>
          <div className="stepper">
            <button className="btn btn-sm btn-icon" disabled={table.startLevel <= 1} onClick={() => setStartLevel(table.startLevel - 1)} aria-label="Diminuir nível inicial"><Minus size={14} /></button>
            <span className="val">{table.startLevel}</span>
            <button className="btn btn-sm btn-icon" disabled={table.startLevel >= MAX_LEVEL} onClick={() => setStartLevel(table.startLevel + 1)} aria-label="Aumentar nível inicial"><Plus size={14} /></button>
          </div>
        </div>
        <p className="small secondary mt">
          Nível com que os jogadores criam fichas novas. Acima do 1, eles escolhem classe e habilidade de cada nível em ordem,
          como se tivessem subido nível a nível. Fichas já aprovadas não mudam.
        </p>
      </div>

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
