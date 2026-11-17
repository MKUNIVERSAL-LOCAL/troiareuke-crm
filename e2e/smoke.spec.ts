import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts } from './helpers';

/**
 * 핵심 사용 흐름 E2E 스모크 (로컬 모드 빌드, 외부 서버 없음)
 * 가입 → 온보딩(직원 1명·시술 1개) → 고객 등록 → 예약 등록 → 결제 등록 → 매출 반영
 * 릴리스마다 이 흐름이 깨지지 않았음을 보장한다 (파일럿 준비 5/5).
 */

const acc = makeAccount('E2E');

test.describe.configure({ mode: 'serial' });

test('가입 → 온보딩 → 고객 → 예약 → 결제가 끊기지 않는다', async ({ page }) => {
  page.on('dialog', d => d.accept());

  // ── 1~3. 가입 → 온보딩 → 고객 등록 (공통 헬퍼) ──
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // 검색 품질: 전화 뒷자리 4자리·초성으로도 찾힌다 (2026-11-17)
  const searchBox = page.getByPlaceholder('이름, 전화번호 검색').filter({ visible: true }).first();
  await searchBox.fill(acc.customerPhone.slice(-4));
  await expect(page.getByText(acc.customer).filter({ visible: true }).first()).toBeVisible();
  await searchBox.fill('ㅌㅅㅌ');
  await expect(page.getByText(acc.customer).filter({ visible: true }).first()).toBeVisible();
  await searchBox.fill('없는고객zzz');
  await expect(page.getByText(acc.customer).filter({ visible: true })).toHaveCount(0);
  await searchBox.fill('');

  // ── 4. 예약 등록 ──
  await page.goto('/reservations');
  await page.getByRole('button', { name: '예약 추가' }).click();
  await page.locator('select').filter({ hasText: '고객 선택' }).selectOption({ index: 1 });
  await page.locator('select').filter({ hasText: '직원 선택' }).selectOption({ index: 1 });
  await page.locator('select').filter({ hasText: '시술 선택' }).selectOption({ index: 1 });
  await page.getByRole('button', { name: '예약 저장' }).click();
  await expect(page.getByText(acc.customer).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
  await dismissToasts(page);

  // ── 5. 결제 등록 → 매출 반영 ──
  await page.goto('/sales');
  await page.getByRole('button', { name: '결제 등록' }).first().click();
  const form = page.locator('form').filter({ hasText: '결제 구분' });
  await form.locator('select').first().selectOption({ index: 1 });
  await form.getByPlaceholder('0').first().fill('50000');
  await form.getByRole('button', { name: '결제 등록' }).click();
  await expect(page.getByText(/결제 내역 \(1\)/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('50,000').first()).toBeVisible();

  // ── 5-1. 시술 기록 저장 → 결제 등록 연계 (2026-11-17) ──
  await page.goto('/treatments?new=1');
  await page.locator('select').filter({ hasText: '고객 선택' }).selectOption({ index: 1 });
  await page.getByText('테스트관리', { exact: true }).filter({ visible: true }).first().click(); // 시술 항목 체크
  await page.getByRole('button', { name: '저장', exact: true }).click(); // confirm 은 page.on('dialog')가 수락
  await expect(page).toHaveURL(/\/sales/, { timeout: 10_000 }); // 프리필 파라미터는 캡처 후 URL에서 제거됨
  const payForm2 = page.locator('form').filter({ hasText: '결제 구분' });
  await expect(payForm2.getByPlaceholder('0').first()).toHaveValue('50,000');
  await payForm2.getByRole('button', { name: '결제 등록' }).click();
  await expect(page.getByText(/결제 내역 \(2\)/)).toBeVisible({ timeout: 10_000 });

  // ── 6. 데이터가 새로고침 후에도 남는다 (로컬 저장 회귀) ──
  await page.reload();
  await expect(page.getByText(/결제 내역 \(2\)/)).toBeVisible({ timeout: 10_000 });

  // ── 7. 회차권: 프로그램 생성 → 고객 등록 → 시술 연결 시 1회 차감 (2026-11-17) ──
  await page.goto('/programs');
  await page.getByRole('button', { name: '프로그램 추가' }).first().click();
  await page.getByPlaceholder('예: 기본 피부관리 10회권').fill('회차권10');
  await page.locator('input[placeholder="0"]').filter({ visible: true }).first().fill('300000'); // 판매가
  await page.getByRole('button', { name: '프로그램 추가' }).last().click(); // 모달 제출
  await expect(page.getByText('회차권10').filter({ visible: true }).first()).toBeVisible();

  await page.goto('/customers');
  await page.getByText(acc.customer).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: '프로그램 등록', exact: true }).first().click();
  const progSelect = page.locator('select').filter({ hasText: '프로그램을 선택하세요' });
  await progSelect.selectOption(await progSelect.locator('option', { hasText: '회차권10' }).getAttribute('value') as string);
  await page.locator('input[placeholder="0"]').filter({ visible: true }).first().fill('300000'); // 실제 결제 금액
  await page.getByRole('button', { name: '프로그램 등록', exact: true }).last().click();
  await expect(page.getByText('잔여 10회').filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: '시술 기록', exact: true }).first().click();
  const linkSelect = page.locator('select').filter({ hasText: '잔여' });
  await linkSelect.selectOption(await linkSelect.locator('option', { hasText: '회차권10' }).getAttribute('value') as string);
  await page.getByRole('button', { name: '시술 기록 저장' }).click();
  await expect(page.getByText('잔여 9회').filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });

  // ── 6-1. 내일 예약 안내 (2026-11-17): 오늘 예약을 내일로 복제하면 대시보드 카드에 뜨고 안내 초안이 만들어진다 ──
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_reservations$/.test(k))!;
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    const t = new Date(); t.setDate(t.getDate() + 1);
    const date = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const src = list[0];
    list.push({ ...src, id: 'tomorrow_' + Date.now(), date, status: 'confirmed', startTime: '14:00', endTime: '15:00' });
    localStorage.setItem(key, JSON.stringify(list));
  });
  await page.goto('/');
  const tomorrowCard = page.getByTestId('tomorrow-reservation-card').filter({ visible: true }).first();
  await expect(tomorrowCard).toContainText('14:00');
  await tomorrowCard.getByRole('button', { name: /예약 안내$/ }).first().click();
  await expect(tomorrowCard.getByText(/내일 예약 안내드립니다/)).toBeVisible();
  await expect(tomorrowCard.locator('pre')).toContainText('14:00');

  // ── 7-0. 회차권 소진 임박 알림 (2026-11-17): 잔여 1회로 만들면 대시보드 카드에 뜨고, 누르면 고객 상세가 열린다 ──
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_customer_programs$/.test(k))!;
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    for (const cp of list) if (cp.totalSessions) cp.usedSessions = cp.totalSessions - 1;
    localStorage.setItem(key, JSON.stringify(list));
  });
  await page.goto('/');
  const programCard = page.getByTestId('program-alert-card').filter({ visible: true }).first();
  await expect(programCard).toContainText('잔여 1회');
  await programCard.getByRole('button', { name: '재구매 안내' }).first().click();
  await expect(programCard.getByText(/잔여 회차가 1회 남았어요/)).toBeVisible();
  await programCard.getByRole('button', { name: `${acc.customer} 고객 보기` }).first().click();
  await expect(page).toHaveURL(/\/customers/);
  await expect(page.getByTestId('customers-desktop').getByRole('heading', { name: '결제 내역' })).toBeVisible();
  await page.goto('/customers');
  await page.getByText(acc.customer).filter({ visible: true }).first().click();

  // ── 7-1. 고객 목록 엑셀 다운로드 (2026-11-17: 공통 저장 경로 회귀) ──
  const xlsxDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '다운로드', exact: true }).filter({ visible: true }).first().click();
  expect((await xlsxDownload).suggestedFilename()).toMatch(/^고객목록_\d{4}-\d{2}-\d{2}\.xlsx$/);

  // ── 8. 고객 상세 결제 내역 — 시술 연계로 등록한 50,000원이 보이고, [결제 등록]은 고객 프리필로 매출 화면을 연다 (2026-11-17) ──
  const desk = page.getByTestId('customers-desktop');
  await expect(desk.getByRole('heading', { name: '결제 내역' })).toBeVisible();
  await expect(desk.getByTestId('customer-payments').getByText(/50,000/).first()).toBeVisible();
  await desk.getByRole('button', { name: '결제 등록' }).click();
  await expect(page).toHaveURL(/\/sales/);
  const payForm3 = page.locator('form').filter({ hasText: '결제 구분' });
  await expect(payForm3).toBeVisible();
  await expect(payForm3.locator('option:checked', { hasText: acc.customer })).toHaveCount(1);

  // ── 9. 고객 상세 [예약 추가] → 예약 추가 모달에 고객이 미리 선택된다 (2026-11-17) ──
  await page.goto('/customers');
  await page.getByText(acc.customer).filter({ visible: true }).first().click();
  await desk.getByRole('button', { name: '예약 추가' }).click();
  await expect(page).toHaveURL(/\/reservations/);
  await expect(page.locator('option:checked', { hasText: acc.customer })).toHaveCount(1);

  // ── 10. 개인정보 보존기간 정책 (P4, 2026-11-17): 1년으로 켜고 고객을 2년 전 방문으로 만들면 안내 → 목록 → 익명화 ──
  await page.goto('/settings');
  await page.getByRole('button', { name: '알림 설정', exact: true }).filter({ visible: true }).first().click();
  const retentionCard = page.getByTestId('retention-policy-card');
  await retentionCard.getByLabel('보존기간(년)').fill('1');
  await retentionCard.getByRole('button', { name: '정책 켜기' }).click();
  await expect(retentionCard.getByText(/사용 중 · 1년/)).toBeVisible();
  await page.evaluate(name => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_customers$/.test(k))!;
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    const old = new Date(); old.setFullYear(old.getFullYear() - 2);
    for (const c of list) if (c.name === name) { c.lastVisitDate = old.toISOString().slice(0, 10); c.registeredAt = old.toISOString(); }
    localStorage.setItem(key, JSON.stringify(list));
  }, acc.customer);
  await page.goto('/');
  await page.getByTestId('retention-notice').filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/retention=1/);
  const bar = page.getByTestId('retention-bar').filter({ visible: true }).first();
  await expect(bar).toContainText('경과 1명');
  await bar.getByRole('button', { name: '1명 익명화' }).click(); // confirm은 dialog 핸들러가 수락
  await expect(page.getByText('고객 1명을 익명화했습니다.').first()).toBeVisible();
  await expect(bar).toContainText('경과 0명');
  await page.goto('/customers');
  await expect(page.getByText('탈퇴고객').filter({ visible: true }).first()).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '대시보드' }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByTestId('retention-notice')).toHaveCount(0);
  // 익명화 고객은 예약 대상(고객 선택)에서 빠진다 — 기록(오늘 예약 등)에는 '탈퇴고객'으로 남는 것이 정상
  await page.goto('/reservations');
  await page.getByRole('button', { name: '예약 추가' }).first().click();
  await expect(page.locator('option', { hasText: '탈퇴고객' })).toHaveCount(0);
});

test('로그인 화면은 잘못된 계정을 거부한다', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('example@email.com').fill('nobody@smoke.test');
  await page.getByPlaceholder('비밀번호 입력').fill('wrong-password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
