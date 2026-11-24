/**
 * 서버(NAS) 데이터 재조회 — 코어 store 는 세션당 1회만 서버를 읽어(initializeStores 의 _initialized 가드) 다른 기기(폰/PC)의 변경이
 * 앱을 완전히 재시작할 때까지 보이지 않았다(16차 점검 #H3, 2026-11-24): 폰에서 잡은 예약이 PC 에 없어 같은 시간에 이중 예약, 폰에서 등록한 고객 2중 등록.
 * 코어를 고치지 않고 resetStoreCache() + initializeStores() 를 다시 부른다. 안전성:
 *  - 미전송 outbox 가 있으면 먼저 flush 하고, 그래도 남으면 건너뛴다(nasLoad 도 큐가 남으면 null — 이 기기의 변경을 서버 옛 상태로 덮지 않는다).
 *  - reset 직후 getAll() 은 localStorage 폴백(모든 쓰기가 같은 내용을 saveList 로 저장) → 화면이 비는 순간이 없다.
 *  - 열려 있는 수정 폼은 React 상태라 영향 없음. 저장은 바뀐 칸만 보내(#H1) 다른 기기의 다른 칸을 보존한다.
 * 로컬 모드(서버 없음)에서는 아무 일도 하지 않는다.
 */
import { initializeStores, resetStoreCache } from './store';
import { isNasDataConfigured } from './nasData';
import { flushNasOutbox, pendingNasOutboxCount, OUTBOX_CHANGED_EVENT } from './nasOutbox';

/** 서버에서 다시 읽은 뒤 window 에 보낸다 — 목록을 가진 화면은 useDataRefreshed 로 받아 다시 그린다 */
export const DATA_REFRESHED_EVENT = 'crm:data-refreshed';
const MIN_INTERVAL_MS = 5_000;   // 포커스·가시성 이벤트는 연달아 오므로 묶는다
const PERIOD_MS = 60_000;        // 화면을 켜 둔 PC — 1분마다

let inFlight: Promise<boolean> | null = null;
let lastAt = 0;

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
      resetStoreCache();
      await initializeStores();
      lastAt = Date.now();
      window.dispatchEvent(new CustomEvent(DATA_REFRESHED_EVENT));
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
  const onStorage = (e: StorageEvent) => {
    if (!e.key || !e.key.startsWith('crm_')) return; // 데이터 키만(outbox·세션 키 제외)
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      resetStoreCache();
      void initializeStores().finally(() => window.dispatchEvent(new CustomEvent(DATA_REFRESHED_EVENT))); // 로컬 모드는 즉시 반환, 서버 모드는 서버 기준으로
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
  const onOutbox = (e: Event) => { if ((e as CustomEvent<{ count?: number }>).detail?.count === 0) void refreshFromServer(); }; // 내 변경이 서버에 들어간 뒤 서버 기준으로
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
