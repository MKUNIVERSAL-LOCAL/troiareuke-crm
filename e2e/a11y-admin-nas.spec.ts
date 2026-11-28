import { test, expect } from '@playwright/test';
import { scan, assertNoBlocking, makeStep, type Row } from './a11y-shared';
import { installHealthyNas, loginAsSuperadmin, unmocked } from './nas-admin-mock';

/**
 * 어드민 콘솔 접근성 쓸이 — **흉내 서버 빌드**(322, 318~320 리뷰 M-4 의 다음 단계).
 *
 * 왜: `a11y-admin.spec.ts` 는 로컬 모드 빌드라 표가 비어 있어 **어드민 창을 열 수 없었다**.
 * 그래서 `check:modal-a11y` 의 면제 11건이 "서버 행이 있어야 열린다" 로 남아 있었고, 그 말은
 * 사실이지만 **접근성 게이트가 로컬 모드라서** 라는 조건이 빠져 "불가능" 으로 읽혔다(321 에서 문구 정정).
 * 이 쓸이가 그 조건을 없앤다 — 흉내 서버로 행을 만들고, 창을 열어 **axe 를 돌린다**.
 * 323 에서 남은 넷(자료 탐색기 상세·백업으로 복원·지점 완전 삭제·계정 완전 삭제)까지 넣어 **어드민 창 열한 자리**를 본다.
 * 어드민 화면은 본사(오너)가 쓰는 다크 테마라 지점 화면과 색 조합이 전혀 달라 따로 본다.
 */

test('흉내 서버에서 어드민 창을 열어도 serious·critical 접근성 위반이 없다 (322)', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept()); // 비밀번호 재설정은 confirm 을 거친다(거절이 기본이라 받아야 창이 뜬다)
  const rows: Row[] = [];
  await installHealthyNas(page);
  await loginAsSuperadmin(page);
  const step = makeStep(page, rows);

  // ── 사용자 관리: 지점 신청 검토·사용기간 설정·임시 비밀번호 발급됨·관리자 초대 ──
  await page.goto('/admin/users');
  await expect(page.getByRole('button', { name: '승인된 계정' })).toBeVisible({ timeout: 15_000 });
  await scan(page, '/admin/users', rows);

  await step('/admin/users 관리자 초대', async () => {
    await page.getByRole('button', { name: '관리자 초대' }).click();
    await expect(page.getByRole('dialog', { name: '관리자 초대' })).toBeVisible();
  });
  await page.getByRole('dialog', { name: '관리자 초대' }).getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await step('/admin/users 사용기간 설정', async () => {
    await page.getByRole('button', { name: '사용기간', exact: true }).first().click();
    await expect(page.getByRole('dialog', { name: '사용기간 설정' })).toBeVisible();
  });
  await page.getByRole('dialog', { name: '사용기간 설정' }).getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await step('/admin/users 임시 비밀번호 발급됨', async () => {
    await page.getByRole('button', { name: '비밀번호 재설정' }).first().click();
    await expect(page.getByRole('dialog', { name: '임시 비밀번호 발급됨' })).toBeVisible({ timeout: 15_000 });
  });
  await page.getByRole('dialog', { name: '임시 비밀번호 발급됨' }).getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await step('/admin/users 지점 신청 검토', async () => {
    await page.getByRole('button', { name: /승인 대기/ }).click();
    await page.getByRole('button', { name: '검토', exact: true }).first().click();
    await expect(page.getByRole('dialog', { name: '지점 신청 검토' })).toBeVisible({ timeout: 15_000 });
  });

  // ── 구독 관리: 구독 수정 창 ──
  await page.goto('/admin/subscriptions');
  await expect(page.getByRole('button', { name: '강남점 구독 수정' })).toBeVisible({ timeout: 15_000 });
  await scan(page, '/admin/subscriptions', rows);
  await step('/admin/subscriptions 구독 수정', async () => {
    await page.getByRole('button', { name: '강남점 구독 수정' }).click();
    await expect(page.getByRole('dialog', { name: /구독 수정/ })).toBeVisible();
  });
  await page.getByRole('dialog', { name: /구독 수정/ }).getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // ── AI 서비스: 크레딧 지급 창 ──
  await page.goto('/admin/subscriptions?view=ai');
  await expect(page.getByTestId('admin-ai-service')).toBeVisible({ timeout: 15_000 });
  await scan(page, '/admin/subscriptions?view=ai', rows);
  await step('/admin/subscriptions?view=ai 크레딧 지급', async () => {
    await page.getByRole('button', { name: '강남점 크레딧 지급' }).click();
    await expect(page.getByRole('dialog', { name: /크레딧 지급/ })).toBeVisible();
  });
  await page.getByRole('dialog', { name: /크레딧 지급/ }).getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // ── 공지 관리: 공지 수정 창 ──
  await page.goto('/admin/announcements');
  await expect(page.getByRole('button', { name: /공지 수정/ })).toBeVisible({ timeout: 15_000 });
  await scan(page, '/admin/announcements', rows);
  await step('/admin/announcements 공지 수정', async () => {
    await page.getByRole('button', { name: /공지 수정/ }).first().click();
    await expect(page.getByRole('dialog', { name: '공지 수정' })).toBeVisible();
  });
  await page.getByRole('dialog', { name: '공지 수정' }).getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  assertNoBlocking(rows);
  // 흉내 내지 않은 경로가 남으면 그 화면은 조용히 404 를 먹고 비어 있었던 것이다 — 쓸이의 전제가 깨진다.
  // 324(리뷰 L-9): 두 경로만 제외하는 이유를 적는다 — `/api/data/*` 는 **지점 자료 동기화**(어드민 화면과 무관,
  // 로그인 직후 '/' 가 잠깐 지점 홈을 거치며 호출된다)이고, `/api/ai/status` 는 중계 상태 조회로 404 면
  // '사용 불가' 로 조용히 처리되는 설계다. 둘 다 어드민 창을 그리는 데 쓰이지 않는다.
  expect([...new Set(unmocked)].filter(path => !path.startsWith('/api/data/') && path !== '/api/ai/status'), '흉내 내지 않은 서버 경로').toEqual([]);
});

// 323: 둘로 나눈 이유 — 창 열한 개를 한 테스트에 담으니 **180초 제한**을 넘겼다(마지막 창에서 끊겼다).
// 쓸이를 줄이는 대신 테스트를 나눈다(각자 로그인한다 — 컨텍스트가 테스트마다 새로 열린다).
test('흉내 서버에서 자료 탐색기·백업 복원·되돌릴 수 없는 삭제 확인 창에도 접근성 위반이 없다 (323)', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  const rows: Row[] = [];
  await installHealthyNas(page);
  await loginAsSuperadmin(page);
  const step = makeStep(page, rows);

  // 정리는 **화면 이동**으로 한다 — 창이 안 열렸을 때 [취소] 를 누르려 하면 그 클릭이 테스트 끝까지
  // 매달려 "무엇이 안 열렸는지" 를 가린다(323 에서 실제로 그렇게 180초를 태웠다).
  const reset = async (route: string) => { await page.goto(route); };

  // ── 전체 자료(자료 탐색기): 상세 보기 창 ──
  await page.goto('/admin/statistics?view=data');
  await page.getByRole('button', { name: /강남점/ }).first().click({ timeout: 20_000 });
  await scan(page, '/admin/statistics?view=data', rows);
  await step('/admin/statistics?view=data 상세 보기', async () => {
    await page.getByRole('button', { name: 'cus-1 상세 보기' }).click({ timeout: 20_000 });
    await expect(page.getByRole('dialog', { name: '상세 보기' })).toBeVisible({ timeout: 10_000 });
  });

  // ── 백업·복원 탭: "이 백업으로 복원" 확인 창 ──
  await reset('/admin/statistics?view=data');
  await page.getByRole('button', { name: /강남점/ }).first().click({ timeout: 20_000 });
  await step('/admin/statistics?view=data 백업으로 복원', async () => {
    await page.getByRole('button', { name: /백업·복원/ }).click({ timeout: 20_000 });
    await page.getByRole('button', { name: '이 백업으로 복원' }).first().click({ timeout: 20_000 });
    await expect(page.getByRole('dialog', { name: /백업으로 복원/ })).toBeVisible({ timeout: 10_000 });
  });

  // ── 되돌릴 수 없는 삭제 확인 창 둘 ──
  await page.goto('/admin/branches');
  await expect(page.getByRole('cell', { name: '강남점' }).first()).toBeVisible({ timeout: 20_000 });
  await step('/admin/branches 지점 완전 삭제', async () => {
    await page.getByRole('button', { name: /지점 완전 삭제/ }).first().click({ timeout: 20_000 });
    await expect(page.getByRole('dialog', { name: '지점 완전 삭제' })).toBeVisible({ timeout: 10_000 });
  });

  await page.goto('/admin/users');
  await expect(page.getByRole('button', { name: '승인된 계정' })).toBeVisible({ timeout: 20_000 });
  await step('/admin/users 계정 완전 삭제', async () => {
    // 이 단추는 글자("완전 삭제")가 있어 **글자가 이름**이다 — title 로는 집히지 않는다(323 에서 20초를 태웠다)
    await page.getByRole('button', { name: '완전 삭제', exact: true }).first().click({ timeout: 20_000 });
    await expect(page.getByRole('dialog', { name: '계정 완전 삭제' })).toBeVisible({ timeout: 10_000 });
  });

  assertNoBlocking(rows);
  expect([...new Set(unmocked)].filter(path => !path.startsWith('/api/data/') && path !== '/api/ai/status'), '흉내 내지 않은 서버 경로').toEqual([]);
});
