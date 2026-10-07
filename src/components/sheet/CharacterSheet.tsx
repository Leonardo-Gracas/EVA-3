import { useEffect, useState, type ReactNode } from 'react';
import { Check, Dices, Eye, EyeOff, Footprints, NotebookPen, Skull, Undo2, X } from 'lucide-react';
import { DEFAULT_MOVEMENT, type Character } from '../../model/types';
import { ATTR_KEYS, ATTRIBUTES, fmtMod } from '../../rules/attributes';
import { CLASSES } from '../../rules/classes';
import { deriveStats, testModifier, type Derived } from '../../rules/derive';
import { LIMITS } from '../../rules/validate';
import { useAct } from '../act';
import { cancelRollFx, startRollFx } from '../RollFx';
import ActButton from '../common/ActButton';
import ConfirmModal from '../common/ConfirmModal';
import Vitals from './Vitals';
import AbilitiesPanel from './AbilitiesPanel';
import Inventory from './Inventory';

export function StatusBadge({ status }: { status: Character['status'] }) {
  if (status === 'approved') return null;
  if (status === 'pending') return <span className="badge badge-warn">Aguardando aprovação</span>;
  return <span className="badge badge-err">Devolvida</span>;
}

export function ClassChips({ ch }: { ch: Character }) {
  const d = deriveStats(ch);
  return (
    <div className="row-wrap">
      {d.classes.map((c) => (
        <span key={c} className="class-chip" style={{ color: CLASSES[c].color, borderColor: CLASSES[c].color }}>
          {CLASSES[c].name} {d.classLevels[c]}
        </span>
      ))}
    </div>
  );
}

/** Excluir ficha sempre passa por um modal de confirmação. */
export function DeleteCharacterButton({ ch, className = 'btn btn-danger btn-sm', children }: { ch: Character; className?: string; children?: ReactNode }) {
  const { act } = useAct();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{children ?? <><X size={14} /> Excluir</>}</button>
      {open && (
        <ConfirmModal title="Excluir ficha" confirmLabel={`Excluir ${ch.name}`} onClose={() => setOpen(false)}
          onConfirm={async () => (await act({ type: 'character/delete', characterId: ch.id }, 'Ficha excluída.')).ok}>
          <p>Excluir a ficha de <strong>{ch.name}</strong>{ch.kind === 'npc' ? ' (NPC)' : ''}?</p>
          <p className="small muted mt">Atributos, níveis, inventário, ouro e anotações serão apagados. Não dá para desfazer.</p>
        </ConfirmModal>
      )}
    </>
  );
}

export default function CharacterSheet({ ch, ownerName }: { ch: Character; ownerName?: string }) {
  const { role } = useAct();
  const d = deriveStats(ch);
  const isGm = role === 'gm';
  const readOnly = ch.status !== 'approved';

  return (
    <div className="sheet">
      <div className="card card-gold">
        <div className="sheet-head">
          <div className="grow">
            <div className="sheet-title">{d.title} · Nível {d.level}</div>
            <h2 className="sheet-name">{ch.name}</h2>
            {ch.concept && <div className="secondary">{ch.concept}</div>}
            <div className="row-wrap mt">
              <ClassChips ch={ch} />
              <StatusBadge status={ch.status} />
              {ch.kind === 'npc' && <span className="badge badge-gold">NPC</span>}
              {ownerName && <span className="tiny muted">Jogador: {ownerName}</span>}
            </div>
          </div>
          {isGm && <GmControls ch={ch} />}
        </div>
        {ch.status === 'rejected' && ch.rejectReason && (
          <p className="small mt" style={{ color: '#f2a3a8' }}>Motivo: {ch.rejectReason}</p>
        )}
      </div>

      <div className="stats">
        <div className="stat" title={d.breakdown.def.join('\n')}><span className="stat-val">{d.def}</span><span className="stat-lbl">Defesa</span></div>
        <div className="stat" title="10 + FÉ"><span className="stat-val">{d.von}</span><span className="stat-lbl">Vontade</span></div>
        <div className="stat" title={['Redução de dano contra dano físico', ...d.breakdown.rdPhysical].join('\n')}><span className="stat-val">{d.rdPhysical}</span><span className="stat-lbl">RD física</span></div>
        <div className="stat" title={['Redução de dano contra dano mágico', ...d.breakdown.rdMagic].join('\n')}><span className="stat-val">{d.rdMagic}</span><span className="stat-lbl">RD mágica</span></div>
        <div className="stat" title="Distância percorrida num movimento">
          <span className="stat-val">{ch.movement ?? DEFAULT_MOVEMENT}<span className="stat-unit">m</span></span>
          <span className="stat-lbl"><Footprints size={11} /> Deslocamento</span>
        </div>
        <div className="stat" title="+1 em todos os testes a cada nível par"><span className="stat-val">{fmtMod(d.testBonus)}</span><span className="stat-lbl">Bônus de teste</span></div>
      </div>

      <Vitals ch={ch} d={d} readOnly={readOnly} />
      <AttributesCard ch={ch} d={d} readOnly={readOnly} />
      <AbilitiesPanel ch={ch} d={d} readOnly={readOnly} />
      <Inventory ch={ch} readOnly={readOnly} />
      <Notes ch={ch} readOnly={readOnly && !isGm} />
    </div>
  );
}

/** Atributos com teste de d20 num toque (também usado nos atalhos de combate). */
export function AttributesCard({ ch, d, readOnly }: { ch: Character; d: Derived; readOnly?: boolean }) {
  const { act } = useAct();
  const rollAttr = async (attr: (typeof ATTR_KEYS)[number]) => {
    const fx = startRollFx({ who: ch.name, attr, expr: 'd20' });
    const r = await act({ type: 'roll', characterId: ch.id, attr, expr: 'd20' });
    if (!r.ok) cancelRollFx(fx);
  };

  return (
    <div className="card">
      <div className="row mb">
        <div className="card-title" style={{ margin: 0 }}>Atributos</div>
        <div className="spacer" />
        {!readOnly && <span className="tiny muted"><Dices size={12} style={{ verticalAlign: -2 }} /> Toque para rolar d20 + teste</span>}
      </div>
      <div className="attrs">
        {ATTR_KEYS.map((k) => {
          const content = (
            <>
              <span className="attr-key">{ATTRIBUTES[k].short}</span>
              <span className="attr-val">{fmtMod(ch.attributes[k])}</span>
              <span className="attr-test">teste {fmtMod(testModifier(ch, k))}</span>
            </>
          );
          return readOnly ? (
            <div key={k} className="attr" title={ATTRIBUTES[k].description}>{content}</div>
          ) : (
            <button key={k} className="attr" title={`${ATTRIBUTES[k].name}: ${ATTRIBUTES[k].description}`} onClick={() => rollAttr(k)}>{content}</button>
          );
        })}
      </div>
      {d.damageAttrs.length > 0 && <p className="tiny muted mt">Violência: some FOR ({fmtMod(ch.attributes.FOR)}) ao dano final dos golpes.</p>}
    </div>
  );
}

function Notes({ ch, readOnly }: { ch: Character; readOnly?: boolean }) {
  const { act } = useAct();
  const [text, setText] = useState(ch.notes);
  useEffect(() => setText(ch.notes), [ch.id, ch.notes]);
  const dirty = text !== ch.notes;
  return (
    <div className="card">
      <div className="row mb">
        <div className="card-title" style={{ margin: 0 }}><NotebookPen size={14} /> Anotações</div>
        <div className="spacer" />
        {!readOnly && dirty && (
          <ActButton perm="notes_update" className="btn btn-sm btn-primary"
            onClick={() => act({ type: 'notes/update', characterId: ch.id, notes: text }, 'Anotações salvas.')}>Salvar</ActButton>
        )}
      </div>
      {readOnly ? (
        <div className="pre secondary small">{ch.notes || <span className="muted">Sem anotações.</span>}</div>
      ) : (
        <textarea className="textarea" value={text} maxLength={LIMITS.notes} onChange={(e) => setText(e.target.value)}
          placeholder="História, aparência, pistas, contatos..." />
      )}
    </div>
  );
}

function GmControls({ ch }: { ch: Character }) {
  const { act } = useAct();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [lossOpen, setLossOpen] = useState(false);
  const [lossPv, setLossPv] = useState(String(ch.permanentLoss.pv));
  const [lossPe, setLossPe] = useState(String(ch.permanentLoss.pe));
  const [rdP, setRdP] = useState(String(ch.rdBonus?.physical ?? 0));
  const [rdM, setRdM] = useState(String(ch.rdBonus?.magic ?? 0));
  const [mov, setMov] = useState(String(ch.movement ?? DEFAULT_MOVEMENT));
  const num = (v: string) => v.replace(/[^\d-]/g, '').replace(/(?!^)-/g, '');

  if (ch.status !== 'approved') {
    return (
      <div className="col" style={{ minWidth: 220 }}>
        {!rejecting ? (
          <div className="row-wrap">
            <button className="btn btn-primary btn-sm" onClick={() => act({ type: 'character/approve', characterId: ch.id }, 'Ficha aprovada.')}><Check size={14} /> Aprovar</button>
            {ch.status === 'pending' && <button className="btn btn-sm" onClick={() => setRejecting(true)}><Undo2 size={14} /> Devolver</button>}
            <DeleteCharacterButton ch={ch} />
          </div>
        ) : (
          <div className="col">
            <input className="input" placeholder="O que ajustar?" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} autoFocus />
            <div className="row">
              <button className="btn btn-sm" onClick={() => setRejecting(false)}>Cancelar</button>
              <button className="btn btn-sm btn-danger" onClick={async () => { await act({ type: 'character/reject', characterId: ch.id, reason }, 'Ficha devolvida.'); setRejecting(false); }}>Devolver</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="col" style={{ alignItems: 'flex-end' }}>
      <div className="row-wrap">
        {ch.kind === 'npc' && (
          <button className={`btn btn-sm${ch.visible ? ' btn-primary' : ''}`} title="Mostrar nome e conceito aos jogadores"
            onClick={() => act({ type: 'npc/visibility', characterId: ch.id, visible: !ch.visible })}>
            {ch.visible ? <Eye size={14} /> : <EyeOff size={14} />} {ch.visible ? 'Visível' : 'Oculto'}
          </button>
        )}
        <button className="btn btn-sm btn-ghost" onClick={() => setLossOpen(!lossOpen)} title="Perda permanente de PV/PE, RD extra e deslocamento"><Skull size={14} /> Ajustes</button>
        <DeleteCharacterButton ch={ch} />
      </div>
      {lossOpen && (
        <div className="row-wrap">
          <label className="small secondary">PV <input className="input" style={{ width: 70 }} value={lossPv} onChange={(e) => setLossPv(e.target.value.replace(/[^\d]/g, ''))} /></label>
          <label className="small secondary">PE <input className="input" style={{ width: 70 }} value={lossPe} onChange={(e) => setLossPe(e.target.value.replace(/[^\d]/g, ''))} /></label>
          <label className="small secondary" title="RD física extra">RD fís. <input className="input" style={{ width: 64 }} value={rdP} onChange={(e) => setRdP(num(e.target.value))} /></label>
          <label className="small secondary" title="RD mágica extra">RD mág. <input className="input" style={{ width: 64 }} value={rdM} onChange={(e) => setRdM(num(e.target.value))} /></label>
          <label className="small secondary" title="Deslocamento em metros">Desl. <input className="input" style={{ width: 64 }} value={mov} onChange={(e) => setMov(e.target.value.replace(/[^\d]/g, ''))} /> m</label>
          <button className="btn btn-sm btn-primary" onClick={async () => {
            const a = await act({ type: 'character/permanentLoss', characterId: ch.id, pv: parseInt(lossPv, 10) || 0, pe: parseInt(lossPe, 10) || 0 });
            const b = await act({ type: 'character/rdBonus', characterId: ch.id, physical: parseInt(rdP, 10) || 0, magic: parseInt(rdM, 10) || 0 });
            const c = await act({ type: 'character/movement', characterId: ch.id, movement: parseInt(mov, 10) || 0 }, 'Ajustes salvos.');
            if (a.ok && b.ok && c.ok) setLossOpen(false);
          }}>Salvar</button>
        </div>
      )}
    </div>
  );
}
