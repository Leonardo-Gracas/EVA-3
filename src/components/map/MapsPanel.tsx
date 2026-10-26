// Aba Mapas do mestre: a lista de mapas e, ao abrir um, o editor.
import { useState } from 'react';
import { Copy, Eye, EyeOff, Map as MapIcon, Pencil, Plus, Swords, Trash2 } from 'lucide-react';
import type { TableState, Terrain } from '../../model/types';
import { MAP_CELL_M, MAP_LIMITS, MOVE_MODES } from '../../model/types';
import { useAct } from '../act';
import ConfirmButton from '../common/ConfirmButton';
import Modal from '../common/Modal';
import MapEditor from './MapEditor';

export default function MapsPanel({ table, openId, setOpenId }: {
  table: TableState; openId: string | null; setOpenId: (id: string | null) => void;
}) {
  const { act } = useAct();
  const [creating, setCreating] = useState(false);
  const maps = Object.values(table.maps).sort((a, b) => a.createdAt - b.createdAt);
  const open = openId ? table.maps[openId] : undefined;

  if (open) return <MapEditor table={table} map={open} onBack={() => setOpenId(null)} />;

  return (
    <div className="col gap-lg">
      <div className="row-wrap">
        <div className="grow">
          <div className="card-title" style={{ marginBottom: 2 }}><MapIcon size={14} /> Mapas</div>
          <div className="tiny muted">Grid de quadrados de {MAP_CELL_M.toLocaleString('pt-BR')} m. Os jogadores só veem o mapa que você mostrar.</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Plus size={14} /> Novo mapa</button>
      </div>
      {maps.length === 0 && (
        <div className="empty col" style={{ alignItems: 'center' }}>
          <p>Nenhum mapa ainda.</p>
          <p className="small">Crie um mapa em branco e desenhe, ou gere uma masmorra, casa, templo ou cenário aberto e ajuste depois.</p>
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
                  <span className="badge">{MOVE_MODES[m.mode].label}</span>
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

function CreateMapModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { act } = useAct();
  const [name, setName] = useState('');
  const [w, setW] = useState('30');
  const [h, setH] = useState('20');
  const [fill, setFill] = useState<Terrain>('floor');
  const [walls, setWalls] = useState(true);
  const num = (v: string) => Math.max(MAP_LIMITS.min, Math.min(MAP_LIMITS.max, parseInt(v, 10) || 0));
  const ok = name.trim().length > 0;

  const submit = async () => {
    if (!ok) return;
    const r = await act({ type: 'map/create', name: name.trim(), w: num(w), h: num(h), fill, walls: fill === 'floor' && walls });
    if (r.ok && r.id) onCreated(r.id);
  };

  return (
    <Modal open title="Novo mapa" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!ok} onClick={submit}>Criar e abrir</button></>}>
      <form className="col gap-lg" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="field">
          <label className="label">Nome</label>
          <input className="input" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Cripta da capela" />
        </div>
        <div className="row-wrap">
          <label className="field small secondary">Largura
            <input className="input mono" style={{ width: 80 }} inputMode="numeric" value={w} onChange={(e) => setW(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="field small secondary">Altura
            <input className="input mono" style={{ width: 80 }} inputMode="numeric" value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, ''))} />
          </label>
          <span className="tiny muted" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}>
            {num(w)} × {num(h)} quadrados = {(num(w) * MAP_CELL_M).toLocaleString('pt-BR')} × {(num(h) * MAP_CELL_M).toLocaleString('pt-BR')} m
          </span>
        </div>
        <div className="field">
          <span className="label">Começar com</span>
          <div className="row-wrap">
            <button type="button" className={`chip${fill === 'floor' ? ' on' : ''}`} onClick={() => setFill('floor')}>Piso livre</button>
            <button type="button" className={`chip${fill === 'void' ? ' on' : ''}`} onClick={() => setFill('void')}>Tudo vazio (para gerar ou escavar)</button>
          </div>
        </div>
        {fill === 'floor' && (
          <label className="row small"><input type="checkbox" checked={walls} onChange={(e) => setWalls(e.target.checked)} /> Parede em volta do mapa</label>
        )}
        <p className="tiny muted">Dentro do mapa dá para gerar masmorras, casas, templos e cenários abertos (com mobília) e redimensionar quando quiser.</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
