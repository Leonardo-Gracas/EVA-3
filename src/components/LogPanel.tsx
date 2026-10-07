import { useEffect, useId, useRef, useState } from 'react';
import { Dices, EyeOff, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { AttrKey } from '../rules/attributes';
import { ATTR_KEYS, ATTRIBUTES } from '../rules/attributes';
import type { Character, LogEntry, Threat } from '../model/types';
import { useAct } from './act';
import ConfirmButton from './common/ConfirmButton';
import { cancelRollFx, startRollFx } from './RollFx';

const QUICK_DICE = ['d20', 'd4', 'd6', 'd8', 'd10', 'd12', 'd100'];

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
              {e.secret ? <strong className={d20 === 20 ? 'crit' : 'fumble'}>{d20 === 20 ? 'crítico!' : 'falha crítica'}</strong> : <>
                [{r.dice.map((x) => `${x.value < 0 ? '−' : ''}${Math.abs(x.value)}`).join(', ')}]
                {r.modifier ? ` ${r.modifier > 0 ? '+' : '−'} ${Math.abs(r.modifier)}` : ''}
              </>}
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
  const [more, setMore] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const firstScroll = useRef(true);
  const uid = useId();

  useEffect(() => {
    if (charId && !approved.some((c) => c.id === charId)) setWho(approved[0] ? `c:${approved[0].id}` : '');
    if (threatId && !threats.some((t) => t.id === threatId)) setWho('');
  }, [approved, threats, charId, threatId]);

  const roll = async () => {
    const e = expr.trim() || 'd20';
    const name = charId ? approved.find((c) => c.id === charId)?.name : threats.find((t) => t.id === threatId)?.name;
    const fx = startRollFx({ who: name, attr: attr || undefined, label: label.trim() || undefined, expr: e });
    const r = await act({
      type: 'roll',
      expr: e,
      characterId: charId || undefined,
      threatId: threatId || undefined,
      attr: attr || undefined,
      label: label.trim() || undefined,
      target: target ? parseInt(target, 10) : undefined,
      hidden,
    });
    if (!r.ok) cancelRollFx(fx);
  };

  const shown = filter === 'roll' ? log.filter((e) => e.kind === 'roll') : log;
  const extras = [attr, label, target, hidden].filter(Boolean).length;

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight + 1) {
      // Painel com rolagem própria (telas largas).
      el.scrollTop = el.scrollHeight;
    } else if (window.matchMedia('(max-width: 900px)').matches) {
      // No celular quem rola é a página: só desce se já estava perto do fim.
      const doc = document.documentElement;
      const nearEnd = doc.scrollHeight - window.scrollY - window.innerHeight < 240;
      if (firstScroll.current || nearEnd) window.scrollTo({ top: doc.scrollHeight, behavior: firstScroll.current ? 'auto' : 'smooth' });
    }
    firstScroll.current = false;
  }, [shown.length]);

  return (
    <div className="dice-panel">
      <div className="card dice-composer">
        <div className="card-title dice-composer-title"><Dices size={14} /> Rolar dados</div>
        <div className="dice-chips" role="group" aria-label="Dados rápidos">
          {QUICK_DICE.map((d) => (
            <button key={d} type="button" className={`dice-chip${expr.trim() === d ? ' on' : ''}`} aria-pressed={expr.trim() === d} onClick={() => setExpr(d)}>{d}</button>
          ))}
        </div>
        <div className="dice-main">
          <div className="field">
            <label className="label" htmlFor={`${uid}-who`}>Personagem</label>
            <select id={`${uid}-who`} className="select" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">{role === 'gm' ? 'Mestre (sem ficha)' : 'Sem ficha'}</option>
              {approved.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}{c.kind === 'npc' ? ' (NPC)' : ''}</option>)}
              {threats.length > 0 && (
                <optgroup label="Ameaças">
                  {threats.map((t) => <option key={t.id} value={`t:${t.id}`}>{t.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor={`${uid}-expr`}>Dados</label>
            <input id={`${uid}-expr`} className="input" value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="2d6+3"
              autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="go" onKeyDown={(e) => { if (e.key === 'Enter') void roll(); }} />
          </div>
        </div>
        <div className={`dice-more${more ? ' open' : ''}`} id={`${uid}-more`}>
          <div className="grid-2">
            <div className="field">
              <label className="label" htmlFor={`${uid}-attr`}>Teste de atributo</label>
              <select id={`${uid}-attr`} className="select" value={attr} disabled={!who} onChange={(e) => setAttr(e.target.value as AttrKey | '')}>
                <option value="">Nenhum</option>
                {ATTR_KEYS.map((k) => <option key={k} value={k}>{ATTRIBUTES[k].name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor={`${uid}-target`}>Alvo (DEF/VON/CD)</label>
              <input id={`${uid}-target`} className="input" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d]/g, ''))} />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor={`${uid}-label`}>Rótulo</label>
            <input id={`${uid}-label`} className="input" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Ataque, dano..." />
          </div>
          <label className="check"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
            {role === 'gm' ? 'Rolagem oculta' : 'Só para o mestre ver'}</label>
          <p className="tiny muted">Para acertar, o resultado precisa superar o alvo: DEF 12 × 12 falha, × 13 acerta.</p>
        </div>
        <div className="dice-actions">
          <button type="button" className="btn btn-ghost dice-more-toggle" aria-expanded={more} aria-controls={`${uid}-more`} onClick={() => setMore(!more)}>
            <SlidersHorizontal size={15} /> {more ? 'Menos' : 'Opções'}{extras > 0 && <span className="count">{extras}</span>}
          </button>
          <button className="btn btn-primary dice-roll" onClick={roll}><Dices size={16} /> Rolar {expr.trim() || 'd20'}</button>
        </div>
      </div>
      <div className="card dice-log">
        <div className="row mb">
          <div className="card-title" style={{ margin: 0 }}>Registro</div>
          <div className="spacer" />
          <div className="seg">
            <button className={filter === 'all' ? 'on-inherit' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Tudo</button>
            <button className={filter === 'roll' ? 'on-inherit' : ''} aria-pressed={filter === 'roll'} onClick={() => setFilter('roll')}>Rolagens</button>
          </div>
          {role === 'gm' && (
            <ConfirmButton className="btn btn-sm btn-ghost" title="Limpar registro" modalTitle="Limpar registro" confirmLabel="Limpar registro"
              message={<><p>Apagar todas as entradas do registro?</p><p className="small muted mt">Rolagens e mensagens somem para todos na mesa. Não dá para desfazer.</p></>}
              onConfirm={() => act({ type: 'log/clear' }, 'Registro limpo.')}><Trash2 size={13} /></ConfirmButton>
          )}
        </div>
        {shown.length === 0 && <div className="empty">Nada por aqui ainda. Suas rolagens aparecem aqui.</div>}
        <div className="log" ref={list} aria-live="polite">
          {shown.map((e) => <Entry key={e.id} e={e} />)}
        </div>
      </div>
    </div>
  );
}
