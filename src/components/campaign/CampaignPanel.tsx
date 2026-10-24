import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, BookMarked, CalendarDays, ChevronDown, ChevronUp, Compass, History, Milestone, NotebookText, Plus, Spline, Trash2,
} from 'lucide-react';
import { ARC_STATUS, type ArcStatus, type CampaignArc, type CampaignInfo, type CampaignSession, type TableState } from '../../model/types';
import { emptySessionData, formatSessionDate, nextSession, sessionLabel, sessionsInOrder } from '../../model/campaign';
import { LIMITS } from '../../rules/validate';
import { useAct } from '../act';
import ConfirmButton from '../common/ConfirmButton';
import Modal from '../common/Modal';
import { AutoTextarea, CheckList, SaveBadge, Section, useAutosave } from './parts';
import SessionEditor from './SessionEditor';

/** 'geral' = visão geral; senão, o id da sessão aberta. */
type View = 'geral' | string;

/**
 * Caderno de campanha do mestre. À esquerda, a visão geral e as sessões (agrupadas por arco);
 * à direita, o que estiver aberto. No celular, uma tela de cada vez.
 */
export default function CampaignPanel({ table, detailOpen, setDetailOpen }: {
  table: TableState; detailOpen: boolean; setDetailOpen: (open: boolean) => void;
}) {
  const { act } = useAct();
  const [view, setView] = useState<View>('geral');
  const camp = table.campaign;
  const sessions = useMemo(() => sessionsInOrder(camp), [camp]);
  const session = view !== 'geral' ? camp.sessions[view] : undefined;

  // Sessão apagada: volta à visão geral.
  useEffect(() => { if (view !== 'geral' && !session) setView('geral'); }, [view, session]);

  const open = (v: View) => { setView(v); setDetailOpen(true); window.scrollTo({ top: 0 }); };
  const back = () => { setDetailOpen(false); window.scrollTo({ top: 0 }); };

  const newSession = async () => {
    // Nasce no arco em andamento (ou no último), que é o mais provável.
    const arc = [...camp.arcs].reverse().find((a) => a.status === 'andamento') ?? camp.arcs[camp.arcs.length - 1];
    const r = await act({ type: 'campaign/sessionUpsert', data: emptySessionData(0, arc?.id ?? null) }, 'Sessão criada.');
    if (r.ok && r.id) open(r.id);
  };

  // Sessões agrupadas por arco, na ordem dos arcos; as sem arco no fim.
  const groups = useMemo(() => {
    if (!camp.arcs.length) return [{ arc: null as CampaignArc | null, items: sessions }];
    const out = camp.arcs.map((arc) => ({ arc: arc as CampaignArc | null, items: sessions.filter((s) => s.arcId === arc.id) }));
    const loose = sessions.filter((s) => !s.arcId || !camp.arcs.some((a) => a.id === s.arcId));
    if (loose.length) out.push({ arc: null, items: loose });
    return out.filter((g) => g.items.length > 0);
  }, [camp.arcs, sessions]);
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
          <span>Sessões</span>
          {sessions.length > 0 && <span className="subtab-total">{sessions.length}</span>}
          <span className="spacer" />
          <button className="btn btn-sm btn-primary" onClick={() => void newSession()}><Plus size={13} /> Sessão</button>
        </div>

        {sessions.length === 0 && <div className="camp-nav-empty">Crie a primeira sessão para começar a planejar.</div>}
        {groups.map((g) => (
          <div key={g.arc?.id ?? 'sem-arco'} className="camp-nav-group">
            {camp.arcs.length > 0 && (
              <div className="camp-nav-arc">
                <span className={`arc-dot arc-${g.arc?.status ?? 'none'}`} />
                {g.arc ? g.arc.title : 'Sem arco'}
              </div>
            )}
            {g.items.map((s) => (
              <SessionNavRow key={s.id} s={s} on={view === s.id} isNext={next?.id === s.id} onClick={() => open(s.id)} />
            ))}
          </div>
        ))}
      </nav>

      <div className="split-detail">
        <button className="btn btn-sm btn-ghost split-back" onClick={back}><ArrowLeft size={14} /> Campanha</button>
        {session
          ? <SessionEditor key={session.id} table={table} session={session} onDeleted={() => setView('geral')} />
          : <Overview table={table} onOpen={open} onNewSession={() => void newSession()} />}
      </div>
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

function Overview({ table, onOpen, onNewSession }: { table: TableState; onOpen: (id: string) => void; onNewSession: () => void }) {
  const { act } = useAct();
  const camp = table.campaign;
  const [info, setInfo] = useState<CampaignInfo>(() => ({ title: camp.title, premise: camp.premise, notes: camp.notes, threads: camp.threads }));
  const save = useAutosave(info, async (v) => (await act({ type: 'campaign/update', data: v })).ok);
  const up = (p: Partial<CampaignInfo>) => setInfo((x) => ({ ...x, ...p }));
  const [editingArc, setEditingArc] = useState<CampaignArc | 'new' | null>(null);

  const sessions = sessionsInOrder(camp);
  const played = sessions.filter((s) => s.status === 'jogada');
  const next = nextSession(camp);
  const last = played[played.length - 1];
  const openThreads = info.threads.filter((x) => !x.done).length;

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
          <div><dt>Jogadas</dt><dd>{played.length}</dd></div>
          <div><dt>Planejadas</dt><dd>{sessions.length - played.length}</dd></div>
          <div><dt>Arcos</dt><dd>{camp.arcs.length}</dd></div>
          <div><dt>Fios soltos</dt><dd>{openThreads}</dd></div>
        </dl>
      </header>

      {sessions.length === 0 ? (
        <div className="camp-start">
          <h3>Como usar</h3>
          <ol>
            <li><strong>Premissa</strong> acima: uma ou duas linhas já bastam.</li>
            <li><strong>Sessão</strong>: crie e preencha o <em>Planejamento</em> — só o objetivo e um roteiro, ou tudo.</li>
            <li><strong>Conclusão</strong>: durante o jogo, marque presença e segredos revelados; depois, escreva o resumo e os ganchos.</li>
            <li>Para campanhas longas, use <strong>arcos</strong> para agrupar sessões e <strong>fios soltos</strong> para não esquecer nada.</li>
          </ol>
          <button className="btn btn-primary" onClick={onNewSession}><Plus size={14} /> Criar a primeira sessão</button>
        </div>
      ) : (
        <div className="camp-spots">
          {next ? (
            <button className="camp-spot" onClick={() => onOpen(next.id)}>
              <span className="camp-spot-label"><CalendarDays size={13} /> Próxima sessão</span>
              <span className="camp-spot-title">#{next.number} · {sessionLabel(next)}</span>
              <span className="camp-spot-sub">{formatSessionDate(next.date) || 'Sem data marcada'}</span>
              {next.plan.goal && <span className="camp-spot-text">{next.plan.goal}</span>}
              <PrepProgress s={next} />
            </button>
          ) : (
            <button className="camp-spot camp-spot-empty" onClick={onNewSession}>
              <span className="camp-spot-label"><CalendarDays size={13} /> Próxima sessão</span>
              <span className="camp-spot-title"><Plus size={15} /> Planejar a próxima</span>
            </button>
          )}
          {last && (
            <button className="camp-spot" onClick={() => onOpen(last.id)}>
              <span className="camp-spot-label"><History size={13} /> Onde paramos</span>
              <span className="camp-spot-title">#{last.number} · {sessionLabel(last)}</span>
              <span className="camp-spot-sub">{formatSessionDate(last.date) || 'Sem data'}</span>
              <span className="camp-spot-text clamp">{last.report.recap || last.report.hooks || 'Sem resumo ainda.'}</span>
            </button>
          )}
        </div>
      )}

      <div className="camp-cols">
        <Section icon={<Milestone size={15} />} title="Arcos" hint="Capítulos da campanha. Cada sessão pode pertencer a um arco."
          aside={<button className="btn btn-sm btn-ghost" onClick={() => setEditingArc('new')}><Plus size={13} /> Arco</button>}>
          {camp.arcs.length === 0
            ? <p className="camp-hint">Nenhum arco. Campanhas curtas vivem bem sem eles.</p>
            : (
              <div className="arc-list">
                {camp.arcs.map((a, i) => {
                  const n = sessions.filter((s) => s.arcId === a.id).length;
                  return (
                    <div key={a.id} className="arc-row">
                      <button className="arc-main" onClick={() => setEditingArc(a)}>
                        <span className={`arc-dot arc-${a.status}`} />
                        <span className="grow">
                          <span className="arc-title">{a.title}</span>
                          <span className="arc-sub">{ARC_STATUS[a.status]} · {n} {n === 1 ? 'sessão' : 'sessões'}</span>
                          {a.summary && <span className="arc-summary">{a.summary}</span>}
                        </span>
                      </button>
                      {camp.arcs.length > 1 && (
                        <span className="arc-move">
                          <button className="btn btn-sm btn-ghost btn-icon" disabled={i === 0} title="Subir"
                            onClick={() => void act({ type: 'campaign/arcMove', arcId: a.id, to: i - 1 })}><ChevronUp size={14} /></button>
                          <button className="btn btn-sm btn-ghost btn-icon" disabled={i === camp.arcs.length - 1} title="Descer"
                            onClick={() => void act({ type: 'campaign/arcMove', arcId: a.id, to: i + 1 })}><ChevronDown size={14} /></button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </Section>

        <Section icon={<Spline size={15} />} title="Fios soltos" hint="Ganchos, mistérios e promessas em aberto. Marque quando resolver."
          aside={info.threads.length > 0 && <span className="camp-count">{openThreads} em aberto</span>}>
          <CheckList items={info.threads} onChange={(threads) => up({ threads })} placeholder="Novo fio solto" doneLabel="resolvido" />
        </Section>
      </div>

      <Section icon={<NotebookText size={15} />} title="Anotações gerais" hint="Mundo, facções, linha do tempo, regras da casa. O que não cabe numa sessão.">
        <AutoTextarea value={info.notes} maxLength={LIMITS.campaignText} minRows={6} onChange={(e) => up({ notes: e.target.value })} aria-label="Anotações gerais" />
      </Section>

      {editingArc && <ArcModal arc={editingArc === 'new' ? null : editingArc} onClose={() => setEditingArc(null)} />}
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
