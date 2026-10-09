import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Upload, VenetianMask } from 'lucide-react';
import type { Character, TableState } from '../../model/types';
import { CLASS_IDS, CLASSES, type ClassId } from '../../rules/classes';
import { deriveStats, type Derived } from '../../rules/derive';
import { useAct } from '../act';
import { ExportCharactersButton, useImportCharacters } from '../common/CharacterFile';
import { Chip, FilterBar, FilterGroup, SearchInput, SortSelect, matchesQuery, toggleIn } from '../common/Filters';
import CharacterSheet from '../sheet/CharacterSheet';
import CharacterWizard from '../sheet/CharacterWizard';
import CharRow from './CharRow';

type State = 'feridos' | 'gastos' | 'caidos';
type Vis = 'visiveis' | 'ocultos';
type Sort = 'nome' | 'nivel-desc' | 'nivel-asc' | 'pv' | 'recentes';

type Entry = { c: Character; d: Derived };

const STATES: Array<{ id: State; label: string; title: string; test: (e: Entry) => boolean }> = [
  { id: 'feridos', label: 'Feridos', title: 'PV abaixo do máximo', test: ({ c, d }) => c.current.pv < d.pvMax },
  { id: 'gastos', label: 'PE ou Clareza gastos', title: 'PE ou Clareza abaixo do máximo', test: ({ c, d }) => c.current.pe < d.peMax || c.current.clareza < d.clarezaMax },
  { id: 'caidos', label: 'Caídos', title: 'PV em 0 ou menos', test: ({ c }) => c.current.pv <= 0 },
];

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: 'nome', label: 'Nome' },
  { id: 'nivel-desc', label: 'Maior nível' },
  { id: 'nivel-asc', label: 'Menor nível' },
  { id: 'pv', label: 'Mais feridos' },
  { id: 'recentes', label: 'Mais recentes' },
];

const byName = (a: Entry, b: Entry) => a.c.name.localeCompare(b.c.name, 'pt-BR');
const pvRatio = ({ c, d }: Entry) => c.current.pv / Math.max(1, d.pvMax);

/**
 * NPCs do mestre: fichas completas de personagem, com PV, PE e Clareza atuais em barras
 * (cada NPC é único). No celular, mostra a lista ou a ficha aberta, uma de cada vez.
 */
export default function NpcsPanel({ table, detailOpen, setDetailOpen }: {
  table: TableState; detailOpen: boolean; setDetailOpen: (open: boolean) => void;
}) {
  const { act } = useAct();
  const importChars = useImportCharacters();
  const [selId, setSelId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [classes, setClasses] = useState<ClassId[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [vis, setVis] = useState<Vis[]>([]);
  const [sort, setSort] = useState<Sort>('nome');

  const all = useMemo<Entry[]>(() => Object.values(table.characters)
    .filter((c) => c.kind === 'npc')
    .map((c) => ({ c, d: deriveStats(c) })), [table.characters]);

  const classCounts = useMemo(() => CLASS_IDS
    .map((id) => ({ id, count: all.filter((e) => e.d.classes.includes(id)).length }))
    .filter((x) => x.count > 0), [all]);

  const npcs = useMemo(() => {
    const stateTests = STATES.filter((s) => states.includes(s.id)).map((s) => s.test);
    const out = all.filter((e) => (!classes.length || e.d.classes.some((k) => classes.includes(k)))
      && (!stateTests.length || stateTests.some((t) => t(e)))
      && (!vis.length || vis.includes(e.c.visible ? 'visiveis' : 'ocultos'))
      && matchesQuery(q, e.c.name, e.c.concept, e.d.title, ...e.d.classes.map((k) => CLASSES[k].name)));
    switch (sort) {
      case 'nivel-desc': return out.sort((a, b) => b.d.level - a.d.level || byName(a, b));
      case 'nivel-asc': return out.sort((a, b) => a.d.level - b.d.level || byName(a, b));
      case 'pv': return out.sort((a, b) => pvRatio(a) - pvRatio(b) || byName(a, b));
      case 'recentes': return out.sort((a, b) => b.c.createdAt - a.c.createdAt);
      default: return out.sort(byName);
    }
  }, [all, q, classes, states, vis, sort]);

  const npc = selId && table.characters[selId]?.kind === 'npc' ? table.characters[selId] : undefined;
  const firstId = npcs[0]?.c.id;

  // Nada escolhido (ou a ficha foi excluída): cai na primeira da lista.
  useEffect(() => {
    if (npc || creating || !firstId) return;
    setSelId(firstId);
  }, [npc, creating, firstId]);
  // Voltar à lista (tocar de novo na aba) também desiste do cadastro.
  useEffect(() => { if (!detailOpen) setCreating(false); }, [detailOpen]);

  const open = (id: string) => { setCreating(false); setSelId(id); setDetailOpen(true); window.scrollTo({ top: 0 }); };
  const back = () => { setCreating(false); setDetailOpen(false); window.scrollTo({ top: 0 }); };

  const active = !!q.trim() || classes.length > 0 || states.length > 0 || vis.length > 0;
  const clear = () => { setQ(''); setClasses([]); setStates([]); setVis([]); };
  const visCount = (v: Vis) => all.filter((e) => e.c.visible === (v === 'visiveis')).length;

  return (
    <div className={`split split-master${detailOpen || creating ? ' split-detail-open' : ''}`}>
      <div className="col split-list">
        <div className="row">
          <VenetianMask size={15} className="gold" />
          <strong>NPCs</strong>
          <span className="tiny muted">{all.length}</span>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost btn-icon" title="Importar NPCs de um arquivo (.json)" onClick={async () => {
            const r = await importChars('npc');
            if (r?.id) open(r.id);
          }}><Upload size={14} /></button>
          {npcs.length > 0 && (
            <ExportCharactersButton chars={npcs.map((e) => e.c)} name="npcs" className="btn btn-sm btn-ghost btn-icon"
              title={npcs.length > 1 ? `Exportar os ${npcs.length} NPCs da lista (.json)` : 'Exportar o NPC da lista (.json)'} />
          )}
          <button className="btn btn-sm btn-primary" onClick={() => { setCreating(true); setDetailOpen(true); window.scrollTo({ top: 0 }); }}><Plus size={13} /> NPC</button>
        </div>
        {all.length > 0 && (
          <FilterBar active={active} shown={npcs.length} total={all.length} onClear={clear} noun={['NPC', 'NPCs']}
            search={<SearchInput value={q} onChange={setQ} placeholder="Buscar por nome, conceito ou classe" />}
            sort={<SortSelect value={sort} onChange={setSort} options={SORTS} />}>
            {classCounts.length > 1 && (
              <FilterGroup label="Classe">
                {classCounts.map(({ id, count }) => (
                  <Chip key={id} on={classes.includes(id)} count={count} onClick={() => setClasses((l) => toggleIn(l, id))}>
                    <span className="chip-dot" style={{ background: CLASSES[id].color }} />{CLASSES[id].name}
                  </Chip>
                ))}
              </FilterGroup>
            )}
            <FilterGroup label="Estado">
              {STATES.map((s) => (
                <Chip key={s.id} on={states.includes(s.id)} title={s.title} count={all.filter(s.test).length}
                  onClick={() => setStates((l) => toggleIn(l, s.id))}>{s.label}</Chip>
              ))}
            </FilterGroup>
            <FilterGroup label="Jogadores">
              <Chip on={vis.includes('visiveis')} count={visCount('visiveis')} title="Nome e conceito aparecem aos jogadores" onClick={() => setVis((l) => toggleIn(l, 'visiveis'))}>Visíveis</Chip>
              <Chip on={vis.includes('ocultos')} count={visCount('ocultos')} onClick={() => setVis((l) => toggleIn(l, 'ocultos'))}>Ocultos</Chip>
            </FilterGroup>
          </FilterBar>
        )}
        {all.length === 0 && <div className="empty">Fichas completas, com classes, níveis e inventário. Crie o primeiro NPC ou importe de um arquivo.</div>}
        {all.length > 0 && npcs.length === 0 && <div className="empty">Nenhum NPC com esses filtros.</div>}
        <div className="col" style={{ gap: 6 }}>
          {npcs.map(({ c }) => <CharRow key={c.id} c={c} bars active={!creating && c.id === selId} onClick={() => open(c.id)} />)}
        </div>
      </div>
      <div className="split-detail">
        <button className="btn btn-sm btn-ghost split-back" onClick={back}><ArrowLeft size={14} /> Todos os NPCs</button>
        {creating ? (
          <>
            <h2 className="mb">Novo NPC</h2>
            <CharacterWizard
              submitLabel="Criar NPC"
              levelEditable
              onCancel={back}
              onSubmit={async (draft) => {
                const r = await act({ type: 'npc/create', draft }, 'NPC criado.');
                if (r.ok) {
                  setCreating(false);
                  if (r.id) setSelId(r.id); else setDetailOpen(false);
                }
                return r.ok;
              }}
            />
          </>
        ) : npc ? (
          <CharacterSheet ch={npc} />
        ) : <div className="empty">Crie um NPC para começar.</div>}
      </div>
    </div>
  );
}
