import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard } from './helpers';
import { toast } from './flows';

/**
 * 설정 > AI 서비스 (151, GAP A-3) — 이용 방식 4종 표시(키 없음 → "사용 안 함"), 키 형식 오류 거부, OpenAI 키 저장 → "내 키로 직접" 활성·마스킹,
 * 연결 테스트는 실제 응답으로만 판정(네트워크 가로채 401 → "연결 실패" 표시, 가짜 성공 없음), 마법사·FAQ 펼침, 삭제.
 */

const acc = makeAccount('AS');

test('AI 서비스 탭 — 이용 방식·키 저장/삭제·연결 테스트(정직한 실패)·마법사', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await page.route('https://api.openai.com/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Incorrect API key provided' } }) }));
  await signupAndOnboard(page, acc);
  await page.goto('/settings?tab=ai');
  const card = page.getByTestId('ai-service-card');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('ai-mode-off')).toContainText('현재 상태');
  await expect(card.getByTestId('ai-mode-paid')).toContainText('준비 중');

  const openai = card.getByTestId('ai-provider-openai');
  await expect(openai).toContainText('키 없음');
  await openai.getByLabel('ChatGPT (OpenAI) 키').fill('abc');
  await openai.getByRole('button', { name: '저장', exact: true }).click();
  await expect(toast(page, /키 형식이 아닙니다/, 'alert')).toBeVisible();
  await expect(openai).toContainText('키 없음');

  await openai.getByLabel('ChatGPT (OpenAI) 키').fill('sk-test-ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  await openai.getByRole('button', { name: '저장', exact: true }).click();
  await expect(openai).toContainText('키 저장됨 sk-t••••WXYZ');
  await expect(card.getByTestId('ai-mode-byok')).toContainText('사용 중 · ChatGPT');
  await expect(card.getByTestId('ai-mode-off')).not.toContainText('현재 상태');

  // 연결 테스트 — 서버가 401 → 실패를 그대로 보여 준다
  await openai.getByRole('button', { name: '연결 테스트' }).click();
  await expect(card.getByTestId('ai-test-openai')).toContainText('Incorrect API key');

  // 마법사·FAQ
  await card.getByRole('button', { name: /ChatGPT\(OpenAI\) 키 받기/ }).click();
  await expect(card.getByTestId('ai-guide-openai')).toContainText('API keys');
  await card.getByRole('button', { name: '키는 어디에 저장되나요? 안전한가요?' }).click();
  await expect(card).toContainText('본사·서버로 보내지 않습니다');

  // 새로고침 뒤에도 남고, 삭제하면 사라진다
  await page.reload();
  await page.goto('/settings?tab=ai');
  await expect(openai).toContainText('키 저장됨');
  await openai.getByRole('button', { name: '삭제', exact: true }).click();
  await page.getByRole('dialog', { name: 'AI 키 삭제', exact: true }).getByRole('button', { name: '삭제', exact: true }).click();
  await expect(openai).toContainText('키 없음');
  await expect(card.getByTestId('ai-mode-off')).toContainText('현재 상태');
});
