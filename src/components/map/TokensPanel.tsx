// Tokens do mestre. Embaixo do mapa, a barra horizontal de quem dá para colocar (arraste
// até o quadrado, ou clique e depois clique no mapa). Na lateral, o token escolhido e a
// lista de quem já está no mapa.
import { useMemo, useState } from 'react';
import { Eye, EyeOff, Plus, Search, Trash2, X } from 'lucide-react';
import type { AvatarConfig } from '../../model/avatar';
import { avatarFor } from '../../model/avatar';
import type { BattleMap, Combat, CombatSide, PlaceRef, TableState, ThreatCategory } from '../../model/types';
import { THREAT_CATEGORIES } from '../../model/types';
import { cellLabel } from '../../model/map';
import { metersFor, squaresFor } from '../../rules/grid';
import { combatantInfo } from '../../store/combat';
import { tokenInfo } from '../../store/maps';
import { useAct } from '../act';
import Avatar from '../common/Avatar';
import InfoTip from '../common/InfoTip';
import { ThreatGlyph } from '../gm/ThreatIcon';
import { TOKEN_DRAG_TYPE } from './MapCanvas';
import { gmTokens } from './tokens';

type Filter = 'all' | CombatSide;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Todos' }, { id: 'pc', label: 'PJs' }, { id: 'npc', label: 'NPCs' }, { id: 'threat', label: 'Ameaças' },
];

/** O que está armado para colocar com um clique no mapa. */
export interface Armed { ref: PlaceRef; name: string; /** Molde do livro: cada clique cria mais uma. */ repeat: boolean }

/** Alguém que dá para colocar (no mapa ou no combate). */
export interface PlaceItem {
  key: string;
  ref: PlaceRef;
  side: CombatSide;
  name: string;
  sub: string;
  avatar?: AvatarConfig;
  category?: ThreatCategory;
  /** Molde do livro: cada vez que coloca, entra uma nova. */
  repeat?: boolean;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const meters = (sq: number) => `${sq} quadrado${sq === 1 ? '' : 's'} · ${metersFor(sq).toLocaleString('pt-BR')} m`;
const ORDER: Record<CombatSide, number> = { pc: 0, npc: 1, threat: 2 };
const byKind = (a: PlaceItem, b: PlaceItem) => ORDER[a.side] - ORDER[b.side] || (a.repeat ? 1 : 0) - (b.repeat ? 1 : 0) || a.name.localeCompare(b.name, 'pt-BR');

export function Pic({ e, size = 30 }: { e: Pick<PlaceItem, 'avatar' | 'category' | 'side'>; size?: number }) {
  return (
    <span className={`tok-pic side-${e.side}`} style={{ width: size, height: size }}>
      {e.category
        ? <span className={`map-token-threat threat-cat-${e.category}`} style={{ width: size, height: size }}><ThreatGlyph category={e.category} size={Math.round(size * 0.53)} /></span>
        : <Avatar config={e.avatar} size={size} />}
    </span>
  );
}

function bookItems(table: TableState): PlaceItem[] {
  return Object.values(table.threats).map((t) => ({
    key: `threat:${t.id}`, ref: { kind: 'threat', id: t.id }, side: 'threat', name: t.name, category: t.category, repeat: true,
    sub: `${THREAT_CATEGORIES[t.category]?.label ?? ''} · PV ${t.pvMax} · ${t.movement.toLocaleString('pt-BR')} m`,
  }));
}

/** Quem dá para pôr no mapa: fichas aprovadas fora dele, ameaças da fila fora dele e o livro. */
export function mapPlaceables(table: TableState, map: BattleMap): { items: PlaceItem[]; queue: PlaceRef[] } {
  const combat = table.combat;
  const have = new Set(Object.values(map.tokens).map((t) => `${t.ref.kind}:${t.ref.id}`));
  const inQueue = new Set((combat?.order ?? []).filter((cb) => cb.ref.kind === 'character').map((cb) => cb.ref.id));
  const items: PlaceItem[] = [];
  const queue: PlaceRef[] = [];
  for (const ch of Object.values(table.characters)) {
    if (ch.status !== 'approved' || have.has(`character:${ch.id}`)) continue;
    const side: CombatSide = ch.kind === 'npc' ? 'npc' : 'pc';
    const who = side === 'pc' ? (table.players[ch.ownerId]?.name ?? 'Jogador') : 'NPC';
    items.push({
      key: `character:${ch.id}`, ref: { kind: 'character', id: ch.id }, side, name: ch.name,
      sub: inQueue.has(ch.id) ? `${who} · na fila do combate` : who, avatar: avatarFor(ch),
    });
    if (inQueue.has(ch.id)) queue.push({ kind: 'character', id: ch.id });
  }
  for (const cb of combat?.order ?? []) {
    if (!cb.threat || have.has(`combatant:${cb.id}`)) continue;
    const info = combatantInfo(table, cb);
    items.push({
      key: `combatant:${cb.id}`, ref: { kind: 'combatant', id: cb.id }, side: 'threat', name: info?.name ?? cb.threat.name,
      sub: `Na fila · ${THREAT_CATEGORIES[cb.threat.category]?.label ?? ''}`, category: cb.threat.category,
    });
    queue.push({ kind: 'combatant', id: cb.id });
  }
  items.push(...bookItems(table));
  return { items: items.sort(byKind), queue };
}

/** Quem dá para pôr num combate sem mapa: fichas aprovadas fora da fila e o livro. */
export function combatPlaceables(table: TableState, combat: Combat): PlaceItem[] {
  const inQueue = new Set(combat.order.filter((cb) => cb.ref.kind === 'character').map((cb) => cb.ref.id));
  const items: PlaceItem[] = [];
  for (const ch of Object.values(table.characters)) {
    if (ch.status !== 'approved' || inQueue.has(ch.id)) continue;
    const side: CombatSide = ch.kind === 'npc' ? 'npc' : 'pc';
    items.push({
      key: `character:${ch.id}`, ref: { kind: 'character', id: ch.id }, side, name: ch.name,
      sub: side === 'pc' ? (table.players[ch.ownerId]?.name ?? 'Jogador') : 'NPC', avatar: avatarFor(ch),
    });
  }
  items.push(...bookItems(table));
  return items.sort(byKind);
}

/**
 * Barra horizontal de quem dá para colocar. `controls`: o que vem antes do filtro (modos do
 * mapa); `extra`: depois (atalhos). Clicar chama `onPick`; arrastar leva o ref (TOKEN_DRAG_TYPE).
 */
export function TokenBar({ items, armedKey, onPick, onQuick, controls, extra, info, empty }: {
  items: PlaceItem[];
  armedKey?: string | null;
  onPick: (it: PlaceItem) => void;
  /** Botão "+" de cada item (pôr direto, sem escolher o quadrado). */
  onQuick?: (it: PlaceItem) => void;
  controls?: React.ReactNode;
  extra?: React.ReactNode;
  info: React.ReactNode;
  empty: string;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, pc: 0, npc: 0, threat: 0 };
    for (const e of items) { c.all++; c[e.side]++; }
    return c;
  }, [items]);
  const shown = items.filter((e) => (filter === 'all' || e.side === filter) && (!q.trim() || fold(e.name).includes(fold(q.trim()))));
  const firstBook = shown.findIndex((e) => e.repeat);

  return (
    <div className="tbar">
      <div className="tbar-head">
        {controls}
        <InfoTip label="Informações" up>{info}</InfoTip>
        <span className="tbar-filters" role="tablist" aria-label="Tipo">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
              {f.label}<b>{counts[f.id]}</b>
            </button>
          ))}
        </span>
        <label className="tok-search tbar-search">
          <Search size={13} />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar token" />
        </label>
        {extra}
      </div>
      <div className="tbar-list" role="list">
        {shown.length === 0 && <span className="tok-empty">{items.length ? 'Nada com esse filtro.' : empty}</span>}
        {shown.map((e, i) => (
          <div key={e.key} role="listitem" className={`tbar-chip side-${e.side}${armedKey === e.key ? ' armed' : ''}${i === firstBook ? ' first-book' : ''}`} draggable
            title={`${e.name} · ${e.sub}${e.repeat ? ' · do livro: cada vez, mais uma' : ''}`}
            onDragStart={(ev) => {
              ev.dataTransfer.setData(TOKEN_DRAG_TYPE, JSON.stringify(e.ref));
              ev.dataTransfer.setData('text/plain', e.name);
              ev.dataTransfer.effectAllowed = 'copy';
            }}>
            <button className="tbar-main" onClick={() => onPick(e)}>
              <Pic e={e} size={28} />
              <span className="tbar-name">{e.name}</span>
              {e.repeat && <span className="tbar-book" aria-label="do livro">∞</span>}
            </button>
            {onQuick && (
              <button className="tbar-quick" onClick={() => onQuick(e)} title="Pôr no piso livre perto do centro" aria-label={`Pôr ${e.name} no mapa`}>
                <Plus size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Cartão do token escolhido no mapa. */
export function SelectedToken({ table, map, selTok, setSelTok, guide }: {
  table: TableState; map: BattleMap;
  selTok: string | null; setSelTok: (id: string | null) => void;
  guide: { squares: number; remaining: number; turn: boolean } | null;
}) {
  const { act } = useAct();
  const sel = selTok ? map.tokens[selTok] : undefined;
  const info = sel ? tokenInfo(table, sel) : null;
  if (!sel || !info) return null;
  return (
    <div className="card col card-gold tok-sel">
      <div className="row">
        <Pic e={info} size={28} />
        <strong className="grow">{info.name}</strong>
        <InfoTip label="Sobre o alcance" align="right">
          Você move sem limite. O destaque mostra até onde o deslocamento chega{guide?.turn ? ' neste turno' : ''}.
        </InfoTip>
        <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setSelTok(null)} aria-label="Soltar"><X size={14} /></button>
      </div>
      <div className="small secondary">
        {cellLabel(sel.x, sel.y)} · {info.movement.toLocaleString('pt-BR')} m ({squaresFor(info.movement)} quadrados)
        {guide?.turn && <> · restam <strong>{meters(guide.remaining)}</strong></>}
      </div>
      <div className="row">
        <button className="btn btn-sm" onClick={() => act({ type: 'map/tokenHidden', mapId: map.id, tokenIds: [sel.id], hidden: !sel.hidden })}>
          {sel.hidden ? <><Eye size={13} /> Mostrar</> : <><EyeOff size={13} /> Ocultar</>}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => act({ type: 'map/tokenRemove', mapId: map.id, tokenIds: [sel.id] })}><Trash2 size={13} /> Tirar do mapa</button>
      </div>
    </div>
  );
}

/** Quem está no mapa: escolher, ocultar e tirar. */
export function OnMapList({ table, map, selTok, setSelTok }: {
  table: TableState; map: BattleMap; selTok: string | null; setSelTok: (id: string | null) => void;
}) {
  const { act } = useAct();
  const combat = table.combat;
  const rows = useMemo(() => gmTokens(table, map).map((t) => {
    const tok = map.tokens[t.id];
    const parts = [cellLabel(t.x, t.y)];
    if (t.hidden) parts.push('oculto');
    if (tok.ref.kind === 'creature') parts.push(combat?.mapId === map.id ? 'fora da fila' : 'solta');
    return { ...t, sub: parts.join(' · ') };
  }).sort((a, b) => ORDER[a.side] - ORDER[b.side] || a.name.localeCompare(b.name, 'pt-BR')), [table, map, combat]);

  return (
    <div className="card col tok-panel">
      <div className="row">
        <div className="card-title grow" style={{ margin: 0 }}>No mapa</div>
        <span className="tiny muted">{rows.length}</span>
      </div>
      {rows.length === 0 && <div className="tok-empty">Ninguém ainda. Arraste da barra embaixo do mapa.</div>}
      <div className="tok-list">
        {rows.map((e) => (
          <div key={e.id} className={`tok-row side-${e.side}${e.id === selTok ? ' on' : ''}`}>
            <button className="tok-main" onClick={() => setSelTok(e.id === selTok ? null : e.id)} title="Ver alcance e mover">
              <Pic e={e} />
              <span className="tok-text"><strong>{e.name}</strong><span>{e.sub}</span></span>
            </button>
            {e.turn && <span className="badge badge-gold">vez</span>}
            <button className="btn btn-sm btn-ghost btn-icon" title={e.hidden ? 'Mostrar aos jogadores' : 'Ocultar dos jogadores'}
              onClick={() => act({ type: 'map/tokenHidden', mapId: map.id, tokenIds: [e.id], hidden: !map.tokens[e.id].hidden })}>
              {map.tokens[e.id].hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button className="btn btn-sm btn-ghost btn-icon" title="Tirar do mapa" aria-label={`Tirar ${e.name} do mapa`}
              onClick={() => act({ type: 'map/tokenRemove', mapId: map.id, tokenIds: [e.id] })}><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
