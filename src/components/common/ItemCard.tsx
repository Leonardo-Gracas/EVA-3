import type { ReactNode } from 'react';
import {
  Backpack, Coins, Crosshair, FlaskConical, Package, Shield, ShieldHalf, Skull, Sparkles, Sun, Sword, type LucideIcon,
} from 'lucide-react';
import { ITEM_TYPES, type ItemData, type ItemType } from '../../model/types';

const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);

const TYPE_ICON: Record<ItemType, LucideIcon> = {
  arma: Sword,
  protecao: Shield,
  escudo: ShieldHalf,
  catalisador_sagrado: Sun,
  catalisador_profano: Skull,
  catalisador_etereo: Sparkles,
  consumivel: FlaskConical,
  municao: Crosshair,
  equipamento: Backpack,
  outro: Package,
};

/** Tom de cor do ícone por tipo (classe `item-tone-*`). */
const TYPE_TONE: Record<ItemType, string> = {
  arma: 'red',
  protecao: 'steel',
  escudo: 'steel',
  catalisador_sagrado: 'gold',
  catalisador_profano: 'violet',
  catalisador_etereo: 'blue',
  consumivel: 'green',
  municao: 'red',
  equipamento: 'neutral',
  outro: 'neutral',
};

/** Ícone do tipo de item, com o tom de cor do tipo. */
export function ItemIcon({ type, size = 18 }: { type: ItemType; size?: number }) {
  const Icon = TYPE_ICON[type] ?? Package;
  return <div className={`item-icon item-tone-${TYPE_TONE[type] ?? 'neutral'}`}><Icon size={size} /></div>;
}

/**
 * Cartão de item usado no inventário (com `pv`, `qty`, `equipped`) e na biblioteca.
 * `actions` vai no rodapé, à direita da durabilidade.
 */
export default function ItemCard({ it, pv, qty, equipped, actions }: {
  it: ItemData; pv?: number; qty?: number; equipped?: boolean; actions?: ReactNode;
}) {
  const broken = pv !== undefined && pv <= 0;
  const max = it.durability.pv;
  const cur = pv ?? max;
  const stats: { label: string; value: string; tone?: 'dmg' | 'buff'; title?: string }[] = [];
  if (it.damage) stats.push({ label: 'Dano', value: it.damage, tone: 'dmg' });
  if (it.effects.def) stats.push({ label: 'Defesa', value: fmt(it.effects.def), tone: 'buff', title: 'Bônus de Defesa quando equipado' });
  if (it.effects.rdPhysical) stats.push({ label: 'RD física', value: fmt(it.effects.rdPhysical), tone: 'buff', title: 'Bônus de RD física quando equipado' });
  if (it.effects.rdMagic) stats.push({ label: 'RD mágica', value: fmt(it.effects.rdMagic), tone: 'buff', title: 'Bônus de RD mágica quando equipado' });

  return (
    <div className={`item-card${equipped ? ' item-equipped' : ''}${broken ? ' item-broken' : ''}`}>
      <div className="item-head">
        <ItemIcon type={it.type} />
        <div className="grow">
          <div className="item-name">
            <span>{it.name}</span>
            {qty !== undefined && qty > 1 && <span className="item-qty">×{qty}</span>}
          </div>
          <div className="item-sub">
            <span>{ITEM_TYPES[it.type] ?? 'Outro'}</span>
            {equipped && !broken && <span className="item-flag-on">Equipado</span>}
            {broken && <span className="item-flag-err">Quebrado</span>}
          </div>
        </div>
        {it.value > 0 && (
          <div className="item-value" title={qty && qty > 1 ? `Valor unitário · total ${(it.value * qty).toLocaleString('pt-BR')}` : 'Valor'}>
            <Coins size={13} />{it.value.toLocaleString('pt-BR')}
          </div>
        )}
      </div>

      {it.description && <p className="item-desc">{it.description}</p>}

      {stats.length > 0 && (
        <dl className="item-stats">
          {stats.map((s) => (
            <div key={s.label} title={s.title}>
              <dt>{s.label}</dt>
              <dd className={s.tone ? `item-${s.tone}` : undefined}>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="item-foot">
        <div className="item-dur" title="Durabilidade do objeto: PV · RD · Defesa">
          <div className="item-dur-top">
            <span>Durabilidade</span>
            <span className="mono">
              {pv !== undefined ? <><strong>{cur}</strong>/{max}</> : <strong>{max}</strong>} PV · RD {it.durability.rd} · DEF {it.durability.def}
            </span>
          </div>
          <div className="bar bar-dur item-dur-bar">
            <div style={{ width: `${max > 0 ? Math.max(0, Math.min(1, cur / max)) * 100 : 0}%` }} />
          </div>
        </div>
        {actions && <div className="item-actions">{actions}</div>}
      </div>
    </div>
  );
}
