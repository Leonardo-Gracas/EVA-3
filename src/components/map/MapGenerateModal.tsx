// Gerador de mapas: tipo (masmorra, casa, templo, cenário aberto), parâmetros, prévia e aplicar.
import { useMemo, useState } from 'react';
import { Castle, Church, Dices, Home, Trees, Wand2 } from 'lucide-react';
import type { HouseShape, MapGenParams, MapObject, MapPreset } from '../../model/types';
import { HOUSE_SHAPES, MAP_LIMITS, MAP_PRESETS } from '../../model/types';
import { cleanMapParams, describeRooms, GEN_MIN_SIDE, generateMap, MAP_GEN_DEFAULTS, PRESET_DEFAULTS } from '../../rules/mapgen';
import { newSeed } from '../../rules/random';
import Modal from '../common/Modal';
import MapCanvas from './MapCanvas';

type NumKey = 'w' | 'h' | 'rooms' | 'roomMin' | 'roomMax' | 'corridor' | 'doors';
type Draft = Record<NumKey, string>;

const PRESET_ICONS: Record<MapPreset, typeof Home> = { dungeon: Castle, house: Home, temple: Church, outdoor: Trees };

/** Campos de cada tipo (rótulo e dica). */
const FIELDS: Record<MapPreset, Array<[NumKey, string, string?]>> = {
  dungeon: [
    ['rooms', 'Salas', '1 a 40 (cabem menos em mapas pequenos)'], ['roomMin', 'Sala mín.'], ['roomMax', 'Sala máx.'],
    ['corridor', 'Corredor', 'Largura: 1 a 3 quadrados'], ['doors', 'Portas %', 'Chance de cada entrada de sala ter porta'],
  ],
  house: [
    ['roomMin', 'Cômodo mín.'], ['roomMax', 'Cômodo máx.'], ['corridor', 'Corredor', 'Largura: 1 a 3 quadrados'],
    ['doors', 'Portas %', 'Chance de cada passagem ter porta (senão fica só o vão)'],
  ],
  temple: [
    ['roomMin', 'Capela mín.', 'Tamanho das salas laterais'], ['roomMax', 'Capela máx.'],
    ['doors', 'Portas %', 'Chance das salas laterais terem porta'],
  ],
  outdoor: [
    ['rooms', 'Construções', '0 a 12 cabanas e ruínas'], ['roomMin', 'Construção mín.'], ['roomMax', 'Construção máx.'],
    ['doors', 'Portas %', 'Chance de cada cabana ter porta'],
  ],
};

const toDraft = (p: MapGenParams): Draft => ({
  w: String(p.w), h: String(p.h), rooms: String(p.rooms), roomMin: String(p.roomMin), roomMax: String(p.roomMax),
  corridor: String(p.corridor), doors: String(Math.round(p.doors * 100)),
});

export default function MapGenerateModal({ w, h, onApply, onClose }: {
  w: number; h: number;
  onApply: (params: MapGenParams, seed: number) => Promise<boolean>;
  onClose: () => void;
}) {
  const [preset, setPreset] = useState<MapPreset>('dungeon');
  const [shape, setShape] = useState<HouseShape>('random');
  const [furnish, setFurnish] = useState(true);
  const [d, setD] = useState<Draft>(() => toDraft(cleanMapParams({ ...MAP_GEN_DEFAULTS, w: Math.max(w, GEN_MIN_SIDE), h: Math.max(h, GEN_MIN_SIDE) })));
  const [seed, setSeed] = useState(newSeed);
  const params = useMemo(() => {
    const n = (k: NumKey) => parseInt(d[k], 10);
    return cleanMapParams({
      preset, shape, furnish,
      w: n('w'), h: n('h'), rooms: n('rooms'), roomMin: n('roomMin'), roomMax: n('roomMax'), corridor: n('corridor'),
      doors: (n('doors') || 0) / 100,
    });
  }, [d, preset, shape, furnish]);
  const result = useMemo(() => generateMap(params, seed), [params, seed]);
  const objects = useMemo<MapObject[]>(() => [
    ...result.doors.map((edge, i) => ({ id: `p${i}`, kind: 'door' as const, edge, state: 'closed' as const, hidden: false })),
    ...result.props.map((pr, i) => ({ id: `m${i}`, kind: 'prop' as const, ...pr, hidden: false })),
  ], [result]);
  const up = (k: NumKey, v: string) => setD((x) => ({ ...x, [k]: v.replace(/\D/g, '') }));

  const choosePreset = (p: MapPreset) => {
    if (p === preset) return;
    setPreset(p);
    const t = PRESET_DEFAULTS[p];
    setD((x) => ({ ...x, ...toDraft({ ...params, ...t }), w: x.w, h: x.h }));
  };

  const field = (k: NumKey, label: string, hint?: string) => (
    <label key={k} className="field small secondary" title={hint}>{label}
      <input className="input mono" style={{ width: 64, textAlign: 'center' }} inputMode="numeric" value={d[k]} onChange={(e) => up(k, e.target.value)} />
    </label>
  );

  const n = result.rooms.length;
  const unit = preset === 'outdoor' ? ['construção', 'construções'] : preset === 'dungeon' ? ['sala', 'salas'] : ['cômodo', 'cômodos'];
  const kinds = preset !== 'dungeon' || furnish ? describeRooms(result.rooms) : '';
  const short = preset === 'dungeon' && n < params.rooms ? ` (cabem ${n} de ${params.rooms} neste tamanho)`
    : preset === 'outdoor' && n < params.rooms ? ` (couberam ${n} de ${params.rooms})` : '';

  return (
    <Modal open width={860} title="Gerar mapa" onClose={onClose}
      footer={<>
        <span className="tiny muted">Troca o terreno, as paredes, as portas e os móveis. Tokens vão para o piso mais próximo. Dá para desfazer.</span>
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={async () => { if (await onApply(params, seed)) onClose(); }}><Wand2 size={14} /> Aplicar</button>
      </>}>
      <div className="col gap-lg">
        <div className="row-wrap" style={{ gap: 6 }}>
          {(Object.keys(MAP_PRESETS) as MapPreset[]).map((p) => {
            const Icon = PRESET_ICONS[p];
            return (
              <button key={p} className={`map-swatch${preset === p ? ' on' : ''}`} title={MAP_PRESETS[p].hint} onClick={() => choosePreset(p)}>
                <Icon size={14} />{MAP_PRESETS[p].label}
              </button>
            );
          })}
        </div>
        <div className="tiny muted" style={{ marginTop: -8 }}>{MAP_PRESETS[preset].hint}</div>
        <div className="row-wrap" style={{ alignItems: 'flex-end' }}>
          {field('w', 'Largura', `${GEN_MIN_SIDE} a ${MAP_LIMITS.max}`)}
          {field('h', 'Altura', `${GEN_MIN_SIDE} a ${MAP_LIMITS.max}`)}
          {preset === 'house' && (
            <label className="field small secondary">Formato
              <select className="input" value={shape} onChange={(e) => setShape(e.target.value as HouseShape)}>
                {(Object.keys(HOUSE_SHAPES) as HouseShape[]).map((s) => <option key={s} value={s}>{HOUSE_SHAPES[s]}</option>)}
              </select>
            </label>
          )}
          {FIELDS[preset].map(([k, label, hint]) => field(k, label, hint))}
          <span className="spacer" />
          <button className="btn btn-sm" onClick={() => setSeed(newSeed())}><Dices size={14} /> Outra versão</button>
        </div>
        <label className="row small" title="Móveis de acordo com cada cômodo: camas nos quartos, bancos na nave, árvores no campo...">
          <input type="checkbox" checked={furnish} onChange={(e) => setFurnish(e.target.checked)} /> Mobília automática
        </label>
        <div className="tiny muted">
          {n} {unit[n === 1 ? 0 : 1]}{short}{kinds ? `: ${kinds}` : ''} · {result.doors.length} porta{result.doors.length === 1 ? '' : 's'}
          {furnish ? ` · ${result.props.length} móve${result.props.length === 1 ? 'l' : 'is'}` : ''} · {params.w} × {params.h}
        </div>
        <MapCanvas grid={result.layout} objects={objects} tokens={[]} fitKey={`gen:${preset}:${seed}:${params.w}x${params.h}`} height="min(52vh, 520px)" compact touch="pan" />
      </div>
    </Modal>
  );
}
