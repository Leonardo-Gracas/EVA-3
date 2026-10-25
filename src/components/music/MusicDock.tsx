import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import {
  ArrowDown, ArrowUp, Blend, ChevronDown, ChevronLeft, Info, ListMusic, ListPlus, ListVideo, Loader2, Music,
  Pause, Play, Plus, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Trash2, Volume1, Volume2, VolumeX, X, Youtube,
} from 'lucide-react';
import { SubTabs } from '../room/TopBar';
import ConfirmButton from '../common/ConfirmButton';
import { toast } from '../common/toast';
import {
  attachPlayer, cycleCrossfade, next, originalQueue, playAt, playerStore, playLink, playTracks, prev, reloadPlayer, seek, setVolume,
  toggleLoop, toggleMute, togglePlay, toggleRepeatList, toggleShuffle,
} from '../../music/player';
import {
  addTracks, createPlaylist, deletePlaylist, libraryStore, moveTrack, prefsStore, removeTrack, renamePlaylist,
  type LocalPlaylist, type MusicTab,
} from '../../music/library';
import { artUrl, fetchVideoInfo, formatTime, parseVideoIds, parseYouTube, thumbUrl, type Track } from '../../music/youtube';

const usePlayer = () => useSyncExternalStore(playerStore.subscribe, playerStore.get);
const usePrefs = () => useSyncExternalStore(prefsStore.subscribe, prefsStore.get);

const faixas = (n: number) => `${n} ${n === 1 ? 'faixa' : 'faixas'}`;
const playLocal = (p: LocalPlaylist, i = 0) => playTracks({ kind: 'local', id: p.id, name: p.name }, p.tracks, i);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Algo deu errado.');

/**
 * Trilha sonora do mestre, presa ao canto inferior direito. Recolhida, é só a barra de controles;
 * expandida, mostra a capa, a posição na faixa, a mesma barra e as playlists. O áudio sai só deste navegador.
 */
export default function MusicDock() {
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const s = usePlayer();

  useEffect(() => (host.current ? attachPlayer(host.current) : undefined), []);

  const toggle = () => { setOpen((o) => !o); setHelp(false); };

  return (
    <div className={`music-dock${open ? ' music-open' : ''}`}
      onKeyDown={(e) => { if (e.key !== 'Escape') return; if (help) setHelp(false); else if (open) setOpen(false); }}>
      {/* O som vem de players do YouTube mantidos fora da tela; o painel mostra só a capa. */}
      <div className="music-engine" aria-hidden><div ref={host} className="music-engine-host" /></div>
      {open ? (
        <section id="music-panel" className="music-panel" aria-label="Trilha sonora">
          <header className="music-head">
            <Music size={16} className="gold" />
            <strong className="grow">Trilha sonora</strong>
            <button className={`music-btn music-btn-sm${help ? ' on' : ''}`} onClick={() => setHelp((h) => !h)}
              aria-expanded={help} aria-label="Ajuda" title="Ajuda"><Info size={16} /></button>
            <button className="music-btn music-btn-sm" onClick={toggle} aria-label="Recolher a trilha sonora" title="Recolher"><ChevronDown size={16} /></button>
          </header>
          <div className="music-top">
            <Artwork />
            {s.loadError && <div className="music-alert">{s.loadError}</div>}
            <SeekBar />
            <MiniBar open onToggle={toggle} />
          </div>
          <div className="music-body">
            <LinkBox />
            <Library />
          </div>
          {help && <HelpPanel onClose={() => setHelp(false)} />}
        </section>
      ) : (
        <MiniBar open={false} onToggle={toggle} />
      )}
    </div>
  );
}

// ── Barra de controles ────────────────────────────────────

/** Recolhida, fica sozinha no canto; expandida, vai para dentro do painel, logo abaixo da posição na faixa. */
function MiniBar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const s = usePlayer();
  const prefs = usePrefs();
  const has = Boolean(s.current || s.queue.length);
  const title = s.current?.title || (has ? 'Carregando…' : 'Trilha sonora');
  // Recolhida, cabe só o canal (ou a playlist); expandida, os dois.
  const channel = s.current?.channel ?? '';
  const from = s.source?.name ?? '';
  const sub = !has ? 'Nada tocando' : open ? [channel, from].filter(Boolean).join(' · ') : channel || from;
  const loading = s.buffering && !s.playing;

  return (
    <div className={`music-bar${open ? ' music-bar-docked' : ''}`} title={open ? undefined : 'Abrir a trilha sonora'}
      onClick={(e) => { if (!open && !(e.target as HTMLElement).closest('button, input, .music-vol')) onToggle(); }}>
      {/* Para o teclado: na barra recolhida, a área do título faz o papel de botão de abrir. */}
      <div className="music-bar-info" {...(open ? {} : {
        role: 'button', tabIndex: 0, 'aria-expanded': false, 'aria-controls': 'music-panel', 'aria-label': 'Abrir a trilha sonora',
        onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } },
      })}>
        <span className="music-cover">
          {s.current ? <img src={thumbUrl(s.current.id)} alt="" /> : <Music size={16} />}
          {s.playing && <span className="music-eq" aria-hidden><i /><i /><i /></span>}
        </span>
        <span className="music-text">
          <span className="music-title">{title}</span>
          {sub && <span className="music-sub">{sub}</span>}
        </span>
      </div>
      <button className="music-btn" onClick={prev} disabled={!has} aria-label="Faixa anterior" title="Anterior"><SkipBack size={16} /></button>
      <button className="music-btn music-play" onClick={() => (has ? togglePlay() : !open && onToggle())}
        aria-label={s.playing ? 'Pausar' : 'Tocar'} title={has ? (s.playing ? 'Pausar' : 'Tocar') : 'Escolher o que tocar'}>
        {loading ? <Loader2 size={18} className="music-spin" /> : s.playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <button className="music-btn" onClick={next} disabled={!has} aria-label="Próxima faixa" title="Próxima"><SkipForward size={16} /></button>
      <button className={`music-btn${prefs.loop ? ' on' : ''}`} onClick={toggleLoop} aria-pressed={prefs.loop}
        aria-label="Recomeçar a faixa quando acabar" title={prefs.loop ? 'Recomeçando a faixa quando acabar' : 'Recomeçar a faixa quando acabar'}>
        <Repeat1 size={16} />
      </button>
      <VolumeControl />
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

/** Capa da faixa atual; troca com um esmaecimento, acompanhando a transição do som. */
function Artwork() {
  const s = usePlayer();
  const id = s.current?.id;
  return (
    <div className="music-art">
      {id ? <img key={id} src={artUrl(id)} alt="" /> : <Music size={36} />}
    </div>
  );
}

function SeekBar() {
  const s = usePlayer();
  return (
    <div className="music-seek">
      <span className="tiny mono muted">{formatTime(s.time)}</span>
      <input type="range" className="music-range grow" min={0} max={Math.max(1, Math.floor(s.duration))} step={1}
        value={Math.min(Math.floor(s.time), Math.floor(s.duration))} disabled={!s.current || !s.duration}
        onChange={(e) => seek(Number(e.target.value))} aria-label="Posição na faixa" />
      <span className="tiny mono muted">{formatTime(s.duration)}</span>
    </div>
  );
}

/**
 * O player usa a sessão do youtube.com deste navegador (Premium = sem anúncios); o site não tem como
 * saber se ela existe. Ao voltar para o EVA depois de abrir o YouTube, os players são recriados para
 * pegar o login novo, continuando a faixa de onde estava.
 */
let awaitingReturn = false;

function openYouTubeLogin() {
  window.open('https://www.youtube.com/', '_blank', 'noopener,noreferrer');
  if (awaitingReturn) return;
  awaitingReturn = true;
  const back = () => {
    window.removeEventListener('focus', back);
    awaitingReturn = false;
    reloadPlayer();
    toast('Player recarregado com a sua sessão do YouTube.', 'ok');
  };
  // Espera a aba nova roubar o foco antes de escutar a volta.
  setTimeout(() => window.addEventListener('focus', back), 600);
}

function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="music-help" role="dialog" aria-label="Ajuda da trilha sonora">
      <div className="music-help-head">
        <strong className="grow">Como funciona</strong>
        <button className="music-btn music-btn-sm" onClick={onClose} aria-label="Fechar a ajuda"><X size={16} /></button>
      </div>
      <ul>
        <li><strong>Só você ouve.</strong> A música toca só neste navegador; os jogadores não ouvem nada.</li>
        <li><strong>Tocar um link:</strong> cole o endereço de um vídeo ou de uma playlist do YouTube. A playlist colada pode virar playlist do sistema pelo botão <em>Salvar</em>, na aba Tocando.</li>
        <li><strong>Playlists do sistema</strong> ficam salvas neste navegador e não entram no backup da mesa. Crie uma e cole links de vídeos.</li>
        <li><strong>Recomeçar faixa</strong> (<Repeat1 size={12} /> na barra) repete a música atual. <strong>Repetir playlist</strong> volta ao começo depois da última faixa.</li>
        <li><strong>Transição:</strong> perto do fim, a próxima música entra enquanto a atual some. Clique no botão para trocar a duração. No iPhone e no iPad a troca é seca.</li>
        <li>Vídeos que o dono não deixa tocar fora do YouTube são pulados.</li>
      </ul>
      <div className="music-help-yt">
        <p>
          <strong>Sem anúncios:</strong> com YouTube Premium, basta estar logado no YouTube neste navegador. Se ainda não estiver,
          clique abaixo, entre na sua conta e volte para cá: o player recarrega sozinho.
        </p>
        <button className="btn btn-sm btn-primary" onClick={openYouTubeLogin}><Youtube size={14} /> Entrar no YouTube</button>
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
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Link do YouTube (vídeo ou playlist)" aria-label="Link do YouTube" />
      <button className="btn btn-sm" disabled={!text.trim()}><Play size={14} /> Tocar</button>
    </form>
  );
}

function Library() {
  const prefs = usePrefs();
  const s = usePlayer();
  const lists = useSyncExternalStore(libraryStore.subscribe, libraryStore.get);
  const [localId, setLocalId] = useState<string | null>(null);

  return (
    <div className="music-lib">
      <SubTabs<MusicTab> label="Músicas" value={prefs.tab} onChange={(tab) => prefsStore.patch({ tab })}
        onReselect={(t) => { if (t === 'sistema') setLocalId(null); }}
        tabs={[
          { id: 'fila', label: 'Tocando', icon: <ListVideo size={14} />, total: s.queue.length || undefined },
          { id: 'sistema', label: 'Do sistema', icon: <ListMusic size={14} />, total: lists.length },
        ]} />
      {/* Como a fila anda: junto das playlists. */}
      <div className="music-modes">
        <button className={`music-mode${prefs.shuffle ? ' on' : ''}`} onClick={toggleShuffle} aria-pressed={prefs.shuffle}>
          <Shuffle size={14} /> Aleatório
        </button>
        <button className={`music-mode${prefs.repeatList ? ' on' : ''}`} onClick={toggleRepeatList} aria-pressed={prefs.repeatList}>
          <Repeat size={14} /> Repetir playlist
        </button>
        <button className={`music-mode${prefs.crossfade ? ' on' : ''}`} onClick={cycleCrossfade} title="Clique para trocar a duração">
          <Blend size={14} /> {prefs.crossfade ? `Transição ${prefs.crossfade}s` : 'Sem transição'}
        </button>
      </div>
      <div className="music-pane">
        {prefs.tab === 'fila' && <QueueTab onSaved={(id) => { setLocalId(id); prefsStore.patch({ tab: 'sistema' }); }} />}
        {prefs.tab === 'sistema' && <SystemTab lists={lists} openId={localId} setOpenId={setLocalId} />}
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
          <span className="music-title">{t.title || (failed ? 'Vídeo indisponível' : 'Vídeo do YouTube')}</span>
          {(failed || t.channel) && <span className="music-sub">{failed ? 'Não toca fora do YouTube' : t.channel}</span>}
        </span>
      </button>
      {actions}
    </div>
  );
}

function QueueTab({ onSaved }: { onSaved: (playlistId: string) => void }) {
  const s = usePlayer();
  // Uma fila que veio de link (vídeo ou playlist do YouTube) pode virar playlist do sistema.
  const save = () => {
    const tracks = originalQueue();
    const id = createPlaylist(s.source?.name ?? 'Playlist do YouTube', tracks);
    toast(`Playlist salva em “Do sistema” com ${faixas(tracks.length)}.`, 'ok');
    onSaved(id);
  };
  if (!s.queue.length) return <div className="music-empty">{s.buffering ? 'Carregando…' : 'Nada na fila.'}</div>;
  return (
    <>
      {s.source && (
        <div className="music-pane-head">
          <strong className="small grow music-ellipsis">{s.source.name}</strong>
          {s.source.kind === 'link' && (
            <button className="btn btn-ghost btn-sm" onClick={save} title="Salvar esta fila como playlist do sistema"><ListPlus size={14} /> Salvar</button>
          )}
        </div>
      )}
      <div className="music-rows">
        {s.queue.map((t, i) => (
          <TrackRow key={`${t.id}-${i}`} t={t} active={i === s.index} failed={s.failed.includes(t.id)} onPlay={() => playAt(i)} />
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
        <div className="music-empty">Nenhuma playlist ainda.</div>
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
        <div className="music-empty">Playlist vazia.</div>
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
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ids = parseVideoIds(text);
    if (!ids.length) {
      toast(parseYouTube(text)?.playlistId
        ? 'Para trazer uma playlist inteira, toque o link dela pelo campo lá em cima e use “Salvar” na aba Tocando.'
        : 'Nenhum link de vídeo do YouTube encontrado.', parseYouTube(text) ? 'info' : 'error');
      return;
    }
    setBusy(true);
    try {
      const tracks: Track[] = [];
      let blocked = 0;
      // O título vem do YouTube; vídeos que o dono não deixa tocar fora do site ficam de fora.
      const infos = await Promise.all(ids.map(fetchVideoInfo));
      ids.forEach((id, i) => {
        const r = infos[i];
        if (r.ok) tracks.push({ id, title: r.title, channel: r.channel });
        else if (r.blocked) blocked++;
        else tracks.push({ id, title: '' });
      });
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
        placeholder="Links de vídeos do YouTube" aria-label="Links para adicionar" />
      <button className="btn btn-sm" disabled={busy || !text.trim()}>{busy ? <Loader2 size={14} className="music-spin" /> : <Plus size={14} />} Adicionar</button>
    </form>
  );
}
