import { useMemo, useState, type ReactNode } from 'react';
import { Flame, Gift, PackagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { ITEM_TYPES, isStackable, type Character, type ItemData, type ItemType, type LibraryItem, type TableState } from '../../model/types';
import { useAct } from '../act';
import Avatar from '../common/Avatar';
import ConfirmButton from '../common/ConfirmButton';
import QtyPicker, { defaultQty, parseQty } from '../common/QtyPicker';
import { Chip, FilterBar, FilterGroup, QuickFilter, SearchInput, SortSelect, matchesQuery, toggleIn } from '../common/Filters';
import ItemCard, { TYPE_ICON } from '../common/ItemCard';
import Modal from '../common/Modal';
import ItemFormModal from '../sheet/ItemForm';
import type { ItemSetId } from '../../store/itemSets';
import ItemSetsModal from './ItemSetsModal';

type Prop = 'dano' | 'bonus' | 'valor';
type Sort = 'nome' | 'tipo' | 'valor-desc' | 'valor-asc' | 'recentes';
/** Filtro rápido, sempre à vista: um tipo de item ou os que iluminam. `null` = todos. */
type Quick = ItemType | 'luz';

const lights = (i: ItemData) => !!i.effects.light;

const PROPS: Array<{ id: Prop; label: string; test: (i: ItemData) => boolean; title: string }> = [
  { id: 'dano', label: 'Causa dano', test: (i) => !!i.damage.trim(), title: 'Itens com dano definido' },
  { id: 'bonus', label: 'Dá bônus', test: (i) => !!(i.effects.def || i.effects.rdPhysical || i.effects.rdMagic), title: 'Defesa ou RD para quem equipa' },
  { id: 'valor', label: 'Tem valor', test: (i) => i.value > 0, title: 'Itens com valor em moedas' },
];

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: 'nome', label: 'Nome' },
  { id: 'tipo', label: 'Tipo' },
  { id: 'valor-desc', label: 'Mais valiosos' },
  { id: 'valor-asc', label: 'Mais baratos' },
  { id: 'recentes', label: 'Mais recentes' },
];

const TYPE_ORDER = Object.keys(ITEM_TYPES) as ItemType[];
const byName = (a: LibraryItem, b: LibraryItem) => a.name.localeCompare(b.name, 'pt-BR');

export default function ItemLibrary({ table }: { table: TableState }) {
  const { act } = useAct();
  const [q, setQ] = useState('');
  const [quick, setQuick] = useState<Quick | null>(null);
  const [props, setProps] = useState<Prop[]>([]);
  const [sort, setSort] = useState<Sort>('nome');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const [giving, setGiving] = useState<LibraryItem | null>(null);

  const all = useMemo(() => Object.values(table.itemLibrary), [table.itemLibrary]);
  // Só os tipos que existem na biblioteca viram filtro, na ordem do formulário; "Iluminação" no fim.
  const quickOptions = useMemo(() => {
    const n = new Map<ItemType, number>();
    for (const i of all) n.set(i.type, (n.get(i.type) ?? 0) + 1);
    const opts: Array<{ id: Quick; label: string; count: number; icon: ReactNode }> = TYPE_ORDER.filter((t) => n.has(t)).map((t) => {
      const Icon = TYPE_ICON[t];
      return { id: t, label: ITEM_TYPES[t], count: n.get(t)!, icon: <Icon size={13} /> };
    });
    const lit = all.filter(lights).length;
    if (lit) opts.push({ id: 'luz', label: 'Iluminação', count: lit, icon: <Flame size={13} /> });
    return opts;
  }, [all]);
  // Filtro rápido que sumiu (último item do tipo excluído) não pode prender a lista vazia.
  const quickOn = quick && quickOptions.some((o) => o.id === quick) ? quick : null;

  const items = useMemo(() => {
    const tests = PROPS.filter((p) => props.includes(p.id)).map((p) => p.test);
    const out = all.filter((i) => (!quickOn || (quickOn === 'luz' ? lights(i) : i.type === quickOn))
      && tests.every((t) => t(i))
      && matchesQuery(q, i.name, i.description, ITEM_TYPES[i.type] ?? '', i.damage));
    switch (sort) {
      case 'tipo': return out.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || byName(a, b));
      case 'valor-desc': return out.sort((a, b) => b.value - a.value || byName(a, b));
      case 'valor-asc': return out.sort((a, b) => a.value - b.value || byName(a, b));
      case 'recentes': return out.sort((a, b) => b.updatedAt - a.updatedAt);
      default: return out.sort(byName);
    }
  }, [all, q, quickOn, props, sort]);

  // Depois de importar, os novos ficam à vista: só iluminação pela pílula "Iluminação";
  // outros conjuntos no topo da lista, pelos mais recentes.
  const [importing, setImporting] = useState(false);
  const onImported = (sets: ItemSetId[]) => {
    setProps([]);
    setQ('');
    if (sets.length === 1 && sets[0] === 'iluminacao') setQuick('luz');
    else { setQuick(null); setSort('recentes'); }
  };
  const setsBtn = (
    <button className="btn btn-sm" onClick={() => setImporting(true)} title="Importar conjuntos prontos: iluminação, medieval, old school, contemporâneo">
      <PackagePlus size={14} /><span className="hide-xs">Conjuntos de itens</span>
    </button>
  );

  const active = !!q.trim() || !!quickOn || props.length > 0;
  const clear = () => { setQ(''); setQuick(null); setProps([]); };
  const createBtn = (
    <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)} title="Novo item" aria-label="Novo item">
      <Plus size={14} /><span className="hide-xs">Novo item</span>
    </button>
  );

  return (
    <div className="col gap-lg">
      <div className="page-head">
        <h2>Biblioteca de itens</h2>
        {all.length > 0 && <span className="page-head-count">{all.length}</span>}
        <span className="spacer" />
        {setsBtn}
        {all.length === 0 && createBtn}
      </div>
      {all.length > 0 && (
        <FilterBar active={active} shown={items.length} total={all.length} onClear={clear} noun={['item', 'itens']}
          filterCount={props.length} action={createBtn}
          search={<SearchInput value={q} onChange={setQ} placeholder="Buscar item" />}
          quick={quickOptions.length > 1 && (
            <QuickFilter label="Tipo" value={quickOn} onChange={setQuick} total={all.length} options={quickOptions} />
          )}
          sort={<SortSelect value={sort} onChange={setSort} options={SORTS} />}>
          <FilterGroup label="Mostrar">
            {PROPS.map((p) => (
              <Chip key={p.id} on={props.includes(p.id)} title={p.title} count={all.filter(p.test).length}
                onClick={() => setProps((l) => toggleIn(l, p.id))}>{p.label}</Chip>
            ))}
          </FilterGroup>
        </FilterBar>
      )}
      {all.length === 0 && <div className="empty">Crie itens aqui, ou importe um conjunto pronto, e entregue aos personagens.</div>}
      {all.length > 0 && items.length === 0 && <div className="empty">Nenhum item com esses filtros.</div>}
      {items.length > 0 && (
        <div className="lib-grid">
          {items.map((it) => (
            <ItemCard key={it.id} it={it} clampDesc actions={
              <>
                <ConfirmButton className="btn btn-sm btn-ghost btn-icon" title={`Excluir ${it.name}`} modalTitle="Excluir item da biblioteca"
                  confirmLabel={`Excluir ${it.name}`}
                  message={<><p>Excluir <strong>{it.name}</strong> da biblioteca?</p><p className="small muted mt">Cópias já entregues aos personagens continuam nos inventários. Não dá para desfazer.</p></>}
                  onConfirm={() => act({ type: 'library/delete', itemId: it.id })}><Trash2 size={14} /></ConfirmButton>
                <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEditing(it)} title={`Editar ${it.name}`} aria-label={`Editar ${it.name}`}>
                  <Pencil size={14} />
                </button>
                <button className="btn btn-sm" onClick={() => setGiving(it)} title={`Entregar ${it.name}`}>
                  <Gift size={14} /> Entregar
                </button>
              </>
            } />
          ))}
        </div>
      )}
      {creating && (
        <ItemFormModal title="Novo item" withQty={false} onClose={() => setCreating(false)}
          onSubmit={async (item) => (await act({ type: 'library/upsert', item }, 'Item criado.')).ok} />
      )}
      {editing && (
        <ItemFormModal title={`Editar ${editing.name}`} withQty={false} initial={editing} onClose={() => setEditing(null)}
          onSubmit={async (item) => (await act({ type: 'library/upsert', item, itemId: editing.id }, 'Item atualizado.')).ok} />
      )}
      {importing && <ItemSetsModal table={table} onClose={() => setImporting(false)} onImported={onImported} />}
      {giving && <GiveModal table={table} item={giving} onClose={() => setGiving(null)} />}
    </div>
  );
}

/** Entregar: personagem num toque (jogadores antes dos NPCs) e quantidade com o pacote cheio já sugerido. */
function GiveModal({ table, item, onClose }: { table: TableState; item: LibraryItem; onClose: () => void }) {
  const { act } = useAct();
  const chars = Object.values(table.characters)
    .filter((c) => c.status === 'approved')
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'pt-BR') : a.kind === 'pc' ? -1 : 1));
  const [charId, setCharId] = useState(chars[0]?.id ?? '');
  const [qty, setQty] = useState(String(defaultQty(item)));
  const [busy, setBusy] = useState(false);
  const n = parseQty(qty);
  const target = chars.find((c) => c.id === charId);
  const have = (c: Character) => c.inventory.filter((i) => i.libraryId === item.id).reduce((s, i) => s + i.qty, 0);
  const stack = target && isStackable(item) ? target.inventory.find((i) => i.libraryId === item.id && isStackable(i)) : undefined;

  const go = async () => {
    if (!target || busy) return;
    setBusy(true);
    const r = await act({ type: 'library/give', itemId: item.id, characterId: target.id, qty: n }, `${item.name} ×${n} para ${target.name}.`);
    setBusy(false);
    if (r.ok) onClose();
  };
  return (
    <Modal open title={`Entregar ${item.name}`} onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!target || busy} onClick={() => void go()}>
            {target ? `Entregar ×${n} a ${target.name}` : 'Entregar'}
          </button>
        </>
      }>
      {chars.length === 0 ? <div className="empty">Nenhuma ficha aprovada.</div> : (
        <form className="col gap-lg" onSubmit={(e) => { e.preventDefault(); void go(); }}>
          <div className="field">
            <span className="label">Para quem</span>
            <div className="give-list" role="radiogroup" aria-label="Personagem">
              {chars.map((c) => {
                const h = have(c);
                return (
                  <button key={c.id} type="button" role="radio" aria-checked={c.id === charId}
                    className={`give-row${c.id === charId ? ' on' : ''}`} onClick={() => setCharId(c.id)}>
                    <Avatar config={c.avatar} size={32} />
                    <div className="grow">
                      <div className="give-name">{c.name}</div>
                      <div className="tiny muted">{c.kind === 'npc' ? 'NPC' : table.players[c.ownerId]?.name ?? '—'}</div>
                    </div>
                    {h > 0 && <span className="tiny muted">tem {h}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <QtyPicker item={item} value={qty} onChange={setQty} have={stack?.qty} id="give-qty" />
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  );
}
