#!/usr/bin/env node
/**
 * 순수 규칙 커버리지 가드 (268 → 270 전면 수정, GAP Q-3)
 *
 * 왜: 이 제품의 숫자·문구 규칙은 전부 `src/lib/**\/*Rule.ts`(순수 모듈)에 있고, 공식을 고정하는 것은
 *     `e2e/lib-units.spec.ts` 다(ANALYTICS-DEFINITIONS 가 그렇게 선언한다). 한 번도 불러 본 적 없는
 *     공식은 "맞다" 고 말할 근거가 없다.
 * 268 판의 결함(267~269 리뷰 M-7, 실측): ① `readdirSync` 가 비재귀여서 `src/lib/ai/*Rule.ts` 4개를
 *     아예 안 봤다(그래서 `costSimulatorRule.scenarios` 가 테스트 없이 "전부 호출" 로 통과했다)
 *     ② 이름 문자열만 봐서 **별칭 import**(`toMinutes as schedToMinutes`)로 이미 테스트된 함수를
 *     "미호출" 로 보고(그래서 268 이 쓸데없는 2중 import 를 넣었다), 반대로 **다른 모듈의 같은 이름**
 *     (`addDays` 가 두 모듈에 있다)이나 주석 문자열로도 통과했다 ③ `export async function`·화살표 export 미탐지.
 * 지금 방식: 스펙의 **import 문을 모듈별로 읽어** 그 모듈에서 가져온 심볼만 인정하고(별칭은 지역 이름으로),
 *     그 지역 이름이 스펙 본문에서 **호출**되는지 본다. 모듈 경로가 다르면 같은 이름도 서로 인정하지 않는다.
 * 한계: 호출 여부만 본다(분기 커버리지는 리뷰와 스펙 본문의 몫). 재export·동적 import 는 보지 않는다.
 * 자체 점검: node scripts/check-rule-coverage.mjs --selftest
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const root = path.resolve(HERE, '..');
const LIB = path.join(root, 'src', 'lib');
const SPEC = path.join(root, 'e2e', 'lib-units.spec.ts');

/** `src/lib` 아래 모든 `*Rule.ts` (하위 폴더 포함 — ai/ 가 268 판에서 빠졌다) */
function listRuleFiles(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listRuleFiles(p, base));
    else if (/Rule\.ts$/.test(e.name)) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out.sort();
}

/** 모듈에서 내보내는 함수 이름 — function·async function·화살표 상수 모두 */
function exportedFunctions(src) {
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+const\s+([A-Za-z0-9_]+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>/gm)) names.add(m[1]);
  return [...names].sort();
}

/**
 * 스펙이 그 모듈에서 가져온 심볼 → 지역 이름. `import { a, b as c, type D } from '<module>'`
 * 여러 import 문이 같은 모듈을 가리켜도 합친다.
 */
function importedNames(specText, moduleRelPath) {
  const modNoExt = moduleRelPath.replace(/\.ts$/, '');
  const map = new Map();
  const re = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of specText.matchAll(re)) {
    const from = m[2];
    if (!from.endsWith('/' + modNoExt) && !from.endsWith('/src/lib/' + modNoExt)) continue;
    for (const piece of m[1].split(',')) {
      const t = piece.trim();
      if (!t || t.startsWith('type ')) continue;
      const as = t.split(/\s+as\s+/);
      const exported = as[0].trim();
      const local = (as[1] || as[0]).trim();
      if (exported) map.set(exported, local);
    }
  }
  return map;
}

/** 호출처가 없는 `모듈.함수` 목록 */
function findUncalled(ruleSources, specText) {
  const out = [];
  for (const [rel, src] of Object.entries(ruleSources)) {
    const imported = importedNames(specText, rel);
    for (const name of exportedFunctions(src)) {
      const local = imported.get(name);
      if (!local) { out.push(`${rel.replace(/\.ts$/, '')}.${name} (스펙이 import 하지 않음)`); continue; }
      if (!new RegExp('\\b' + local.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(').test(specText)) {
        out.push(`${rel.replace(/\.ts$/, '')}.${name} (import 만 하고 호출하지 않음${local !== name ? ` — 별칭 ${local}` : ''})`);
      }
    }
  }
  return out.sort();
}

if (process.argv.includes('--selftest')) {
  const sources = {
    'aRule.ts': 'export function used(a) {}\nexport function unused(b) {}\nexport async function usedAsync() {}\nexport const arrow = (x) => x;\n',
    'ai/bRule.ts': 'export function deepUnused() {}\n',          // 하위 폴더도 본다 (268 판이 놓친 것)
    'cRule.ts': 'export function dup() {}\n',                      // 다른 모듈의 같은 이름은 인정하지 않는다
  };
  const spec = [
    "import { used as u, arrow, usedAsync } from '../src/lib/aRule';",
    "import { dup } from '../src/lib/other/dupRule';",             // cRule 이 아니다
    'u(1); arrow(2); await usedAsync(); dup(3);',
    '// unused(9) 는 주석이라 호출이 아니다',
  ].join('\n');
  const got = findUncalled(sources, spec);
  const want = [
    'aRule.unused (스펙이 import 하지 않음)',
    'ai/bRule.deepUnused (스펙이 import 하지 않음)',
    'cRule.dup (스펙이 import 하지 않음)',
  ];
  const ok = got.length === want.length && want.every((w, i) => got[i] === w);
  if (!ok) {
    console.error('[check-rule-coverage] 자체 점검 실패');
    console.error('  받은 값:', got);
    console.error('  기대 값:', want);
    process.exit(1);
  }
  // 주석 안 호출을 통과로 보지 않는지(위 want 에 unused 가 들어 있으면 성립) + 별칭 인정이 되는지(used 가 빠져 있으면 성립)
  console.log('[check-rule-coverage] 자체 점검 OK — 하위 폴더·별칭·주석·모듈 구분 4가지');
  process.exit(0);
}

const files = listRuleFiles(LIB);
const sources = Object.fromEntries(files.map(f => [f, readFileSync(path.join(LIB, f), 'utf8')]));
const spec = readFileSync(SPEC, 'utf8');
const uncalled = findUncalled(sources, spec);
const total = Object.values(sources).reduce((n, src) => n + exportedFunctions(src).length, 0);

if (uncalled.length > 0) {
  console.error(`[check-rule-coverage] 순수 규칙 모듈 ${files.length}개·export 함수 ${total}개 중 ${uncalled.length}개가 e2e/lib-units.spec.ts 에서 호출되지 않습니다:`);
  for (const name of uncalled) console.error('  - ' + name);
  console.error('  → 공식을 고정하는 테스트를 추가하거나, 쓰이지 않는 함수라면 삭제하세요(데드코드 금지).');
  process.exit(1);
}
console.log(`[check-rule-coverage] OK — 순수 규칙 ${files.length}개 모듈, export 함수 ${total}개 전부 lib-units 에서 호출(별칭 포함)`);
