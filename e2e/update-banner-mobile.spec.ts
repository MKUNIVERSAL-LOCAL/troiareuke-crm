import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard } from './helpers';

/**
 * 모바일 앱 새 버전 안내 띠 (321, 318~320 리뷰 H-3) — `check:testids` 의 **마지막 면제**였던 칸이다.
 * 320 은 "앱 런타임이 필요하다, 전역 주입은 번들이 덮어쓴다" 고 적었는데 그 실측이 **틀렸다**:
 * `window.Capacitor` 를 덮어쓰는 길은 막히지만, `@capacitor/core` 가 공식으로 보는
 * `window.CapacitorCustomPlatform` 를 심으면 `Capacitor.getPlatform()` 이 'android' 가 되고
 * `IS_MOBILE_APP` 이 true 로 평가된다(리뷰가 HashRouter 로 바뀌는 것까지 확인했다).
 * 그래서 이 띠는 브라우저에서도 띄울 수 있다 — 면제가 아니라 스펙으로 지킨다.
 *
 * 보는 것: ① 선택 업데이트 띠의 버전·현재 버전 문구 ② [나중에]로 닫히고 다시 열어도 안 뜬다(24시간)
 * ③ 최소 지원 버전 미만이면 **닫기 단추가 없는** 필수 업데이트 띠 ④ PC(웹)에서는 아예 렌더되지 않는다.
 */

const MANIFEST = 'https://crm-update.mkcorp.familyds.com/mobile/latest.json';
const acc = makeAccount('MU');

/** 번들의 @capacitor/core 가 공식으로 보는 전역 — `window.Capacitor` 덮어쓰기와 달리 지워지지 않는다 */
const asAndroidApp = (page: import('@playwright/test').Page) => page.addInitScript(() => {
  (window as unknown as { CapacitorCustomPlatform?: unknown }).CapacitorCustomPlatform = { name: 'android', plugins: {} };
});

test('모바일 앱에서 새 버전 안내 띠가 뜨고, 닫으면 다시 안 뜨고, 최소 지원 버전 미만이면 닫을 수 없다', async ({ page }) => {
  test.slow(); // 띠는 로드 4초 뒤에 확인한다(앱 첫 화면을 가리지 않으려는 지연)
  page.on('dialog', d => d.accept());

  let manifest = { version: '9.9.9', minSupportedVersion: '0.0.0', android: { storeUrl: 'https://play.example.test/app' } };
  await page.route(MANIFEST + '**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(manifest) }));

  // 가입·온보딩은 웹 모드로(앱 모드는 HashRouter 라 가입 경로가 달라진다)
  await signupAndOnboard(page, acc);

  // 여기서부터 앱 런타임처럼 — 다시 열면 번들이 'android' 로 판정한다
  await asAndroidApp(page);
  await page.reload();
  const banner = page.getByTestId('mobile-update-banner');
  await expect(banner).toContainText('새 버전 9.9.9', { timeout: 20_000 });
  await expect(banner).toContainText('스토어에서 업데이트하면');
  // 324(321~323 리뷰 L-7): 머리말은 "현재 버전 문구" 를 본다고 적었는데 보지 않았다 — 폴백이 `0.0.0` 같은
  // **틀린 비어 있지 않은** 값으로 돌아가도 통과했다. 이 앱의 실제 버전 모양(`현재 1.x.y`)을 본다.
  await expect(banner).toContainText(/현재 1\.\d+\.\d+/);
  await expect(banner.getByRole('button', { name: '닫기' })).toBeVisible();

  // 닫으면 같은 버전은 하루 동안 다시 뜨지 않는다
  await banner.getByRole('button', { name: '닫기' }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('mobile-update-banner')).toHaveCount(0, { timeout: 20_000 });

  // 최소 지원 버전 미만 → 닫기 단추가 없는 필수 업데이트 띠(닫아 둔 기록이 있어도 뜬다)
  manifest = { version: '9.9.9', minSupportedVersion: '99.0.0', android: { storeUrl: 'https://play.example.test/app' } };
  await page.reload();
  const required = page.getByTestId('mobile-update-banner');
  await expect(required).toContainText('앱 업데이트가 필요합니다', { timeout: 20_000 });
  await expect(required).toContainText('더 이상 지원되지 않아');
  await expect(required.getByRole('button', { name: '닫기' })).toHaveCount(0);
});

test('PC(웹)에서는 모바일 앱 업데이트 띠를 만들지 않는다', async ({ page }) => {
  // 같은 매니페스트를 돌려줘도 앱이 아니면 띠가 없다 — IS_MOBILE_APP 분기가 살아 있는지 본다
  await page.route(MANIFEST + '**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ version: '9.9.9', minSupportedVersion: '99.0.0' }),
  }));
  await signupAndOnboard(page, makeAccount('MW'));
  await page.waitForTimeout(5000); // 띠의 4초 지연을 지나서 확인한다
  await expect(page.getByTestId('mobile-update-banner')).toHaveCount(0);
});
