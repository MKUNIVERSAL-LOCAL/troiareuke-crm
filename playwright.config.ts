import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 스모크 — 로컬 모드 빌드(dist-e2e)를 vite preview로 띄우고 핵심 사용 흐름을 브라우저로 통과시킨다.
 * 실행: npm run build:e2e && npm run test:e2e   (CI: client-ci.yml의 e2e 잡)
 * 배포 불변 원칙과 무관한 "기능 회귀" 안전망 — 파일럿 중 릴리스마다 핵심 흐름이 깨지지 않았음을 보장한다.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1366, height: 900 },
  },
  projects: [
    // PC 흐름(smoke.spec) — 데스크톱 폭
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile.spec.ts/ },
    // 모바일 최적화 게이트(mobile.spec) — 스토어 앱과 같은 화면 폭. 오너 원칙: 릴리스마다 필수 통과
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile.spec.ts/ },
  ],
  webServer: {
    command: 'npx vite preview --outDir dist-e2e --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
