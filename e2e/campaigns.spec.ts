import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, becomeStaff, dismissToasts } from './helpers';
import { addReservation, openCustomer, registerPayment } from './flows';

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
  test.skip(new Date().getHours() === 23 && new Date().getMinutes() >= 55, '자정을 넘기면 "내일 예약" 기준이 바뀐다 — 5분 뒤 다시'); // (178 리뷰 L-7)
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
  await expect(edit.getByTestId('campaign-preview')).toContainText('홍길동님, 내일 2026.11.26 14:00 예약을 기다리고 있어요.'); // 샘플 치환 미리보기 (201, 날짜 형식 203)
  await expect(edit.getByTestId('campaign-preview')).toContainText(/SMS \d+\/90바이트/);
  await edit.getByRole('button', { name: '추가', exact: true }).click();
  await expect(edit).toHaveCount(0);
  const row = card.getByTestId('campaign-row').filter({ hasText: '예약 전날 안내' });
  await expect(row).toContainText('내일 예약(확정·대기)이 있는 고객에게 · 사건마다 1회');

  // 대시보드 "오늘 할 일"에 캠페인 대상 1명 (177)
  await page.goto('/');
  const taskLine = page.getByTestId('today-tasks-card').filter({ visible: true }).first().getByRole('button', { name: /캠페인 발송 대상 확인·승인/ });
  await expect(taskLine).toContainText('1'); // 대상 1명
  await expect(taskLine).toContainText('1개 캠페인');
  await page.goto('/messaging');

  // 대상 확인 → 치환된 본문 → 승인
  await row.getByRole('button', { name: '대상 확인·발송' }).click();
  const run = page.getByRole('dialog', { name: '캠페인 실행 — 예약 전날 안내' });
  await expect(run.getByTestId('campaign-ready-count')).toHaveText('1');
  await expect(run.getByTestId('campaign-candidates')).toContainText(acc.customer); // 276: 대상 상자
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

  // 발송 성공 기록(이 PC)이 있으면 고객 활동 타임라인에 "캠페인 발송 · 이름" 줄 — 미연동 환경이라 성공 기록 1건을 심어 확인 (179)
  await page.evaluate((name: string) => {
    const keyOf = (suffix: string) => Object.keys(localStorage).find(k => k.startsWith('crm_') && k.endsWith(suffix));
    const customers = JSON.parse(localStorage.getItem(keyOf('_customers') || '') || '[]') as { id: string; name: string }[];
    const settings = JSON.parse(localStorage.getItem(keyOf('_settings') || '') || '{}') as { preferences?: { campaigns?: { id: string; name: string }[] } };
    const c = customers.find(x => x.name === name);
    const camp = (settings.preferences?.campaigns || []).find(x => x.name === '예약 전날 안내');
    if (!c || !camp) throw new Error('seed: 고객/캠페인을 localStorage 에서 찾지 못함');
    localStorage.setItem((keyOf('_customers') as string).replace(/_customers$/, '_campaign_sends'), JSON.stringify([{ key: `${camp.id}|${c.id}|seed`, campaignId: camp.id, customerId: c.id, at: new Date().toISOString() }]));
  }, acc.customer);
  await openCustomer(page, acc);
  const timeline = page.getByTestId('customer-timeline').filter({ visible: true }).first();
  await expect(timeline).toContainText('캠페인 발송 · 예약 전날 안내');
  await expect(timeline).toContainText('이 PC 에서 승인·발송 성공');
  await page.goto('/messaging');

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
  // 276: 대상이 0명이면 **빈 상자**가 아니라 없다고 말해야 한다(조용히 빈 목록은 "보낼 사람이 없다" 와 "불러오지 못했다" 를 구별해 주지 않는다)
  await expect(todayRun.getByTestId('campaign-candidates')).toContainText('오늘 보낼 대상이 없습니다');
  await expect(todayRun.getByTestId('campaign-approve')).toBeDisabled();
});

test('캠페인 성과 근거 — 세어진 고객을 보여 주고, 직원 계정에는 금액을 보여 주지 않는다 (267·270)', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  const accPerf = makeAccount('CP');
  await signupAndOnboard(page, accPerf);
  await createCustomer(page, accPerf);
  await registerPayment(page, accPerf, 120000); // 창 안 결제 — 성과로 세어진다
  await page.goto('/messaging');
  await page.getByTestId('campaign-presets').click(); // 기본 시나리오를 넣어 캠페인을 만든다
  await dismissToasts(page);

  // 이 PC 의 캠페인 발송 기록을 심는다 — e2e 환경은 발송사 미연동이라 실제 발송이 되지 않는다(그래서 성과 줄이 안 뜬다)
  const customerId = await page.evaluate(() => {
    const ck = Object.keys(localStorage).find(k => /^crm_.*_customers$/.test(k))!;
    const list = JSON.parse(localStorage.getItem(ck) || '[]');
    return list[0]?.id as string;
  });
  await page.evaluate((cid) => {
    // 캠페인 정의는 **설정 행**(preferences.campaigns)에, 발송 기록은 기기 키(campaign_sends)에 있다
    const shop = (Object.keys(localStorage).find(k => /^crm_.*_customers$/.test(k)) || '').replace(/^crm_|_customers$/g, '');
    const settings = JSON.parse(localStorage.getItem(`crm_${shop}_settings`) || '{}');
    const id = settings?.preferences?.campaigns?.[0]?.id;
    if (!id) throw new Error('캠페인이 없습니다 — 기본 시나리오를 먼저 넣어야 합니다');
    // 키 모양은 실제 규칙과 같게 — `캠페인|고객|버킷` (campaignRule.sendKey) (274, 리뷰 LOW)
    localStorage.setItem(`crm_${shop}_campaign_sends`, JSON.stringify([{ key: `${id}|${cid}|1`, campaignId: id, customerId: cid, at: new Date().toISOString() }]));
  }, customerId);
  await page.reload();

  const card = page.getByTestId('campaigns-card');
  const row = card.getByTestId('campaign-row').first();
  await expect(row.getByTestId('campaign-perf')).toContainText('[추정] 발송 1명');
  await expect(row.getByTestId('campaign-perf')).toContainText('120,000원'); // 관리자는 금액까지

  await row.getByTestId('campaign-perf-rows').click();
  const detail = page.getByTestId('metric-detail');
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId('metric-detail-row')).toHaveCount(1);
  await expect(detail.getByTestId('metric-detail-row')).toContainText(accPerf.customer);
  await expect(detail.getByTestId('metric-detail-total')).toContainText('120,000원'); // 합계 = 요약 줄 금액
  await expect(detail).toContainText('이 캠페인 때문이라는 뜻은 아닙니다');
  await detail.getByRole('button', { name: '닫기' }).click();

  // 270(리뷰 H-1): 직원 계정에는 금액을 **0원으로 보여 주지 않고** 아예 감춘다 — 요약 줄도 사람 수만
  await becomeStaff(page);
  await page.goto('/messaging');
  const staffRow = page.getByTestId('campaigns-card').getByTestId('campaign-row').first();
  await expect(staffRow.getByTestId('campaign-perf')).toContainText('결제 1명');
  await expect(staffRow.getByTestId('campaign-perf')).not.toContainText('120,000');
  await staffRow.getByTestId('campaign-perf-rows').click();
  const staffDetail = page.getByTestId('metric-detail');
  await expect(staffDetail).toBeVisible();
  await expect(staffDetail.getByTestId('metric-detail-total')).toHaveCount(0); // 합계 칸 자체가 없다(0원이라고 쓰지 않는다)
  await expect(staffDetail).not.toContainText('0원');
  await expect(staffDetail).toContainText('매출 권한이 있는 계정에서만');
});
