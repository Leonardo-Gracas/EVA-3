// Leitura da fila de combate: resolve cada combatente na ficha ou ameaça que
// ele representa. Usado pelo motor, pela visão do jogador e pela tela do mestre.
import type {
  Character, Combat, Combatant, CombatCondition, CombatHealth, CombatSide, CombatThreat, GroupDamageOp, TableState,
} from '../model/types';
import { conditionOf, deriveStats } from '../rules/derive';

export interface CombatantInfo {
  name: string;
  side: CombatSide;
  pv: number;
  pvMax: number;
  /** Menor PV possível (PV de morte da ficha; ameaças não têm). */
  pvMin: number;
  pe: number;
  peMax: number;
  def: number;
  von: number;
  rdPhysical: number;
  rdMagic: number;
  health: CombatHealth;
  /** Fora de combate: não recebe turno. */
  down: boolean;
  character?: Character;
  /** Instância da ameaça neste combate (ou o molde, na escolha do livro). */
  threat?: CombatThreat;
}

/** Estado descritivo pelo PV, sem números. */
export function healthOf(pv: number, pvMax: number): CombatHealth {
  if (pv <= 0) return 'abatido';
  if (pv >= pvMax) return 'ileso';
  return pv > pvMax / 2 ? 'ferido' : 'muito-ferido';
}

export const HEALTH_LABELS: Record<CombatHealth, { label: string; cls: string }> = {
  ileso: { label: 'Ileso', cls: 'badge-ok' },
  ferido: { label: 'Ferido', cls: 'badge-warn' },
  'muito-ferido': { label: 'Muito ferido', cls: 'badge-err' },
  abatido: { label: 'Abatido', cls: 'badge-err' },
  inconsciente: { label: 'Inconsciente', cls: 'badge-warn' },
  morto: { label: 'Morto', cls: 'badge-err' },
};

export const SIDE_LABELS: Record<CombatSide, string> = { pc: 'Personagem', npc: 'NPC', threat: 'Ameaça' };

const DOWN: CombatHealth[] = ['abatido', 'inconsciente', 'morto'];

export function characterInfo(ch: Character): CombatantInfo {
  const d = deriveStats(ch);
  const cond = conditionOf(ch, d);
  const health: CombatHealth = cond === 'morto' ? 'morto' : cond === 'inconsciente' ? 'inconsciente' : healthOf(ch.current.pv, d.pvMax);
  return {
    name: ch.name, side: ch.kind === 'npc' ? 'npc' : 'pc',
    pv: ch.current.pv, pvMax: d.pvMax, pvMin: d.deathAt, pe: ch.current.pe, peMax: d.peMax,
    def: d.def, von: d.von, rdPhysical: d.rdPhysical, rdMagic: d.rdMagic,
    // Inabalável: PV ≤ 0 sem cair continua agindo.
    health: health === 'abatido' && !d.unconsciousAtZero ? 'muito-ferido' : health,
    down: DOWN.includes(health) && !(health === 'abatido' && !d.unconsciousAtZero),
    character: ch,
  };
}

export function threatInfo(t: CombatThreat): CombatantInfo {
  const health = healthOf(t.current.pv, t.pvMax);
  return {
    name: t.name, side: 'threat',
    pv: t.current.pv, pvMax: t.pvMax, pvMin: -9999, pe: t.current.pe, peMax: t.peMax,
    def: t.def, von: t.von, rdPhysical: t.rdPhysical, rdMagic: t.rdMagic,
    health, down: health === 'abatido',
    threat: t,
  };
}

export function combatantInfo(s: Pick<TableState, 'characters'>, cb: Combatant): CombatantInfo | null {
  if (cb.ref.kind === 'character') {
    const ch = s.characters[cb.ref.id];
    return ch ? characterInfo(ch) : null;
  }
  return cb.threat ? threatInfo(cb.threat) : null;
}

export function currentCombatant(c: Combat | null | undefined): Combatant | undefined {
  return c && c.round > 0 ? c.order[c.turn] : undefined;
}

// ── Duração das condições ────────────────────────────────────────────────────
// Uma condição de N rodadas aplicada na vez de X dura até a vez voltar à
// posição de X, N rodadas depois. Segue X se a ordem mudar; se X sair da fila,
// a âncora passa para quem ocupou o lugar dele.

/** A vez já chegou (ou passou) do ponto em que a condição termina? */
export function conditionExpired(c: Combat, cond: CombatCondition): boolean {
  if (cond.endsAtRound === null || c.round === 0) return false;
  if (c.round !== cond.endsAtRound) return c.round > cond.endsAtRound;
  if (!cond.sourceId) return true; // aplicada antes do combate: acaba no começo da rodada
  const at = c.order.findIndex((x) => x.id === cond.sourceId);
  return at < 0 || c.turn >= at;
}

/** Rodadas restantes, como o jogador conta: "1" = acaba na próxima vez de quem aplicou. */
export function conditionRemaining(c: Combat, cond: CombatCondition): number | null {
  if (cond.endsAtRound === null) return null;
  if (c.round === 0) return cond.rounds;
  const at = cond.sourceId ? c.order.findIndex((x) => x.id === cond.sourceId) : -1;
  const ahead = at >= 0 && c.turn < at ? 1 : 0;
  return Math.max(1, cond.endsAtRound - c.round + ahead);
}

/** Nome do combatente em cuja vez a condição termina (para a dica). */
export function conditionAnchor(s: Pick<TableState, 'characters'>, c: Combat, cond: CombatCondition): string | undefined {
  const cb = cond.sourceId ? c.order.find((x) => x.id === cond.sourceId) : undefined;
  return cb ? combatantInfo(s, cb)?.name : undefined;
}

/** Próximo combatente que vai agir depois do atual (pula quem está fora). */
export function nextUp(s: Pick<TableState, 'characters' | 'threats'>, c: Combat): Combatant | undefined {
  const n = c.order.length;
  for (let i = 1; i < n; i++) {
    const cb = c.order[(c.turn + i) % n];
    if (!combatantInfo(s, cb)?.down) return cb;
  }
  return undefined;
}

// ── Dano em grupo ────────────────────────────────────────────────────────────

export const GROUP_OPS: Record<GroupDamageOp, { label: string; tone: 'down' | 'up'; verb: string }> = {
  phys: { label: 'Dano físico', tone: 'down', verb: 'dano físico' },
  mag: { label: 'Dano mágico', tone: 'down', verb: 'dano mágico' },
  direct: { label: 'Dano direto', tone: 'down', verb: 'dano direto' },
  heal: { label: 'Cura', tone: 'up', verb: 'cura' },
};

/** Quanto a RD absorve desta operação para este alvo. */
export function rdFor(op: GroupDamageOp, info: Pick<CombatantInfo, 'rdPhysical' | 'rdMagic'>): number {
  return op === 'phys' ? info.rdPhysical : op === 'mag' ? info.rdMagic : 0;
}

/** Novo PV do alvo, já dentro dos limites. */
export function groupDamageResult(op: GroupDamageOp, amount: number, info: CombatantInfo): number {
  const raw = op === 'heal' ? info.pv + amount : info.pv - Math.max(0, amount - rdFor(op, info));
  // Cura não passa do máximo; dano não passa do PV de morte.
  return Math.max(info.pvMin, Math.min(info.pvMax, raw));
}
