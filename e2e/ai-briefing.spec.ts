import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer } from './helpers';
import { registerPayment } from './flows';

/**
 * AI 경영 브리핑 1차(153)·경영비서 2차(158, 원인 후보·캠페인 추천·연락할 고객·빈 시간) (GAP D-3) — 내부 엔진이 계산한 숫자([확정]/[예측] 라벨)만 컨텍스트로 나가고 고객 실명은 나가지 않는다.
 * OpenAI 호출을 가로채 요청 본문을 검사하고 고정 응답을 돌려준다(실제 제공사 호출 없음).
 */

const acc = makeAccount('AB');

test('이달 경영 브리핑 — 엔진 숫자가 라벨과 함께 나가고 고객 실명은 나가지 않으며 응답이 표시된다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  const bodies: string[] = [];
  await page.route('https://api.openai.com/**', async route => {
    bodies.push(route.request().postData() || '');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '브리핑 결과: 테스트 응답입니다.' } }], usage: { prompt_tokens: 100, completion_tokens: 10 } }) });
  });
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);
  await registerPayment(page, acc, 50000);
  await page.evaluate(() => {
    localStorage.setItem('crm_feature_flags_cache_v1', JSON.stringify({ global: { 'module.aiChat': true }, branch: { 'module.aiChat': true } }));
    localStorage.setItem('ai_key_openai', 'sk-test-ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  });
  await page.goto('/ai-chat');
  await page.getByTestId('ai-briefing-month').click();
  await expect(page.getByText('브리핑 결과: 테스트 응답입니다.')).toBeVisible({ timeout: 15_000 });

  expect(bodies.length).toBe(1);
  const req = JSON.parse(bodies[0]);
  const system: string = req.messages[0].content;
  expect(req.messages[0].role).toBe('system');
  expect(system).toContain('[확정] 이달 매출 50,000원');
  expect(system).toContain('[기준] 우리 매장');
  expect(system).toContain('숫자를 새로 계산하거나 추정하지 말고');
  expect(system).not.toContain(acc.customer);     // 고객 실명 없음(건수만)
  expect(system).not.toContain('sk-test-');       // 키 없음
  // 158 경영비서 2차 — 월 브리핑: 전월 대비 원인 후보·캠페인 추천([추정])·연락할 고객
  expect(system).toContain('[확정] 전월 대비 변화(원인 후보, 지난달 → 이달): 방문 고객');
  expect(system).toContain('[추정] 이번 주 캠페인 추천');
  expect(system).toContain('[확정] 오늘 연락할 고객(캠페인)');
  expect(system).not.toContain('오늘 빈 시간'); // 빈 시간은 오늘 브리핑에만

  // 오늘 브리핑: 빈 시간 줄(직원은 가명), 매출 지표 없음
  await page.getByTestId('ai-briefing-today').click();
  await expect.poll(() => bodies.length, { timeout: 15_000 }).toBe(2);
  const todaySys: string = JSON.parse(bodies[1]).messages[0].content;
  expect(todaySys).toContain('[확정] 오늘 빈 시간');
  expect(todaySys).toContain('[확정] 오늘 연락할 고객(캠페인)');
  expect(todaySys).not.toContain('이달 매출');
  expect(todaySys).not.toContain(acc.customer);
});
