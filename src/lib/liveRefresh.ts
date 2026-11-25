/**
 * 서버(NAS) 데이터 재조회 — 코어 store 는 세션당 1회만 서버를 읽어(initializeStores 의 _initialized 가드) 다른 기기(폰/PC)의 변경이
 * 앱을 완전히 재시작할 때까지 보이지 않았다(16차 점검 #H3, 2026-11-24): 폰에서 잡은 예약이 PC 에 없어 같은 시간에 이중 예약, 폰에서 등록한 고객 2중 등록.
 * 코어를 고치지 않고 resetStoreCache() + initializeStores() 를 다시 부른다. 안전성:
 *  - 미전송 outbox 가 있으면 먼저 flush 하고, 그래도 남으면 건너뛴다(nasLoad 도 큐가 남으면 null — 이 기기의 변경을 서버 옛 상태로 덮지 않는다).
 *  - reset 직후 getAll() 은 localStorage 폴백(모든 쓰기가 같은 내용을 saveList 로 저장) → 화면이 비는 순간이 없다.
 *  - 열려 있는 수정 폼은 React 상태라 영향 없음. 저장은 바뀐 칸만 보내(#H1) 다른 기기의 다른 칸을 보존한다.
 * 로컬 모드(서버 없음)에서는 아무 일도 하지 않는다.
 */
import { initializeStores, resetStoreCache, getShopId } from './store';
import { isNasDataConfigured, nasLoad } from './nasData';
import { flushNasOutbox, pendingNasOutboxCount, listRejectedNasOutbox, OUTBOX_CHANGED_EVENT } from './nasOutbox';
import { resetConsultationCache } from './consultationStore';
import { resetExpenseCache } from './expenseStore';

/** 코어 store.ts NAS_LOCAL_KEYS 와 같은 표(서버 컬렉션 → localStorage 키 접미사) — 코어를 import 할 수 없어 복제(131 리뷰 H1·H2) */
const SERVER_TABLES: ReadonlyArray<readonly [table: string, localKey: string]> = [
  ['customers', 'customers'],
  ['programs', 'programs'],
  ['customer_programs', 'customer_programs'],
  ['treatment_logs', 'treatment_logs'],
  ['products', 'products'],
  ['product_sales', 'product_sales'],
  ['payments', 'payments'],
  ['staff', 'staff'],
  ['services', 'services'],
  ['reservations', 'reservations'],
  ['message_templates', 'msg_templates'],
  ['message_history', 'msg_history'],
];
/**
 * 데이터 키만 — 보조 키(crm_last_sync_at 등)에 반응하면 두 탭이 서로의 재조회 시각 기록에 끝없이 재조회한다 (127~130 리뷰 #H1).
 * 코어 테이블 13종은 코어 캐시 리셋 + initializeStores(서버 모드는 서버 기준 재조회). 비코어 로컬 테이블(예약 요청함·캠페인 발송 기록·재고 원장·상담·지출)은
 * 서버 재조회 없이 비코어 모듈 캐시만 버리고 화면에 알린다 — 다른 탭이 요청을 접수·거절하거나 발송·입고·상담·지출을 기록해도 이 탭이 같이 바뀌고,
 * 옛 캐시 배열로 덮어쓰는 유실(16차 #M8 패턴)이 없다 (200·203, 199 리뷰 M-1 ③, 200 리뷰 M-1·L-2)
 */
const CORE_DATA_KEY = /^crm_.+_(customers|programs|customer_programs|treatment_logs|products|product_sales|payments|staff|services|reservations|msg_templates|msg_history|settings)$/;
const LOCAL_DATA_KEY = /^crm_.+_(booking_requests|campaign_sends|stock_ledger|consultations|expenses)$/;

/** 서버에서 다시 읽은 뒤 window 에 보낸다 — 목록을 가진 화면은 useDataRefreshed 로 받아 다시 그린다 */
export const DATA_REFRESHED_EVENT = 'crm:data-refreshed';
const MIN_INTERVAL_MS = 5_000;   // 포커스·가시성 이벤트는 연달아 오므로 묶는다
const PERIOD_MS = 60_000;        // 화면을 켜 둔 PC — 1분마다

let inFlight: Promise<boolean> | null = null;
let lastAt = 0;
let wroteDuringRefresh = false; // 재조회(13 GET) 사이에 저장이 있었으면 서버 응답이 그 저장을 모른다 — 끝난 뒤 한 번 더 (리뷰 #M1)

/**
 * 재조회 전 서버 상태 확인(리뷰 #M2·#H2):
 *  - 한 컬렉션이라도 못 읽으면(null: 불통·큐 잔존) reset 하지 않는다 — 전에는 13 GET 이 전부 실패해도 코어가 "동기화 시각"을 갱신하고 true 를 돌려줬다.
 *  - 서버가 0건인 컬렉션의 로컬 사본은 미리 비운다. 코어 loadFromSupabase 는 "서버 0건 + 로컬 행" 이면 최초 전환용 로컬→서버 이관을 다시 실행해,
 *    다른 기기가 지운 마지막 기록을 재조회마다 부활시켰다. 첫 로드가 아닌 재조회에서 내 미전송·거부분이 없으면 로컬 사본이 옛것이다.
 *  (비용: GET 12건 — 코어가 reloadStores() 를 제공하면 없앨 수 있다, 코어 메모 ⑬)
 */
async function probeServer(): Promise<boolean> {
  const keepLocal = listRejectedNasOutbox().length > 0; // 이관 실패분이 거부 목록에 있을 수 있다 — 로컬을 비우지 않는다
  const shopId = getShopId();
  for (const [table, localKey] of SERVER_TABLES) {
    const rows = await nasLoad(table);
    if (rows === null) return false;
    if (rows.length > 0 || keepLocal) continue;
    const key = `crm_${shopId}_${localKey}`;
    try {
      const local = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(local) && local.some((r: { id?: unknown }) => r?.id && !String(r.id).startsWith('sample_'))) {
        localStorage.setItem(key, '[]');
        console.warn(`[liveRefresh] 서버가 비운 ${table} 의 로컬 사본 ${local.length}건을 비움(다른 기기 삭제 반영, 재이관 방지)`);
      }
    } catch { /* 깨진 사본은 코어 getList 가 처리 */ }
  }
  return true;
}

/** 서버를 다시 읽고 화면에 알린다. 읽었으면 true. force 는 연결 복구·당겨서 새로고침처럼 사용자가 기대하는 즉시 갱신에만 */
export function refreshFromServer(opts: { force?: boolean } = {}): Promise<boolean> {
  if (!isNasDataConfigured) return Promise.resolve(false);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(false);
  if (inFlight) return opts.force ? inFlight.then(() => refreshFromServer(opts)) : inFlight; // 강제 갱신은 진행 중인 읽기(이전 상태) 뒤에 한 번 더
  if (!opts.force && Date.now() - lastAt < MIN_INTERVAL_MS) return Promise.resolve(false);
  inFlight = (async () => {
    try {
      if (pendingNasOutboxCount() > 0) {
        await flushNasOutbox().catch(() => { /* 일시 오류 — 아래에서 큐 잔존으로 판단 */ });
        if (pendingNasOutboxCount() > 0) return false; // 이 기기의 변경이 아직 서버에 없다 — 서버 상태로 덮지 않는다
      }
      if (!(await probeServer())) return false;
      wroteDuringRefresh = false;
      resetStoreCache();
      await initializeStores();
      lastAt = Date.now();
      window.dispatchEvent(new CustomEvent(DATA_REFRESHED_EVENT));
      if (wroteDuringRefresh) { lastAt = 0; window.setTimeout(() => { void refreshFromServer({ force: true }); }, 0); } // 재조회 중 저장분을 서버 기준으로 다시
      return true;
    } catch (e) {
      console.error('[liveRefresh] 서버 재조회 실패:', e);
      return false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * 같은 PC 에서 창/탭을 2개 띄운 경우(웹·PWA, 포터블 2중 실행 추정) — 다른 탭이 localStorage 에 저장하면 이 탭의 메모리 캐시가 옛것이 되고,
 * 다음 저장이 전체 배열을 옛 캐시로 덮어 다른 탭의 고객이 사라졌다(로컬 모드는 서버가 없어 복구 불가, 16차 #M8).
 * storage 이벤트(다른 탭의 쓰기에만 온다)로 캐시를 버리면 getAll() 이 localStorage 를 다시 읽는다. 양쪽 모드 공통.
 */
function startCrossTabInvalidation(): () => void {
  let timer = 0;
  let coreDirty = false;
  const onStorage = (e: StorageEvent) => {
    if (!e.key) return;
    const core = CORE_DATA_KEY.test(e.key);
    if (!core && !LOCAL_DATA_KEY.test(e.key)) return; // 데이터 키만 — outbox·세션·동기화 시각 키 제외 (#H1)
    if (core) coreDirty = true;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      resetConsultationCache(); resetExpenseCache(); // 비코어 모듈 캐시 — 어느 키든 함께 버린다(값싸고, 코어 키와 같은 동작에 섞여 쓰이기도) (203)
      const notify = () => window.dispatchEvent(new CustomEvent(DATA_REFRESHED_EVENT));
      if (!coreDirty) { notify(); return; } // 로컬 전용 테이블만 바뀜 — 서버엔 바뀐 것이 없어 12 GET 재조회를 돌리지 않는다 (200 리뷰 L-2)
      coreDirty = false;
      resetStoreCache();
      void initializeStores().finally(notify); // 로컬 모드는 즉시 반환, 서버 모드는 서버 기준으로
    }, 300); // 한 동작이 키 여러 개를 쓰므로 묶는다
  };
  window.addEventListener('storage', onStorage);
  return () => { window.clearTimeout(timer); window.removeEventListener('storage', onStorage); };
}

/** Layout 마운트 시 1회 — 포커스 복귀·가시성 복귀(폰 앱 재개)·연결 복구·outbox 비움·1분 주기. 해제 함수를 돌려준다 */
export function startLiveRefresh(): () => void {
  const stopCrossTab = startCrossTabInvalidation();
  if (!isNasDataConfigured) return stopCrossTab;
  const onFocus = () => { void refreshFromServer(); };
  const onVisible = () => { if (document.visibilityState === 'visible') void refreshFromServer(); };
  const onOnline = () => { void refreshFromServer({ force: true }); }; // 끊긴 동안 다른 기기가 바꾼 것을 바로
  const onOutbox = (e: Event) => {
    const count = (e as CustomEvent<{ count?: number }>).detail?.count;
    if (inFlight && typeof count === 'number' && count > 0) wroteDuringRefresh = true; // (#M1)
    if (count === 0) void refreshFromServer(); // 내 변경이 서버에 들어간 뒤 서버 기준으로
  };
  const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshFromServer(); }, PERIOD_MS);
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  window.addEventListener(OUTBOX_CHANGED_EVENT, onOutbox);
  return () => {
    stopCrossTab();
    window.clearInterval(timer);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
    window.removeEventListener(OUTBOX_CHANGED_EVENT, onOutbox);
  };
}
