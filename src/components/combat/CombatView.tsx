// Combate visto pelo jogador: a ordem (sem números dos outros), de quem é a vez,
// atalhos da própria ficha e o botão de encerrar o turno.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Hourglass, Play, Swords } from 'lucide-react';
import type { PlayerCombat, PlayerCombatant, PlayerView } from '../../model/types';
import { deriveStats } from '../../rules/derive';
import { useAct } from '../act';
import { dismissTag, notify } from '../common/toast';
import Vitals from '../sheet/Vitals';
import AbilitiesPanel from '../sheet/AbilitiesPanel';
import { AttributesCard } from '../sheet/CharacterSheet';
import { ConditionChips, HealthBadge, pct, sideClass, useTopbarHeight } from './common';

const OUT = ['abatido', 'inconsciente', 'morto'];

/** Quem vem depois do atual, pulando quem caiu (pelo que o jogador enxerga). */
function nextVisible(c: PlayerCombat): PlayerCombatant | undefined {
  const i = c.order.findIndex((x) => x.id === c.turnId);
  if (i < 0) return undefined;
  for (let k = 1; k < c.order.length; k++) {
    const x = c.order[(i + k) % c.order.length];
    if (!OUT.includes(x.health)) return x;
  }
  return undefined;
}

export function myTurnIn(view: PlayerView): PlayerCombatant | undefined {
  const c = view.combat;
  const t = c?.order.find((x) => x.id === c.turnId);
  return t?.mine ? t : undefined;
}

/**
 * Avisos do combate: abriu, começou e, principalmente, "sua vez" (com vibração
 * no celular). `onCombatTab` evita aviso repetido com a tela de combate aberta.
 */
export function useCombatAlerts(view: PlayerView | null, onCombatTab: boolean, open: () => void) {
  const prev = useRef<{ exists: boolean; round: number; turnId: string | null } | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!view) return;
    const c = view.combat;
    const now = { exists: !!c, round: c?.round ?? 0, turnId: c?.turnId ?? null };
    const before = prev.current;
    prev.current = now;
    if (!before) return; // primeira renderização: não avisa o que já estava assim

    const action = [{ label: 'Abrir combate', className: 'btn btn-sm btn-primary', run: () => openRef.current() }];
    if (!before.exists && now.exists && !onCombatTab) {
      notify({ kind: 'info', title: <><Swords size={13} /> Combate!</>, text: 'O mestre abriu a fila de combate.', actions: action, duration: 6000, tag: 'combat' });
    } else if (before.round === 0 && now.round > 0 && !onCombatTab) {
      notify({ kind: 'info', title: <><Swords size={13} /> O combate começou</>, text: 'Rodada 1.', actions: action, duration: 5000, tag: 'combat' });
    }

    const mine = myTurnIn(view);
    if (mine && now.turnId !== before.turnId) {
      try { navigator.vibrate?.([140, 70, 140]); } catch { /* sem vibração */ }
      if (!onCombatTab) {
        notify({ kind: 'ok', title: <><Play size={13} /> Sua vez!</>, text: `${mine.name} age agora.`, actions: action, duration: 0, tag: 'combat-turn' });
      }
    }
    if (!mine) dismissTag('combat-turn');
    if (!now.exists) dismissTag('combat');
  }, [view, onCombatTab]);
}

export default function CombatView({ view }: { view: PlayerView }) {
  const { act } = useAct();
  const root = useRef<HTMLDivElement>(null);
  useTopbarHeight(root);
  const c = view.combat!;
  const started = c.round > 0;
  const turn = c.order.find((x) => x.id === c.turnId);
  const mine = turn?.mine ? turn : undefined;
  const upNext = nextVisible(c);
  const myInCombat = c.order.filter((x) => x.mine);

  const approved = view.myCharacters.filter((ch) => ch.status === 'approved');
  const [pick, setPick] = useState<string | null>(null);
  const activeId = mine?.characterId ?? pick ?? myInCombat[0]?.characterId ?? approved[0]?.id;
  const ch = view.myCharacters.find((x) => x.id === activeId);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);

  // Na sua vez, os atalhos abrem sozinhos.
  useEffect(() => { if (mine) setOpen(true); }, [mine?.id]);

  const endTurn = async () => {
    if (!mine || busy) return;
    setBusy(true);
    await act({ type: 'combat/endTurn', combatantId: mine.id });
    setBusy(false);
  };

  const d = ch ? deriveStats(ch) : undefined;
  const choices = myInCombat.length > 1 ? myInCombat : [];

  return (
    <div className="combat combat-player" ref={root}>
      <div className={`combat-bar${mine ? ' combat-bar-mine' : ''}`}>
        <div className="combat-round" aria-label={started ? `Rodada ${c.round}` : 'Preparando'}>
          <span className="combat-round-lbl">{started ? 'Rodada' : 'Preparo'}</span>
          <span className="combat-round-num">{started ? c.round : '—'}</span>
        </div>
        <div className="combat-now grow" aria-live="polite">
          {!started ? (
            <><div className="combat-now-who"><strong>O combate vai começar</strong></div><div className="tiny muted">O mestre está montando a ordem.</div></>
          ) : mine ? (
            <><div className="combat-now-who combat-now-mine">Sua vez, <strong>{mine.name}</strong>!</div><div className="tiny muted">{upNext ? `Depois: ${upNext.name}` : ''}</div></>
          ) : (
            <>
              <div className="combat-now-who"><span className="tiny muted">Vez de</span> <strong>{turn?.name ?? 'alguém nas sombras'}</strong></div>
              <div className="tiny muted">
                {upNext?.mine ? <span className="gold"><Hourglass size={11} /> Você é o próximo ({upNext.name}) — prepare-se</span> : upNext ? `A seguir: ${upNext.name}` : ''}
              </div>
            </>
          )}
        </div>
        {mine && (
          <button className="btn btn-primary combat-endturn" disabled={busy} onClick={() => void endTurn()}>
            Encerrar meu turno
          </button>
        )}
      </div>

      <div className="combat-player-grid">
        <section className="col">
          <div className="card-title" style={{ margin: 0 }}>Ordem de combate</div>
          {c.order.length === 0 && <div className="empty">Ninguém na fila ainda.</div>}
          <ol className="cbt-list">
            {c.order.map((x) => {
              const isTurn = x.id === c.turnId;
              const own = x.mine ? view.myCharacters.find((m) => m.id === x.characterId) : undefined;
              const od = own ? deriveStats(own) : undefined;
              return (
                <li key={x.id} className={['cbt-row cbt-readonly', sideClass(x.side), isTurn && 'cbt-current', OUT.includes(x.health) && 'cbt-down', x.mine && 'cbt-mine'].filter(Boolean).join(' ')}>
                  <div className="cbt-main">
                    <div className="row cbt-head">
                      {isTurn && <Play size={12} className="gold cbt-play" fill="currentColor" />}
                      <strong className="cbt-name">{x.name}</strong>
                      {x.mine && <span className="cbt-tag cbt-tag-you">você</span>}
                      {x.id === upNext?.id && started && <span className="cbt-tag">a seguir</span>}
                      <span className="spacer" />
                      {own && od ? <span className="tiny mono pv">{own.current.pv}/{od.pvMax} PV</span> : <HealthBadge health={x.health} />}
                    </div>
                    {own && od && <div className="bar bar-pv cbt-bar"><div style={{ width: pct(own.current.pv, od.pvMax) }} /></div>}
                    {x.conditions.length > 0 && <div className="cbt-sub"><ConditionChips conditions={x.conditions} /></div>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="col">
          {ch && d ? (
            <>
              <button className="combat-quick-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                <span className="grow">
                  <span className="card-title" style={{ margin: 0 }}>{mine ? 'Seu turno' : 'Sua ficha'}</span>
                  <span className="tiny muted"> · {ch.name}</span>
                </span>
                {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {choices.length > 0 && !mine && (
                <div className="row-wrap">
                  {choices.map((x) => (
                    <button key={x.id} className={`btn btn-sm${x.characterId === activeId ? ' btn-primary' : ''}`} onClick={() => setPick(x.characterId!)}>{x.name}</button>
                  ))}
                </div>
              )}
              {open && (
                <div className="col gap-lg">
                  <Vitals ch={ch} d={d} readOnly={ch.status !== 'approved'} />
                  <AttributesCard ch={ch} d={d} readOnly={ch.status !== 'approved'} />
                  <AbilitiesPanel ch={ch} d={d} readOnly={ch.status !== 'approved'} />
                </div>
              )}
            </>
          ) : (
            <div className="empty">Você não tem personagem aprovado neste combate.</div>
          )}
        </section>
      </div>

      {mine && (
        <div className="combat-endturn-fab">
          <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => void endTurn()}>
            Encerrar o turno de {mine.name}
          </button>
        </div>
      )}
    </div>
  );
}
