import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { BookOpen, ClipboardList, Dices, Inbox, LogOut, Plus, Swords, Users } from 'lucide-react';
import { guestStore, sendAction } from '../net/guest';
import { ActProvider, type ActApi, useAct } from '../components/act';
import type { Character, CharacterDraft, PlayerView } from '../model/types';
import { PERMISSION_LABELS } from '../model/permissions';
import { TopBar, Tabs, ConnStatus } from '../components/room/TopBar';
import CharacterSheet, { DeleteCharacterButton } from '../components/sheet/CharacterSheet';
import CharacterWizard from '../components/sheet/CharacterWizard';
import LogPanel from '../components/LogPanel';
import Reference from '../components/Reference';
import { RequestStatus } from '../components/gm/RequestsPanel';
import { deriveStats } from '../rules/derive';
import { PlayerNotifications, useRollToasts } from '../components/Notifications';
import CombatView, { myTurnIn, useCombatAlerts } from '../components/combat/CombatView';

type Tab = 'ficha' | 'combate' | 'mesa' | 'pedidos' | 'registro' | 'regras';

export default function PlayerPage({ onLeave }: { onLeave: () => void }) {
  const snap = useSyncExternalStore(guestStore.subscribe, guestStore.get);
  const view = snap.view;
  const [tab, setTab] = useState<Tab>('ficha');
  const inCombat = !!view?.combat;

  // As próprias rolagens aparecem como aviso, exceto com o registro aberto.
  // As do mestre por uma entidade rodam a animação (das ocultas, só um 20 ou 1 natural).
  useRollToasts(view?.log ?? [], (e) => tab !== 'registro' && e.playerId === view?.me.id, (e) => !!e.secret || (!e.playerId && !!e.characterName));
  useCombatAlerts(view, tab === 'combate', () => { window.scrollTo({ top: 0 }); setTab('combate'); });

  // Combate encerrado com a aba aberta: volta para a ficha.
  useEffect(() => { if (!inCombat && tab === 'combate') setTab('ficha'); }, [inCombat, tab]);

  const api: ActApi = useMemo(() => ({ role: 'player', permissions: view?.permissions ?? null, library: view?.library ?? [], send: sendAction }), [view?.permissions, view?.library]);

  if (!view) {
    return (
      <div className="page page-narrow">
        <div className="hero"><h1>EVA 3</h1><p>Sala {snap.code}</p></div>
        <div className="card center-box col gap-lg center">
          <ConnStatus status={snap.status} message={snap.message} />
          <p className="secondary">{snap.message}</p>
          <button className="btn" onClick={onLeave}>Voltar ao início</button>
        </div>
      </div>
    );
  }

  const pending = view.myRequests.filter((r) => r.status === 'pending').length;
  const myTurn = myTurnIn(view);

  return (
    <ActProvider value={api}>
      <div className="shell">
        <TopBar title={view.table.name}>
          <span className="tiny muted hide-sm">Mestre: {view.table.gmName}</span>
          <ConnStatus status={snap.status} message={snap.message} />
          <button className="btn btn-sm btn-ghost desktop-only" onClick={onLeave} title="Sair da mesa"><LogOut size={14} /></button>
        </TopBar>
        {snap.status !== 'online' && (
          <div className="center small" style={{ background: 'rgba(217,160,63,0.12)', color: 'var(--warning)', padding: 6 }}>{snap.message}</div>
        )}
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          mobileBar
          tabs={[
            { id: 'ficha', label: 'Minha ficha', short: 'Ficha', icon: <ClipboardList size={14} /> },
            ...(inCombat ? [{ id: 'combate' as const, label: myTurn ? 'Combate · sua vez' : 'Combate', short: myTurn ? 'Sua vez' : 'Combate', icon: <Swords size={14} /> }] : []),
            { id: 'registro', label: 'Dados e registro', short: 'Dados', icon: <Dices size={14} /> },
            { id: 'pedidos', label: 'Pedidos', icon: <Inbox size={14} />, count: pending },
            { id: 'mesa', label: 'Mesa', icon: <Users size={14} /> },
            { id: 'regras', label: 'Regras', icon: <BookOpen size={14} /> },
          ]}
          more={() => (
            <div className="col">
              <div className="menu-title">Sessão</div>
              <div className="menu-session">
                <div className="grow">
                  <strong>{view.table.name}</strong>
                  <div className="tiny muted">Mestre: {view.table.gmName}</div>
                </div>
                <span className="conn"><span className={`dot${snap.status === 'online' ? ' dot-on' : ''}`} /> {snap.status === 'online' ? 'Online' : snap.message}</span>
              </div>
              <button className="menu-item menu-danger" onClick={onLeave}>
                <span className="menu-icon"><LogOut size={14} /></span>
                <span className="grow">Sair da mesa</span>
              </button>
            </div>
          )}
        />
        <PlayerNotifications requests={view.myRequests} characters={view.myCharacters} />
        {myTurn && tab !== 'combate' && (
          <button className="turn-banner" onClick={() => { window.scrollTo({ top: 0 }); setTab('combate'); }}>
            <Swords size={15} /> <span>Sua vez, <strong>{myTurn.name}</strong>!</span> <span className="turn-banner-cta">Abrir combate</span>
          </button>
        )}
        <main className="page">
          {tab === 'ficha' && <MySheets view={view} />}
          {tab === 'combate' && view.combat && <CombatView view={view} />}
          {tab === 'mesa' && <TableInfo view={view} />}
          {tab === 'pedidos' && <MyRequests view={view} />}
          {tab === 'registro' && <LogPanel log={view.log} characters={view.myCharacters} />}
          {tab === 'regras' && <Reference />}
        </main>
      </div>
    </ActProvider>
  );
}

function toDraft(c: Character): CharacterDraft {
  return { name: c.name, concept: c.concept, notes: c.notes, attributes: c.attributes, classId: c.levels[0].classId, abilityId: c.levels[0].abilityId };
}

function MySheets({ view }: { view: PlayerView }) {
  const { act } = useAct();
  const chars = view.myCharacters;
  const [selected, setSelected] = useState<string | null>(chars[0]?.id ?? null);
  const [creating, setCreating] = useState(chars.length === 0);
  const [redoing, setRedoing] = useState<string | null>(null);
  const current = chars.find((c) => c.id === selected) ?? chars[0];

  useEffect(() => {
    if (!creating && chars.length === 0) setCreating(true);
  }, [chars.length, creating]);

  if (creating) {
    return (
      <div className="page-narrow" style={{ margin: '0 auto' }}>
        <h2 className="mb">Novo personagem</h2>
        <CharacterWizard
          onCancel={chars.length ? () => setCreating(false) : undefined}
          onSubmit={async (draft) => {
            const before = new Set(chars.map((c) => c.id));
            const r = await act({ type: 'character/create', draft }, 'Ficha enviada! Aguarde a aprovação do mestre.');
            if (r.ok) {
              setCreating(false);
              // O mestre manda a visão nova antes do ack: a ficha já está aqui.
              const fresh = guestStore.get().view?.myCharacters.find((c) => !before.has(c.id));
              if (fresh) setSelected(fresh.id);
            }
            return r.ok;
          }}
        />
      </div>
    );
  }

  if (!current) return null;

  if (redoing === current.id) {
    return (
      <div className="page-narrow" style={{ margin: '0 auto' }}>
        <h2 className="mb">Refazer {current.name}</h2>
        <CharacterWizard
          initial={toDraft(current)}
          submitLabel="Reenviar para o mestre"
          onCancel={() => setRedoing(null)}
          onSubmit={async (draft) => {
            const r = await act({ type: 'character/resubmit', characterId: current.id, draft }, 'Ficha reenviada.');
            if (r.ok) setRedoing(null);
            return r.ok;
          }}
        />
      </div>
    );
  }

  return (
    <div className="col gap-lg">
      <div className="row-wrap">
        {chars.map((c) => (
          <button key={c.id} className={`btn btn-sm${c.id === current.id ? ' btn-primary' : ''}`} onClick={() => setSelected(c.id)}>
            {c.name}{c.status !== 'approved' && ' •'}
          </button>
        ))}
        <button className="btn btn-sm btn-ghost" onClick={() => setCreating(true)}><Plus size={14} /> Nova ficha</button>
      </div>
      {current.status !== 'approved' && (
        <div className="card row-wrap" style={{ borderColor: current.status === 'rejected' ? 'var(--accent)' : 'rgba(217,160,63,0.4)' }}>
          <div className="grow">
            {current.status === 'pending'
              ? <span>Ficha enviada. Aguardando o mestre aprovar.</span>
              : <span>O mestre devolveu a ficha para ajustes.{current.rejectReason && <> Motivo: <strong>{current.rejectReason}</strong></>}</span>}
          </div>
          <button className="btn btn-sm" onClick={() => setRedoing(current.id)}>Refazer ficha</button>
          <DeleteCharacterButton ch={current}>Excluir</DeleteCharacterButton>
        </div>
      )}
      <CharacterSheet ch={current} />
    </div>
  );
}

function TableInfo({ view }: { view: PlayerView }) {
  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-title">Jogadores</div>
        <div className="col">
          <div className="row"><span className="dot dot-on" /> <strong>{view.table.gmName}</strong> <span className="badge badge-gold">Mestre</span></div>
          {view.players.map((p) => (
            <div key={p.id} className="row"><span className={`dot${p.online ? ' dot-on' : ''}`} /> {p.name}{p.id === view.me.id && <span className="tiny muted">(você)</span>}</div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-title">Personagens</div>
        {view.others.length === 0 && view.myCharacters.length === 0 && <div className="empty">Nenhum personagem aprovado.</div>}
        <div className="col">
          {view.myCharacters.filter((c) => c.status === 'approved').map((c) => {
            const d = deriveStats(c);
            return <div key={c.id} className="row"><strong>{c.name}</strong> <span className="gold small">{d.title} · Nv {d.level}</span><span className="tiny muted">você</span></div>;
          })}
          {view.others.map((c) => (
            <div key={c.id}>
              <div className="row"><strong>{c.name}</strong> <span className="gold small">{c.title} · Nv {c.level}</span><span className="tiny muted">{c.ownerName}</span></div>
              {c.concept && <div className="tiny muted">{c.concept}</div>}
            </div>
          ))}
        </div>
      </div>
      {view.threats.length > 0 && (
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title">Ameaças à vista</div>
          <div className="col">
            {view.threats.map((t) => (
              <div key={t.id}><strong>{t.name}</strong>{t.concept && <span className="small muted"> — {t.concept}</span>}</div>
            ))}
          </div>
        </div>
      )}
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <div className="card-title">O que o mestre liberou</div>
        <div className="row-wrap">
          {Object.entries(view.permissions).map(([k, v]) => (
            <span key={k} className={`badge ${v === 'free' ? 'badge-ok' : v === 'request' ? 'badge-warn' : 'badge-err'}`}>
              {PERMISSION_LABELS[k as keyof typeof PERMISSION_LABELS].label}: {v === 'free' ? 'livre' : v === 'request' ? 'pedir' : 'bloqueado'}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function MyRequests({ view }: { view: PlayerView }) {
  const list = [...view.myRequests].reverse();
  return (
    <div className="card">
      <div className="card-title">Meus pedidos</div>
      {list.length === 0 && <div className="empty">Ações marcadas com um ponto âmbar viram pedidos para o mestre.</div>}
      <div className="col">
        {list.map((r) => (
          <div key={r.id} className="row-wrap small">
            <RequestStatus r={r} />
            <span className="grow">{r.summary}{r.error ? ` — ${r.error}` : ''}</span>
            <span className="tiny muted">{new Date(r.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
