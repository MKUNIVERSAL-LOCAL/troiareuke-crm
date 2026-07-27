/**
 * nasOutbox.ts — NAS 쓰기 전송 대기열 (오프라인 유실 방지)
 *
 * 모든 NAS 쓰기는 지점별 localStorage 큐에 먼저 기록된 뒤 순서대로 전송된다.
 * 전송 실패 시 큐가 보존되고, nasLoad(nasData.ts)는 큐를 모두 비운 뒤에만
 * 서버를 읽으므로 오래된 서버 상태가 미전송 로컬 변경을 덮는 경로가 차단된다.
 *
 * 순환 import 주의: authApi ↔ nasOutbox 사이클이 있으므로 이 모듈의 최상위에서는
 * authApi 바인딩을 평가하지 않는다 (함수 본문 안에서만 참조).
 */
import { apiRequest, isAuthApiConfigured, AuthApiError } from './authApi';

const OUTBOX_PREFIX = 'troiareuke_nas_outbox_';
const RETRY_INTERVAL_MS = 60_000;
const QUEUE_WARN_SIZE = 1_000;

export const OUTBOX_CHANGED_EVENT = 'crm:nas-outbox-changed';
export const OUTBOX_ERROR_EVENT = 'crm:nas-outbox-error';

interface NasMutation {
  id: string;
  path: string;
  method: 'PUT' | 'PATCH' | 'DELETE';
  body?: string;
  createdAt: string;
}

// store.ts getShopId()와 동일 규칙 — 코어 import를 피하기 위해 복제
function currentBranchId(): string {
  try {
    const raw = localStorage.getItem('troiareuke_auth_user');
    if (raw) {
      const user = JSON.parse(raw);
      if (user.role === 'superadmin') return 'superadmin';
      return user.branchId || user.id || 'default_shop';
    }
  } catch {}
  return 'default_shop';
}

function outboxKey(): string {
  return `${OUTBOX_PREFIX}${currentBranchId()}`;
}

function readOutbox(key: string): NasMutation[] {
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
  notifyChanged(mutations.length);
}

function notifyChanged(count: number): void {
  try {
    window.dispatchEvent(new CustomEvent(OUTBOX_CHANGED_EVENT, { detail: { count } }));
  } catch {}
}

function mutationId(): string {
  return globalThis.crypto?.randomUUID?.()
    || `nas_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function pendingNasOutboxCount(): number {
  return readOutbox(outboxKey()).length;
}

/** 전송 대기 항목 추가. quota 초과 시 큐 대신 기존 방식(즉시 전송)으로 폴백 — UI로 예외를 던지지 않는다. */
export function enqueueNasMutation(path: string, method: NasMutation['method'], body?: string): void {
  const key = outboxKey();
  const queue = readOutbox(key);
  queue.push({ id: mutationId(), path, method, body, createdAt: new Date().toISOString() });
  try {
    writeOutbox(key, queue);
  } catch (error) {
    // localStorage 용량 초과 — 큐잉을 포기하고 종전 fire-and-forget 전송으로 폴백
    console.error('[NAS] outbox 저장 실패(용량 초과 추정) — 직접 전송 폴백:', error);
    try { window.dispatchEvent(new CustomEvent(OUTBOX_ERROR_EVENT)); } catch {}
    apiRequest(path, { method, ...(body === undefined ? {} : { body }) })
      .catch(e => console.error(`[NAS] ${method} ${path} 전송 실패:`, e));
    return;
  }
  if (queue.length > QUEUE_WARN_SIZE) {
    console.warn(`[NAS] outbox 대기 ${queue.length}건 — 서버 연결 상태를 확인하세요.`);
  }
  ensureRetryLoop();
  void flushNasOutbox().catch(() => {}); // 실패분은 큐에 남아 재시도 루프·nasLoad가 처리
}

/** 재시도해도 소용없는 오류인가(항목 폐기 대상)? 네트워크·일시 오류는 큐 보존. */
function isPermanentRejection(error: unknown): boolean {
  if (!(error instanceof AuthApiError)) return false; // 네트워크 실패(fetch TypeError 등) — 보존
  const s = error.status;
  if (s >= 500 || s === 408 || s === 429) return false; // 서버 장애·일시 오류 — 보존
  if (s === 401 || s === 403) return false; // 세션 만료 — 재로그인 후 nasLoad 경유 재전송
  return true; // 400·404 등 — 재시도 무의미, 폐기 (큐 선두 봉쇄 방지)
}

let flushPromise: Promise<void> | null = null;

/**
 * 현재 지점의 대기 변경을 순서대로 전송한다.
 * 큐를 다 비웠을 때만 resolve — 잔존 시 reject하여 nasLoad가 원격 읽기를 포기하게 한다.
 */
export function flushNasOutbox(): Promise<void> {
  if (!isAuthApiConfigured) return Promise.resolve();
  if (flushPromise) return flushPromise;

  const key = outboxKey();
  if (readOutbox(key).length === 0) return Promise.resolve();
  ensureRetryLoop(); // 재시작 직후 큐가 남아있는 경우에도 복구 루프가 살아있게 한다

  flushPromise = (async () => {
    for (;;) {
      const next = readOutbox(key)[0];
      if (!next) return;
      try {
        await apiRequest(next.path, {
          method: next.method,
          ...(next.body === undefined ? {} : { body: next.body }),
        });
      } catch (error) {
        if (!isPermanentRejection(error)) throw error; // 일시 오류 — 큐 보존, 실패 전파
        console.error(`[NAS] ${next.method} ${next.path} 영구 실패 — 항목 폐기:`, error);
      }
      // 전송 중 새 항목이 추가될 수 있으므로 현재 큐를 다시 읽어 처리된 항목만 제거
      writeOutbox(key, readOutbox(key).filter(item => item.id !== next.id));
    }
  })().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}

let retryLoopStarted = false;

/** 네트워크 복구·주기 재시도 리스너 — 첫 사용 시 1회만 등록 */
function ensureRetryLoop(): void {
  if (retryLoopStarted) return;
  retryLoopStarted = true;
  try {
    window.addEventListener('online', () => {
      void flushNasOutbox().catch(() => {});
    });
    const timer: any = setInterval(() => {
      if (navigator.onLine && pendingNasOutboxCount() > 0) {
        void flushNasOutbox().catch(() => {});
      }
    }, RETRY_INTERVAL_MS);
    timer?.unref?.(); // Node(테스트) 환경에서 프로세스 유지 방지 — 브라우저에선 no-op
  } catch {}
}
