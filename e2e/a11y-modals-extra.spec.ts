import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, pickCustomer } from './helpers';
import { assertNoBlocking, makeStep, type Row } from './a11y-shared';
import { addProgram, addProduct } from './flows';

/**
 * 창 접근성 게이트 2편 (289) — 어느 접근성 게이트도 **한 번도 열지 않던 창**들을 axe 로 본다.
 * 전용 기능 스펙은 이 창들을 이미 돌리고 있었지만(예약 요청함·고객 병합·재고 이동 이력·시술 기록 상세 모두
 * 자기 스펙이 있다) **대비·이름·포커스를 검사한 적은 없었다**. 어느 창이 게이트 밖인지는 눈으로 세지 않는다 —
 * `npm run check:modal-a11y` 가 창 자리와 게이트를 대조한다.
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
    const close = d.getByRole('button', { name: '닫기', exact: true });
    if (await close.count()) await close.first().click(); else await page.keyboard.press('Escape');
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
  await dialog('시술 기록 추가').getByRole('button', { name: '저장', exact: true }).click();
  // 231 흐름이 바뀌어 결제 창이 안 열리면 `closeDialog` 는 조용히 통과한다 — 열렸음을 먼저 확인한다 (293, 리뷰 LOW-11)
  await expect(dialog('결제 등록')).toBeVisible();
  await closeDialog('결제 등록'); // 시술을 저장하면 결제 창이 바로 열린다(231) — 여기서는 결제하지 않는다
  await page.goto('/treatments'); // ?new=1 을 떼고 목록으로 — 저장된 줄을 눌러야 상세가 열린다
  await step('/treatments 시술 기록 상세', async () => {
    await page.getByRole('button').filter({ hasText: acc.customer }).filter({ visible: true }).first().click();
    await expect(dialog('시술 기록 상세')).toBeVisible();
  });
  await page.keyboard.press('Escape');
  await expect(dialog('시술 기록 상세')).toHaveCount(0);

  // ── /products 재고 이동 이력 (145) — 원장 표와 대조 줄 ──
  await addProduct(page, { name: '창점검세럼', price: 30000, stock: 5 });
  await step('/products 재고 이동 이력', async () => {
    await page.getByRole('button', { name: '창점검세럼 재고 이력' }).filter({ visible: true }).first().click();
    await expect(dialog('재고 이동 이력')).toBeVisible();
  });
  await closeDialog('재고 이동 이력');

  assertNoBlocking(rows);
});
