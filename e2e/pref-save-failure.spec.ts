import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard } from './helpers';

/**
 * 설정 저장 실패를 **화면이 사실대로 말하는지** (285, 282~284 리뷰 M-4 / CLAUDE.md §2 가짜 성공 금지)
 *
 * 284 는 되읽기 확인을 넣고 기록에 "저장 공간 초과를 e2e 에서 일부러 만들 수 없어 실패 경로는
 * 스펙이 돌려 보지 못했다" 고 적었다. **그 말이 사실이 아니었다** — `page.addInitScript` 로
 * 설정 행 키의 `setItem` 만 QuotaExceededError 를 던지게 하면 코어 `safeSetItem` 경로가
 * 그대로 재현된다(그 함수는 오류를 삼키고 커스텀 이벤트만 띄우므로 반환값·예외로는 알 수 없다).
 *
 * 이 스펙이 지키는 약속 두 가지:
 *  ① 저장되지 않았으면 "저장했습니다"·"마감했습니다" 를 **말하지 않는다**(실패 문구를 대신 적는다).
 *  ② 실패 문구가 적은 "지금 화면의 값은 프로그램을 다시 열면 사라집니다" 가 **사실이다** —
 *     새로고침 뒤 그 값이 정말 없는 것까지 본다.
 *
 * 화면이 메모리 값을 계속 보여 주는 것(목표 칸·마감 배지)은 거짓이 아니다 — 직원이 적은 것을
 * 지우지 않는 쪽이 맞고, 거짓이 되는 것은 **그것이 남는다고 말할 때**다. 그래서 ①②를 함께 본다.
 *
 * 290(285~287 리뷰 M-2): ③ 토스트는 4초면 사라지는데 배지는 남는다 — 그때 화면의 유일한 상태 표시가
 * "🔒 마감됨" 이면 그 화면은 사실이 아닌 말을 하고 있다. 배지 옆에 **"이 PC 에 저장 안 됨"** 이 함께
 * 남는 것을 본다.
 * 한계: 이 스펙은 로컬 모드 빌드(dist-e2e)에서만 돈다. 서버 모드에서는 같은 실패에 **다른 문구**가
 * 나가야 하는데(리뷰 H-1 — 서버에는 올라갔을 수 있다), 그 문구는 lib-units 가 고정하고 **화면에서는
 * 아직 돌려 보지 않았다**(서버 모드 게이트는 흉내 서버라 설정 행 왕복을 흉내 내지 않는다).
 */

const acc = makeAccount('PF');

test('설정 저장이 실패하면 성공이라 말하지 않고, 사라진다는 말이 사실이다 (285, 리뷰 M-4)', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);

  // 가입·온보딩이 끝난 **뒤에** 설정 행 쓰기만 막는다(앞에서 막으면 가입 자체가 안 된다)
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (/^crm_.*_settings$/.test(key)) throw new DOMException('quota (e2e 주입)', 'QuotaExceededError');
      return orig.call(this, key, value);
    };
  });
  await page.goto('/sales');

  const card = page.getByTestId('revenue-metrics');
  await expect(card).toBeVisible();

  // ── ① 월 매출 목표 ──
  await card.getByLabel(/매출 목표/).fill('100000');
  await card.getByRole('button', { name: '목표 저장' }).click();
  const targetToast = page.getByText(/월 매출 목표/).filter({ visible: true }).first();
  await expect(targetToast).toContainText('저장되지 않았습니다');
  await expect(targetToast).toContainText('다시 열면 사라집니다');
  await expect(page.getByText('목표를 100,000원으로 저장했습니다.')).toHaveCount(0);

  // ── ② 월 마감(세무 신고와 묶인 상태다) ──
  await card.getByRole('button', { name: '월 마감' }).click();
  await page.getByRole('dialog', { name: '월 마감', exact: true }).getByRole('button', { name: '마감', exact: true }).click();
  await expect(page.getByText(/마감.*저장되지 않았습니다/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/이제 그 달 숫자는 바뀌지 않습니다/)).toHaveCount(0);

  // ── ③ 토스트가 사라져도 화면에 사실이 남는다 (290, 리뷰 M-2) ──
  await expect(card.getByTestId('month-closed-badge')).toBeVisible();              // 메모리 상태는 마감이다
  await expect(card.getByTestId('month-close-unsaved')).toHaveText('이 PC 에 저장 안 됨'); // 그런데 남지 않았다는 사실도 함께 적는다

  // ── ④ 경고가 사실인지 — 새로고침하면 둘 다 없다 ──
  await page.reload();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('metric-achievement-sub')).toHaveText('목표를 아래에 적으세요'); // 목표가 남지 않았다
  await expect(card.getByTestId('month-closed-badge')).toHaveCount(0);                           // 마감도 남지 않았다
  await expect(card.getByRole('button', { name: '월 마감' })).toBeVisible();                     // 다시 마감할 수 있는 상태

  // ── ⑤ 290(리뷰 H-2): 새 자리에 남지 않으면 **예전 자리를 지우지 않는다** ──
  // 예전 PC별 결제수단 목록을 심어 두고 이관을 돌린다. 설정 행 쓰기는 여전히 막혀 있으므로 이관은 실패하는데,
  // 290 전에는 그래도 예전 키를 지웠다 — 로컬 모드에는 사본이 없어 그 목록이 영구 소실됐다.
  await page.addInitScript(() => {
    localStorage.setItem('crm_custom_payment_methods', JSON.stringify(['무통장입금']));
  });
  await page.goto('/sales');
  await page.getByRole('button', { name: '결제 등록' }).first().click(); // 결제수단 목록을 그리면서 이관을 시도한다
  await expect(page.getByRole('dialog', { name: '결제 등록' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '결제 등록' })).toContainText('무통장입금'); // 이관 값은 화면에 보인다
  expect(await page.evaluate(() => localStorage.getItem('crm_custom_payment_methods'))).toContain('무통장입금'); // 유일한 사본이 그대로 있다
});
