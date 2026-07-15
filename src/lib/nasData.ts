/**
 * NAS 중앙 서버 데이터 동기화 드라이버.
 *
 * UI 스토어는 동기 API를 유지하므로 변경을 localStorage outbox에 먼저 기록한 뒤
 * 서버로 순서대로 전송한다. 네트워크가 끊기면 큐를 보존하고, 다음 원격 로드 전에
 * 반드시 재전송하여 오래된 서버 데이터가 최신 로컬 변경을 덮지 않게 한다.
 */
import { apiRequest, isAuthApiConfigured } from './authApi';

export const isNasDataConfigured = isAuthApiConfigured;

const OUTBOX_PREFIX = 'troiareuke_nas_outbox_';
const MAX_BULK_ROWS = 2000;

interface NasMutation {
  id: string;
  path: string;
  method: 'PUT' | 'PATCH' | 'DELETE';
  body?: string;
  createdAt: string;
}

function currentBranchId(): string {
  try {
    const raw = localStorage.getItem('troiareuke_auth_user');
    const user = raw ? JSON.parse(raw) : null;
    return String(user?.role === 'superadmin' ? 'superadmin' : user?.branchId || user?.id || 'unknown');
  } catch {
    return 'unknown';
  }
}

function outboxKey(): string {
  return `${OUTBOX_PREFIX}${currentBranchId()}`;
}

function readOutbox(key = outboxKey()): NasMutation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOutbox(key: string, mutations: NasMutation[]): void {
  if (mutations.length === 0) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(mutations));
}

function mutationId(): string {
  return globalThis.crypto?.randomUUID?.()
    || `nas_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function enqueue(path: string, method: NasMutation['method'], body?: string): void {
  const key = outboxKey();
  const queue = readOutbox(key);
  queue.push({ id: mutationId(), path, method, body, createdAt: new Date().toISOString() });
  try {
    writeOutbox(key, queue);
  } catch (error) {
    window.dispatchEvent(new CustomEvent('crm:nas-outbox-error'));
    throw error;
  }
  void flushNasOutbox().catch(error => console.error('[NAS] outbox 전송 실패:', error));
}

let flushPromise: Promise<void> | null = null;

/** 현재 지점의 대기 변경을 생성 순서대로 전송한다. 실패한 항목부터 큐에 남긴다. */
export function flushNasOutbox(): Promise<void> {
  if (!isAuthApiConfigured) return Promise.resolve();
  if (flushPromise) return flushPromise;

  const key = outboxKey();
  flushPromise = (async () => {
    while (true) {
      const next = readOutbox(key)[0];
      if (!next) return;
      await apiRequest(next.path, {
        method: next.method,
        ...(next.body === undefined ? {} : { body: next.body }),
      });
      // 전송 중 새 항목이 추가될 수 있으므로 현재 큐를 다시 읽고 완료 ID만 제거한다.
      writeOutbox(key, readOutbox(key).filter(item => item.id !== next.id));
    }
  })().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}

/** 컬렉션 전체 로드. 실패 시 null (localStorage 폴백 신호). */
export async function nasLoad(collection: string): Promise<Record<string, any>[] | null> {
  try {
    // 로컬 변경이 남아 있으면 먼저 반영한다. 실패 시 원격을 읽지 않아 덮어쓰기를 막는다.
    await flushNasOutbox();
    const response = await apiRequest<{ rows: Record<string, any>[] }>(`/api/data/${collection}`);
    return response.rows;
  } catch (error) {
    console.error(`[NAS] ${collection} 로드 실패:`, error);
    return null;
  }
}

/**
 * 최초 이관은 서버의 단일 트랜잭션 한 번으로 처리한다.
 * 부분 청크 성공 후 다음 실행이 이관 완료로 오인하는 것을 방지한다.
 */
export async function nasBulkUpsert(collection: string, rows: Record<string, any>[]): Promise<void> {
  if (rows.length > MAX_BULK_ROWS) {
    throw new Error(`${collection} 이관 행 수가 ${MAX_BULK_ROWS.toLocaleString()}개를 초과했습니다. 관리자 이관이 필요합니다.`);
  }
  await apiRequest(`/api/data/${collection}`, {
    method: 'PUT',
    body: JSON.stringify({ rows }),
  });
}

export function nasUpsert(collection: string, row: Record<string, any>): void {
  enqueue(`/api/data/${collection}`, 'PUT', JSON.stringify({ rows: [row] }));
}

export function nasUpdate(collection: string, id: string, updates: Record<string, any>): void {
  enqueue(`/api/data/${collection}/${encodeURIComponent(id)}`, 'PATCH', JSON.stringify({ updates }));
}

export function nasDelete(collection: string, id: string): void {
  enqueue(`/api/data/${collection}/${encodeURIComponent(id)}`, 'DELETE');
}
