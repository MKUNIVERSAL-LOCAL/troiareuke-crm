import { test, expect } from '@playwright/test';
import { scan, assertNoBlocking, makeStep, type Row } from './a11y-shared';
import { installHealthyBranchNas, loginAsBranchAdmin, unmocked } from './nas-branch-mock';

/**
 * 지점 앱 접근성 쓸이 — **흉내 서버 빌드**(325, 322·323 의 어드민 쪽과 같은 길).
 *
 * 왜: `check:modal-a11y` 의 `결제 요청` 창 면제 사유는 "NAS 서버 모드 전용 창(PG 계약 전) —
 * **로컬 모드 게이트로는 띄울 수 없다**" 였다. 사실이지만 조건이 빠져 있었다 — 로컬 모드 게이트로는
 * 못 띄울 뿐, **흉내 서버 빌드**에서는 PG 를 켠 상태로 열린다(`branch-nas.spec.ts` 가 이미 그렇게 연다).
 * 그 스펙에는 axe 가 없어서 이 창은 한 번도 접근성 검사를 받지 않았다 — 이 쓸이가 그것을 받게 한다.
 *
 * 돈이 걸린 창이다(고객에게 보낼 결제 링크를 만든다). 보는 것: 매출 화면과 그 창에
 * serious·critical 위반이 없는지.
 */

test('흉내 서버에서 지점 결제 요청 창에 접근성 위반이 없다 (325)', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  const rows: Row[] = [];
  await installHealthyBranchNas(page);
  await loginAsBranchAdmin(page);
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  const step = makeStep(page, rows);

  await page.goto('/sales');
  const payBtn = page.getByRole('button', { name: '결제 요청', exact: true }).filter({ visible: true }).first();
  await expect(payBtn).toBeVisible({ timeout: 20_000 });
  await scan(page, '/sales (흉내 서버·PG 켜짐)', rows);

  await step('/sales 결제 요청', async () => {
    await payBtn.click({ timeout: 20_000 });
    const dialog = page.getByRole('dialog', { name: '결제 요청' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    // 328·**331 정정**: **PG 가 켜진 상태**인지 단언한다. 331 에서 실측해 보니 PG 가 꺼지면 매출 화면의
    // 단추 이름이 `결제 요청 (준비 중)` 으로 바뀌어 이 쓸이는 **창을 열지 못해 `open-failed` 로 실패**한다
    // (328 이전 스펙도 그랬다 — "조용한 통과" 는 애초에 없었다). 이 단언이 막는 것은 **이름은 그대로인데
    // 폼만 안내문으로 바뀌는** 회귀다. 그 경우는 지금 재현할 수 없으므로 "이 단언이 무는 것을 봤다" 고
    // 적지 않는다 — 전제를 눈에 보이게 적어 두는 값이 있어서 남긴다.
    await expect(dialog.getByRole('button', { name: '결제 링크 만들기' })).toBeVisible();
    await expect(dialog.getByLabel('금액')).toBeVisible();
    await expect(dialog.getByText('온라인 결제 준비 중입니다')).toHaveCount(0);
  });

  assertNoBlocking(rows);
  // 흉내 내지 않은 경로가 남으면 그 화면은 조용히 404 를 먹고 비어 있었던 것이다 — 쓸이의 전제가 깨진다.
  // `/api/data/*` 는 지점 자료 동기화라 위에서 흉내 내므로 제외가 필요 없다.
  expect([...new Set(unmocked)], '흉내 내지 않은 서버 경로').toEqual([]);
});
