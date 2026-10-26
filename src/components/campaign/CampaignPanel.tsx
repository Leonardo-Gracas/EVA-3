import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, BookMarked, CalendarDays, ChevronDown, ChevronUp, Compass, History, Milestone, NotebookText, Pencil, Plus, Spline, Trash2,
} from 'lucide-react';
import { ARC_STATUS, type ArcStatus, type Campaign, type CampaignArc, type CampaignInfo, type CampaignSession, type TableState } from '../../model/types';
import { currentArc, emptySessionData, formatSessionDate, nextSession, sessionLabel, sessionsInOrder } from '../../model/campaign';
import { LIMITS } from '../../rules/validate';
import { useAct } from '../act';
import ConfirmButton from '../common/ConfirmButton';
import Modal from '../common/Modal';
import { AutoTextarea, CheckList, RichText, SaveBadge, Section, useAutosave } from './parts';
import SessionEditor from './SessionEditor';

/** 'geral' = visão geral; senão, o id da sessão aberta. */
type View = 'geral' | string;
type ArcEdit = CampaignArc | 'new' | null;

/** Sessões de cada arco, na ordem dos arcos, e as que ficaram sem arco. */
function groupByArc(camp: Campaign, sessions: CampaignSession[]) {
  const arcs = camp.arcs.map((arc) => ({ arc, items: sessions.filter((s) => s.arcId === arc.id) }));
  const loose = sessions.filter((s) => !s.arcId || !camp.arcs.some((a) => a.id === s.arcId));
  return { arcs, loose };
}

/**
 * Caderno de campanha do mestre. Os arcos vêm primeiro: são os capítulos da campanha, e cada
 * sessão nasce dentro de um. À esquerda, a visão geral e os arcos com as sessões; à direita,
 * o que estiver aberto. No celular, uma tela de cada vez.
 */
export default function CampaignPanel({ table, detailOpen, setDetailOpen }: {
  table: TableState; detailOpen: boolean; setDetailOpen: (open: boolean) => void;
}) {
  const { act } = useAct();
  const [view, setView] = useState<View>('geral');
  const [editingArc, setEditingArc] = useState<ArcEdit>(null);
  const camp = table.campaign;
  const sessions = useMemo(() => sessionsInOrder(camp), [camp]);
  const session = view !== 'geral' ? camp.sessions[view] : undefined;

  // Sessão apagada: volta à visão geral.
  useEffect(() => { if (view !== 'geral' && !session) setView('geral'); }, [view, session]);

  const open = (v: View) => { setView(v); setDetailOpen(true); window.scrollTo({ top: 0 }); };
  const back = () => { setDetailOpen(false); window.scrollTo({ top: 0 }); };

  /** Nova sessão no arco dado (ou no atual). Sem arcos, pede o primeiro arco antes. */
  const newSession = async (arcId?: string) => {
    const arc = arcId ?? currentArc(camp)?.id;
    if (!arc) { setEditingArc('new'); return; }
    const r = await act({ type: 'campaign/sessionUpsert', data: emptySessionData(0, arc) }, 'Sessão criada.');
    if (r.ok && r.id) open(r.id);
  };

  const groups = useMemo(() => groupByArc(camp, sessions), [camp, sessions]);
  const next = nextSession(camp);

  return (
    <div className={`split split-master camp${detailOpen ? ' split-detail-open' : ''}`}>
      <nav className="col split-list camp-nav" aria-label="Campanha">
        <button className={`camp-nav-item${view === 'geral' ? ' on' : ''}`} onClick={() => open('geral')}>
          <Compass size={16} />
          <span className="grow">
            <span className="camp-nav-title">Visão geral</span>
            <span className="camp-nav-sub">{camp.title.trim() || table.name}</span>
          </span>
        </button>

        <div className="camp-nav-head">
          <span>Arcos</span>
          {camp.arcs.length > 0 && <span className="subtab-total">{camp.arcs.length}</span>}
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={() => setEditingArc('new')}><Plus size={13} /> Arco</button>
        </div>

        {camp.arcs.length === 0 && (
          <div className="camp-nav-empty">
            <p>Comece pelos arcos: os capítulos da campanha. As sessões são planejadas dentro deles.</p>
            <button className="btn btn-sm btn-primary" onClick={() => setEditingArc('new')}><Plus size={13} /> Planejar o primeiro arco</button>
          </div>
        )}

        {groups.arcs.map(({ arc, items }, i) => {
          const played = items.filter((s) => s.status === 'jogada').length;
          return (
            <div key={arc.id} className="camp-nav-group">
              <div className="camp-nav-arc">
                <button className="camp-nav-arc-main" onClick={() => setEditingArc(arc)} title={`Editar ${arc.title}`}>
                  <span className={`arc-dot arc-${arc.status}`} />
                  <span className="camp-nav-arc-num">{i + 1}</span>
                  <span className="grow camp-nav-arc-title">{arc.title}</span>
                  {items.length > 0 && <span className="camp-nav-arc-n" title={`${played} de ${items.length} jogadas`}>{played}/{items.length}</span>}
                </button>
                <button className="btn btn-sm btn-ghost btn-icon" title={`Nova sessão em ${arc.title}`} aria-label={`Nova sessão em ${arc.title}`}
                  onClick={() => void newSession(arc.id)}><Plus size={14} /></button>
              </div>
              <div className="camp-nav-sessions">
                {items.length === 0
                  ? <button className="camp-nav-add" onClick={() => void newSession(arc.id)}><Plus size={13} /> Planejar a primeira sessão</button>
                  : items.map((s) => <SessionNavRow key={s.id} s={s} on={view === s.id} isNext={next?.id === s.id} onClick={() => open(s.id)} />)}
              </div>
            </div>
          );
        })}

        {groups.loose.length > 0 && (
          <div className="camp-nav-group">
            <div className="camp-nav-arc camp-nav-arc-loose">
              <span className="camp-nav-arc-main" title="Sessões fora dos arcos: escolha um arco dentro de cada uma">
                <span className="arc-dot arc-none" />
                <span className="grow camp-nav-arc-title">Sem arco</span>
              </span>
            </div>
            <div className="camp-nav-sessions">
              {groups.loose.map((s) => <SessionNavRow key={s.id} s={s} on={view === s.id} isNext={next?.id === s.id} onClick={() => open(s.id)} />)}
            </div>
          </div>
        )}
      </nav>

      <div className="split-detail">
        <button className="btn btn-sm btn-ghost split-back" onClick={back}><ArrowLeft size={14} /> Campanha</button>
        {session
          ? <SessionEditor key={session.id} table={table} session={session} onDeleted={() => setView('geral')} />
          : <Overview table={table} onOpen={open} onNewSession={(arcId) => void newSession(arcId)} onEditArc={setEditingArc} />}
      </div>

      {editingArc && <ArcModal arc={editingArc === 'new' ? null : editingArc} onClose={() => setEditingArc(null)} />}
    </div>
  );
}

function SessionNavRow({ s, on, isNext, onClick }: { s: CampaignSession; on: boolean; isNext: boolean; onClick: () => void }) {
  const date = formatSessionDate(s.date, true);
  return (
    <button className={`camp-sess${on ? ' on' : ''}`} onClick={onClick}>
      <span className={`camp-sess-num ${s.status}`} title={s.status === 'jogada' ? 'Jogada' : 'Planejada'}>{s.number}</span>
      <span className="grow">
        <span className="camp-nav-title">{sessionLabel(s)}</span>
        <span className="camp-nav-sub">
          {date || 'Sem data'}
          {s.status === 'jogada' && s.report.attendees.length > 0 && ` · ${s.report.attendees.length} presente${s.report.attendees.length > 1 ? 's' : ''}`}
        </span>
      </span>
      {isNext && <span className="camp-next-tag">Próxima</span>}
    </button>
  );
}

// ── Visão geral ──────────────────────────────────────────────────────────────

function Overview({ table, onOpen, onNewSession, onEditArc }: {
  table: TableState; onOpen: (id: string) => void; onNewSession: (arcId?: string) => void; onEditArc: (a: ArcEdit) => void;
}) {
  const { act } = useAct();
  const camp = table.campaign;
  const [info, setInfo] = useState<CampaignInfo>(() => ({ title: camp.title, premise: camp.premise, notes: camp.notes, threads: camp.threads }));
  const save = useAutosave(info, async (v) => (await act({ type: 'campaign/update', data: v })).ok);
  const up = (p: Partial<CampaignInfo>) => setInfo((x) => ({ ...x, ...p }));

  const sessions = sessionsInOrder(camp);
  const groups = groupByArc(camp, sessions);
  const played = sessions.filter((s) => s.status === 'jogada');
  const next = nextSession(camp);
  const last = played[played.length - 1];
  const arcNow = currentArc(camp);
  const openThreads = info.threads.filter((x) => !x.done).length;
  const arcOf = (s: CampaignSession) => camp.arcs.find((a) => a.id === s.arcId);

  return (
    <div className="camp-overview">
      <header className="camp-hero">
        <div className="camp-sess-top">
          <span className="camp-eyebrow"><BookMarked size={13} /> Campanha</span>
          <span className="spacer" />
          <SaveBadge state={save} />
        </div>
        <input className="camp-title-input camp-title-lg" value={info.title} maxLength={LIMITS.campaignTitle} placeholder={table.name}
          onChange={(e) => up({ title: e.target.value })} aria-label="Nome da campanha" />
        <AutoTextarea className="camp-premise" value={info.premise} maxLength={LIMITS.campaignText} minRows={1}
          placeholder="Premissa: do que trata a campanha, em poucas linhas. O tom, o conflito central, o que está em jogo."
          onChange={(e) => up({ premise: e.target.value })} aria-label="Premissa" />
        <dl className="camp-kpis">
          <div><dt>Arcos</dt><dd>{camp.arcs.length}</dd></div>
          <div><dt>Jogadas</dt><dd>{played.length}</dd></div>
          <div><dt>Planejadas</dt><dd>{sessions.length - played.length}</dd></div>
          <div><dt>Fios soltos</dt><dd>{openThreads}</dd></div>
        </dl>
      </header>

      {camp.arcs.length === 0 && sessions.length === 0 ? (
        <div className="camp-start">
          <h3>Como usar</h3>
          <ol>
            <li><strong>Premissa</strong> acima: uma ou duas linhas já bastam.</li>
            <li><strong>Arcos</strong>: planeje os capítulos da campanha antes das sessões — do que trata cada um, como começa, como pode terminar.</li>
            <li><strong>Sessões</strong>: crie dentro de um arco e preencha o <em>Planejamento</em> — só o objetivo e um roteiro, ou tudo.</li>
            <li><strong>Conclusão</strong>: durante o jogo, marque presença e segredos revelados; depois, escreva o resumo e os ganchos.</li>
          </ol>
          <button className="btn btn-primary" onClick={() => onEditArc('new')}><Plus size={14} /> Planejar o primeiro arco</button>
        </div>
      ) : (
        <>
          <Section icon={<Milestone size={15} />} title="Arcos" hint="Os capítulos da campanha, em ordem. Planeje o arco antes das sessões dele."
            aside={<button className="btn btn-sm btn-ghost" onClick={() => onEditArc('new')}><Plus size={13} /> Arco</button>}>
            {camp.arcs.length === 0 ? (
              <div className="camp-arc-empty">
                <p className="camp-hint">Nenhum arco ainda. Crie o primeiro e escolha, em cada sessão, a que arco ela pertence.</p>
                <button className="btn btn-sm btn-primary" onClick={() => onEditArc('new')}><Plus size={13} /> Planejar um arco</button>
              </div>
            ) : (
              <ol className="arc-list">
                {groups.arcs.map(({ arc: a, items }, i) => {
                  const done = items.filter((s) => s.status === 'jogada').length;
                  return (
                    <li key={a.id} className={`arc-row${a.id === arcNow?.id ? ' now' : ''}`}>
                      <span className="arc-step"><span className={`arc-dot arc-${a.status}`} /><span className="arc-num">{i + 1}</span></span>
                      <button className="arc-main" onClick={() => onEditArc(a)} title={`Editar ${a.title}`}>
                        <span className="arc-title">{a.title}<Pencil size={12} className="arc-edit" /></span>
                        <span className="arc-sub">
                          {ARC_STATUS[a.status]} · {items.length === 0 ? 'nenhuma sessão' : `${done} de ${items.length} ${items.length === 1 ? 'sessão jogada' : 'sessões jogadas'}`}
                        </span>
                        {a.summary && <span className="arc-summary"><RichText text={a.summary} /></span>}
                        {items.length > 0 && <span className="bar bar-dur arc-bar"><span style={{ width: `${(done / items.length) * 100}%` }} /></span>}
                      </button>
                      <span className="arc-actions">
                        <button className="btn btn-sm btn-ghost" title={`Nova sessão em ${a.title}`} onClick={() => onNewSession(a.id)}><Plus size={13} /> Sessão</button>
                        {camp.arcs.length > 1 && (
                          <span className="arc-move">
                            <button className="btn btn-sm btn-ghost btn-icon" disabled={i === 0} title="Subir" aria-label={`Subir ${a.title}`}
                              onClick={() => void act({ type: 'campaign/arcMove', arcId: a.id, to: i - 1 })}><ChevronUp size={14} /></button>
                            <button className="btn btn-sm btn-ghost btn-icon" disabled={i === camp.arcs.length - 1} title="Descer" aria-label={`Descer ${a.title}`}
                              onClick={() => void act({ type: 'campaign/arcMove', arcId: a.id, to: i + 1 })}><ChevronDown size={14} /></button>
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            {groups.loose.length > 0 && camp.arcs.length > 0 && (
              <p className="camp-hint camp-loose">
                {groups.loose.length === 1 ? '1 sessão está' : `${groups.loose.length} sessões estão`} sem arco. Abra a sessão e escolha o arco dela.
              </p>
            )}
          </Section>

          <div className="camp-spots">
            {next ? (
              <button className="camp-spot" onClick={() => onOpen(next.id)}>
                <span className="camp-spot-label"><CalendarDays size={13} /> Próxima sessão</span>
                <span className="camp-spot-title">#{next.number} · {sessionLabel(next)}</span>
                <span className="camp-spot-sub">
                  {formatSessionDate(next.date) || 'Sem data marcada'}{arcOf(next) && ` · ${arcOf(next)!.title}`}
                </span>
                {next.plan.goal && <span className="camp-spot-text"><RichText text={next.plan.goal} /></span>}
                <PrepProgress s={next} />
              </button>
            ) : (
              <button className="camp-spot camp-spot-empty" onClick={() => onNewSession()}>
                <span className="camp-spot-label"><CalendarDays size={13} /> Próxima sessão</span>
                <span className="camp-spot-title"><Plus size={15} /> Planejar a próxima</span>
                <span className="camp-spot-sub">{arcNow ? `Em ${arcNow.title}` : 'Crie um arco antes'}</span>
              </button>
            )}
            {last && (
              <button className="camp-spot" onClick={() => onOpen(last.id)}>
                <span className="camp-spot-label"><History size={13} /> Onde paramos</span>
                <span className="camp-spot-title">#{last.number} · {sessionLabel(last)}</span>
                <span className="camp-spot-sub">{formatSessionDate(last.date) || 'Sem data'}{arcOf(last) && ` · ${arcOf(last)!.title}`}</span>
                <span className="camp-spot-text clamp"><RichText text={last.report.recap || last.report.hooks || 'Sem resumo ainda.'} /></span>
              </button>
            )}
          </div>
        </>
      )}

      <div className="camp-cols">
        <Section icon={<Spline size={15} />} title="Fios soltos" hint="Ganchos, mistérios e promessas em aberto. Marque quando resolver."
          aside={info.threads.length > 0 && <span className="camp-count">{openThreads} em aberto</span>}>
          <CheckList items={info.threads} onChange={(threads) => up({ threads })} placeholder="Novo fio solto" doneLabel="resolvido" />
        </Section>

        <Section icon={<NotebookText size={15} />} title="Anotações gerais" hint="Mundo, facções, linha do tempo, regras da casa. O que não cabe num arco.">
          <AutoTextarea value={info.notes} maxLength={LIMITS.campaignText} minRows={6} onChange={(e) => up({ notes: e.target.value })} aria-label="Anotações gerais" />
        </Section>
      </div>
    </div>
  );
}

function PrepProgress({ s }: { s: CampaignSession }) {
  const total = s.plan.prep.length;
  if (!total) return null;
  const done = s.plan.prep.filter((x) => x.done).length;
  return (
    <span className="camp-progress" title={`${done} de ${total} preparativos prontos`}>
      <span className="bar bar-dur"><span style={{ width: `${(done / total) * 100}%` }} /></span>
      <span className="tiny muted">Preparo {done}/{total}</span>
    </span>
  );
}

function ArcModal({ arc, onClose }: { arc: CampaignArc | null; onClose: () => void }) {
  const { act } = useAct();
  const [title, setTitle] = useState(arc?.title ?? '');
  const [summary, setSummary] = useState(arc?.summary ?? '');
  const [status, setStatus] = useState<ArcStatus>(arc?.status ?? 'planejado');
  const save = async () => {
    const r = await act({ type: 'campaign/arcUpsert', arcId: arc?.id, title, summary, status }, arc ? 'Arco salvo.' : 'Arco criado.');
    if (r.ok) onClose();
  };
  return (
    <Modal open title={arc ? `Editar ${arc.title}` : 'Novo arco'} onClose={onClose} width={520}
      footer={
        <>
          {arc && (
            <ConfirmButton className="btn btn-ghost" title="Excluir arco" modalTitle="Excluir arco" confirmLabel={`Excluir ${arc.title}`}
              message={<><p>Excluir o arco <strong>{arc.title}</strong>?</p><p className="small muted mt">As sessões dele continuam, só ficam sem arco.</p></>}
              onConfirm={async () => { const r = await act({ type: 'campaign/arcDelete', arcId: arc.id }, 'Arco excluído.'); if (r.ok) onClose(); return r; }}>
              <Trash2 size={14} />
            </ConfirmButton>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!title.trim()} onClick={() => void save()}>Salvar</button>
        </>
      }>
      <form className="col gap-lg" onSubmit={(e) => { e.preventDefault(); if (title.trim()) void save(); }}>
        {!arc && <p className="camp-hint camp-modal-hint">Um arco é um capítulo da campanha. Depois de criá-lo, planeje as sessões dentro dele.</p>}
        <label className="field">
          <span className="label">Nome</span>
          <input className="input" autoFocus value={title} maxLength={LIMITS.campaignTitle} placeholder="Ex.: Ato I — A Cidade que Não Dorme" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="field">
          <span className="label">Situação</span>
          <div className="camp-status" role="radiogroup" aria-label="Situação do arco">
            {(Object.keys(ARC_STATUS) as ArcStatus[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={status === k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>
                <span className={`arc-dot arc-${k}`} />{ARC_STATUS[k]}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="label">Resumo</span>
          <AutoTextarea value={summary} maxLength={LIMITS.campaignText} minRows={3} placeholder="Do que trata, como começa, como pode terminar."
            onChange={(e) => setSummary(e.target.value)} />
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
