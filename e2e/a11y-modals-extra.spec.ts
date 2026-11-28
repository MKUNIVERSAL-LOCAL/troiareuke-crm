import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, pickCustomer, dismissToasts, solidPng } from './helpers';
import { assertNoBlocking, makeStep, type Row } from './a11y-shared';
import { addProgram, addProduct, registerPayment, addReservation } from './flows';

/**
 * 창 접근성 게이트 2편 (289) — 어느 접근성 게이트도 **한 번도 열지 않던 창**들을 axe 로 본다.
 * 전용 기능 스펙은 이 창들을 이미 돌리고 있었지만(예약 요청함·고객 병합·재고 이동 이력·시술 기록 상세 모두
 * 자기 스펙이 있다) **대비·이름·포커스를 검사한 적은 없었다**. 어느 창이 게이트 밖인지는 눈으로 세지 않는다 —
 * `npm run check:modal-a11y` 가 창 자리와 게이트를 대조한다.
 *
 * 295: 사유에 "다음 창 묶음에서 옮긴다" 고 적어 둔 창들을 여기 넣었다 — 사진 크게 보기·등급 올릴 후보·
 * 재방문 안내 초안·앱 잠금, 그리고 로그인 전 비밀번호 재설정 창(가입 전 상태라 **별도 테스트**).
 * 상태를 만드는 값(사진 1장·방문 2회·주기 7일·PIN)은 전용 스펙들이 쓰는 길을 그대로 따랐다.
 *
 * 1편(a11y-modals.spec)에 이어 붙이지 않은 이유는 **시간이 아니다**(재 보니 1편 43초·이 파일 18초로
 * 둘 다 180초 예산에 한참 못 미친다). `makeStep` 은 창을 열다 실패하면 그것을 기록으로 남기고 **삼킨다** —
 * 선택자 하나가 틀리면 Playwright 가 예산이 끝날 때까지 기다리고, 그 테스트의 **뒤쪽 창 전부가 검사되지
 * 않는다**(289 에서 두 번 그랬다: PC 상세의 단추 이름은 '수정' 이었고, 시술 상세는 목록으로 돌아가야 열렸다).
 * 창 묶음을 파일로 나누면 한 창의 실수가 다른 창들을 가리지 않는다. 같은 이유로 이 파일은 동작 제한시간을 둔다.
 */

const acc = makeAccount('AX');

test('게이트 밖에 있던 창들에 serious·critical 접근성 위반이 없다', async ({ page }) => {
  test.slow();
  // 선택자가 틀리면 Playwright 는 기본적으로 **테스트 예산이 끝날 때까지** 기다린다. makeStep 이 실패를 삼켜
  // 기록으로 남기므로(open-failed), 제한시간이 없으면 틀린 한 줄 때문에 **뒤쪽 창 전부가 검사되지 않는다**
  // (289 에서 실제로 두 번 그랬다). 창 하나를 여는 데 15초면 충분하다.
  page.setDefaultTimeout(15_000);
  page.on('dialog', d => d.accept());
  const rows: Row[] = [];
  const step = makeStep(page, rows);
  const dialog = (name: string) => page.getByRole('dialog', { name });
  const closeDialog = async (name: string) => {
    const d = dialog(name);
    // 359: 한 번만 누르고 끝냈더니 CI 에서 간헐로 '결제 등록' 창이 남았다(폴링 24회 모두 1개).
    // 이 창은 `useOverlayClose(..., { escape: false })` 라 **Esc 로 닫히지 않으므로** 첫 클릭이
    // 먹지 않으면 되돌릴 길이 없다 — 토스트가 단추를 덮거나(시술 저장 토스트) 창이 한 틱 늦게
    // 다시 열리는 자리가 있다. 토스트를 먼저 걷고, 닫힘을 기다렸다가 남아 있으면 다시 누른다.
    await dismissToasts(page);
    for (let i = 0; i < 3; i += 1) {
      if (!(await d.count())) break;
      const close = d.getByRole('button', { name: '닫기', exact: true });
      if (await close.count()) await close.first().click({ timeout: 5_000 }).catch(() => {});
      else await page.keyboard.press('Escape');
      if (await d.first().waitFor({ state: 'detached', timeout: 3_000 }).then(() => true, () => false)) break;
    }
    await expect(d).toHaveCount(0);
  };

  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  const desk = page.getByTestId('customers-desktop');

  // ── /programs 삭제 확인창 — 되돌릴 수 없는 창인데 axe 로 본 적이 없었다 ──
  await addProgram(page, { name: '창점검 10회권', sessions: 10, price: 100000 });
  await step('/programs 프로그램 삭제 확인창', async () => {
    await page.getByRole('button', { name: '창점검 10회권 삭제' }).click();
    await expect(dialog('프로그램 삭제')).toBeVisible();
  });
  await dialog('프로그램 삭제').getByRole('button', { name: '취소', exact: true }).click(); // 지우지 않는다
  await expect(dialog('프로그램 삭제')).toHaveCount(0);

  // ── /customers 고객 정보 수정·고객 병합·엑셀 업로드 안내 ──
  await page.goto('/customers');
  await page.getByText(acc.customer, { exact: true }).filter({ visible: true }).first().click();
  await step('/customers 고객 정보 수정', async () => { // 이름·연락처·생년을 고치는 큰 폼
    await desk.getByRole('button', { name: '수정', exact: true }).click(); // 창 이름만 '고객 정보 수정' 이다
    await expect(dialog('고객 정보 수정')).toBeVisible();
  });
  await closeDialog('고객 정보 수정');
  await step('/customers 고객 병합 (171·174)', async () => { // 되돌릴 수 없는 합치기 창
    await desk.getByRole('button', { name: '더보기', exact: true }).click();
    await desk.getByRole('menuitem', { name: '중복 고객 병합' }).click();
    await expect(dialog('고객 병합')).toBeVisible();
  });
  await closeDialog('고객 병합');
  await step('/customers 엑셀 업로드 안내', async () => { // 대량 등록 전에 읽는 안내 창
    await page.getByRole('button', { name: '업로드', exact: true }).filter({ visible: true }).first().click();
    await expect(dialog('엑셀 업로드 안내')).toBeVisible();
  });
  await closeDialog('엑셀 업로드 안내');

  // ── /reservations 예약 요청함 (143) — 비어 있어도 안내 글·단추 대비는 봐야 한다 ──
  await page.goto('/reservations');
  await step('/reservations 예약 요청함', async () => {
    await page.getByRole('button', { name: /예약 요청함/ }).filter({ visible: true }).first().click();
    await expect(dialog('예약 요청함')).toBeVisible();
  });
  await closeDialog('예약 요청함');

  // ── /treatments 시술 기록 상세 — 저장된 기록이 있어야 열린다 ──
  await page.goto('/treatments?new=1');
  await expect(dialog('시술 기록 추가')).toBeVisible();
  await pickCustomer(page, acc.customer);
  await dialog('시술 기록 추가').getByRole('checkbox', { name: '테스트관리' }).check();
  // 사진 한 장을 붙여 둔다 — 상세에서 썸네일을 눌러 "사진 크게 보기" 창을 열기 위해 (295)
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles([
    { name: 'before.png', mimeType: 'image/png', buffer: solidPng(64, [214, 120, 120]) },
  ]);
  await expect(page.getByLabel('시술 전후 구분')).toHaveCount(1);
  // 지난 날짜로 적는다 — 마지막 방문이 오늘이면 아래 "재방문 안내 초안" 대상이 되지 않는다 (295)
  await dialog('시술 기록 추가').getByLabel('시술일').fill('2026-11-05');
  await dialog('시술 기록 추가').getByRole('button', { name: '저장', exact: true }).click();
  // 231 흐름이 바뀌어 결제 창이 안 열리면 `closeDialog` 는 조용히 통과한다 — 열렸음을 먼저 확인한다 (293, 리뷰 LOW-11)
  await expect(dialog('결제 등록')).toBeVisible();
  await closeDialog('결제 등록'); // 시술을 저장하면 결제 창이 바로 열린다(231) — 여기서는 결제하지 않는다
  await page.goto('/treatments'); // ?new=1 을 떼고 목록으로 — 저장된 줄을 눌러야 상세가 열린다
  await step('/treatments 시술 기록 상세', async () => {
    await page.getByRole('button').filter({ hasText: acc.customer }).filter({ visible: true }).first().click();
    await expect(dialog('시술 기록 상세')).toBeVisible();
  });
  await step('/treatments 사진 크게 보기', async () => { // 295 — 사진을 올린 뒤에만 열리는 창
    await dialog('시술 기록 상세').getByRole('button').filter({ has: page.getByAltText('시술 사진') }).first().click();
    await expect(dialog('사진 크게 보기')).toBeVisible();
  });
  await page.keyboard.press('Escape');
  await expect(dialog('사진 크게 보기')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog('시술 기록 상세')).toHaveCount(0);

  // ── /products 재고 이동 이력 (145) — 원장 표와 대조 줄 ──
  await addProduct(page, { name: '창점검세럼', price: 30000, stock: 5 });
  await step('/products 재고 이동 이력', async () => {
    await page.getByRole('button', { name: '창점검세럼 재고 이력' }).filter({ visible: true }).first().click();
    await expect(dialog('재고 이동 이력')).toBeVisible();
  });
  await closeDialog('재고 이동 이력');

  // ── 295: 등급 올릴 후보 — 결제 1건 + 서로 다른 날 시술 2건이 있어야 후보가 생긴다(grade-suggest 스펙과 같은 길) ──
  await registerPayment(page, acc, 900000);
  await dismissToasts(page);
  await page.goto('/treatments');
  await page.getByRole('button', { name: '시술 기록 추가' }).click();
  await pickCustomer(page, acc.customer);
  await dialog('시술 기록 추가').getByLabel('시술일').fill('2026-11-10');
  await dialog('시술 기록 추가').getByRole('checkbox', { name: '테스트관리' }).check();
  await dialog('시술 기록 추가').getByRole('button', { name: '저장', exact: true }).click();
  // 360(355~359 리뷰 M-3): 293 리뷰 LOW-11 이 위 자리에 세운 "열렸는지" 확인이 **이 자리에는 없었다** —
  // 하필 CI 가 간헐로 실패한 자리가 여기다(359). 창이 열리지 않으면 닫기 루프가 그냥 빠져 조용히 통과한다.
  await expect(dialog('결제 등록')).toBeVisible();
  await closeDialog('결제 등록'); // 저장 뒤 결제 창(231)
  await dismissToasts(page);
  await page.goto('/customers');
  await step('/customers 등급 올릴 후보 (236)', async () => {
    await page.getByTestId('grade-suggest-open').filter({ visible: true }).first().click();
    await expect(dialog('등급 올릴 후보')).toBeVisible();
  });
  await page.keyboard.press('Escape');
  await expect(dialog('등급 올릴 후보')).toHaveCount(0);

  // ── 295: 재방문 안내 초안 — 주기를 7일로 줄이면 11-10 방문이 권장일을 지난다 ──
  await page.goto('/settings');
  await page.getByRole('button', { name: '알림 설정', exact: true }).filter({ visible: true }).first().click();
  const cycle = page.getByLabel('재방문 주기(일)');
  await cycle.fill('7');
  await cycle.locator('..').getByRole('button', { name: '저장', exact: true }).click(); // 같은 칸의 [저장] — 설정 화면에 저장 버튼이 여럿이다
  await dismissToasts(page);
  await page.goto('/');
  await step('/ 재방문 안내 초안', async () => {
    await page.getByRole('button', { name: '초안', exact: true }).filter({ visible: true }).first().click();
    // 창 이름에 고객 이름이 들어가므로 정규식으로 집는다(가드도 이 형태를 센다, 295)
    await expect(page.getByRole('dialog', { name: /재방문 안내 초안/ })).toBeVisible();
    await expect(dialog(`${acc.customer}님 재방문 안내 초안`)).toBeVisible();
  });
  await closeDialog(`${acc.customer}님 재방문 안내 초안`);

  // ── 295: 앱 잠금 — PIN 을 켜고 잠그면 전체 화면 오버레이가 뜬다(screen-lock 스펙과 같은 길). 화면을 막으므로 맨 끝 ──
  await page.goto('/settings');
  await page.getByRole('button', { name: '백업·보안', exact: true }).filter({ visible: true }).first().click();
  const lockCard = page.getByTestId('app-lock-card');
  await lockCard.getByLabel('새 PIN').fill('4242');
  await lockCard.getByLabel('PIN 확인').fill('4242');
  await lockCard.getByLabel('잠금 대기 시간').selectOption('15');
  await lockCard.getByRole('button', { name: '잠금 켜기' }).click();
  await dismissToasts(page);
  await step('앱 잠금 화면 (218)', async () => {
    // 전체 잠금이 켜져 있으면 **프로그램을 다시 열 때** 잠금 화면으로 시작한다(AppLockOverlay 의 첫 상태)
    await page.reload();
    await expect(page.getByTestId('app-lock')).toBeVisible();
    await expect(page.getByRole('dialog', { name: '앱 잠금' })).toBeVisible(); // 창 이름으로도 — 창 커버리지 가드가 이 자리를 센다
  });

  assertNoBlocking(rows);
});

test('로그인 전 비밀번호 재설정 창에 serious·critical 접근성 위반이 없다', async ({ page }) => {
  // 창 게이트는 가입·온보딩을 지난 뒤부터 도는데, 이 창은 **로그인 전** 화면에만 있다 (295)
  const rows: Row[] = [];
  const step = makeStep(page, rows);
  await page.goto('/login');
  await step('/login 비밀번호 재설정 안내', async () => {
    await page.getByRole('button', { name: '비밀번호 찾기' }).click();
    await expect(page.getByRole('dialog', { name: '비밀번호 재설정 안내' })).toBeVisible();
  });
  assertNoBlocking(rows);
});

test('캠페인 실행 창에 serious·critical 접근성 위반이 없다 (325)', async ({ page }) => {
  // 325: 이 창의 면제 사유는 "캠페인을 실제로 실행해야 열린다 — **발송 흉내까지 필요해** 다음 창
  // 묶음으로 미룬다" 였다. **발송 흉내는 필요 없었다** — 창을 여는 데 필요한 것은 캠페인 하나와
  // 내일 예약 한 건뿐이고(승인 단추를 누르지 않으면 아무것도 보내지 않는다), 그 길은 `campaigns.spec.ts`
  // 가 이미 쓰고 있었다. 사유가 사실보다 넓었다(320·321·324 에서 세 번 만난 종류).
  // 앞 테스트에 붙이지 않은 이유는 이 파일 머리말과 같다 — 앞 테스트는 끝에서 앱을 잠근다.
  test.slow();
  test.skip(new Date().getHours() === 23 && new Date().getMinutes() >= 55, '자정을 넘기면 "내일 예약" 기준이 바뀐다');
  page.setDefaultTimeout(15_000);
  page.on('dialog', d => d.accept());
  const rows: Row[] = [];
  const step = makeStep(page, rows);
  const cAcc = makeAccount('AC');
  await signupAndOnboard(page, cAcc);
  await createCustomer(page, cAcc);

  const t = new Date();
  t.setDate(t.getDate() + 1);
  const tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  await page.goto('/reservations');
  await addReservation(page, cAcc, '14:00', { date: tomorrow });
  await dismissToasts(page);

  await page.goto('/messaging');
  const card = page.getByTestId('campaigns-card');
  await card.getByRole('button', { name: '캠페인 추가' }).click();
  const edit = page.getByRole('dialog', { name: '캠페인 추가' });
  await edit.getByLabel('캠페인 이름').fill('예약 전날 안내');
  await edit.getByLabel('언제(트리거)').selectOption('reservation_tomorrow');
  await edit.getByLabel('메시지 내용').fill('{고객명}님, 내일 {예약일시} 예약을 기다리고 있어요. — {매장명}');
  await edit.getByRole('button', { name: '추가', exact: true }).click();
  await expect(edit).toHaveCount(0);

  await step('/messaging 캠페인 실행', async () => {
    await card.getByTestId('campaign-row').filter({ hasText: '예약 전날 안내' }).getByRole('button', { name: '대상 확인·발송' }).click();
    // 창 이름으로 집는다 — 창 커버리지 가드가 이 자리를 센다(이름에 캠페인 이름이 섞인다)
    await expect(page.getByRole('dialog', { name: /캠페인 실행/ })).toBeVisible();
    await expect(page.getByTestId('campaign-candidate')).toHaveCount(1); // 대상이 비면 빈 창을 검사하는 셈이다
  });

  assertNoBlocking(rows);
});
