// Nome de classe colorido. Classes base usam a cor delas; classes especialistas
// ganham um gradiente animado com as cores das duas classes que as formam.
import type { CSSProperties, ReactNode } from 'react';
import { CLASSES, isSpecialist, type BaseClassId, type ClassId } from '../../rules/classes';

/** Clareia uma cor #rrggbb em direção ao branco (k de 0 a 1). */
function lighten(hex: string, k = 0.45): string {
  const ch = (i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(i) + (255 - ch(i)) * k).toString(16).padStart(2, '0')).join('')}`;
}

/** As duas cores do gradiente de uma combinação. Classe só: a cor dela e uma versão mais clara. */
export function comboColors(a: BaseClassId, b: BaseClassId = a): [string, string] {
  const c1 = CLASSES[a].color;
  return [c1, a === b ? lighten(c1) : CLASSES[b].color];
}

/** Fundo de bolinha/amostra: gradiente nas especialistas, cor lisa nas classes base. */
export function classSwatch(id: ClassId): string {
  const from = CLASSES[id].from;
  if (!from) return CLASSES[id].color;
  const [c1, c2] = comboColors(...from);
  return `linear-gradient(135deg, ${c1}, ${c2})`;
}

/** Texto com o gradiente de uma combinação. `still` desliga a animação. */
export function SpecName({ a, b, still, className, children }: {
  a: BaseClassId;
  b?: BaseClassId;
  still?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [c1, c2] = comboColors(a, b);
  const style = { '--spec-a': c1, '--spec-b': c2 } as CSSProperties;
  return <span className={`spec-name${still ? ' spec-still' : ''}${className ? ` ${className}` : ''}`} style={style}>{children}</span>;
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
