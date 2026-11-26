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

  // ── ③ 경고가 사실인지 — 새로고침하면 둘 다 없다 ──
  await page.reload();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('metric-achievement-sub')).toHaveText('목표를 아래에 적으세요'); // 목표가 남지 않았다
  await expect(card.getByTestId('month-closed-badge')).toHaveCount(0);                           // 마감도 남지 않았다
  await expect(card.getByRole('button', { name: '월 마감' })).toBeVisible();                     // 다시 마감할 수 있는 상태
});
