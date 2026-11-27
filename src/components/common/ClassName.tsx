// Nome de classe colorido. Classes base usam a cor delas; classes especialistas
// ganham um gradiente animado com as cores das duas classes que as formam.
import type { CSSProperties, ReactNode } from 'react';
import { CLASSES, isSpecialist, type BaseClassId, type ClassId } from '../../rules/classes';

type Hsl = [h: number, s: number, l: number];

function toHsl(hex: string): Hsl {
  const [r, g, b] = [0, 1, 2].map((i) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h < 0 ? h + 360 : h, d / (1 - Math.abs(2 * l - 1)), l];
}

function toHex([h, s, l]: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** Versão mais clara e mais saturada da mesma cor (clarear rumo ao branco deixava acinzentado). */
function brighten(hex: string): string {
  const [h, s, l] = toHsl(hex);
  return toHex([h, Math.max(s, 0.85), Math.min(0.7, l + 0.14)]);
}

/**
 * Cor do meio entre duas cores, dando a volta pelo círculo de cores (pelo lado mais curto)
 * em vez de cortar em linha reta: cores opostas, como vermelho e azul-petróleo, viravam cinza no meio.
 */
function midColor(a: string, b: string): string {
  const [ha, sa, la] = toHsl(a), [hb, sb, lb] = toHsl(b);
  let dh = hb - ha;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return toHex([(ha + dh / 2 + 360) % 360, Math.max(sa, sb), (la + lb) / 2]);
}

/**
 * As cores do gradiente de uma combinação: as duas pontas e a cor do meio.
 * Classe só: a cor dela e uma versão mais viva.
 */
export function comboColors(a: BaseClassId, b: BaseClassId = a): [string, string, string] {
  const c1 = CLASSES[a].color;
  const c2 = a === b ? brighten(c1) : CLASSES[b].color;
  return [c1, midColor(c1, c2), c2];
}

/** Fundo de bolinha/amostra: gradiente nas especialistas, cor lisa nas classes base. */
export function classSwatch(id: ClassId): string {
  const from = CLASSES[id].from;
  if (!from) return CLASSES[id].color;
  const [c1, mid, c2] = comboColors(...from);
  return `linear-gradient(135deg, ${c1}, ${mid}, ${c2})`;
}

/** Texto com o gradiente animado de uma combinação (a classe `spec-still` deixa parado). */
export function SpecName({ a, b, className, children }: {
  a: BaseClassId;
  b?: BaseClassId;
  className?: string;
  children: ReactNode;
}) {
  const [c1, mid, c2] = comboColors(a, b);
  const style = { '--spec-a': c1, '--spec-m': mid, '--spec-b': c2 } as CSSProperties;
  return <span className={`spec-name${className ? ` ${className}` : ''}`} style={style}>{children}</span>;
}

export default function ClassName({ id, className, children }: { id: ClassId; className?: string; children?: ReactNode }) {
  const info = CLASSES[id];
  if (!info.from) return <span className={className} style={{ color: info.color }}>{children ?? info.name}</span>;
  return <SpecName a={info.from[0]} b={info.from[1]} className={className}>{children ?? info.name}</SpecName>;
}

/** Título do personagem: com gradiente quando ele já está numa classe especialista. */
export function TitleText({ d }: { d: { classes: ClassId[]; title: string } }) {
  const spec = d.classes.find(isSpecialist);
  return spec ? <ClassName id={spec}>{d.title}</ClassName> : <>{d.title}</>;
}
