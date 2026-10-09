// Mesas do mestre salvas no IndexedDB deste navegador + backup em arquivo .json.
import type { ItemData, TableState } from '../model/types';
import { DEFAULT_DURABILITY, DEFAULT_MOVEMENT, ITEM_TYPES, NO_EFFECTS } from '../model/types';
import { DEFAULT_PERMISSIONS } from '../model/permissions';
import { deriveStats } from '../rules/derive';
import { snapshotOf } from '../model/cases';

const DB_NAME = 'eva3';
const STORE = 'tables';

export interface TableSummary {
  id: string;
  name: string;
  roomCode: string;
  updatedAt: number;
  players: number;
  characters: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest | void): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve((req ? req.result : undefined) as T); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  });
}

export async function saveTable(t: TableState): Promise<void> {
  await tx('readwrite', (s) => { s.put(t); });
}

export async function loadTable(id: string): Promise<TableState | null> {
  const t = await tx<TableState | undefined>('readonly', (s) => s.get(id));
  return t ? migrate(t) : null;
}

export async function deleteTable(id: string): Promise<void> {
  await tx('readwrite', (s) => { s.delete(id); });
}

export async function listTables(): Promise<TableSummary[]> {
  const all = await tx<TableState[]>('readonly', (s) => s.getAll());
  return (all ?? [])
    .map((t) => ({
      id: t.id,
      name: t.name,
      roomCode: t.roomCode,
      updatedAt: t.updatedAt,
      players: Object.keys(t.players ?? {}).length,
      characters: Object.keys(t.characters ?? {}).length,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Pede ao navegador para não apagar os dados sozinho quando faltar espaço. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

// ── Backup em arquivo ────────────────────────────────────────────────────────

interface BackupFile {
  app: 'eva3';
  version: 1;
  exportedAt: string;
  table: TableState;
}

export function downloadTable(t: TableState): void {
  const data: BackupFile = { app: 'eva3', version: 1, exportedAt: new Date().toISOString(), table: t };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const safe = t.name.normalize('NFD').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'mesa';
  const a = document.createElement('a');
  a.href = url;
  a.download = `eva3-${safe}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export async function readBackup(file: File): Promise<TableState> {
  if (file.size > 20_000_000) throw new Error('Arquivo grande demais.');
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('Arquivo inválido: não é um JSON.');
  }
  const d = data as Partial<BackupFile>;
  const t = d?.app === 'eva3' ? d.table : (data as TableState);
  if (!t || typeof t !== 'object' || t.schema !== 1 || typeof t.id !== 'string' || typeof t.characters !== 'object') {
    throw new Error('Esse arquivo não é um backup de mesa do EVA 3.');
  }
  return migrate(t);
}

/** Garante campos que versões futuras possam adicionar. */
export function migrate(t: TableState): TableState {
  t.startLevel ??= 1;
  t.players ??= {};
  t.removedPlayers ??= {};
  t.characters ??= {};
  t.threats ??= {};
  t.itemLibrary ??= {};
  t.cases ??= {};
  // Casos de antes da publicação: o que já estava visível vira a primeira versão publicada.
  for (const k of Object.values(t.cases)) k.published ??= k.visible ? snapshotOf(k, k.updatedAt) : null;
  t.requests ??= [];
  t.log ??= [];
  t.combat ??= null;
  if (t.combat) migrateCombat(t);
  t.permissions ??= { global: { ...DEFAULT_PERMISSIONS }, perPlayer: {} };
  t.permissions.global = { ...DEFAULT_PERMISSIONS, ...t.permissions.global };
  t.permissions.perPlayer ??= {};
  for (const c of Object.values(t.characters)) {
    c.permanentLoss ??= { pv: 0, pe: 0 };
    c.inventory ??= [];
    c.notes ??= '';
    c.kind ??= 'pc';
    c.rdBonus ??= { physical: 0, magic: 0 };
    c.movement ??= DEFAULT_MOVEMENT;
    c.gold ??= 0;
    for (const it of c.inventory) migrateItem(it, true);
    c.visible ??= false;
    c.current.clareza ??= deriveStats(c).clarezaMax;
  }
  for (const it of Object.values(t.itemLibrary)) migrateItem(it, false);
  for (const th of Object.values(t.threats)) {
    const legacy = th as typeof th & { rd?: number };
    th.rdPhysical ??= legacy.rd ?? 0;
    th.rdMagic ??= 0;
    delete legacy.rd;
  }
  return t;
}

/**
 * Combate da versão anterior: ameaças apontavam para o livro (agora viram
 * instância) e condições contavam rodadas soltas (agora terminam numa posição).
 */
function migrateCombat(t: TableState) {
  const c = t.combat!;
  delete (c as typeof c & { ticked?: unknown }).ticked;
  c.order = c.order.filter((cb) => {
    delete (cb as typeof cb & { spawned?: unknown }).spawned;
    if (cb.ref.kind === 'threat' && !cb.threat) {
      const src = t.threats[cb.ref.id];
      if (!src) return false;
      const { id: _id, visible: _v, createdAt: _c, updatedAt: _u, ...data } = structuredClone(src);
      cb.threat = data;
    }
    for (const cond of cb.conditions) {
      if (cond.endsAtRound !== undefined) continue;
      cond.sourceId = c.round > 0 ? cb.id : null;
      cond.endsAtRound = cond.rounds === null ? null : c.round > 0 ? c.round + cond.rounds : cond.rounds + 1;
    }
    return true;
  });
  c.turn = Math.max(0, Math.min(c.turn, c.order.length - 1));
}

/** Itens de versões antigas ganham valor e durabilidade padrão do tipo. */
function migrateItem(it: ItemData & { pv?: number; defBonus?: number }, inventory: boolean) {
  if ((it.type as string) === 'catalisador') it.type = 'catalisador_sagrado';
  if (!(it.type in ITEM_TYPES)) it.type = 'outro';
  it.effects ??= { ...NO_EFFECTS, def: it.defBonus ?? 0 };
  delete it.defBonus;
  it.value ??= 0;
  it.durability ??= { ...DEFAULT_DURABILITY[it.type] };
  if (inventory && typeof it.pv !== 'number') it.pv = it.durability.pv;
}
