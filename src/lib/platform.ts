// 실행 플랫폼 감지 — 비코어. Electron(PC exe) / Capacitor(모바일 앱) / 웹(브라우저) 3원 분리.
// 모든 "모바일 앱에서만/PC에서만" 분기는 이 파일의 상수만 참조한다 (navigator.userAgent 직접 판별 금지).
import { Capacitor } from '@capacitor/core';

export type RuntimePlatform = 'electron' | 'android' | 'ios' | 'web';

const electronApi = (window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI;
const capacitorNative = (() => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
})();

export const IS_CAPACITOR: boolean = capacitorNative;
export const IS_ELECTRON: boolean = Boolean(electronApi?.isElectron) || (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron'));

export const PLATFORM: RuntimePlatform = IS_ELECTRON
  ? 'electron'
  : IS_CAPACITOR
    ? (Capacitor.getPlatform() === 'ios' ? 'ios' : 'android')
    : 'web';

/** 스토어 배포 모바일 앱(Play/App Store) 안에서 실행 중 */
export const IS_MOBILE_APP = IS_CAPACITOR;
/** file:// 또는 capacitor 스킴 — BrowserRouter 불가, HashRouter 필수 */
export const USE_HASH_ROUTER = IS_ELECTRON || IS_CAPACITOR;

/**
 * 모바일 앱에서 숨겨야 하는 기능(스토어 심사·플랫폼 특성):
 *  - 구독/플랜 결제 화면: Apple 3.1.1(외부 결제 유도 금지), Google Play 결제 정책 → 결제는 PC/웹에서만
 *  - PC 자가 업데이트 UI/백업 폴더: 데스크톱 전용 개념
 *  - 관리자 콘솔: 모바일 앱은 지점용 (BLOCK_ADMIN_UI)
 */
export const HIDE_ON_MOBILE = {
  subscription: IS_MOBILE_APP,
  storeLinks: IS_MOBILE_APP,      // 타사 앱 스토어 링크 배너 (자사 앱 안에서 다른 스토어 페이지로 보내지 않음)
  desktopBackup: IS_MOBILE_APP,
} as const;

/** X-App-Mode 헤더 값 — 서버 텔레메트리(지점별 실행 버전/모드) */
export const APP_MODE_HEADER: string = PLATFORM === 'web' ? 'web' : PLATFORM;
