import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts, solidPng } from './helpers';

/**
 * 킬러 기능 ② Before/After E2E (로컬 모드 빌드)
 * 시술 기록에 사진 2장 업로드(전/후 기본 태그·각도 지정) → 고객 상세 타임랩스에서 각도 필터·비교 보기
 * → 비교 이미지 PNG 내려받기까지. 캔버스 합성 경로가 실제 브라우저에서 동작하는지 보장한다.
 */

const acc = makeAccount('BA');

test('시술 사진 태그 → 고객 Before/After 비교 → 비교 이미지 저장', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // ── 시술 기록 + 사진 2장 ──
  await page.goto('/treatments');
  await page.getByRole('button', { name: '시술 기록 추가' }).click();
  await page.locator('select').filter({ hasText: '고객 선택' }).selectOption({ index: 1 });
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles([
    { name: 'before.png', mimeType: 'image/png', buffer: solidPng(64, [214, 120, 120]) },
    { name: 'after.png', mimeType: 'image/png', buffer: solidPng(64, [120, 200, 150]) },
  ]);
  // 기본 태그: 첫 장 '시술 전', 둘째 '시술 후'
  const labelSelects = page.getByLabel('시술 전후 구분');
  await expect(labelSelects).toHaveCount(2);
  await expect(labelSelects.nth(0)).toHaveValue('before');
  await expect(labelSelects.nth(1)).toHaveValue('after');
  const angleSelects = page.getByLabel('촬영 각도');
  await angleSelects.nth(0).selectOption('front');
  await angleSelects.nth(1).selectOption('left');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText(acc.customer).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
  await dismissToasts(page);

  // ── 고객 상세 → 타임랩스 (데스크톱 패널에 한정 — 모바일 상세 패널도 같은 뷰어를 숨김 상태로 렌더한다) ──
  await page.goto('/customers');
  await page.getByText(acc.customer).filter({ visible: true }).first().click();
  const desk = page.getByTestId('customers-desktop');
  await expect(desk.getByText('Before / After 타임랩스')).toBeVisible({ timeout: 10_000 });
  await expect(desk.getByText('사진 2장')).toBeVisible();
  // 각도 필터: '정면'만 남기면 썸네일 1장, '전체'로 돌리면 2장
  const angleGroup = desk.getByRole('group', { name: '촬영 각도 필터' });
  const thumbs = desk.getByRole('button', { name: /사진 선택$/ });
  await expect(thumbs).toHaveCount(2);
  await angleGroup.getByRole('button', { name: '정면', exact: true }).click();
  await expect(thumbs).toHaveCount(1);
  await angleGroup.getByRole('button', { name: '전체', exact: true }).click();
  await expect(thumbs).toHaveCount(2);

  // ── 비교 보기 → 이미지 저장(내려받기) ──
  await desk.getByRole('button', { name: '비교 보기' }).click();
  await expect(desk.getByText('D+0')).toBeVisible();
  await expect(desk.getByText(/^Before · /)).toBeVisible();
  await expect(desk.getByText(/^After · /)).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await desk.getByRole('button', { name: '이미지 저장' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/BeforeAfter_\d{4}-\d{2}-\d{2}\.png$/);
  await expect(page.getByText('비교 이미지를 내려받았습니다.').first()).toBeVisible();

  // ── 상담 기록에 비교 이미지 첨부 (2026-11-17) ──
  await desk.getByRole('button', { name: '상담 기록' }).first().click();
  const consult = page.getByRole('dialog').filter({ hasText: 'Before/After 비교 이미지 첨부' });
  await expect(consult).toBeVisible();
  await expect(consult.getByLabel('비교 Before 사진')).toHaveValue('0');
  await expect(consult.getByLabel('비교 After 사진')).toHaveValue('1');
  await consult.getByRole('button', { name: '비교 이미지 만들기' }).click();
  await expect(consult.getByAltText('비교 이미지 미리보기')).toBeVisible({ timeout: 10_000 });
  await expect(consult.getByText(/D\+0 비교 이미지가 준비됐습니다/)).toBeVisible();
  await consult.getByRole('button', { name: '상담 저장' }).click();
  await expect(consult).toBeHidden();
  const strip = desk.getByRole('button', { name: '상담 사진 크게 보기' });
  await expect(strip).toHaveCount(1);
  await strip.click();
  const lightbox = page.getByRole('dialog', { name: '사진 크게 보기' });
  await expect(lightbox.getByText(/상담 · Before\/After 비교/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(lightbox).toBeHidden();
  // 새로고침 후에도 상담 사진이 남는다 (photoStore 'consult:<id>')
  await page.reload();
  await page.getByText(acc.customer).filter({ visible: true }).first().click();
  await expect(desk.getByRole('button', { name: '상담 사진 크게 보기' })).toHaveCount(1, { timeout: 10_000 });

  // ── D4 (2026-11-17): 사진 캐시는 IndexedDB에 있고 localStorage에는 사진 키가 남지 않는다 ──
  const storage = await page.evaluate(async () => {
    const names = (await indexedDB.databases()).map(d => d.name);
    const lsPhotoKeys = Object.keys(localStorage).filter(k => k.startsWith('troiareuke_photos_') && k !== 'troiareuke_photos_dirty');
    return { hasDb: names.includes('troiareuke_photos'), lsPhotoKeys };
  });
  expect(storage.hasDb).toBe(true);
  expect(storage.lsPhotoKeys).toEqual([]);

  // 구버전(localStorage) 사진 3장을 심고 새로고침 → IndexedDB로 이관되고(무손실) 썸네일 3장이 보이며 localStorage 키는 제거된다
  const legacyKey = await page.evaluate(() => {
    const logsKey = Object.keys(localStorage).find(k => /^crm_.*_treatment_logs$/.test(k));
    const logs = logsKey ? JSON.parse(localStorage.getItem(logsKey) || '[]') : [];
    if (!logs.length) return null;
    const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#4477aa'; ctx.fillRect(0, 0, 8, 8);
    const dataUrl = canvas.toDataURL('image/png');
    const key = `troiareuke_photos_treatment:${logs[0].id}`;
    localStorage.setItem(key, JSON.stringify([1, 2, 3].map(i => ({ id: `legacy_${i}`, dataUrl, takenAt: new Date().toISOString() }))));
    return key;
  });
  expect(legacyKey).not.toBeNull();
  await page.reload();
  await page.getByText(acc.customer).filter({ visible: true }).first().click();
  await expect(desk.getByRole('button', { name: '시술 사진 크게 보기' })).toHaveCount(3, { timeout: 10_000 });
  await expect.poll(() => page.evaluate(k => localStorage.getItem(k), legacyKey!), { timeout: 10_000 }).toBeNull();
});
