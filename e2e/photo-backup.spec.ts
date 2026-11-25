import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts, solidPng, countPhotoEntries, pickCustomer } from './helpers';

/**
 * 사진 내보내기·가져오기 E2E (228, GAP C-3)
 * 로컬 모드 매장의 전/후 사진은 이 기기 IndexedDB 에만 있고 전체 백업 파일에는 들어가지 않는다 →
 * 사진 파일로 내보내고, 사진이 전부 사라진 기기에 그 파일로 되돌릴 수 있어야 한다.
 * (여기서 "사라진 기기"는 IndexedDB 와 장수 캐시를 비워 흉내 낸다 — PC 포맷·브라우저 데이터 삭제와 같은 상태)
 */

const acc = makeAccount('PB');

/** 사진 저장소를 비운다 — PC 교체·브라우저 데이터 삭제 흉내 */
async function wipePhotoStorage(page: import('@playwright/test').Page) {
  await page.evaluate(() => new Promise<void>(resolve => {
    const req = indexedDB.open('troiareuke_photos');
    req.onerror = () => resolve();
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('photos')) { db.close(); resolve(); return; }
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    };
  }));
  await page.evaluate(() => { localStorage.removeItem('crm_photo_counts'); });
}

test('사진 파일로 내보내고 비워진 기기에 되돌린다', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  // ── 시술 기록에 사진 2장 ──
  await page.goto('/treatments');
  await page.getByRole('button', { name: '시술 기록 추가' }).click();
  await pickCustomer(page);
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles([
    { name: 'before.png', mimeType: 'image/png', buffer: solidPng(64, [210, 110, 110]) },
    { name: 'after.png', mimeType: 'image/png', buffer: solidPng(64, [110, 200, 150]) },
  ]);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText(acc.customer).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
  await dismissToasts(page);
  await expect.poll(() => countPhotoEntries(page), { timeout: 10_000 }).toBe(1); // IDB 커밋 대기

  // ── 설정 > 백업·보안: 사진 장수·용량이 보이고, 파일로 저장된다 ──
  await page.goto('/settings');
  await page.getByRole('button', { name: '백업·보안', exact: true }).filter({ visible: true }).first().click();
  const card = page.getByTestId('photo-backup-card');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('photo-backup-inventory')).toContainText('사진 2장', { timeout: 10_000 });
  await expect(card.getByTestId('photo-backup-inventory')).toContainText('기록 1건');

  const download = page.waitForEvent('download');
  await card.getByRole('button', { name: '사진 파일 저장' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^dermasolution-photos-\d{8}-\d{4}\.json$/);
  const savedPath = (await file.path())!;
  const parsed = JSON.parse(readFileSync(savedPath, 'utf8'));
  expect(parsed.format).toBe('troiareuke-crm-photos');
  expect(parsed.parts).toBe(1);
  expect(parsed.items).toHaveLength(1);
  expect(parsed.items[0].entityKey).toMatch(/^treatment:/);
  expect(parsed.items[0].photos).toHaveLength(2);
  expect(parsed.items[0].photos[0].dataUrl).toMatch(/^data:image\//);
  await expect(page.getByText(/사진 2장\(.+\)을 파일 1개로 저장했습니다/)).toBeVisible({ timeout: 10_000 });
  await dismissToasts(page);

  // ── 사진이 전부 사라진 기기(포맷·데이터 삭제) ──
  await wipePhotoStorage(page);
  await page.reload();
  await page.getByRole('button', { name: '백업·보안', exact: true }).filter({ visible: true }).first().click();
  await expect(card.getByTestId('photo-backup-inventory')).toContainText('저장된 사진이 없습니다', { timeout: 10_000 });
  await expect(card.getByRole('button', { name: '사진 파일 저장' })).toBeDisabled(); // 없는 것을 "저장했다"고 하지 않는다

  // ── 파일에서 가져오기: 미리보기 → 실행 → 장수 복구 ──
  await card.locator('input[type="file"]').setInputFiles(savedPath);
  const preview = page.getByTestId('photo-import-preview');
  await expect(preview).toContainText('사진 2장');
  await preview.getByRole('button', { name: '가져오기 실행' }).click();
  const confirm = page.getByTestId('confirm-dialog');
  await expect(confirm).toContainText('사진 2장을 이 기기에 추가할까요?');
  await confirm.getByRole('button', { name: '가져오기', exact: true }).click();
  await expect(page.getByText('사진 2장을 1개 기록에 추가했습니다.')).toBeVisible({ timeout: 15_000 });
  await expect(card.getByTestId('photo-backup-inventory')).toContainText('사진 2장', { timeout: 10_000 });
  expect(await countPhotoEntries(page)).toBe(1);
  await dismissToasts(page);

  // ── 같은 파일을 한 번 더 가져오면 중복으로 건너뛴다(사진이 두 배로 늘지 않는다) ──
  await card.locator('input[type="file"]').setInputFiles(savedPath);
  await page.getByTestId('photo-import-preview').getByRole('button', { name: '가져오기 실행' }).click();
  await page.getByTestId('confirm-dialog').getByRole('button', { name: '가져오기', exact: true }).click();
  await expect(page.getByText(/이미 있던 2장은 건너뜀/)).toBeVisible({ timeout: 15_000 });
  await expect(card.getByTestId('photo-backup-inventory')).toContainText('사진 2장');
  await dismissToasts(page);

  // ── 복원된 사진이 실제로 고객 화면에 보인다 ──
  await page.goto('/customers');
  await page.getByText(acc.customer).filter({ visible: true }).first().click();
  const desk = page.getByTestId('customers-desktop');
  await expect(desk.getByText('Before / After 타임랩스')).toBeVisible({ timeout: 10_000 });
  await expect(desk.getByRole('button', { name: /사진 선택$/ })).toHaveCount(2);

  // ── 전체 백업 파일을 사진 가져오기에 잘못 고르면 분명히 거절한다 ──
  await page.goto('/settings');
  await page.getByRole('button', { name: '백업·보안', exact: true }).filter({ visible: true }).first().click();
  const wrong = page.waitForEvent('download');
  await page.getByRole('button', { name: '백업 파일 저장' }).click();
  const wrongPath = (await (await wrong).path())!;
  await dismissToasts(page);
  await card.locator('input[type="file"]').setInputFiles(wrongPath);
  await expect(page.getByText(/이 프로그램의 사진 백업 파일이 아닙니다/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('photo-import-preview')).toHaveCount(0);
});
