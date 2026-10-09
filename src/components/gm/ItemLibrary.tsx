import { useMemo, useState } from 'react';
import { Gift, Pencil, Plus, Trash2 } from 'lucide-react';
import { ITEM_TYPES, isStackable, type Character, type ItemData, type ItemType, type LibraryItem, type TableState } from '../../model/types';
import { useAct } from '../act';
import Avatar from '../common/Avatar';
import ConfirmButton from '../common/ConfirmButton';
import QtyPicker, { defaultQty, parseQty } from '../common/QtyPicker';
import { Chip, FilterBar, FilterGroup, SearchInput, SortSelect, matchesQuery, toggleIn } from '../common/Filters';
import ItemCard, { TYPE_ICON } from '../common/ItemCard';
import Modal from '../common/Modal';
import ItemFormModal from '../sheet/ItemForm';

type Prop = 'dano' | 'bonus' | 'valor';
type Sort = 'nome' | 'tipo' | 'valor-desc' | 'valor-asc' | 'recentes';

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
  const [types, setTypes] = useState<ItemType[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [sort, setSort] = useState<Sort>('nome');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const [giving, setGiving] = useState<LibraryItem | null>(null);

  const all = useMemo(() => Object.values(table.itemLibrary), [table.itemLibrary]);
  // Só os tipos que existem na biblioteca viram filtro, na ordem do formulário.
  const typeCounts = useMemo(() => {
    const n = new Map<ItemType, number>();
    for (const i of all) n.set(i.type, (n.get(i.type) ?? 0) + 1);
    return TYPE_ORDER.filter((t) => n.has(t)).map((t) => ({ type: t, count: n.get(t)! }));
  }, [all]);

  const items = useMemo(() => {
    const tests = PROPS.filter((p) => props.includes(p.id)).map((p) => p.test);
    const out = all.filter((i) => (!types.length || types.includes(i.type))
      && tests.every((t) => t(i))
      && matchesQuery(q, i.name, i.description, ITEM_TYPES[i.type] ?? '', i.damage));
    switch (sort) {
      case 'tipo': return out.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || byName(a, b));
      case 'valor-desc': return out.sort((a, b) => b.value - a.value || byName(a, b));
      case 'valor-asc': return out.sort((a, b) => a.value - b.value || byName(a, b));
      case 'recentes': return out.sort((a, b) => b.updatedAt - a.updatedAt);
      default: return out.sort(byName);
    }
  }, [all, q, types, props, sort]);

  const active = !!q.trim() || types.length > 0 || props.length > 0;
  const clear = () => { setQ(''); setTypes([]); setProps([]); };

  return (
    <div className="card">
      <div className="row-wrap mb">
        <div className="card-title" style={{ margin: 0 }}>Biblioteca de itens</div>
        <div className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Plus size={14} /> Novo item</button>
      </div>
      {all.length > 0 && (
        <FilterBar active={active} shown={items.length} total={all.length} onClear={clear} noun={['item', 'itens']}
          search={<SearchInput value={q} onChange={setQ} placeholder="Buscar por nome, descrição ou dano" />}
          sort={<SortSelect value={sort} onChange={setSort} options={SORTS} />}>
          {typeCounts.length > 1 && (
            <FilterGroup label="Tipo">
              {typeCounts.map(({ type, count }) => {
                const Icon = TYPE_ICON[type];
                return (
                  <Chip key={type} on={types.includes(type)} count={count} onClick={() => setTypes((l) => toggleIn(l, type))}>
                    <Icon size={13} />{ITEM_TYPES[type]}
                  </Chip>
                );
              })}
            </FilterGroup>
          )}
          <FilterGroup label="Mostrar">
            {PROPS.map((p) => (
              <Chip key={p.id} on={props.includes(p.id)} title={p.title} count={all.filter(p.test).length}
                onClick={() => setProps((l) => toggleIn(l, p.id))}>{p.label}</Chip>
            ))}
          </FilterGroup>
        </FilterBar>
      )}
      {all.length === 0 && <div className="empty">Crie itens aqui e entregue aos personagens.</div>}
      {all.length > 0 && items.length === 0 && <div className="empty">Nenhum item com esses filtros.</div>}
      <div className="item-list">
        {items.map((it) => (
          <ItemCard key={it.id} it={it} actions={(
            <>
              <button className="btn btn-sm" onClick={() => setGiving(it)}><Gift size={13} /> Entregar</button>
              <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEditing(it)} title="Editar"><Pencil size={14} /></button>
              <ConfirmButton className="btn btn-sm btn-ghost btn-icon" title="Excluir" modalTitle="Excluir item da biblioteca" confirmLabel={`Excluir ${it.name}`}
                message={<><p>Excluir <strong>{it.name}</strong> da biblioteca?</p><p className="small muted mt">Cópias já entregues aos personagens continuam nos inventários. Não dá para desfazer.</p></>}
                onConfirm={() => act({ type: 'library/delete', itemId: it.id })}><Trash2 size={14} /></ConfirmButton>
            </>
          )} />
        ))}
      </div>
      {creating && (
        <ItemFormModal title="Novo item" withQty={false} onClose={() => setCreating(false)}
          onSubmit={async (item) => (await act({ type: 'library/upsert', item }, 'Item criado.')).ok} />
      )}
      {editing && (
        <ItemFormModal title={`Editar ${editing.name}`} withQty={false} initial={editing} onClose={() => setEditing(null)}
          onSubmit={async (item) => (await act({ type: 'library/upsert', item, itemId: editing.id }, 'Item atualizado.')).ok} />
      )}
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
