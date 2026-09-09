import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 모바일 앱(Play 스토어·App Store) 래퍼 설정 — 비코어.
 *
 * ⚠️ appId는 스토어 등록 후 영구 고정(변경 = 다른 앱으로 취급, 기존 설치자 업데이트 불가).
 *    scripts/check-distribution-invariants.mjs 가 이 값을 감시한다.
 * webDir은 `npm run build:mobile`(BUILD_TARGET=capacitor, base './', PWA 비활성)의 산출물.
 */
const config: CapacitorConfig = {
  appId: 'com.troiareuke.crm',
  appName: '더마솔루션',
  webDir: 'dist-mobile',
  server: {
    // Android WebView 원본을 https://localhost 로 — Secure Context(카메라·클립보드) 보장, CSP 'self'로 처리
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'automatic',
  },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#1a3a8f' },
  },
};

export default config;
