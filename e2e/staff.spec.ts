import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, pickCustomer } from './helpers';

/**
 * 직원 흐름 E2E (로컬 모드, 2026-11-19 ㉙) — 직원을 추가하면 예약 담당 선택지에 바로 뜨고, 완료 예약이 실적 표에 잡히며,
 * 이름을 바꿔도(staffId 연결) 실적이 유지되고, 퇴사 처리하면 새 예약 담당 목록에서 빠지되 기록·실적은 "(퇴사)"로 남는지.
 */

const acc = makeAccount('ST');

test('직원 추가 → 예약 담당 → 실적 → 이름 변경 → 퇴사·복직이 맞게 반영된다', async ({ page }) => {
  test.slow();
  const now = new Date();
  test.skip(now.getHours() === 23 && now.getMinutes() >= 50, '자정 경계 — 예약을 만든 날과 실적의 이번 달이 달라질 수 있다');
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // ── 직원 추가: 박신입(에스테티션) — 같은 이름의 재직자(김테스트)는 거절 ──
  await page.goto('/staff');
  await page.getByRole('button', { name: '직원 추가' }).first().click();
  const addDialog = page.getByRole('dialog', { name: '직원 추가' });
  await addDialog.getByLabel('이름').fill('김테스트');
  await addDialog.getByPlaceholder('010-0000-0000').fill('010-2222-3333');
  await addDialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.locator('[aria-live="polite"]').getByText(/같은 이름/)).toBeVisible();
  await expect(addDialog).toBeVisible();
  await addDialog.getByLabel('이름').fill('박신입');
  await addDialog.getByLabel('역할').selectOption('에스테티션');
  await addDialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(addDialog).toHaveCount(0);
  await expect(page.getByText('박신입').filter({ visible: true }).first()).toBeVisible();

  // ── 예약: 담당 직원 선택지에 새 직원이 뜨고, 10:00 예약 → 완료처리 ──
  await page.goto('/reservations');
  await page.getByRole('button', { name: '예약 추가' }).first().click();
  const dialog = page.getByRole('dialog', { name: '예약 추가' });
  await pickCustomer(page, acc.customer, dialog);
  await dialog.getByLabel('담당 직원').selectOption({ label: '박신입 (에스테티션)' });
  await dialog.getByLabel('시술', { exact: true }).selectOption({ index: 1 });
  await dialog.getByLabel('시작 시간').selectOption('10:00');
  await dialog.getByRole('button', { name: '예약 저장' }).click();
  await expect(dialog).toHaveCount(0);
  await page.locator('[data-testid="reservation-block"][data-start="10:00"]').click();
  const detail = page.getByRole('dialog', { name: '예약 상세' });
  await expect(detail).toContainText('박신입');
  await detail.getByRole('button', { name: '완료처리' }).click();
  await page.getByRole('button', { name: '결제 등록 없이 닫기' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // ── 직원 실적: 박신입 완료 1건 · 완료 예약액 50,000원 ──
  await page.goto('/staff');
  const perf = page.getByTestId('staff-performance');
  const rowOf = (name: string) => perf.locator('tbody tr').filter({ hasText: name }).first();
  await expect(rowOf('박신입').getByTestId('perf-completed')).toHaveText('1건');
  await expect(rowOf('박신입').getByTestId('perf-amount')).toHaveText('50,000원');

  // ── 이름 변경(박신입 → 박선임): 예약은 staffId로 연결돼 실적이 그대로 따라온다 ──
  await page.getByRole('heading', { name: /^박신입/ }).first().click(); // 직원 카드 제목 — 아래 '오늘 직원별 예약 현황'의 이름과 구분
  const staffDetail = page.getByRole('dialog', { name: '직원 상세' });
  await staffDetail.getByRole('button', { name: '수정' }).click();
  const editDialog = page.getByRole('dialog', { name: '직원 수정' });
  await editDialog.getByLabel('이름').fill('박선임');
  await editDialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editDialog).toHaveCount(0);
  await expect(rowOf('박선임').getByTestId('perf-completed')).toHaveText('1건');
  await expect(perf.locator('tbody tr').filter({ hasText: '박신입' })).toHaveCount(0);

  // ── 퇴사 처리: 새 예약 담당 목록에서 빠지고, 실적 표에는 "(퇴사)"로 남는다 ──
  await page.getByRole('heading', { name: /^박선임/ }).first().click();
  await staffDetail.getByRole('button', { name: '퇴사 처리' }).click(); // confirm 수락
  await expect(page.locator('[aria-live="polite"]').getByText('퇴사 처리했습니다.')).toBeVisible();
  await expect(rowOf('박선임')).toContainText('박선임 (퇴사)');
  await expect(rowOf('박선임').getByTestId('perf-completed')).toHaveText('1건');
  await page.goto('/reservations');
  await page.getByRole('button', { name: '예약 추가' }).first().click();
  await expect(dialog.getByLabel('담당 직원').locator('option', { hasText: '박선임' })).toHaveCount(0);
  await expect(dialog.getByLabel('담당 직원').locator('option', { hasText: '김테스트' })).toHaveCount(1);

  // ── 복직: 담당 목록에 돌아온다 ──
  await page.goto('/staff');
  await page.getByRole('button', { name: '퇴사·비활성' }).click();
  // 복직 전에 같은 이름의 재직자를 만들면 거절된다 — 이름으로 잇는 기록이 섞이지 않게
  await page.getByRole('button', { name: '재직' }).click();
  await page.getByRole('heading', { name: /^김테스트/ }).first().click();
  await staffDetail.getByRole('button', { name: '수정' }).click();
  await editDialog.getByLabel('이름').fill('박선임');
  await editDialog.getByLabel('전화번호').fill('010-1111-2222'); // 온보딩으로 만든 직원은 전화번호가 비어 있어 수정 저장에 필요
  await editDialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editDialog).toHaveCount(0);
  await page.getByRole('button', { name: '퇴사·비활성' }).click();
  await page.getByRole('heading', { name: /^박선임/ }).first().click(); // 카드 제목에 '퇴사' 배지가 붙어 정확 일치 텍스트로는 잡히지 않는다
  await staffDetail.getByRole('button', { name: '복직' }).click();
  await expect(page.locator('[aria-live="polite"]').getByText('같은 이름의 재직 직원이 이미 있어 복직할 수 없습니다. 먼저 이름을 바꿔주세요.')).toBeVisible();
  await expect(staffDetail).toBeVisible(); // 거절이라 창은 그대로
  await page.keyboard.press('Escape');
  await expect(staffDetail).toHaveCount(0);
  // 재직자 이름을 되돌린 뒤 복직
  await page.getByRole('button', { name: '재직' }).click();
  await page.getByRole('heading', { name: /^박선임/ }).first().click();
  await staffDetail.getByRole('button', { name: '수정' }).click();
  await editDialog.getByLabel('이름').fill('김테스트');
  await editDialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editDialog).toHaveCount(0);
  await page.getByRole('button', { name: '퇴사·비활성' }).click();
  await page.getByRole('heading', { name: /^박선임/ }).first().click();
  await staffDetail.getByRole('button', { name: '복직' }).click();
  await expect(page.locator('[aria-live="polite"]').getByText('복직 처리했습니다.')).toBeVisible();
  await page.goto('/reservations');
  await page.getByRole('button', { name: '예약 추가' }).first().click();
  await expect(dialog.getByLabel('담당 직원').locator('option', { hasText: '박선임' })).toHaveCount(1);
});
