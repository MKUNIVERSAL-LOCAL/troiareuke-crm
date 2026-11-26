#!/usr/bin/env node
/**
 * 순수 규칙 커버리지 가드 (268, GAP Q-3)
 *
 * 왜: 이 제품의 숫자·문구 규칙은 전부 `src/lib/*Rule.ts`(순수 모듈)에 있고, 공식을 고정하는 것은
 *     `e2e/lib-units.spec.ts` 다(ANALYTICS-DEFINITIONS 가 그렇게 선언한다). 그런데 규칙을 늘리면서
 *     **테스트가 한 번도 부르지 않는 export 함수**가 조용히 쌓였다(268 시점 209개 중 9개).
 *     한 번도 불러 본 적 없는 공식은 "맞다" 고 말할 근거가 없다.
 * 하는 일: 모든 `*Rule.ts` 의 `export function` 이름이 lib-units 스펙에서 **호출**되는지 본다.
 *     하나라도 빠지면 비 0 으로 끝난다(이름만 import 하고 부르지 않는 것도 빠진 것으로 본다).
 * 한계: 호출 여부만 본다 — 분기 커버리지는 보지 않는다(그건 리뷰와 스펙 본문의 몫).
 * 자체 점검: node scripts/check-rule-coverage.mjs --selftest
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const LIB = path.join(root, 'src', 'lib');
const SPEC = path.join(root, 'e2e', 'lib-units.spec.ts');

export function findUncalled(ruleSources, specText) {
  const out = [];
  for (const [file, src] of Object.entries(ruleSources)) {
    for (const m of src.matchAll(/^export function ([A-Za-z0-9_]+)/gm)) {
      const name = m[1];
      if (!specText.includes(`${name}(`)) out.push(`${file.replace(/\.ts$/, '')}.${name}`);
    }
  }
  return out.sort();
}

if (process.argv.includes('--selftest')) {
  const uncalled = findUncalled(
    { 'aRule.ts': 'export function used(a) {}\nexport function unused(b) {}\n' },
    'expect(used(1)).toBe(1);',
  );
  if (uncalled.length !== 1 || uncalled[0] !== 'aRule.unused') {
    console.error('[check-rule-coverage] 자체 점검 실패:', uncalled);
    process.exit(1);
  }
  console.log('[check-rule-coverage] 자체 점검 OK');
  process.exit(0);
}

const files = readdirSync(LIB).filter(f => /Rule\.ts$/.test(f));
const sources = Object.fromEntries(files.map(f => [f, readFileSync(path.join(LIB, f), 'utf8')]));
const spec = readFileSync(SPEC, 'utf8');
const uncalled = findUncalled(sources, spec);
const total = Object.values(sources).reduce((n, src) => n + [...src.matchAll(/^export function /gm)].length, 0);

if (uncalled.length > 0) {
  console.error(`[check-rule-coverage] 순수 규칙 export 함수 ${total}개 중 ${uncalled.length}개가 e2e/lib-units.spec.ts 에서 호출되지 않습니다:`);
  for (const name of uncalled) console.error('  - ' + name);
  console.error('  → 공식을 고정하는 테스트를 추가하거나, 쓰이지 않는 함수라면 삭제하세요(데드코드 금지).');
  process.exit(1);
}
console.log(`[check-rule-coverage] OK — 순수 규칙 ${files.length}개 모듈, export 함수 ${total}개 전부 lib-units 에서 호출`);
