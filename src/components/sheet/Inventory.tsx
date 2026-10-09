import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Backpack, ChevronRight, Coins, Hammer, Hand, Minus, Wrench, Pencil, Plus, Shield, Trash2 } from 'lucide-react';
import { ITEM_TYPES, isStackable, type Character, type InventoryItem, type ItemType, type LibraryItem } from '../../model/types';
import { useAct } from '../act';
import ActButton from '../common/ActButton';
import ItemCard, { ItemIcon, stackValue, TYPE_ICON } from '../common/ItemCard';
import ConfirmModal from '../common/ConfirmModal';
import Modal from '../common/Modal';
import { Chip, SearchInput, matchesQuery } from '../common/Filters';
import QtyPicker, { defaultQty, parseQty } from '../common/QtyPicker';
import ResourceAdjustModal, { GOLD_STEPS, goldOps } from '../common/ResourceAdjust';
import { toast } from '../common/toast';
import { equipBlock, handsInUse, MAX_HANDS } from '../../rules/equipment';
import ItemFormModal from './ItemForm';


export default function Inventory({ ch, readOnly }: { ch: Character; readOnly?: boolean }) {
  const { act } = useAct();
  const [goldOpen, setGoldOpen] = useState(false);
  // Adicionar: primeiro o seletor da biblioteca; "Criar novo" troca para o formulário.
  const [adding, setAdding] = useState<'pick' | 'create' | null>(null);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [repairing, setRepairing] = useState<InventoryItem | null>(null);
  const [removing, setRemoving] = useState<InventoryItem | null>(null);
  // Pelo id: o modal acompanha a quantidade enquanto ela muda.
  const [stockId, setStockId] = useState<string | null>(null);
  const stocking = stockId ? ch.inventory.find((i) => i.id === stockId) : undefined;
  const total = ch.inventory.reduce((s, it) => s + stackValue(it, it.qty), 0);

  return (
    <div className="card">
      <div className="row mb">
        <div className="card-title" style={{ margin: 0 }}><Backpack size={14} /> Inventário</div>
        {total > 0 && <span className="item-value tiny" title="Valor total do inventário"><Coins size={12} />{total.toLocaleString('pt-BR')}</span>}
        <span className="tiny muted" title="Mãos ocupadas por itens equipados. Proteção: uma por vez; vestes à vontade.">
          <Hand size={12} /> {handsInUse(ch.inventory)}/{MAX_HANDS} mãos
        </span>
        <div className="spacer" />
        {!readOnly && (
          <ActButton perm="item_add" onClick={() => setAdding('pick')}><Plus size={14} /> Item</ActButton>
        )}
      </div>
      <div className="gold-row">
        <Coins size={18} className="gold" />
        <div className="grow">
          <div className="gold-amount">{(ch.gold ?? 0).toLocaleString('pt-BR')} <span className="small muted">de ouro</span></div>
        </div>
        {!readOnly && (
          <ActButton perm="gold_change" className="btn btn-sm" title="Ganhar ou gastar ouro" onClick={() => setGoldOpen(true)}>
            <Coins size={13} /> Ganhar / gastar
          </ActButton>
        )}
      </div>
      {ch.inventory.length === 0 && <div className="empty">Nenhum item.</div>}
      <div className="item-list">
        {ch.inventory.map((it) => {
          const stackable = isStackable(it);
          // Munição e consumíveis não se equipam nem levam dano no dia a dia: menos botões no cartão.
          const equippable = !stackable || it.equipped || !!(it.effects.def || it.effects.rdPhysical || it.effects.rdMagic);
          const block = it.equipped ? null : equipBlock(ch.inventory, it);
          return (
            <ItemCard key={it.id} it={it} pv={it.pv} qty={it.qty} equipped={it.equipped}
              stock={stackable ? <Stock ch={ch} it={it} readOnly={readOnly} onAdjust={() => setStockId(it.id)} /> : undefined}
              actions={readOnly ? undefined : (
                <>
                  {equippable && (
                    <ActButton perm="item_equip" className={`btn btn-sm${it.equipped ? ' btn-primary' : ''}${block ? ' equip-blocked' : ''}`}
                      title={it.equipped ? 'Desequipar' : block ?? 'Equipar'}
                      // Barrado aqui mesmo: não vale mandar ao mestre um pedido que o motor recusaria.
                      onClick={() => block ? toast(block, 'error')
                        : void act({ type: 'item/equip', characterId: ch.id, itemId: it.id, equipped: !it.equipped })}>
                      <Shield size={13} />{it.equipped ? 'Equipado' : 'Equipar'}
                    </ActButton>
                  )}
                  {!stackable && (
                    <ActButton perm="item_durability" className="btn btn-sm btn-ghost btn-icon" title="Durabilidade: dano e reparo" onClick={() => setRepairing(it)}><Hammer size={14} /></ActButton>
                  )}
                  <ActButton perm="item_update" className="btn btn-sm btn-ghost btn-icon" title="Editar" onClick={() => setEditing(it)}><Pencil size={14} /></ActButton>
                  <ActButton perm="item_remove" className="btn btn-sm btn-ghost btn-icon" title="Remover"
                    onClick={() => setRemoving(it)}><Trash2 size={14} /></ActButton>
                </>
              )} />
          );
        })}
      </div>
      {removing && (
        <ConfirmModal title="Remover item" confirmLabel={`Remover ${removing.name}`} onClose={() => setRemoving(null)}
          onConfirm={async () => (await act({ type: 'item/remove', characterId: ch.id, itemId: removing.id }, 'Item removido.')).ok}>
          <p>Remover <strong>{removing.name}</strong>{removing.qty !== 1 ? ` (×${removing.qty})` : ''} do inventário de <strong>{ch.name}</strong>?</p>
          <p className="small muted mt">Não dá para desfazer.</p>
        </ConfirmModal>
      )}
      {adding === 'pick' && (
        <LibraryPickModal ch={ch} onCreate={() => setAdding('create')} onClose={() => setAdding(null)} />
      )}
      {adding === 'create' && (
        <ItemFormModal title="Novo item" submitLabel="Adicionar" onClose={() => setAdding(null)}
          note="O item vai para o inventário e também para a biblioteca de itens."
          onSubmit={async (item, qty) => (await act({ type: 'item/add', characterId: ch.id, item, qty, toLibrary: true }, 'Item adicionado.')).ok} />
      )}
      {editing && (
        <ItemFormModal title={`Editar ${editing.name}`} initial={editing} initialQty={editing.qty} onClose={() => setEditing(null)}
          onSubmit={async (item, qty) => (await act({ type: 'item/update', characterId: ch.id, itemId: editing.id, item, qty }, 'Item atualizado.')).ok} />
      )}
      {goldOpen && <GoldModal ch={ch} onClose={() => setGoldOpen(false)} />}
      {repairing && <DurabilityModal ch={ch} it={repairing} onClose={() => setRepairing(null)} />}
      {stocking && <StockModal ch={ch} it={stocking} onClose={() => setStockId(null)} />}
    </div>
  );
}

// ── Munição e consumíveis ────────────────────────────────────

/**
 * Contador do cartão: − gasta 1 num toque (o uso mais comum, em combate),
 * + repõe 1, e o número abre o ajuste em lote. A barrinha mostra o quanto
 * resta do pacote.
 */
function Stock({ ch, it, readOnly, onAdjust }: { ch: Character; it: InventoryItem; readOnly?: boolean; onAdjust: () => void }) {
  const { act } = useAct();
  const use = (amount: number) => void act({ type: 'item/use', characterId: ch.id, itemId: it.id, amount });
  const caption = it.qty === 0 ? 'esgotado' : it.pack > 1 && it.qty <= it.pack ? `de ${it.pack}` : 'unid.';
  const count = (
    <>
      <span className="stock-n">{it.qty}</span>
      <span className="stock-cap">{caption}</span>
      {it.pack > 1 && <span className="stock-fill" style={{ width: `${Math.min(1, it.qty / it.pack) * 100}%` }} />}
    </>
  );
  if (readOnly) return <div className="stock"><div className="stock-count">{count}</div></div>;
  return (
    <div className="stock" role="group" aria-label={`Quantidade de ${it.name}`}>
      <ActButton perm="item_use" className="stock-btn stock-down" disabled={it.qty <= 0}
        title="Gastar 1" aria-label={`Gastar 1 de ${it.name}`} onClick={() => use(1)}>
        <Minus size={18} />
      </ActButton>
      <button type="button" className="stock-count" title="Gastar ou repor várias de uma vez" onClick={onAdjust}>{count}</button>
      <ActButton perm="item_update" className="stock-btn stock-up"
        title="Repor 1" aria-label={`Repor 1 de ${it.name}`} onClick={() => use(-1)}>
        <Plus size={18} />
      </ActButton>
    </div>
  );
}

function StockModal({ ch, it, onClose }: { ch: Character; it: InventoryItem; onClose: () => void }) {
  const { act } = useAct();
  const Icon = TYPE_ICON[it.type];
  const steps = [...new Set([1, 5, 10, ...(it.pack > 10 ? [it.pack] : [])])];
  return (
    <ResourceAdjustModal title={`${it.name} — ${ch.name}`} perm="item_use" onClose={onClose}
      tracks={[{
        key: 'qty', label: it.type === 'municao' ? 'Munição' : it.type === 'consumivel' ? 'Usos' : 'Unid.',
        icon: <Icon size={16} color="var(--gold)" />, color: 'var(--gold)', barClass: 'bar-dur',
        current: it.qty, min: 0, steps,
        ops: [
          { key: 'use', label: 'Gastar', tone: 'down', compute: (c, n) => c - n, reason: (n) => `Gastou ${n}` },
          {
            key: 'restock', label: 'Repor', tone: 'up', compute: (c, n) => c + n, reason: (n) => `Repôs ${n}`,
            hint: it.pack > 1 ? `Um pacote tem ${it.pack}.` : undefined,
          },
        ],
        status: (v) => (v <= 0 ? 'Fica esgotado (o item continua no inventário).' : undefined),
      }]}
      onApply={async (_k, v, reason) => (await act({ type: 'item/use', characterId: ch.id, itemId: it.id, amount: it.qty - v, reason })).ok} />
  );
}

// ── Adicionar da biblioteca ──────────────────────────────────

const TYPE_ORDER = Object.keys(ITEM_TYPES) as ItemType[];

/**
 * Seletor da biblioteca em duas etapas. Na lista, "+N" põe o pacote cheio (ou 1
 * item) num toque e o modal continua aberto para o próximo; tocar no item abre
 * o detalhe para escolher outra quantidade. Busca e tipos ficam fixos no topo.
 */
function LibraryPickModal({ ch, onCreate, onClose }: { ch: Character; onCreate: () => void; onClose: () => void }) {
  const { act, library } = useAct();
  const [q, setQ] = useState('');
  const [type, setType] = useState<ItemType | null>(null);
  const [picked, setPicked] = useState<LibraryItem | null>(null);
  const [qty, setQty] = useState('1');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Record<string, { qty: number; requested: boolean }>>({});
  const topRef = useRef<HTMLDivElement>(null);
  const lastPicked = useRef<string | null>(null);
  // No celular, abrir o teclado de cara esconde metade da lista.
  const finePointer = useMemo(() => window.matchMedia?.('(pointer: fine)').matches ?? true, []);

  const typeCounts = useMemo(() => {
    const n = new Map<ItemType, number>();
    for (const i of library) n.set(i.type, (n.get(i.type) ?? 0) + 1);
    return TYPE_ORDER.filter((t) => n.has(t)).map((t) => ({ type: t, count: n.get(t)! }));
  }, [library]);

  const items = useMemo(() => library
    .filter((i) => (!type || i.type === type) && matchesQuery(q, i.name, ITEM_TYPES[i.type] ?? '', i.damage, i.description))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [library, q, type]);

  /** Pilha do inventário onde a entrega vai somar (munição, consumíveis). */
  const stackOf = (lib: LibraryItem) => (isStackable(lib)
    ? ch.inventory.find((i) => i.libraryId === lib.id && isStackable(i))
    : undefined);
  const copies = (lib: LibraryItem) => ch.inventory.filter((i) => i.libraryId === lib.id).reduce((s, i) => s + i.qty, 0);

  // Detalhe começa do topo; ao voltar, a lista reencontra o item que estava aberto.
  useEffect(() => {
    if (picked) topRef.current?.scrollIntoView({ block: 'start' });
    else if (lastPicked.current) {
      topRef.current?.parentElement?.querySelector(`[data-id="${CSS.escape(lastPicked.current)}"]`)?.scrollIntoView({ block: 'center' });
    }
  }, [picked]);

  const open = (lib: LibraryItem) => {
    lastPicked.current = lib.id;
    setQty(String(defaultQty(lib)));
    setPicked(lib);
  };

  const add = async (lib: LibraryItem, n: number) => {
    if (busy) return;
    setBusy(true);
    const { id: _id, createdAt: _c, updatedAt: _u, ...item } = lib;
    const r = await act({ type: 'item/add', characterId: ch.id, item, qty: n, libraryId: lib.id });
    setBusy(false);
    if (!r.ok) return;
    setAdded((a) => ({ ...a, [lib.id]: { qty: (a[lib.id]?.qty ?? 0) + n, requested: !!r.requested } }));
    setPicked(null);
  };

  const addedCount = Object.keys(added).length;
  const n = parseQty(qty);

  return (
    <Modal open width={600} title={`Adicionar item — ${ch.name}`} onClose={onClose} bodyClassName="lib-pick-body"
      footer={picked ? (
        <>
          <button className="btn" onClick={() => setPicked(null)}><ArrowLeft size={14} /> Lista</button>
          <span className="spacer" />
          <ActButton perm="item_add" className="btn btn-primary" disabled={busy} onClick={() => void add(picked, n)}>
            Adicionar ×{n}
          </ActButton>
        </>
      ) : (
        <>
          <button className="btn btn-ghost" onClick={onCreate}><Plus size={14} /> Criar novo</button>
          <span className="spacer" />
          <button className={`btn${addedCount ? ' btn-primary' : ''}`} onClick={onClose}>{addedCount ? 'Concluir' : 'Fechar'}</button>
        </>
      )}>
      <div ref={topRef} />
      {picked ? (
        <form className="lib-pick-detail" onSubmit={(e) => { e.preventDefault(); void add(picked, n); }}>
          <ItemCard it={picked} />
          <QtyPicker item={picked} value={qty} onChange={setQty} have={stackOf(picked)?.qty} />
          <button type="submit" hidden />
        </form>
      ) : library.length === 0 ? (
        <div className="lib-pick-detail">
          <div className="empty">A biblioteca de itens está vazia.</div>
          <button className="btn btn-primary" onClick={onCreate}><Plus size={14} /> Criar novo item</button>
        </div>
      ) : (
        <>
          <div className="lib-pick-head">
            <SearchInput value={q} onChange={setQ} placeholder="Buscar por nome, tipo ou dano" autoFocus={finePointer} />
            {typeCounts.length > 1 && (
              <div className="chips" role="group" aria-label="Tipo">
                <Chip on={!type} onClick={() => setType(null)} count={library.length}>Todos</Chip>
                {typeCounts.map(({ type: t, count }) => {
                  const Icon = TYPE_ICON[t];
                  return (
                    <Chip key={t} on={type === t} count={count} onClick={() => setType(type === t ? null : t)}>
                      <Icon size={13} />{ITEM_TYPES[t]}
                    </Chip>
                  );
                })}
              </div>
            )}
          </div>
          <div className="lib-pick-list">
            {items.length === 0 && (
              <div className="empty">
                Nenhum item encontrado.
                <div className="mt"><button className="btn btn-sm" onClick={() => { setQ(''); setType(null); }}>Limpar busca</button></div>
              </div>
            )}
            {items.map((it) => {
              const def = defaultQty(it);
              const a = added[it.id];
              const have = copies(it);
              return (
                <div key={it.id} data-id={it.id} className={`lib-pick-row${a ? ' added' : ''}`}>
                  <button type="button" className="lib-pick-main" onClick={() => open(it)} aria-label={`${it.name}: escolher quantidade`}>
                    <ItemIcon type={it.type} size={16} />
                    <div className="grow">
                      <div className="lib-pick-name">{it.name}</div>
                      <div className="lib-pick-sub">
                        {ITEM_TYPES[it.type] ?? 'Outro'}{it.pack > 1 ? ` · pacote de ${it.pack}` : ''}{it.damage ? ` · ${it.damage}` : ''}
                      </div>
                      {a ? (
                        <div className={`lib-pick-status${a.requested ? ' req' : ''}`}>{a.requested ? `Pedido enviado ao mestre · ×${a.qty}` : `Adicionado · ×${a.qty}`}</div>
                      ) : have > 0 ? (
                        <div className="lib-pick-status have">Já tem {have}</div>
                      ) : null}
                    </div>
                    {it.value > 0 && <span className="item-value tiny"><Coins size={12} />{it.value.toLocaleString('pt-BR')}</span>}
                    <ChevronRight size={16} className="muted" />
                  </button>
                  <ActButton perm="item_add" className="lib-pick-quick" disabled={busy}
                    title={it.pack > 1 ? `Adicionar 1 pacote (${def})` : 'Adicionar 1'}
                    aria-label={`Adicionar ${def} de ${it.name}`} onClick={() => void add(it, def)}>
                    <Plus size={14} />{def}
                  </ActButton>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Ouro e durabilidade ──────────────────────────────────────

function GoldModal({ ch, onClose }: { ch: Character; onClose: () => void }) {
  const { act } = useAct();
  return (
    <ResourceAdjustModal title={`Ouro — ${ch.name}`} perm="gold_change" onClose={onClose}
      tracks={[{
        key: 'gold', label: 'Ouro', icon: <Coins size={16} color="var(--gold)" />, color: 'var(--gold)', barClass: 'bar-dur',
        current: ch.gold ?? 0, min: 0, ops: goldOps(), steps: GOLD_STEPS,
        status: (v) => (v <= 0 ? 'Fica sem dinheiro.' : undefined),
      }]}
      onApply={async (_k, v, reason) => (await act({ type: 'gold/set', characterId: ch.id, gold: v, reason })).ok} />
  );
}

function DurabilityModal({ ch, it, onClose }: { ch: Character; it: InventoryItem; onClose: () => void }) {
  const { act } = useAct();
  const { rd, def, pv: max } = it.durability;
  return (
    <ResourceAdjustModal title={`Durabilidade — ${it.name}`} perm="item_durability" onClose={onClose}
      tracks={[{
        key: 'pv', label: 'PV', icon: <Wrench size={16} color="var(--gold)" />, color: 'var(--gold)', barClass: 'bar-dur',
        current: it.pv, max, min: 0,
        ops: [
          { key: 'hit', label: 'Dano', tone: 'down', compute: (c, n) => c - Math.max(0, n - rd), reason: (n) => `Dano ${n}${rd ? ` − RD ${rd}` : ''}`,
            hint: rd ? `A RD do objeto (${rd}) é descontada. DEF do objeto: ${def}.` : `Objeto sem RD. DEF do objeto: ${def}.` },
          { key: 'direct', label: 'Dano direto', tone: 'down', compute: (c, n) => c - n, reason: (n) => `Dano direto ${n}`, hint: 'Ignora a RD do objeto.' },
          { key: 'repair', label: 'Reparar', tone: 'up', compute: (c, n) => c + n, reason: (n) => `Reparo ${n}` },
        ],
        status: (v) => (v <= 0 ? `O item quebra${it.equipped ? ' e deixa de dar seus bônus' : ''}.` : it.pv <= 0 ? 'O item deixa de estar quebrado.' : undefined),
      }]}
      onRestoreAll={{ label: 'Restaurar', run: async () => (await act({ type: 'item/durability', characterId: ch.id, itemId: it.id, pv: max, reason: 'Restaurado' })).ok }}
      onApply={async (_k, pv, reason) => (await act({ type: 'item/durability', characterId: ch.id, itemId: it.id, pv, reason })).ok} />
  );
}
