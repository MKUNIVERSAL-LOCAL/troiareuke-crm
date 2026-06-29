// 기능 노출 플래그 (기기 로컬 저장). 관리자가 설정 화면에서 켜고/끌 수 있다.
// 비컨(피부 상담) 기능은 비컨 API 연동이 확정되기 전까지 기본 OFF(숨김).
// ⚠️ 현재는 기기(브라우저)별 저장 — 비컨 연동 확정 시 shop_settings 동기화로 승격 예정.

const BEACON_KEY = 'feature_beacon_consultation';
const EVENT = 'feature-flags-changed';

export function isBeaconConsultationEnabled(): boolean {
  try {
    return localStorage.getItem(BEACON_KEY) === '1';
  } catch {
    return false;
  }
}

export function setBeaconConsultationEnabled(on: boolean): void {
  try {
    localStorage.setItem(BEACON_KEY, on ? '1' : '0');
  } catch {
    /* localStorage 불가 환경 무시 */
  }
  // 같은 창의 다른 컴포넌트가 즉시 반영하도록 이벤트 발행
  window.dispatchEvent(new CustomEvent(EVENT));
}

// 플래그 변경 구독. 해제 함수를 반환.
export function onFeatureFlagsChanged(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
