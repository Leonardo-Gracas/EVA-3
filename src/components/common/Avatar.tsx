import { memo } from 'react';
import {
  BACKGROUNDS, EYE_COLORS, HAIR_COLORS, OUTFITS, sanitizeAvatar, SKINS,
  type AvatarConfig, type BrowsId, type FaceId, type OutfitId,
} from '../../model/avatar';

// Desenho minimalista em 64×64: formas chapadas, sem gradiente nem sombra.
// O recorte redondo vem do CSS (.avatar), assim não há ids de <clipPath> repetidos na página.
//
// Três-quartos virado alguns graus para a direita: a linha do rosto (olhos, nariz,
// boca) corre ~3 unidades para a direita, o olho, a sobrancelha e a bochecha do lado
// de lá ficam estreitos (escala), só a orelha de cá aparece e o queixo acompanha o giro.

/** Olho de cá (maior) e olho de lá (achatado na horizontal pelo giro). */
const EYE_NEAR = { x: 29.5, sx: 1 };
const EYE_FAR = { x: 40.8, sx: 0.78 };
const EYE_Y = 29.5;
const BROW_Y = 25.4;
const MOUTH_IN = '#7e4f4f';
const SHIRT = '#e8dfd0';
const HAIR_TIE = '#2e2420';
/** Roupas com capuz: `inner` é o fundo da abertura, `edge` a borda do tecido em volta do rosto. */
const HOODS: Partial<Record<OutfitId, { inner: string; edge: string }>> = {
  capuz: { inner: '#5a5654', edge: '#9a958f' },
  tunica_capuz: { inner: '#1b181b', edge: '#4f4750' },
};
/**
 * O capuz é a mesma peça da roupa: o tecido sai dos ombros, contorna a cabeça (HOOD_OUTER,
 * que entra por baixo do tronco e funde com ele) e volta pela frente numa gola dobrada
 * sob o queixo (HOOD_COWL), que liga os dois lados. Desenhado sobre o oval, como o cabelo.
 */
const HOOD_OUTER = 'M13 52 C9.5 31 15.5 8 32 7.6 C48 8 54.5 30 51 52 Z';
const HOOD_OPENING = 'M16.6 41 C13.6 26 19.4 10.6 32 10.4 C44.6 10.6 49.6 25 47.6 41';
/** Faixa de tecido em volta da abertura, redesenhada por cima do cabelo: nada escapa pela borda. */
const HOOD_BAND = `M11.6 41 C10 30 16 8 32 7.6 C48 8 54 30 52.4 41 L47.6 41 C49.6 25 44.6 10.6 32 10.4 C19.4 10.6 13.6 26 16.6 41 Z`;
const HOOD_COWL ='M14 44 C15 41 16 40.6 16.8 40.8 Q21 47.5 32.5 48.6 Q43 47.6 47.4 40.8 C48.4 40.6 49.6 41.4 50.4 44 Q47.5 53 33 55 Q18 53.5 14 44 Z';

interface FaceShape {
  /** Metade de baixo da cabeça, de (rx, ry) a (lx, ly): é também o contorno da barba. */
  jaw: string;
  /** Metade de cima, de volta a (rx, ry). */
  crown: string;
  lx: number; ly: number; rx: number; ry: number;
  /** Ponto mais baixo do queixo (cavanhaque, barba longa). */
  chin: { x: number; y: number };
  earX: number;
  neckX: number; neckW: number;
  /** Peso da sobrancelha e alargamento dos ombros (marcado → suave). */
  brow: number; shoulders: number;
}

/** O cabelo e o capuz foram desenhados sobre o oval; nos outros formatos, esticam até as têmporas. */
const BASE = { lx: 18.5, rx: 45.6 };

const FACE_SHAPES: Record<FaceId, FaceShape> = {
  oval: {
    jaw: 'M45.6 27.5 C45.6 34 42.2 40.4 35.8 42.5 C31.2 43.8 26 41.6 22.6 37.6 C19.8 34.4 18.5 31 18.5 27.5',
    crown: 'C18.5 19 24.5 13.5 32 13.5 C40 13.5 45.6 19.5 45.6 27.5',
    lx: 18.5, ly: 27.5, rx: 45.6, ry: 27.5, chin: { x: 33.4, y: 43.1 },
    earX: 20.3, neckX: 28, neckW: 9, brow: 1.5, shoulders: 0,
  },
  quadrado: {
    jaw: 'M46.2 27.5 C46.2 33.4 45.9 37.4 44.4 40.2 C43 42.8 40 44.2 35.6 44.3 C31.2 44.4 26.6 43.4 23.4 41.3 C19.6 38.8 18.2 33.8 18.2 27.5',
    crown: 'C18.2 19 24.4 13.5 32 13.5 C40.2 13.5 46.2 19.5 46.2 27.5',
    lx: 18.2, ly: 27.5, rx: 46.2, ry: 27.5, chin: { x: 34, y: 44.1 },
    earX: 20, neckX: 26.8, neckW: 11.4, brow: 1.9, shoulders: 2,
  },
  delicado: {
    jaw: 'M45.2 26.6 C45.2 31.8 43.2 36.4 40 39.6 C38 41.6 35.8 43.3 34.2 43.3 C32.4 43.3 29.4 41.6 26.4 39.4 C21.6 35.9 18.8 31.4 18.8 26.6',
    crown: 'C18.8 19 24.6 13.5 32 13.5 C39.8 13.5 45.2 19.3 45.2 26.6',
    lx: 18.8, ly: 26.6, rx: 45.2, ry: 26.6, chin: { x: 34.2, y: 43.1 },
    earX: 20.8, neckX: 29, neckW: 7.2, brow: 1.15, shoulders: -2,
  },
  redondo: {
    jaw: 'M46.3 28.2 C46.3 36 41.6 42.4 34 42.8 C27.2 43.2 21.4 39.2 19.2 33.8 C18.4 31.9 18 30 18 28.2',
    crown: 'C18 19.5 24 13.5 32 13.5 C40.6 13.5 46.3 19.5 46.3 28.2',
    lx: 18, ly: 28.2, rx: 46.3, ry: 28.2, chin: { x: 33.6, y: 42.7 },
    earX: 19.8, neckX: 28, neckW: 9.4, brow: 1.45, shoulders: 0.5,
  },
};

/** Estica na horizontal o que foi desenhado sobre o oval até a largura deste rosto. */
function fitTransform(f: FaceShape): string {
  const s = (f.rx - f.lx) / (BASE.rx - BASE.lx);
  return `translate(${(f.lx + f.rx) / 2} 0) scale(${s.toFixed(4)} 1) translate(${-(BASE.lx + BASE.rx) / 2} 0)`;
}

/** Sobrancelha de cá; a de lá é espelhada. A ponta de dentro (+x) é a que dá a emoção. */
const BROW_PATHS: Record<BrowsId, string> = {
  retas: 'M-2.6 0.2 L2.6 -0.1',
  franzidas: 'M-2.6 -0.9 Q0.2 -0.3 2.6 1',
  preocupadas: 'M-2.6 0.5 Q0 -0.2 2.6 -1.4',
  arqueadas: 'M-2.6 0.7 Q-0.8 -1.5 2.6 -0.1',
  erguidas: 'M-2.6 -0.5 Q0 -2.8 2.6 -0.9',
};

/** Frente do cabelo preso (rabo, coque): liso, puxado para trás. */
const SLEEK = 'M18.8 27.5 C18.4 17.5 24.5 12.2 32.5 12.2 C40.5 12.2 46 17.5 45.6 25.5 C42 20.6 37 19.2 32 19.4 C26.5 19.6 21.8 22.4 18.8 27.5 Z';
const CURLS_BACK: Array<[number, number, number]> = [[20, 19, 7], [27, 12.5, 7], [36, 12, 7], [43.5, 16.5, 6.2], [17, 27.5, 5.5], [46.5, 24, 4.2], [17.5, 35.5, 4.8]];
const CURLS_FRONT: Array<[number, number, number]> = [[22.5, 18.2, 4.2], [28.6, 15.2, 4.6], [35.2, 14.8, 4.6], [41.4, 17.6, 4], [20, 23.5, 3.4], [44.6, 22, 2.8]];
/** Abertura da boca na barba cheia: a boca continua legível sobre qualquer cor. */
const MOUTH_HOLE = 'M32.2 38.9 A3.5 1.9 0 1 0 39.2 38.9 A3.5 1.9 0 1 0 32.2 38.9 Z';

const line = (stroke: string, width = 1.1) => ({
  fill: 'none', stroke, strokeWidth: width, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
});

function find<T extends { id: string }>(list: readonly T[], id: string): T {
  return list.find((o) => o.id === id) ?? list[0];
}

function Eye({ kind, x, sx, color, ink }: { kind: AvatarConfig['eyes']; x: number; sx: number; color: string; ink: string }) {
  return (
    <g transform={`translate(${x} ${EYE_Y}) scale(${sx} 1)`}>
      {kind === 'amendoa' && <>
        <path d="M-2.1 0.1 Q-0.2 -1.9 2.1 -0.4 Q0.2 1.5 -2.1 0.1 Z" fill={color} stroke={ink} strokeWidth={0.5} />
        <circle cx={0.4} cy={-0.2} r={0.6} fill={ink} opacity={0.7} />
        <path d="M-2.3 0 Q-0.2 -2.2 2.3 -0.5" {...line(ink, 0.9)} />
      </>}
      {kind === 'firme' && <>
        {/* Pálpebra baixa e reta corta o alto da íris: olhar duro. */}
        <path d="M-1.2 -0.85 L1.8 -0.6 Q1.6 1.6 0.2 1.6 Q-1.4 1.5 -1.2 -0.85 Z" fill={color} stroke={ink} strokeWidth={0.5} />
        <path d="M-2.3 -1.1 L2.4 -0.5" {...line(ink, 1.1)} />
      </>}
      {kind === 'oval' && <>
        <ellipse rx={1.7} ry={2.2} fill={color} stroke={ink} strokeWidth={0.5} />
        {/* Brilho puxado para a direita: o olhar segue o giro. */}
        <circle cx={0.65} cy={-0.8} r={0.5} fill="#fff" opacity={0.55} />
      </>}
      {kind === 'ponto' && <circle r={1.5} fill={color} stroke={ink} strokeWidth={0.5} />}
      {kind === 'arco' && <path d="M-2.1 0.8 Q0 -1.9 2.1 0.8" {...line(ink, 1.3)} />}
      {kind === 'sonolento' && <>
        <path d="M-1.7 -0.4 A1.7 1.7 0 0 0 1.7 -0.4 Z" fill={color} stroke={ink} strokeWidth={0.5} />
        <path d="M-2.2 -0.4 H2.2" {...line(ink, 1.1)} />
      </>}
    </g>
  );
}

/**
 * Roupa encaixada no pescoço do rosto escolhido: a gola vai de `nl` a `nr` e o centro
 * do peito (`c`) fica um pouco à direita, porque o tronco gira junto, só que menos.
 */
function Outfit({ id, face, skinShade }: { id: OutfitId; face: FaceShape; skinShade: string }) {
  const o = find(OUTFITS, id);
  const sh = face.shoulders;
  const nl = face.neckX + 1.2;
  const nr = face.neckX + face.neckW + 1.5;
  const c = (nl + nr) / 2;
  const body = `M${9 - sh} 64 C${9 - sh} 53 ${18 - sh / 2} 47 32 47 C${46 + sh / 2} 47 ${55 + sh} 53 ${55 + sh} 64 Z`;
  switch (o.id) {
    case 'casaco': return <>
      <path d={body} fill={o.fill} />
      <path d={`M${nl} 47.2 L${c} 55 L${nr} 47.2 Z`} fill={SHIRT} />
      <path d={`M${nl} 47.2 L${c - 1} 57 M${nr} 47.2 L${c + 1} 57`} {...line(o.detail, 1.2)} />
    </>;
    case 'manto': return <>
      <path d={body} fill={o.fill} />
      <path d={`M${nl - 8} 49.8 Q${c} 57 ${nr + 6} 49.2`} {...line('#a79dcc', 2.2)} />
      <circle cx={c} cy={54.5} r={1.6} fill={o.detail} />
    </>;
    case 'armadura': return <>
      <path d={body} fill={o.fill} />
      {/* Ombreira de cá maior que a de lá. */}
      <ellipse cx={15 - sh} cy={56} rx={8} ry={5.8} fill={o.detail} />
      <ellipse cx={49.5 + sh} cy={56.5} rx={6.3} ry={5} fill={o.detail} />
      <path d={`M${nl} 47.3 Q${c} 50 ${nr} 47.3 M${c - 8.5} 58 Q${c} 61.5 ${c + 7} 57.6`} {...line('#6f7a85', 1.2)} />
    </>;
    case 'tunica': return <>
      <path d={body} fill={o.fill} />
      <path d={`M${nl} 47.2 Q${c} 52.5 ${nr} 47.2 Z`} fill={skinShade} stroke={o.detail} strokeWidth={1.2} strokeLinejoin="round" />
      <path d={`M${c} 52.5 V58`} {...line(o.detail, 1.2)} />
    </>;
    case 'colete': return <>
      <path d={body} fill={o.detail} />
      <path d={`M${17.5 - sh} 50 Q23 47.6 ${nl} 47.3 L${c} 59 V64 H${12 - sh} Q${12 - sh} 55 ${17.5 - sh} 50 Z`} fill={o.fill} />
      <path d={`M${47 + sh} 50 Q44 47.6 ${nr} 47.3 L${c} 59 V64 H${52 + sh} Q${52 + sh} 55 ${47 + sh} 50 Z`} fill={o.fill} />
    </>;
    // A gola do capuz (HoodFront) cobre o peito de cima; aqui fica só o que aparece abaixo dela.
    case 'capuz': return <>
      <path d={body} fill={o.fill} />
      <path d={`M${c} 55 V64`} {...line(o.detail, 0.9)} />
    </>;
    case 'terno': return <>
      <path d={body} fill={o.fill} />
      <path d={`M${nl} 47.2 L${c} 57.5 L${nr} 47.2 Z`} fill={SHIRT} />
      <path d={`M${c - 1} 48.4 H${c + 1} L${c + 1.5} 55.5 L${c} 57.6 L${c - 1.5} 55.5 Z`} fill={o.detail} />
      <path d={`M${nl} 47.2 L${c - 1.6} 59 M${nr} 47.2 L${c + 1.6} 59`} {...line('#5a5a63', 1.2)} />
    </>;
    case 'tunica_capuz': return <>
      <path d={body} fill={o.fill} />
      <path d={`M${c} 54.5 V62 M${c - 1.4} 56 L${c + 1.4} 57.4 M${c - 1.4} 59 L${c + 1.4} 60.4`} {...line(o.detail, 0.9)} />
    </>;
    case 'batina': return <>
      <path d={body} fill={o.fill} />
      {/* Colarinho clerical: faixa escura com a lingueta branca na frente. */}
      <path d={`M${nl - 0.6} 47.6 Q${c} 49.4 ${nr + 0.4} 47.6`} {...line('#1c1a1e', 2.2)} />
      <rect x={c - 0.9} y={47.7} width={1.8} height={1.6} rx={0.3} fill={o.detail} />
      {[52.5, 55.5, 58.5, 61.5].map((y) => <circle key={y} cx={c} cy={y} r={0.55} fill="#4a454d" />)}
    </>;
    case 'sobretudo': return <>
      <path d={body} fill={o.fill} />
      <path d={`M${nl + 0.8} 47.8 L${c} 53 L${nr - 0.8} 47.8 Z`} fill="#3e342b" />
      {/* Gola alta, levantada ao redor do pescoço. */}
      <path d={`M${nl - 4.6} 50.6 L${nl - 2.2} 43.6 L${nl + 1} 48 Z`} fill={o.detail} />
      <path d={`M${nr + 4} 50.2 L${nr + 1.6} 43.8 L${nr - 1} 48 Z`} fill={o.detail} />
      <path d={`M${c} 53 V64`} {...line(o.detail, 1)} />
    </>;
    case 'camisa': return <>
      <path d={body} fill={o.fill} />
      <path d={`M${nl} 47 L${c - 0.4} 50.6 L${nl - 2.8} 50 Z M${nr} 47 L${c + 0.4} 50.6 L${nr + 2.6} 49.8 Z`} fill="#dcd3c4" stroke={o.detail} strokeWidth={0.6} strokeLinejoin="round" />
      <path d={`M${c} 50.6 V64`} {...line(o.detail, 0.8)} />
      <circle cx={c} cy={54} r={0.5} fill={o.detail} />
      <circle cx={c} cy={58} r={0.5} fill={o.detail} />
    </>;
    case 'jaqueta': return <>
      <path d={body} fill={o.fill} />
      <path d={`M${nl} 47.2 L${c} 53 L${nr} 47.2 Z`} fill="#8f8a84" />
      <path d={`M${nl} 47.2 L${c - 2.2} 53 L${nl - 5} 50.2 Z M${nr} 47.2 L${c + 2.2} 53 L${nr + 4.4} 50 Z`} fill={o.detail} />
      <path d={`M${c + 2.4} 53 V64`} {...line('#8a7a6c', 0.8)} />
    </>;
  }
}

/** Atrás da cabeça: o volume fica do lado de cá (a nuca), o lado de lá some no giro. */
function HairBack({ hair, hood, color }: { hair: AvatarConfig['hair']; hood: boolean; color: string }) {
  // Com capuz, o que fica preso atrás (rabo, coque, volume dos cachos) some dentro dele,
  // e o cabelo longo preenche a abertura em volta do rosto, por dentro do tecido.
  if (hood) {
    return hair === 'longo'
      ? <path d="M17.6 40.5 C15 26 20.2 12 32 11.6 C43.8 12 48.6 25 46.8 40.5 Q32 46.5 17.6 40.5 Z" fill={color} />
      : null;
  }
  switch (hair) {
    case 'longo': return <path d="M16.2 28 C15.6 15 23.2 11 32 11 C40.5 11 46.5 15 46 27 L44 48 Q30 54 14.5 50 Z" fill={color} />;
    // Prendedor: uma faixa escura no ponto em que o cabelo se junta.
    case 'rabo': return <>
      <path d="M20.5 21 C14 20 10.8 28 11.6 38 C12 43.5 14.5 46.5 16.6 45.6 C15.6 39 16 31 21.5 25.5 Z" fill={color} />
      <path d="M15.6 21.6 Q17.6 24.6 19.8 23.2" {...line(HAIR_TIE, 1.6)} />
    </>;
    case 'coque': return <>
      <circle cx={20.5} cy={14.5} r={5.4} fill={color} />
      <path d="M22.2 19.6 Q25.4 18.6 25.8 15.6" {...line(HAIR_TIE, 1.6)} />
    </>;
    case 'cacheado': return <g fill={color}>{CURLS_BACK.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />)}</g>;
    default: return null;
  }
}

function HairFront({ hair, color }: { hair: AvatarConfig['hair']; color: string }) {
  switch (hair) {
    case 'curto': return <path d="M18.6 28 C18 17.5 24 12 32.5 12 C41 12 46.6 18 45.7 27 C43.6 22.5 40.6 20.4 37.2 20 C33.2 21.6 27.4 21.2 23.6 22.8 C21.6 23.8 19.8 25.6 18.6 28 Z" fill={color} />;
    case 'lateral': return <path d="M18.4 30 C17.4 17 24.5 11.5 33 11.5 C41.5 11.5 47 17.5 45.9 28 C45.3 25.4 44.4 23.6 43.2 22.6 C38.6 24.6 31.4 23.2 27 19.6 C25.2 22.6 22 25.6 18.4 30 Z" fill={color} />;
    case 'longo': return <path d="M17.6 37 C16.2 18 23.5 11.5 32.5 11.5 C41 11.5 47.4 18 46.1 29 C44.6 23.8 41.6 21 37.6 20 C33.2 21.8 27.6 21.6 24.2 23.2 C21.8 26.4 21.8 31.5 22.8 37 C21 38.2 19 38.2 17.6 37 Z" fill={color} />;
    case 'rabo':
    case 'coque': return <path d={SLEEK} fill={color} />;
    case 'cacheado': return <g fill={color}>{CURLS_FRONT.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />)}</g>;
    case 'raspado': return <path d="M18.9 26 C19.1 16.5 25 12.8 32.5 12.8 C39.5 12.8 44.8 16.5 45.1 24 C42 20.5 37.6 18.8 33 18.8 C27.5 18.8 22.4 21.2 18.9 26 Z" fill={color} opacity={0.5} />;
    case 'careca': return <ellipse cx={27} cy={17.5} rx={3.2} ry={1.6} fill="#fff" opacity={0.1} />;
  }
}

/** Barba desenhada a partir do maxilar do rosto: encaixa em qualquer formato. */
function Beard({ kind, face, color }: { kind: AvatarConfig['beard']; face: FaceShape; color: string }) {
  if (kind === 'nenhuma') return null;
  const { jaw, lx, ly, rx, ry, chin } = face;
  // Contorno de fora = maxilar; por dentro sobe pelas costeletas e passa sob o nariz.
  const full = `${jaw} L${lx + 3.6} ${ly + 1} C${lx + 4} 32 25 35.2 30 35.8 C33 36.1 35.6 35.4 37.6 35.3 C40.6 35.2 ${rx - 1.6} 32.5 ${rx - 0.4} ${ry + 1.5} Z ${MOUTH_HOLE}`;
  const stache = <path d="M33 37.2 Q35.7 35.9 38.7 37" {...line(color, 1.8)} />;
  const long = `M${chin.x - 6} ${chin.y - 1.5} Q${chin.x - 5} ${chin.y + 5} ${chin.x} ${chin.y + 7} Q${chin.x + 4.6} ${chin.y + 5} ${chin.x + 5.4} ${chin.y - 2} Z`;
  switch (kind) {
    case 'sombra': return <path d={full} fill={color} fillRule="evenodd" opacity={0.28} />;
    case 'bigode': return stache;
    case 'cavanhaque': return <>
      {stache}
      {/* Do canto da boca até a ponta do queixo. */}
      <path d={`M${chin.x - 2.6} ${chin.y - 3.3} Q${chin.x} ${chin.y - 2.3} ${chin.x + 2.5} ${chin.y - 3.5} Q${chin.x + 2.7} ${chin.y + 0.1} ${chin.x} ${chin.y + 0.4} Q${chin.x - 2.9} ${chin.y + 0.1} ${chin.x - 2.6} ${chin.y - 3.3} Z`} fill={color} />
    </>;
    case 'cheia': return <path d={full} fill={color} fillRule="evenodd" />;
    case 'longa': return <>
      <path d={full} fill={color} fillRule="evenodd" />
      <path d={long} fill={color} />
    </>;
  }
}

interface Props {
  config?: AvatarConfig | null;
  size?: number;
  /** Sem rótulo, o desenho é decorativo (o nome já aparece ao lado). */
  label?: string;
  /** 'face': aproxima no rosto (miniaturas de rosto, barba, olhos, sobrancelhas, nariz e boca). */
  crop?: 'face';
  className?: string;
}

function Avatar({ config, size = 40, label, crop, className }: Props) {
  // Sanitiza na tela também: avatar salvo antes de um campo existir ganha o padrão dele.
  const a = sanitizeAvatar(config);
  const skin = find(SKINS, a.skin);
  const face = FACE_SHAPES[a.face];
  const hair = find(HAIR_COLORS, a.hairColor);
  const eyeColor = find(EYE_COLORS, a.eyeColor).fill;
  const ink = skin.ink;
  const brow = BROW_PATHS[a.brows];
  const hood = HOODS[a.outfit];
  const cloth = find(OUTFITS, a.outfit).fill;
  const fit = fitTransform(face);
  return (
    <svg className={`avatar${className ? ` ${className}` : ''}`} width={size} height={size}
      viewBox={crop === 'face' ? '19.5 16 30 30' : '0 0 64 64'}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <rect width={64} height={64} fill={find(BACKGROUNDS, a.bg).fill} />
      <g transform={fit}>
        {hood && <>
          {/* Tecido por fora (funde com os ombros) e o fundo escuro da abertura. */}
          <path d={HOOD_OUTER} fill={cloth} />
          <path d={`${HOOD_OPENING} Q32 47 16.6 41 Z`} fill={hood.inner} />
        </>}
        <HairBack hair={a.hair} hood={!!hood} color={hair.fill} />
      </g>
      <rect x={face.neckX} y={36} width={face.neckW} height={13} rx={3} fill={skin.shade} />
      <Outfit id={a.outfit} face={face} skinShade={skin.shade} />
      {hood && (
        <g transform={fit}>
          {/* Gola dobrada sob o queixo, ligando os dois lados do capuz à roupa. */}
          <path d={HOOD_COWL} fill={cloth} />
          <path d="M18.5 46.2 Q32.5 53.6 46.4 45.8" {...line(hood.inner, 0.9)} opacity={0.8} />
        </g>
      )}
      <path d={`${face.jaw} ${face.crown} Z`} fill={skin.fill} />
      <circle cx={27} cy={34.6} r={2.4} fill={skin.blush} opacity={0.18} />
      <ellipse cx={41.4} cy={34.4} rx={1.3} ry={2} fill={skin.blush} opacity={0.18} />
      <Beard kind={a.beard} face={face} color={hair.fill} />
      {/* Só a orelha de cá, assentada na borda do rosto; a de lá fica escondida. */}
      <ellipse cx={face.earX} cy={30.5} rx={2.1} ry={3} fill={skin.fill} stroke={skin.shade} strokeWidth={0.8} />
      <path d={`M${face.earX + 0.4} 29.3 Q${face.earX - 0.6} 30.5 ${face.earX + 0.4} 31.8`} {...line(skin.shade, 0.7)} />
      <g transform={fit}>
        <HairFront hair={a.hair} color={hair.fill} />
        {hood && <>
          <path d={HOOD_BAND} fill={cloth} />
          {/* Borda do tecido em volta do rosto: desce até a gola, sem emenda. */}
          <path d={HOOD_OPENING} {...line(hood.edge, 1.4)} />
        </>}
      </g>
      <g opacity={0.9}>
        <path d={brow} transform={`translate(${EYE_NEAR.x} ${BROW_Y})`} {...line(hair.brow, face.brow)} />
        <path d={brow} transform={`translate(${EYE_FAR.x} ${BROW_Y}) scale(${-EYE_FAR.sx} 1)`} {...line(hair.brow, face.brow)} />
      </g>
      <Eye kind={a.eyes} x={EYE_NEAR.x} sx={EYE_NEAR.sx} color={eyeColor} ink={ink} />
      <Eye kind={a.eyes} x={EYE_FAR.x} sx={EYE_FAR.sx} color={eyeColor} ink={ink} />
      {/* Nariz aponta para a direita: o contorno fica do lado de lá. */}
      <g opacity={0.7}>
        {a.nose === 'ponto' && <ellipse cx={37.4} cy={34} rx={1} ry={0.7} fill={ink} />}
        {a.nose === 'linha' && <path d="M36.6 30.6 Q39.4 33.8 37.4 35.2" {...line(ink, 0.9)} />}
        {a.nose === 'botao' && <path d="M35.6 34.4 Q37.4 35.9 38.9 33.9" {...line(ink, 1)} />}
      </g>
      {a.mouth === 'neutra' && <>
        <path d="M33.3 38.8 Q35.8 38.6 38.2 38.7" {...line(ink)} />
        <path d="M34.9 40.5 H36.9" {...line(ink, 0.8)} opacity={0.35} />
      </>}
      {a.mouth === 'seria' && <path d="M33 39.5 Q35.7 38 38.4 39.3" {...line(ink)} />}
      {a.mouth === 'canto' && <path d="M33.2 39 Q36 39.5 38.6 37.8" {...line(ink)} />}
      {a.mouth === 'sorriso' && <path d="M32.8 38 Q35.6 40.4 38.4 37.7" {...line(ink)} />}
      {a.mouth === 'aberta' && <path d="M32.8 37.6 Q35.8 42.2 38.6 37.4 Z" fill={MOUTH_IN} stroke={ink} strokeWidth={1} strokeLinejoin="round" />}
      {a.mouth === 'espanto' && <ellipse cx={35.8} cy={39.2} rx={1.1} ry={1.4} fill={MOUTH_IN} stroke={ink} strokeWidth={0.9} />}
    </svg>
  );
}

export default memo(Avatar);
