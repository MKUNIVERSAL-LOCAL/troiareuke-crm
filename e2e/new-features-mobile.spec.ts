import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts, expectNoHorizontalOverflow, visibleButton } from './helpers';
import { registerPayment } from './flows';

/**
 * 폰 폭에서 새 기능 점검 (241) — 228~240 으로 들어온 화면은 PC 스펙만 있었다.
 * 매장은 태블릿·폰으로 쓰는 일이 많아(UI 품질 절대 기준) 영수증·수당·태그·등급·사진 백업이
 * 폰에서 눌릴 수 있고 가로로 넘치지 않아야 한다. 창 안쪽 가로 넘침까지 본다.
 */

const acc = makeAccount('NM');

test('폰 폭: 영수증·사진 백업·태그·등급·수당 화면이 눌리고 가로로 넘치지 않는다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // ── 결제 1건 → 모바일 카드 목록의 [영수증] (235) ──
  await page.goto('/sales');
  await registerPayment(page, acc, 90000);
  await dismissToasts(page);
  await expectNoHorizontalOverflow(page, '매출 화면(결제 직후 재예약 안내 포함)');
  await page.getByRole('button', { name: '결제 내역' }).click();
  const mobileList = page.getByTestId('sales-mobile-list');
  await expect(mobileList).toBeVisible();
  const download = page.waitForEvent('download');
  await mobileList.getByRole('button', { name: '영수증 저장' }).first().click();
  expect((await download).suggestedFilename()).toMatch(/_영수증_\d{4}-\d{2}-\d{2}\.pdf$/);
  await dismissToasts(page);
  await expectNoHorizontalOverflow(page, '결제 내역(모바일 카드)');

  // ── 설정: 영수증 정보·주의 키워드·사진 백업 (235·240·228) ──
  await page.goto('/settings');
  await visibleButton(page, '매장 정보').click();
  await page.getByTestId('settings-receipt-info').getByLabel('사업자등록번호').fill('123-45-67890');
  await page.getByTestId('settings-caution-keywords').getByLabel('새 주의 키워드').fill('레이저 금지');
  await page.getByTestId('settings-caution-keywords').getByRole('button', { name: '추가' }).click();
  await dismissToasts(page);
  await expectNoHorizontalOverflow(page, '설정 > 매장 정보(영수증·주의 키워드)');

  await visibleButton(page, '백업·보안').click();
  await expect(page.getByTestId('photo-backup-card')).toBeVisible();
  await expect(page.getByTestId('photo-backup-inventory')).toContainText('저장된 사진이 없습니다');
  await expect(page.getByTestId('photo-backup-card').getByRole('button', { name: '사진 파일 저장' })).toBeDisabled();
  await expectNoHorizontalOverflow(page, '설정 > 백업·보안(사진 백업)');

  // ── 직원 실적 수당 패널 (233) ──
  await page.goto('/staff');
  const perf = page.getByTestId('staff-performance');
  await expect(perf).toBeVisible();
  await perf.getByRole('button', { name: '인센티브 비율' }).click();
  const commission = page.getByTestId('commission-panel');
  await expect(commission).toBeVisible();
  await commission.getByLabel('매장 기본 시술 비율').fill('10');
  await commission.getByRole('button', { name: '비율 저장' }).click();
  await expect(page.getByText('인센티브 비율을 저장했습니다.')).toBeVisible();
  await dismissToasts(page);
  await expect(perf.getByText('수당(참고)')).toBeVisible();
  await expectNoHorizontalOverflow(page, '직원 실적(수당 열·비율 패널)');

  // ── 고객 창 태그 칩·태그 목록 관리 (237·239) ──
  await page.goto('/customers');
  await page.getByRole('button', { name: '고객 추가' }).click();
  const add = page.getByRole('dialog', { name: '고객 추가' });
  await expect(add).toBeVisible();
  await add.getByTestId('tag-master-open').click();
  const tagPanel = page.getByTestId('tag-master-panel');
  await expect(tagPanel).toBeVisible();
  await tagPanel.getByLabel('새 태그').fill('민감성');
  await tagPanel.getByRole('button', { name: '추가' }).click();
  await expect(tagPanel.getByText('#민감성')).toBeVisible();
  await expectNoHorizontalOverflow(page, '태그 목록 관리(폰)');
  await tagPanel.getByRole('button', { name: '민감성 태그 이름 바꾸기' }).click();
  await expect(page.getByTestId('tag-rename')).toBeVisible();
  await expectNoHorizontalOverflow(page, '태그 이름 바꾸기(폰)');
  await page.getByTestId('tag-rename').getByRole('button', { name: '취소' }).click();
  await tagPanel.getByRole('button', { name: '닫기' }).click();
  // 칩을 눌러 태그가 들어간다(폰에서도 손가락으로 눌릴 크기)
  await add.getByTestId('tag-chips').getByRole('button', { name: '#민감성' }).click();
  await expect(add.getByLabel('태그')).toHaveValue('민감성');
  await expectNoHorizontalOverflow(page, '고객 추가 창(태그 칩)');
  await add.getByRole('button', { name: '닫기' }).click();

  // ── 등급 제안 패널 (236·238) — 후보가 없으면 버튼이 없다(장식 UI 금지) ──
  await expect(page.getByTestId('grade-suggest-open')).toHaveCount(0);
  await expectNoHorizontalOverflow(page, '고객 목록(폰)');
});
