// Mesas do mestre salvas no IndexedDB deste navegador + backup em arquivo .json.
import type { Character, CharacterExport, InventoryItem, ItemData, TableState } from '../model/types';
import { DEFAULT_DURABILITY, DEFAULT_MOVEMENT, DEFAULT_SLOT, ITEM_SLOTS, ITEM_TYPES, NO_EFFECTS } from '../model/types';
import { DEFAULT_PERMISSIONS } from '../model/permissions';
import { deriveStats } from '../rules/derive';
import { equipBlock } from '../rules/equipment';
import { snapshotOf } from '../model/cases';
import { fixMap } from '../model/map';
import { emptyCampaign, emptySessionData } from '../model/campaign';
import { isHostKey, peekHostKey, restoreHostKey } from '../net/identity';
import { libraryStore, mergePlaylists, validPlaylists, type LocalPlaylist } from '../music/library';
import { defaultCtx } from './engine';
import { LIMITS } from '../rules/validate';

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
// Um backup leva a mesa inteira (jogadores, fichas, NPCs, ameaças, itens, mapas,
// combate, casos, caderno da campanha, permissões, pedidos e registro), a chave da
// sala (para a mesa voltar com o mesmo código em outro navegador) e as playlists.

/** O que há numa mesa, para o mestre conferir antes de importar (vai também no arquivo). */
export interface BackupContents {
  players: number;
  pcs: number;
  npcs: number;
  threats: number;
  items: number;
  maps: number;
  cases: number;
  sessions: number;
  combat: boolean;
  logEntries: number;
}

export interface BackupEntry {
  table: TableState;
  /** Chave que reserva o código da sala para o mestre. */
  hostKey?: string;
}

/** Uma mesa (versão 1: só `table`). */
interface TableBackupFile {
  app: 'eva3';
  type?: 'table';
  version: 1 | 2;
  exportedAt: string;
  contents?: BackupContents;
  table: TableState;
  hostKey?: string;
  playlists?: LocalPlaylist[];
}

/** Todas as mesas deste navegador. */
interface FullBackupFile {
  app: 'eva3';
  type: 'all';
  version: 2;
  exportedAt: string;
  tables: Array<BackupEntry & { contents?: BackupContents }>;
  playlists: LocalPlaylist[];
}

/** Backup lido e conferido, pronto para importar. */
export interface Backup {
  exportedAt: string | null;
  tables: BackupEntry[];
  playlists: LocalPlaylist[];
}

export function backupContents(t: TableState): BackupContents {
  const chars = Object.values(t.characters ?? {});
  return {
    players: Object.keys(t.players ?? {}).length,
    pcs: chars.filter((c) => c.kind !== 'npc').length,
    npcs: chars.filter((c) => c.kind === 'npc').length,
    threats: Object.keys(t.threats ?? {}).length,
    items: Object.keys(t.itemLibrary ?? {}).length,
    maps: Object.keys(t.maps ?? {}).length,
    cases: Object.keys(t.cases ?? {}).length,
    sessions: Object.keys(t.campaign?.sessions ?? {}).length,
    combat: !!t.combat,
    logEntries: (t.log ?? []).length,
  };
}

/** Nome de arquivo sem acentos nem símbolos. */
function slug(name: string, fallback: string): string {
  return name.normalize('NFD').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || fallback;
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const fileStamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

function entryOf(t: TableState): BackupEntry {
  const hostKey = peekHostKey(t.id);
  return hostKey ? { table: t, hostKey } : { table: t };
}

export function buildTableBackup(t: TableState, playlists: LocalPlaylist[]): TableBackupFile {
  return { app: 'eva3', type: 'table', version: 2, exportedAt: new Date().toISOString(), contents: backupContents(t), ...entryOf(t), playlists };
}

export function buildFullBackup(tables: TableState[], playlists: LocalPlaylist[]): FullBackupFile {
  return {
    app: 'eva3', type: 'all', version: 2, exportedAt: new Date().toISOString(),
    tables: tables.map((t) => ({ contents: backupContents(t), ...entryOf(t) })),
    playlists,
  };
}

/** Backup de uma mesa (com a chave da sala e as playlists deste navegador). */
export function downloadTable(t: TableState): void {
  downloadJson(buildTableBackup(t, libraryStore.get()), `eva3-${slug(t.name, 'mesa')}-${fileStamp()}.json`);
}

/** Backup de todas as mesas deste navegador num arquivo só. Devolve quantas foram. */
export async function downloadAllTables(): Promise<number> {
  const all = await tx<TableState[]>('readonly', (s) => s.getAll());
  const tables = (all ?? []).map(migrate).sort((a, b) => b.updatedAt - a.updatedAt);
  if (!tables.length) return 0;
  downloadJson(buildFullBackup(tables, libraryStore.get()), `eva3-todas-as-mesas-${fileStamp()}.json`);
  return tables.length;
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

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Confere o mínimo de uma mesa; o resto o `migrate` completa ou acerta. */
function checkTable(v: unknown): TableState {
  const t = v as TableState;
  if (!isObj(t) || t.schema !== 1 || typeof t.id !== 'string' || !t.id || !isObj(t.characters)) {
    throw new Error('Esse arquivo não é um backup de mesa do EVA 3.');
  }
  t.name = typeof t.name === 'string' && t.name.trim() ? t.name : 'Mesa sem nome';
  for (const k of ['players', 'threats', 'itemLibrary', 'cases', 'maps'] as const) {
    if (t[k] != null && !isObj(t[k])) throw new Error(`Backup danificado: a parte "${k}" da mesa "${t.name}" não pôde ser lida.`);
  }
  if (t.log != null && !Array.isArray(t.log)) throw new Error(`Backup danificado: o registro da mesa "${t.name}" não pôde ser lido.`);
  return migrate(t);
}

function entryFrom(v: unknown): BackupEntry {
  const e = isObj(v) ? v : {};
  const table = checkTable(e.table);
  return isHostKey(e.hostKey) ? { table, hostKey: e.hostKey } : { table };
}

/** Confere o conteúdo de um arquivo de backup: de uma mesa, de todas, da versão 1 ou uma mesa solta. */
export function parseBackup(data: unknown): Backup {
  if (!isObj(data)) throw new Error('Esse arquivo não é um backup de mesa do EVA 3.');
  const d = data as { app?: unknown; type?: unknown; exportedAt?: unknown; playlists?: unknown; tables?: unknown };
  if (d.app === 'eva3' && d.type === 'characters') {
    throw new Error('Esse arquivo é de fichas, não de uma mesa. Importe pela aba Jogadores ou NPCs e Ameaças.');
  }
  if (d.app !== 'eva3') return { exportedAt: null, tables: [{ table: checkTable(data) }], playlists: [] };
  const exportedAt = typeof d.exportedAt === 'string' ? d.exportedAt : null;
  const playlists = validPlaylists(d.playlists);
  if (d.type === 'all') {
    if (!Array.isArray(d.tables) || !d.tables.length) throw new Error('Esse backup não tem nenhuma mesa.');
    const tables = d.tables.map(entryFrom);
    if (new Set(tables.map((e) => e.table.id)).size !== tables.length) throw new Error('Backup danificado: a mesma mesa aparece duas vezes.');
    return { exportedAt, tables, playlists };
  }
  return { exportedAt, tables: [entryFrom(d)], playlists };
}

export async function readBackup(file: File): Promise<Backup> {
  if (file.size > 100_000_000) throw new Error('Arquivo grande demais.');
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('Arquivo inválido: não é um JSON.');
  }
  return parseBackup(data);
}

/**
 * Grava as mesas de um backup neste navegador. Com `asCopy`, as que já existem aqui
 * entram como mesas novas (outro id e outro código de sala), sem tocar nas atuais.
 * As playlists que ainda não existem entram na biblioteca de música.
 */
export async function restoreBackup(b: Backup, existing: Set<string>, asCopy: boolean, roomCode: () => string): Promise<{ tables: TableState[]; playlists: number }> {
  const saved: TableState[] = [];
  for (const { table, hostKey } of b.tables) {
    if (asCopy && existing.has(table.id)) {
      const copy: TableState = { ...structuredClone(table), id: defaultCtx.newId(), name: `${table.name} (cópia)`.slice(0, LIMITS.tableName), roomCode: roomCode() };
      await saveTable(copy);
      saved.push(copy);
      continue;
    }
    // A chave vem junto: a mesa volta com o mesmo código, e os jogadores entram como antes.
    if (hostKey) restoreHostKey(table.id, hostKey);
    await saveTable(table);
    saved.push(table);
  }
  return { tables: saved, playlists: b.playlists.length ? mergePlaylists(b.playlists) : 0 };
}

// ── Fichas em arquivo ────────────────────────────────────────────────────────

interface CharacterFile {
  app: 'eva3';
  type: 'characters';
  version: 1;
  exportedAt: string;
  characters: CharacterExport[];
}

export function toExport(c: Character): CharacterExport {
  const { id: _id, ownerId: _o, visible: _v, status: _s, rejectReason: _r, createdAt: _c, updatedAt: _u, ...data } = structuredClone(c);
  return data;
}

/** Uma ficha vira "eva3-ficha-nome.json"; várias, "eva3-<nome>-data.json". */
export function downloadCharacters(chars: Character[], name?: string): void {
  if (!chars.length) return;
  const data: CharacterFile = { app: 'eva3', type: 'characters', version: 1, exportedAt: new Date().toISOString(), characters: chars.map(toExport) };
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJson(data, chars.length === 1 && !name
    ? `eva3-ficha-${slug(chars[0].name, 'personagem')}.json`
    : `eva3-${slug(name ?? 'fichas', 'fichas')}-${stamp}.json`);
}

/**
 * Lê um arquivo de fichas exportado (ou uma ficha solta em JSON). A validação de
 * verdade é a do motor, ao importar; aqui só se separa o que não é ficha.
 */
export async function readCharacterFile(file: File): Promise<CharacterExport[]> {
  if (file.size > 5_000_000) throw new Error('Arquivo grande demais.');
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('Arquivo inválido: não é um JSON.');
  }
  const d = (data ?? {}) as Partial<CharacterFile> & Partial<TableBackupFile> & Partial<CharacterExport> & { tables?: unknown };
  if (d.app === 'eva3' && d.type === 'characters' && Array.isArray(d.characters) && d.characters.length) return d.characters;
  if (d.app === 'eva3' && (d.table || d.tables)) throw new Error('Esse arquivo é o backup de uma mesa inteira (importe pela tela inicial). Exporte as fichas pela ficha ou pela aba NPCs e Ameaças.');
  if (typeof d.name === 'string' && d.attributes && Array.isArray(d.levels)) return [d as CharacterExport];
  throw new Error('Esse arquivo não é uma ficha do EVA 3.');
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
  t.relations = (t.relations ?? []).filter((r) => t.characters[r.pcId] && t.characters[r.npcId]);
  t.bonds = (t.bonds ?? []).filter((b) => t.characters[b.fromId] && t.characters[b.toId]);
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
    // Antes não havia limite: o que passar de duas mãos ou de uma proteção é desequipado.
    const kept: InventoryItem[] = [];
    for (const it of c.inventory) {
      if (!it.equipped) continue;
      if (equipBlock(kept, it)) it.equipped = false;
      else kept.push(it);
    }
    c.visible ??= false;
    c.current.clareza ??= deriveStats(c).clarezaMax;
  }
  for (const it of Object.values(t.itemLibrary)) migrateItem(it, false);
  for (const th of Object.values(t.threats)) {
    const legacy = th as typeof th & { rd?: number };
    th.rdPhysical ??= legacy.rd ?? 0;
    th.rdMagic ??= 0;
    th.category ??= 'humano';
    th.movement ??= DEFAULT_MOVEMENT;
    delete legacy.rd;
  }
  for (const cb of t.combat?.order ?? []) {
    if (!cb.threat) continue;
    cb.threat.category ??= 'humano';
    cb.threat.movement ??= DEFAULT_MOVEMENT;
  }
  t.maps ??= {};
  for (const m of Object.values(t.maps)) fixMap(m);
  t.activeMapId ??= null;
  if (t.activeMapId && !t.maps[t.activeMapId]) t.activeMapId = null;
  if (t.combat) {
    t.combat.mapId ??= null;
    if (t.combat.mapId && !t.maps[t.combat.mapId]) t.combat.mapId = null;
  }
  migrateCampaign(t);
  return t;
}

/** Mesas de antes do caderno de campanha ganham um caderno vazio; campos novos ganham padrão. */
function migrateCampaign(t: TableState) {
  t.campaign ??= emptyCampaign();
  const c = t.campaign;
  c.title ??= '';
  c.premise ??= '';
  c.notes ??= '';
  c.threads ??= [];
  c.arcs ??= [];
  c.sessions ??= {};
  for (const s of Object.values(c.sessions)) {
    const blank = emptySessionData(s.number);
    s.plan = { ...blank.plan, ...s.plan };
    s.report = { ...blank.report, ...s.report };
    s.arcId ??= null;
  }
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
function migrateItem(it: ItemData & { pv?: number; defBonus?: number; qty?: number }, inventory: boolean) {
  if ((it.type as string) === 'catalisador') it.type = 'catalisador_sagrado';
  if (!(it.type in ITEM_TYPES)) it.type = 'outro';
  it.effects ??= { ...NO_EFFECTS, def: it.defBonus ?? 0 };
  delete it.defBonus;
  it.value ??= 0;
  it.durability ??= { ...DEFAULT_DURABILITY[it.type] };
  if (it.type === 'protecao') it.slot = 'veste';
  else if (!(it.slot in ITEM_SLOTS)) {
    // A biblioteca de exemplo dizia "duas mãos" na descrição das armas que pedem as duas.
    const twoHanded = (it.type === 'arma' || it.type === 'escudo') && /duas m[ãa]os/i.test(it.description);
    it.slot = twoHanded ? 'duas_maos' : DEFAULT_SLOT[it.type];
  }
  if (inventory && typeof it.pv !== 'number') it.pv = it.durability.pv;
  if (typeof it.pack !== 'number') {
    // Antes o pacote vinha no nome ("Balas .38 (50)") e o inventário contava caixas.
    const m = it.type === 'municao' ? /^(.+?)\s*\((\d{1,3})\)$/.exec(it.name) : null;
    it.pack = m ? Math.max(1, parseInt(m[2], 10)) : 1;
    if (m) {
      it.name = m[1];
      if (inventory && typeof it.qty === 'number') it.qty = Math.min(999, it.qty * it.pack);
    }
  }
}
