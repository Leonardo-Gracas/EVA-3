import { Scale, Skull } from 'lucide-react';
import type { ThreatCategory } from '../../model/types';

type IconProps = { size?: number };

/** Pentagrama: estrela de cinco pontas inscrita no círculo, no traço dos ícones lucide. */
function Pentagram({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2 17.88 20.09 2.49 8.91h19.02L6.12 20.09Z" />
    </svg>
  );
}

/** Círculo etéreo: anel com um núcleo mais fraco, como um portal. */
function EtherRing({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" strokeWidth={1.4} opacity={0.55} />
    </svg>
  );
}

const ICONS: Record<ThreatCategory, (p: IconProps) => JSX.Element> = {
  humano: ({ size }) => <Skull size={size} />,
  demoniaco: Pentagram,
  etereo: EtherRing,
  celestial: ({ size }) => <Scale size={size} />,
};

/** Só o desenho da categoria, para chips e botões. */
export function ThreatGlyph({ category, size = 14 }: { category: ThreatCategory; size?: number }) {
  const Icon = ICONS[category] ?? ICONS.humano;
  return <Icon size={size} />;
}

/**
 * Selo da categoria: caveira clara no fundo escuro (humano), pentagrama vermelho (demoníaco),
 * anel ciano (etéreo) e balança dourada (celestial).
 */
export default function ThreatIcon({ category, size = 18, box = 36 }: { category: ThreatCategory; size?: number; box?: number }) {
  return (
    <div className={`threat-icon threat-cat-${ICONS[category] ? category : 'humano'}`} style={{ width: box, height: box }}>
      <ThreatGlyph category={category} size={size} />
    </div>
  );
}
