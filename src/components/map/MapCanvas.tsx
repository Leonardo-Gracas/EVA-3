// Desenho do mapa: terreno, grid, paredes e portas em SVG (unidade = quadrado);
// móveis e tokens por cima, em HTML, para usar os ícones e avatares do app.
// Zoom e pinça vêm da câmera do mural; quem usa o mapa decide o que o ponteiro faz.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Archive, Armchair, Bath, Bed, Box, CookingPot, Cylinder, Expand, Flame, Landmark, Library, Maximize2, Minimize2, Minus, Mountain,
  Package, PersonStanding, Plus, RectangleHorizontal, Shrub, Sofa, Square, Table2, TreePine,
} from 'lucide-react';
import type { AvatarConfig } from '../../model/avatar';
import type { CombatSide, EdgeRef, MapObject, PropKind, ThreatCategory } from '../../model/types';
import { PROP_KINDS, TERRAIN_CHAR } from '../../model/types';
import type { Point } from '../../rules/grid';
import Avatar from '../common/Avatar';
import { ThreatGlyph } from '../gm/ThreatIcon';
import { useBoardView } from '../investigation/useBoardView';
import { useFullscreen } from '../investigation/useFullscreen';
import { CELL, cellsPath, edgeCoords, gridPath, nearestEdge, runsPath, wallsPath } from './mapRender';
import { type RouteFn, useWalk } from './useWalk';

/** Tipo do arraste de "pôr no mapa" (painel de tokens → mapa). */
export const TOKEN_DRAG_TYPE = 'application/x-eva-place';

export interface CanvasToken {
  id: string;
  x: number;
  y: number;
  name: string;
  side: CombatSide;
  avatar?: AvatarConfig;
  category?: ThreatCategory;
  mine?: boolean;
  turn?: boolean;
  /** Oculto dos jogadores (só o mestre vê, esmaecido). */
  hidden?: boolean;
  /** Sendo arrastado: mostra onde está, sem caminhada. */
  dragging?: boolean;
  /** Caminho do último movimento (o token anda por ele). */
  trail?: Point[];
  /** Dá para pegar e arrastar: no toque, o gesto que começa nele não rola o mapa. */
  grab?: boolean;
}

export interface MapPointer {
  /** Posição em quadrados (fração). */
  fx: number;
  fy: number;
  /** Quadrado sob o ponteiro; null fora do mapa. */
  cell: Point | null;
  /** Linha do grid perto do ponteiro. */
  edge: EdgeRef | null;
  e: React.PointerEvent;
}

export type PointerKind = 'down' | 'move' | 'up' | 'tap' | 'leave';

export const PROP_ICONS: Record<PropKind, typeof Box> = {
  mesa: Table2, cadeira: Armchair, cama: Bed, estante: Library, barril: Cylinder, caixa: Archive,
  pilar: Landmark, estatua: PersonStanding, pedras: Mountain, arvore: TreePine,
  sofa: Sofa, fogao: CookingPot, banheira: Bath, bau: Package, altar: Flame, banco: RectangleHorizontal, arbusto: Shrub,
  outro: Square,
};

interface GridData { w: number; h: number; cells: string; wallsH: string; wallsV: string }

interface Props {
  grid: GridData;
  objects: MapObject[];
  tokens: CanvasToken[];
  /** Trocar enquadra de novo (outro mapa, outro tamanho). */
  fitKey: string;
  /** Quadrados destacados (alcance). */
  reach?: number[];
  /** Visão escura, jogador: soleiras à meia-luz (depois de porta fechada). */
  dim?: number[];
  /** Visão escura, mestre: o que nenhum jogador vê (sombra leve por cima). */
  fog?: number[];
  reachTone?: 'free' | 'request' | 'blocked';
  path?: Point[] | null;
  /** Texto no fim do caminho ("4 quadrados · 6 m"). */
  pathLabel?: string;
  /** Destino de pedido pendente. */
  ghosts?: Point[];
  /** Prévia de um traço do editor. */
  preview?: { cells?: number[]; edges?: EdgeRef[]; erase?: boolean; rect?: { x: number; y: number; w: number; h: number } } | null;
  selectedTokenId?: string | null;
  selectedObjectId?: string | null;
  hoverCell?: Point | null;
  hoverEdge?: EdgeRef | null;
  /** Mestre: desenha os ocultos esmaecidos/tracejados. */
  showHidden?: boolean;
  /** 'none': o toque desenha (ferramenta do editor); 'pan': um dedo rola o mapa. */
  touch?: 'none' | 'pan';
  edgeTolerance?: number;
  /** `down` devolve true quando usou o toque (senão o arraste com o mouse rola o mapa). */
  onPointer?: (kind: PointerKind, p: MapPointer) => boolean | void;
  /** Botões extras na barra do mapa. */
  dock?: ReactNode;
  /** Altura da área visível (fora da tela cheia). */
  height?: string;
  compact?: boolean;
  /** Caminho que o token percorre ao mudar de lugar (sem: linha reta). */
  route?: RouteFn;
  /** Soltar no mapa algo arrastado do painel (dados de TOKEN_DRAG_TYPE). */
  onDropToken?: (data: string, cell: Point) => void;
  /** Balão preso a um ponto do mapa (em quadrados), fora da escala do zoom. */
  popover?: { x: number; y: number; content: ReactNode } | null;
  /**
   * Leva a câmera até o quadrado (x, y). Cada `n` novo é um pedido; `zoom` é o zoom mínimo
   * e `ping` marca o quadrado com um pulso.
   */
  focus?: MapFocus | null;
  /** Acima do mapa e abaixo da barra, dentro da moldura: continuam à vista na tela cheia. */
  top?: ReactNode;
  bottom?: ReactNode;
}

export interface MapFocus { x: number; y: number; n: number; zoom?: number; ping?: boolean; smooth?: boolean }

const TAP_SLOP = 6;

export default function MapCanvas(props: Props) {
  const { grid, objects, tokens, fitKey, onPointer } = props;
  const { w, h } = grid;
  const uid = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useMemo(() => ({ w: w * CELL, h: h * CELL }), [w, h]);
  const view = useBoardView(wrapRef, `${fitKey}:${w}x${h}`, () => ({ x: 0, y: 0, w: w * CELL, h: h * CELL }), undefined, size);
  const fullscreen = useFullscreen();
  const pan = useRef<{ x: number; y: number; left: number; top: number; id: number } | null>(null);
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const walk = useWalk(tokens, props.route);
  const [dropCell, setDropCell] = useState<Point | null>(null);

  // Pedido de foco: depois do enquadramento inicial (que roda no quadro seguinte).
  const focus = props.focus;
  const centerOn = view.centerOn;
  useEffect(() => {
    if (!focus) return;
    const raf = requestAnimationFrame(() => centerOn(
      { x: (focus.x + 0.5) * CELL, y: (focus.y + 0.5) * CELL },
      { minZoom: focus.zoom, smooth: focus.smooth },
    ));
    return () => cancelAnimationFrame(raf);
    // Só um pedido novo (outro `n`) move a câmera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n, centerOn]);

  const layers = useMemo(() => ({
    floor: runsPath(grid.cells, w, h, TERRAIN_CHAR.floor),
    difficult: runsPath(grid.cells, w, h, TERRAIN_CHAR.difficult),
    stairs: runsPath(grid.cells, w, h, TERRAIN_CHAR.stairs),
    grid: gridPath(w, h),
  }), [grid.cells, w, h]);
  // Porta aberta é passagem: a parede da linha dela não é desenhada (ficam só os batentes).
  const walls = useMemo(() => {
    const open = objects.filter((o): o is Extract<MapObject, { kind: 'door' }> => o.kind === 'door' && o.state === 'open');
    if (!open.length) return wallsPath(grid.wallsH, grid.wallsV, w, h);
    const wh = grid.wallsH.split('');
    const wv = grid.wallsV.split('');
    for (const d of open) {
      const { o, x, y } = d.edge;
      if (o === 'h' && x >= 0 && x < w && y >= 0 && y <= h) wh[y * w + x] = '0';
      if (o === 'v' && x >= 0 && x <= w && y >= 0 && y < h) wv[y * (w + 1) + x] = '0';
    }
    return wallsPath(wh.join(''), wv.join(''), w, h);
  }, [grid.wallsH, grid.wallsV, w, h, objects]);
  const reachD = useMemo(() => (props.reach?.length ? cellsPath(props.reach, w) : ''), [props.reach, w]);
  const dimD = useMemo(() => (props.dim?.length ? cellsPath(props.dim, w) : ''), [props.dim, w]);
  const fogD = useMemo(() => (props.fog?.length ? cellsPath(props.fog, w) : ''), [props.fog, w]);
  const previewD = useMemo(() => (props.preview?.cells?.length ? cellsPath(props.preview.cells, w) : ''), [props.preview, w]);

  const pointerAt = (e: React.PointerEvent): MapPointer => {
    const b = view.clientToBoard(e.clientX, e.clientY);
    const fx = b.x / CELL;
    const fy = b.y / CELL;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    const tol = props.edgeTolerance ?? (e.pointerType === 'touch' ? 0.42 : 0.28);
    return {
      fx, fy,
      cell: cx >= 0 && cy >= 0 && cx < w && cy < h ? { x: cx, y: cy } : null,
      edge: nearestEdge(fx, fy, w, h, tol),
      e,
    };
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    press.current = { x: e.clientX, y: e.clientY, moved: false };
    const usedByTool = e.button === 0 && !!onPointer?.('down', pointerAt(e));
    const wrap = wrapRef.current;
    // Mouse: arrastar o fundo (ou com o botão do meio) rola o mapa.
    if (!usedByTool && wrap && e.pointerType === 'mouse' && (e.button === 0 || e.button === 1)) {
      pan.current = { x: e.clientX, y: e.clientY, left: wrap.scrollLeft, top: wrap.scrollTop, id: e.pointerId };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    } else if (usedByTool) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (p && !p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_SLOP) p.moved = true;
    const pn = pan.current;
    const wrap = wrapRef.current;
    if (pn && wrap && pn.id === e.pointerId) {
      wrap.scrollLeft = pn.left - (e.clientX - pn.x);
      wrap.scrollTop = pn.top - (e.clientY - pn.y);
      return;
    }
    onPointer?.('move', pointerAt(e));
  };

  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    press.current = null;
    if (pan.current?.id === e.pointerId) pan.current = null;
    const at = pointerAt(e);
    onPointer?.('up', at);
    if (p && !p.moved && e.button === 0) onPointer?.('tap', at);
  };

  const onCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    press.current = null;
    if (pan.current?.id === e.pointerId) pan.current = null;
    onPointer?.('leave', pointerAt(e));
  };

  const cellOf = (clientX: number, clientY: number): Point | null => {
    const b = view.clientToBoard(clientX, clientY);
    const cx = Math.floor(b.x / CELL);
    const cy = Math.floor(b.y / CELL);
    return cx >= 0 && cy >= 0 && cx < w && cy < h ? { x: cx, y: cy } : null;
  };
  const dropHandlers = props.onDropToken ? {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(TOKEN_DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const c = cellOf(e.clientX, e.clientY);
      if (c?.x !== dropCell?.x || c?.y !== dropCell?.y) setDropCell(c);
    },
    // Só conta como "saiu" quando deixa o mapa de verdade (não ao passar de um desenho a outro).
    onDragLeave: (e: React.DragEvent) => {
      const next = e.relatedTarget as Node | null;
      if (!next || !e.currentTarget.contains(next)) setDropCell(null);
    },
    onDrop: (e: React.DragEvent) => {
      const data = e.dataTransfer.getData(TOKEN_DRAG_TYPE);
      const c = cellOf(e.clientX, e.clientY);
      setDropCell(null);
      if (!data || !c) return;
      e.preventDefault();
      props.onDropToken!(data, c);
    },
  } : {};

  const zoom = view.zoom;
  const last = props.path && props.path.length > 1 ? props.path[props.path.length - 1] : null;
  const tone = props.reachTone ?? 'free';

  return (
    <div className={`map-shell${fullscreen.full ? ' map-full' : ''}${props.compact ? ' map-compact' : ''}`}>
      {props.top}
      <div ref={wrapRef} className={`map-wrap${props.touch === 'none' ? ' map-touch-draw' : ''}`}
        style={fullscreen.full ? undefined : { height: props.height ?? 'min(70vh, 760px)' }}>
        <div style={{ width: size.w * zoom, height: size.h * zoom, position: 'relative' }}>
          <div className="map-board" style={{ width: size.w, height: size.h, transform: `scale(${zoom})` }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}
            onPointerLeave={(e) => { if (!press.current) onPointer?.('leave', pointerAt(e)); }}
            onContextMenu={(e) => e.preventDefault()}
            // Nada dentro do mapa vira arraste nativo do navegador (imagem dos avatares etc.).
            onDragStart={(e) => e.preventDefault()}
            {...dropHandlers}>
            <svg className="map-svg" width={size.w} height={size.h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
              <defs>
                <pattern id={`dif${uid}`} patternUnits="userSpaceOnUse" width={0.34} height={0.34} patternTransform="rotate(45)">
                  <rect width={0.34} height={0.34} className="map-floor" />
                  <line x1={0} y1={0} x2={0} y2={0.34} className="map-dif-line" />
                </pattern>
                <pattern id={`st${uid}`} patternUnits="userSpaceOnUse" width={1} height={0.25}>
                  <rect width={1} height={0.25} className="map-floor" />
                  <line x1={0} y1={0.04} x2={1} y2={0.04} className="map-stair-line" />
                </pattern>
              </defs>
              <rect width={w} height={h} className="map-void" />
              <path d={layers.floor} className="map-floor" />
              <path d={layers.difficult} fill={`url(#dif${uid})`} />
              <path d={layers.stairs} fill={`url(#st${uid})`} />
              <path d={layers.grid} className="map-grid" />
              {dimD && <path d={dimD} className="map-dim" />}
              {fogD && <path d={fogD} className="map-fog" />}
              {reachD &&<path d={reachD} className={`map-reach map-reach-${tone}`} />}
              {previewD && <path d={previewD} className={`map-preview${props.preview?.erase ? ' map-preview-erase' : ''}`} />}
              {props.preview?.rect && (
                <rect x={props.preview.rect.x + 0.06} y={props.preview.rect.y + 0.06} width={props.preview.rect.w - 0.12} height={props.preview.rect.h - 0.12}
                  className="map-preview-rect" />
              )}
              <path d={walls} className="map-walls" />
              {props.preview?.edges?.map((e) => {
                const [x1, y1, x2, y2] = edgeCoords(e);
                return <line key={`${e.o}${e.x},${e.y}`} x1={x1} y1={y1} x2={x2} y2={y2} className={`map-edge-preview${props.preview?.erase ? ' map-preview-erase' : ''}`} />;
              })}
              {objects.map((o) => (o.kind === 'door'
                ? <Door key={o.id} edge={o.edge} state={o.state} hidden={o.hidden && !!props.showHidden} selected={props.selectedObjectId === o.id} />
                : null))}
              {props.hoverEdge && (() => {
                const [x1, y1, x2, y2] = edgeCoords(props.hoverEdge);
                return <line x1={x1} y1={y1} x2={x2} y2={y2} className="map-edge-hover" />;
              })()}
              {props.hoverCell && <rect x={props.hoverCell.x} y={props.hoverCell.y} width={1} height={1} className="map-cell-hover" />}
              {props.ghosts?.map((g, i) => (
                <rect key={i} x={g.x + 0.12} y={g.y + 0.12} width={0.76} height={0.76} rx={0.38} className="map-ghost" />
              ))}
              {dropCell && <rect x={dropCell.x + 0.06} y={dropCell.y + 0.06} width={0.88} height={0.88} rx={0.44} className="map-drop-cell" />}
              {walk.trails.map((t) => (
                <polyline key={t.id} points={t.points.map((p) => `${p.x + 0.5},${p.y + 0.5}`).join(' ')} className="map-trail" />
              ))}
              {props.path && props.path.length > 1 && (
                <>
                  <polyline points={props.path.map((p) => `${p.x + 0.5},${p.y + 0.5}`).join(' ')} className="map-path" />
                  {props.path.slice(1).map((p, i) => <circle key={i} cx={p.x + 0.5} cy={p.y + 0.5} r={0.08} className="map-path-dot" />)}
                </>
              )}
              {focus?.ping && <circle key={focus.n} cx={focus.x + 0.5} cy={focus.y + 0.5} r={0.62} className="map-ping" />}
            </svg>
            {objects.map((o) => (o.kind === 'prop' && (!o.hidden || props.showHidden) ? (
              <PropView key={o.id} o={o} selected={props.selectedObjectId === o.id} />
            ) : null))}
            {tokens.map((t) => {
              const at = walk.pos.get(t.id);
              return (
              <div key={t.id} title={t.name}
                className={`map-token side-${t.side}${t.mine ? ' mine' : ''}${t.turn ? ' turn' : ''}${t.hidden ? ' is-hidden' : ''}${t.grab ? ' grab' : ''}${props.selectedTokenId === t.id ? ' selected' : ''}${at || t.dragging ? ' walking' : ''}`}
                style={{ left: (at?.x ?? t.x) * CELL, top: (at?.y ?? t.y) * CELL, width: CELL, height: CELL }}>
                {t.category
                  ? <span className={`map-token-threat threat-cat-${t.category}`}><ThreatGlyph category={t.category} size={18} /></span>
                  : <Avatar config={t.avatar} size={CELL - 8} />}
              </div>
              );
            })}
            {last && props.pathLabel && (
              <div className="map-path-label" style={{ left: (last.x + 0.5) * CELL, top: last.y * CELL - 4 }}>{props.pathLabel}</div>
            )}
          </div>
          {props.popover && (() => {
            // Fica dentro do mapa: preso nas laterais e, perto do topo, abre para baixo.
            const px = props.popover.x * CELL * zoom;
            const py = props.popover.y * CELL * zoom;
            const half = 100;
            const left = Math.max(half, Math.min(size.w * zoom - half, px));
            const below = py < 120;
            return (
              <div className={`map-popover${below ? ' below' : ''}`} style={{ left, top: py, ['--arrow' as string]: `${Math.max(-76, Math.min(76, px - left))}px` }}
                onPointerDown={(e) => e.stopPropagation()}>
                {props.popover.content}
              </div>
            );
          })()}
        </div>
      </div>
      <div className="map-dock">
        {props.dock}
        <span className="spacer" />
        {/* No toque, a pinça faz o zoom: os botões de zoom saem para dar espaço. */}
        <button className="btn btn-sm btn-ghost btn-icon map-zoom-btn" onClick={() => view.zoomBy(1 / 1.2)} title="Afastar" aria-label="Afastar"><Minus size={14} /></button>
        <button className="btn btn-sm btn-ghost mono map-zoom map-zoom-btn" onClick={() => view.zoomTo(1)} title="Zoom 100%">{Math.round(zoom * 100)}%</button>
        <button className="btn btn-sm btn-ghost btn-icon map-zoom-btn" onClick={() => view.zoomBy(1.2)} title="Aproximar" aria-label="Aproximar"><Plus size={14} /></button>
        <button className="btn btn-sm btn-ghost btn-icon" onClick={view.fit} title="Enquadrar o mapa" aria-label="Enquadrar o mapa"><Expand size={14} /></button>
        <button className="btn btn-sm btn-ghost btn-icon" onClick={fullscreen.toggle} title={fullscreen.full ? 'Sair da tela cheia' : 'Tela cheia'}
          aria-label={fullscreen.full ? 'Sair da tela cheia' : 'Tela cheia'}>
          {fullscreen.full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
      {props.bottom}
    </div>
  );
}

function Door({ edge, state, hidden, selected }: { edge: EdgeRef; state: string; hidden: boolean; selected: boolean }) {
  const [x1, y1, x2, y2] = edgeCoords(edge);
  const horiz = edge.o === 'h';
  const t = 0.2;
  // Folha da porta: retângulo ao longo da linha, deixando os batentes nas pontas.
  const leaf = horiz
    ? { x: x1 + 0.14, y: y1 - t / 2, width: 0.72, height: t }
    : { x: x1 - t / 2, y: y1 + 0.14, width: t, height: 0.72 };
  const cls = `map-door map-door-${state}${hidden ? ' is-hidden' : ''}${selected ? ' selected' : ''}`;
  if (state === 'open') {
    // Aberta: a folha gira 90° a partir da dobradiça.
    const hx = horiz ? x1 + 0.14 : x1;
    const hy = horiz ? y1 : y1 + 0.14;
    const ex = horiz ? hx : hx + 0.72;
    const ey = horiz ? hy + 0.72 : hy;
    return (
      <g className={cls}>
        <line x1={x1} y1={y1} x2={horiz ? x1 + 0.14 : x1} y2={horiz ? y1 : y1 + 0.14} className="map-door-jamb" />
        <line x1={horiz ? x2 - 0.14 : x2} y1={horiz ? y2 : y2 - 0.14} x2={x2} y2={y2} className="map-door-jamb" />
        <line x1={hx} y1={hy} x2={ex} y2={ey} className="map-door-swing" />
      </g>
    );
  }
  return (
    <g className={cls}>
      <rect {...leaf} rx={0.04} className="map-door-leaf" />
      {state === 'locked' && <circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={0.06} className="map-door-lock" />}
    </g>
  );
}

function PropView({ o, selected }: { o: Extract<MapObject, { kind: 'prop' }>; selected: boolean }) {
  const Icon = PROP_ICONS[o.prop] ?? Box;
  const iconSize = Math.round(CELL * Math.min(0.62, 0.42 + 0.1 * Math.min(o.w, o.h)));
  return (
    <div className={`map-prop map-prop-${o.effect}${o.hidden ? ' is-hidden' : ''}${selected ? ' selected' : ''}`}
      title={o.label || PROP_KINDS[o.prop].label}
      style={{ left: o.x * CELL + 3, top: o.y * CELL + 3, width: o.w * CELL - 6, height: o.h * CELL - 6 }}>
      <Icon size={iconSize} />
    </div>
  );
}
