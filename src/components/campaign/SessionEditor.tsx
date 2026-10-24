import { useState } from 'react';
import {
  CalendarDays, CheckCheck, ClipboardList, Eye, Flag, KeyRound, ListChecks, Milestone, NotebookPen, ScrollText, Sparkles, Target,
  Trash2, UserCheck, Users, VenetianMask, X,
} from 'lucide-react';
import type { CampaignSession, CampaignSessionData, SessionCastRef, TableState } from '../../model/types';
import { THREAT_CATEGORIES } from '../../model/types';
import { todayIso } from '../../model/campaign';
import { LIMITS } from '../../rules/validate';
import { hostStore } from '../../net/host';
import { useAct } from '../act';
import ConfirmButton from '../common/ConfirmButton';
import { SubTabs } from '../room/TopBar';
import { ThreatGlyph } from '../gm/ThreatIcon';
import { AutoTextarea, CheckList, SaveBadge, Section, tmpId, useAutosave } from './parts';

type Phase = 'plano' | 'conclusao';

const dataOf = (s: CampaignSession): CampaignSessionData => ({
  number: s.number, title: s.title, date: s.date, arcId: s.arcId, status: s.status, plan: s.plan, report: s.report,
});

/**
 * Uma sessão da campanha. "Planejamento" é o preparo de antes; "Conclusão" é o que se
 * anota durante o jogo (presença, rascunho, segredos revelados) e depois (resumo, ganchos).
 * Tudo salva sozinho.
 */
export default function SessionEditor({ table, session, onDeleted }: {
  table: TableState; session: CampaignSession; onDeleted: () => void;
}) {
  const { act } = useAct();
  const [d, setD] = useState<CampaignSessionData>(() => dataOf(session));
  const [phase, setPhase] = useState<Phase>(session.status === 'jogada' ? 'conclusao' : 'plano');
  const id = session.id;

  const save = useAutosave(d, async (v) => {
    // Sessão apagada enquanto havia algo por salvar: não há o que gravar.
    if (!hostStore.get().table?.campaign.sessions[id]) return true;
    return (await act({ type: 'campaign/sessionUpsert', sessionId: id, data: v })).ok;
  });

  const up = (p: Partial<CampaignSessionData>) => setD((x) => ({ ...x, ...p }));
  const upPlan = (p: Partial<CampaignSessionData['plan']>) => setD((x) => ({ ...x, plan: { ...x.plan, ...p } }));
  const upReport = (p: Partial<CampaignSessionData['report']>) => setD((x) => ({ ...x, report: { ...x.report, ...p } }));
  const markPlayed = () => up({ status: 'jogada', date: d.date || todayIso() });

  const arcs = table.campaign.arcs;
  const secrets = d.plan.secrets;
  const revealed = secrets.filter((x) => x.done).length;

  return (
    <div className="camp-session">
      <header className="camp-sess-head">
        <div className="camp-sess-top">
          <span className="camp-eyebrow">Sessão {session.number}</span>
          <span className="spacer" />
          <SaveBadge state={save} />
          <ConfirmButton className="btn btn-sm btn-ghost btn-icon" title="Excluir sessão" modalTitle="Excluir sessão" confirmLabel="Excluir sessão"
            message={<><p>Excluir a <strong>sessão {session.number}</strong>{d.title ? <> ({d.title})</> : null}, com o planejamento e a conclusão?</p><p className="small muted mt">Não dá para desfazer.</p></>}
            onConfirm={async () => {
              const r = await act({ type: 'campaign/sessionDelete', sessionId: id }, 'Sessão excluída.');
              if (r.ok) onDeleted();
              return r;
            }}><Trash2 size={14} /></ConfirmButton>
        </div>
        <input className="camp-title-input" value={d.title} maxLength={LIMITS.campaignTitle} placeholder={`Sessão ${session.number}: dê um título`}
          onChange={(e) => up({ title: e.target.value })} aria-label="Título da sessão" />
        <div className="camp-sess-meta">
          <label className="camp-pill-field" title="Data da sessão">
            <CalendarDays size={14} />
            <input type="date" value={d.date} onChange={(e) => up({ date: e.target.value })} aria-label="Data" />
          </label>
          <label className="camp-pill-field" title="Arco da campanha">
            <Milestone size={14} />
            <select value={d.arcId ?? ''} onChange={(e) => up({ arcId: e.target.value || null })} aria-label="Arco">
              <option value="">Sem arco</option>
              {arcs.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </label>
          <div className="camp-status" role="radiogroup" aria-label="Situação">
            <button role="radio" aria-checked={d.status === 'planejada'} className={d.status === 'planejada' ? 'on' : ''}
              onClick={() => up({ status: 'planejada' })}>Planejada</button>
            <button role="radio" aria-checked={d.status === 'jogada'} className={d.status === 'jogada' ? 'on' : ''}
              onClick={markPlayed}>Jogada</button>
          </div>
        </div>
      </header>

      <SubTabs<Phase> label="Etapa da sessão" value={phase} onChange={setPhase} tabs={[
        { id: 'plano', label: 'Planejamento', short: 'Antes', icon: <ClipboardList size={14} /> },
        { id: 'conclusao', label: 'Conclusão', short: 'Durante e depois', icon: <NotebookPen size={14} /> },
      ]} />

      {phase === 'plano' ? (
        <div className="camp-cols">
          <div className="camp-col">
            <Section icon={<Target size={15} />} title="Objetivo" hint="Em uma frase: o que esta sessão precisa entregar.">
              <input className="input" value={d.plan.goal} maxLength={LIMITS.campaignLine} placeholder="Ex.: os personagens descobrem quem mandou matar o padre"
                onChange={(e) => upPlan({ goal: e.target.value })} />
            </Section>
            <Section icon={<Flag size={15} />} title="Abertura" hint="A primeira cena: comece perto da ação.">
              <AutoTextarea value={d.plan.opening} maxLength={LIMITS.campaignText} minRows={2} placeholder="Onde estão, o que acontece logo de cara?"
                onChange={(e) => upPlan({ opening: e.target.value })} />
            </Section>
            <Section icon={<ScrollText size={15} />} title="Roteiro e cenas" hint="Cenas possíveis, em tópicos. Não precisa seguir uma ordem.">
              <AutoTextarea value={d.plan.outline} maxLength={LIMITS.campaignText} minRows={6}
                placeholder={'- Interrogatório na delegacia\n- Perseguição pelo mercado\n- O culto se reúne à meia-noite'}
                onChange={(e) => upPlan({ outline: e.target.value })} />
            </Section>
          </div>
          <div className="camp-col">
            <Section icon={<KeyRound size={15} />} title="Segredos e pistas" hint="O que os jogadores podem descobrir. Marque quando for revelado."
              aside={secrets.length > 0 && <span className="camp-count">{revealed}/{secrets.length}</span>}>
              <CheckList items={secrets} onChange={(secrets) => upPlan({ secrets })} placeholder="Novo segredo ou pista" doneLabel="revelado" />
            </Section>
            <Section icon={<VenetianMask size={15} />} title="NPCs e ameaças" hint="Quem pode aparecer, direto das abas de NPCs e Ameaças.">
              <CastPicker table={table} cast={d.plan.cast} onChange={(cast) => upPlan({ cast })} />
            </Section>
            <Section icon={<ListChecks size={15} />} title="Preparativos" hint="O que deixar pronto antes de jogar.">
              <CheckList items={d.plan.prep} onChange={(prep) => upPlan({ prep })} placeholder="Ex.: imprimir o mapa da mansão" doneLabel="pronto" />
            </Section>
          </div>
        </div>
      ) : (
        <>
          {d.status === 'planejada' && (
            <div className="camp-banner">
              <span className="grow">Esta sessão ainda está marcada como <strong>planejada</strong>.</span>
              <button className="btn btn-sm btn-primary" onClick={markPlayed}><CheckCheck size={14} /> Marcar como jogada</button>
            </div>
          )}
          <div className="camp-cols">
            <div className="camp-col">
              <div className="camp-col-label">Durante</div>
              <Section icon={<UserCheck size={15} />} title="Presentes" aside={<span className="camp-count">{d.report.attendees.length}</span>}>
                <Attendance table={table} value={d.report.attendees} onChange={(attendees) => upReport({ attendees })} />
                <input className="input mt" value={d.report.guests} maxLength={LIMITS.campaignLine} placeholder="Outros presentes (convidados...)"
                  onChange={(e) => upReport({ guests: e.target.value })} />
              </Section>
              <Section icon={<NotebookPen size={15} />} title="Anotações da mesa" hint="Rascunho rápido: nomes improvisados, decisões, rolagens marcantes.">
                <AutoTextarea value={d.report.live} maxLength={LIMITS.campaignText} minRows={5} onChange={(e) => upReport({ live: e.target.value })} />
              </Section>
              <Section icon={<Eye size={15} />} title="Segredos revelados"
                aside={secrets.length > 0 && <span className="camp-count">{revealed}/{secrets.length}</span>}>
                {secrets.length === 0
                  ? <p className="camp-hint">Nenhum segredo no planejamento.</p>
                  : <CheckList items={secrets} onChange={(secrets) => upPlan({ secrets })} placeholder="Pista que surgiu no jogo" doneLabel="revelado" />}
              </Section>
            </div>
            <div className="camp-col">
              <div className="camp-col-label">Depois</div>
              <Section icon={<ScrollText size={15} />} title="Resumo" hint="O que aconteceu. É o que você vai reler antes da próxima sessão.">
                <AutoTextarea value={d.report.recap} maxLength={LIMITS.campaignText} minRows={6} onChange={(e) => upReport({ recap: e.target.value })} />
              </Section>
              <Section icon={<Sparkles size={15} />} title="Ganchos e consequências" hint="O que ficou em aberto, uma ideia por linha."
                aside={<HooksToThreads table={table} hooks={d.report.hooks} />}>
                <AutoTextarea value={d.report.hooks} maxLength={LIMITS.campaignText} minRows={4}
                  placeholder={'O delegado agora desconfia do grupo\nA chave do porão sumiu'}
                  onChange={(e) => upReport({ hooks: e.target.value })} />
              </Section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Presença: um toque por jogador da mesa. */
function Attendance({ table, value, onChange }: {
  table: TableState; value: CampaignSessionData['report']['attendees']; onChange: (v: CampaignSessionData['report']['attendees']) => void;
}) {
  const players = Object.values(table.players).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const has = (pid: string) => value.some((x) => x.id === pid);
  // Quem saiu da mesa continua na lista da sessão em que esteve.
  const gone = value.filter((x) => !table.players[x.id]);
  if (!players.length && !gone.length) return <p className="camp-hint">Nenhum jogador na mesa ainda.</p>;
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="camp-people">
        {players.map((p) => (
          <button key={p.id} type="button" className={`camp-person${has(p.id) ? ' on' : ''}`} aria-pressed={has(p.id)}
            onClick={() => onChange(has(p.id) ? value.filter((x) => x.id !== p.id) : [...value, { id: p.id, name: p.name }])}>
            {has(p.id) ? <UserCheck size={13} /> : <Users size={13} />}{p.name}
          </button>
        ))}
        {gone.map((x) => (
          <button key={x.id} type="button" className="camp-person on gone" title="Saiu da mesa. Toque para tirar da lista."
            onClick={() => onChange(value.filter((y) => y.id !== x.id))}>
            <UserCheck size={13} />{x.name}
          </button>
        ))}
      </div>
      {players.length > 1 && (
        <div className="row">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange([...gone, ...players.map((p) => ({ id: p.id, name: p.name }))])}>Todos</button>
          {value.length > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange([])}>Ninguém</button>}
        </div>
      )}
    </div>
  );
}

/** Elenco da sessão: NPCs e ameaças já criados na mesa. */
function CastPicker({ table, cast, onChange }: { table: TableState; cast: SessionCastRef[]; onChange: (c: SessionCastRef[]) => void }) {
  const npcs = Object.values(table.characters).filter((c) => c.kind === 'npc').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const threats = Object.values(table.threats).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const inCast = (kind: SessionCastRef['kind'], id: string) => cast.some((x) => x.kind === kind && x.id === id);
  const shown = cast.flatMap((x) => {
    if (x.kind === 'npc') {
      const c = table.characters[x.id];
      return c ? [{ ...x, name: c.name, icon: <VenetianMask size={13} /> }] : [];
    }
    const t = table.threats[x.id];
    return t ? [{ ...x, name: t.name, icon: <span className={`pick-cat threat-cat-${t.category}`}><ThreatGlyph category={t.category} size={13} /></span> }] : [];
  });
  const freeNpcs = npcs.filter((c) => !inCast('npc', c.id));
  const freeThreats = threats.filter((t) => !inCast('threat', t.id));
  return (
    <div className="col" style={{ gap: 8 }}>
      {shown.length > 0 && (
        <div className="camp-people">
          {shown.map((x) => (
            <span key={`${x.kind}:${x.id}`} className="camp-cast">
              {x.icon}{x.name}
              <button type="button" aria-label={`Tirar ${x.name}`} onClick={() => onChange(cast.filter((y) => !(y.kind === x.kind && y.id === x.id)))}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      {freeNpcs.length + freeThreats.length > 0 ? (
        <select className="select camp-add-select" value="" aria-label="Adicionar NPC ou ameaça"
          onChange={(e) => {
            const [kind, id] = e.target.value.split(':') as [SessionCastRef['kind'], string];
            if (id) onChange([...cast, { kind, id }]);
          }}>
          <option value="">+ Adicionar NPC ou ameaça</option>
          {freeNpcs.length > 0 && <optgroup label="NPCs">{freeNpcs.map((c) => <option key={c.id} value={`npc:${c.id}`}>{c.name}</option>)}</optgroup>}
          {freeThreats.length > 0 && (
            <optgroup label="Ameaças">
              {freeThreats.map((t) => <option key={t.id} value={`threat:${t.id}`}>{t.name} ({THREAT_CATEGORIES[t.category]?.label})</option>)}
            </optgroup>
          )}
        </select>
      ) : shown.length === 0 && <p className="camp-hint">Crie NPCs e ameaças nas abas deles para escalá-los aqui.</p>}
    </div>
  );
}

/** Cada linha dos ganchos vira um fio solto da campanha (sem repetir os que já existem). */
function HooksToThreads({ table, hooks }: { table: TableState; hooks: string }) {
  const { act } = useAct();
  const existing = new Set(table.campaign.threads.map((x) => x.text.trim().toLowerCase()));
  const lines = hooks.split('\n').map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter((l) => l && !existing.has(l.toLowerCase()));
  if (!lines.length) return null;
  return (
    <button className="btn btn-sm btn-ghost" title="Copiar cada linha para os fios soltos da visão geral"
      onClick={() => void act({
        type: 'campaign/update',
        data: { threads: [...table.campaign.threads, ...lines.map((text) => ({ id: tmpId(), text: text.slice(0, LIMITS.campaignLine), done: false }))].slice(0, 80) },
      }, lines.length > 1 ? `${lines.length} fios soltos adicionados.` : 'Fio solto adicionado.')}>
      → Fios soltos
    </button>
  );
}
