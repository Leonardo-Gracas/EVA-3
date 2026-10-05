import { useEffect, useMemo, useState } from 'react';
import { Copy, Dices, Eye, EyeOff, Heart, Pencil, Plus, Search, Swords, Trash2, Zap } from 'lucide-react';
import type { TableState, Threat } from '../../model/types';
import { ATTR_KEYS, ATTRIBUTES, fmtMod } from '../../rules/attributes';
import { parseExpr } from '../../rules/dice';
import { useAct } from '../act';
import ConfirmButton from '../common/ConfirmButton';
import ThreatEditor from './ThreatEditor';
import { hostStore } from '../../net/host';

function pct(v: number, max: number) {
  return `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;
}

export default function ThreatsPanel({ table }: { table: TableState }) {
  const { act } = useAct();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const threats = useMemo(() => Object.values(table.threats)
    .filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.createdAt - b.createdAt), [table.threats, q]);
  const current = selected ? table.threats[selected] : undefined;

  useEffect(() => {
    if (!current && threats[0]) setSelected(threats[0].id);
  }, [current, threats]);

  const selectNewest = () => {
    const all = Object.values(hostStore.get().table?.threats ?? {});
    const newest = all.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (newest) setSelected(newest.id);
  };

  return (
    <div className="split">
      <div className="col">
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={14} /> Nova ameaça</button>
        {Object.keys(table.threats).length > 6 && (
          <div className="row"><Search size={14} className="muted" /><input className="input" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        )}
        {threats.length === 0 && <div className="empty">Ameaças são fichas de combate com valores livres.</div>}
        {threats.map((t) => (
          <button key={t.id} className={`card card-hover${t.id === current?.id ? ' card-selected' : ''}`} style={{ padding: '8px 10px', textAlign: 'left' }} onClick={() => setSelected(t.id)}>
            <div className="row">
              <strong className="grow">{t.name}</strong>
              {t.visible ? <Eye size={13} className="muted" /> : null}
              {t.current.pv <= 0 && <span className="badge badge-err">Abatida</span>}
            </div>
            <div className="bar bar-pv" style={{ height: 6, marginTop: 6 }}><div style={{ width: pct(t.current.pv, t.pvMax) }} /></div>
            <div className="row tiny muted" style={{ marginTop: 4 }}>
              <span className="grow">{t.concept}</span>
              <span style={{ color: 'var(--pv)' }}>{t.current.pv}/{t.pvMax}</span>
              {t.peMax > 0 && <span style={{ color: 'var(--pe)' }}>{t.current.pe}/{t.peMax}</span>}
            </div>
          </button>
        ))}
      </div>
      <div>
        {current ? <ThreatSheet t={current} onDuplicated={selectNewest} /> : <div className="empty">Crie uma ameaça para começar.</div>}
      </div>
      {creating && (
        <ThreatEditor title="Nova ameaça" onClose={() => setCreating(false)}
          onSave={async (data) => {
            const r = await act({ type: 'threat/upsert', data }, 'Ameaça criada.');
            if (r.ok) selectNewest();
            return r.ok;
          }} />
      )}
    </div>
  );
}

function ThreatSheet({ t, onDuplicated }: { t: Threat; onDuplicated: () => void }) {
  const { act } = useAct();
  const [editing, setEditing] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [amount, setAmount] = useState('');
  const n = Math.abs(parseInt(amount, 10) || 0);

  const setRes = (pv: number, pe: number, reason?: string) =>
    act({ type: 'threat/resource', threatId: t.id, pv: Math.min(t.pvMax, pv), pe: Math.max(0, Math.min(t.peMax, pe)), reason });
  const roll = (expr: string, label: string, attr?: (typeof ATTR_KEYS)[number]) =>
    act({ type: 'roll', expr, threatId: t.id, attr, label, hidden });

  return (
    <div className="sheet">
      <div className="card card-gold">
        <div className="sheet-head">
          <div className="grow">
            <div className="sheet-title">Ameaça</div>
            <h2 className="sheet-name">{t.name}</h2>
            {t.concept && <div className="secondary">{t.concept}</div>}
          </div>
          <div className="row-wrap">
            <button className={`btn btn-sm${t.visible ? ' btn-primary' : ''}`} title="Mostrar nome e descrição aos jogadores"
              onClick={() => act({ type: 'threat/visibility', threatId: t.id, visible: !t.visible })}>
              {t.visible ? <Eye size={14} /> : <EyeOff size={14} />} {t.visible ? 'Visível' : 'Oculta'}
            </button>
            <button className="btn btn-sm" onClick={() => setEditing(true)}><Pencil size={14} /> Editar</button>
            <button className="btn btn-sm" onClick={async () => { const r = await act({ type: 'threat/duplicate', threatId: t.id }, 'Ameaça duplicada.'); if (r.ok) onDuplicated(); }}><Copy size={14} /> Duplicar</button>
            <ConfirmButton onConfirm={() => act({ type: 'threat/delete', threatId: t.id }, 'Ameaça excluída.')}><Trash2 size={14} /></ConfirmButton>
          </div>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><span className="stat-val">{t.def}</span><span className="stat-lbl">Defesa</span></div>
        <div className="stat"><span className="stat-val">{t.von}</span><span className="stat-lbl">Vontade</span></div>
        <div className="stat"><span className="stat-val">{t.rdPhysical}</span><span className="stat-lbl">RD física</span></div>
        <div className="stat"><span className="stat-val">{t.rdMagic}</span><span className="stat-lbl">RD mágica</span></div>
      </div>

      <div className="card">
        <div className="row mb">
          <div className="card-title" style={{ margin: 0 }}>Vitalidade</div>
          {t.current.pv <= 0 && <span className="badge badge-err">Abatida</span>}
        </div>
        <div className="grid-2">
          <div className="vital">
            <div className="vital-top">
              <Heart size={16} color="var(--pv)" /><span className="vital-label" style={{ color: 'var(--pv)' }}>PV</span>
              <span className="vital-num">{t.current.pv}</span><span className="vital-max">/ {t.pvMax}</span>
            </div>
            <div className={`bar ${t.current.pv < 0 ? 'bar-neg' : 'bar-pv'}`}><div style={{ width: t.current.pv < 0 ? '100%' : pct(t.current.pv, t.pvMax) }} /></div>
          </div>
          <div className="vital">
            <div className="vital-top">
              <Zap size={16} color="var(--pe)" /><span className="vital-label" style={{ color: 'var(--pe)' }}>PE</span>
              <span className="vital-num">{t.current.pe}</span><span className="vital-max">/ {t.peMax}</span>
            </div>
            <div className="bar bar-pe"><div style={{ width: pct(t.current.pe, t.peMax) }} /></div>
          </div>
        </div>
        <div className="row-wrap mt">
          <input className="input" style={{ width: 90 }} inputMode="numeric" placeholder="Qtd." value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
          <button className="btn btn-sm" disabled={!n} onClick={() => setRes(t.current.pv - Math.max(0, n - t.rdPhysical), t.current.pe, `Dano físico ${n}${t.rdPhysical ? ` − RD ${t.rdPhysical}` : ''}`)} title="Aplica a RD física">Dano físico</button>
          <button className="btn btn-sm" disabled={!n} onClick={() => setRes(t.current.pv - Math.max(0, n - t.rdMagic), t.current.pe, `Dano mágico ${n}${t.rdMagic ? ` − RD ${t.rdMagic}` : ''}`)} title="Aplica a RD mágica">Dano mágico</button>
          <button className="btn btn-sm" disabled={!n} onClick={() => setRes(t.current.pv - n, t.current.pe, `Dano direto ${n}`)} title="Ignora a RD">Dano direto</button>
          <button className="btn btn-sm" disabled={!n} onClick={() => setRes(t.current.pv + n, t.current.pe, 'Cura')}>Cura</button>
          <button className="btn btn-sm" disabled={!n} onClick={() => setRes(t.current.pv, t.current.pe - n, 'Gasto')}>−PE</button>
          <button className="btn btn-sm" disabled={!n} onClick={() => setRes(t.current.pv, t.current.pe + n, 'Recuperação')}>+PE</button>
          <span className="spacer" />
          <ConfirmButton className="btn btn-sm btn-ghost" confirmText="Restaurar?" onConfirm={() => setRes(t.pvMax, t.peMax, 'Restaurada')}>Restaurar</ConfirmButton>
        </div>
      </div>

      <div className="card">
        <div className="row mb">
          <div className="card-title" style={{ margin: 0 }}>Atributos</div>
          <div className="spacer" />
          <label className="check"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Rolagens ocultas</label>
        </div>
        <div className="attrs">
          {ATTR_KEYS.map((k) => (
            <button key={k} className="attr" title={`Rolar teste de ${ATTRIBUTES[k].name}`} onClick={() => roll('d20', '', k)}>
              <span className="attr-key">{ATTRIBUTES[k].short}</span>
              <span className="attr-val">{fmtMod(t.attributes[k])}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title"><Swords size={14} /> Ataques</div>
        {t.attacks.length === 0 && <div className="empty">Nenhum ataque.</div>}
        {t.attacks.map((a) => {
          const dmgOk = !!a.damage && !!parseExpr(a.damage);
          return (
            <div key={a.id} className="inv-row">
              <div className="grow">
                <div className="row-wrap">
                  <strong>{a.name}</strong>
                  <span className="badge badge-gold">{fmtMod(a.bonus)}</span>
                  {a.damage && <span className="badge badge-err">{a.damage}</span>}
                </div>
                {a.notes && <div className="small muted">{a.notes}</div>}
              </div>
              <button className="btn btn-sm" onClick={() => roll(`d20${a.bonus ? fmtMod(a.bonus) : ''}`, `Ataque: ${a.name}`)}><Dices size={13} /> Atacar</button>
              <button className="btn btn-sm" disabled={!dmgOk} title={dmgOk ? undefined : 'Dano não é uma expressão de dados'} onClick={() => roll(a.damage, `Dano: ${a.name}`)}>Dano</button>
            </div>
          );
        })}
      </div>

      {t.abilities.length > 0 && (
        <div className="card">
          <div className="card-title">Habilidades</div>
          <div className="col">
            {t.abilities.map((h) => (
              <div key={h.id} className="ability" style={{ padding: '10px 12px' }}>
                <div className="row"><span className="ability-name">{h.name}</span>{h.cost && <span className="badge badge-gold">{h.cost}</span>}</div>
                {h.text && <div className="small secondary pre" style={{ marginTop: 4 }}>{h.text}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {t.notes && (
        <div className="card">
          <div className="card-title">Anotações</div>
          <div className="pre small secondary">{t.notes}</div>
        </div>
      )}

      {editing && (
        <ThreatEditor title={`Editar ${t.name}`} initial={t} onClose={() => setEditing(false)}
          onSave={async (data) => (await act({ type: 'threat/upsert', threatId: t.id, data }, 'Ameaça salva.')).ok} />
      )}
    </div>
  );
}
