import { useEffect, useRef, useState } from 'react';
import { Dices, EyeOff, Trash2 } from 'lucide-react';
import type { AttrKey } from '../rules/attributes';
import { ATTR_KEYS, ATTRIBUTES } from '../rules/attributes';
import type { Character, LogEntry, Threat } from '../model/types';
import { useAct } from './act';
import ConfirmButton from './common/ConfirmButton';

function time(at: number) {
  return new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function Entry({ e }: { e: LogEntry }) {
  if (e.roll) {
    const r = e.roll;
    const d20 = r.dice.length === 1 && r.dice[0].sides === 20 ? r.dice[0].value : null;
    const vs = r.target !== undefined ? (r.total > r.target ? 'acerto' : 'falha') : null;
    return (
      <div className={`log-entry${e.hidden ? ' hidden-roll' : ''}`}>
        <div className="row">
          <div className={`roll-total${d20 === 20 ? ' crit' : d20 === 1 ? ' fumble' : ''}`}>{r.total}</div>
          <div className="grow">
            <div><strong>{e.characterName ?? e.actorName}</strong> <span className="secondary">{e.text}</span></div>
            <div className="roll-dice">
              [{r.dice.map((x) => `${x.value < 0 ? '−' : ''}${Math.abs(x.value)}`).join(', ')}]
              {r.modifier ? ` ${r.modifier > 0 ? '+' : '−'} ${Math.abs(r.modifier)}` : ''}
              {r.target !== undefined && <> · alvo {r.target} → <strong className={vs === 'acerto' ? 'crit' : 'fumble'}>{vs}</strong></>}
            </div>
          </div>
          <div className="log-meta">{e.hidden && <EyeOff size={12} />}{time(e.at)}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="log-entry">
      <div className="row">
        <div className="grow"><strong>{e.actorName}</strong> <span className="secondary">{e.text}</span></div>
        <div className="log-meta">{time(e.at)}</div>
      </div>
    </div>
  );
}

export default function LogPanel({ log, characters, threats = [] }: { log: LogEntry[]; characters: Character[]; threats?: Threat[] }) {
  const { act, role } = useAct();
  const approved = characters.filter((c) => c.status === 'approved');
  // Valor do seletor: "c:<id>" (ficha) ou "t:<id>" (ameaça).
  const [who, setWho] = useState<string>(approved[0] ? `c:${approved[0].id}` : '');
  const charId = who.startsWith('c:') ? who.slice(2) : '';
  const threatId = who.startsWith('t:') ? who.slice(2) : '';
  const [attr, setAttr] = useState<AttrKey | ''>('');
  const [expr, setExpr] = useState('d20');
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState('');
  const [hidden, setHidden] = useState(false);
  const [filter, setFilter] = useState<'all' | 'roll'>('all');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (charId && !approved.some((c) => c.id === charId)) setWho(approved[0] ? `c:${approved[0].id}` : '');
    if (threatId && !threats.some((t) => t.id === threatId)) setWho('');
  }, [approved, threats, charId, threatId]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [log.length]);

  const roll = () => act({
    type: 'roll',
    expr: expr.trim() || 'd20',
    characterId: charId || undefined,
    threatId: threatId || undefined,
    attr: attr || undefined,
    label: label.trim() || undefined,
    target: target ? parseInt(target, 10) : undefined,
    hidden,
  });

  const shown = filter === 'roll' ? log.filter((e) => e.kind === 'roll') : log;

  return (
    <div className="split" style={{ gridTemplateColumns: 'minmax(0, 340px) 1fr' }}>
      <div className="card">
        <div className="card-title"><Dices size={14} /> Rolar dados</div>
        <div className="col gap-lg">
          <div className="field">
            <label className="label">Personagem</label>
            <select className="select" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">{role === 'gm' ? 'Mestre (sem ficha)' : 'Sem ficha'}</option>
              {approved.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}{c.kind === 'npc' ? ' (NPC)' : ''}</option>)}
              {threats.length > 0 && (
                <optgroup label="Ameaças">
                  {threats.map((t) => <option key={t.id} value={`t:${t.id}`}>{t.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div className="grid-2">
            <div className="field">
              <label className="label">Teste de atributo</label>
              <select className="select" value={attr} disabled={!who} onChange={(e) => setAttr(e.target.value as AttrKey | '')}>
                <option value="">Nenhum</option>
                {ATTR_KEYS.map((k) => <option key={k} value={k}>{ATTRIBUTES[k].name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Dados</label>
              <input className="input" value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="d20, 2d6+3" />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label className="label">Rótulo</label>
              <input className="input" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Ataque, dano..." />
            </div>
            <div className="field">
              <label className="label">Alvo (DEF/VON/CD)</label>
              <input className="input" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d]/g, ''))} />
            </div>
          </div>
          <label className="check"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
            {role === 'gm' ? 'Rolagem oculta' : 'Só para o mestre ver'}</label>
          <button className="btn btn-primary btn-block" onClick={roll}><Dices size={16} /> Rolar</button>
          <p className="tiny muted">Para acertar, o resultado precisa superar o alvo: DEF 12 × 12 falha, × 13 acerta.</p>
        </div>
      </div>
      <div className="card">
        <div className="row mb">
          <div className="card-title" style={{ margin: 0 }}>Registro</div>
          <div className="spacer" />
          <div className="seg">
            <button className={filter === 'all' ? 'on-inherit' : ''} onClick={() => setFilter('all')}>Tudo</button>
            <button className={filter === 'roll' ? 'on-inherit' : ''} onClick={() => setFilter('roll')}>Rolagens</button>
          </div>
          {role === 'gm' && (
            <ConfirmButton className="btn btn-sm btn-ghost" onConfirm={() => act({ type: 'log/clear' }, 'Registro limpo.')}><Trash2 size={13} /></ConfirmButton>
          )}
        </div>
        {shown.length === 0 && <div className="empty">Nada por aqui ainda.</div>}
        <div className="log">
          {shown.map((e) => <Entry key={e.id} e={e} />)}
          <div ref={end} />
        </div>
      </div>
    </div>
  );
}
