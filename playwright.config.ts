import { defineConfig, devices } from '@playwright/test';

// 358(352~354 리뷰 H-1 로 드러난 CI 실패): 아래 `timezoneId` 는 **브라우저**만 서울로 못 박는다.
// `tomorrow` 같은 날짜를 만드는 것은 **테스트 프로세스**이고, 그쪽은 러너의 지역시각을 쓴다 —
// 깃허브 러너는 UTC 라서 한국 시간 00~09시에는 node 가 "어제" 를, 화면이 "오늘" 을 가리켜
// 하루가 어긋났다(캠페인 실행 창이 대상 0명으로 열리지 않고, 직원별 열의 예약 블록이 0개였다).
// 338 이 고친 "UTC 날짜로 오늘을 만든 것" 과 같은 종류다. 두 쪽을 같은 시간대로 묶는다.
process.env.TZ = 'Asia/Seoul';

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
    // clipboard 권한: 마감 요약·안내 문구 [복사] 경로를 실제 클립보드로 검증 (2026-11-17)
    { name: 'chromium', use: { ...devices['Desktop Chrome'], permissions: ['clipboard-read', 'clipboard-write'] }, testIgnore: /mobile.spec.ts|admin-nas.spec.ts|branch-nas.spec.ts/ },
    // 모바일 최적화 게이트(mobile.spec) — 스토어 앱과 같은 화면 폭. 오너 원칙: 릴리스마다 필수 통과
    // 가짜 카메라(--use-fake-*-media-stream): 촬영 가이드 오버레이의 getUserMedia → 캔버스 캡처 경로를 실제로 통과시킨다
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } }, testMatch: /(mobile|screenshots).spec.ts/ },
    // 어드민 콘솔(NAS 흉내) — 중앙 서버 모드 빌드(dist-e2e-nas, 4174)를 따로 띄우고 서버 응답은 page.route 로 전부 가로챈다 (8차 어드민 점검 2026-11-20)
    { name: 'admin-nas', use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4174', serviceWorkers: 'block' }, testMatch: /(admin|branch)-nas.spec.ts/ }, // SW 가 가로채는 요청은 page.route 가 못 본다 — 차단해야 실제 NAS 로 새지 않는다 (리뷰 2026-11-20)
  ],
  webServer: [
    {
      command: 'npx vite preview --outDir dist-e2e --port 4173 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npx vite preview --outDir dist-e2e-nas --port 4174 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
