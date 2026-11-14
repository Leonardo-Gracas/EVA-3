import { useMemo, useState } from 'react';
import { EyeOff, HeartHandshake, UserPlus, X } from 'lucide-react';
import type { Character, Relation, TableState } from '../../model/types';
import { useAct } from '../act';
import Avatar from '../common/Avatar';
import ConfirmButton from '../common/ConfirmButton';
import Modal from '../common/Modal';
import { SearchInput, matchesQuery } from '../common/Filters';
import { AffinityDot, AffinityLegend, AffinityPicker } from './Affinity';

const byName = (a: Character, b: Character) => a.name.localeCompare(b.name, 'pt-BR');

/**
 * Relações de uma ficha, na visão do mestre: quem o personagem conhece (ou, num NPC, quem o conhece).
 * O mestre apresenta e marca o lado do NPC; o lado do personagem de jogador é do jogador.
 */
export default function RelationsCard({ table, ch }: { table: TableState; ch: Character }) {
  const { act } = useAct();
  const isPc = ch.kind === 'pc';

  const rows = useMemo(() => (table.relations ?? [])
    .filter((r) => (isPc ? r.pcId : r.npcId) === ch.id)
    .map((r) => ({ r, pc: table.characters[r.pcId], npc: table.characters[r.npcId] }))
    .filter((x): x is { r: Relation; pc: Character; npc: Character } => !!x.pc && !!x.npc)
    .sort((a, b) => byName(isPc ? a.npc : a.pc, isPc ? b.npc : b.pc)), [table.relations, table.characters, ch.id, isPc]);

  // Entre personagens de jogadores todos se conhecem; os dois lados são dos jogadores.
  const peers = useMemo(() => {
    if (!isPc) return [];
    const level = (from: string, to: string) => (table.bonds ?? []).find((b) => b.fromId === from && b.toId === to)?.level ?? 0;
    return Object.values(table.characters)
      .filter((c) => c.kind === 'pc' && c.status === 'approved' && c.id !== ch.id)
      .sort(byName)
      .map((other) => ({ other, mine: level(ch.id, other.id), theirs: level(other.id, ch.id) }));
  }, [table.bonds, table.characters, ch.id, isPc]);

  if (ch.status !== 'approved') return null;

  return (
    <div className="card">
      <div className="row mb">
        <div className="card-title" style={{ margin: 0 }}><HeartHandshake size={14} /> Relações</div>
        {rows.length > 0 && <span className="tiny muted">{rows.length}</span>}
        <div className="spacer" />
        <IntroduceButton table={table} ch={ch} className="btn btn-sm" />
      </div>
      {peers.length > 0 && (
        <>
          <div className="tiny muted">Personagens dos jogadores</div>
          <div className="relation-list mb">
            {peers.map(({ other, mine, theirs }) => (
              <div key={other.id} className="relation-row">
                <Avatar config={other.avatar} size={32} />
                <div className="relation-name">
                  <strong>{other.name}</strong>
                  {table.players[other.ownerId] && <span className="tiny muted"> · {table.players[other.ownerId].name}</span>}
                </div>
                <div className="relation-sides">
                  <span className="relation-side" title={`O que ${ch.name} sente por ${other.name} (o jogador marca)`}>
                    <span className="tiny muted">{ch.name}</span>
                    <AffinityDot level={mine} title={`O que ${ch.name} sente por ${other.name}`} />
                  </span>
                  <span className="relation-side" title={`O que ${other.name} sente por ${ch.name} (o jogador marca)`}>
                    <span className="tiny muted">{other.name}</span>
                    <AffinityDot level={theirs} title={`O que ${other.name} sente por ${ch.name}`} />
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="tiny muted">NPCs</div>
        </>
      )}
      {rows.length === 0 ? (
        <p className="small muted">
          {isPc ? `${ch.name} ainda não conhece nenhum NPC.` : `Nenhum personagem de jogador conhece ${ch.name}.`}
        </p>
      ) : (
        <>
          <div className="relation-list">
            {rows.map(({ r, pc, npc }) => {
              const other = isPc ? npc : pc;
              const owner = isPc ? undefined : table.players[pc.ownerId]?.name;
              return (
                <div key={`${r.pcId}:${r.npcId}`} className="relation-row">
                  <Avatar config={other.avatar} size={32} />
                  <div className="relation-name">
                    <strong>{other.name}</strong>
                    {!isPc && owner && <span className="tiny muted"> · {owner}</span>}
                    {isPc && !npc.visible && <EyeOff size={12} className="muted" style={{ marginLeft: 4, verticalAlign: -1 }} aria-label="NPC oculto para a mesa" />}
                  </div>
                  <div className="relation-sides">
                    <span className="relation-side" title={`O que ${pc.name} sente por ${npc.name} (o jogador marca)`}>
                      <span className="tiny muted">Jogador</span>
                      <AffinityDot level={r.pc} title={`O que ${pc.name} sente por ${npc.name}`} />
                    </span>
                    <span className="relation-side">
                      <span className="tiny muted">NPC</span>
                      <AffinityPicker value={r.npc} label={`O que ${npc.name} sente por ${pc.name}`}
                        onChange={(level) => act({ type: 'relation/feel', characterId: pc.id, npcId: npc.id, level })} />
                    </span>
                  </div>
                  <ConfirmButton className="btn btn-sm btn-ghost btn-icon" title={`Desfazer a apresentação de ${npc.name} e ${pc.name}`}
                    modalTitle="Desfazer apresentação" confirmLabel="Desfazer"
                    message={<p><strong>{pc.name}</strong> deixa de conhecer <strong>{npc.name}</strong>, e as cores marcadas pelos dois lados se perdem.</p>}
                    onConfirm={() => act({ type: 'relation/forget', pcId: pc.id, npcId: npc.id }, 'Apresentação desfeita.')}>
                    <X size={14} />
                  </ConfirmButton>
                </div>
              );
            })}
          </div>
        </>
      )}
      {(rows.length > 0 || peers.length > 0) && <div className="mt"><AffinityLegend /></div>}
    </div>
  );
}

/** Atalho no topo da ficha (só fichas aprovadas). */
export function IntroduceButton({ table, ch, className = 'btn btn-sm btn-ghost' }: { table: TableState; ch: Character; className?: string }) {
  const [open, setOpen] = useState(false);
  if (ch.status !== 'approved') return null;
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}
        title={ch.kind === 'pc' ? `Apresentar NPCs a ${ch.name}` : `Apresentar ${ch.name} a personagens dos jogadores`}>
        <UserPlus size={14} /> Apresentar
      </button>
      {open && <IntroduceModal table={table} ch={ch} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Escolhe quem conhece a ficha: NPCs (numa ficha de jogador) ou personagens de jogador (num NPC). */
function IntroduceModal({ table, ch, onClose }: { table: TableState; ch: Character; onClose: () => void }) {
  const { act } = useAct();
  const isPc = ch.kind === 'pc';
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const candidates = useMemo(() => {
    const known = new Set((table.relations ?? [])
      .filter((r) => (isPc ? r.pcId : r.npcId) === ch.id)
      .map((r) => (isPc ? r.npcId : r.pcId)));
    return Object.values(table.characters)
      .filter((c) => c.status === 'approved' && c.kind === (isPc ? 'npc' : 'pc') && !known.has(c.id))
      .sort(byName);
  }, [table.relations, table.characters, ch.id, isPc]);

  const ownerOf = (c: Character) => (c.kind === 'pc' ? table.players[c.ownerId]?.name ?? '' : '');
  const shown = candidates.filter((c) => matchesQuery(q, c.name, c.concept, ownerOf(c)));
  const ids = [...picked].filter((id) => candidates.some((c) => c.id === id));
  const toggle = (id: string) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const submit = async () => {
    setBusy(true);
    const r = await act(isPc
      ? { type: 'relation/introduce', pcIds: [ch.id], npcIds: ids }
      : { type: 'relation/introduce', pcIds: ids, npcIds: [ch.id] }, 'Apresentação feita.');
    setBusy(false);
    if (r.ok) onClose();
  };

  return (
    <Modal open width={480} onClose={onClose}
      title={<><UserPlus size={16} /> {isPc ? `Apresentar a ${ch.name}` : `Apresentar ${ch.name}`}</>}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy || !ids.length} onClick={() => void submit()}>
            Apresentar{ids.length ? ` (${ids.length})` : ''}
          </button>
        </>
      }>
      <div className="col">
        <p className="small muted">
          {isPc
            ? `Os NPCs escolhidos passam a aparecer na aba Relações de ${ch.name}, com nome, conceito e aparência, mesmo os ocultos para a mesa.`
            : `${ch.name} passa a aparecer na aba Relações dos personagens escolhidos, com nome, conceito e aparência${ch.visible ? '' : ', mesmo oculto para o resto da mesa'}.`}
        </p>
        {candidates.length === 0 ? (
          <div className="empty">
            {isPc ? `${ch.name} já conhece todos os NPCs.` : `Todos os personagens de jogador já conhecem ${ch.name}.`}
          </div>
        ) : (
          <>
            {candidates.length > 6 && <SearchInput value={q} onChange={setQ} placeholder={isPc ? 'Buscar NPC' : 'Buscar personagem ou jogador'} autoFocus />}
            {!isPc && candidates.length > 1 && (
              <div className="row-wrap">
                <button className="btn btn-sm" onClick={() => setPicked(new Set(candidates.map((c) => c.id)))}>Todos</button>
                <button className="btn btn-sm btn-ghost" onClick={() => setPicked(new Set())}>Nenhum</button>
              </div>
            )}
            <div className="col" style={{ gap: 2 }}>
              {shown.map((c) => (
                <label key={c.id} className="check relation-pick">
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                  <Avatar config={c.avatar} size={28} />
                  <span className="grow" style={{ minWidth: 0 }}>
                    <strong>{c.name}</strong>
                    {c.kind === 'pc' && <span className="tiny muted"> · {ownerOf(c)}</span>}
                    {c.kind === 'npc' && !c.visible && <EyeOff size={12} className="muted" style={{ marginLeft: 4, verticalAlign: -1 }} aria-label="oculto" />}
                    {c.concept && <span className="tiny muted relation-concept">{c.concept}</span>}
                  </span>
                </label>
              ))}
              {shown.length === 0 && <div className="small muted">Ninguém com essa busca.</div>}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
