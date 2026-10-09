import { useState } from 'react';
import { Copy, Dices, Eye, EyeOff, Heart, Pencil, Swords, Trash2, Zap } from 'lucide-react';
import type { CombatThreat, Threat } from '../../model/types';
import { ATTR_KEYS, ATTRIBUTES, fmtMod } from '../../rules/attributes';
import { parseExpr } from '../../rules/dice';
import { useAct } from '../act';
import { cancelRollFx, startRollFx } from '../RollFx';
import ConfirmButton from '../common/ConfirmButton';
import ResourceAdjustModal, { peOps, pvOps, type AdjustStart, type AdjustTrack } from '../common/ResourceAdjust';
import ThreatEditor from './ThreatEditor';

function pct(v: number, max: number) {
  return `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;
}

/** Linha de ameaça nas listas do mestre. */
export function ThreatRow({ t, active, onClick }: { t: Threat; active: boolean; onClick: () => void }) {
  return (
    <button className={`card card-hover${active ? ' card-selected' : ''}`} style={{ padding: '8px 10px', textAlign: 'left' }} onClick={onClick}>
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
  );
}

/**
 * Ficha de ameaça. Com `combatantId`, mostra a instância de um combate: PV/PE
 * e rolagens vão para ela, e o molde do livro (editar, duplicar...) fica de fora.
 */
export function ThreatSheet(props: { t: Threat; onDuplicated?: (id: string) => void } | { t: CombatThreat; combatantId: string; templateName?: string }) {
  const { t } = props;
  const combatantId = 'combatantId' in props ? props.combatantId : undefined;
  const book = combatantId ? undefined : (t as Threat);
  const { act } = useAct();
  const [editing, setEditing] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [adjust, setAdjust] = useState<AdjustStart | null>(null);

  const setRes = async (pv: number, pe: number, reason?: string) => {
    const v = { pv: Math.min(t.pvMax, pv), pe: Math.max(0, Math.min(t.peMax, pe)), reason };
    return (await act(combatantId ? { type: 'combat/resource', combatantId, ...v } : { type: 'threat/resource', threatId: book!.id, ...v })).ok;
  };
  const tracks: AdjustTrack[] = [
    {
      key: 'pv', label: 'PV', icon: <Heart size={16} color="var(--pv)" />, color: 'var(--pv)', barClass: 'bar-pv',
      current: t.current.pv, max: t.pvMax, ops: pvOps(t.rdPhysical, t.rdMagic),
      status: (v) => (v <= 0 && t.current.pv > 0 ? 'A ameaça é abatida (PV ≤ 0).' : undefined),
    },
    {
      key: 'pe', label: 'PE', icon: <Zap size={16} color="var(--pe)" />, color: 'var(--pe)', barClass: 'bar-pe',
      current: t.current.pe, max: t.peMax, min: 0, ops: peOps(),
    },
  ];
  const roll = async (expr: string, label: string, attr?: (typeof ATTR_KEYS)[number]) => {
    const fx = startRollFx({ who: t.name, attr, label, expr });
    const r = await act({ type: 'roll', expr, ...(combatantId ? { combatantId } : { threatId: book!.id }), attr, label, hidden });
    if (!r.ok) cancelRollFx(fx);
  };

  return (
    <div className="sheet">
      <div className="card card-gold">
        <div className="sheet-head">
          <div className="grow">
            <div className="sheet-title">{combatantId ? 'Ameaça em combate' : 'Ameaça'}</div>
            <h2 className="sheet-name">{t.name}</h2>
            {t.concept && <div className="secondary">{t.concept}</div>}
            {'templateName' in props && props.templateName && (
              <div className="tiny muted mt">Molde: {props.templateName}. Os ajustes aqui valem só para este combate.</div>
            )}
          </div>
          {book && (
            <div className="row-wrap">
              <button className={`btn btn-sm${book.visible ? ' btn-primary' : ''}`} title="Mostrar nome e descrição aos jogadores"
                onClick={() => act({ type: 'threat/visibility', threatId: book.id, visible: !book.visible })}>
                {book.visible ? <Eye size={14} /> : <EyeOff size={14} />} {book.visible ? 'Visível' : 'Oculta'}
              </button>
              <button className="btn btn-sm" onClick={() => setEditing(true)}><Pencil size={14} /> Editar</button>
              <button className="btn btn-sm" onClick={async () => { const r = await act({ type: 'threat/duplicate', threatId: book.id }, 'Ameaça duplicada.'); if (r.ok && r.id && 'onDuplicated' in props) props.onDuplicated?.(r.id); }}><Copy size={14} /> Duplicar</button>
              <ConfirmButton title="Excluir ameaça" modalTitle="Excluir ameaça" confirmLabel={`Excluir ${t.name}`}
                message={<><p>Excluir a ameaça <strong>{t.name}</strong>?</p><p className="small muted mt">Não dá para desfazer.</p></>}
                onConfirm={() => act({ type: 'threat/delete', threatId: book.id }, 'Ameaça excluída.')}><Trash2 size={14} /></ConfirmButton>
            </div>
          )}
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
          {tracks.map((x) => (
            <div className="vital" key={x.key}>
              <button className="vital-hit" title={`Ajustar ${x.label}`} onClick={() => setAdjust({ track: x.key })}>
                <div className="vital-top">
                  {x.icon}<span className="vital-label" style={{ color: x.color }}>{x.label}</span>
                  <span className="vital-num">{x.current}</span><span className="vital-max">/ {x.max}</span>
                </div>
                <div className={`bar ${x.current < 0 ? 'bar-neg' : x.barClass}`} style={{ marginTop: 6 }}>
                  <div style={{ width: x.current < 0 ? '100%' : pct(x.current, x.max!) }} />
                </div>
              </button>
              <div className="vital-actions">
                {x.key === 'pv' ? (
                  <>
                    <button className="btn btn-sm" onClick={() => setAdjust({ track: 'pv', op: 'phys' })}>Dano</button>
                    <button className="btn btn-sm" onClick={() => setAdjust({ track: 'pv', op: 'heal' })}>Curar</button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-sm" onClick={() => setAdjust({ track: 'pe', op: 'spend' })}>Gastar</button>
                    <button className="btn btn-sm" onClick={() => setAdjust({ track: 'pe', op: 'recover' })}>Recuperar</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        {adjust && (
          <ResourceAdjustModal title={`Ajustar ${t.name}`} tracks={tracks} start={adjust}
            onApply={(k, v, reason) => (k === 'pv' ? setRes(v, t.current.pe, reason) : setRes(t.current.pv, v, reason))}
            onRestoreAll={{ label: 'Restaurar tudo', run: () => setRes(t.pvMax, t.peMax, 'Restaurada') }}
            onClose={() => setAdjust(null)} />
        )}
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

      {editing && book && (
        <ThreatEditor title={`Editar ${book.name}`} initial={book} onClose={() => setEditing(false)}
          onSave={async (data) => (await act({ type: 'threat/upsert', threatId: book.id, data }, 'Ameaça salva.')).ok} />
      )}
    </div>
  );
}
