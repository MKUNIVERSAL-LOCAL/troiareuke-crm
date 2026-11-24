import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer } from './helpers';
import { addReservation } from './flows';

/**
 * 캠페인(자동 발송) — 정의·대상 산출·승인 발송·멱등키 (156, GAP M-3)
 * 내일 예약 캠페인 추가 → 대상 1명·본문 치환 미리보기 → 승인 → 발송 서버 미연동이라 미발송 기록(대상은 다음 실행에 다시 잡힘)
 * → 이력에 "캠페인: …" 1건. 광고성 캠페인은 080 번호 없이 승인 버튼이 막힌다. 멱등키 선별 규칙은 lib-units 에서 검사.
 */

const acc = makeAccount('CP');

function tomorrowISO(): string {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('캠페인을 만들고 오늘 대상을 확인해 승인 발송하면 이력에 남고, 광고 캠페인은 080 없이 막힌다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await page.goto('/reservations');
  await addReservation(page, acc, '14:00', { date: tomorrowISO() });

  await page.goto('/messaging');
  const card = page.getByTestId('campaigns-card');
  await expect(card).toContainText('아직 캠페인이 없습니다');
  await card.getByRole('button', { name: '캠페인 추가' }).click();
  const edit = page.getByRole('dialog', { name: '캠페인 추가' });
  await edit.getByLabel('캠페인 이름').fill('예약 전날 안내');
  await edit.getByLabel('언제(트리거)').selectOption('reservation_tomorrow');
  await edit.getByLabel('메시지 내용').fill('{고객명}님, 내일 {예약일시} 예약을 기다리고 있어요. — {매장명}');
  await edit.getByRole('button', { name: '추가', exact: true }).click();
  await expect(edit).toHaveCount(0);
  const row = card.getByTestId('campaign-row').filter({ hasText: '예약 전날 안내' });
  await expect(row).toContainText('내일 예약(확정·대기)이 있는 고객에게 · 사건마다 1회');

  // 대시보드 "오늘 할 일"에 캠페인 대상 1명 (177)
  await page.goto('/');
  await expect(page.getByTestId('today-tasks-card').filter({ visible: true }).first()).toContainText('캠페인 발송 대상 확인·승인');
  await page.goto('/messaging');

  // 대상 확인 → 치환된 본문 → 승인
  await row.getByRole('button', { name: '대상 확인·발송' }).click();
  const run = page.getByRole('dialog', { name: '캠페인 실행 — 예약 전날 안내' });
  await expect(run.getByTestId('campaign-ready-count')).toHaveText('1');
  const cand = run.getByTestId('campaign-candidate');
  await expect(cand).toHaveCount(1);
  await expect(cand).toContainText(acc.customer);
  await expect(cand).toContainText(`${acc.customer}님, 내일`);
  await expect(cand).toContainText('14:00 예약을 기다리고 있어요');
  await expect(cand).not.toContainText('{');
  await run.getByTestId('campaign-approve').click();
  await expect(run.getByTestId('campaign-result')).toContainText('발송되지 않았습니다 (발송 서버 미연동)');
  await run.getByTestId('campaign-result').getByRole('button', { name: '닫기' }).click();
  await expect(run).toHaveCount(0);

  // 이력에 캠페인 1건(미발송)
  await page.getByRole('button', { name: '발송 이력' }).click();
  await expect(page.getByText('캠페인: 예약 전날 안내').first()).toBeVisible();

  // 광고성 캠페인 — 080 번호 없으면 승인 불가
  await page.getByRole('button', { name: '발송하기' }).first().click();
  await card.getByRole('button', { name: '캠페인 추가' }).click();
  await edit.getByLabel('캠페인 이름').fill('내일 방문 이벤트');
  await edit.getByLabel('언제(트리거)').selectOption('reservation_tomorrow');
  await edit.getByLabel('메시지 내용').fill('{고객명}님 내일 방문 시 10% 할인');
  await edit.getByLabel('광고성 캠페인').check();
  await edit.getByRole('button', { name: '추가', exact: true }).click();
  const adRow = card.getByTestId('campaign-row').filter({ hasText: '내일 방문 이벤트' });
  await expect(adRow).toContainText('광고');
  await adRow.getByRole('button', { name: '대상 확인·발송' }).click();
  const adRun = page.getByRole('dialog', { name: '캠페인 실행 — 내일 방문 이벤트' });
  await expect(adRun.getByTestId('campaign-ad-block')).toContainText('무료수신거부 080 번호가 없습니다');
  await expect(adRun.getByTestId('campaign-approve')).toBeDisabled();
  await expect(adRun).toContainText('광고 수신 동의 없음·거부 1명'); // 동의 없는 고객은 광고 대상에서 제외
  await adRun.getByTestId('campaign-skipped-toggle').click(); // 누가 빠졌는지 (176)
  await expect(adRun.getByTestId('campaign-skipped')).toContainText(acc.customer);
  await expect(adRun.getByTestId('campaign-skipped')).toContainText('광고 수신 동의 없음·거부');
  await page.keyboard.press('Escape');
  await expect(adRun).toHaveCount(0);

  // 기본 시나리오 16개 한 번에 추가 — 이미 있는 이름("예약 전날 안내")은 건너뛰어 15개가 더 들어가고, 버튼은 사라진다 (157)
  await expect(card.getByTestId('campaign-presets')).toContainText('기본 시나리오 15개 더 추가');
  await card.getByTestId('campaign-presets').click();
  await expect(card.getByTestId('campaign-row')).toHaveCount(17); // 2 + 15
  await expect(card.getByTestId('campaign-presets')).toHaveCount(0);
  await expect(card.getByTestId('campaign-row').filter({ hasText: '시술 다음날 홈케어 안내' })).toContainText('방문 1일 뒤에 · 사건마다 1회');
  // 오늘 예약 캠페인은 내일 예약을 잡지 않는다(트리거 분리)
  await card.getByTestId('campaign-row').filter({ hasText: '예약 당일 아침 안내' }).getByRole('button', { name: '대상 확인·발송' }).click();
  const todayRun = page.getByRole('dialog', { name: '캠페인 실행 — 예약 당일 아침 안내' });
  await expect(todayRun.getByTestId('campaign-ready-count')).toHaveText('0');
  await expect(todayRun.getByTestId('campaign-approve')).toBeDisabled();
});
