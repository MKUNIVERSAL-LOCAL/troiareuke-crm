import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts, expectNoHorizontalOverflow, visibleButton } from './helpers';
import { registerPayment, addReservation, openReservationDetail, addProduct } from './flows';
import { scan, assertNoBlocking, type Row } from './a11y-shared'; // 288: 그 상태에서 접근성까지 본다

/**
 * 폰 폭에서 새 기능 점검 (241·244·254·288) — 228~252 으로 들어온 화면은 PC 스펙만 있었다.
 * 매장은 태블릿·폰으로 쓰는 일이 많아(UI 품질 절대 기준) 영수증·수당·태그·등급·사진 백업이
 * 폰에서 눌릴 수 있고 가로로 넘치지 않아야 한다. 창 안쪽 가로 넘침까지 본다.
 *
 * 288 추가: 274~286 으로 들어온 **상태**까지 — 실사 창에서 세는 동안 제품이 지워진 줄([삭제됨] 배지·
 * 잠긴 입력칸, 281)과 매출 카드의 돈 분모 줄(282).
 * 294 정정(288~292 리뷰 LOW-9): 이 머리말은 둘 다 "접근성 쓸이 밖" 이라고 적었지만 **분모 줄은 그렇지 않다** —
 * 창이 아니라 `/sales` 상시 DOM 이고 그 라우트는 이미 axe 쓸이 안이다. 288 이 분모 줄에 더한 것은
 * **폰 폭에서 보이는지·무엇을 말하는지·가로로 넘치지 않는지**다. 쓸이 밖이었던 것은 실사 삭제 줄(창 상태)이다.
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

  // ── 취소 사유 칩이 폰에서 눌리고, '이번달' 탭에 집계 줄이 보인다 (244) ──
  await page.goto('/reservations');
  await addReservation(page, acc, '11:00');
  await dismissToasts(page);
  const detail = await openReservationDetail(page, '11:00');
  await detail.getByRole('button', { name: '취소처리' }).click();
  const confirmDialog = page.getByRole('dialog', { name: '예약 취소 처리' });
  await expect(confirmDialog).toBeVisible();
  await expectNoHorizontalOverflow(page, '취소 사유 확인창(폰)');
  await confirmDialog.getByTestId('confirm-choices').getByRole('radio', { name: '매장 사정(직원·설비)' }).click();
  await confirmDialog.getByRole('button', { name: '취소 처리' }).click();
  await expect(confirmDialog).toHaveCount(0);
  await dismissToasts(page); // 취소 처리 뒤 상세는 닫힌다 — 사유 표시는 PC 스펙(cancel-reason)이 담당
  await page.getByRole('button', { name: '이번달' }).click();
  await expect(page.getByTestId('cancel-reason-summary').filter({ visible: true }).first()).toContainText('매장 사정(직원·설비) 1건');
  await expectNoHorizontalOverflow(page, '예약 화면 이번달 탭(취소 사유 줄)');

  // ── 251 메모 문구 칩: 폰에서 저장·눌러 넣기·다시 눌러 빼기 (254 리뷰 L-6) ──
  await page.goto('/treatments?new=1');
  const log = page.getByRole('dialog', { name: '시술 기록 추가' });
  await expect(log).toBeVisible();
  await log.getByTestId('memo-preset-manage').click();
  const editor = log.getByTestId('memo-preset-editor');
  await editor.getByLabel('새 문구').fill('자극 없음');
  await editor.getByRole('button', { name: '추가' }).click();
  await dismissToasts(page);
  await expectNoHorizontalOverflow(page, '시술 기록 메모 문구 관리(폰)');
  const memoField = log.getByPlaceholder('시술 특이사항, 다음 방문 시 주의사항 등');
  await log.getByTestId('memo-presets').getByRole('button', { name: '자극 없음' }).click();
  await expect(memoField).toHaveValue('자극 없음');
  await log.getByTestId('memo-presets').getByRole('button', { name: '자극 없음' }).click(); // 다시 누르면 빠진다
  await expect(memoField).toHaveValue('');
  await log.getByRole('button', { name: '닫기', exact: true }).first().click();

  // ── 252 정보 변경 이력 카드: 폰 상세에서 보이고 가로로 넘치지 않는다 ──
  await page.goto('/customers');
  await page.getByText(acc.customer).filter({ visible: true }).first().click();
  const histCard = page.getByTestId('customer-history').filter({ visible: true }).first();
  await expect(histCard).toBeVisible();
  await expectNoHorizontalOverflow(page, '고객 상세 정보 변경 이력(폰)');

  // ── 259 문구 관리가 설정에도 있다: 폰에서 추가·삭제가 눌리고 넘치지 않는다 ──
  await page.goto('/settings?tab=shop');
  const presetBox = page.getByTestId('settings-memo-presets').filter({ visible: true }).first();
  await expect(presetBox).toBeVisible();
  const setEditor = presetBox.getByTestId('memo-preset-editor');
  await setEditor.getByLabel('새 문구').fill('홈케어 안내');
  await setEditor.getByRole('button', { name: '추가' }).click();
  await dismissToasts(page);
  const delBtn = setEditor.getByRole('button', { name: '홈케어 안내 문구 삭제' });
  await expect(delBtn).toBeVisible();
  const box = await delBtn.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(36); // 손가락으로 누를 수 있는 높이
  await expectNoHorizontalOverflow(page, '설정 자주 쓰는 메모 문구(폰)');

  // ── 261 월간 보기는 PC 전용이다: 폰에서는 보기 전환 자체가 없다(없는 버튼을 찾게 만들지 않는다) ──
  await page.goto('/reservations');
  await expect(page.getByRole('button', { name: '월간' }).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '이번달' }).filter({ visible: true }).first()).toBeVisible();

  // ── 282: 매출 카드의 돈 분모 줄이 폰에서도 보이고 넘치지 않는다 ──
  await page.goto('/sales');
  const metrics = page.getByTestId('revenue-metrics');
  await expect(metrics).toBeVisible();
  await expect(metrics.getByTestId('metric-achievement-sub')).toBeVisible();
  await expect(metrics.getByTestId('metric-mom-sub')).toHaveText('지난달 0원');
  await expect(metrics.getByTestId('metric-per-hour-sub')).toBeVisible();
  await expectNoHorizontalOverflow(page, '매출 지표 카드 분모 줄(폰, 282)');

  // ── 281: 실사 창에서 세는 동안 제품이 지워진 줄 — 폰에서도 [삭제됨] 과 잠긴 칸이 읽히고 넘치지 않는다 ──
  await page.goto('/products');
  await addProduct(page, { name: '폰실사앰플', price: 20000, stock: 7 });
  await dismissToasts(page);
  await page.getByTestId('stock-count-open').click();
  const count = page.getByTestId('stock-count');
  await expect(count).toBeVisible();
  await count.getByLabel('폰실사앰플 실제 수량').fill('6');
  await expectNoHorizontalOverflow(page, '재고 실사 창(폰)');

  const other = await page.context().newPage();
  await other.goto('/products');
  await other.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^crm_.*_products$/.test(k))!;
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(key, JSON.stringify(list.filter((x: { name: string }) => x.name !== '폰실사앰플')));
  });
  await other.close();

  await expect(count.getByTestId('stock-count-removed')).toBeVisible({ timeout: 10_000 });
  await expect(count.getByTestId('stock-count-removed')).toContainText('반영되지 않음');
  await expect(count.getByLabel('폰실사앰플 실제 수량')).toBeDisabled();
  await expect(count.getByTestId('stock-count-row').filter({ hasText: '폰실사앰플' })).toContainText('삭제 전 7개');
  await expectNoHorizontalOverflow(page, '재고 실사 창 — 삭제된 줄 포함(폰, 281)');

  // 285 리뷰 M-3: a11y 쓸이는 실사 창을 열고 바로 닫아 이 상태를 만들지 못한다 — 여기서 그 상태로 한 번 본다
  const rows: Row[] = [];
  await scan(page, '실사 창(삭제된 줄 포함, 폰)', rows);
  assertNoBlocking(rows);
});
