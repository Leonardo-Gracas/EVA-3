import { useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, CheckCircle2, UploadCloud, Eye, EyeOff, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import type { InvestigationCase, TableState } from '../../model/types';
import { caseChanges, publishedCase, type CaseChanges } from '../../model/cases';
import { LIMITS } from '../../rules/validate';
import { hostStore } from '../../net/host';
import { useAct } from '../act';
import ConfirmButton from '../common/ConfirmButton';
import Modal from '../common/Modal';
import ClueBoard from './ClueBoard';

interface CaseDraft { id?: string; title: string; description: string }

/** Aba Investigação do mestre: casos e o mural de cada um. */
export default function CasesPanel({ table }: { table: TableState }) {
  const { act } = useAct();
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<CaseDraft | null>(null);
  /** Mostra a versão que os jogadores têm, no lugar do rascunho. */
  const [preview, setPreview] = useState(false);
  const all = useMemo(() => Object.values(table.cases).sort((a, b) => a.createdAt - b.createdAt), [table.cases]);
  const list = all.filter((k) => k.archived === showArchived);
  const archivedCount = all.filter((k) => k.archived).length;
  const current = selected ? table.cases[selected] : undefined;

  // Caso excluído, arquivado ou fora do filtro: abre o primeiro da lista.
  useEffect(() => {
    const want = current && current.archived === showArchived ? current.id : list[0]?.id ?? null;
    if (want !== selected) setSelected(want);
  }, [current, showArchived, list, selected]);

  // A prévia vale para o caso aberto; trocar de caso volta a editar.
  useEffect(() => { setPreview(false); }, [selected]);

  const changes = current ? caseChanges(current) : null;
  const publish = async () => {
    if (!current) return;
    const first = !current.visible;
    const r = await act({ type: 'case/publish', caseId: current.id }, first ? 'Caso publicado para os jogadores.' : 'Alterações publicadas.');
    if (r.ok) setPreview(false);
  };

  const save = async (d: CaseDraft) => {
    const r = await act({ type: 'case/upsert', caseId: d.id, title: d.title, description: d.description }, d.id ? 'Caso salvo.' : 'Caso criado.');
    if (r.ok && !d.id) {
      const newest = Object.values(hostStore.get().table?.cases ?? {}).sort((a, b) => b.createdAt - a.createdAt)[0];
      if (newest) { setShowArchived(false); setSelected(newest.id); }
    }
    return r.ok;
  };

  return (
    <div className="col gap-lg">
      <div className="row-wrap">
        {list.map((k) => {
          const pending = k.visible && caseChanges(k).total > 0;
          return (
            <button key={k.id} className={`btn btn-sm${k.id === current?.id ? ' btn-primary' : ''}`} onClick={() => setSelected(k.id)}
              title={!k.visible ? 'Rascunho: os jogadores não veem' : pending ? 'Publicado, com alterações por publicar' : 'Publicado'}>
              {k.visible ? <Eye size={13} /> : <EyeOff size={13} />} {k.title}
              {pending && <span className="case-pending-dot" aria-label="alterações por publicar" />}
            </button>
          );
        })}
        <button className="btn btn-sm" onClick={() => setEditing({ title: '', description: '' })}><Plus size={13} /> Novo caso</button>
        <span className="spacer" />
        {(archivedCount > 0 || showArchived) && (
          <label className="check">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Arquivados ({archivedCount})
          </label>
        )}
      </div>

      {!current ? (
        <div className="empty">
          {showArchived ? 'Nenhum caso arquivado.' : 'Crie um caso para montar o mural da investigação: evidências da cena, fatos apurados e os fios entre eles.'}
        </div>
      ) : (
        <>
          <div className="card card-gold">
            <div className="sheet-head">
              <div className="grow">
                <div className="sheet-title">{current.archived ? 'Caso arquivado' : 'Caso'}</div>
                <h2 className="sheet-name">{current.title}</h2>
                {current.description && <p className="secondary pre" style={{ marginTop: 6 }}>{current.description}</p>}
              </div>
              <div className="row-wrap">
                <button className="btn btn-sm" onClick={() => setEditing({ id: current.id, title: current.title, description: current.description })}>
                  <Pencil size={14} /> Editar
                </button>
                <button className="btn btn-sm"
                  onClick={() => act({ type: 'case/archive', caseId: current.id, archived: !current.archived }, current.archived ? 'Caso reaberto.' : 'Caso arquivado.')}>
                  {current.archived ? <><ArchiveRestore size={14} /> Reabrir</> : <><Archive size={14} /> Arquivar</>}
                </button>
                <ConfirmButton title="Excluir caso" modalTitle="Excluir caso" confirmLabel={`Excluir ${current.title}`}
                  message={<><p>Excluir o caso <strong>{current.title}</strong> com todos os cartões e fios?</p><p className="small muted mt">Não dá para desfazer. Para tirar da frente sem perder, arquive.</p></>}
                  onConfirm={() => act({ type: 'case/delete', caseId: current.id }, 'Caso excluído.')}>
                  <Trash2 size={14} />
                </ConfirmButton>
              </div>
            </div>
            {changes && <PublishBar kase={current} changes={changes} preview={preview} onPreview={setPreview} onPublish={() => void publish()}
              onUnpublish={() => void act({ type: 'case/unpublish', caseId: current.id }, 'Caso retirado dos jogadores.')} />}
          </div>
          {preview && current.published ? (
            <>
              <div className="case-preview-banner">
                <Eye size={14} /> Você está vendo o que os jogadores veem (publicado às {fmtTime(current.published.publishedAt)}).
                <span className="spacer" />
                <button className="btn btn-sm" onClick={() => setPreview(false)}><Pencil size={13} /> Voltar a editar</button>
              </div>
              <ClueBoard key={`${current.id}-jogador`} kase={publishedCase(current)} />
            </>
          ) : (
            <ClueBoard kase={current} editable
              publish={current.archived ? undefined : { pending: changes?.total ?? 0, first: !current.visible, run: publish }} />
          )}
        </>
      )}

      {editing && <CaseEditor initial={editing} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}

const fmtTime = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 cartões novos, 1 alterado e 1 fio" — o que os jogadores vão ver de diferente. */
function describeChanges(c: CaseChanges): string {
  const parts = [
    c.added.length && plural(c.added.length, 'cartão novo', 'cartões novos'),
    c.removed.length && plural(c.removed.length, 'removido', 'removidos'),
    c.changed && plural(c.changed, 'alterado ou movido', 'alterados ou movidos'),
    c.links && plural(c.links, 'fio', 'fios'),
    c.info && 'título ou resumo',
  ].filter(Boolean) as string[];
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/** Estado da publicação: rascunho, publicado em dia, ou publicado com alterações por enviar. */
function PublishBar({ kase, changes, preview, onPreview, onPublish, onUnpublish }: {
  kase: InvestigationCase;
  changes: CaseChanges;
  preview: boolean;
  onPreview: (v: boolean) => void;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  if (kase.archived) {
    return <div className="case-publish"><Archive size={15} /><span className="grow small">Caso arquivado: os jogadores não o veem.</span></div>;
  }
  const previewBtn = kase.published && (
    <button className={`btn btn-sm${preview ? ' btn-primary' : ''}`} onClick={() => onPreview(!preview)} title="Ver o mural como os jogadores recebem">
      <Eye size={13} /> Ver como jogador
    </button>
  );
  if (!kase.visible) {
    return (
      <div className="case-publish case-publish-draft">
        <EyeOff size={15} />
        <span className="grow small">
          <strong>Rascunho.</strong> Os jogadores não veem este caso. Monte o mural com calma e publique quando estiver pronto.
        </span>
        {previewBtn}
        <button className="btn btn-sm btn-primary" onClick={onPublish} title="Publicar (Ctrl+S)"><Send size={13} /> Publicar para os jogadores</button>
      </div>
    );
  }
  const at = fmtTime(kase.published!.publishedAt);
  return (
    <div className={`case-publish${changes.total ? ' case-publish-pending' : ' case-publish-ok'}`}>
      {changes.total ? <UploadCloud size={15} /> : <CheckCircle2 size={15} />}
      <span className="grow small">
        {changes.total
          ? <><strong>Alterações por publicar:</strong> {describeChanges(changes)}. Os jogadores ainda veem a versão das {at}.</>
          : <>Os jogadores veem a versão atual, publicada às {at}.</>}
      </span>
      {previewBtn}
      <button className="btn btn-sm btn-ghost" onClick={onUnpublish} title="Tirar o caso da tela dos jogadores">Retirar dos jogadores</button>
      {changes.total > 0 && <button className="btn btn-sm btn-primary" onClick={onPublish} title="Publicar (Ctrl+S)"><Send size={13} /> Publicar alterações</button>}
    </div>
  );
}

function CaseEditor({ initial, onSave, onClose }: { initial: CaseDraft; onSave: (d: CaseDraft) => Promise<boolean>; onClose: () => void }) {
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await onSave({ ...d, title: d.title.trim(), description: d.description.trim() });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal open width={520} title={initial.id ? 'Editar caso' : 'Novo caso'} onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy || !d.title.trim()} onClick={() => void save()}>Salvar</button>
        </>
      }>
      <div className="col">
        <div className="field">
          <label className="label" htmlFor="case-title">Título</label>
          <input id="case-title" className="input" autoFocus maxLength={LIMITS.caseTitle} value={d.title} placeholder="Assassinato na mansão Albuquerque"
            onChange={(e) => setD({ ...d, title: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && d.title.trim()) void save(); }} />
        </div>
        <div className="field">
          <label className="label" htmlFor="case-desc">Resumo</label>
          <textarea id="case-desc" className="textarea" maxLength={LIMITS.caseText} value={d.description}
            placeholder="O que os jogadores sabem do caso: a vítima, a cena, a pergunta a responder."
            onChange={(e) => setD({ ...d, description: e.target.value })} />
        </div>
        {!initial.id && <p className="tiny muted">O caso nasce como rascunho. Os jogadores só o veem depois que você publicar, e cada alteração também espera a próxima publicação.</p>}
      </div>
    </Modal>
  );
}
