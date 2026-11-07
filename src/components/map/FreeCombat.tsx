// Combate sem mapa (mestre): um plano aberto com quem está na fila, a barra de quem dá para
// pôr na luta embaixo e a fila na lateral. Nada aqui vai para os jogadores além da fila.
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { ArrowLeft, Swords, Users } from 'lucide-react';
import { avatarFor } from '../../model/avatar';
import type { Combat, CombatSide, CombatantRef, PlaceRef, TableState } from '../../model/types';
import { currentCombatant } from '../../store/combat';
import { useAct } from '../act';
import InfoTip from '../common/InfoTip';
import { useFitHeight } from './useFitHeight';
import { CombatTracker, TurnBar, useEntries } from '../combat/CombatTracker';
import { TOKEN_DRAG_TYPE } from './MapCanvas';
import { combatPlaceables, Pic, TokenBar, TokenRail, type PlaceItem } from './TokensPanel';

const SIDES: Array<{ id: CombatSide; label: string }> = [
  { id: 'pc', label: 'Jogadores' }, { id: 'npc', label: 'NPCs' }, { id: 'threat', label: 'Ameaças' },
];

const asCombatRef = (r: PlaceRef): CombatantRef | null => (r.kind === 'character' || r.kind === 'threat' ? { kind: r.kind, id: r.id } : null);

export default function FreeCombat({ table, combat, onBack }: { table: TableState; combat: Combat; onBack: () => void }) {
  const { act } = useAct();
  const gridRef = useRef<HTMLDivElement>(null);
  useFitHeight(gridRef);
  const entries = useEntries(table, combat);
  const items = useMemo(() => combatPlaceables(table, combat), [table, combat]);
  /** Linha aberta na fila; null = segue quem está agindo. */
  const [focus, setFocus] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const turnId = combat.round > 0 ? currentCombatant(combat)?.id : undefined;

  const add = (refs: CombatantRef[]) => { if (refs.length) void act({ type: 'combat/add', refs }); };
  const pcsOut = items.filter((it) => it.side === 'pc');
  const pickItem = (it: PlaceItem) => { const r = asCombatRef(it.ref); if (r) add([r]); };

  const isPlace = (e: DragEvent) => e.dataTransfer.types.includes(TOKEN_DRAG_TYPE);
  const onDrop = (e: DragEvent) => {
    setOver(false);
    if (!isPlace(e)) return;
    e.preventDefault();
    try {
      const ref = asCombatRef(JSON.parse(e.dataTransfer.getData(TOKEN_DRAG_TYPE)) as PlaceRef);
      if (ref) add([ref]);
    } catch { /* arraste de outra coisa */ }
  };

  return (
    <div className="col map-page">
      <div className="row-wrap map-head">
        <button className="btn btn-sm btn-ghost" onClick={onBack}><ArrowLeft size={14} /> Mapas</button>
        <strong className="map-name row" style={{ gap: 6 }}><Swords size={15} className="gold" /> Combate sem mapa</strong>
        <InfoTip label="Sobre o combate sem mapa">
          <span>Arraste da barra para o plano (ou clique) para pôr na fila.</span>
          <span>Os jogadores veem só a fila, sem os ocultos. O plano é só seu.</span>
        </InfoTip>
      </div>

      <div className="map-editor" ref={gridRef}>
        <div className="map-main">
          <div className="map-body fc-body">
          <TokenRail
            items={items.filter((it) => it.side !== 'pc')}
            onPick={pickItem}
            info={(
              <>
                <span><b>Pôr na fila:</b> arraste até o plano ou clique.</span>
                <span><b>∞</b> = do livro de ameaças: cada vez entra uma nova.</span>
              </>
            )}
          />
          <div className={`fc-plane${over ? ' drop' : ''}`} aria-label="Plano do combate"
            onDragOver={(e) => { if (isPlace(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); } }}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }}
            onDrop={onDrop}>
            {entries.length === 0 && <div className="fc-empty">Arraste para cá quem vai lutar.</div>}
            {SIDES.map((s) => {
              const list = entries.filter((e) => e.info.side === s.id);
              if (!list.length) return null;
              return (
                <div key={s.id} className="col" style={{ gap: 8 }}>
                  <div className="tok-group" style={{ background: 'transparent', position: 'static' }}>{s.label} · {list.length}</div>
                  <div className="fc-side">
                    {list.map(({ cb, info }) => (
                      <button key={cb.id} title={info.name}
                        className={`fc-tok side-${info.side}${focus === cb.id ? ' on' : ''}${turnId === cb.id ? ' turn' : ''}${info.down ? ' down' : ''}${cb.hidden ? ' is-hidden' : ''}`}
                        onClick={() => setFocus(focus === cb.id ? null : cb.id)}>
                        <Pic e={{ side: info.side, category: cb.threat?.category, avatar: info.character ? avatarFor(info.character) : undefined }} size={44} />
                        <span className="fc-tok-name">{info.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
          <TokenBar
            items={pcsOut}
            onPick={pickItem}
            extra={pcsOut.length > 1 && (
              <button className="btn btn-sm btn-ghost" title="Põe na fila todos os personagens dos jogadores"
                onClick={() => add(pcsOut.flatMap((it) => { const r = asCombatRef(it.ref); return r ? [r] : []; }))}>
                <Users size={13} /> Todos ({pcsOut.length})
              </button>
            )}
            empty="Todos os personagens dos jogadores já estão na fila."
            info={<span><b>Pôr na fila:</b> arraste até o plano ou clique.</span>}
          />
        </div>

        <aside className="col map-side">
          <div className="card col ct-card">
            <TurnBar table={table} combat={combat} />
            <CombatTracker table={table} combat={combat} focusId={focus} onFocus={setFocus} />
          </div>
        </aside>
      </div>
    </div>
  );
}
