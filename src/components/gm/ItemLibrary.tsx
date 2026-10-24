import { useMemo, useState } from 'react';
import { ChevronDown, Coins, Gift, Pencil, Plus, Trash2 } from 'lucide-react';
import { ITEM_SLOTS, ITEM_TYPES, isStackable, type Character, type ItemData, type ItemType, type LibraryItem, type TableState } from '../../model/types';
import { useAct } from '../act';
import Avatar from '../common/Avatar';
import ConfirmButton from '../common/ConfirmButton';
import QtyPicker, { defaultQty, parseQty } from '../common/QtyPicker';
import { Chip, FilterBar, FilterGroup, QuickFilter, SearchInput, SortSelect, matchesQuery, toggleIn } from '../common/Filters';
import { ItemIcon, TYPE_ICON } from '../common/ItemCard';
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
  const [openId, setOpenId] = useState<string | null>(null);

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
        {all.length === 0 && createBtn}
      </div>
      {all.length > 0 && (
        <FilterBar active={active} shown={items.length} total={all.length} onClear={clear} noun={['item', 'itens']}
          filterCount={props.length} action={createBtn}
          search={<SearchInput value={q} onChange={setQ} placeholder="Buscar item" />}
          quick={typeCounts.length > 1 && (
            <QuickFilter label="Tipo" value={types[0] ?? null} onChange={(t) => setTypes(t ? [t] : [])} total={all.length}
              options={typeCounts.map(({ type, count }) => {
                const Icon = TYPE_ICON[type];
                return { id: type, label: ITEM_TYPES[type], count, icon: <Icon size={13} /> };
              })} />
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
      {all.length === 0 && <div className="empty">Crie itens aqui e entregue aos personagens.</div>}
      {all.length > 0 && items.length === 0 && <div className="empty">Nenhum item com esses filtros.</div>}
      {items.length > 0 && (
        <div className="lib-list">
          {items.map((it) => (
            <LibraryRow key={it.id} it={it} open={openId === it.id} onToggle={() => setOpenId(openId === it.id ? null : it.id)}
              onGive={() => setGiving(it)} onEdit={() => setEditing(it)}
              onDelete={() => act({ type: 'library/delete', itemId: it.id })} />
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
      {giving && <GiveModal table={table} item={giving} onClose={() => setGiving(null)} />}
    </div>
  );
}

const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** O número que mais importa de relance: o dano, ou o bônus para quem equipa. */
function keyStat(it: ItemData): { text: string; tone: 'dmg' | 'buff' | 'mixed' } | null {
  if (it.damage) return { text: it.damage, tone: 'dmg' };
  const { def, rdPhysical, rdMagic } = it.effects;
  const parts = [
    def ? `DEF ${fmt(def)}` : '',
    rdPhysical ? `RD ${fmt(rdPhysical)}` : '',
    rdMagic ? `RDM ${fmt(rdMagic)}` : '',
  ].filter(Boolean);
  // Verde só quando tudo é bônus; com alguma penalidade, cor neutra.
  return parts.length ? { text: parts.join(' · '), tone: def < 0 || rdPhysical < 0 || rdMagic < 0 ? 'mixed' : 'buff' } : null;
}

const signTone = (n: number) => (n < 0 ? 'dmg' : 'buff');

/**
 * Linha da biblioteca: ícone, nome, tipo e o número principal. Tocar abre os detalhes
 * (descrição, bônus, durabilidade) e as ações de editar e excluir; "Entregar" fica sempre à mão.
 */
function LibraryRow({ it, open, onToggle, onGive, onEdit, onDelete }: {
  it: LibraryItem; open: boolean; onToggle: () => void; onGive: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const key = keyStat(it);
  const stats = [
    it.damage && { label: 'Dano', value: it.damage, tone: 'dmg' },
    it.effects.def && { label: 'Defesa', value: fmt(it.effects.def), tone: signTone(it.effects.def) },
    it.effects.rdPhysical && { label: 'RD física', value: fmt(it.effects.rdPhysical), tone: signTone(it.effects.rdPhysical) },
    it.effects.rdMagic && { label: 'RD mágica', value: fmt(it.effects.rdMagic), tone: signTone(it.effects.rdMagic) },
    it.pack > 1 && { label: 'Pacote', value: `${it.pack} un.` },
    it.value > 0 && { label: it.pack > 1 ? 'Valor do pacote' : 'Valor', value: it.value.toLocaleString('pt-BR') },
    { label: 'Durabilidade', value: `${it.durability.pv} PV · RD ${it.durability.rd} · DEF ${it.durability.def}` },
  ].filter(Boolean) as Array<{ label: string; value: string; tone?: string }>;
  return (
    <div className={`lib-row${open ? ' open' : ''}`}>
      <div className="lib-row-top">
        <button className="lib-row-main" onClick={onToggle} aria-expanded={open}>
          <ItemIcon type={it.type} size={16} />
          <div className="grow">
            <div className="lib-row-name">{it.name}{it.pack > 1 && <span className="item-qty">×{it.pack}</span>}</div>
            <div className="item-sub">
              <span>{ITEM_TYPES[it.type] ?? 'Outro'}</span>
              {it.slot && <span>{ITEM_SLOTS[it.slot]}</span>}
            </div>
          </div>
          {key && <span className={`lib-row-key item-${key.tone}`}>{key.text}</span>}
          {it.value > 0 && <span className="lib-row-value"><Coins size={12} />{it.value.toLocaleString('pt-BR')}</span>}
          <ChevronDown size={15} className="lib-row-chev" />
        </button>
        <button className="btn btn-sm btn-ghost lib-row-give" onClick={onGive} title={`Entregar ${it.name}`}>
          <Gift size={14} /><span className="hide-xs">Entregar</span>
        </button>
      </div>
      {open && (
        <div className="lib-row-detail">
          {it.description ? <p className="item-desc">{it.description}</p> : <p className="tiny muted">Sem descrição.</p>}
          <dl className="lib-row-stats">
            {stats.map((s) => (
              <div key={s.label}><dt>{s.label}</dt><dd className={s.tone ? `item-${s.tone}` : undefined}>{s.value}</dd></div>
            ))}
          </dl>
          <div className="row">
            <span className="spacer" />
            <ConfirmButton className="btn btn-sm btn-ghost" title="Excluir" modalTitle="Excluir item da biblioteca" confirmLabel={`Excluir ${it.name}`}
              message={<><p>Excluir <strong>{it.name}</strong> da biblioteca?</p><p className="small muted mt">Cópias já entregues aos personagens continuam nos inventários. Não dá para desfazer.</p></>}
              onConfirm={onDelete}><Trash2 size={14} /> Excluir</ConfirmButton>
            <button className="btn btn-sm" onClick={onEdit}><Pencil size={14} /> Editar</button>
          </div>
        </div>
      )}
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
