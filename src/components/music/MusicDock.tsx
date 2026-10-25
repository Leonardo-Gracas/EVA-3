import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronUp, Copy, Headphones, ListMusic, ListVideo, Loader2, LogOut, Music,
  Pause, Play, Plus, RefreshCw, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Trash2, Volume1, Volume2, VolumeX, X, Youtube,
} from 'lucide-react';
import { SubTabs } from '../room/TopBar';
import ConfirmButton from '../common/ConfirmButton';
import { toast } from '../common/toast';
import {
  attachPlayer, cycleRepeat, next, playAt, playerStore, playLink, playTracks, prev, seek, setVolume, toggleMute, togglePlay, toggleShuffle,
} from '../../music/player';
import {
  addTracks, createPlaylist, deletePlaylist, libraryStore, moveTrack, prefsStore, removeTrack, renamePlaylist,
  type LocalPlaylist, type MusicTab, type Repeat as RepeatMode,
} from '../../music/library';
import {
  accountConfigured, accountStore, connectAccount, disconnectAccount, ensureProfile, hasToken, listMyPlaylists, listPlaylistTracks,
  type AccountPlaylist,
} from '../../music/google';
import { fetchVideoInfo, formatTime, parseVideoIds, parseYouTube, thumbUrl, type Track } from '../../music/youtube';

const usePlayer = () => useSyncExternalStore(playerStore.subscribe, playerStore.get);
const usePrefs = () => useSyncExternalStore(prefsStore.subscribe, prefsStore.get);
const useAccount = () => useSyncExternalStore(accountStore.subscribe, accountStore.get);

const faixas = (n: number) => `${n} ${n === 1 ? 'faixa' : 'faixas'}`;
const playLocal = (p: LocalPlaylist, i = 0) => playTracks({ kind: 'local', id: p.id, name: p.name }, p.tracks, i);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Algo deu errado.');

/**
 * Trilha sonora do mestre, presa ao canto inferior direito. Recolhida, mostra só os controles;
 * expandida, mostra o vídeo, a fila e as playlists. O áudio sai só deste navegador.
 */
export default function MusicDock() {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const s = usePlayer();

  useEffect(() => (host.current ? attachPlayer(host.current) : undefined), []);

  // Recolhido, o painel (com o vídeo) continua montado fora da tela: o iframe não pode sair do lugar sem recarregar.
  const hidden = open ? {} : { inert: '' } as Record<string, string>;

  return (
    <div className={`music-dock${open ? ' music-open' : ''}`} onKeyDown={(e) => { if (e.key === 'Escape' && open) setOpen(false); }}>
      <section id="music-panel" className="music-panel" aria-label="Trilha sonora" aria-hidden={!open} {...hidden}>
        <header className="music-head">
          <Music size={16} className="gold" />
          <strong className="grow">Trilha sonora</strong>
          <span className="music-private" title="A música toca só neste navegador. Os jogadores não ouvem."><Headphones size={12} /> Só você ouve</span>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setOpen(false)} aria-label="Recolher a trilha sonora"><ChevronDown size={16} /></button>
        </header>
        <div className="music-body">
          <div className="music-video"><div ref={host} className="music-video-host" /></div>
          {s.loadError && <div className="music-alert">{s.loadError} Verifique a conexão e recarregue a página.</div>}
          <NowPlaying />
          <LinkBox />
          <Library />
        </div>
      </section>
      <MiniBar open={open} onToggle={() => setOpen((o) => !o)} />
    </div>
  );
}

// ── Barra recolhida ───────────────────────────────────────

function MiniBar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const s = usePlayer();
  const has = Boolean(s.current || s.queue.length);
  const title = s.current?.title || (has ? 'Carregando…' : 'Trilha sonora');
  const sub = has ? (s.current?.channel || s.source?.name || '') : 'Nada tocando';
  const loading = s.buffering && !s.playing;

  return (
    <div className="music-bar">
      <button className="music-bar-info" onClick={onToggle} aria-expanded={open} aria-controls="music-panel" title={open ? 'Recolher' : 'Abrir a trilha sonora'}>
        <span className="music-cover">
          {s.current ? <img src={thumbUrl(s.current.id)} alt="" /> : <Music size={16} />}
          {s.playing && <span className="music-eq" aria-hidden><i /><i /><i /></span>}
        </span>
        <span className="music-text">
          <span className="music-title">{title}</span>
          {sub && <span className="music-sub">{sub}</span>}
        </span>
      </button>
      <button className="music-btn" onClick={prev} disabled={!has} aria-label="Faixa anterior" title="Anterior"><SkipBack size={16} /></button>
      <button className="music-btn music-play" onClick={() => (has ? togglePlay() : !open && onToggle())}
        aria-label={s.playing ? 'Pausar' : 'Tocar'} title={has ? (s.playing ? 'Pausar' : 'Tocar') : 'Escolher o que tocar'}>
        {loading ? <Loader2 size={18} className="music-spin" /> : s.playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <button className="music-btn" onClick={next} disabled={!has} aria-label="Próxima faixa" title="Próxima"><SkipForward size={16} /></button>
      <VolumeControl />
      <button className="music-btn music-expand" onClick={onToggle} aria-label={open ? 'Recolher' : 'Expandir'} title={open ? 'Recolher' : 'Playlists'}>
        {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
    </div>
  );
}

function VolumeControl() {
  const prefs = usePrefs();
  const [pop, setPop] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const vol = prefs.muted ? 0 : prefs.volume;
  const Icon = vol === 0 ? VolumeX : vol < 50 ? Volume1 : Volume2;

  useEffect(() => {
    if (!pop) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setPop(false); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [pop]);

  const slider = (
    <input type="range" className="music-range" min={0} max={100} step={1} value={vol}
      onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" />
  );
  // No celular a barra é estreita: o botão abre um controle de volume; no computador, silencia.
  const narrow = () => window.matchMedia('(max-width: 640px)').matches;

  return (
    <div className="music-vol" ref={ref}>
      <button className="music-btn" onClick={() => (narrow() ? setPop((v) => !v) : toggleMute())}
        aria-label={prefs.muted ? 'Ativar o som' : 'Volume'} title={prefs.muted ? 'Ativar o som' : 'Silenciar'}>
        <Icon size={16} />
      </button>
      <span className="music-vol-inline">{slider}</span>
      {pop && (
        <div className="music-vol-pop">
          <button className="music-btn" onClick={toggleMute} aria-label={prefs.muted ? 'Ativar o som' : 'Silenciar'}><Icon size={16} /></button>
          {slider}
          <span className="tiny mono muted music-vol-num">{vol}</span>
        </div>
      )}
    </div>
  );
}

// ── Painel expandido ──────────────────────────────────────

const REPEAT_LABEL: Record<RepeatMode, string> = { all: 'Repetir playlist', one: 'Repetir faixa', off: 'Sem repetir' };

function NowPlaying() {
  const s = usePlayer();
  const prefs = usePrefs();
  const where = s.current ? [s.current.channel, s.source?.name].filter(Boolean).join(' · ') : '';
  return (
    <div className="music-now">
      <div className="music-now-title">{s.current ? (s.current.title || 'Carregando…') : 'Nada tocando'}</div>
      <div className="tiny muted">{s.current ? where : 'Escolha uma playlist abaixo ou cole um link do YouTube.'}</div>
      <div className="music-seek">
        <span className="tiny mono muted">{formatTime(s.time)}</span>
        <input type="range" className="music-range grow" min={0} max={Math.max(1, Math.floor(s.duration))} step={1}
          value={Math.min(Math.floor(s.time), Math.floor(s.duration))} disabled={!s.current || !s.duration}
          onChange={(e) => seek(Number(e.target.value))} aria-label="Posição na faixa" />
        <span className="tiny mono muted">{formatTime(s.duration)}</span>
      </div>
      <div className="music-modes">
        <button className={`music-mode${prefs.shuffle ? ' on' : ''}`} onClick={toggleShuffle} aria-pressed={prefs.shuffle}>
          <Shuffle size={14} /> Aleatório
        </button>
        <button className={`music-mode${prefs.repeat !== 'off' ? ' on' : ''}`} onClick={cycleRepeat} title="Trocar o modo de repetição">
          {prefs.repeat === 'one' ? <Repeat1 size={14} /> : <Repeat size={14} />} {REPEAT_LABEL[prefs.repeat]}
        </button>
      </div>
    </div>
  );
}

function LinkBox() {
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const link = parseYouTube(text);
    if (!link) { toast('Não reconheci esse link do YouTube.', 'error'); return; }
    playLink(link);
    setText('');
    prefsStore.patch({ tab: 'fila' });
  };
  return (
    <form className="music-form" onSubmit={submit}>
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Colar link do YouTube (vídeo ou playlist)" aria-label="Link do YouTube" />
      <button className="btn btn-sm" disabled={!text.trim()}><Play size={14} /> Tocar</button>
    </form>
  );
}

function Library() {
  const prefs = usePrefs();
  const s = usePlayer();
  const lists = useSyncExternalStore(libraryStore.subscribe, libraryStore.get);
  const [localId, setLocalId] = useState<string | null>(null);
  const [accountList, setAccountList] = useState<AccountPlaylist | null>(null);

  return (
    <div className="music-lib">
      <SubTabs<MusicTab> label="Músicas" value={prefs.tab} onChange={(tab) => prefsStore.patch({ tab })}
        onReselect={(t) => (t === 'sistema' ? setLocalId(null) : t === 'conta' ? setAccountList(null) : undefined)}
        tabs={[
          { id: 'fila', label: 'Tocando', icon: <ListVideo size={14} />, total: s.queue.length || undefined },
          { id: 'sistema', label: 'Do sistema', short: 'Sistema', icon: <ListMusic size={14} />, total: lists.length },
          { id: 'conta', label: 'Minha conta', short: 'Conta', icon: <Youtube size={14} /> },
        ]} />
      <div className="music-pane">
        {prefs.tab === 'fila' && <QueueTab />}
        {prefs.tab === 'sistema' && <SystemTab lists={lists} openId={localId} setOpenId={setLocalId} />}
        {prefs.tab === 'conta' && <AccountTab open={accountList} setOpen={setAccountList} />}
      </div>
    </div>
  );
}

function TrackRow({ t, active, failed, onPlay, actions }: {
  t: Track; active: boolean; failed?: boolean; onPlay: () => void; actions?: ReactNode;
}) {
  return (
    <div className={`music-row${active ? ' on' : ''}${failed ? ' failed' : ''}`}>
      <button className="music-row-main" onClick={onPlay} title={failed ? 'O YouTube recusou este vídeo' : 'Tocar a partir daqui'}>
        <span className="music-thumb">
          <img src={thumbUrl(t.id)} alt="" loading="lazy" />
          {active && <span className="music-thumb-now"><span className="music-eq" aria-hidden><i /><i /><i /></span></span>}
        </span>
        <span className="music-text">
          <span className="music-title">{t.title || 'Vídeo do YouTube'}</span>
          {(failed || t.channel) && <span className="music-sub">{failed ? 'Não toca fora do YouTube' : t.channel}</span>}
        </span>
      </button>
      {actions}
    </div>
  );
}

function QueueTab() {
  const s = usePlayer();
  if (!s.queue.length) {
    return (
      <div className="music-empty">
        {s.buffering ? 'Carregando…' : 'Nada na fila. Escolha uma playlist em “Do sistema” ou “Minha conta”, ou cole um link acima.'}
      </div>
    );
  }
  return (
    <>
      {s.source && <div className="music-pane-head"><span className="tiny muted">Tocando de</span> <strong className="small">{s.source.name}</strong></div>}
      <div className="music-rows">
        {s.queue.map((t, i) => (
          <TrackRow key={`${t.id}-${i}`} t={t} active={t.id === s.current?.id} failed={s.failed.includes(t.id)} onPlay={() => playAt(i)} />
        ))}
      </div>
    </>
  );
}

// ── Playlists do sistema ──────────────────────────────────

function SystemTab({ lists, openId, setOpenId }: { lists: LocalPlaylist[]; openId: string | null; setOpenId: (id: string | null) => void }) {
  const s = usePlayer();
  const [name, setName] = useState('');
  const list = lists.find((p) => p.id === openId);
  if (list) return <LocalPlaylistView list={list} onBack={() => setOpenId(null)} />;

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setOpenId(createPlaylist(name));
    setName('');
  };

  return (
    <>
      <form className="music-form" onSubmit={create}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Nova playlist (ex.: Combate)" aria-label="Nome da nova playlist" />
        <button className="btn btn-sm" disabled={!name.trim()}><Plus size={14} /> Criar</button>
      </form>
      {lists.length === 0 ? (
        <div className="music-empty">Monte playlists com músicas do YouTube para cada clima da mesa: exploração, tensão, combate… Elas ficam salvas neste navegador.</div>
      ) : (
        <div className="music-rows">
          {lists.map((p) => {
            const mine = s.source?.kind === 'local' && s.source.id === p.id;
            return (
              <div key={p.id} className={`music-row${mine ? ' on' : ''}`}>
                <button className="music-row-main" onClick={() => setOpenId(p.id)} title="Abrir a playlist">
                  <span className="music-thumb">{p.tracks[0] ? <img src={thumbUrl(p.tracks[0].id)} alt="" loading="lazy" /> : <ListMusic size={16} />}</span>
                  <span className="music-text">
                    <span className="music-title">{p.name}</span>
                    <span className="music-sub">{faixas(p.tracks.length)}</span>
                  </span>
                </button>
                <button className="music-btn" disabled={!p.tracks.length} onClick={() => (mine ? togglePlay() : playLocal(p))}
                  aria-label={mine && s.playing ? `Pausar ${p.name}` : `Tocar ${p.name}`}>
                  {mine && s.playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function LocalPlaylistView({ list, onBack }: { list: LocalPlaylist; onBack: () => void }) {
  const s = usePlayer();
  const [name, setName] = useState(list.name);
  useEffect(() => setName(list.name), [list.id, list.name]);
  const mine = s.source?.kind === 'local' && s.source.id === list.id;
  const commitName = () => {
    const n = name.trim();
    if (n && n !== list.name) renamePlaylist(list.id, n);
    else setName(list.name);
  };

  return (
    <>
      <div className="music-pane-head">
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onBack} aria-label="Voltar às playlists"><ChevronLeft size={16} /></button>
        <input className="music-name" value={name} maxLength={60} aria-label="Nome da playlist"
          onChange={(e) => setName(e.target.value)} onBlur={commitName}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <button className="btn btn-sm btn-primary" disabled={!list.tracks.length} onClick={() => (mine ? togglePlay() : playLocal(list))}>
          {mine && s.playing ? <><Pause size={14} /> Pausar</> : <><Play size={14} /> Tocar</>}
        </button>
        <ConfirmButton className="btn btn-ghost btn-icon btn-sm" title={`Excluir a playlist ${list.name}`} modalTitle="Excluir playlist" confirmLabel="Excluir playlist"
          message={<p>Excluir a playlist <strong>{list.name}</strong> ({faixas(list.tracks.length)})? Os vídeos continuam no YouTube.</p>}
          onConfirm={() => { deletePlaylist(list.id); onBack(); }}>
          <Trash2 size={14} />
        </ConfirmButton>
      </div>
      <AddTracks list={list} />
      {list.tracks.length === 0 ? (
        <div className="music-empty">Cole acima links de vídeos do YouTube, um por linha ou vários de uma vez.</div>
      ) : (
        <div className="music-rows">
          {list.tracks.map((t, i) => (
            <TrackRow key={t.id} t={t} active={mine && s.current?.id === t.id} failed={mine && s.failed.includes(t.id)} onPlay={() => playLocal(list, i)}
              actions={(
                <span className="music-row-actions">
                  <button className="music-btn music-btn-sm" disabled={i === 0} onClick={() => moveTrack(list.id, i, i - 1)} aria-label="Subir" title="Subir"><ArrowUp size={14} /></button>
                  <button className="music-btn music-btn-sm" disabled={i === list.tracks.length - 1} onClick={() => moveTrack(list.id, i, i + 1)} aria-label="Descer" title="Descer"><ArrowDown size={14} /></button>
                  <button className="music-btn music-btn-sm" onClick={() => removeTrack(list.id, i)} aria-label="Tirar da playlist" title="Tirar da playlist"><X size={14} /></button>
                </span>
              )} />
          ))}
        </div>
      )}
    </>
  );
}

function AddTracks({ list }: { list: LocalPlaylist }) {
  const account = useAccount();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ids = parseVideoIds(text);
    const playlistId = ids.length ? undefined : parseYouTube(text)?.playlistId;
    if (!ids.length && !playlistId) { toast('Nenhum link de vídeo do YouTube encontrado.', 'error'); return; }
    if (playlistId && account.status !== 'on') {
      toast('Para trazer uma playlist inteira, conecte a conta na aba “Minha conta”. Para só tocá-la, use o campo de link lá em cima.', 'info');
      return;
    }
    setBusy(true);
    try {
      let tracks: Track[] = [];
      let blocked = 0;
      if (playlistId) {
        tracks = await listPlaylistTracks(playlistId);
      } else {
        // O título vem do YouTube; vídeos que o dono não deixa tocar fora do site ficam de fora.
        const infos = await Promise.all(ids.map(fetchVideoInfo));
        ids.forEach((id, i) => {
          const r = infos[i];
          if (r.ok) tracks.push({ id, title: r.title, channel: r.channel });
          else if (r.blocked) blocked++;
          else tracks.push({ id, title: '' });
        });
      }
      const added = tracks.length ? addTracks(list.id, tracks) : 0;
      const repeated = tracks.length - added;
      const parts: string[] = [];
      if (added) parts.push(added === 1 ? '1 faixa adicionada.' : `${added} faixas adicionadas.`);
      if (repeated) parts.push(repeated === 1 ? '1 já estava na playlist.' : `${repeated} já estavam na playlist.`);
      if (blocked) parts.push(blocked === 1 ? '1 vídeo não pode tocar fora do YouTube e ficou de fora.' : `${blocked} vídeos não podem tocar fora do YouTube e ficaram de fora.`);
      toast(parts.join(' ') || 'Nada para adicionar.', added ? 'ok' : 'info');
      if (added || !blocked) setText('');
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="music-form" onSubmit={submit}>
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
        placeholder={account.status === 'on' ? 'Links de vídeos ou de uma playlist' : 'Links de vídeos do YouTube'} aria-label="Links para adicionar" />
      <button className="btn btn-sm" disabled={busy || !text.trim()}>{busy ? <Loader2 size={14} className="music-spin" /> : <Plus size={14} />} Adicionar</button>
    </form>
  );
}

// ── Conta do YouTube ──────────────────────────────────────

// Playlists da conta lidas nesta visita (a aba desmonta ao trocar).
const cache: { lists: AccountPlaylist[] | null; tracks: Map<string, Track[]> } = { lists: null, tracks: new Map() };

function AdsNote() {
  return (
    <p className="music-note">
      <strong>Sem anúncios:</strong> com YouTube Premium, entre no{' '}
      <a href="https://www.youtube.com" target="_blank" rel="noreferrer">youtube.com</a> com a mesma conta neste navegador; o player daqui usa
      essa sessão. Navegadores que bloqueiam cookies de outros sites (Safari, Brave, Firefox no modo estrito) podem mostrar anúncios mesmo assim.
    </p>
  );
}

function AccountTab({ open, setOpen }: { open: AccountPlaylist | null; setOpen: (p: AccountPlaylist | null) => void }) {
  const acc = useAccount();
  const [lists, setLists] = useState<AccountPlaylist[] | null>(cache.lists);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      cache.lists = await listMyPlaylists();
      setLists(cache.lists);
      await ensureProfile();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Sem token válido, a leitura abriria a janela de login sem um clique: espera o botão.
    if (acc.status === 'on' && !cache.lists && hasToken()) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acc.status]);

  if (!accountConfigured) {
    return (
      <>
        <div className="music-empty">
          A conexão com a conta do YouTube ainda não foi configurada neste site (falta o <code>VITE_GOOGLE_CLIENT_ID</code>; veja o README).
          Enquanto isso, cole o link de qualquer playlist no campo lá em cima para tocá-la.
        </div>
        <AdsNote />
      </>
    );
  }

  if (acc.status !== 'on') {
    return (
      <>
        <div className="music-connect">
          <Youtube size={28} />
          <p>Conecte sua conta para tocar aqui as suas playlists do YouTube.</p>
          <button className="btn btn-primary btn-sm" onClick={connectAccount} disabled={acc.status === 'connecting'}>
            {acc.status === 'connecting' ? <Loader2 size={14} className="music-spin" /> : <Youtube size={14} />} Conectar conta do YouTube
          </button>
          {acc.error && <p className="small music-error">{acc.error}</p>}
          <p className="tiny muted">Acesso só de leitura: o EVA vê suas playlists, mas não muda nada na conta.</p>
        </div>
        <AdsNote />
      </>
    );
  }

  if (open) return <AccountPlaylistView list={open} onBack={() => setOpen(null)} />;

  const disconnect = () => {
    cache.lists = null;
    cache.tracks.clear();
    setLists(null);
    disconnectAccount();
  };

  return (
    <>
      <div className="music-pane-head">
        <span className="music-avatar">{acc.avatar ? <img src={acc.avatar} alt="" /> : <Youtube size={14} />}</span>
        <strong className="small grow music-ellipsis">{acc.name ?? 'Conta conectada'}</strong>
        {lists && <button className="btn btn-ghost btn-icon btn-sm" onClick={load} disabled={loading} aria-label="Atualizar playlists" title="Atualizar"><RefreshCw size={14} /></button>}
        <button className="btn btn-ghost btn-sm" onClick={disconnect} title="Desconectar a conta"><LogOut size={14} /> Sair</button>
      </div>
      {error && <p className="small music-error">{error}</p>}
      {!lists ? (
        <div className="music-empty">
          <button className="btn btn-sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 size={14} className="music-spin" /> : <ListMusic size={14} />} Ver minhas playlists
          </button>
        </div>
      ) : lists.length === 0 ? (
        <div className="music-empty">Nenhuma playlist nesta conta.</div>
      ) : (
        <div className="music-rows">
          {lists.map((p) => (
            <div key={p.id} className="music-row">
              <button className="music-row-main" onClick={() => setOpen(p)} title="Abrir a playlist">
                <span className="music-thumb">{p.thumb ? <img src={p.thumb} alt="" loading="lazy" /> : <ListMusic size={16} />}</span>
                <span className="music-text">
                  <span className="music-title">{p.title}</span>
                  <span className="music-sub">{faixas(p.count)}</span>
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
      <AdsNote />
    </>
  );
}

function AccountPlaylistView({ list, onBack }: { list: AccountPlaylist; onBack: () => void }) {
  const s = usePlayer();
  const [tracks, setTracks] = useState<Track[] | null>(cache.tracks.get(list.id) ?? null);
  const [error, setError] = useState<string | null>(null);
  const mine = s.source?.kind === 'account' && s.source.id === list.id;

  useEffect(() => {
    if (tracks) return;
    let alive = true;
    listPlaylistTracks(list.id)
      .then((t) => { cache.tracks.set(list.id, t); if (alive) setTracks(t); })
      .catch((e) => alive && setError(errMsg(e)));
    return () => { alive = false; };
  }, [list.id, tracks]);

  const play = (i = 0) => tracks && playTracks({ kind: 'account', id: list.id, name: list.title }, tracks, i);
  const copy = () => {
    if (!tracks) return;
    createPlaylist(list.title, tracks);
    toast(`“${list.title}” copiada para “Do sistema”.`, 'ok');
  };

  return (
    <>
      <div className="music-pane-head">
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onBack} aria-label="Voltar às playlists"><ChevronLeft size={16} /></button>
        <strong className="small grow music-ellipsis">{list.title}</strong>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={copy} disabled={!tracks?.length} aria-label="Copiar para as playlists do sistema" title="Copiar para “Do sistema”"><Copy size={14} /></button>
        <button className="btn btn-sm btn-primary" disabled={!tracks?.length} onClick={() => (mine ? togglePlay() : play())}>
          {mine && s.playing ? <><Pause size={14} /> Pausar</> : <><Play size={14} /> Tocar</>}
        </button>
      </div>
      {error ? <p className="small music-error">{error}</p>
        : !tracks ? <div className="music-empty"><Loader2 size={16} className="music-spin" /></div>
          : tracks.length === 0 ? <div className="music-empty">Nenhum vídeo disponível nesta playlist.</div>
            : (
              <div className="music-rows">
                {tracks.map((t, i) => (
                  <TrackRow key={`${t.id}-${i}`} t={t} active={mine && s.current?.id === t.id} failed={mine && s.failed.includes(t.id)} onPlay={() => play(i)} />
                ))}
              </div>
            )}
    </>
  );
}
