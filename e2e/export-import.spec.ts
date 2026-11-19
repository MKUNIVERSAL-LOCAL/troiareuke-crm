import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer } from './helpers';

/**
 * 엑셀 왕복 E2E (로컬 모드) — 고객 업로드 양식 다운로드 → 그 파일을 그대로 업로드(예시 2명 등록) → 설정 데이터 내보내기(전체 항목) 다운로드.
 * xlsx가 지연 로드로 바뀐 뒤(⑰) 실제 내보내기·읽기 경로가 빌드에서 동작하는지 매 릴리스 확인한다 (2026-11-19).
 */

const acc = makeAccount('XL');

test('고객 양식 다운로드 → 업로드 왕복, 설정 데이터 내보내기가 실제 파일로 동작한다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // ── 양식 다운로드 (업로드 안내 패널 → 양식 다운로드) ──
  await page.goto('/customers');
  await page.getByRole('button', { name: '업로드' }).click();
  const templateDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '양식 다운로드' }).click();
  const template = await templateDownload;
  expect(template.suggestedFilename()).toBe('고객_업로드_양식.xlsx');
  const templatePath = await template.path();
  expect(templatePath).toBeTruthy();
  await page.keyboard.press('Escape'); // 안내 패널 닫기

  // ── 받은 양식 그대로 업로드 → 예시 2명 추가 (이름·전화 누락/중복 0) ──
  await page.locator('input[type="file"][accept*=".xlsx"]').setInputFiles(templatePath!);
  await expect(page.getByText('고객 업로드 완료: 2명 추가, 0건 건너뜀(이름/전화 누락 또는 중복).')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('3명', { exact: true }).first()).toBeVisible(); // 직접 등록 1 + 양식 2

  // ── 같은 파일을 다시 올리면 전부 중복으로 건너뜀 ──
  await page.locator('input[type="file"][accept*=".xlsx"]').setInputFiles(templatePath!);
  await expect(page.getByText('고객 업로드 완료: 0명 추가, 2건 건너뜀(이름/전화 누락 또는 중복).')).toBeVisible({ timeout: 15_000 });

  // ── 고객 목록 내보내기(1행 민감정보 안내 + 2행 머리글)를 그대로 다시 올리면 머리글을 알아보고 3명 전부 중복으로 건너뛴다 (89·90) ──
  const listDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '다운로드', exact: true }).filter({ visible: true }).first().click();
  const listFile = await listDownload;
  expect(listFile.suggestedFilename()).toMatch(/_고객목록_\d{4}-\d{2}-\d{2}\.xlsx$/);
  const listPath = await listFile.path();
  await page.locator('input[type="file"][accept*=".xlsx"]').setInputFiles(listPath!);
  await expect(page.getByText('고객 업로드 완료: 0명 추가, 3건 건너뜀(이름/전화 누락 또는 중복).')).toBeVisible({ timeout: 15_000 });

  // ── 설정 > 백업·보안: 전체 선택 → 엑셀 다운로드 ──
  await page.goto('/settings');
  await page.getByRole('button', { name: '백업·보안' }).click();
  await page.getByRole('button', { name: '전체 선택' }).click();
  const exportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /선택 항목 다운로드/ }).click();
  const exported = await exportDownload;
  expect(exported.suggestedFilename()).toMatch(/_데이터내보내기_\d{4}-\d{2}-\d{2}\.xlsx$/);
  await expect(page.getByText(/개 항목, 총 [\d,]+행/)).toBeVisible({ timeout: 15_000 });
});
