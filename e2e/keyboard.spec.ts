import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, pickCustomer } from './helpers';

/**
 * 키보드 조작 흐름 E2E (PC 폭, 2026-11-19 ㉟) — 마우스 없이도 핵심 동선이 막히지 않는지.
 * 전역 검색 단축키(/·Ctrl+K)와 입력 중 무시, 예약표 단축키(← → T N)와 모달 열림 중 무시, 모달 포커스 트랩(Tab/Shift+Tab 순환)·
 * 닫힌 뒤 연 버튼으로 포커스 복원, Ctrl+Enter 폼 제출, 입력 폼 창은 Esc로 닫히지 않고(입력 유실 방지) [닫기]로만 닫힘, 사이드바 링크 Enter 이동.
 */

const acc = makeAccount('KB');
/** 포커스를 비운다 — 사이드바(fixed) 위를 클릭하는 대신 blur (리뷰 2026-11-19) */
const blur = (page: import('@playwright/test').Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
const activeInfo = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  return {
    tag: el?.tagName ?? '',
    label: el?.getAttribute('aria-label') ?? el?.getAttribute('placeholder') ?? '',
    text: (el?.textContent ?? '').trim().slice(0, 30),
    dialog: el?.closest('[role="dialog"]')?.getAttribute('aria-label') ?? '',
  };
});

test('전역 검색·예약표 단축키·모달 포커스 트랩·Ctrl+Enter 제출이 키보드만으로 동작한다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // ── 전역 고객 검색: '/'로 포커스, 입력 중에는 무시, Ctrl+K는 입력 중에도 동작, Enter로 고객 관리 이동 ──
  await page.goto('/reservations');
  const globalSearch = page.getByPlaceholder('고객 검색 (/ 또는 Ctrl+K)');
  await blur(page);
  await page.keyboard.press('/');
  await expect(globalSearch).toBeFocused();
  await blur(page);
  // 다른 입력칸 안에서 '/'는 글자로 들어가야 한다 — 예약 추가 창을 열지 않고 페이지의 검색칸을 쓴다
  const pageSearch = page.getByPlaceholder('고객명, 전화번호, 담당 직원, 시술 검색').filter({ visible: true }).first();
  await pageSearch.click();
  await page.keyboard.press('/');
  await expect(pageSearch).toHaveValue('/');
  await expect(globalSearch).not.toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(globalSearch).toBeFocused();
  await pageSearch.fill('');
  await globalSearch.fill(acc.customer);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/customers\?q=/);
  await expect(page.getByTestId('customers-desktop').getByRole('button', { name: '프로그램 등록' }).first()).toBeVisible(); // 1명 일치 → 상세 자동 열림

  // ── 예약표 단축키: → 다음 주, T 오늘, N 새 예약; 모달이 열려 있으면 무시 ──
  await page.goto('/reservations');
  await blur(page);
  const weekLabel = page.getByRole('heading', { level: 3 }).filter({ hasText: /\d{4}년 \d{1,2}월/ }).first();
  const thisWeek = await weekLabel.innerText();
  await page.keyboard.press('ArrowRight');
  await expect(weekLabel).not.toHaveText(thisWeek);
  await page.keyboard.press('t');
  await expect(weekLabel).toHaveText(thisWeek);
  await page.keyboard.press('n');
  const addDialog = page.getByRole('dialog', { name: '예약 추가' });
  await expect(addDialog).toBeVisible();
  // 모달이 열려 있으면 단축키 무시 — 입력칸이 아닌 버튼에 포커스를 두고 눌러야 aria-modal 가드 자체를 검증한다 (리뷰 2026-11-19)
  await addDialog.getByRole('button', { name: '취소', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('t');
  await page.keyboard.press('n');
  await expect(weekLabel).toHaveText(thisWeek);
  await expect(page.getByRole('dialog')).toHaveCount(1);

  // ── 포커스 트랩: 첫 입력에 포커스, 맨 앞(닫기)에서 Shift+Tab은 맨 뒤(예약 저장)로, 맨 뒤에서 Tab은 맨 앞으로, 40번 Tab을 눌러도 창 안 ──
  await expect.poll(async () => (await activeInfo(page)).dialog).toBe('예약 추가');
  await addDialog.getByRole('button', { name: '닫기', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect.poll(async () => (await activeInfo(page)).text).toBe('예약 저장');
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await activeInfo(page)).label).toBe('닫기');
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  expect((await activeInfo(page)).dialog).toBe('예약 추가');

  // ── Esc로 닫히고(공용 Modal) 포커스는 연 버튼으로 돌아온다 ──
  await page.keyboard.press('Escape');
  await expect(addDialog).toHaveCount(0);
  await page.getByRole('button', { name: '예약 추가', exact: true }).click();
  await expect(addDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(addDialog).toHaveCount(0);
  await expect.poll(async () => (await activeInfo(page)).text).toContain('예약 추가'); // 포커스 복원은 effect cleanup에서 — 재시도형

  // ── Ctrl+Enter로 폼 제출: 필수값을 채우고 Ctrl+Enter → 저장되어 10:00 블록이 생긴다 ──
  await page.keyboard.press('n');
  await expect(addDialog).toBeVisible();
  await pickCustomer(page, acc.customer, addDialog);
  await addDialog.getByLabel('담당 직원').selectOption({ index: 1 });
  await addDialog.getByLabel('시술', { exact: true }).selectOption({ index: 1 });
  await addDialog.getByLabel('시작 시간').selectOption('10:00');
  await addDialog.getByLabel('시작 시간').press('Control+Enter');
  await expect(addDialog).toHaveCount(0);
  await expect(page.locator('[data-testid="reservation-block"][data-start="10:00"]')).toHaveCount(1);

  // ── 입력 폼 창(고객 추가)은 Esc로 닫히지 않는다(입력 유실 방지) — [닫기]로 닫히고 포커스는 연 버튼으로 ──
  await page.goto('/customers');
  const addCustomerBtn = page.getByRole('button', { name: '고객 추가' });
  await addCustomerBtn.click();
  const custDialog = page.getByRole('dialog', { name: '고객 추가' });
  await expect(custDialog).toBeVisible();
  await page.getByPlaceholder('홍길동').fill('키보드고객');
  await page.keyboard.press('Escape');
  await expect(custDialog).toBeVisible();
  await expect(page.getByPlaceholder('홍길동')).toHaveValue('키보드고객');
  await custDialog.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(custDialog).toHaveCount(0);
  await expect.poll(async () => (await activeInfo(page)).text).toContain('고객 추가');

  // ── 사이드바 링크: 포커스 후 Enter로 이동 ──
  await page.getByRole('link', { name: /예약 관리/ }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/reservations/);
});
