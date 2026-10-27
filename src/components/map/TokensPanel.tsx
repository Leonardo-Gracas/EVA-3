// Mesa (mestre): painel de tokens. Uma lista só, rolável, com busca e filtro por tipo:
// em cima quem já está no mapa, embaixo quem dá para colocar. Para colocar, arraste a
// linha até o quadrado ou clique nela e depois no mapa.
import { useMemo, useState } from 'react';
import { Eye, EyeOff, GripVertical, MousePointerClick, Plus, Search, Swords, Trash2, X } from 'lucide-react';
import type { AvatarConfig } from '../../model/avatar';
import { avatarFor } from '../../model/avatar';
import type { BattleMap, CombatSide, PlaceRef, TableState, ThreatCategory, TokenRef } from '../../model/types';
import { THREAT_CATEGORIES } from '../../model/types';
import { cellLabel } from '../../model/map';
import { metersFor, squaresFor } from '../../rules/grid';
import { combatantInfo } from '../../store/combat';
import { tokenInfo } from '../../store/maps';
import { useAct } from '../act';
import Avatar from '../common/Avatar';
import { ThreatGlyph } from '../gm/ThreatIcon';
import { TOKEN_DRAG_TYPE } from './MapCanvas';
import { gmTokens } from './tokens';

type Filter = 'all' | CombatSide;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Todos' }, { id: 'pc', label: 'Jogadores' }, { id: 'npc', label: 'NPCs' }, { id: 'threat', label: 'Ameaças' },
];

/** O que está armado para colocar com um clique no mapa. */
export interface Armed { ref: PlaceRef; name: string; /** Molde do livro: cada clique cria mais uma. */ repeat: boolean }

interface Entry {
  key: string;
  ref: PlaceRef | TokenRef;
  side: CombatSide;
  name: string;
  sub: string;
  avatar?: AvatarConfig;
  category?: ThreatCategory;
  /** Já no mapa. */
  tokenId?: string;
  hidden?: boolean;
  turn?: boolean;
  repeat?: boolean;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const meters = (sq: number) => `${sq} quadrado${sq === 1 ? '' : 's'} · ${metersFor(sq).toLocaleString('pt-BR')} m`;

function Pic({ e }: { e: Pick<Entry, 'avatar' | 'category' | 'side'> }) {
  return (
    <span className={`tok-pic side-${e.side}`}>
      {e.category
        ? <span className={`map-token-threat threat-cat-${e.category}`}><ThreatGlyph category={e.category} size={16} /></span>
        : <Avatar config={e.avatar} size={30} />}
    </span>
  );
}

export default function TokensPanel({ table, map, selTok, setSelTok, guide, armed, setArmed }: {
  table: TableState; map: BattleMap;
  selTok: string | null; setSelTok: (id: string | null) => void;
  guide: { squares: number; remaining: number; turn: boolean } | null;
  armed: Armed | null; setArmed: (a: Armed | null) => void;
}) {
  const { act } = useAct();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const combat = table.combat;

  const { onMap, toPlace, queue } = useMemo(() => {
    const onMap: Entry[] = gmTokens(table, map).map((t) => {
      const tok = map.tokens[t.id];
      const parts = [cellLabel(t.x, t.y)];
      if (t.turn) parts.push('na vez');
      if (t.hidden) parts.push('oculto');
      if (tok.ref.kind === 'creature') parts.push(combat?.mapId === map.id ? 'fora da fila' : 'solta no mapa');
      return {
        // Criaturas soltas do mesmo molde são várias: a chave é o próprio token.
        key: tok.ref.kind === 'creature' ? `token:${tok.id}` : `${tok.ref.kind}:${tok.ref.id}`, ref: tok.ref, side: t.side, name: t.name, sub: parts.join(' · '),
        avatar: t.avatar, category: t.category, tokenId: t.id, hidden: t.hidden, turn: t.turn,
      };
    });
    const have = new Set(onMap.map((e) => e.key));
    const inQueue = new Set((combat?.order ?? []).filter((cb) => cb.ref.kind === 'character').map((cb) => cb.ref.id));
    const toPlace: Entry[] = [];
    const queue: PlaceRef[] = [];
    // Fichas aprovadas (jogadores e NPCs).
    for (const ch of Object.values(table.characters)) {
      if (ch.status !== 'approved' || have.has(`character:${ch.id}`)) continue;
      const side: CombatSide = ch.kind === 'npc' ? 'npc' : 'pc';
      const who = side === 'pc' ? (table.players[ch.ownerId]?.name ?? 'Jogador') : 'NPC';
      toPlace.push({
        key: `character:${ch.id}`, ref: { kind: 'character', id: ch.id }, side, name: ch.name,
        sub: inQueue.has(ch.id) ? `${who} · na fila do combate` : who, avatar: avatarFor(ch),
      });
      if (inQueue.has(ch.id)) queue.push({ kind: 'character', id: ch.id });
    }
    // Ameaças já na fila do combate e fora do mapa.
    for (const cb of combat?.order ?? []) {
      if (!cb.threat || have.has(`combatant:${cb.id}`)) continue;
      const info = combatantInfo(table, cb);
      toPlace.push({
        key: `combatant:${cb.id}`, ref: { kind: 'combatant', id: cb.id }, side: 'threat', name: info?.name ?? cb.threat.name,
        sub: `Na fila · ${THREAT_CATEGORIES[cb.threat.category]?.label ?? ''}`, category: cb.threat.category,
      });
      queue.push({ kind: 'combatant', id: cb.id });
    }
    // Livro de ameaças: cada vez que coloca, entra uma instância nova na fila.
    for (const t of Object.values(table.threats).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))) {
      toPlace.push({
        key: `threat:${t.id}`, ref: { kind: 'threat', id: t.id }, side: 'threat', name: t.name,
        sub: `${THREAT_CATEGORIES[t.category]?.label ?? ''} · PV ${t.pvMax} · ${t.movement.toLocaleString('pt-BR')} m`, category: t.category, repeat: true,
      });
    }
    const order: Record<CombatSide, number> = { pc: 0, npc: 1, threat: 2 };
    const sort = (a: Entry, b: Entry) => order[a.side] - order[b.side] || (a.repeat ? 1 : 0) - (b.repeat ? 1 : 0) || a.name.localeCompare(b.name, 'pt-BR');
    return { onMap: onMap.sort(sort), toPlace: toPlace.sort(sort), queue };
  }, [table, map, combat]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, pc: 0, npc: 0, threat: 0 };
    for (const e of [...onMap, ...toPlace]) { c.all++; c[e.side]++; }
    return c;
  }, [onMap, toPlace]);

  const match = (e: Entry) => (filter === 'all' || e.side === filter) && (!q.trim() || fold(e.name).includes(fold(q.trim())));
  const shownOn = onMap.filter(match);
  const shownOff = toPlace.filter((e) => !e.repeat && match(e));
  const shownBook = toPlace.filter((e) => e.repeat && match(e));

  const placeRow = (e: Entry) => {
    // Linhas "para colocar" sempre trazem algo que dá para pôr (nunca uma criatura já no mapa).
    const ref = e.ref as PlaceRef;
    const on = armed && armed.ref.kind === ref.kind && armed.ref.id === ref.id;
    return (
      <div key={e.key} className={`tok-row side-${e.side}${on ? ' armed' : ''}`} draggable
        onDragStart={(ev) => {
          ev.dataTransfer.setData(TOKEN_DRAG_TYPE, JSON.stringify(e.ref));
          ev.dataTransfer.setData('text/plain', e.name);
          ev.dataTransfer.effectAllowed = 'copy';
        }}>
        <GripVertical size={14} className="tok-grip" aria-hidden="true" />
        <button className="tok-main" onClick={() => setArmed(on ? null : { ref, name: e.name, repeat: !!e.repeat })}
          title="Arraste até o mapa, ou clique e depois clique no quadrado">
          <Pic e={e} />
          <span className="tok-text"><strong>{e.name}</strong><span>{e.sub}</span></span>
        </button>
        <button className="btn btn-sm btn-ghost btn-icon" title="Pôr no piso livre perto do centro" aria-label={`Pôr ${e.name} no mapa`}
          onClick={() => place([ref])}><Plus size={14} /></button>
      </div>
    );
  };

  const place = (refs: PlaceRef[], ok?: string) => act({ type: 'map/tokenPlace', mapId: map.id, refs }, ok);
  const sel = selTok ? map.tokens[selTok] : undefined;
  const selInfo = sel ? tokenInfo(table, sel) : null;

  return (
    <>
      {sel && selInfo && (
        <div className="card col card-gold">
          <div className="row">
            <strong className="grow">{selInfo.name}</strong>
            <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setSelTok(null)} aria-label="Soltar"><X size={14} /></button>
          </div>
          <div className="small secondary">
            {cellLabel(sel.x, sel.y)} · deslocamento {selInfo.movement.toLocaleString('pt-BR')} m ({squaresFor(selInfo.movement)} quadrados)
          </div>
          {guide?.turn && <div className="small">Na vez dele: restam <strong>{meters(guide.remaining)}</strong>.</div>}
          <div className="tiny muted">Você move sem limite; o destaque mostra até onde o deslocamento chega{guide?.turn ? ' neste turno' : ''}.</div>
          <div className="row">
            <button className="btn btn-sm" onClick={() => act({ type: 'map/tokenHidden', mapId: map.id, tokenIds: [sel.id], hidden: !sel.hidden })}>
              {sel.hidden ? <><Eye size={13} /> Mostrar</> : <><EyeOff size={13} /> Ocultar</>}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => act({ type: 'map/tokenRemove', mapId: map.id, tokenIds: [sel.id] })}><Trash2 size={13} /> Tirar do mapa</button>
          </div>
        </div>
      )}

      <div className="card col tok-panel">
        <div className="row">
          <div className="card-title grow" style={{ margin: 0 }}>Tokens</div>
          <span className="tiny muted">{onMap.length} no mapa</span>
        </div>
        <label className="tok-search">
          <Search size={14} />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome" aria-label="Buscar token" />
        </label>
        <div className="tok-filters" role="tablist" aria-label="Tipo">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
              <b>{counts[f.id]}</b>{f.label}
            </button>
          ))}
        </div>

        {armed && (
          <div className="tok-hint">
            <MousePointerClick size={14} />
            <span>Clique no mapa para colocar <strong>{armed.name}</strong>{armed.repeat ? ' (cada clique, mais uma)' : ''}.</span>
            <span className="spacer" />
            <button className="btn btn-sm btn-ghost" onClick={() => setArmed(null)}>{armed.repeat ? 'Pronto' : 'Cancelar'}</button>
          </div>
        )}

        <div className="tok-list">
          <div className="tok-group">No mapa · {shownOn.length}</div>
          {shownOn.length === 0 && <div className="tok-empty">{onMap.length ? 'Ninguém no mapa com esse filtro.' : 'Ninguém no mapa ainda. Arraste alguém da lista abaixo.'}</div>}
          {shownOn.map((e) => (
            <div key={e.key} className={`tok-row side-${e.side}${e.tokenId === selTok ? ' on' : ''}`}>
              <button className="tok-main" onClick={() => setSelTok(e.tokenId === selTok ? null : e.tokenId!)} title="Ver alcance e mover">
                <Pic e={e} />
                <span className="tok-text"><strong>{e.name}</strong><span>{e.sub}</span></span>
              </button>
              {e.turn && <span className="badge badge-gold">vez</span>}
              <button className="btn btn-sm btn-ghost btn-icon" title={e.hidden ? 'Mostrar aos jogadores' : 'Ocultar dos jogadores'}
                onClick={() => act({ type: 'map/tokenHidden', mapId: map.id, tokenIds: [e.tokenId!], hidden: !map.tokens[e.tokenId!].hidden })}>
                {map.tokens[e.tokenId!].hidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button className="btn btn-sm btn-ghost btn-icon" title="Tirar do mapa" aria-label={`Tirar ${e.name} do mapa`}
                onClick={() => act({ type: 'map/tokenRemove', mapId: map.id, tokenIds: [e.tokenId!] })}><X size={14} /></button>
            </div>
          ))}

          <div className="tok-group">
            Para colocar · {shownOff.length}
            <span className="spacer" />
            {queue.length > 0 && (
              <button className="btn btn-sm btn-ghost" style={{ textTransform: 'none', letterSpacing: 0 }}
                onClick={() => place(queue, 'Fila do combate no mapa.')} title="Põe todos da fila que ainda não estão no mapa">
                <Swords size={12} /> Fila ({queue.length})
              </button>
            )}
          </div>
          {shownOff.length === 0 && (
            <div className="tok-empty">{toPlace.some((e) => !e.repeat) ? 'Nada com esse filtro.' : 'Todas as fichas aprovadas e a fila do combate já estão no mapa.'}</div>
          )}
          {shownOff.map(placeRow)}

          {(filter === 'all' || filter === 'threat') && (
            <>
              <div className="tok-group" title="Cada vez que coloca, entra uma ameaça nova: no fim da fila, se o combate for neste mapa; senão, solta no mapa">Livro de ameaças · {shownBook.length}</div>
              {shownBook.length === 0 && <div className="tok-empty">{toPlace.some((e) => e.repeat) ? 'Nada com essa busca.' : 'O livro está vazio. Crie ameaças na aba NPCs e Ameaças.'}</div>}
              {shownBook.map(placeRow)}
            </>
          )}
        </div>
      </div>
    </>
  );
}
