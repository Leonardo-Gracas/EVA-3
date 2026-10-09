import { useEffect, useState } from 'react';
import { Crown, Download, FlaskConical, LogIn, Pencil, Play, Trash2, Upload, Users } from 'lucide-react';
import { deleteTable, downloadTable, listTables, loadTable, pickFile, readBackup, saveTable, type TableSummary } from '../store/persistence';
import { newTable } from '../store/engine';
import { placeholderTable } from '../store/placeholder';
import { isValidCode, newRoomCode, normalizeCode } from '../net/config';
import { lastJoinCode } from '../net/identity';
import { LIMITS } from '../rules/validate';
import type { TableState } from '../model/types';
import { toast } from '../components/common/toast';
import ConfirmButton from '../components/common/ConfirmButton';

export default function LobbyPage({ userName, onEditName, onHost, onJoin }: {
  userName: string;
  onEditName: () => void;
  onHost: (t: TableState) => void;
  onJoin: (code: string) => void;
}) {
  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const [tableName, setTableName] = useState('');
  const [code, setCode] = useState(lastJoinCode());

  const refresh = () => listTables().then(setTables).catch(() => setTables([]));
  useEffect(() => { void refresh(); }, []);

  const create = async () => {
    const t = newTable(tableName || 'Nova mesa', userName, newRoomCode());
    await saveTable(t);
    onHost(t);
  };

  const createPlaceholder = async () => {
    const t = placeholderTable(userName, newRoomCode());
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
      const t = await readBackup(f);
      const exists = tables?.some((x) => x.id === t.id);
      await saveTable(t);
      toast(exists ? `Mesa "${t.name}" substituída pelo backup.` : `Mesa "${t.name}" importada.`, 'ok');
      void refresh();
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
          <button className="btn btn-primary btn-lg">Criar e abrir sala</button>
          {import.meta.env.DEV && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={createPlaceholder}
              title="Mesa de desenvolvimento com a biblioteca de itens e as ameaças padrão preenchidas">
              <FlaskConical size={14} /> Criar campanha de exemplo
            </button>
          )}
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
        <p className="tiny muted mt">As mesas ficam salvas só neste navegador. Exporte o backup (.json) com frequência para não perder nada.</p>
      </div>
    </div>
  );
}
