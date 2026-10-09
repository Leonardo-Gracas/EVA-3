import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Search, Skull, VenetianMask } from 'lucide-react';
import type { TableState } from '../../model/types';
import { useAct } from '../act';
import CharacterSheet from '../sheet/CharacterSheet';
import CharacterWizard from '../sheet/CharacterWizard';
import CharRow from './CharRow';
import ThreatEditor from './ThreatEditor';
import { ThreatRow, ThreatSheet } from './ThreatsPanel';

type Sel = { kind: 'npc' | 'threat'; id: string };

function matches(q: string, ...texts: string[]) {
  const n = q.trim().toLowerCase();
  return !n || texts.some((t) => t.toLowerCase().includes(n));
}

/**
 * NPCs do mestre: fichas completas de personagem (NPC) e ameaças, fichas de combate com valores livres.
 * No celular, mostra a lista ou a ficha aberta, uma de cada vez.
 */
export default function NpcsPanel({ table, detailOpen, setDetailOpen }: {
  table: TableState; detailOpen: boolean; setDetailOpen: (open: boolean) => void;
}) {
  const { act } = useAct();
  const [sel, setSel] = useState<Sel | null>(null);
  const [creatingNpc, setCreatingNpc] = useState(false);
  const [creatingThreat, setCreatingThreat] = useState(false);
  const [q, setQ] = useState('');
  const npcs = Object.values(table.characters)
    .filter((c) => c.kind === 'npc' && matches(q, c.name, c.concept))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const threats = Object.values(table.threats)
    .filter((t) => matches(q, t.name, t.concept))
    .sort((a, b) => a.createdAt - b.createdAt);
  const total = Object.values(table.characters).filter((c) => c.kind === 'npc').length + Object.keys(table.threats).length;
  const npc = sel?.kind === 'npc' ? table.characters[sel.id] : undefined;
  const threat = sel?.kind === 'threat' ? table.threats[sel.id] : undefined;
  const firstId = npcs[0]?.id ?? threats[0]?.id;

  // Nada escolhido (ou a ficha foi excluída): cai na primeira da lista.
  useEffect(() => {
    if (npc || threat || creatingNpc || !firstId) return;
    setSel({ kind: table.characters[firstId] ? 'npc' : 'threat', id: firstId });
  }, [npc, threat, creatingNpc, firstId, table.characters]);
  // Voltar à lista (tocar de novo na aba) também desiste do cadastro de NPC.
  useEffect(() => { if (!detailOpen) setCreatingNpc(false); }, [detailOpen]);

  const open = (s: Sel) => { setCreatingNpc(false); setSel(s); setDetailOpen(true); window.scrollTo({ top: 0 }); };
  const back = () => { setCreatingNpc(false); setDetailOpen(false); window.scrollTo({ top: 0 }); };
  const isSel = (kind: Sel['kind'], id: string) => !creatingNpc && sel?.kind === kind && sel.id === id;

  return (
    <div className={`split split-master${detailOpen || creatingNpc ? ' split-detail-open' : ''}`}>
      <div className="col split-list">
        {total > 6 && (
          <div className="row"><Search size={14} className="muted" /><input className="input" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        )}
        <div className="card" style={{ padding: 12 }}>
          <div className="row" style={{ marginBottom: npcs.length ? 8 : 0 }}>
            <VenetianMask size={15} className="gold" />
            <strong>Personagens</strong>
            <span className="spacer" />
            <button className="btn btn-sm" onClick={() => { setCreatingNpc(true); setDetailOpen(true); window.scrollTo({ top: 0 }); }}><Plus size={13} /> NPC</button>
          </div>
          {npcs.length === 0 && !q && <div className="tiny muted mt">Fichas completas, com classes, níveis e inventário.</div>}
          <div className="col" style={{ gap: 6 }}>
            {npcs.map((c) => <CharRow key={c.id} c={c} active={isSel('npc', c.id)} onClick={() => open({ kind: 'npc', id: c.id })} />)}
          </div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="row" style={{ marginBottom: threats.length ? 8 : 0 }}>
            <Skull size={15} className="gold" />
            <strong>Ameaças</strong>
            <span className="spacer" />
            <button className="btn btn-sm" onClick={() => setCreatingThreat(true)}><Plus size={13} /> Ameaça</button>
          </div>
          {threats.length === 0 && !q && <div className="tiny muted mt">Fichas de combate com valores livres.</div>}
          <div className="col" style={{ gap: 6 }}>
            {threats.map((t) => <ThreatRow key={t.id} t={t} active={isSel('threat', t.id)} onClick={() => open({ kind: 'threat', id: t.id })} />)}
          </div>
        </div>
        {q && !npcs.length && !threats.length && <div className="empty">Nada encontrado.</div>}
      </div>
      <div className="split-detail">
        <button className="btn btn-sm btn-ghost split-back" onClick={back}><ArrowLeft size={14} /> Todos os NPCs</button>
        {creatingNpc ? (
          <>
            <h2 className="mb">Novo NPC</h2>
            <CharacterWizard
              submitLabel="Criar NPC"
              levelEditable
              onCancel={back}
              onSubmit={async (draft) => {
                const r = await act({ type: 'npc/create', draft }, 'NPC criado.');
                if (r.ok) {
                  setCreatingNpc(false);
                  if (r.id) setSel({ kind: 'npc', id: r.id }); else setDetailOpen(false);
                }
                return r.ok;
              }}
            />
          </>
        ) : npc ? (
          <CharacterSheet ch={npc} />
        ) : threat ? (
          <ThreatSheet t={threat} onDuplicated={(id) => open({ kind: 'threat', id })} />
        ) : <div className="empty">Crie um NPC ou uma ameaça para começar.</div>}
      </div>
      {creatingThreat && (
        <ThreatEditor title="Nova ameaça" onClose={() => setCreatingThreat(false)}
          onSave={async (data) => {
            const r = await act({ type: 'threat/upsert', data }, 'Ameaça criada.');
            if (r.ok && r.id) open({ kind: 'threat', id: r.id });
            return r.ok;
          }} />
      )}
    </div>
  );
}
