import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  ArrowLeft, BookOpen, ClipboardList, Dices, Download, Inbox, LogOut, Moon, Package, Search, Shield, Swords, UserPlus, UserX, VenetianMask,
} from 'lucide-react';
import { hostStore, gmDispatch, flush } from '../net/host';
import { useAct } from '../components/act';
import NpcsPanel from '../components/gm/NpcsPanel';
import CharRow from '../components/gm/CharRow';
import CombatPanel from '../components/combat/CombatPanel';
import { ActProvider, type ActApi } from '../components/act';
import type { Character, PlayerRecord, TableState } from '../model/types';
import { downloadTable } from '../store/persistence';
import { TopBar, Tabs, ConnStatus } from '../components/room/TopBar';
import Modal from '../components/common/Modal';
import ConfirmButton from '../components/common/ConfirmButton';
import RoomInvite from '../components/room/RoomInvite';
import CharacterSheet from '../components/sheet/CharacterSheet';
import RequestsPanel from '../components/gm/RequestsPanel';
import RestModal from '../components/gm/RestModal';
import CasesPanel from '../components/investigation/CasesPanel';
import ItemLibrary from '../components/gm/ItemLibrary';
import PermissionsPanel from '../components/gm/PermissionsPanel';
import LogPanel from '../components/LogPanel';
import Reference from '../components/Reference';
import { GmInbox, GmNotifications, useRollToasts } from '../components/Notifications';

type Tab = 'fichas' | 'combate' | 'npcs' | 'investigacao' | 'pedidos' | 'itens' | 'permissoes' | 'registro' | 'regras';

const send: ActApi['send'] = async (a) => {
  const r = gmDispatch(a);
  return r.ok ? { ok: true, id: r.id } : { ok: false, error: r.error };
};

export default function GmPage({ onLeave }: { onLeave: () => void }) {
  const snap = useSyncExternalStore(hostStore.subscribe, hostStore.get);
  const table = snap.table;
  const [tab, setTab] = useState<Tab>('fichas');
  const [invite, setInvite] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  // No celular, a aba Fichas mostra a lista ou a ficha aberta, uma de cada vez.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [npcOpen, setNpcOpen] = useState(false);
  const openSheet = (id: string) => { setSelected(id); setSheetOpen(true); setTab('fichas'); };

  // Rolagens de todos (inclusive as ocultas) como aviso, exceto quando o registro já está aberto.
  useRollToasts(table?.log ?? null,() => tab !== 'registro');

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
          onReselect={(t) => { if (t === 'fichas') setSheetOpen(false); if (t === 'npcs') setNpcOpen(false); }}
          mobileBar
          tabs={[
            { id: 'fichas', label: 'Fichas', icon: <ClipboardList size={14} />, count: pendingSheets },
            { id: 'combate', label: table.combat?.round ? `Combate · rodada ${table.combat.round}` : 'Combate', short: 'Combate', icon: <Swords size={14} /> },
            { id: 'pedidos', label: 'Pedidos', icon: <Inbox size={14} />, count: pending },
            { id: 'registro', label: 'Dados e registro', short: 'Dados', icon: <Dices size={14} /> },
            { id: 'npcs', label: 'NPCs', icon: <VenetianMask size={14} /> },
            { id: 'investigacao', label: 'Investigação', icon: <Search size={14} /> },
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
          {tab === 'npcs' && <NpcsPanel table={table} detailOpen={npcOpen} setDetailOpen={setNpcOpen} />}
          {tab === 'investigacao' && <CasesPanel table={table} />}
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
  const [resting, setResting] = useState(false);
  const players = useMemo(() => Object.values(table.players).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [table.players]);
  const all = Object.values(table.characters);
  const pcs = all.filter((c) => c.kind === 'pc');
  const byOwner = (id: string) => pcs.filter((c) => c.ownerId === id).sort((a, b) => a.createdAt - b.createdAt);
  // NPCs ficam na aba deles.
  const current = selected && table.characters[selected]?.kind === 'pc' ? table.characters[selected] : undefined;

  useEffect(() => {
    if (!current) {
      const first = pcs.find((c) => c.status === 'pending') ?? pcs[0];
      if (first && first.id !== selected) setSelected(first.id);
    }
  }, [current, pcs, selected]);

  const open = (id: string) => { setSelected(id); setSheetOpen(true); window.scrollTo({ top: 0 }); };
  const back = () => { setSheetOpen(false); window.scrollTo({ top: 0 }); };

  return (
    <div className={`split split-master${sheetOpen ? ' split-detail-open' : ''}`}>
      <div className="col split-list">
        {all.some((c) => c.status === 'approved') && (
          <div className="row">
            <span className="spacer" />
            <button className="btn btn-sm" onClick={() => setResting(true)} title="Restaurar PV, PE e Clareza"><Moon size={14} /> Descanso</button>
          </div>
        )}
        {resting && <RestModal table={table} onClose={() => setResting(false)} />}
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
                <RemovePlayerButton player={p} chars={chars} />
              </div>
              <div className="col" style={{ gap: 6 }}>
                {chars.map((c) => <CharRow key={c.id} c={c} active={c.id === selected} onClick={() => open(c.id)} />)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="split-detail">
        <button className="btn btn-sm btn-ghost split-back" onClick={back}><ArrowLeft size={14} /> Todas as fichas</button>
        {current
          ? <CharacterSheet ch={current} ownerName={table.players[current.ownerId]?.name} />
          : <div className="empty">{players.length ? 'Nenhuma ficha enviada ainda.' : 'Selecione uma ficha.'}</div>}
      </div>
    </div>
  );
}

function RemovePlayerButton({ player, chars }: { player: PlayerRecord; chars: Character[] }) {
  const { act } = useAct();
  return (
    <ConfirmButton className="btn btn-sm btn-ghost btn-icon" title={`Excluir ${player.name} da mesa`} modalTitle="Excluir jogador"
      confirmLabel={`Excluir ${player.name}`}
      message={(
        <>
          <p>Excluir <strong>{player.name}</strong> da mesa?</p>
          {chars.length > 0 && (
            <p className="mt">{chars.length > 1 ? 'As fichas' : 'A ficha'} de <strong>{chars.map((c) => c.name).join(', ')}</strong> {chars.length > 1 ? 'serão apagadas' : 'será apagada'}, junto com os pedidos e as permissões do jogador.</p>
          )}
          <p className="small muted mt">Se estiver conectado, o jogador sai da sala na hora; se não, fica sabendo quando voltar. Para jogar de novo, precisa entrar com o código da sala, como um jogador novo. Não dá para desfazer.</p>
        </>
      )}
      onConfirm={() => act({ type: 'player/remove', playerId: player.id }, 'Jogador excluído da mesa.')}>
      <UserX size={14} />
    </ConfirmButton>
  );
}
