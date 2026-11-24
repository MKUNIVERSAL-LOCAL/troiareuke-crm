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
// 서버가 영구 거부한 저장분 — 재시작·로그아웃해도 남아 배너·다시 시도·내려받기에 쓴다.
// 코어 AuthContext의 로그아웃 wipe는 'troiareuke_nas_outbox_' 접두사만 보존하므로 그 아래에 둔다 (outboxKey()는 정확한 키만 읽어 충돌 없음)
const REJECTED_PREFIX = 'troiareuke_nas_outbox_rejected_';
const REJECTED_MAX = 200;
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

// ── 서버가 영구 거부(400/404 등)한 저장분 ─────────────────────────
// 화면에선 이미 "저장됨"으로 보였으므로 조용히 버리면 안 된다. 본문째 localStorage에 남겨
// 배너가 어떤 기록인지 보여주고, 서버를 고친 뒤 [다시 시도]하거나 JSON으로 [내려받기]할 수 있게 한다 (실패 경로 감사 2026-11-18)
export interface RejectedNasMutation extends NasMutation { status: number; rejectedAt: string }
function rejectedKey(): string { return `${REJECTED_PREFIX}${currentBranchId()}`; }
function readRejected(): RejectedNasMutation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(rejectedKey()) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
/** 변이가 다루는 기록 id — PATCH/DELETE는 경로 마지막 조각, PUT은 본문 rows[].id (리뷰 2026-11-19) */
function mutationRecordIds(m: NasMutation): string[] {
  if (m.method === 'PUT') {
    try {
      const rows = JSON.parse(m.body || '{}').rows;
      return Array.isArray(rows) ? rows.map((r: { id?: unknown }) => (r && r.id != null ? String(r.id) : '')).filter(Boolean) : [];
    } catch { return []; }
  }
  const last = m.path.split('/').pop() || '';
  if (!last) return [];
  try { return [decodeURIComponent(last)]; } catch { return [last]; }
}
/** @returns 저장 성공 여부 — 실패(용량 초과)면 호출 쪽이 유실을 알려야 한다 */
function writeRejected(list: RejectedNasMutation[]): boolean {
  try {
    if (list.length === 0) localStorage.removeItem(rejectedKey());
    else {
      if (list.length > REJECTED_MAX) console.warn(`[NAS] 거부 목록 ${list.length}건 — 오래된 ${list.length - REJECTED_MAX}건을 버립니다`);
      localStorage.setItem(rejectedKey(), JSON.stringify(list.slice(-REJECTED_MAX)));
    }
    return true;
  } catch (e) { console.error('[NAS] 거부 목록 저장 실패:', e); return false; }
}
export function listRejectedNasOutbox(): RejectedNasMutation[] { return readRejected(); }
export function clearRejectedNasOutbox(): void { writeRejected([]); }
/** 거부분을 대기열 **앞**에 원래 순서로 다시 넣는다 — 뒤에 넣으면 그 사이 쌓인 같은 기록의 PATCH(개명 등) 뒤에 옛 PUT 이 가서 덮었다 (16차 #L4). 서버를 업데이트한 뒤 쓰는 수동 재시도 */
export function retryRejectedNasOutbox(): number {
  const list = readRejected();
  if (list.length === 0) return 0;
  writeRejected([]);
  const key = outboxKey();
  const restored: NasMutation[] = list.map(m => ({ id: mutationId(), path: m.path, method: m.method, body: m.body, createdAt: m.createdAt }));
  try {
    writeOutbox(key, [...restored, ...readOutbox(key)]);
  } catch (error) {
    console.error('[NAS] 거부분 재투입 실패(용량 초과 추정) — 뒤에 하나씩 넣는다:', error);
    for (const m of list) enqueueNasMutation(m.path, m.method, m.body);
    return list.length;
  }
  ensureRetryLoop();
  void flushNasOutbox().catch(() => {});
  return list.length;
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
    // 대기열이 없으니 "자동 재시도"가 아니다 — 배너가 정직하게 말하도록 fallback 표식 (실패 경로 감사 2026-11-18)
    try { window.dispatchEvent(new CustomEvent(OUTBOX_ERROR_EVENT, { detail: { fallback: true } })); } catch {}
    apiRequest(path, { method, ...(body === undefined ? {} : { body }) })
      .catch(e => {
        console.error(`[NAS] ${method} ${path} 전송 실패:`, e);
        try { window.dispatchEvent(new CustomEvent(OUTBOX_ERROR_EVENT, { detail: { fallback: true, failed: true, path } })); } catch {}
      });
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
      if (!next) { try { localStorage.setItem('crm_last_sync_at', String(Date.now())); } catch { /* noop */ } return; } // 전송 성공으로 큐가 비면 동기화 시각 갱신 (16차 #L2)
      try {
        await apiRequest(next.path, {
          method: next.method,
          ...(next.body === undefined ? {} : { body: next.body }),
        });
      } catch (error) {
        if (!isPermanentRejection(error)) {
          // 세션 만료는 연결 복구로 풀리지 않는다 — 배너가 "자동 전송"이라고 하지 않게 알린다
          if (error instanceof AuthApiError && (error.status === 401 || error.status === 403)) {
            try { window.dispatchEvent(new CustomEvent(OUTBOX_ERROR_EVENT, { detail: { auth: true, status: error.status } })); } catch { /* noop */ }
          } else {
            // 서버 불통·5xx 도 알린다 — 전에는 아무 이벤트가 없어 배너가 몇 시간이고 "대기 중 — 자동으로 전송됩니다"만 보였다 (16차 #M7)
            const status = error instanceof AuthApiError ? error.status : 0;
            try { window.dispatchEvent(new CustomEvent(OUTBOX_ERROR_EVENT, { detail: { transient: true, status, since: next.createdAt } })); } catch { /* noop */ }
          }
          throw error; // 일시 오류 — 큐 보존, 실패 전파
        }
        const status = (error as AuthApiError).status;
        console.error(`[NAS] ${next.method} ${next.path} 영구 실패(${status}) — 거부 목록으로 이동:`, error);
        // 서버가 거부(400/404 — 구버전 서버가 모르는 컬렉션 등): 화면에선 이미 저장 성공으로 보였으므로 본문째 보존하고 반드시 알린다
        // 같은 사용자 동작(±1초)에서 함께 만들어진 뒤 항목 중 거부된 기록의 id를 참조하는 것(예: 회차권 PUT 뒤 referenceId가 그 회차권인 결제 PUT)은 부모 없이 보내지 않고 같이 보류한다 — 재시도 때 순서대로 다시 간다.
        // 시간만 같은 무관한 항목(일괄 완료·직원 이름 변경·가져오기의 수백 건)은 끌려가지 않는다 (정합성 감사 2026-11-19, 리뷰 반영)
        const t0 = Date.parse(next.createdAt);
        const recordIds = mutationRecordIds(next).map(id => JSON.stringify(id));
        const siblings = recordIds.length === 0 ? [] : readOutbox(key).filter(item => item.id !== next.id
          && Math.abs(Date.parse(item.createdAt) - t0) <= 1000
          && (recordIds.some(q => (item.body || '').includes(q)) || mutationRecordIds(item).some(id => recordIds.includes(JSON.stringify(id)))));
        const rejectedAt = new Date().toISOString();
        const prior = readRejected();
        const overflow = prior.length + 1 + siblings.length > REJECTED_MAX; // 상한을 넘겨 오래된 거부 항목이 밀려나면 그것도 유실이다
        const kept = writeRejected([...prior, { ...next, status, rejectedAt }, ...siblings.map(m => ({ ...m, status, rejectedAt }))]);
        if (siblings.length > 0) {
          console.error(`[NAS] 같은 동작의 후속 ${siblings.length}건도 함께 보류:`, siblings.map(m => `${m.method} ${m.path}`));
          writeOutbox(key, readOutbox(key).filter(item => !siblings.some(m => m.id === item.id)));
        }
        try { window.dispatchEvent(new CustomEvent(OUTBOX_ERROR_EVENT, { detail: { permanent: true, path: next.path, status, lost: !kept || overflow } })); } catch { /* noop */ }
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
