import { test, expect } from '@playwright/test';
import { makeAccount, signupAndOnboard, createCustomer, dismissToasts } from './helpers';
import { pickCustomer } from './helpers';

/**
 * 자주 쓰는 메모 문구 (251) — 시술 기록 메모에 같은 문장을 하루 수십 번 다시 쓰던 것.
 * 바쁜 시간에는 아예 비워 두고, 그러면 다음 방문 때 주의사항이 남지 않는다(기록이 비는 가장 큰 이유가 타이핑이다).
 * 문구를 저장 → 칩을 눌러 메모에 덧붙이기 → 중복 거절 → 삭제까지 본다.
 */

const acc = makeAccount('MP');

test('시술 기록 메모에 자주 쓰는 문구를 저장해 눌러 넣는다', async ({ page }) => {
  test.slow();
  page.on('dialog', d => d.accept());
  await signupAndOnboard(page, acc);
  await createCustomer(page, acc);

  await page.goto('/treatments?new=1');
  const dialog = page.getByRole('dialog', { name: '시술 기록 추가' });
  await expect(dialog).toBeVisible();
  await pickCustomer(page, acc.customer, dialog);

  // 문구가 없으면 칩 줄도 없다(장식 UI 금지)
  await expect(dialog.getByTestId('memo-presets')).toHaveCount(0);

  // 문구 두 개 저장
  await dialog.getByTestId('memo-preset-manage').click();
  const editor = dialog.getByTestId('memo-preset-editor');
  await expect(editor).toBeVisible();
  await editor.getByLabel('새 문구').fill('자극 없음 · 홈케어 안내');
  await editor.getByRole('button', { name: '추가' }).click();
  await dismissToasts(page);
  await editor.getByLabel('새 문구').fill('강도 한 단계 낮춤');
  await editor.getByRole('button', { name: '추가' }).click();
  await dismissToasts(page);

  // 같은 문구는 거절하고 사유를 알린다(공백만 다른 경우도)
  await editor.getByLabel('새 문구').fill('자극  없음 ·  홈케어 안내');
  await editor.getByRole('button', { name: '추가' }).click();
  await expect(page.getByText('이미 있는 문구입니다.')).toBeVisible();
  await dismissToasts(page);

  // 칩을 눌러 메모에 덧붙인다 — 두 번 눌러도 줄이 두 번 생기지 않는다
  const chips = dialog.getByTestId('memo-presets');
  await chips.getByRole('button', { name: '자극 없음 · 홈케어 안내' }).click();
  await chips.getByRole('button', { name: '강도 한 단계 낮춤' }).click();
  await chips.getByRole('button', { name: '자극 없음 · 홈케어 안내' }).click();
  const memo = dialog.getByPlaceholder('시술 특이사항, 다음 방문 시 주의사항 등');
  await expect(memo).toHaveValue('자극 없음 · 홈케어 안내\n강도 한 단계 낮춤');

  // 문구 삭제 — 칩에서도 사라진다
  await editor.getByRole('button', { name: '강도 한 단계 낮춤 문구 삭제' }).click();
  await dismissToasts(page);
  await expect(chips.getByRole('button', { name: '강도 한 단계 낮춤' })).toHaveCount(0);
  await expect(chips.getByRole('button', { name: '자극 없음 · 홈케어 안내' })).toBeVisible();
  // 이미 쓴 메모는 지워지지 않는다(문구 목록과 기록은 별개)
  await expect(memo).toHaveValue('자극 없음 · 홈케어 안내\n강도 한 단계 낮춤');
});
