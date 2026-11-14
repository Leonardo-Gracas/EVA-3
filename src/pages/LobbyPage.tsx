import { useEffect, useState } from 'react';
import { Archive, Crown, Download, LogIn, Pencil, Play, Trash2, Upload, Users } from 'lucide-react';
import {
  backupContents, deleteTable, downloadAllTables, downloadTable, listTables, loadTable, pickFile, readBackup, restoreBackup, saveTable,
  type Backup, type BackupContents, type TableSummary,
} from '../store/persistence';
import { newTable } from '../store/engine';
import { placeholderTable } from '../store/placeholder';
import { isValidCode, newRoomCode, normalizeCode } from '../net/config';
import { lastJoinCode } from '../net/identity';
import { LIMITS } from '../rules/validate';
import type { TableState } from '../model/types';
import { toast } from '../components/common/toast';
import ConfirmButton from '../components/common/ConfirmButton';
import Modal from '../components/common/Modal';

export default function LobbyPage({ userName, onEditName, onHost, onJoin }: {
  userName: string;
  onEditName: () => void;
  onHost: (t: TableState) => void;
  onJoin: (code: string) => void;
}) {
  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const [tableName, setTableName] = useState('');
  const [withDefaults, setWithDefaults] = useState(false);
  const [code, setCode] = useState(lastJoinCode());
  const [pending, setPending] = useState<Backup | null>(null);

  const refresh = () => listTables().then(setTables).catch(() => setTables([]));
  useEffect(() => { void refresh(); }, []);

  const create = async () => {
    const t = (withDefaults ? placeholderTable : newTable)(tableName || 'Nova mesa', userName, newRoomCode());
    await saveTable(t);
    onHost(t);
  };

  const resume = async (id: string) => {
    const t = await loadTable(id);
    if (!t) { toast('Mesa não encontrada.', 'error'); return; }
    onHost({ ...t, gmName: userName });
  };

  const importFile = async () => {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    try {
      setPending(await readBackup(f));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const restore = async (asCopy: boolean) => {
    if (!pending) return;
    try {
      const existing = new Set((await listTables()).map((x) => x.id));
      const r = await restoreBackup(pending, existing, asCopy, newRoomCode);
      const what = r.tables.length === 1 ? `Mesa "${r.tables[0].name}" restaurada` : `${r.tables.length} mesas restauradas`;
      toast(`${what}${r.playlists ? ` e ${r.playlists} playlist${r.playlists === 1 ? '' : 's'}` : ''}.`, 'ok');
      setPending(null);
    } catch (e) {
      toast(`Não deu para importar: ${(e as Error).message}`, 'error');
    }
    void refresh();
  };

  const exportAll = async () => {
    try {
      const n = await downloadAllTables();
      if (!n) toast('Nenhuma mesa salva neste navegador.', 'error');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const exportOne = async (id: string) => {
    const t = await loadTable(id);
    if (t) downloadTable(t);
  };

  const join = () => {
    const c = normalizeCode(code);
    if (!isValidCode(c)) { toast('Código inválido. São 6 caracteres.', 'error'); return; }
    onJoin(c);
  };

  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <div className="hero">
        <h1>EVA 3</h1>
        <p className="row" style={{ justifyContent: 'center' }}>
          Olá, <strong>{userName}</strong>
          <button className="btn btn-ghost btn-sm" onClick={onEditName} title="Trocar nome"><Pencil size={13} /></button>
        </p>
      </div>

      <div className="grid-2">
        <form className="card card-gold col gap-lg" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <div className="card-title" style={{ margin: 0 }}><Crown size={15} /> Criar mesa</div>
          <p className="small secondary">Você será o mestre. Seu navegador guarda a mesa e é o centro da conexão.</p>
          <div className="field">
            <label className="label">Nome da mesa</label>
            <input className="input" value={tableName} maxLength={LIMITS.tableName} placeholder="Ex.: O Nome Deles é Legião" onChange={(e) => setTableName(e.target.value)} />
          </div>
          <label className="check" title="A biblioteca de itens e o painel de ameaças já começam preenchidos; dá para editar ou apagar depois">
            <input type="checkbox" checked={withDefaults} onChange={(e) => setWithDefaults(e.target.checked)} />
            Começar com itens e ameaças padrão
          </label>
          <button className="btn btn-primary btn-lg">Criar e abrir sala</button>
        </form>

        <form className="card col gap-lg" onSubmit={(e) => { e.preventDefault(); join(); }}>
          <div className="card-title" style={{ margin: 0 }}><Users size={15} /> Entrar em uma mesa</div>
          <p className="small secondary">Peça o código de 6 caracteres ao mestre.</p>
          <div className="field">
            <label className="label">Código da sala</label>
            <input className="input input-code" value={code} maxLength={8} placeholder="ABC123" onChange={(e) => setCode(normalizeCode(e.target.value))} />
          </div>
          <button className="btn btn-lg" disabled={code.length !== 6}><LogIn size={16} /> Entrar</button>
        </form>
      </div>

      <div className="card mt">
        <div className="row-wrap mb">
          <div className="card-title" style={{ margin: 0 }}>Minhas mesas (mestre)</div>
          <div className="spacer" />
          {!!tables?.length && <button className="btn btn-sm" onClick={exportAll} title="Todas as mesas e as playlists num arquivo só"><Archive size={14} /> Backup de tudo</button>}
          <button className="btn btn-sm" onClick={importFile}><Upload size={14} /> Importar backup</button>
        </div>
        {tables === null ? <div className="muted small">Carregando…</div> : tables.length === 0 ? (
          <div className="empty">Nenhuma mesa salva neste navegador.</div>
        ) : (
          <div>
            {tables.map((t) => (
              <div key={t.id} className="inv-row">
                <div className="grow">
                  <strong>{t.name}</strong>
                  <div className="tiny muted">
                    Código {t.roomCode} · {t.players} jogador{t.players === 1 ? '' : 'es'} · {t.characters} ficha{t.characters === 1 ? '' : 's'} · {new Date(t.updatedAt).toLocaleString('pt-BR')}
                  </div>
                </div>
                <button className="btn btn-sm btn-primary" onClick={() => resume(t.id)}><Play size={13} /> Abrir</button>
                <button className="btn btn-sm btn-ghost" onClick={() => exportOne(t.id)} title="Exportar backup"><Download size={13} /></button>
                <ConfirmButton className="btn btn-sm btn-ghost" title="Excluir mesa" modalTitle="Excluir mesa" confirmLabel={`Excluir ${t.name}`}
                  message={<><p>Excluir a mesa <strong>{t.name}</strong>?</p><p className="small muted mt">Fichas, ameaças, itens e registro desta mesa serão apagados deste navegador. Exporte o backup antes se quiser guardar. Não dá para desfazer.</p></>}
                  onConfirm={async () => { await deleteTable(t.id); void refresh(); }}><Trash2 size={13} /></ConfirmButton>
              </div>
            ))}
          </div>
        )}
        <p className="tiny muted mt">
          As mesas ficam salvas só neste navegador. Exporte o backup (.json) com frequência para não perder nada: ele leva tudo da mesa
          (jogadores, fichas, NPCs, ameaças, itens, mapas, combate, casos, campanha e registro), as playlists e o código da sala.
          Guarde o arquivo com cuidado: quem tiver ele pode abrir a mesa com o mesmo código.
        </p>
      </div>
      {pending && <ImportModal backup={pending} existing={new Set(tables?.map((t) => t.id) ?? [])} onClose={() => setPending(null)} onImport={restore} />}
    </div>
  );
}

function contentsLine(c: BackupContents): string {
  const n = (v: number, one: string, many: string) => (v ? `${v} ${v === 1 ? one : many}` : null);
  return [
    n(c.players, 'jogador', 'jogadores'),
    n(c.pcs, 'ficha', 'fichas'),
    n(c.npcs, 'NPC', 'NPCs'),
    n(c.threats, 'ameaça', 'ameaças'),
    n(c.items, 'item', 'itens'),
    n(c.maps, 'mapa', 'mapas'),
    c.combat ? 'combate em andamento' : null,
    n(c.cases, 'caso', 'casos'),
    n(c.sessions, 'sessão', 'sessões'),
    n(c.logEntries, 'registro', 'registros'),
  ].filter(Boolean).join(' · ') || 'mesa vazia';
}

/** Mostra o que vem no backup antes de gravar; se alguma mesa já existe, o mestre escolhe substituir ou manter as duas. */
function ImportModal({ backup, existing, onClose, onImport }: {
  backup: Backup;
  existing: Set<string>;
  onClose: () => void;
  onImport: (asCopy: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const clashes = backup.tables.filter((e) => existing.has(e.table.id)).length;
  const go = async (asCopy: boolean) => { setBusy(true); await onImport(asCopy); setBusy(false); };
  return (
    <Modal open onClose={onClose} title="Importar backup" width={560}
      footer={(
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
          {clashes > 0 && <button className="btn" onClick={() => go(true)} disabled={busy} title="As mesas atuais ficam como estão; as do backup entram como cópias, com outro código">Manter as duas</button>}
          <button className={`btn ${clashes ? 'btn-danger' : 'btn-primary'}`} onClick={() => go(false)} disabled={busy}>{clashes ? 'Substituir' : 'Importar'}</button>
        </>
      )}>
      <div className="col">
        {backup.exportedAt && <p className="small muted">Backup de {new Date(backup.exportedAt).toLocaleString('pt-BR')}.</p>}
        {backup.tables.map(({ table, hostKey }) => (
          <div key={table.id} className="inv-row">
            <div className="grow">
              <strong>{table.name}</strong>
              {existing.has(table.id) && <span className="tiny" style={{ color: 'var(--error)' }}> · já existe neste navegador</span>}
              <div className="tiny muted">{contentsLine(backupContents(table))}</div>
              <div className="tiny muted">Código {table.roomCode}{hostKey ? ' (mantido)' : ' (pode mudar ao abrir a sala)'}</div>
            </div>
          </div>
        ))}
        {backup.playlists.length > 0 && (
          <p className="small secondary">{backup.playlists.length} playlist{backup.playlists.length === 1 ? '' : 's'} de música (só as que ainda não existem aqui serão adicionadas).</p>
        )}
        {clashes > 0 && (
          <p className="small secondary">
            {clashes === 1 ? 'Uma mesa' : `${clashes} mesas`} do backup já {clashes === 1 ? 'existe' : 'existem'} aqui. <strong>Substituir</strong> troca
            a versão deste navegador pela do arquivo (não dá para desfazer). <strong>Manter as duas</strong> importa como cópia, com outro código de sala.
          </p>
        )}
      </div>
    </Modal>
  );
}
