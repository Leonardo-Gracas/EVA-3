import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, BookOpen, ClipboardList, Dices, Download, Eye, Inbox, LogOut, Package, Plus, Shield, Skull, Swords, UserPlus, VenetianMask } from 'lucide-react';
import { hostStore, gmDispatch, flush } from '../net/host';
import { useAct } from '../components/act';
import CharacterWizard from '../components/sheet/CharacterWizard';
import ThreatsPanel from '../components/gm/ThreatsPanel';
import CombatPanel from '../components/combat/CombatPanel';
import { ActProvider, type ActApi } from '../components/act';
import type { Character, TableState } from '../model/types';
import { downloadTable } from '../store/persistence';
import { deriveStats } from '../rules/derive';
import { TopBar, Tabs, ConnStatus } from '../components/room/TopBar';
import Modal from '../components/common/Modal';
import RoomInvite from '../components/room/RoomInvite';
import CharacterSheet, { StatusBadge } from '../components/sheet/CharacterSheet';
import RequestsPanel from '../components/gm/RequestsPanel';
import ItemLibrary from '../components/gm/ItemLibrary';
import PermissionsPanel from '../components/gm/PermissionsPanel';
import LogPanel from '../components/LogPanel';
import Reference from '../components/Reference';
import { GmInbox, GmNotifications, useRollToasts } from '../components/Notifications';

type Tab = 'fichas' | 'combate' | 'ameacas' | 'pedidos' | 'itens' | 'permissoes' | 'registro' | 'regras';

const send: ActApi['send'] = async (a) => {
  const r = gmDispatch(a);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
};

export default function GmPage({ onLeave }: { onLeave: () => void }) {
  const snap = useSyncExternalStore(hostStore.subscribe, hostStore.get);
  const table = snap.table;
  const [tab, setTab] = useState<Tab>('fichas');
  const [invite, setInvite] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  // No celular, a aba Fichas mostra a lista ou a ficha aberta, uma de cada vez.
  const [sheetOpen, setSheetOpen] = useState(false);
  const openSheet = (id: string) => { setSelected(id); setSheetOpen(true); setTab('fichas'); };

  // Rolagens de todos (inclusive as ocultas) como aviso, exceto quando o registro já está aberto.
  useRollToasts(table?.log ?? [], () => tab !== 'registro');

  useEffect(() => {
    if (table && Object.keys(table.players).length === 0) setInvite(true);
    // só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table?.id]);

  const library = table?.itemLibrary;
  const api: ActApi = useMemo(() => ({ role: 'gm', permissions: null, library: Object.values(library ?? {}), send }), [library]);

  if (!table) return null;
  const pending = table.requests.filter((r) => r.status === 'pending').length;
  const pendingSheets = Object.values(table.characters).filter((c) => c.status === 'pending').length;

  const saveError = snap.saveError
    ? <span className="small" style={{ color: 'var(--error)' }} title={snap.saveError}>Erro ao salvar</span>
    : null;
  const savedAt = snap.lastSavedAt ? new Date(snap.lastSavedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;
  const leave = async () => { await flush(); onLeave(); };

  return (
    <ActProvider value={api}>
      <div className="shell">
        <TopBar title={table.name}>
          {saveError}
          <ConnStatus status={snap.status} message={snap.message} />
          <GmInbox table={table} onOpenSheet={openSheet} onOpenRequests={() => setTab('pedidos')} />
          <button className="code-pill desktop-only" onClick={() => setInvite(true)} title="Convidar jogadores">{table.roomCode}</button>
          {!saveError && savedAt && <span className="tiny muted desktop-only">Salvo {savedAt}</span>}
          <button className="btn btn-sm btn-ghost desktop-only" onClick={() => downloadTable(table)} title="Exportar backup (.json)"><Download size={14} />Backup</button>
          <button className="btn btn-sm btn-ghost desktop-only" onClick={leave} title="Fechar sala"><LogOut size={14} /></button>
        </TopBar>
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          onReselect={(t) => { if (t === 'fichas') setSheetOpen(false); }}
          mobileBar
          tabs={[
            { id: 'fichas', label: 'Fichas', icon: <ClipboardList size={14} />, count: pendingSheets },
            { id: 'combate', label: table.combat?.round ? `Combate · rodada ${table.combat.round}` : 'Combate', short: 'Combate', icon: <Swords size={14} /> },
            { id: 'pedidos', label: 'Pedidos', icon: <Inbox size={14} />, count: pending },
            { id: 'registro', label: 'Dados e registro', short: 'Dados', icon: <Dices size={14} /> },
            { id: 'ameacas', label: 'Ameaças', icon: <Skull size={14} /> },
            { id: 'itens', label: 'Itens', icon: <Package size={14} /> },
            { id: 'permissoes', label: 'Permissões', icon: <Shield size={14} /> },
            { id: 'regras', label: 'Regras', icon: <BookOpen size={14} /> },
          ]}
          more={(close) => (
            <div className="col">
              <div className="menu-title">Sessão</div>
              <div className="menu-session">
                <div className="grow">
                  <strong>{table.name}</strong>
                  <div className="tiny muted">{saveError ? 'Erro ao salvar' : savedAt ? `Salvo às ${savedAt}` : 'Ainda não salvo'}</div>
                </div>
                <span className="conn"><span className={`dot${snap.status === 'online' ? ' dot-on' : ''}`} /> {snap.status === 'online' ? 'Online' : snap.message}</span>
              </div>
              <button className="menu-item" onClick={() => { close(); setInvite(true); }}>
                <span className="menu-icon"><UserPlus size={14} /></span>
                <span className="grow">Convidar jogadores</span>
                <span className="code-pill">{table.roomCode}</span>
              </button>
              <button className="menu-item" onClick={() => downloadTable(table)}>
                <span className="menu-icon"><Download size={14} /></span>
                <span className="grow">Exportar backup (.json)</span>
              </button>
              <button className="menu-item menu-danger" onClick={leave}>
                <span className="menu-icon"><LogOut size={14} /></span>
                <span className="grow">Fechar sala</span>
              </button>
            </div>
          )}
        />
        <GmNotifications table={table} onOpenSheet={openSheet} />
        <main className="page">
          {tab === 'fichas' && <Characters table={table} online={snap.online} onInvite={() => setInvite(true)} selected={selected} setSelected={setSelected} sheetOpen={sheetOpen} setSheetOpen={setSheetOpen} />}
          {tab === 'combate' && <CombatPanel table={table} />}
          {tab === 'ameacas' && <ThreatsPanel table={table} />}
          {tab === 'pedidos' && <RequestsPanel table={table} />}
          {tab === 'itens' && <ItemLibrary table={table} />}
          {tab === 'permissoes' && <PermissionsPanel table={table} />}
          {tab === 'registro' && <LogPanel log={table.log} characters={Object.values(table.characters)} threats={Object.values(table.threats)} />}
          {tab === 'regras' && <Reference />}
        </main>
        <Modal open={invite} onClose={() => setInvite(false)} title="Convidar jogadores" width={600}>
          <RoomInvite code={table.roomCode} />
        </Modal>
      </div>
    </ActProvider>
  );
}

function Characters({ table, online, onInvite, selected, setSelected, sheetOpen, setSheetOpen }: {
  table: TableState; online: string[]; onInvite: () => void; selected: string | null; setSelected: (id: string) => void;
  sheetOpen: boolean; setSheetOpen: (open: boolean) => void;
}) {
  const { act } = useAct();
  const [creatingNpc, setCreatingNpc] = useState(false);
  const players = useMemo(() => Object.values(table.players).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [table.players]);
  const all = Object.values(table.characters);
  const byOwner = (id: string) => all.filter((c) => c.ownerId === id).sort((a, b) => a.createdAt - b.createdAt);
  const npcs = all.filter((c) => c.kind === 'npc').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const current = selected ? table.characters[selected] : undefined;

  // Ficha aberta por fora (sino, aviso): sai do cadastro de NPC.
  useEffect(() => { setCreatingNpc(false); }, [selected]);
  // Voltar à lista (tocar de novo em Fichas) também desiste do cadastro de NPC.
  useEffect(() => { if (!sheetOpen) setCreatingNpc(false); }, [sheetOpen]);

  useEffect(() => {
    if (!current && !creatingNpc) {
      const first = all.find((c) => c.status === 'pending') ?? all.find((c) => c.kind === 'pc') ?? all[0];
      if (first && first.id !== selected) setSelected(first.id);
    }
  }, [current, all, selected, creatingNpc]);

  const open = (id: string) => { setCreatingNpc(false); setSelected(id); setSheetOpen(true); window.scrollTo({ top: 0 }); };
  const back = () => { setCreatingNpc(false); setSheetOpen(false); window.scrollTo({ top: 0 }); };

  return (
    <div className={`split split-master${sheetOpen || creatingNpc ? ' split-detail-open' : ''}`}>
      <div className="col split-list">
        {players.length === 0 && (
          <div className="empty col" style={{ alignItems: 'center' }}>
            <p>Nenhum jogador entrou ainda.</p>
            <button className="btn btn-primary btn-sm" onClick={onInvite}><UserPlus size={14} /> Convidar jogadores</button>
          </div>
        )}
        {players.map((p) => {
          const chars = byOwner(p.id);
          return (
            <div key={p.id} className="card" style={{ padding: 12 }}>
              <div className="row mb" style={{ marginBottom: chars.length ? 8 : 0 }}>
                <span className={`dot${online.includes(p.id) ? ' dot-on' : ''}`} />
                <strong>{p.name}</strong>
                <span className="spacer" />
                {!chars.length && <span className="tiny muted">sem ficha</span>}
              </div>
              <div className="col" style={{ gap: 6 }}>
                {chars.map((c) => <CharRow key={c.id} c={c} active={!creatingNpc && c.id === selected} onClick={() => open(c.id)} />)}
              </div>
            </div>
          );
        })}
        <div className="card" style={{ padding: 12 }}>
          <div className="row" style={{ marginBottom: npcs.length ? 8 : 0 }}>
            <VenetianMask size={15} className="gold" />
            <strong>NPCs</strong>
            <span className="spacer" />
            <button className="btn btn-sm" onClick={() => { setCreatingNpc(true); setSheetOpen(true); window.scrollTo({ top: 0 }); }}><Plus size={13} /> NPC</button>
          </div>
          <div className="col" style={{ gap: 6 }}>
            {npcs.map((c) => <CharRow key={c.id} c={c} active={!creatingNpc && c.id === selected} onClick={() => open(c.id)} />)}
          </div>
        </div>
      </div>
      <div className="split-detail">
        <button className="btn btn-sm btn-ghost split-back" onClick={back}><ArrowLeft size={14} /> Todas as fichas</button>
        {creatingNpc ? (
          <>
            <h2 className="mb">Novo NPC</h2>
            <CharacterWizard
              submitLabel="Criar NPC"
              onCancel={back}
              onSubmit={async (draft) => {
                const before = new Set(Object.keys(table.characters));
                const r = await act({ type: 'npc/create', draft }, 'NPC criado.');
                if (r.ok) {
                  const fresh = Object.values(hostStore.get().table?.characters ?? {}).find((c) => !before.has(c.id));
                  setCreatingNpc(false);
                  if (fresh) setSelected(fresh.id); else setSheetOpen(false);
                }
                return r.ok;
              }}
            />
          </>
        ) : current ? (
          <CharacterSheet ch={current} ownerName={current.kind === 'npc' ? undefined : table.players[current.ownerId]?.name} />
        ) : <div className="empty">Selecione uma ficha.</div>}
      </div>
    </div>
  );
}

function CharRow({ c, active, onClick }: { c: Character; active: boolean; onClick: () => void }) {
  const d = deriveStats(c);
  return (
    <button className={`card card-hover${active ? ' card-selected' : ''}`} style={{ padding: '8px 10px', textAlign: 'left' }} onClick={onClick}>
      <div className="row">
        <strong className="grow">{c.name}</strong>
        {c.kind === 'npc' && c.visible && <Eye size={13} className="muted" />}
        <StatusBadge status={c.status} />
      </div>
      <div className="row tiny muted">
        <span className="gold">{d.title}</span> · Nv {d.level}
        <span className="spacer" />
        <span style={{ color: 'var(--pv)' }}>{c.current.pv}/{d.pvMax}</span>
        <span style={{ color: 'var(--pe)' }}>{c.current.pe}/{d.peMax}</span>
      </div>
    </button>
  );
}
