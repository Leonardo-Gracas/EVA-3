// Gerador de mapas: tipo, andares, prévia e opções avançadas. Usado ao criar um mapa (com nome,
// em branco e andares) e no editor, para gerar de novo o mapa aberto.
import { useMemo, useState } from 'react';
import { BedDouble, Castle, ChevronDown, ChevronRight, Church, Dices, Home, Square, Trees, Wand2 } from 'lucide-react';
import type { HouseModel, HouseShape, HouseSize, MapGenParams, MapObject, MapPreset, Terrain } from '../../model/types';
import { HOUSE_MODELS, HOUSE_SHAPES, HOUSE_SIZES, MAP_CELL_M, MAP_LIMITS, MAP_PRESETS } from '../../model/types';
import {
  cleanMapParams, describeRooms, GEN_MIN_SIDE, generateFloors, houseModelDefaults, MAP_GEN_DEFAULTS, maxFloors, newMapSize, PRESET_DEFAULTS,
} from '../../rules/mapgen';
import { newSeed } from '../../rules/random';
import Modal from '../common/Modal';
import MapCanvas from './MapCanvas';

type NumKey = 'w' | 'h' | 'rooms' | 'roomMin' | 'roomMax' | 'corridor' | 'doors';
type Draft = Record<NumKey, string>;

/** Tipo escolhido na tela: o mapa em branco ou um dos geradores (casa e hospedagem usam o mesmo, com modelos diferentes). */
export type GenKind = 'blank' | 'dungeon' | 'house' | 'inn' | 'temple' | 'outdoor';

const KINDS: Record<GenKind, { label: string; hint: string; icon: typeof Home; preset: MapPreset }> = {
  blank: { label: 'Em branco', hint: 'Mapa vazio, para desenhar à mão. Dá para gerar depois, dentro do mapa.', icon: Square, preset: 'dungeon' },
  dungeon: { label: 'Masmorra', hint: MAP_PRESETS.dungeon.hint, icon: Castle, preset: 'dungeon' },
  house: { label: 'Casa', hint: 'Casebre, casa ou casarão, com quintal em volta.', icon: Home, preset: 'house' },
  inn: { label: 'Hospedagem', hint: 'Estalagem ou hotel: taverna ou recepção na frente e corredores de quartos.', icon: BedDouble, preset: 'house' },
  temple: { label: 'Templo', hint: MAP_PRESETS.temple.hint, icon: Church, preset: 'temple' },
  outdoor: { label: 'Cenário aberto', hint: MAP_PRESETS.outdoor.hint, icon: Trees, preset: 'outdoor' },
};

/** Grupo de modelos de cada tipo de prédio e o modelo de partida. */
const BUILDING: Partial<Record<GenKind, { group: 'Casas' | 'Hospedagem'; model: HouseModel }>> = {
  house: { group: 'Casas', model: 'casa' },
  inn: { group: 'Hospedagem', model: 'estalagem' },
};

/** Campos avançados de cada tipo (rótulo e dica). */
const FIELDS: Record<MapPreset, Array<[NumKey, string, string?]>> = {
  dungeon: [
    ['rooms', 'Salas', '1 a 40 (cabem menos em mapas pequenos)'], ['roomMin', 'Sala mín.'], ['roomMax', 'Sala máx.'],
    ['corridor', 'Corredor', 'Largura: 1 a 3 quadrados'], ['doors', 'Portas %', 'Chance de cada entrada de sala ter porta'],
  ],
  house: [
    ['rooms', 'Quartos'], ['corridor', 'Corredor', 'Largura: 1 a 3 quadrados'],
    ['doors', 'Portas %', 'Chance de quartos, banheiros e despensas terem porta (senão fica só o vão)'],
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

const clampSide = (v: string) => Math.max(MAP_LIMITS.min, Math.min(MAP_LIMITS.max, parseInt(v, 10) || 0));

/**
 * Estado do gerador. `fixed`: tamanho do mapa aberto (o editor gera por cima dele);
 * sem ele, cada tipo começa no tamanho sugerido.
 */
export function useMapGen({ fixed, blank: allowBlank = false }: { fixed?: { w: number; h: number }; blank?: boolean } = {}) {
  const [kind, setKind] = useState<GenKind>('dungeon');
  const [shape, setShape] = useState<HouseShape>('random');
  const [model, setModel] = useState<HouseModel>('casa');
  const [size, setSize] = useState<HouseSize>('normal');
  /** Janelas, iluminação e mobília: uma marcação só. */
  const [extras, setExtras] = useState(true);
  const [floorsWanted, setFloors] = useState(1);
  const [advanced, setAdvanced] = useState(false);
  const sizeFor = (p: MapPreset, m: HouseModel) => (fixed
    ? { w: Math.max(fixed.w, GEN_MIN_SIDE), h: Math.max(fixed.h, GEN_MIN_SIDE) }
    : newMapSize(p, m));
  const [d, setD] = useState<Draft>(() => toDraft(cleanMapParams({ ...MAP_GEN_DEFAULTS, ...sizeFor('dungeon', 'casa') })));
  const [seed, setSeed] = useState(newSeed);
  const [blank, setBlank] = useState<{ w: string; h: string; fill: Terrain; walls: boolean }>({ w: '30', h: '20', fill: 'floor', walls: true });
  /** Andar mostrado na prévia. */
  const [view, setView] = useState(0);

  const preset: MapPreset = KINDS[kind].preset;
  const floorMax = fixed ? 1 : maxFloors(preset, model);
  const floors = Math.min(floorsWanted, floorMax);
  const params = useMemo(() => {
    const n = (k: NumKey) => parseInt(d[k], 10);
    return cleanMapParams({
      preset, shape, model, size, furnish: extras, lights: extras, floors,
      w: n('w'), h: n('h'), rooms: n('rooms'), roomMin: n('roomMin'), roomMax: n('roomMax'), corridor: n('corridor'),
      doors: (n('doors') || 0) / 100,
    });
  }, [d, preset, shape, model, size, extras, floors]);
  const result = useMemo(() => (kind === 'blank' ? [] : generateFloors(params, seed)), [kind, params, seed]);

  const chooseModel = (m: HouseModel) => {
    setModel(m);
    if (shape !== 'random' && !HOUSE_MODELS[m].shapes.includes(shape)) setShape('random');
    const s = sizeFor('house', m);
    setD((x) => ({ ...x, ...toDraft({ ...params, ...houseModelDefaults(m) }), ...(fixed ? { w: x.w, h: x.h } : { w: String(s.w), h: String(s.h) }) }));
  };

  const choose = (k: GenKind) => {
    if (k === kind) return;
    setKind(k);
    setView(0);
    if (k === 'blank') return;
    const b = BUILDING[k];
    if (b) {
      // Casa e hospedagem: o modelo vem do grupo do tipo (fica o atual, se já for dele).
      chooseModel(HOUSE_MODELS[model].group === b.group ? model : b.model);
      return;
    }
    const p = KINDS[k].preset;
    const s = sizeFor(p, model);
    setD((x) => ({ ...x, ...toDraft({ ...params, ...PRESET_DEFAULTS[p] }), ...(fixed ? { w: x.w, h: x.h } : { w: String(s.w), h: String(s.h) }) }));
  };

  const blankSize = { w: clampSide(blank.w), h: clampSide(blank.h) };

  return {
    allowBlank, fixed: !!fixed, kind, choose, preset, shape, setShape, model, chooseModel, size, setSize, extras, setExtras,
    floors, floorMax, setFloors, advanced, setAdvanced, d, setD, seed, reroll: () => setSeed(newSeed()),
    blank, setBlank, blankSize, params, result, view: Math.min(view, Math.max(0, result.length - 1)), setView,
  };
}

export type MapGen = ReturnType<typeof useMapGen>;

/** Escolha do tipo, andares, a marcação de janelas/luz/mobília e as opções avançadas. */
export function MapGenOptions({ g }: { g: MapGen }) {
  const { kind, preset, model, d, setD } = g;
  const info = HOUSE_MODELS[model];
  const building = BUILDING[kind];
  const kinds = (Object.keys(KINDS) as GenKind[]).filter((k) => k !== 'blank' || g.allowBlank);
  const hint = building ? `${info.label}: ${info.hint}` : KINDS[kind].hint;
  const up = (k: NumKey, v: string) => setD((x) => ({ ...x, [k]: v.replace(/\D/g, '') }));
  const hints: Partial<Record<NumKey, string>> = kind === 'inn'
    ? { rooms: `${info.rooms[0]} a ${info.rooms[1]} quartos de hóspede por andar` }
    : kind === 'house'
      ? { rooms: `${info.rooms[0]} a ${info.rooms[1]}${g.floors > 1 ? '. Com mais de um andar, a maioria dos quartos fica em cima' : ''}` }
      : {};
  // Casebre não tem corredor.
  const fields = kind === 'blank' ? [] : FIELDS[preset].filter(([k]) => !(model === 'casebre' && preset === 'house' && k === 'corridor'));
  const shapes: HouseShape[] = info.shapes.length > 1 ? ['random', ...info.shapes] : [...info.shapes];
  const shapeOn = (s: HouseShape) => (info.shapes.length > 1 ? g.shape === s : true);
  const numField = (k: NumKey, label: string, tip?: string) => (
    <label key={k} className="field small secondary" title={tip}>{label}
      <input className="input mono" style={{ width: 64, textAlign: 'center' }} inputMode="numeric" value={d[k]} onChange={(e) => up(k, e.target.value)} />
    </label>
  );
  const sideField = (k: 'w' | 'h', label: string) => (
    <label className="field small secondary" title={`${MAP_LIMITS.min} a ${MAP_LIMITS.max}`}>{label}
      <input className="input mono" style={{ width: 64, textAlign: 'center' }} inputMode="numeric" value={g.blank[k]}
        onChange={(e) => g.setBlank((x) => ({ ...x, [k]: e.target.value.replace(/\D/g, '') }))} />
    </label>
  );

  // Resumo do que está valendo, para quem não abre as opções avançadas.
  const p = g.params;
  const summary = kind === 'blank'
    ? `${g.blankSize.w} × ${g.blankSize.h} quadrados · ${g.blank.fill === 'floor' ? 'piso livre' : 'tudo vazio'}${g.blank.fill === 'floor' && g.blank.walls ? ', parede em volta' : ''}`
    : [
      `${p.w} × ${p.h} quadrados`,
      kind === 'dungeon' ? `${p.rooms} salas`
        : building ? `${p.rooms} quarto${p.rooms === 1 ? '' : 's'}${kind === 'inn' && g.floors > 1 ? ' por andar' : ''}`
        : kind === 'outdoor' ? `${p.rooms} construç${p.rooms === 1 ? 'ão' : 'ões'}` : '',
      building ? `cômodos ${HOUSE_SIZES[p.size].toLowerCase()}` : '',
      `portas ${Math.round(p.doors * 100)}%`,
    ].filter(Boolean).join(' · ');

  return (
    <div className="col">
      <div className="row-wrap" style={{ gap: 6 }}>
        {kinds.map((k) => {
          const Icon = KINDS[k].icon;
          return (
            <button key={k} type="button" className={`map-swatch${kind === k ? ' on' : ''}`} title={KINDS[k].hint} onClick={() => g.choose(k)}>
              <Icon size={14} />{KINDS[k].label}
            </button>
          );
        })}
      </div>
      <div className="tiny muted">{hint}</div>

      {(building || g.floorMax > 1) && (
        <div className="row-wrap gen-pickers">
          {building && (
            <div className="field small secondary">
              <span>Modelo</span>
              <div className="seg" role="group" aria-label="Modelo">
                {(Object.keys(HOUSE_MODELS) as HouseModel[]).filter((m) => HOUSE_MODELS[m].group === building.group).map((m) => (
                  <button key={m} type="button" className={model === m ? 'on-inherit' : ''} title={HOUSE_MODELS[m].hint}
                    onClick={() => g.chooseModel(m)}>{HOUSE_MODELS[m].label}</button>
                ))}
              </div>
            </div>
          )}
          {building && (
            <div className="field small secondary">
              <span>Formato</span>
              <div className="seg" role="group" aria-label="Formato">
                {shapes.map((s) => (
                  <button key={s} type="button" className={shapeOn(s) ? 'on-inherit' : ''} disabled={info.shapes.length <= 1}
                    title={info.shapes.length <= 1 ? `${info.label}: só tem este formato` : undefined}
                    onClick={() => g.setShape(s)}>{HOUSE_SHAPES[s]}</button>
                ))}
              </div>
            </div>
          )}
          {g.floorMax > 1 && (
            <div className="field small secondary">
              <span title={kind === 'dungeon' ? 'Níveis da masmorra, um embaixo do outro, ligados por escadas'
                : kind === 'inn' ? 'Andares da hospedagem, com quartos em todos, ligados por uma escada no cômodo da entrada'
                  : 'Andares da casa, ligados por uma escada no cômodo da entrada. A maioria dos quartos fica em cima.'}>
                {kind === 'dungeon' ? 'Níveis' : 'Andares'}
              </span>
              <div className="seg" role="group" aria-label={kind === 'dungeon' ? 'Níveis' : 'Andares'}>
                {Array.from({ length: g.floorMax }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" className={g.floors === n ? 'on-inherit' : ''} style={{ minWidth: 32 }}
                    onClick={() => { g.setFloors(n); g.setView(0); }}>{n}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {kind !== 'blank' && (
        <label className="row small" title="Móveis de acordo com cada cômodo (camas nos quartos, bancos na nave, árvores no campo); janelas nas paredes que dão para fora; velas, lareiras, lustres, lampiões e tochas acesos.">
          <input type="checkbox" checked={g.extras} onChange={(e) => g.setExtras(e.target.checked)} /> Janelas, iluminação e mobília automáticas
        </label>
      )}

      <div className="col" style={{ gap: 8 }}>
        <button type="button" className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start', paddingLeft: 4 }}
          onClick={() => g.setAdvanced(!g.advanced)} aria-expanded={g.advanced}>
          {g.advanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Opções avançadas
          {!g.advanced && <span className="tiny muted" style={{ marginLeft: 6 }}>{summary}</span>}
        </button>
        {g.advanced && (kind === 'blank' ? (
          <div className="col">
            <div className="row-wrap" style={{ alignItems: 'flex-end' }}>
              {sideField('w', 'Largura')}
              {sideField('h', 'Altura')}
              <span className="tiny muted" style={{ paddingBottom: 8 }}>
                = {(g.blankSize.w * MAP_CELL_M).toLocaleString('pt-BR')} × {(g.blankSize.h * MAP_CELL_M).toLocaleString('pt-BR')} m
              </span>
            </div>
            <div className="row-wrap">
              <button type="button" className={`chip${g.blank.fill === 'floor' ? ' on' : ''}`} onClick={() => g.setBlank((x) => ({ ...x, fill: 'floor' }))}>Piso livre</button>
              <button type="button" className={`chip${g.blank.fill === 'void' ? ' on' : ''}`} onClick={() => g.setBlank((x) => ({ ...x, fill: 'void' }))}>Tudo vazio (para escavar)</button>
              {g.blank.fill === 'floor' && (
                <label className="row small"><input type="checkbox" checked={g.blank.walls} onChange={(e) => g.setBlank((x) => ({ ...x, walls: e.target.checked }))} /> Parede em volta</label>
              )}
            </div>
          </div>
        ) : (
          <div className="row-wrap gen-pickers">
            {numField('w', 'Largura', `${GEN_MIN_SIDE} a ${MAP_LIMITS.max}`)}
            {numField('h', 'Altura', `${GEN_MIN_SIDE} a ${MAP_LIMITS.max}`)}
            {building && (
              <div className="field small secondary" title="Medida de cada cômodo (1 quadrado = 1,5 m)">
                <span>Cômodos</span>
                <div className="seg" role="group" aria-label="Tamanho dos cômodos">
                  {(Object.keys(HOUSE_SIZES) as HouseSize[]).map((s) => (
                    <button key={s} type="button" className={g.size === s ? 'on-inherit' : ''} onClick={() => g.setSize(s)}>{HOUSE_SIZES[s]}</button>
                  ))}
                </div>
              </div>
            )}
            {fields.map(([k, label, tip]) => numField(k, label, hints[k] ?? tip))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Prévia do mapa gerado, com os andares em abas. */
export function MapGenPreview({ g, height = 'min(46vh, 460px)' }: { g: MapGen; height?: string }) {
  const { result, params, kind } = g;
  const floor = result[g.view];
  const objects = useMemo<MapObject[]>(() => (floor ? [
    ...floor.doors.map((edge, i) => ({ id: `p${i}`, kind: 'door' as const, edge, state: 'closed' as const, hidden: false })),
    ...floor.props.map((pr, i) => ({ id: `m${i}`, kind: 'prop' as const, ...pr, hidden: false })),
    ...floor.windows.map((edge, i) => ({ id: `j${i}`, kind: 'window' as const, edge, hidden: false })),
    ...floor.lights.map((l, i) => ({ id: `l${i}`, kind: 'light' as const, ...l, lit: true, hidden: false })),
  ] : []), [floor]);
  if (kind === 'blank' || !floor) return null;

  const n = floor.rooms.length;
  const unit = kind === 'outdoor' ? ['construção', 'construções'] : kind === 'dungeon' ? ['sala', 'salas'] : ['cômodo', 'cômodos'];
  const kinds = kind !== 'dungeon' || params.furnish ? describeRooms(floor.rooms) : '';
  // Na casa de vários andares, os quartos da planta mudam de andar: vale o que coube na planta.
  const fitted = floor.fitted ?? floor.rooms.filter((rm) => rm.kind === 'quarto').length;
  const short = g.view > 0 ? ''
    : kind === 'dungeon' && n < params.rooms ? ` (cabem ${n} de ${params.rooms} neste tamanho)`
    : kind === 'outdoor' && n < params.rooms ? ` (couberam ${n} de ${params.rooms})`
    : g.preset === 'house' && fitted < params.rooms ? ` (couberam ${fitted} de ${params.rooms} quartos neste mapa)` : '';
  const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row-wrap" style={{ gap: 6 }}>
        {result.length > 1 && (
          <div className="seg" role="tablist" aria-label="Andar da prévia">
            {result.map((f, i) => (
              <button key={i} type="button" role="tab" aria-selected={g.view === i} className={g.view === i ? 'on-inherit' : ''} onClick={() => g.setView(i)}>{f.label}</button>
            ))}
          </div>
        )}
        <span className="spacer" />
        <button type="button" className="btn btn-sm" onClick={g.reroll}><Dices size={14} /> Outra versão</button>
      </div>
      <div className="tiny muted">
        {n} {unit[n === 1 ? 0 : 1]}{short}{kinds ? `: ${kinds}` : ''} · {plural(floor.doors.length, 'porta', 'portas')}
        {params.furnish ? ` · ${plural(floor.props.length, 'móvel', 'móveis')}` : ''}
        {params.lights ? ` · ${plural(floor.windows.length, 'janela', 'janelas')} · ${plural(floor.lights.length, 'luz', 'luzes')}` : ''}
        {result.length > 1 ? ` · escada para ${result.length === 2 ? 'o outro andar' : 'os andares vizinhos'}` : ''}
      </div>
      <MapCanvas grid={floor.layout} objects={objects} tokens={[]} fitKey={`gen:${kind}:${g.model}:${g.seed}:${params.w}x${params.h}:${g.view}`}
        height={height} compact touch="pan" />
    </div>
  );
}

/** Editor: gera de novo o mapa aberto (um andar, no tamanho dele). */
export default function MapGenerateModal({ w, h, onApply, onClose }: {
  w: number; h: number;
  onApply: (params: MapGenParams, seed: number) => Promise<boolean>;
  onClose: () => void;
}) {
  const g = useMapGen({ fixed: { w, h } });
  return (
    <Modal open width={860} title="Gerar mapa" onClose={onClose}
      footer={<>
        <span className="tiny muted">Troca o terreno, as paredes, as portas e os móveis. Tokens vão para o piso mais próximo. Dá para desfazer.</span>
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={async () => { if (await onApply(g.params, g.seed)) onClose(); }}><Wand2 size={14} /> Aplicar</button>
      </>}>
      <div className="col gap-lg">
        <MapGenOptions g={g} />
        <MapGenPreview g={g} height="min(52vh, 520px)" />
      </div>
    </Modal>
  );
}
