import { useState } from 'react';
import { HeartHandshake } from 'lucide-react';
import type { Affinity, Character, PlayerView } from '../../model/types';
import type { AvatarConfig } from '../../model/avatar';
import { useAct } from '../act';
import Avatar from '../common/Avatar';
import { SearchInput, matchesQuery } from '../common/Filters';
import { AffinityDot, AffinityLegend, AffinityPicker } from './Affinity';

/** Alguém que o personagem conhece: outro personagem de jogador (sempre) ou um NPC apresentado. */
interface Known {
  id: string;
  name: string;
  concept: string;
  avatar?: AvatarConfig;
  /** De quem é o personagem (só personagens de jogador). */
  owner?: string;
  mine: Affinity;
  theirs: Affinity;
  feel: (level: Affinity) => void;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR');

/**
 * Aba Relações do jogador. Os personagens dos outros jogadores aparecem sempre: cada jogador marca
 * o lado do próprio personagem. Os NPCs aparecem quando o mestre os apresenta, e o lado deles é do mestre.
 */
export default function PlayerRelations({ view }: { view: PlayerView }) {
  const { act } = useAct();
  const [q, setQ] = useState('');
  const chars = view.myCharacters.filter((c) => c.status === 'approved');
  const many = chars.length > 1;

  const bond = (from: string, to: string): Affinity => view.bonds.find((b) => b.fromId === from && b.toId === to)?.level ?? 0;

  const groups = chars.map((c) => {
    const pcs: Known[] = [
      ...view.others.filter((o) => o.kind === 'pc').map((o) => ({ id: o.id, name: o.name, concept: o.concept, avatar: o.avatar, owner: o.ownerName })),
      ...chars.filter((o) => o.id !== c.id).map((o) => ({ id: o.id, name: o.name, concept: o.concept, avatar: o.avatar, owner: 'você' })),
    ].map((o) => ({
      ...o,
      mine: bond(c.id, o.id),
      theirs: bond(o.id, c.id),
      feel: (level: Affinity) => void act({ type: 'relation/bond', characterId: c.id, otherId: o.id, level }),
    })).sort(byName);
    const npcs: Known[] = view.relations.filter((r) => r.characterId === c.id).map((r) => ({
      ...r.npc,
      mine: r.mine,
      theirs: r.theirs,
      feel: (level: Affinity) => void act({ type: 'relation/feel', characterId: c.id, npcId: r.npc.id, level }),
    })).sort(byName);
    return { c, pcs, npcs };
  });
  const total = groups.reduce((n, g) => n + g.pcs.length + g.npcs.length, 0);

  if (!total) {
    return (
      <div className="card combat-empty">
        <HeartHandshake size={28} className="muted" />
        <strong>Ninguém por aqui ainda</strong>
        <p className="small muted">
          {chars.length
            ? `Os personagens dos outros jogadores aparecem aqui assim que o mestre aprovar as fichas, e os NPCs quando o mestre apresentá-los ${many ? 'a um dos seus' : 'ao seu'}.`
            : 'Quando o mestre aprovar a sua ficha, os personagens dos outros jogadores aparecem aqui.'}
          {' '}Você marca com as cores o quanto gosta de cada um.
        </p>
      </div>
    );
  }

  const match = (k: Known) => matchesQuery(q, k.name, k.concept, k.owner ?? '');

  return (
    <div className="col gap-lg">
      <div className="row-wrap">
        {total > 6 && <div className="grow" style={{ minWidth: 200 }}><SearchInput value={q} onChange={setQ} placeholder="Buscar por nome, conceito ou jogador" /></div>}
        <span className="spacer" />
        <AffinityLegend />
      </div>
      {groups.map(({ c, pcs, npcs }) => {
        if (!pcs.length && !npcs.length) return null;
        const shownPcs = pcs.filter(match);
        const shownNpcs = npcs.filter(match);
        return (
          <section key={c.id} className="col">
            {many && (
              <div className="row">
                <Avatar config={c.avatar} size={24} />
                <h3 className="grow">{c.name}</h3>
                <span className="tiny muted">{pcs.length + npcs.length}</span>
              </div>
            )}
            {!shownPcs.length && !shownNpcs.length && <div className="small muted">Ninguém com essa busca.</div>}
            {shownPcs.length > 0 && <KnownList title="Personagens dos jogadores" me={c} many={many} list={shownPcs} />}
            {shownNpcs.length > 0 && <KnownList title="NPCs" me={c} many={many} list={shownNpcs} />}
          </section>
        );
      })}
    </div>
  );
}

function KnownList({ title, me, many, list }: { title: string; me: Character; many: boolean; list: Known[] }) {
  return (
    <div className="col">
      <div className="card-title" style={{ margin: 0 }}>{title}</div>
      <div className="relation-cards">
        {list.map((k) => (
          <div key={k.id} className="card relation-card">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Avatar config={k.avatar} size={44} />
              <div className="grow" style={{ minWidth: 0 }}>
                <strong>{k.name}</strong>
                {k.owner && <span className="tiny muted"> · {k.owner}</span>}
                {k.concept && <div className="tiny muted">{k.concept}</div>}
              </div>
            </div>
            <div className="relation-feel">
              <span className="small secondary">{many ? `O que ${me.name} sente` : 'O que você sente'}</span>
              <AffinityPicker value={k.mine} label={`O que ${me.name} sente por ${k.name}`} onChange={k.feel} />
            </div>
            <div className="relation-feel">
              <span className="small secondary">O que {k.name} sente</span>
              <AffinityDot level={k.theirs} size={18} title={`O que ${k.name} sente por ${me.name}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
