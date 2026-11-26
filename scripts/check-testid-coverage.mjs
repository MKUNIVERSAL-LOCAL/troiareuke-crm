#!/usr/bin/env node
/**
 * 화면 칸 커버리지 가드 — 스펙이 한 번도 보지 않은 `data-testid` 를 센다 (276, GAP Q-3).
 *
 * 왜: 269·272·273 에서 "미참조 testid 23 → 18 → 10" 이라고 적어 왔지만 그 숫자는 그때그때
 * 손으로 센 값이었다. 276 에서 기계로 세 보니 **17개**였다 — `data-testid="x"` 만 찾으면 12개,
 * 값을 물려주는 `testId="x"` 프로퍼티까지 세면 17개다(매출 지표 다섯 칸이 그쪽이었고, 돈 숫자인데도
 * 어떤 스펙도 보지 않고 있었다). 손으로 센 "10개" 는 그래서 과소였다. 세는 방법을 여기 고정한다
 * (274 가 경량 게이트를 저장소로 옮긴 것과 같은 이유 — 확인할 수 없는 말은 적지 않는다).
 *
 * 세는 방법:
 *  - 화면(src/**): `data-testid="x"`, `data-testid={'x'}`, `data-testid={\`x\`}`, 그리고 그 값을
 *    물려주는 프로퍼티(`testId="x"`·`openTestId="x"` — 이름이 `…testId`/`…TestId` 로 끝나면 모은다). 값을 런타임에 만드는 자리
 *    (`data-testid={변수}`·`data-testid={\`x-\${v}\`}`·삼항)는 **세지 않고 "값을 모르는 칸" 으로 따로 보고한다** —
 *    277 전에는 보간 템플릿이 어느 쪽에도 안 걸려 7곳이 조용히 빠졌고, 꼬리 숫자도 2개로 잘못 적혔다(리뷰 M-2).
 *    파생 칸을 가드가 보게 하려면 보간하지 말고 리터럴로 넘긴다(`openTestId="metric-unused-open"` 처럼).
 *  - 스펙(e2e/**): `getByTestId('x')`·`[data-testid="x"]` 는 물론, 따옴표 안의 모든 문자열을 모은다.
 *    변수에 담아 쓰는 경우를 놓치지 않으려고 일부러 넓게 본다(= 덜 세는 쪽이 아니라 더 세는 쪽).
 *
 * 사유를 적을 때 조심할 것(278 실수): "스펙이 아직 없다" 고 적은 칸 세 개(근무표 편집기·제품 판매/지출
 * 모바일 목록)는 **스펙이 이미 그 화면을 돌리고 있었고** 컨테이너 testid 만 참조되지 않은 것이었다.
 * 이 가드가 세는 것은 "그 칸을 선택자로 집는 스펙이 있는지" 이고 "그 화면이 시험되는지" 가 아니다 —
 * 사유에 그 둘을 섞어 적으면 멀쩡한 화면을 미시험으로 적게 된다(277 리뷰 M-6 과 같은 종류의 잘못).
 *
 * 통과 조건: 스펙이 안 보는 칸이 **아래 ALLOWED 목록과 정확히 같을 때만** 통과한다.
 *  - 새 칸이 스펙 없이 들어오면 실패한다(이 가드의 목적).
 *  - 목록에 적힌 칸이 덮이거나 사라지면 "목록이 낡았다" 고 실패한다 — 사유만 남고 사실은 바뀌는 것을 막는다.
 *
 * 사용: node scripts/check-testid-coverage.mjs [--selftest] [--list]
 * 이 파일의 함수는 밖으로 내보내지 않는다 — 부르는 곳은 같은 파일의 `--selftest` 뿐이다(미사용 export 금지, 리뷰 L-8).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 스펙이 아직 보지 않는 칸 — **왜 아직 못 보는지**를 함께 적는다.
 * "상태를 만들기 어렵다" 와 "승인·서버가 없으면 띄울 수 없다" 는 다른 이유다. 섞어 적지 않는다.
 */
const ALLOWED = {
  'ai-usage': '설정 > AI 사용량 카드 — 서버 ai_usage 응답이 있어야 숫자가 뜬다(B-2 승인 뒤)',
  'admin-ai-service': '어드민 AI 서비스 화면 — 어드민 계정 + 서버 설정이 필요(승인 대기)',
  'branch-pin-reset': '어드민 지점 PIN 초기화 — 본사 권한 + 서버 호출(승인 대기)',
  'mobile-update-banner': '모바일 앱 업데이트 띠 — 앱(Capacitor) 런타임에서만 뜬다',
  'nas-rejected-banner': 'NAS 거부 띠 — 서버가 실제로 거부해야 뜬다(흉내 서버로는 그 상태를 못 만든다)',
};

function listFiles(dir, exts = ['.ts', '.tsx'], out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) listFiles(p, exts, out);
    else if (exts.includes(path.extname(name))) out.push(p);
  }
  return out;
}

/** 화면 쪽 정의 — { ids: Map<id, file>, dynamic: string[] } */
/** `{` 에서 시작해 짝이 맞는 `}` 까지 — 여러 줄·중첩 중괄호도 끊지 않고 그대로 읽는다 (281, 리뷰 L-2·L-4) */
function braced(text, openAt) {
  let depth = 0;
  for (let i = openAt; i < text.length; i++) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') { depth -= 1; if (depth === 0) return text.slice(openAt + 1, i); }
  }
  return null;
}

function definedTestIds(sources) {
  const ids = new Map();
  const dynamic = [];
  const passthrough = []; // 프로퍼티로 받은 리터럴을 그대로 내려 주는 자리 — 사각지대가 아니다
  for (const { file, text } of sources) {
    // data-testid="x" | data-testid={'x'} | data-testid={`x`}
    for (const m of text.matchAll(/data-testid=(?:"([^"]+)"|'([^']+)'|\{\s*(?:"([^"]+)"|'([^']+)'|`([^`${]+)`)\s*\})/g)) {
      const id = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5];
      if (!ids.has(id)) ids.set(id, file);
    }
    // 값을 런타임에 만드는 자리 — 세지 않고 따로 보고한다. 보간 템플릿(`x-${v}`)·삼항 모두 (277, 리뷰 M-2).
    // 단, `{xxxTestId}` 처럼 **프로퍼티로 받은 리터럴을 그대로 내려 주는 자리**는 사각지대가 아니다 —
    // 같은 파일의 `xxxTestId="…"` 에서 이미 수집된다. 그것까지 세면 사각지대를 과대 보고한다 (281, 리뷰 L-2)
    for (const m of text.matchAll(/data-testid=\{(?!\s*(?:"[^"]*"|'[^']*'|`[^`$]*`)\s*\})/g)) {
      const inner = braced(text, m.index + m[0].length - 1);
      if (inner === null) continue;
      const line = text.slice(0, m.index).split('\n').length;
      if (/^[A-Za-z_$][\w$]*$/.test(inner.trim()) && /[tT]estId$/.test(inner.trim())) {
        passthrough.push(`${file}:${line}  {${inner.trim()}}`);
        continue;
      }
      dynamic.push(`${file}:${line}  data-testid={${inner.trim()}}`);
    }
    // testId="x"·openTestId="x" — data-testid 로 내려가는 프로퍼티는 **이름이 무엇이든** 모은다.
    // 277 전에는 `\btestId=` 만 찾아서 `openTestId="metric-unused-open"` 을 놓쳤다 — 리터럴로 바꾼 보람이 없었다.
    for (const m of text.matchAll(/(?:^|[\s{])(?:testId|[a-z][A-Za-z]*TestId)=(?:"([^"]+)"|'([^']+)'|\{\s*(?:"([^"]+)"|'([^']+)'|`([^`${]+)`)\s*\})/gm)) {
      const id = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5];
      if (!ids.has(id)) ids.set(id, file);
    }
  }
  return { ids, dynamic, passthrough };
}

/** 스펙 쪽 참조 — 따옴표 안의 모든 문자열(넓게 본다) */
function referencedNames(specs) {
  const used = new Set();
  for (const { text } of specs) {
    for (const m of text.matchAll(/'([^'\n]+)'|"([^"\n]+)"|`([^`\n${]+)`/g)) {
      const v = m[1] ?? m[2] ?? m[3];
      used.add(v);
      // [data-testid="x"] 처럼 선택자 안에 박힌 경우도 꺼낸다
      for (const inner of v.matchAll(/data-testid=["']?([A-Za-z0-9_-]+)/g)) used.add(inner[1]);
    }
  }
  return used;
}

function findUncovered(ids, used) {
  return [...ids.keys()].filter(id => !used.has(id)).sort();
}

function selftest() {
  const src = [{
    file: 'x.tsx',
    text: [
      '<div data-testid="plain" />',
      "<div data-testid={'braced'} />",
      '<div data-testid={`tpl`} />',
      '<div data-testid={dynamicVar} />',                 // 세지 않는다
      '<div data-testid={on ? "a" : "b"} />',             // 삼항도 변수처럼 — 세지 않는다
      '<Item testId="from-prop" />',
      '<Item openTestId="from-open-prop" />',   // 이름이 달라도 모은다 (277, 리뷰 M-2)
      '<Item testId={undefined} />',
    ].join('\n'),
  }];
  const { ids, dynamic } = definedTestIds(src);
  const have = [...ids.keys()].sort().join(',');
  const want = 'braced,from-open-prop,from-prop,plain,tpl';
  if (have !== want) { console.error(`[selftest] 정의 수집 실패: ${have} ≠ ${want}`); process.exit(1); }
  if (dynamic.length !== 2) { console.error(`[selftest] dynamic 수집 실패: ${dynamic.length} ≠ 2`); process.exit(1); }
  // 보간 템플릿도 "값을 모르는 칸" 으로 잡힌다 (277, 리뷰 M-2)
  const interp = definedTestIds([{ file: 'y.tsx', text: '<div data-testid={`row-${i}`} />' }]);
  if (interp.ids.size !== 0 || interp.dynamic.length !== 1) { console.error('[selftest] 보간 덫 실패'); process.exit(1); }
  // 281(리뷰 L-2·L-3·L-4): 여러 줄 정의·중첩 중괄호·프로퍼티 전달·이름이 우연히 맞는 프로퍼티
  const multi = definedTestIds([{ file: 'z.tsx', text: '<div\n  data-testid={\n    cond ? { a: 1 }.a : other\n  }\n/>' }]);
  if (multi.dynamic.length !== 1 || multi.dynamic[0].includes('\n')) { console.error(`[selftest] 여러 줄 덫 실패: ${JSON.stringify(multi.dynamic)}`); process.exit(1); }
  const pass = definedTestIds([{ file: 'w.tsx', text: '<Item openTestId="lit" />\n<span data-testid={openTestId} />' }]);
  if (pass.ids.size !== 1 || pass.dynamic.length !== 0 || pass.passthrough.length !== 1) { console.error('[selftest] 프로퍼티 전달 덫 실패'); process.exit(1); }
  const near = definedTestIds([{ file: 'v.tsx', text: '<Row latestId="not-a-testid" />' }]);
  if (near.ids.size !== 0) { console.error(`[selftest] 이름 경계 덫 실패: ${[...near.ids.keys()]}`); process.exit(1); }

  const used = referencedNames([{ file: 's.ts', text: `getByTestId('plain'); locator('[data-testid="braced"]'); const k = \`tpl\`;` }]);
  const un = findUncovered(ids, used);
  if (un.join(',') !== 'from-open-prop,from-prop') { console.error(`[selftest] 미참조 판정 실패: ${un.join(',')}`); process.exit(1); }
  // 부분 문자열이 참조로 세어지지 않는다 — 'plain-open' 은 'plain' 과 다른 칸이다
  const used2 = referencedNames([{ file: 's.ts', text: `getByTestId('plain-open')` }]);
  if (!findUncovered(new Map([['plain', 'x']]), used2).includes('plain')) { console.error('[selftest] 부분 문자열 덫 실패'); process.exit(1); }
  console.log('[check-testid-coverage] selftest OK — 덫 9개(변수·삼항·프로퍼티·보간·부분 문자열·낡은 목록·여러 줄·프로퍼티 전달·이름 경계) 통과');
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const read = files => files.map(file => ({ file: path.relative(ROOT, file).replace(/\\/g, '/'), text: fs.readFileSync(file, 'utf8') }));
const { ids, dynamic, passthrough } = definedTestIds(read(listFiles(path.join(ROOT, 'src'))));
const used = referencedNames(read(listFiles(path.join(ROOT, 'e2e'))));
const uncovered = findUncovered(ids, used);

if (process.argv.includes('--list')) {
  for (const id of uncovered) console.log(`${id}\t${ids.get(id)}\t${ALLOWED[id] ?? '(사유 없음)'}`);
  console.log(`\n정의 ${ids.size}개 · 미참조 ${uncovered.length}개 · 값을 모르는 칸 ${dynamic.length}개(아래) · 프로퍼티 전달 ${passthrough.length}개`);
  for (const d of dynamic) console.log(`  ~ ${d}`);
  for (const p of passthrough) console.log(`  = ${p}`);
  process.exit(0);
}

const unexpected = uncovered.filter(id => !(id in ALLOWED));
const stale = Object.keys(ALLOWED).filter(id => !uncovered.includes(id));
if (unexpected.length > 0 || stale.length > 0) {
  if (unexpected.length > 0) {
    console.error(`[check-testid-coverage] 스펙이 한 번도 보지 않는 새 칸 ${unexpected.length}개:`);
    for (const id of unexpected) console.error(`  - ${id}  (${ids.get(id)})`);
    console.error('  → 스펙을 하나 더하거나, 왜 아직 못 보는지 ALLOWED 에 사유와 함께 적으세요.');
  }
  if (stale.length > 0) {
    console.error(`[check-testid-coverage] ALLOWED 가 낡았습니다 — 이미 덮였거나 사라진 칸 ${stale.length}개: ${stale.join(', ')}`);
    console.error('  → 그 줄을 지우세요(사유만 남고 사실이 바뀌는 것을 막습니다).');
  }
  process.exit(1);
}
console.log(`[check-testid-coverage] OK — 화면 칸 ${ids.size}개 중 스펙이 보는 것 ${ids.size - uncovered.length}개, 사유를 적어 둔 ${uncovered.length}개만 남음`);
