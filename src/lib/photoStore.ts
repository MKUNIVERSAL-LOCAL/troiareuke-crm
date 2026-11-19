// ═══════════════════════════════════════════════════════════════
// photoStore — 시술 전/후 사진 등 이미지 저장소 (비코어)
// ───────────────────────────────────────────────────────────────
// 설계 의도:
//  - 사진은 용량이 커서 코어 store.ts의 레코드(treatment_logs 등)와 분리한다.
//  - 로컬 캐시는 IndexedDB(기본, 수백 MB) — WebView/브라우저가 IDB를 못 쓰면 localStorage(~5MB) 폴백.
//    읽기(getPhotos)는 동기 메모리 read-through: 아직 안 읽은 키는 []를 돌려주고 비동기로 채운 뒤
//    onPhotoCacheChange로 알린다(화면은 usePhotoCacheVersion으로 다시 그린다). 2026-11-17 D4 이관.
//  - 정본은 NAS 중앙 서버 `/api/photos/*`
//    (crm_photos 테이블)에 동기화한다 — 다른 PC에서도 같은 사진이 보인다.
//    (2026-09-07 주석 갱신: 예전 "기기별 보관" 설명은 NAS 연동 전 상태였음)
//  - 업로드 시 클라이언트에서 리사이즈/압축하여 용량을 억제한다.
// ═══════════════════════════════════════════════════════════════

import { apiRequest, isAuthApiConfigured, AuthApiError } from './authApi';

const PREFIX = 'troiareuke_photos_';

/** 엔티티 키 규칙: `treatment:<logId>`, `customer:<customerId>` 등 */
function storageKey(entityKey: string): string {
  return `${PREFIX}${entityKey}`;
}

// ── 로컬 캐시 백엔드 (IndexedDB 기본 / localStorage 폴백) ─────────────────
// 모바일 WebView의 localStorage는 5~10MB라 사진 수십 장이면 "용량 초과"에 막혔다(D4).
// IndexedDB는 수백 MB 이상이라 캐시 비우기 없이 보관한다. 메타키(dirty·evicted·tombstone)는 작은 목록이라 localStorage에 그대로 둔다.
// 메모리 캐시는 상한(MEM_BUDGET)이 있는 LRU — IndexedDB 덕에 총량 제한이 사라진 만큼 힙이 무한히 자라지 않게 한다 (리뷰 2026-11-17).
const IDB_NAME = 'troiareuke_photos';
const IDB_STORE = 'photos';
const IDB_OPEN_TIMEOUT_MS = 8000;
const MEM_BUDGET = 64 * 1024 * 1024; // dataUrl 글자수 합 기준
type CacheBackend = 'idb' | 'ls';
let backend: CacheBackend = typeof indexedDB !== 'undefined' ? 'idb' : 'ls';
let db: IDBDatabase | null = null;
const mem = new Map<string, PhotoEntry[]>();   // LRU — Map 삽입 순서(오래된 → 최신)
let memBytes = 0;
// 장수만 — 목록 화면이 base64를 힙에 올리지 않게. localStorage(작은 JSON)에 유지해 앱 시작 직후 목록도 사진을 읽지 않고 장수를 안다
const COUNTS_KEY = 'crm_photo_counts';
const counts = new Map<string, number>(loadCounts());
let countsTimer: ReturnType<typeof setTimeout> | null = null;
function loadCounts(): [string, number][] {
  try {
    const parsed = JSON.parse(localStorage.getItem(COUNTS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? Object.entries(parsed).filter((e): e is [string, number] => typeof e[1] === 'number') : [];
  } catch {
    return [];
  }
}
function persistCounts(): void {
  if (countsTimer !== null) return;
  countsTimer = setTimeout(() => {
    countsTimer = null;
    try { localStorage.setItem(COUNTS_KEY, JSON.stringify(Object.fromEntries(counts))); } catch { /* 용량 — 다음 기회에 */ }
  }, 200);
}
function setCount(entityKey: string, n: number): void {
  if (counts.get(entityKey) === n) return;
  if (n === 0) counts.delete(entityKey); else counts.set(entityKey, n);
  persistCounts();
}
const inflight = new Set<string>();             // IDB에서 읽는 중인 키
const PENDING_WRITE = new Set<string>();        // IDB 저장이 끝나지 않은 키 — 메모리에서 내리면 안 됨
const listeners = new Set<() => void>();
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
// 브라우저 빌드의 다른 탭이 같은 키를 저장하면 이 탭의 메모리 사본을 무효화한다 (Electron·앱은 단일 창이라 영향 없음)
const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(IDB_NAME) : null;
if (bc) bc.onmessage = ev => {
  const key = (ev.data as { key?: unknown } | null)?.key;
  if (typeof key !== 'string') return;
  memDrop(key);
  counts.delete(key);
  persistCounts();
  emitChange();
};

/** 캐시 내용이 비동기로 바뀌었을 때(최초 적재·NAS 동기화·다른 탭 저장) 화면을 다시 그리기 위한 구독 */
export function onPhotoCacheChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function emitChange(): void {
  if (notifyTimer !== null) return; // 여러 키가 연달아 적재돼도 리렌더는 한 번
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    listeners.forEach(cb => { try { cb(); } catch { /* 구독자 오류가 다른 구독자를 막지 않게 */ } });
  }, 30);
}

function sizeOf(photos: PhotoEntry[]): number {
  return photos.reduce((n, p) => n + (p.dataUrl?.length ?? 0), 0);
}
function memDrop(entityKey: string): void {
  const prev = mem.get(entityKey);
  if (!prev) return;
  memBytes -= sizeOf(prev);
  mem.delete(entityKey);
}
function memSet(entityKey: string, photos: PhotoEntry[]): void {
  memDrop(entityKey);
  mem.set(entityKey, photos);
  memBytes += sizeOf(photos);
  setCount(entityKey, photos.length);
  // 상한 초과분은 오래된 키부터 내린다 — 저장 중·전송 중·방금 쓴 키는 제외
  for (const [k, v] of mem) {
    if (memBytes <= MEM_BUDGET) break;
    if (k === entityKey || PENDING_WRITE.has(k) || PENDING_PUSH.has(k)) continue;
    mem.delete(k);
    memBytes -= sizeOf(v);
  }
}
function memTouch(entityKey: string): PhotoEntry[] | undefined {
  const v = mem.get(entityKey);
  if (v) { mem.delete(entityKey); mem.set(entityKey, v); } // 최근 사용으로 갱신
  return v;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // 잠긴/손상된 백엔드에서 open이 영영 응답하지 않으면 localStorage 폴백으로 넘어가게 시간 제한
    const timer = setTimeout(() => reject(new Error('indexedDB open timeout')), IDB_OPEN_TIMEOUT_MS);
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => {
      clearTimeout(timer);
      const database = req.result;
      // 브라우저/WebView가 연결을 강제로 닫으면(저장소 정리·iOS 백그라운드) 다음 접근 때 다시 연다
      database.onclose = () => { if (db === database) db = null; };
      database.onversionchange = () => { database.close(); if (db === database) db = null; };
      resolve(database);
    };
    req.onerror = () => { clearTimeout(timer); reject(req.error ?? new Error('indexedDB open failed')); };
    req.onblocked = () => { clearTimeout(timer); reject(new Error('indexedDB blocked')); };
  });
}
/** 트랜잭션 완료(oncomplete) 시점에 확정 — 요청 성공 뒤 커밋 단계에서 나는 용량 초과도 거부로 잡힌다 */
function idbRun<T>(database: IDBDatabase, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let result: T;
    const tx = database.transaction(IDB_STORE, mode);
    const req = fn(tx.objectStore(IDB_STORE));
    req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? req.error ?? new Error('indexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? req.error ?? new Error('indexedDB transaction aborted'));
  });
}
/** 준비 완료 후 연결 반환 — 끊겼으면 다시 연다. IDB를 못 쓰면 null */
async function getDb(): Promise<IDBDatabase | null> {
  await photoCacheReady;
  if (backend !== 'idb') return null;
  if (!db) {
    try { db = await openDb(); } catch (e) { console.error('[photoStore] IndexedDB 재연결 실패:', e); return null; }
  }
  return db;
}

function isMetaKey(lsKey: string): boolean {
  return lsKey === DIRTY_KEY; // DIRTY_KEY도 PREFIX로 시작한다
}
/** localStorage에 남아 있던 사진을 IndexedDB로 옮긴다 — 읽기 확인 후에만 localStorage 키를 지운다(무손실) */
async function migrateFromLocalStorage(database: IDBDatabase): Promise<void> {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX) && !isMetaKey(k)) keys.push(k);
  }
  for (const lsKey of keys) {
    try {
      const parsed = JSON.parse(localStorage.getItem(lsKey) || 'null');
      if (!Array.isArray(parsed)) { localStorage.removeItem(lsKey); continue; }
      const entityKey = lsKey.slice(PREFIX.length);
      if (parsed.length > 0) {
        await idbRun(database, 'readwrite', s => s.put(parsed, entityKey));
        const back = await idbRun<PhotoEntry[] | undefined>(database, 'readonly', s => s.get(entityKey));
        if (!Array.isArray(back) || back.length !== parsed.length) continue; // 확인 실패 — localStorage 사본은 남겨 둔다
      }
      setCount(entityKey, parsed.length);
      localStorage.removeItem(lsKey);
    } catch (e) {
      console.warn('[photoStore] localStorage → IndexedDB 이관 실패, 다음 실행에 재시도:', lsKey, e);
    }
  }
}
/** 캐시 준비(IDB 열기 + 이관) — 쓰기·동기화는 이 뒤에 수행해 이관본이 새 값을 덮어쓰지 않게 한다 */
export const photoCacheReady: Promise<void> = backend === 'idb'
  ? openDb()
      .then(async database => { db = database; await migrateFromLocalStorage(database); })
      .catch(e => { console.warn('[photoStore] IndexedDB 사용 불가 — localStorage 폴백:', e); backend = 'ls'; db = null; })
  : Promise.resolve();

function isLsBackend(): boolean { return backend === 'ls'; }
function lsRead(entityKey: string): PhotoEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(entityKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
/** 동기 읽기 — IDB 백엔드는 메모리에 없으면 []를 돌려주고 비동기로 채운 뒤 onPhotoCacheChange로 알린다 */
function readCache(entityKey: string): PhotoEntry[] {
  if (backend === 'ls') return lsRead(entityKey);
  const cached = memTouch(entityKey);
  if (cached) return cached;
  // 이관 전이면 localStorage에 아직 남아 있을 수 있다 — 그 값을 그대로 보여준다
  const legacy = lsRead(entityKey);
  if (!inflight.has(entityKey)) {
    inflight.add(entityKey);
    void loadCache(entityKey).then(v => { if (v && v.length > 0) emitChange(); }).finally(() => inflight.delete(entityKey));
  }
  return legacy;
}
/**
 * 비동기 읽기(확정값) — 실제 값이 필요한 곳(수정 모달·NAS 동기화)에서 사용.
 * 읽기 실패는 캐시하지 않고 null — "사진 없음"과 "읽지 못함"을 구분해 빈 배열로 덮어쓰는 사고를 막는다.
 */
async function loadCache(entityKey: string): Promise<PhotoEntry[] | null> {
  await photoCacheReady;
  if (backend === 'ls') return lsRead(entityKey);
  const cached = memTouch(entityKey);
  if (cached) return cached;
  const database = await getDb();
  if (!database) return null;
  try {
    const v = await idbRun<PhotoEntry[] | undefined>(database, 'readonly', s => s.get(entityKey));
    const value = Array.isArray(v) ? v : [];
    if (!mem.has(entityKey)) memSet(entityKey, value); // 읽는 사이 쓰기가 먼저 들어왔으면 그 값을 유지
    return mem.get(entityKey) ?? value;
  } catch (e) {
    console.error('[photoStore] IndexedDB 읽기 실패:', entityKey, e);
    return null;
  }
}
/** 메모리에 올리지 않는 읽기 — 전수 동기화가 모든 사진을 힙에 고정하지 않게 */
async function peekCache(entityKey: string): Promise<PhotoEntry[] | null> {
  await photoCacheReady;
  if (backend === 'ls') return lsRead(entityKey);
  const cached = mem.get(entityKey);
  if (cached) return cached;
  const database = await getDb();
  if (!database) return null;
  try {
    const v = await idbRun<PhotoEntry[] | undefined>(database, 'readonly', s => s.get(entityKey));
    const value = Array.isArray(v) ? v : [];
    setCount(entityKey, value.length);
    return value;
  } catch (e) {
    console.error('[photoStore] IndexedDB 읽기 실패:', entityKey, e);
    return null;
  }
}
/** 쓰기 — localStorage 백엔드는 동기(용량 초과 시 throw), IDB 백엔드는 메모리 즉시 + 비동기 저장(실패 시 용량 초과 토스트) */
function writeCache(entityKey: string, photos: PhotoEntry[]): void {
  if (backend === 'ls') {
    if (photos.length === 0) localStorage.removeItem(storageKey(entityKey));
    else localStorage.setItem(storageKey(entityKey), JSON.stringify(photos));
    return;
  }
  memSet(entityKey, photos);
  PENDING_WRITE.add(entityKey);
  void (async () => {
    try {
      await photoCacheReady;
      if (isLsBackend()) { writeCache(entityKey, photos); return; } // 열기 실패로 폴백된 경우 (TS가 클로저 안에서 좁힌 타입을 우회)
      const database = await getDb();
      if (!database) throw new Error('indexedDB unavailable');
      if (photos.length === 0) await idbRun(database, 'readwrite', s => s.delete(entityKey));
      else await idbRun(database, 'readwrite', s => s.put(photos, entityKey));
      bc?.postMessage({ key: entityKey });
    } catch (e) {
      console.error('[photoStore] 로컬 사진 저장 실패 (서버 정본은 별도 동기화):', entityKey, e);
      memDrop(entityKey); // 다음 읽기는 디스크 상태를 반영
      counts.delete(entityKey);
      persistCounts();
      // App.tsx가 듣는 용량 초과 토스트 — 저장이 조용히 사라지지 않게
      try { window.dispatchEvent(new CustomEvent('crm:storage-quota-exceeded', { detail: { key: storageKey(entityKey) } })); } catch { /* noop */ }
    } finally {
      PENDING_WRITE.delete(entityKey);
    }
  })();
}

/** 비동기 확정값 읽기 — 수정 모달처럼 "아직 안 읽음"을 빈 목록으로 오해하면 안 되는 곳. 읽기 실패는 null */
export function getPhotosAsync(entityKey: string): Promise<PhotoEntry[] | null> {
  return loadCache(entityKey);
}

/** 장수만 — 목록 화면용(localStorage 장수 목록 → 메모리). 모르면 읽기를 걸어 두고 0을 돌려준다(적재 후 onPhotoCacheChange) */
export function getPhotoCount(entityKey: string): number {
  if (backend === 'ls') return lsRead(entityKey).length;
  const c = counts.get(entityKey);
  if (c !== undefined) return c;
  return readCache(entityKey).length;
}

/** 로그아웃(공용 PC 개인정보 보호) 때 로컬 사진 캐시 전부 삭제 — 서버 정본은 그대로. 서버 모드에서만 (로컬 모드는 이 캐시가 유일한 저장소) */
export function clearLocalPhotoCacheForLogout(): void {
  if (!isAuthApiConfigured) return;
  mem.clear(); memBytes = 0; counts.clear();
  try {
    localStorage.removeItem(COUNTS_KEY);
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX) && !isMetaKey(k)) localStorage.removeItem(k);
  } catch { /* noop */ }
  void getDb().then(async database => {
    if (!database) return;
    try { await idbRun(database, 'readwrite', s => s.clear()); } catch (e) { console.error('[photoStore] 로그아웃 캐시 삭제 실패:', e); }
  });
}

// ── NAS 동기화 dirty 추적 ─────────────────────────────────────
// 푸시가 실패한(오프라인 등) 엔티티는 dirty로 표시한다. dirty인 동안에는
// 서버본이 로컬을 덮어쓰지 못하고(사진 유실 방지), 재푸시로 해소된다.
const DIRTY_KEY = 'troiareuke_photos_dirty';
// 용량 초과로 비워진 캐시 표식 — "삭제됨"과 구분해 dirty 재전송 때 빈 배열을 서버에 올리지 않게 한다
const EVICTED_KEY = 'crm_photo_evicted';
// 서버가 거부해 "이 기기에만 보관"하기로 한 엔티티 — 동기화가 서버본으로 덮어쓰거나 다시 올리지 않는다. 그 기록을 다시 저장(setPhotos/clearPhotos)하면 해제 (리뷰 2026-11-19)
const KEEP_LOCAL_KEY = 'crm_photo_keep_local';
function getKeepLocalKeys(): string[] {
  try { const parsed = JSON.parse(localStorage.getItem(KEEP_LOCAL_KEY) || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function setKeepLocal(entityKey: string, keep: boolean): void {
  try {
    const keys = new Set(getKeepLocalKeys());
    if (keep) keys.add(entityKey); else keys.delete(entityKey);
    if (keys.size === 0) localStorage.removeItem(KEEP_LOCAL_KEY); else localStorage.setItem(KEEP_LOCAL_KEY, JSON.stringify([...keys]));
  } catch { /* noop */ }
}
// 서버 전송이 끝나지 않은 엔티티 — 이 캐시를 비우면 실패 시 재전송할 원본이 사라진다
const PENDING_PUSH = new Set<string>();

function getDirtyKeys(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DIRTY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getEvictedKeys(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(EVICTED_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setEvicted(entityKey: string, evicted: boolean): void {
  try {
    const keys = new Set(getEvictedKeys());
    if (evicted) keys.add(entityKey);
    else keys.delete(entityKey);
    if (keys.size === 0) localStorage.removeItem(EVICTED_KEY);
    else localStorage.setItem(EVICTED_KEY, JSON.stringify([...keys]));
  } catch { /* noop */ }
}

function setDirty(entityKey: string, dirty: boolean): void {
  try {
    const keys = new Set(getDirtyKeys());
    if (dirty) keys.add(entityKey);
    else keys.delete(entityKey);
    localStorage.setItem(DIRTY_KEY, JSON.stringify([...keys]));
  } catch { /* noop */ }
  emitSync();
}

// ── 사진 서버 전송 상태 — OfflineBanner가 "사진 N건 전송 대기/거부"를 보여주고 [다시 시도]할 수 있게 (실패 경로 감사 2026-11-18)
export const PHOTO_SYNC_EVENT = 'crm:photo-sync-changed';
function emitSync(): void { try { window.dispatchEvent(new CustomEvent(PHOTO_SYNC_EVENT)); } catch { /* noop */ } }
// 서버가 영구 거부(4xx — 용량 413 등)한 키 — 이 세션에선 자동 재전송하지 않는다(마운트마다 같은 오류 반복 방지). 수동 [다시 시도]는 포함
const REJECTED_PUSH = new Map<string, number>();
export function dirtyPhotoCount(): number { return getDirtyKeys().length; }
export function rejectedPhotoCount(): number { return REJECTED_PUSH.size; }
/**
 * 서버가 거부한 사진을 이 기기에만 두기로 함 — 전송 대기(dirty)·거부 표식을 지워 배너가 영구히 빨갛지 않게. 기록의 사진을 줄여 다시 저장하면 그때 다시 올라간다 (UX 점검 2026-11-19).
 * 이 사진은 서버에 없으므로 이 기기에서 로그아웃(캐시 비우기)하면 함께 사라진다 — 확인창·로그아웃 경로가 그 사실을 알린다 (리뷰 2026-11-19).
 */
export function keepLocalPhotoCount(): number { return getKeepLocalKeys().length; }
/** 로그아웃 전 공용 확인 — 이 기기에만 보관한 사진이 있으면 사라진다고 묻고, 없으면 그냥 true. 모든 지점 로그아웃 경로(사이드바·모바일 더보기·앱 잠금)가 같이 쓴다 (리뷰 2026-11-19) */
export function confirmLogoutDespiteKeepLocal(): boolean {
  const n = keepLocalPhotoCount();
  return n === 0 || window.confirm(`이 기기에만 보관한 사진이 든 기록 ${n}건이 로그아웃하면 사라집니다(서버에는 없음). 계속할까요?`);
}
export function keepRejectedPhotosLocal(): number {
  const keys = [...REJECTED_PUSH.keys()];
  for (const key of keys) { setKeepLocal(key, true); setDirty(key, false); REJECTED_PUSH.delete(key); }
  if (keys.length > 0) emitSync();
  return keys.length;
}
/** syncPhotosFromNas 결과 — fetchFailed: 서버 조회가 한 번이라도 실패해 로컬 캐시만 보이는 상태(호출자가 "이 기기 사진만 보인다"고 안내). 전역 플래그는 동시 동기화(상담·시술)가 서로 지워 호출자별로 돌려준다 (리뷰 2026-11-19) */
export interface PhotoSyncResult { changed: boolean; fetchFailed: boolean }
const SYNC_NOOP: PhotoSyncResult = { changed: false, fetchFailed: false };
/** 전송 실패분(dirty) 재전송 — 연결 복구(자동, 거부분 제외)·배너 [다시 시도](거부분 포함) */
export async function retryDirtyPhotos(includeRejected = false): Promise<void> {
  if (!isAuthApiConfigured) return;
  await photoCacheReady;
  if (includeRejected) for (const key of getKeepLocalKeys()) { setKeepLocal(key, false); setDirty(key, true); } // 배너 [다시 시도]는 이 기기 보관분도 다시 올려 본다
  for (const key of getDirtyKeys()) {
    if (PENDING_PUSH.has(key)) continue;
    if (REJECTED_PUSH.has(key)) { if (!includeRejected) continue; REJECTED_PUSH.delete(key); }
    const local = await peekCache(key);
    if (local === null) continue; // 로컬을 읽지 못했으면 빈 배열을 올리지 않는다
    if (local.length === 0 && getEvictedKeys().includes(key)) { setDirty(key, false); setEvicted(key, false); continue; } // 용량 초과로 비워진 캐시 — 서버본이 정본(syncPhotosFromNas와 동일)
    pushToNas(key, local);
  }
  emitSync();
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void retryDirtyPhotos(false); });
}

// ── 삭제 tombstone 재전송 대기 목록 ──────────────────────────────
// clearPhotos의 빈 배열 push가 실패하면, 삭제된 엔티티 키는 현존 시술로그
// 기반의 syncPhotosFromNas entityKeys에 다시 포함되지 않아 영영 재전송되지
// 않는 문제가 있었다. 삭제 대기 키를 별도 보관해 sync 때마다 재시도한다.
const TOMBSTONE_KEY = 'crm_photo_tombstones';

function getTombstoneKeys(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setTombstone(entityKey: string, pending: boolean): void {
  try {
    const keys = new Set(getTombstoneKeys());
    if (pending) keys.add(entityKey);
    else keys.delete(entityKey);
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify([...keys]));
  } catch { /* noop */ }
}

// NAS 중앙 서버로 사진 백업. 실패 시 dirty로 표시해 다음 sync에서 재푸시.
function pushToNas(entityKey: string, photos: PhotoEntry[]): void {
  if (!isAuthApiConfigured) return;
  if (REJECTED_PUSH.has(entityKey)) return; // 이 세션에서 서버가 거부한 키 — 배너의 [다시 시도]로만
  if (getKeepLocalKeys().includes(entityKey)) return; // 이 기기에만 보관하기로 한 키
  PENDING_PUSH.add(entityKey);
  apiRequest(`/api/photos/${encodeURIComponent(entityKey)}`, {
    method: 'PUT',
    body: JSON.stringify({ photos }),
  })
    .then(() => {
      setDirty(entityKey, false);
      // 빈 배열(삭제 tombstone) 전송 성공 — 재전송 대기 목록에서 제거
      if (photos.length === 0) setTombstone(entityKey, false);
    })
    .catch(e => {
      setDirty(entityKey, true);
      // 4xx(401/403 세션·408/429 일시 제외)는 재시도해도 같다 — 용량 초과(413) 등. 거부로 표시해 배너가 알리고 자동 재전송은 멈춘다
      if (e instanceof AuthApiError && e.status >= 400 && e.status < 500 && ![401, 403, 408, 429].includes(e.status)) {
        REJECTED_PUSH.set(entityKey, e.status);
        emitSync();
      }
      console.error(`[NAS] 사진 동기화 실패 (${entityKey}):`, e);
    })
    .finally(() => PENDING_PUSH.delete(entityKey));
}

/**
 * NAS에서 사진을 내려받아 로컬 캐시를 갱신한다 (다른 기기에서 올린 사진 반영).
 * 규칙:
 *  - dirty(푸시 실패분 보유) 키 → 로컬이 정본, 서버로 재푸시
 *  - 서버에 행이 있으면(빈 배열 = 삭제 tombstone 포함) 서버가 정본
 *  - 서버에 행이 없고 로컬에 사진이 있으면 로컬을 올린다 (최초 마이그레이션)
 * @returns changed: 로컬 캐시가 바뀌었음 / fetchFailed: 서버 조회 실패로 로컬 캐시만 보이는 상태
 */
export async function syncPhotosFromNas(entityKeys: string[]): Promise<PhotoSyncResult> {
  if (!isAuthApiConfigured) return SYNC_NOOP;
  await photoCacheReady; // 이관 전에 빈 로컬을 정본으로 올리지 않도록

  // 삭제 tombstone 재전송 — 삭제된 엔티티는 entityKeys에 없으므로 여기서 재시도
  for (const key of getTombstoneKeys()) {
    pushToNas(key, []);
  }
  if (entityKeys.length === 0) return SYNC_NOOP;

  const dirty = new Set(getDirtyKeys());
  const evicted = new Set(getEvictedKeys());
  for (const key of entityKeys) {
    if (!dirty.has(key)) continue; // 이 기기 보관 키는 keepRejectedPhotosLocal이 dirty를 지웠으므로 여기서도 건너뛴다
    const local = await peekCache(key);
    if (local === null) continue; // 로컬을 읽지 못했으면 빈 배열을 올리지 않는다 (서버본 보호)
    if (local.length === 0 && evicted.has(key)) {
      // 용량 초과로 캐시가 비워진 것이지 삭제가 아니다 — 서버본을 정본으로 두고 표식만 정리
      setDirty(key, false);
      setEvicted(key, false);
      continue;
    }
    pushToNas(key, local);
  }
  const keepLocal = new Set(getKeepLocalKeys());
  const cleanKeys = entityKeys.filter(k => !dirty.has(k) && !keepLocal.has(k)); // 이 기기에만 보관하는 키는 서버본으로 덮어쓰지 않는다
  if (cleanKeys.length === 0) return SYNC_NOOP;

  let changed = false;
  let fetchFailed = false;

  // 배치 조회 (500키 단위) — 시술기록 수백 건에서 왕복 폭주 방지
  for (let i = 0; i < cleanKeys.length; i += 500) {
    const chunk = cleanKeys.slice(i, i + 500);
    let entries: Record<string, PhotoEntry[]>;
    try {
      const response = await apiRequest<{ entries: Record<string, PhotoEntry[]> }>(
        '/api/photos/batch',
        { method: 'POST', body: JSON.stringify({ keys: chunk }) },
      );
      entries = response.entries;
    } catch {
      fetchFailed = true;
      continue; // 네트워크 실패 — 로컬 캐시 그대로 사용(호출 쪽은 fetchFailed로 안내)
    }

    for (const entityKey of chunk) {
      const remote = entries[entityKey]; // undefined = 서버에 행 없음
      const local = await peekCache(entityKey);
      if (local === null) continue; // 로컬 읽기 실패 — 판단 보류
      if (remote !== undefined) {
        if (JSON.stringify(remote) !== JSON.stringify(local)) {
          try {
            writeCache(entityKey, remote);
            setEvicted(entityKey, false);
            changed = true;
          } catch { /* 로컬 캐시 용량 초과(localStorage 폴백) — 서버본은 남아 있으므로 무시 */ }
        }
      } else if (local.length > 0) {
        pushToNas(entityKey, local);
      }
    }
  }

  return { changed, fetchFailed };
}

/**
 * 해당 엔티티에 저장된 사진(base64 data URL) 목록 반환 (동기).
 * IndexedDB 백엔드에서 아직 메모리에 없는 키는 []를 돌려주고 비동기로 채운다 — 화면은 usePhotoCacheVersion()으로 구독해 다시 그린다.
 */
export function getPhotos(entityKey: string): PhotoEntry[] {
  return readCache(entityKey);
}

/**
 * 로컬 사진 캐시 비우기 (NAS 모드 전용) — 서버가 정본이므로 다른 엔티티의 캐시는 다음 동기화 때 다시 받는다.
 * dirty(미전송)·전송 중·현재 엔티티는 남긴다. 모바일 WebView(localStorage 5~10MB)에서 "용량 초과" 막다른 길을 없앤다.
 * @returns 비운 엔티티 수
 */
function evictPhotoCache(keepEntityKey?: string): number {
  if (!isAuthApiConfigured || backend !== 'ls') return 0; // IndexedDB 백엔드는 용량 여유가 커서 비우지 않는다
  const dirty = new Set(getDirtyKeys());
  const keepLocal = new Set(getKeepLocalKeys()); // 이 기기에만 보관하는 사진은 서버에 없다 — 비우면 유일본이 사라진다 (리뷰 2026-11-19)
  let evicted = 0;
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(PREFIX) || key === DIRTY_KEY) continue; // dirty 목록 자체는 PREFIX로 시작하는 메타키
    const entityKey = key.slice(PREFIX.length);
    // 현재 저장 중·미전송(dirty)·전송 진행 중·이 기기 보관 엔티티는 서버에 원본이 없으므로 비우지 않는다
    if (entityKey === keepEntityKey || dirty.has(entityKey) || PENDING_PUSH.has(entityKey) || keepLocal.has(entityKey)) continue;
    try {
      localStorage.removeItem(key);
      setEvicted(entityKey, true);
      evicted += 1;
    } catch { /* noop */ }
  }
  return evicted;
}

/** 사진 목록 저장(덮어쓰기) — NAS 설정 시 서버에도 백업 */
export function setPhotos(entityKey: string, photos: PhotoEntry[]): void {
  setKeepLocal(entityKey, false); // 기록을 다시 저장하면(사진을 줄였을 수 있음) 다시 서버에 올려 본다
  try {
    writeCache(entityKey, photos);
  } catch (e) {
    // 용량 초과(QuotaExceeded): NAS 모드면 다른 캐시를 비우고 1회 재시도 (서버 정본은 그대로)
    const evicted = evictPhotoCache(entityKey);
    if (evicted > 0) {
      try {
        writeCache(entityKey, photos);
        console.warn(`[photoStore] 로컬 캐시 ${evicted}건 비우고 저장 (서버 동기화는 유지)`);
        pushToNas(entityKey, photos);
        return;
      } catch { /* 아래 throw */ }
    }
    // 로컬 모드이거나 비워도 부족 — 조용히 실패하지 않고 상위에서 처리하도록 throw (NAS 백업은 계속 시도)
    pushToNas(entityKey, photos);
    throw e;
  }
  pushToNas(entityKey, photos);
}

/** 엔티티의 모든 사진 삭제 (레코드 삭제 시 정리용) — NAS에서도 삭제 */
export function clearPhotos(entityKey: string): void {
  setKeepLocal(entityKey, false);
  try { writeCache(entityKey, []); } catch { /* noop */ }
  if (!isAuthApiConfigured) return;
  // 즉시 push가 실패해도 sync 때 재전송되도록 먼저 tombstone 목록에 등재
  setTombstone(entityKey, true);
  pushToNas(entityKey, []);
}

export type PhotoAngle = 'front' | 'left' | 'right' | 'other';
export type PhotoLabel = 'before' | 'after';

export const PHOTO_ANGLES: { id: PhotoAngle; label: string }[] = [
  { id: 'front', label: '정면' },
  { id: 'left', label: '좌측' },
  { id: 'right', label: '우측' },
  { id: 'other', label: '기타' },
];
export const PHOTO_LABELS: { id: PhotoLabel; label: string }[] = [
  { id: 'before', label: '시술 전' },
  { id: 'after', label: '시술 후' },
];

export interface PhotoEntry {
  id: string;
  dataUrl: string;   // base64 data URL (리사이즈됨)
  label?: PhotoLabel | string; // 시술 전/후 (구데이터 호환으로 string 허용)
  angle?: PhotoAngle;          // 촬영 각도 — 같은 각도끼리 Before/After 비교·촬영 가이드 (2026-11-17)
  takenAt: string;   // ISO 날짜 (촬영/업로드 시각)
}

/**
 * 이미지 파일을 최대 maxDim 픽셀로 리사이즈하고 JPEG로 압축해 base64 반환.
 * 원본이 세로/가로 어느 쪽이든 긴 변을 maxDim에 맞춘다.
 */
export function resizeImageFile(file: File, maxDim = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('이미지 파일이 아닙니다.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('캔버스를 생성할 수 없습니다.')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** 간단한 사진 ID 생성기 (Date.now 회피 불필요 — 런타임 UI 전용) */
export function makePhotoId(): string {
  return `ph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
