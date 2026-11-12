// Aba Mapas do mestre: a lista de mapas e, ao abrir um, o editor.
import { useState } from 'react';
import { Copy, Eye, EyeOff, Flag, Layers, Map as MapIcon, Moon, Pencil, Plus, Swords, Trash2, Wand2 } from 'lucide-react';
import type { TableState } from '../../model/types';
import { AMBIENTS, MAP_CELL_M, MOVE_MODES, VISION_MODES } from '../../model/types';
import { ambientOf, visionOf } from '../../model/map';
import { useAct } from '../act';
import ConfirmButton from '../common/ConfirmButton';
import Modal from '../common/Modal';
import MapEditor from './MapEditor';
import { MapGenOptions, MapGenPreview, useMapGen } from './MapGenerateModal';
import FreeCombat from './FreeCombat';
import { EndCombatModal } from '../combat/CombatModals';

export default function MapsPanel({ table, openId, setOpenId }: {
  table: TableState; openId: string | null; setOpenId: (id: string | null) => void;
}) {
  const { act } = useAct();
  const [creating, setCreating] = useState(false);
  /** Tela do combate sem mapa aberta. */
  const [free, setFree] = useState(false);
  const [ending, setEnding] = useState(false);
  const maps = Object.values(table.maps).sort((a, b) => a.createdAt - b.createdAt);
  const open = openId ? table.maps[openId] : undefined;
  const combat = table.combat;

  if (open) return <MapEditor table={table} map={open} onBack={() => setOpenId(null)} onOpenMap={setOpenId} />;
  if (free && combat && !combat.mapId) return <FreeCombat table={table} combat={combat} onBack={() => setFree(false)} />;

  const combatMap = combat?.mapId ? table.maps[combat.mapId] : undefined;
  /** Combate sem mapa: fila vazia; o mestre arrasta quem luta para o plano. */
  const freeCombat = async () => {
    const r = await act({ type: 'combat/create' });
    if (r.ok) setFree(true);
  };

  return (
    <div className="col gap-lg">
      <div className="row-wrap">
        <div className="grow">
          <div className="card-title" style={{ marginBottom: 2 }}><MapIcon size={14} /> Mapas</div>
          <div className="tiny muted">Grid de quadrados de {MAP_CELL_M.toLocaleString('pt-BR')} m. Os jogadores só veem o mapa que você mostrar. O combate fica no mapa, na Mesa.</div>
        </div>
        {combat ? (
          <>
            {/* O combate se conduz aberto (no mapa ou no plano); aqui, só abrir ou encerrar. */}
            <button className="btn btn-sm btn-combat" onClick={() => (combatMap ? setOpenId(combatMap.id) : setFree(true))}
              title={combatMap ? `Abre o mapa ${combatMap.name}, onde o combate está` : 'Abre o combate sem mapa'}>
              <Swords size={14} /> Abrir o combate{combat.round ? ` · R${combat.round}` : ''}
            </button>
            <button className="btn btn-sm btn-ghost btn-icon btn-end-combat" onClick={() => setEnding(true)} title="Encerrar o combate" aria-label="Encerrar o combate">
              <Flag size={15} />
            </button>
          </>
        ) : (
          <button className="btn btn-sm" onClick={() => void freeCombat()} title="Abre um combate num plano aberto, sem mapa: os jogadores veem só a fila">
            <Swords size={14} /> Combate sem mapa
          </button>
        )}
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Plus size={14} /> Novo mapa</button>
      </div>
      {ending && combat && <EndCombatModal table={table} combat={combat} onClose={() => setEnding(false)} />}
      {maps.length === 0 && (
        <div className="empty col" style={{ alignItems: 'center' }}>
          <p>Nenhum mapa ainda.</p>
          <p className="small">Crie um mapa em branco e desenhe, ou gere uma masmorra, casa, templo ou cenário aberto (com vários andares, se quiser) e ajuste depois.</p>
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Plus size={14} /> Novo mapa</button>
        </div>
      )}
      <div className="map-list">
        {maps.map((m) => {
          const active = table.activeMapId === m.id;
          const linked = table.combat?.mapId === m.id;
          const tokens = Object.keys(m.tokens).length;
          return (
            <div key={m.id} className={`card map-card${active ? ' card-gold' : ''}`}>
              <button className="map-card-main" onClick={() => setOpenId(m.id)} title="Abrir o mapa">
                <strong>{m.name}</strong>
                <span className="tiny muted">{m.w} × {m.h} quadrados · {tokens} token{tokens === 1 ? '' : 's'}</span>
                <span className="row-wrap" style={{ gap: 6 }}>
                  {m.floor && <span className="badge" title="Andar de um mapa com vários andares, ligados por escadas"><Layers size={11} /> {m.floor.label}</span>}
                  <span className="badge">{MOVE_MODES[m.mode].label}</span>
                  {visionOf(m) !== 'open' && <span className="badge pmap-dark"><Moon size={11} /> Visão {VISION_MODES[visionOf(m)].label.toLowerCase()}</span>}
                  {visionOf(m) !== 'open' && ambientOf(m) !== 'geral' && <span className="badge">Luz de fora: {AMBIENTS[ambientOf(m)].label.toLowerCase()}</span>}
                  {active && <span className="badge badge-gold"><Eye size={11} /> Aberto aos jogadores</span>}
                  {linked && <span className="badge badge-err"><Swords size={11} /> Combate</span>}
                </span>
              </button>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn btn-sm" onClick={() => setOpenId(m.id)}><Pencil size={13} /> Abrir</button>
                <button className={`btn btn-sm${active ? '' : ' btn-ghost'}`} onClick={() => act({ type: 'map/activate', mapId: active ? null : m.id }, active ? 'Mapa escondido dos jogadores.' : 'Mapa aberto aos jogadores.')}
                  title={active ? 'Esconder dos jogadores' : 'Mostrar aos jogadores'}>
                  {active ? <EyeOff size={13} /> : <Eye size={13} />}{active ? 'Esconder' : 'Mostrar'}
                </button>
                <span className="spacer" />
                <button className="btn btn-sm btn-ghost btn-icon" title="Duplicar" aria-label="Duplicar"
                  onClick={() => act({ type: 'map/duplicate', mapId: m.id }, 'Mapa duplicado.')}><Copy size={14} /></button>
                <ConfirmButton className="btn btn-sm btn-ghost btn-icon" title="Excluir mapa" modalTitle="Excluir mapa"
                  confirmLabel="Excluir" message={<p>Excluir o mapa <strong>{m.name}</strong>? Não dá para desfazer.</p>}
                  onConfirm={() => act({ type: 'map/delete', mapId: m.id }, 'Mapa excluído.')}>
                  <Trash2 size={14} />
                </ConfirmButton>
              </div>
            </div>
          );
        })}
      </div>
      {creating && <CreateMapModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} />}
    </div>
  );
}

/** Novo mapa: nome, depois o tipo (em branco ou gerado), andares e prévia. */
function CreateMapModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { act } = useAct();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const g = useMapGen({ blank: true });
  const ok = name.trim().length > 0 && !busy;

  const submit = async () => {
    if (!ok) return;
    setBusy(true);
    const r = g.kind === 'blank'
      ? await act({
        type: 'map/create', name: name.trim(), ...g.blankSize, fill: g.blank.fill, walls: g.blank.fill === 'floor' && g.blank.walls,
      })
      : await act({ type: 'map/build', name: name.trim(), params: g.params, seed: g.seed },
        g.params.floors && g.params.floors > 1 ? `${g.params.floors} ${g.kind === 'dungeon' ? 'níveis criados' : 'andares criados'}, ligados por escadas.` : undefined);
    setBusy(false);
    if (r.ok && r.id) onCreated(r.id);
  };

  return (
    <Modal open width={860} title="Novo mapa" onClose={onClose}
      footer={<>
        <span className="tiny muted">Grid de quadrados de {MAP_CELL_M.toLocaleString('pt-BR')} m. Dentro do mapa dá para editar, redimensionar e gerar de novo.</span>
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!ok} onClick={() => void submit()}>
          {g.kind === 'blank' ? <Plus size={14} /> : <Wand2 size={14} />} Criar e abrir
        </button>
      </>}>
      <form className="col gap-lg" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="field">
          <label className="label" htmlFor="new-map-name">Nome</label>
          <input id="new-map-name" className="input" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Cripta da capela" />
        </div>
        <MapGenOptions g={g} />
        <MapGenPreview g={g} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
