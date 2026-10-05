import { useEffect, useState } from 'react';
import { loadIdentity, saveIdentityName, getRoom, setRoom, type Identity } from './net/identity';
import { codeFromPath } from './net/config';
import { startHost, stopHost } from './net/host';
import { startGuest, stopGuest } from './net/guest';
import { loadTable } from './store/persistence';
import type { TableState } from './model/types';
import UsernamePage from './pages/UsernamePage';
import LobbyPage from './pages/LobbyPage';
import GmPage from './pages/GmPage';
import PlayerPage from './pages/PlayerPage';
import { Toasts, toast } from './components/common/toast';

type Route =
  | { page: 'name'; editing?: boolean }
  | { page: 'lobby' }
  | { page: 'gm' }
  | { page: 'player'; code: string };

function goHome() {
  if (window.location.pathname !== '/') window.history.replaceState(null, '', '/');
}

export default function App() {
  const [identity, setIdentity] = useState<Identity | null>(() => loadIdentity());
  const [route, setRoute] = useState<Route>(() => (loadIdentity() ? { page: 'lobby' } : { page: 'name' }));
  const [pendingCode] = useState(() => codeFromPath());

  const host = (t: TableState) => {
    if (!identity) return;
    startHost({ ...t, gmName: identity.name });
    setRoom({ role: 'host', tableId: t.id });
    goHome();
    setRoute({ page: 'gm' });
  };

  const join = (code: string) => {
    if (!identity) return;
    startGuest(code, identity);
    setRoom({ role: 'player', code });
    window.history.replaceState(null, '', `/sala/${code}`);
    setRoute({ page: 'player', code });
  };

  const leave = () => {
    stopHost();
    stopGuest();
    setRoom(null);
    goHome();
    setRoute({ page: 'lobby' });
  };

  // Ao abrir: link de convite tem prioridade; senão retoma a sala desta aba (F5).
  useEffect(() => {
    if (!identity) return;
    if (pendingCode) { join(pendingCode); return; }
    const r = getRoom();
    if (r?.role === 'player') join(r.code);
    else if (r?.role === 'host') {
      loadTable(r.tableId).then((t) => { if (t) host(t); else setRoom(null); }).catch(() => toast('Não foi possível abrir a mesa salva.', 'error'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity?.clientId]);

  const setName = (name: string) => {
    const id = saveIdentityName(name);
    setIdentity(id);
    setRoute({ page: 'lobby' });
  };

  return (
    <>
      {route.page === 'name' && <UsernamePage initial={route.editing ? identity?.name : undefined} onDone={setName} />}
      {route.page === 'lobby' && identity && (
        <LobbyPage userName={identity.name} onEditName={() => setRoute({ page: 'name', editing: true })} onHost={host} onJoin={join} />
      )}
      {route.page === 'gm' && <GmPage onLeave={leave} />}
      {route.page === 'player' && <PlayerPage onLeave={leave} />}
      <Toasts />
    </>
  );
}
