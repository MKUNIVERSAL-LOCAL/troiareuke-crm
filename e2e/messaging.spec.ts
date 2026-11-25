import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer } from './helpers';
import { openCustomer } from './flows';

/**
 * 문자/카카오 발송 흐름 E2E (로컬 모드, 발송사 미연동) — 템플릿 작성 → 발송 창에서 템플릿 적용 → 발송 시도 →
 * "실제 발송이 되지 않았습니다"가 정직하게 표시되고 발송 이력에 '미연동'으로 남는지 (가짜 성공 금지 원칙, 2026-11-19).
 */

const acc = makeAccount('MS');

test('템플릿 작성 → 발송 시도 → 미연동 안내와 발송 이력 기록이 맞다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // ── 템플릿 추가 ──
  await page.goto('/messaging');
  await page.getByRole('button', { name: '템플릿 관리' }).click();
  await page.getByRole('button', { name: '템플릿 추가' }).first().click();
  const tplDialog = page.getByRole('dialog', { name: '템플릿 추가' });
  await tplDialog.getByPlaceholder('예: 예약 확인 메시지').fill('리마인드 안내');
  await tplDialog.getByPlaceholder('메시지 내용을 입력하세요').fill('안녕하세요, 내일 방문 예정입니다. 변경은 매장으로 연락 주세요.');
  await tplDialog.getByRole('button', { name: '템플릿 추가' }).click();
  await expect(tplDialog).toHaveCount(0);
  await expect(page.getByText('리마인드 안내').first()).toBeVisible();

  // ── 발송 창: 전체 고객(1명) + 템플릿 적용 → 발송 시도 ──
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  const sendDialog = page.getByRole('dialog', { name: '메시지 발송' });
  await expect(sendDialog).toBeVisible();
  await sendDialog.locator('select').filter({ hasText: '템플릿 선택' }).selectOption({ index: 1 });
  await expect(sendDialog.locator('textarea')).toHaveValue(/내일 방문 예정입니다/);
  await sendDialog.getByRole('button', { name: '발송하기' }).click();

  // ── 발송사 미연동: 성공처럼 꾸미지 않고 사실대로 안내 ──
  await expect(sendDialog.getByText('실제 발송이 되지 않았습니다')).toBeVisible({ timeout: 10_000 });
  await expect(sendDialog.getByText("발송 이력에 '미연동' 사유로 기록되었습니다.")).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sendDialog).toHaveCount(0);

  // ── 발송 이력에 남는다 ──
  await page.getByRole('button', { name: '발송 이력' }).click();
  await expect(page.getByText('발송 이력이 없어요')).toHaveCount(0); // 빈 상태 문구(85)가 사라졌는지 — 이력이 실제로 생겼다는 뜻
  await expect(page.getByText(/미연동/).first()).toBeVisible();
  await expect(page.getByText(/내일 방문 예정입니다/).first()).toBeVisible();

  // ── 고객 활동 타임라인에도 같은 발송이 한 줄(수신 고객 id 기록, 204) — 미연동이라 "실제 발송 안 됨" 으로 정직하게 ──
  await openCustomer(page, acc);
  const timeline = page.getByTestId('customer-timeline').filter({ visible: true }).first();
  await expect(timeline).toContainText('문자 발송 · 리마인드 안내');
  await expect(timeline).toContainText('발송사 미연동 — 실제 발송 안 됨');
  // 줄을 누르면 발송 이력 탭이 그 고객 발송만으로 열린다 (205)
  await timeline.getByRole('button', { name: /문자 발송 · 리마인드 안내/ }).click();
  await expect(page).toHaveURL(/\/messaging/);
  await expect(page.getByTestId('history-customer-chip')).toContainText(`${acc.customer} 발송만 1`);
  await expect(page.getByText(/내일 방문 예정입니다/).first()).toBeVisible();
  await page.getByTestId('history-customer-chip').click();
  await expect(page.getByTestId('history-customer-chip')).toHaveCount(0);

  // ── "같은 대상에게 다시 보내기" → 같은 수신 고객(1명)·같은 본문으로 발송 창 (207) ──
  await page.getByTestId('history-resend').first().click();
  const resend = page.getByRole('dialog', { name: '메시지 발송' });
  await expect(resend.getByRole('button', { name: '다시 보내기 (1명)' })).toHaveClass(/bg-primary-600/);
  await expect(resend.locator('textarea')).toHaveValue(/내일 방문 예정입니다/);
  await page.keyboard.press('Escape');
  await expect(resend).toHaveCount(0);

  // ── 대시보드 할 일 딥링크(?tab=history&status=failed) → 발송 이력 탭이 실패·미연동 필터로 열린다 (208) ──
  await page.goto('/messaging?tab=history&status=failed');
  await expect(page.getByLabel('발송 상태 필터')).toHaveValue('failed');
  await expect(page.getByText(/내일 방문 예정입니다/).first()).toBeVisible();
  await expect(page).not.toHaveURL(/tab=history/); // 딥링크 파라미터는 초기값으로만 쓰고 지운다

  // ── 성과 추정 (211): 실제로 나간 발송 1건 + 그 고객의 오늘 예약을 심으면 "[추정] 발송 1명 → 14일 내 예약 1명" ──
  await page.evaluate(() => {
    const key = (re: RegExp) => Object.keys(localStorage).find(k => re.test(k))!;
    const customers = JSON.parse(localStorage.getItem(key(/^crm_.*_customers$/)) || '[]') as { id: string; name: string; shopId?: string }[];
    const c = customers[0];
    const t = new Date();
    const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const histKey = key(/^crm_.*_msg_history$/);
    const hist = JSON.parse(localStorage.getItem(histKey) || '[]');
    hist.unshift({ id: 'perfhist', type: 'sms', templateName: '성과 테스트', content: '이번 주 예약 안내입니다.', recipients: 1, successCount: 1, failCount: 0, sentAt: new Date().toISOString(), status: 'sent', cost: 11 });
    localStorage.setItem(histKey, JSON.stringify(hist));
    localStorage.setItem(histKey.replace(/_msg_history$/, '_msg_history_recipients'), JSON.stringify([{ historyId: 'perfhist', customerIds: [c.id], at: new Date().toISOString() }]));
    const resvKey = histKey.replace(/_msg_history$/, '_reservations');
    const resv = JSON.parse(localStorage.getItem(resvKey) || '[]');
    resv.push({ id: 'perfresv', shopId: c.shopId, customerId: c.id, customerName: c.name, date: today, startTime: '10:00', endTime: '11:00', status: 'confirmed', serviceName: '기본 관리', totalPrice: 0 });
    localStorage.setItem(resvKey, JSON.stringify(resv));
  });
  await page.goto('/messaging?tab=history');
  await expect(page.getByText('성과 테스트').first()).toBeVisible();
  // 받는 사람 표시·이름 검색 (212)
  await expect(page.getByTestId('history-recipients').first()).toContainText(`받는 사람 ${acc.customer}`);
  await page.getByLabel('발송 이력 검색').fill(acc.customer);
  await expect(page.getByText('성과 테스트').first()).toBeVisible(); // 수신 고객 이름으로 찾힌다
  await page.getByLabel('발송 이력 검색').fill('없는이름zz');
  await expect(page.getByText('조건에 맞는 발송 이력이 없어요')).toBeVisible();
  await page.getByLabel('발송 이력 검색').fill('');
  await page.getByTestId('history-perf').first().click(); // 실제로 나간 건에만 있는 버튼
  await expect(page.getByTestId('history-perf-line')).toContainText('[추정] 발송 1명 → 14일 내 예약 1명');
});
