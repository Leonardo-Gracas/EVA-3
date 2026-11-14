import { useState } from 'react';
import { HeartHandshake } from 'lucide-react';
import type { PlayerRelation, PlayerView } from '../../model/types';
import { useAct } from '../act';
import Avatar from '../common/Avatar';
import { SearchInput, matchesQuery } from '../common/Filters';
import { AffinityDot, AffinityLegend, AffinityPicker } from './Affinity';

/**
 * Aba Relações do jogador: quem os personagens dele conhecem. O jogador marca o quanto o
 * personagem gosta de cada um; a cor do outro lado é o quanto o NPC gosta dele (o mestre marca).
 */
export default function PlayerRelations({ view }: { view: PlayerView }) {
  const { act } = useAct();
  const [q, setQ] = useState('');
  const chars = view.myCharacters.filter((c) => c.status === 'approved');
  const many = chars.length > 1;

  const groups = chars.map((c) => ({
    c,
    list: view.relations
      .filter((r) => r.characterId === c.id && matchesQuery(q, r.npc.name, r.npc.concept))
      .sort((a, b) => a.npc.name.localeCompare(b.npc.name, 'pt-BR')),
  }));

  if (!view.relations.length) {
    return (
      <div className="card combat-empty">
        <HeartHandshake size={28} className="muted" />
        <strong>Ninguém por aqui ainda</strong>
        <p className="small muted">
          Quando o mestre apresentar um personagem {many ? 'a um dos seus' : 'ao seu'}, ele aparece aqui.
          Você marca com as cores o quanto gosta dele; o mestre marca o quanto ele gosta de você.
        </p>
      </div>
    );
  }

  const feel = (r: PlayerRelation, level: PlayerRelation['mine']) =>
    act({ type: 'relation/feel', characterId: r.characterId, npcId: r.npc.id, level });

  return (
    <div className="col gap-lg">
      <div className="row-wrap">
        {view.relations.length > 6 && <div className="grow" style={{ minWidth: 200 }}><SearchInput value={q} onChange={setQ} placeholder="Buscar por nome ou conceito" /></div>}
        <span className="spacer" />
        <AffinityLegend />
      </div>
      {groups.map(({ c, list }) => {
        const total = view.relations.filter((r) => r.characterId === c.id).length;
        if (!total) return null;
        return (
          <section key={c.id} className="col">
            {many && (
              <div className="row">
                <Avatar config={c.avatar} size={24} />
                <h3 className="grow">{c.name}</h3>
                <span className="tiny muted">{total}</span>
              </div>
            )}
            {list.length === 0 && <div className="small muted">Ninguém com essa busca.</div>}
            <div className="relation-cards">
              {list.map((r) => (
                <div key={r.npc.id} className="card relation-card">
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <Avatar config={r.npc.avatar} size={44} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <strong>{r.npc.name}</strong>
                      {r.npc.concept && <div className="tiny muted">{r.npc.concept}</div>}
                    </div>
                  </div>
                  <div className="relation-feel">
                    <span className="small secondary">{many ? `O que ${c.name} sente` : 'O que você sente'}</span>
                    <AffinityPicker value={r.mine} label={`O que ${c.name} sente por ${r.npc.name}`} onChange={(lv) => feel(r, lv)} />
                  </div>
                  <div className="relation-feel">
                    <span className="small secondary">O que {r.npc.name} sente</span>
                    <AffinityDot level={r.theirs} size={18} title={`O que ${r.npc.name} sente por ${c.name}`} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
