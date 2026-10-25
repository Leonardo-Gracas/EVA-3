import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDown, ArrowUp, Blend, ChevronDown, ChevronLeft, ExternalLink, Headphones, ListMusic, ListPlus, ListVideo, Loader2, Music,
  Pause, Play, Plus, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Trash2, Volume1, Volume2, VolumeX, X, Youtube,
} from 'lucide-react';
import { SubTabs } from '../room/TopBar';
import ConfirmButton from '../common/ConfirmButton';
import { toast } from '../common/toast';
import {
  attachPlayer, cycleCrossfade, cycleRepeat, next, originalQueue, playAt, playerStore, playLink, playTracks, prev, reloadPlayer, seek, setVolume,
  toggleMute, togglePlay, toggleRepeatOne, toggleShuffle,
} from '../../music/player';
import {
  addTracks, createPlaylist, deletePlaylist, libraryStore, moveTrack, prefsStore, removeTrack, renamePlaylist,
  type LocalPlaylist, type MusicTab, type Repeat as RepeatMode,
} from '../../music/library';
import { fetchVideoInfo, formatTime, parseVideoIds, parseYouTube, thumbUrl, type Track } from '../../music/youtube';

const usePlayer = () => useSyncExternalStore(playerStore.subscribe, playerStore.get);
const usePrefs = () => useSyncExternalStore(prefsStore.subscribe, prefsStore.get);

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
          <YouTubeLogin />
          <LinkBox />
          <Library />
        </div>
      </section>
      <MiniBar open={open} onToggle={() => setOpen((o) => !o)} />
    </div>
  );
}

// ── Barra recolhida ───────────────────────────────────────

/** Clique na barra fora dos controles abre ou fecha o painel. */
function MiniBar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const s = usePlayer();
  const prefs = usePrefs();
  const has = Boolean(s.current || s.queue.length);
  const title = s.current?.title || (has ? 'Carregando…' : 'Trilha sonora');
  const sub = has ? (s.current?.channel || s.source?.name || '') : 'Nada tocando';
  const loading = s.buffering && !s.playing;
  const loopOne = prefs.repeat === 'one';

  return (
    <div className="music-bar" title={open ? 'Recolher' : 'Abrir a trilha sonora'}
      onClick={(e) => { if (!(e.target as HTMLElement).closest('button, input, .music-vol')) onToggle(); }}>
      {/* Para o teclado: a área do título faz o papel de botão de abrir. */}
      <div className="music-bar-info" role="button" tabIndex={0} aria-expanded={open} aria-controls="music-panel"
        aria-label={open ? 'Recolher a trilha sonora' : 'Abrir a trilha sonora'}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}>
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
      <button className={`music-btn${loopOne ? ' on' : ''}`} onClick={toggleRepeatOne} aria-pressed={loopOne}
        aria-label="Recomeçar a faixa quando acabar" title={loopOne ? 'Recomeçando a faixa quando acabar (clique para desligar)' : 'Recomeçar a faixa quando acabar'}>
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
        <button className={`music-mode${prefs.crossfade ? ' on' : ''}`} onClick={cycleCrossfade}
          title="Uma faixa entra enquanto a outra sai, inclusive ao repetir a mesma. Clique para trocar a duração.">
          <Blend size={14} /> {prefs.crossfade ? `Transição ${prefs.crossfade}s` : 'Sem transição'}
        </button>
      </div>
    </div>
  );
}

/**
 * O player usa a sessão do youtube.com deste navegador (Premium = sem anúncios). O site não consegue
 * saber se essa sessão existe, então o botão fica sempre à mão. Ao voltar para o EVA, o player é
 * recriado para pegar o login novo, continuando a faixa de onde estava.
 */
let awaitingReturn = false;

function YouTubeLogin() {
  const open = () => {
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
  };
  return (
    <div className="music-login">
      <Youtube size={14} />
      <span className="grow">Com YouTube Premium, entre na sua conta no YouTube neste navegador para tocar sem anúncios.</span>
      <button className="btn btn-sm" onClick={open} title="Abre o YouTube numa aba nova"><ExternalLink size={13} /> Abrir YouTube</button>
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

  return (
    <div className="music-lib">
      <SubTabs<MusicTab> label="Músicas" value={prefs.tab} onChange={(tab) => prefsStore.patch({ tab })}
        onReselect={(t) => { if (t === 'sistema') setLocalId(null); }}
        tabs={[
          { id: 'fila', label: 'Tocando', icon: <ListVideo size={14} />, total: s.queue.length || undefined },
          { id: 'sistema', label: 'Do sistema', icon: <ListMusic size={14} />, total: lists.length },
        ]} />
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
  if (!s.queue.length) {
    return (
      <div className="music-empty">
        {s.buffering ? 'Carregando…' : 'Nada na fila. Escolha uma playlist em “Do sistema” ou “Minha conta”, ou cole um link acima.'}
      </div>
    );
  }
  return (
    <>
      {s.source && (
        <div className="music-pane-head">
          <span className="tiny muted">Tocando de</span>
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
