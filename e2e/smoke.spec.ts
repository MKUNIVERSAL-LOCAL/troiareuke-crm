import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts, pickCustomer, isNearMidnightSeoul } from './helpers';
import { acceptAppConfirm } from './flows';

/**
 * 핵심 사용 흐름 E2E 스모크 (로컬 모드 빌드, 외부 서버 없음)
 * 가입 → 온보딩(직원 1명·시술 1개) → 고객 등록 → 예약 등록 → 결제 등록 → 매출 반영
 * 릴리스마다 이 흐름이 깨지지 않았음을 보장한다 (파일럿 준비 5/5).
 */

const acc = makeAccount('E2E');

test.describe.configure({ mode: 'serial' });

test('가입 → 온보딩 → 고객 → 예약 → 결제가 끊기지 않는다', async ({ page }) => {
  test.skip(isNearMidnightSeoul(), '자정 경계 — 내일 예약·오늘 생일·어제 누락 카드의 기준일이 시드와 렌더 사이에 바뀐다 (12차 #M6)');
  test.slow(); // 단독 ≈50s — 9개 테스트 병렬 부하에서 60s 전체 제한을 넘겨 실패(2026-11-18 17:00·17:20 재현) → 3배 여유
  page.on('dialog', d => d.accept());

  // ── 1~3. 가입 → 온보딩 → 고객 등록 (공통 헬퍼) ──
  await signupAndOnboard(page, acc);

  // 첫 설정 체크리스트 — 고객이 없는 새 매장 홈에 보이고, 항목이 해당 등록 화면(?tab=)으로 간다 (첫 실행 감사 2026-11-18)
  await page.goto('/');
  const checklist = page.getByTestId('setup-checklist').filter({ visible: true }).first();
  await expect(checklist).toBeVisible();
  await expect(checklist).toContainText('첫 고객 등록');
  await expect(checklist).toContainText('3/4 완료'); // 온보딩으로 매장 이름·직원·시술 메뉴는 끝난 상태
  await checklist.getByRole('button', { name: /첫 고객 등록/ }).click();
  await expect(page).toHaveURL(/\/customers$/); // ?new=1 캡처 후 정리
  const quickAddDialog = page.getByRole('dialog', { name: '고객 추가' });
  await expect(quickAddDialog).toBeVisible();
  await quickAddDialog.getByRole('button', { name: '닫기' }).click();
  await page.goto('/settings?tab=services');
  await expect(page.getByText('시술 항목 관리').filter({ visible: true }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);

  await createCustomer(page, acc);
  // 마지막 항목(첫 고객)까지 끝나면 체크리스트는 사라진다
  await page.goto('/');
  await expect(page.getByText('오늘 예약 현황').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByTestId('setup-checklist')).toHaveCount(0);
  await page.goto('/customers'); // 아래 검색 품질 검증은 고객 화면에서

  // 검색 품질: 전화 뒷자리 4자리·초성으로도 찾힌다 (2026-11-17)
  const searchBox = page.getByPlaceholder('이름, 전화번호 검색').filter({ visible: true }).first();
  await searchBox.fill(acc.customerPhone.slice(-4));
  await expect(page.getByText(acc.customer).filter({ visible: true }).first()).toBeVisible();
  await searchBox.fill('ㅌㅅㅌ');
  await expect(page.getByText(acc.customer).filter({ visible: true }).first()).toBeVisible();
  await searchBox.fill('없는고객zzz');
  await expect(page.getByText(acc.customer).filter({ visible: true })).toHaveCount(0);
  // Enter → 첫 검색 결과가 바로 열린다 (데스크 입력 속도 2026-11-18)
  await searchBox.fill(acc.customer);
  await searchBox.press('Enter');
  await expect(page.getByRole('heading', { name: acc.customer }).filter({ visible: true }).first()).toBeVisible();
  await searchBox.fill('');

  // 키보드 포커스 — 모달을 열면 첫 입력란에 커서, Tab은 창 안에서만 돌고, 닫으면 열었던 버튼으로 돌아온다 (접근성 감사 2026-11-18)
  const addOpener = page.getByRole('button', { name: '고객 추가' }).filter({ visible: true }).first();
  await addOpener.click();
  const addDialog = page.getByRole('dialog', { name: '고객 추가' });
  await expect(addDialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el?.tagName === 'INPUT' && !!el.closest('[role="dialog"][aria-label="고객 추가"]');
  }), '첫 입력란에 포커스').toBe(true);
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"][aria-label="고객 추가"]')), 'Tab 40번 뒤에도 포커스가 모달 안').toBe(true);
  await addDialog.getByRole('button', { name: '닫기' }).click();
  await expect(addDialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.includes('고객 추가') ?? false), '열었던 버튼으로 포커스 복원').toBe(true);

  // ── 4. 예약 등록 (오늘을 휴무일로 바꿔 두면 저장 전 "휴무일" 확인이 뜨고, 수락하면 저장된다 — 2026-11-18 영업시간 점검) ──
  const dayLabel = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_settings$/.test(k))!;
    const s = JSON.parse(localStorage.getItem(key) || '{}');
    const day = ['일', '월', '화', '수', '목', '금', '토'][new Date().getDay()];
    s.businessHours[day].isOff = true;
    localStorage.setItem(key, JSON.stringify(s));
    return day;
  });
  const dialogMessages: string[] = [];
  const recordDialog = (d: { message(): string }) => { dialogMessages.push(d.message()); };
  page.on('dialog', recordDialog);
  await page.goto('/reservations');
  await page.getByRole('button', { name: '예약 추가' }).click();
  await pickCustomer(page);
  await page.locator('select').filter({ hasText: '직원 선택' }).selectOption({ index: 1 });
  await page.locator('select').filter({ hasText: '시술 선택' }).selectOption({ index: 1 });
  await page.getByRole('button', { name: '예약 저장' }).click(); // 휴무일 confirm은 page.on('dialog')가 수락
  await expect(page.getByText(acc.customer).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
  page.off('dialog', recordDialog);
  expect(dialogMessages.some(m => m.includes(`${dayLabel}요일은 휴무일입니다`))).toBe(true);
  await page.evaluate(() => { // 휴무 원복 — 뒤 단계의 예약 생성이 영향받지 않게. 메모리 캐시(SettingsStore)는 다음 page.goto에서 다시 읽힌다 — 그 전에 SettingsStore.save()를 부르는 단계를 끼우지 말 것
    const key = Object.keys(localStorage).find(k => /^crm_.*_settings$/.test(k))!;
    const s = JSON.parse(localStorage.getItem(key) || '{}');
    for (const d of Object.keys(s.businessHours)) s.businessHours[d].isOff = false;
    localStorage.setItem(key, JSON.stringify(s));
  });
  await dismissToasts(page);
  // PC 키보드 단축키: N → 예약 추가 창, Esc → 닫기 (UI 품질 2026-11-18)
  await page.keyboard.press('n');
  const shortcutDialog = page.getByRole('dialog', { name: '예약 추가' });
  await expect(shortcutDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(shortcutDialog).toHaveCount(0);

  // ── 5. 결제 등록 → 매출 반영 ──
  await page.goto('/sales');
  await page.getByRole('button', { name: '결제 등록' }).first().click();
  const form = page.locator('form').filter({ hasText: '구분 (매출/환불)' });
  await pickCustomer(page, acc.customer, form); // 결제 등록 창의 고객 선택 — 검색형 콤보박스
  await form.getByPlaceholder('0').first().fill('50000');
  await form.getByRole('button', { name: '결제 등록' }).click();
  await expect(page.getByText(/결제 내역 \(1\)/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('50,000').first()).toBeVisible();

  // ── 5-1. 시술 기록 저장 → 결제 등록 연계 (2026-11-17) ──
  await page.goto('/treatments?new=1');
  await pickCustomer(page);
  await page.getByText('테스트관리', { exact: true }).filter({ visible: true }).first().click(); // 시술 항목 체크
  await page.getByRole('button', { name: '저장', exact: true }).click(); // confirm 은 page.on('dialog')가 수락
  await expect(page).toHaveURL(/\/sales/, { timeout: 10_000 }); // 프리필 파라미터는 캡처 후 URL에서 제거됨
  const payForm2 = page.locator('form').filter({ hasText: '구분 (매출/환불)' });
  await expect(payForm2.getByPlaceholder('0').first()).toHaveValue('50,000');
  await payForm2.getByRole('button', { name: '결제 등록' }).click();
  await expect(page.getByText(/결제 내역 \(2\)/)).toBeVisible({ timeout: 10_000 });

  // ── 6. 데이터가 새로고침 후에도 남는다 (로컬 저장 회귀) ──
  await page.reload();
  await expect(page.getByText(/결제 내역 \(2\)/)).toBeVisible({ timeout: 10_000 });

  // ── 6-2. 오늘 마감 요약 (2026-11-17): 오늘 결제 2건 100,000원이 집계되고 보고 문구가 복사된다 ──
  await page.goto('/');
  const closeCard = page.getByTestId('daily-close-card').filter({ visible: true }).first();
  await expect(closeCard).toContainText('100,000원');
  await expect(closeCard).toContainText('2건');
  await closeCard.getByRole('button', { name: '복사' }).click();
  await expect(closeCard.getByRole('button', { name: '복사됨' })).toBeVisible();
  const closeText = await page.evaluate(() => navigator.clipboard.readText());
  expect(closeText).toContain('마감 보고');
  expect(closeText).toContain('매출 100,000원 (2건)');

  // ── 7. 회차권: 프로그램 생성 → 고객 등록 → 시술 연결 시 1회 차감 (2026-11-17) ──
  await page.goto('/programs');
  await page.getByRole('button', { name: '프로그램 추가' }).first().click();
  await page.getByPlaceholder('예: 기본 피부관리 10회권').fill('회차권10');
  await page.locator('input[placeholder="0"]').filter({ visible: true }).first().fill('300000'); // 판매가
  await page.getByRole('button', { name: '프로그램 추가' }).last().click(); // 모달 제출
  await expect(page.getByText('회차권10').filter({ visible: true }).first()).toBeVisible();

  await page.goto('/customers');
  await page.getByText(acc.customer).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: '회차권 등록', exact: true }).first().click();
  const progSelect = page.locator('select').filter({ hasText: '프로그램을 선택하세요' });
  await progSelect.selectOption(await progSelect.locator('option', { hasText: '회차권10' }).getAttribute('value') as string);
  await page.locator('input[placeholder="0"]').filter({ visible: true }).first().fill('300000'); // 실제 결제 금액
  await page.getByRole('button', { name: '회차권 등록', exact: true }).last().click();
  await expect(page.getByText('잔여 10회').filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: '시술 기록', exact: true }).first().click();
  const linkSelect = page.locator('select').filter({ hasText: '잔여' });
  await linkSelect.selectOption(await linkSelect.locator('option', { hasText: '회차권10' }).getAttribute('value') as string);
  await page.getByRole('button', { name: '시술 기록 저장' }).click();
  await expect(page.getByText('잔여 9회').filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });

  // ── 7-2. 프로그램 관리 (2026-11-18): 만료일 +30일·총 회차 12회로 보정 → 잔여 11회, 변경 기록이 notes에 남는다 ──
  await page.getByRole('button', { name: '회차권10 관리' }).filter({ visible: true }).first().click();
  const manageDialog = page.getByRole('dialog', { name: '프로그램 관리' });
  const expiryBefore = await manageDialog.getByLabel('만료일').inputValue(); // 프로그램 기본 유효기간 180일
  await manageDialog.getByRole('button', { name: '+30일' }).click();
  const expiryAfter = await manageDialog.getByLabel('만료일').inputValue();
  const plus30 = (() => { const today = new Date(); today.setHours(0, 0, 0, 0); const [y, m, d] = expiryBefore.split('-').map(Number); const cur = expiryBefore ? new Date(y, m - 1, d) : today; const t = cur > today ? cur : today; t.setDate(t.getDate() + 30); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })();
  expect(expiryAfter).toBe(plus30); // 만료일과 오늘 중 늦은 날 + 30
  await manageDialog.getByLabel('총 회차').fill('12');
  await manageDialog.getByLabel('사유').fill('서비스 2회 추가');
  await manageDialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(manageDialog).toHaveCount(0);
  await expect(page.getByText('잔여 11회').filter({ visible: true }).first()).toBeVisible();
  const managed = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_customer_programs$/.test(k))!;
    const cp = JSON.parse(localStorage.getItem(key) || '[]').find((x: { programName: string }) => x.programName === '회차권10');
    return { expiryDate: cp.expiryDate as string, totalSessions: cp.totalSessions as number, notes: (cp.notes || '') as string };
  });
  expect(managed.expiryDate).toBe(expiryAfter);
  expect(managed.totalSessions).toBe(12);
  expect(managed.notes).toMatch(/만료일 .+ → /);
  expect(managed.notes).toContain('총 회차 10회 → 12회');
  expect(managed.notes).toContain('서비스 2회 추가');
  // [만료 없음]은 서버가 실제로 지우도록 null로 저장되고, 완료 처리/되돌리기는 기록을 남긴다
  await page.getByRole('button', { name: '회차권10 관리' }).filter({ visible: true }).first().click();
  await manageDialog.getByRole('button', { name: '만료 없음' }).click();
  await manageDialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(manageDialog).toHaveCount(0);
  await page.getByRole('button', { name: '회차권10 관리' }).filter({ visible: true }).first().click();
  await manageDialog.getByRole('button', { name: '완료 처리' }).click();
  await acceptAppConfirm(page, '회차권 완료 처리', '완료 처리'); // 125부터 앱 확인창
  await expect(manageDialog).toHaveCount(0);
  const managed2 = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_customer_programs$/.test(k))!;
    const cp = JSON.parse(localStorage.getItem(key) || '[]').find((x: { programName: string }) => x.programName === '회차권10');
    return { expiryDate: cp.expiryDate, isCompleted: cp.isCompleted as boolean, notes: (cp.notes || '') as string };
  });
  expect(managed2.expiryDate).toBeNull();
  expect(managed2.isCompleted).toBe(true);
  expect(managed2.notes).toContain('완료 처리 (잔여 11회 소멸)');
  await page.getByRole('button', { name: '회차권10 관리' }).filter({ visible: true }).first().click();
  await manageDialog.getByRole('button', { name: '진행중으로 되돌리기' }).click();
  await expect(manageDialog).toHaveCount(0);
  await expect(page.getByText('잔여 11회').filter({ visible: true }).first()).toBeVisible();

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

  // ── 6-3. 생일 고객 (2026-11-17): 생년월일을 오늘(월·일)로 두면 대시보드 카드에 "오늘"로 뜨고 안내 초안이 만들어진다 ──
  await page.evaluate(name => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_customers$/.test(k))!;
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    const t = new Date();
    for (const c of list) if (c.name === name) c.birthDate = `1990-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    localStorage.setItem(key, JSON.stringify(list));
  }, acc.customer);
  await page.goto('/');
  const birthdayCard = page.getByTestId('birthday-card').filter({ visible: true }).first();
  await expect(birthdayCard).toContainText('오늘');
  await birthdayCard.getByRole('button', { name: /생일 안내$/ }).first().click();
  await expect(birthdayCard.locator('pre')).toContainText('오늘 생일을 진심으로 축하드려요');

  // ── 6-3-1. 재고 부족 알림 → 입고 (2026-11-18): 재고가 안전재고 아래인 제품을 심으면 대시보드 알림에 뜨고, 누르면 제품 화면의 입고 창이 열린다 ──
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_products$/.test(k));
    const list = key ? JSON.parse(localStorage.getItem(key) || '[]') : [];
    const customersKey = Object.keys(localStorage).find(k => /^crm_.*_customers$/.test(k))!;
    const shopId = JSON.parse(localStorage.getItem(customersKey) || '[]')[0].shopId;
    list.push({ id: 'lowstock_' + Date.now(), shopId, name: '부족세럼', category: '세럼', price: 30000, cost: 10000, stock: 1, minStock: 5, unit: '개', isActive: true });
    localStorage.setItem(key ?? customersKey.replace(/_customers$/, '_products'), JSON.stringify(list));
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^부족세럼 .*입고$/ }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/products$/); // ?stock=은 1회 캡처 후 비워진다
  const lowStockDialog = page.getByRole('dialog', { name: '재고 입고·조정' });
  await expect(lowStockDialog).toContainText('부족세럼');
  await lowStockDialog.getByRole('button', { name: '닫기' }).click();

  // ── 6-4. 완료 처리 누락 예약 (2026-11-18): 어제 확정 예약을 심으면 대시보드 카드에 뜨고 [완료]를 누르면 완료 처리되어 카드에서 사라진다 ──
  const pendingId = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_reservations$/.test(k))!;
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    const t = new Date(); t.setDate(t.getDate() - 1);
    const date = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const id = 'pending_' + Date.now();
    list.push({ ...list[0], id, date, status: 'confirmed', startTime: '11:00', endTime: '12:00', totalPrice: 30000 });
    localStorage.setItem(key, JSON.stringify(list));
    return id;
  });
  await page.goto('/');
  const pendingCard = page.getByTestId('pending-completion-card').filter({ visible: true }).first();
  await expect(pendingCard.getByTestId('pending-completion-count')).toHaveText('1건');
  await pendingCard.getByRole('button', { name: /완료$/ }).first().click(); // 완료 → 결제 미등록이라 confirm(수락) → 매출 등록 모달로
  await expect(page).toHaveURL(/\/sales/);
  const pendingPayForm = page.locator('form').filter({ hasText: '구분 (매출/환불)' });
  await expect(pendingPayForm.getByPlaceholder('0').first()).toHaveValue('30,000');
  await pendingPayForm.getByRole('button', { name: '결제 등록' }).click();
  const pendingAfter = await page.evaluate(id => {
    const key = (re: RegExp) => Object.keys(localStorage).find(k => re.test(k))!;
    const status = JSON.parse(localStorage.getItem(key(/^crm_.*_reservations$/)) || '[]').find((r: { id: string }) => r.id === id)?.status;
    const linked = JSON.parse(localStorage.getItem(key(/^crm_.*_payments$/)) || '[]').filter((p: { referenceId?: string }) => p.referenceId === id);
    return { status, linked: linked.length, amount: linked[0]?.amount };
  }, pendingId);
  expect(pendingAfter).toEqual({ status: 'completed', linked: 1, amount: 30000 }); // 예약 id로 연결된 결제 1건
  await page.goto('/');
  await expect(page.getByTestId('pending-completion-card')).toHaveCount(0);
  // 가동률 (180): 이달 완료·확정 예약 시간 ÷ 직원 근무 가용 시간 — 오늘 완료 예약이 있으니 "이달 운영 지표"에 %로 뜬다
  await expect(page.getByTestId('kpi-util').filter({ visible: true }).first()).toHaveText(/^\d+%$/);
  // 공식 보기 (183): 툴팁 없는 모바일·키보드에서도 지표 정의를 읽을 수 있다
  const kpiCard = page.getByTestId('today-tasks-card').filter({ visible: true }).first();
  await kpiCard.getByTestId('kpi-formula-toggle').click();
  await expect(kpiCard.getByTestId('kpi-formulas')).toContainText('가동률 = 이달 오늘까지 확정·완료 예약 시간 ÷ 활성 직원 근무 가용 시간');
  await expect(kpiCard.getByTestId('kpi-formulas')).toContainText('재방문율 =');
  await kpiCard.getByTestId('kpi-formula-toggle').click();
  await expect(kpiCard.getByTestId('kpi-formulas')).toHaveCount(0);
  // 드릴다운 (184): 재예약률 타일 → 다음 예약 없는 이달 방문 고객 목록(필터 칩), 가동률 타일 → 예약 화면
  await kpiCard.getByTestId('kpi-rebook-link').click();
  await expect(page).toHaveURL(/\/customers/); // ?norebook=1 은 초기값으로만 쓰고 바로 URL 에서 지워진다(187 리뷰 M-1) — 칩으로 판정
  await expect(page.getByTestId('norebook-chip').filter({ visible: true }).first()).toContainText('재예약 없음');
  await page.goto('/');
  await page.getByTestId('today-tasks-card').filter({ visible: true }).first().getByTestId('kpi-util-link').click();
  await expect(page).toHaveURL(/\/reservations/);
  await page.goto('/');

  // ── 7-0. 회차권 소진 임박 알림 (2026-11-17): 잔여 1회로 만들면 대시보드 카드에 뜨고, 누르면 고객 상세가 열린다 ──
  await page.evaluate(() => {
    // 사용 회차는 시술 기록이 정본(130, 16차 #H2) — 저장값만 올리면 기록 기준으로 되돌아간다. 총 회차를 "기록 합 + 1" 로 맞춰 잔여 1회를 만든다
    const key = Object.keys(localStorage).find(k => /^crm_.*_customer_programs$/.test(k))!;
    const logKey = Object.keys(localStorage).find(k => /^crm_.*_treatment_logs$/.test(k));
    const logs: { customerProgramId?: string; sessionsUsed?: number }[] = logKey ? JSON.parse(localStorage.getItem(logKey) || '[]') : [];
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    for (const cp of list) {
      if (!cp.totalSessions) continue;
      const fromLogs = logs.filter(t => t.customerProgramId === cp.id).reduce((n, t) => n + Math.max(0, t.sessionsUsed || 0), 0);
      const used = logs.some(t => t.customerProgramId === cp.id) ? fromLogs : cp.usedSessions;
      cp.usedSessions = used;
      cp.totalSessions = used + 1;
    }
    localStorage.setItem(key, JSON.stringify(list));
  });
  await page.goto('/');
  // 대시보드 "오늘 할 일" — 회차권 임박이 생겼으니 카드가 뜨고 해당 줄이 보인다 (138)
  const tasksCard = page.getByTestId('today-tasks-card').filter({ visible: true }).first();
  await expect(tasksCard).toBeVisible();
  await expect(tasksCard.getByText(/회차권 소진·만료 임박/)).toBeVisible();
  const programCard = page.getByTestId('program-alert-card').filter({ visible: true }).first();
  await expect(programCard).toContainText('잔여 1회');
  await programCard.getByRole('button', { name: '재구매 안내' }).first().click();
  await expect(programCard.getByText(/잔여 회차가 1회 남았어요/)).toBeVisible();
  await programCard.getByRole('button', { name: `${acc.customer} 고객 보기` }).first().click();
  await expect(page).toHaveURL(/\/customers/);
  await expect(page.getByTestId('customers-desktop').getByRole('heading', { name: '결제 내역' })).toBeVisible();
  // PC 상세 분석 패널 — 고객 구분(RFM)·방문 주기·실현 매출이 공식 설명과 함께 보인다 (135~138, 리뷰 #H2)
  const analytics = page.getByTestId('customers-desktop').getByTestId('customer-analytics');
  await expect(analytics).toBeVisible();
  await expect(analytics.getByText('고객 구분')).toBeVisible();
  await expect(analytics.getByText('실현 매출', { exact: true })).toBeVisible(); // 객단가 설명의 '실현 매출 ÷ 방문'과 구분
  await expect(analytics.getByText(/매장 내 5분위/)).toBeVisible();
  await page.goto('/customers');
  await page.getByText(acc.customer).filter({ visible: true }).first().click();

  // ── 7-1. 고객 목록 엑셀 다운로드 (2026-11-17: 공통 저장 경로 회귀) ──
  const xlsxDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '다운로드', exact: true }).filter({ visible: true }).first().click();
  expect((await xlsxDownload).suggestedFilename()).toMatch(/^.+_고객목록_\d{4}-\d{2}-\d{2}\.xlsx$/); // 매장명 접두(88) — 설정 내보내기와 같은 파일명 규칙

  // ── 8. 고객 상세 결제 내역 — 시술 연계로 등록한 50,000원이 보이고, [결제 등록]은 고객 프리필로 매출 화면을 연다 (2026-11-17) ──
  const desk = page.getByTestId('customers-desktop');
  await expect(desk.getByRole('heading', { name: '결제 내역' })).toBeVisible();
  await expect(desk.getByTestId('customer-payments').getByText(/50,000/).first()).toBeVisible();
  await desk.getByRole('button', { name: '결제 등록' }).click();
  await expect(page).toHaveURL(/\/sales/);
  const payForm3 = page.locator('form').filter({ hasText: '구분 (매출/환불)' });
  await expect(payForm3).toBeVisible();
  await expect(payForm3.getByRole('combobox', { name: '고객' })).toHaveValue(new RegExp(acc.customer));

  // ── 8-1. 노쇼 (2026-11-17, 상세 버튼 2026-11-18): 지난 확정 예약을 상세에서 [노쇼] 처리하면 고객 상세에 "노쇼 1회"가 보인다 ──
  const noshowId = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_reservations$/.test(k))!;
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    const id = 'noshow_' + Date.now();
    list.push({ ...list[0], id, date: '2026-11-10', status: 'confirmed' });
    localStorage.setItem(key, JSON.stringify(list));
    return id;
  });
  await page.goto(`/reservations?open=${noshowId}`);
  await page.getByRole('button', { name: '노쇼', exact: true }).click();
  await acceptAppConfirm(page, '노쇼 처리', '노쇼 기록');
  const noshowStatus = await page.evaluate(id => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_reservations$/.test(k))!;
    return JSON.parse(localStorage.getItem(key) || '[]').find((r: { id: string }) => r.id === id)?.status;
  }, noshowId);
  expect(noshowStatus).toBe('noshow');
  await page.goto('/customers');
  await page.getByText(acc.customer).filter({ visible: true }).first().click();
  await expect(desk.getByTestId('noshow-badge')).toContainText('노쇼 1회');

  // ── 9. 고객 상세 [예약 추가] → 예약 추가 모달에 고객이 미리 선택된다 (2026-11-17) ──
  await page.goto('/customers');
  await page.getByText(acc.customer).filter({ visible: true }).first().click();
  await desk.getByRole('button', { name: '예약 추가' }).click();
  await expect(page).toHaveURL(/\/reservations/);
  await expect(page.getByRole('combobox', { name: '고객' }).filter({ visible: true }).first()).toHaveValue(new RegExp(acc.customer));

  // ── 9-0. 고객 상세 [메시지] → 발송 모달이 그 고객 한 명을 수신 대상으로 연다 (2026-11-18) ──
  await page.goto('/customers');
  await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
  await desk.getByRole('button', { name: '메시지', exact: true }).click();
  await expect(page).toHaveURL(/\/messaging$/); // ?customer=는 1회 캡처 후 비워진다
  await expect(page.getByTestId('recipient-single')).toContainText(acc.customer);
  await page.getByRole('button', { name: '대상 바꾸기' }).click();
  await expect(page.getByTestId('recipient-single')).toHaveCount(0);

  // ── 9-0-1. 기록 → 고객 상세 역링크 (2026-11-18): 예약 상세의 고객명을 누르면 고객 상세가 열린다 ──
  const firstResId = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_reservations$/.test(k))!;
    return JSON.parse(localStorage.getItem(key) || '[]')[0].id as string;
  });
  await page.goto(`/reservations?open=${firstResId}`);
  await page.getByRole('button', { name: `${acc.customer} 고객 상세 열기` }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await expect(desk.getByTestId('customer-timeline')).toBeVisible();

  // ── 9-1. 중복 고객 병합 (2026-11-18): 같은 전화번호의 중복 레코드(결제·예약·시술 1건, 방문 2회)를 만들면 상세에 "중복 의심" 안내가 뜨고, 본 고객으로 흡수 → 기록·방문·누적 결제가 합쳐지고 중복은 사라진다 ──
  const dupName = acc.customer + '중복';
  const beforeMerge = await page.evaluate(dupName => {
    const key = (re: RegExp) => Object.keys(localStorage).find(k => re.test(k))!;
    const read = (re: RegExp) => JSON.parse(localStorage.getItem(key(re)) || '[]');
    const write = (re: RegExp, v: unknown) => localStorage.setItem(key(re), JSON.stringify(v));
    const customers = read(/^crm_.*_customers$/);
    const payments = read(/^crm_.*_payments$/);
    const reservations = read(/^crm_.*_reservations$/);
    const logs = read(/^crm_.*_treatment_logs$/);
    const programs = read(/^crm_.*_customer_programs$/);
    const main = customers.find((c: { name: string }) => c.name === dupName.replace('중복', ''));
    const dupId = 'dup_' + Date.now();
    const now = new Date().toISOString();
    customers.push({ ...main, id: dupId, name: dupName, totalVisits: 2, totalSpent: 7000, memo: '중복 메모', grade: 'VIP', registeredAt: '2020-01-01T00:00:00.000Z' });
    payments.push({ id: 'duppay_' + Date.now(), shopId: main.shopId, customerId: dupId, customerName: dupName, paymentDate: '2026-01-10', type: 'other', typeLabel: '기타', amount: 7000, paymentMethod: 'cash', discountAmount: 0, status: 'completed', createdAt: now });
    reservations.push({ ...reservations[0], id: 'dupres_' + Date.now(), customerId: dupId, customerName: dupName, date: '2026-01-10', status: 'completed' });
    logs.push({ id: 'duplog_' + Date.now(), shopId: main.shopId, customerId: dupId, customerName: dupName, treatmentDate: '2026-01-10', sessionsUsed: 0, treatmentDetails: '중복 시술', nextAppointment: '2026-12-24', createdAt: now });
    write(/^crm_.*_customers$/, customers); write(/^crm_.*_payments$/, payments); write(/^crm_.*_reservations$/, reservations); write(/^crm_.*_treatment_logs$/, logs);
    const byMain = (list: { customerId: string }[]) => list.filter(x => x.customerId === main.id).length;
    return { visits: main.totalVisits as number, spent: main.totalSpent as number, payments: byMain(payments), reservations: byMain(reservations), logs: byMain(logs), used: programs.map((p: { usedSessions: number }) => p.usedSessions) as number[] };
  }, dupName);
  await page.goto('/customers');
  await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
  // [⋯ 더보기] 메뉴 키보드(ARIA 메뉴 패턴, 2026-11-18): 중복이 있는 일반 고객이라 병합·익명화·삭제 3항목 — End → 마지막, Home → 첫, ↑는 첫에서 마지막으로 순환
  await desk.getByRole('button', { name: '더보기', exact: true }).click();
  const kbMenu = desk.getByRole('menu', { name: '고객 관리 더보기' });
  await expect(kbMenu.getByRole('menuitem')).toHaveCount(3);
  await page.keyboard.press('End');
  await expect(kbMenu.getByRole('menuitem', { name: '고객 삭제' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(kbMenu.getByRole('menuitem', { name: '중복 고객 병합' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(kbMenu.getByRole('menuitem', { name: '고객 삭제' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(kbMenu).toHaveCount(0);
  await desk.getByTestId('dup-hint').click(); // "중복 의심 고객 1명 — 병합하기" → 병합 창이 의심 후보를 사유 배지와 함께 먼저 보여 준다 (171)
  const mergeDialog = page.getByRole('dialog', { name: '고객 병합', exact: true }); // 확인창 '고객 병합 확인'과 부분일치하지 않게 (114)
  await expect(mergeDialog.getByLabel('병합할 고객 검색')).toHaveValue('');
  await expect(mergeDialog.getByTestId('dup-reason').first()).toContainText('같은 전화번호'); // 다중 키 사유 (171, GAP C-9)
  const dupOption = mergeDialog.getByRole('radio', { name: new RegExp(dupName) });
  await expect(dupOption).toHaveCount(1);
  await dupOption.check();
  await expect(mergeDialog.getByTestId('merge-preview')).toContainText('예약 1 · 시술 1 · 프로그램 0 · 결제 1');
  await mergeDialog.getByRole('button', { name: '병합 실행' }).click();
  await page.getByRole('dialog', { name: '고객 병합 확인' }).getByRole('button', { name: '병합', exact: true }).click(); // 앱 확인창(113 — window.confirm 아님)
  await expect(mergeDialog).toHaveCount(0);
  await expect(desk).toContainText('중복 메모'); // 흡수된 고객의 메모가 본 고객 메모에 합쳐짐
  await expect(desk.getByTestId('dup-hint')).toHaveCount(0); // 중복이 사라져 안내도 사라진다
  const afterMerge = await page.evaluate(name => {
    const key = (re: RegExp) => Object.keys(localStorage).find(k => re.test(k))!;
    const read = (re: RegExp) => JSON.parse(localStorage.getItem(key(re)) || '[]');
    const customers = read(/^crm_.*_customers$/);
    const main = customers.find((c: { name: string }) => c.name === name);
    const byMain = (list: { customerId: string }[]) => list.filter(x => x.customerId === main.id).length;
    const orphan = (list: { customerId: string }[]) => list.filter(x => x.customerId.startsWith('dup_')).length;
    const payments = read(/^crm_.*_payments$/), reservations = read(/^crm_.*_reservations$/), logs = read(/^crm_.*_treatment_logs$/);
    return {
      count: customers.filter((c: { name: string }) => c.name.startsWith(name)).length,
      visits: main.totalVisits, spent: main.totalSpent, memo: main.memo, grade: main.grade, registeredAt: main.registeredAt,
      payments: byMain(payments), reservations: byMain(reservations), logs: byMain(logs),
      orphans: orphan(payments) + orphan(reservations) + orphan(logs),
      used: read(/^crm_.*_customer_programs$/).map((p: { usedSessions: number }) => p.usedSessions),
    };
  }, acc.customer);
  expect(afterMerge.count).toBe(1);
  expect(afterMerge.visits).toBe(beforeMerge.visits + 2);
  expect(afterMerge.spent).toBe(beforeMerge.spent + 7000);
  expect(afterMerge.payments).toBe(beforeMerge.payments + 1);
  expect(afterMerge.reservations).toBe(beforeMerge.reservations + 1);
  expect(afterMerge.logs).toBe(beforeMerge.logs + 1);
  expect(afterMerge.orphans).toBe(0); // 흡수 고객 id를 가리키는 기록이 남지 않는다
  expect(afterMerge.used).toEqual(beforeMerge.used); // 시술 이동이 회차권 사용 횟수를 건드리지 않는다
  expect(afterMerge.memo).toContain('중복 메모');
  expect(afterMerge.grade).toBe('VIP'); // 등급은 높은 쪽
  expect(afterMerge.registeredAt).toBe('2020-01-01T00:00:00.000Z'); // 등록일은 이른 쪽

  // ── 9-1-b. 고객 이름 변경 전파 (11차 #H1·H2, 115): 개명하면 예약·시술·결제에 복사된 이름도 바뀌고(토스트에 건수), 되돌리면 다시 원래대로 ──
  const renameTo = async (name: string) => {
    await desk.getByRole('button', { name: '수정', exact: true }).click(); // 상세 머리의 [수정] 하나뿐 — 둘이 되면 strict 위반으로 바로 드러나게 .first() 를 쓰지 않는다
    const editDialog = page.getByRole('dialog', { name: '고객 정보 수정' });
    await editDialog.getByRole('textbox', { name: '이름' }).fill(name);
    await editDialog.getByRole('button', { name: '저장', exact: true }).click();
    await expect(editDialog).toHaveCount(0);
    await expect(page.getByText(/기록 \d+건의 고객 이름·연락처도 함께 바꿨습니다/).first()).toBeVisible(); // 토스트(4초)는 localStorage 전수 파싱 전에 본다 — 토스트 호스트가 PC·모바일 레이아웃에 하나씩이라 2개
    await expect(desk.getByRole('heading', { name, exact: true })).toBeVisible(); // 부분일치면 '…개명' 헤딩이 남아도 복구 단계가 통과한다
    return page.evaluate(n => {
      const key = (re: RegExp) => Object.keys(localStorage).find(k => re.test(k))!;
      const read = (re: RegExp) => JSON.parse(localStorage.getItem(key(re)) || '[]');
      const main = read(/^crm_.*_customers$/).find((c: { name: string }) => c.name === n);
      const names = new Set<string>();
      let count = 0;
      for (const re of [/^crm_.*_payments$/, /^crm_.*_reservations$/, /^crm_.*_treatment_logs$/]) {
        for (const row of read(re) as { customerId: string; customerName: string }[]) if (row.customerId === main.id) { names.add(row.customerName); count++; }
      }
      return { names: [...names], count };
    }, name);
  };
  const renamed = await renameTo(`${acc.customer}개명`);
  expect(renamed.count).toBeGreaterThanOrEqual(3); // 병합으로 옮겨온 결제·예약·시술 포함
  expect(renamed.names).toEqual([`${acc.customer}개명`]); // 옛 이름 사본이 하나도 남지 않는다
  const restored = await renameTo(acc.customer);
  expect(restored.names).toEqual([acc.customer]);

  // ── 9-2. 활동 타임라인 (2026-11-18): 병합으로 옮겨온 결제·예약·시술이 한 줄기 시간순에 보이고, 종류 칩으로 걸러지며, 시술 항목을 누르면 시술 상세가 열린다 ──
  const timeline = desk.getByTestId('customer-timeline');
  await timeline.scrollIntoViewIfNeeded();
  await timeline.getByRole('button', { name: '결제', pressed: false }).click(); // 종류 토글 — 옮겨온 2026-01-10 결제는 전체 보기에선 12건 뒤로 밀릴 수 있다
  await expect(timeline.getByRole('listitem')).toHaveCount(Math.min(12, beforeMerge.payments + 1));
  await expect(timeline).toContainText('7,000');
  await timeline.getByRole('button', { name: '시술', pressed: false }).click();
  await expect(timeline).toContainText('중복 시술');
  await timeline.getByRole('button', { name: /중복 시술/ }).click();
  await expect(page).toHaveURL(/\/treatments$/); // ?open=은 1회 캡처 후 비워진다
  await expect(page.getByText('시술 기록 상세').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('중복 시술').filter({ visible: true }).first()).toBeVisible();
  // 다음 방문 권장일 → [이 날짜로 예약] → 예약 추가 모달에 고객·날짜가 미리 들어간다 (2026-11-18)
  await page.keyboard.press('Escape'); // 공용 Modal Esc 스택으로 상세가 닫힌다
  await expect(page.getByText('시술 기록 상세')).toHaveCount(0);
  // 시술 목록 기간·담당자 필터 (2026-11-18): 2026-01-10 기록은 '이번 달'(실행 월이 2026-01이 아닌 한)에서 빠지고 초기화로 돌아온다
  await page.goto('/treatments');
  const treatList = page.getByTestId('treatments-desktop');
  await expect(treatList.getByText('중복 시술').first()).toBeVisible();
  await treatList.getByRole('button', { name: '이번 달', pressed: false }).click();
  await expect(treatList.getByText('중복 시술')).toHaveCount(0);
  await treatList.getByRole('button', { name: '초기화' }).click();
  await expect(treatList.getByText('중복 시술').first()).toBeVisible();
  await treatList.getByText('중복 시술').first().click();
  await page.getByRole('button', { name: '이 날짜로 예약' }).click();
  await expect(page).toHaveURL(/\/reservations$/);
  await expect(page.getByLabel('예약 날짜')).toHaveValue('2026-12-24');
  await expect(page.getByRole('combobox', { name: '고객' }).filter({ visible: true }).first()).toHaveValue(new RegExp(acc.customer)); // 병합돼 본 고객으로 옮겨진 기록

  // ── 9-3. 직원별 월 실적 (2026-11-18): 첫 예약을 완료로 만들면 직원 화면 실적 표에 완료 예약·예약액이 집계되고, 보고 문구가 만들어진다 ──
  const perfExpected = await page.evaluate(() => {
    const key = (re: RegExp) => Object.keys(localStorage).find(k => re.test(k))!;
    const list = JSON.parse(localStorage.getItem(key(/^crm_.*_reservations$/)) || '[]');
    const staffList = JSON.parse(localStorage.getItem(key(/^crm_.*_staff$/)) || '[]');
    const t = new Date();
    const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const first = list.find((r: { date: string; status: string }) => r.date === today && r.status !== 'noshow' && r.status !== 'cancelled');
    if (!first) throw new Error('오늘 날짜의 유효한 예약이 없음 — 앞 단계가 바뀌었는지 확인');
    first.status = 'completed';
    first.totalPrice = 50000;
    localStorage.setItem(key(/^crm_.*_reservations$/), JSON.stringify(list));
    const staffId = first.staffId as string;
    const ym = today.slice(0, 7);
    const done = list.filter((r: { staffId: string; status: string; date: string }) => r.staffId === staffId && r.status === 'completed' && r.date.startsWith(ym));
    return { name: staffList.find((s: { id: string }) => s.id === staffId).name as string, count: done.length as number, amount: done.reduce((s: number, r: { totalPrice: number }) => s + (r.totalPrice || 0), 0) as number };
  });
  await page.goto('/staff');
  const perf = page.getByTestId('staff-performance');
  const perfRow = perf.locator('tbody tr').filter({ has: page.getByRole('cell', { name: perfExpected.name, exact: true }) });
  await expect(perfRow).toHaveCount(1);
  await expect(perfRow.locator('td').nth(1)).toHaveText(`${perfExpected.count}건`); // 완료 건수 칸
  await expect(perfRow.locator('td').nth(2)).toHaveText(`${perfExpected.amount.toLocaleString('ko-KR')}원`); // 완료 예약액 칸
  await perf.getByRole('button', { name: '보고 문구' }).click();
  await expect(perf.locator('pre')).toContainText(`${perfExpected.name}: 완료 예약 ${perfExpected.count}건`);

  // ── 9-3-0. 직원 퇴사 처리/복직 (2026-11-18): 삭제 대신 비활성 — 재직 목록에서 빠지고 '퇴사·비활성' 필터에 보이며, 복직하면 돌아온다 ──
  await page.getByRole('heading', { name: perfExpected.name }).first().click(); // 직원 카드
  await page.getByRole('button', { name: '퇴사 처리' }).click();
  await acceptAppConfirm(page, '퇴사 처리', '퇴사 처리');
  await expect(page.getByText('퇴사 처리했습니다.').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: perfExpected.name })).toHaveCount(0); // 기본 '재직' 필터에서 사라짐
  await page.getByRole('button', { name: '퇴사·비활성' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(perfExpected.name) }).first()).toContainText('퇴사');
  await page.getByRole('heading', { name: new RegExp(perfExpected.name) }).first().click();
  await page.getByRole('button', { name: '복직' }).click();
  await acceptAppConfirm(page, '복직 처리', '복직');
  await expect(page.getByText('복직 처리했습니다.').first()).toBeVisible();
  await page.getByRole('button', { name: '재직', exact: true }).click();
  await expect(page.getByRole('heading', { name: perfExpected.name })).toBeVisible();

  // ── 9-3-1. 지정 휴일 (2026-11-18): 설정 > 영업시간에서 날짜를 추가·저장하면 다시 열어도 남아 있다 ──
  await page.goto('/settings');
  await page.getByRole('button', { name: '영업시간', exact: true }).filter({ visible: true }).first().click();
  const holidays = page.getByTestId('holidays-editor');
  await holidays.getByLabel('휴일 날짜').fill('2027-01-01');
  await holidays.getByRole('button', { name: '휴일 추가' }).click();
  await expect(holidays).toContainText('2027-01-01'); // 추가 즉시 저장
  await page.goto('/settings');
  await page.getByRole('button', { name: '영업시간', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('holidays-editor')).toContainText('2027-01-01');

  // ── 9-4. 전체 백업 파일 저장·복원 (2026-11-18): JSON에 고객이 들어 있고, 고객 테이블을 비운 뒤 그 파일로 복원하면 돌아온다 ──
  await page.goto('/settings');
  await page.getByRole('button', { name: '백업·보안', exact: true }).filter({ visible: true }).first().click();
  const backupCard = page.getByTestId('backup-restore-card');
  // 비밀값을 심어 두고 백업 파일에 들어가지 않는지 본다 (96). 백업 파일은 crm_<shop>_<table> 키만 모으므로 AI 키·게이트웨이 키·로컬 계정은
  // 접두사 걸러내기의 회귀 방지이고, 실제로 규칙이 작동해야 빠지는 것은 settings.smsApiKey다. Electron 스냅샷 경로의 키 목록은 lib-units.spec(backupSanitize)에서 검증 (리뷰 97)
  await page.evaluate(() => {
    localStorage.setItem('ai_key_openai', 'sk-SECRET-TEST');
    localStorage.setItem('crm_sms_gateway_key', 'gw-SECRET-TEST');
    const sKey = Object.keys(localStorage).find(k => /^crm_.*_settings$/.test(k));
    if (sKey) { const st = JSON.parse(localStorage.getItem(sKey) || '{}'); st.smsApiKey = 'sms-SECRET-TEST'; localStorage.setItem(sKey, JSON.stringify(st)); }
  });
  const backupDownload = page.waitForEvent('download');
  await backupCard.getByRole('button', { name: '백업 파일 저장' }).click();
  const backupFile = await backupDownload;
  expect(backupFile.suggestedFilename()).toMatch(/_전체백업_\d{4}-\d{2}-\d{2}\.json$/);
  const backupPath = await backupFile.path();
  const backupJson = JSON.parse(readFileSync(backupPath!, 'utf8'));
  expect(backupJson.format).toBe('troiareuke-crm-backup');
  const backupText = readFileSync(backupPath!, 'utf8');
  expect(backupText).not.toContain('SECRET-TEST'); // AI 키·게이트웨이 키·smsApiKey 어느 것도 파일에 없다
  expect(backupText).not.toContain('troiareuke_local_users');
  expect((backupJson.tables.customers as { name: string }[]).some(c => c.name === acc.customer)).toBe(true);
  // 손상 흉내: 고객 테이블을 비운다
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_customers$/.test(k))!;
    localStorage.setItem(key, '[]');
  });
  await backupCard.getByLabel('백업 파일 선택').setInputFiles(backupPath!);
  await expect(backupCard.getByTestId('restore-preview')).toContainText('고객');
  const reloaded = page.waitForEvent('load'); // 복원 뒤 location.reload() — 끝나기 전에 이동하면 내비게이션이 끊긴다
  await backupCard.getByRole('button', { name: '복원 실행' }).click();
  await page.getByRole('dialog', { name: '백업 복원', exact: true }).getByRole('button', { name: '복원', exact: true }).click(); // 앱 확인창 — 복원 직후 새로고침되므로 닫힘 단언은 생략
  await reloaded;
  const restoredShopName = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_settings$/.test(k))!;
    return JSON.parse(localStorage.getItem(key) || '{}').name;
  });
  expect(restoredShopName).toBe(acc.shop); // 배열이 아닌 테이블(설정)도 살아난다
  await page.goto('/customers');
  await expect(page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });

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
  await bar.getByRole('button', { name: '1명 익명화' }).click();
  const anonConfirm = page.getByRole('dialog', { name: '보존기간 경과 고객 익명화' });
  await expect(anonConfirm.getByTestId('confirm-dialog')).toContainText('1명'); // 건수가 창에 보인다 (113)
  await anonConfirm.getByRole('button', { name: '1명 익명화' }).click();
  await expect(page.getByText('고객 1명을 익명화했습니다.').first()).toBeVisible();
  await expect(bar).toContainText('경과 0명');
  await page.goto('/customers');
  await expect(page.getByText('탈퇴고객').filter({ visible: true }).first()).toBeVisible();
  // 익명화 고객 상세에는 [예약 추가]·[메시지]가 없다 — 발송·예약 대상이 아니므로 (2026-11-18)
  await page.getByText('탈퇴고객').filter({ visible: true }).first().click();
  await expect(desk.getByText('익명화됨')).toBeVisible();
  await expect(desk.getByRole('button', { name: '메시지', exact: true })).toHaveCount(0);
  await expect(desk.getByRole('button', { name: '예약 추가' })).toHaveCount(0);
  await expect(desk.getByRole('button', { name: '고객 익명화' })).toHaveCount(0); // 이미 익명화된 고객에는 [익명화] 없음
  // PC 상세의 병합·익명화·삭제는 [⋯ 더보기] 메뉴 안에 있다 (2026-11-18) — 열면 role=menu, 익명화 고객에는 [익명화] 항목이 없고 [고객 삭제]만, Esc로 닫힘
  await desk.getByRole('button', { name: '더보기', exact: true }).click();
  const moreMenu = desk.getByRole('menu', { name: '고객 관리 더보기' });
  await expect(moreMenu).toBeVisible();
  await expect(moreMenu.getByRole('menuitem', { name: '고객 익명화' })).toHaveCount(0);
  await expect(moreMenu.getByRole('menuitem', { name: '고객 삭제' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(moreMenu).toHaveCount(0);
  // 목록 정렬 선택이 동작한다 (2026-11-18)
  await page.getByLabel('정렬').filter({ visible: true }).first().selectOption('name');
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
