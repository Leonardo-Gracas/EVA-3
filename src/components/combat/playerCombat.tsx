// Combate visto pelo jogador: a fila numa faixa compacta, sempre à vista (no mapa e nas
// outras abas), de quem é a vez, quem vem a seguir e o botão de encerrar o turno.
// Dos outros, só o estado descritivo (nunca números).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Play, Swords } from 'lucide-react';
import type { PlayerCombat, PlayerCombatant, PlayerMapToken, PlayerView } from '../../model/types';
import { HEALTH_LABELS } from '../../store/combat';
import { useAct } from '../act';
import { dismissTag, notify } from '../common/toast';
import Avatar from '../common/Avatar';
import { ThreatGlyph } from '../gm/ThreatIcon';

/** Fora da luta: a fila pula e mostra riscado. */
export const OUT = ['abatido', 'inconsciente', 'morto'];

/** Quem vem depois do atual, pulando quem caiu (pelo que o jogador enxerga). */
export function nextVisible(c: PlayerCombat): PlayerCombatant | undefined {
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

/** "Goblin 1 · Ferido · Atordoado (2)": o que o jogador sabe de alguém da fila. */
export function describeCombatant(x: PlayerCombatant, c: PlayerCombat): string {
  const parts = [x.name, HEALTH_LABELS[x.health].label];
  if (x.id === c.turnId) parts.push('na vez');
  for (const k of x.conditions) parts.push(k.rounds === null ? k.name : `${k.name} (${k.rounds})`);
  return parts.join(' · ');
}

/**
 * Avisos do combate: abriu, começou e, principalmente, "sua vez" (com vibração
 * no celular). `quiet`: a tela aberta já mostra o turno, então só vibra.
 */
export function useCombatAlerts(view: PlayerView | null, quiet: boolean, open: () => void, openLabel: string) {
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

    const action = [{ label: openLabel, className: 'btn btn-sm btn-primary', run: () => openRef.current() }];
    if (!before.exists && now.exists && !quiet) {
      notify({ kind: 'info', title: <><Swords size={13} /> Combate!</>, text: 'O mestre abriu a fila de combate.', actions: action, duration: 6000, tag: 'combat' });
    } else if (before.round === 0 && now.round > 0 && !quiet) {
      notify({ kind: 'info', title: <><Swords size={13} /> O combate começou</>, text: 'Rodada 1.', actions: action, duration: 5000, tag: 'combat' });
    }

    const mine = myTurnIn(view);
    if (mine && now.turnId !== before.turnId) {
      try { navigator.vibrate?.([140, 70, 140]); } catch { /* sem vibração */ }
      if (!quiet) {
        notify({ kind: 'ok', title: <><Play size={13} /> Sua vez!</>, text: `${mine.name} age agora.`, actions: action, duration: 0, tag: 'combat-turn' });
      }
    }
    if (!mine) dismissTag('combat-turn');
    if (!now.exists) dismissTag('combat');
  }, [view, quiet, openLabel]);
}

/** Botão de encerrar o próprio turno (o id evita pular o turno de outro num toque duplo). */
export function EndTurnButton({ mine, className = 'btn btn-primary', children }: {
  mine: PlayerCombatant; className?: string; children?: ReactNode;
}) {
  const { act } = useAct();
  const [busy, setBusy] = useState(false);
  return (
    <button className={className} disabled={busy} onClick={async () => {
      setBusy(true);
      await act({ type: 'combat/endTurn', combatantId: mine.id });
      setBusy(false);
    }}>
      {children ?? 'Encerrar turno'}
    </button>
  );
}

/**
 * Fila do combate em faixa: rodada, de quem é a vez e quem vem a seguir, e os retratos na ordem.
 * Tocar num retrato diz o estado e as condições; com `onPick` (no mapa), também leva até o token.
 * `endTurn`: mostra o botão de encerrar na própria vez.
 */
export function CombatStrip({ combat, tokens, onPick, endTurn }: {
  combat: PlayerCombat; tokens?: PlayerMapToken[]; onPick?: (x: PlayerCombatant) => void; endTurn?: boolean;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const started = combat.round > 0;
  const turn = combat.order.find((x) => x.id === combat.turnId);
  const mine = turn?.mine ? turn : undefined;
  const upNext = started ? nextVisible(combat) : undefined;

  // A vez sempre à vista na faixa (rola só a faixa, não a página).
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('.pq-item.on');
    if (!list || !el) return;
    const left = el.offsetLeft - list.clientWidth / 2 + el.offsetWidth / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [combat.turnId, combat.order.length]);

  const pick = (x: PlayerCombatant) => {
    notify({ kind: 'info', text: describeCombatant(x, combat), tag: 'combat-who', duration: 3500 });
    onPick?.(x);
  };

  return (
    <div className={`pq${mine ? ' pq-mine' : ''}`}>
      <div className="pq-status" aria-live="polite">
        <span className="pq-round" aria-label={started ? `Rodada ${combat.round}` : 'Preparando'}>
          <Swords size={12} /> {started ? `R${combat.round}` : '—'}
        </span>
        <span className="pq-now">
          {!started ? (
            <>O combate vai começar <span className="muted">· o mestre está montando a ordem</span></>
          ) : mine ? (
            <span className="gold">Sua vez, <strong>{mine.name}</strong>!{upNext ? <span className="muted"> · depois: {upNext.name}</span> : null}</span>
          ) : (
            <>
              <span className="muted">Vez de</span> <strong>{turn?.name ?? 'alguém nas sombras'}</strong>
              {upNext?.mine
                ? <span className="gold"> · você é o próximo</span>
                : upNext ? <span className="muted"> · a seguir: {upNext.name}</span> : null}
            </>
          )}
        </span>
        {endTurn && mine && <EndTurnButton mine={mine} className="btn btn-sm btn-primary pq-end" />}
      </div>
      {combat.order.length > 0 && (
        <ol className="pq-list" ref={listRef} aria-label="Ordem de combate">
          {combat.order.map((x, i) => {
            const isTurn = x.id === combat.turnId;
            const tok = tokens?.find((t) => t.combatantId === x.id || (x.mine && !!x.characterId && t.characterId === x.characterId));
            const down = OUT.includes(x.health);
            const next = x.id === upNext?.id;
            const label = `${i + 1}. ${x.name}${x.mine ? ' (você)' : ''}${isTurn ? ', na vez' : next ? ', a seguir' : ''}${down ? `, ${HEALTH_LABELS[x.health].label.toLowerCase()}` : ''}`;
            return (
              <li key={x.id}>
                <button type="button" onClick={() => pick(x)} aria-label={label} title={label}
                  className={['pq-item', `side-${x.side}`, isTurn && 'on', x.mine && 'mine', down && 'down', next && 'next', tokens && !tok && 'off-map'].filter(Boolean).join(' ')}>
                  <span className="pq-pic">
                    {x.avatar
                      ? <Avatar config={x.avatar} size={30} />
                      : x.category
                        ? <span className={`map-token-threat threat-cat-${x.category}`}><ThreatGlyph category={x.category} size={15} /></span>
                        : <span className="pq-initial">{x.name.slice(0, 1).toUpperCase()}</span>}
                    {isTurn && <span className="pq-play"><Play size={9} fill="currentColor" /></span>}
                    {x.conditions.length > 0 && <span className="pq-conds">{x.conditions.length}</span>}
                  </span>
                  <span className="pq-name">{x.name}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
