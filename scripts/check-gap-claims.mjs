#!/usr/bin/env node
/**
 * GAP 표 검증 가드 (303) — `npm run check:gap`
 *
 * 왜: `docs/GLOBAL-CRM-GAP-ANALYSIS.md` 는 **무엇을 다음에 할지 고르는 근거**다. 묶음마다 이 표를 보고
 *     "승인 없이 비코어로 닫을 수 있는 것" 을 고른다. 그래서 이 표가 낡으면 **계획 전체가 낡은 사실 위에서 돈다**.
 *     283 이 기록 문서에 같은 장치(`check:docs`)를 넣었는데 GAP 표는 그 밖에 있었다.
 *     첫 실행은 4건을 보고했는데 **진짜는 하나**였다 — 0절의 "서버 자동 테스트 0건"(실제 35건).
 *     나머지 셋은 **이 가드 자신의 거짓 경보**였고(이스케이프한 파이프를 칸 구분으로 셈, 승인 번호
 *     `A-15`·`B-2` 를 없는 항목으로 봄) 그 자리에서 고치고 덫으로 박았다. 가드가 거짓을 말하면
 *     사람이 가드를 끄게 되므로, 거짓 경보는 못 잡는 것보다 나쁠 수 있다.
 *
 * 검사(실패하면 그 줄을 적는다):
 *   ① 표 구조 — 머리글과 열 수가 다른 행(셀이 하나 어긋나면 상태·승인 칸이 옆으로 밀려 **다른 뜻**이 된다)
 *   ② 상태 칸 — 머리말이 정의한 기호(✅ 🔧 ◐ ✗ 🔒 ⛔)로 시작한다
 *   ③ 상태 칸의 묶음 번호 — 로드맵에 `- [x] NNN` 으로 실재한다(없는 번호를 근거로 적지 않는다)
 *   ④ 위치 칸의 파일 — 백틱으로 적은 경로가 실재한다. **위치 칸만** 본다: 개선 방법 칸의 경로는
 *      아직 없는 **제안**이다(`analytics/rfm.ts` 처럼). 그 둘을 섞으면 가드가 거짓 경보를 낸다.
 *   ⑤ 완료 기준 칸 — `npm run X` 는 package.json 에 있고, `*.spec.ts` 는 e2e 에 있다
 *   ⑥ "서버 자동 테스트 0건" 류 — 테스트 파일이 있는데 0건이라고 적지 않는다
 *      (정확한 개수는 러너가 세는 수(반복 생성 테스트 포함)와 달라 **0 과 0 아님**만 본다)
 *   ⑦ 우선순위 요약(8절)의 항목 코드 — 표에 실재한다(행을 지우거나 이름을 바꾼 뒤 요약만 남으면 유령 계획이다)
 *
 * `--selftest` 는 아래 덫으로 검사가 정말 무는지 본다(게이트에서 본검사와 함께 돈다).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAP = 'docs/GLOBAL-CRM-GAP-ANALYSIS.md';
const ROADMAP = 'docs/COMMERCIALIZATION-ROADMAP-2026-11-17.md';
const STATUS_MARKS = ['✅', '🔧', '◐', '✗', '🔒', '⛔'];
/** 백틱 안 경로를 찾을 때 붙여 볼 디렉터리 — 표는 파일 이름만 적는 자리가 많다 */
const DIRS = ['', 'src/lib/', 'src/lib/ai/', 'src/components/', 'e2e/', 'scripts/', 'docs/', 'server/src/'];

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * 표의 한 줄을 셀 배열로 — 양끝의 빈 칸은 버린다.
 * `\|` 는 **칸을 나누지 않는다**(표 안에 파이프를 쓰려면 그렇게 적는다 — `data \| jsonb`).
 * 처음 짰을 때 그냥 `split('|')` 로 세어 302 가 적은 `data \|\| jsonb` 행을 "칸이 2개 밀렸다" 고 보고했다.
 */
function cells(line) {
  const parts = line.split(/(?<!\\)\|/);
  if (parts.length < 3) return null;
  return parts.slice(1, -1).map(c => c.trim().replace(/\\\|/g, '|'));
}

/** 표를 머리글 기준으로 묶는다 */
function tablesOf(text) {
  const tables = [];
  const lines = text.split(/\r?\n/);
  let current = null;
  let inFence = false; // 311(303~308 리뷰 L-1): 펜스 안의 예시 표를 진짜 표로 세어 거짓 경보가 났다
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { inFence = !inFence; current = null; continue; }
    if (inFence) continue;
    if (!line.trim().startsWith('|')) { current = null; continue; }
    const row = cells(line);
    if (!row) { current = null; continue; }
    if (row.every(c => /^-{3,}$/.test(c))) continue; // 구분 줄
    if (!current) {
      current = { header: row, rows: [], headerLine: i + 1 };
      tables.push(current);
      continue;
    }
    current.rows.push({ cells: row, line: i + 1 });
  }
  return tables;
}

const pathsIn = cell => [...cell.matchAll(/`([A-Za-z0-9_@./-]+\.(?:ts|tsx|mjs|cjs|js|md|json))`/g)].map(m => m[1]);
const exists = p => DIRS.some(d => fs.existsSync(path.join(ROOT, d + p)));

function checkGap({ gap, roadmap, pkg, hasServerTests, specExists, scriptExists, fileExists }) {
  const problems = [];
  const tables = tablesOf(gap);
  const codes = new Set();

  for (const table of tables) {
    const iStatus = table.header.indexOf('상태');
    const iWhere = table.header.indexOf('위치');
    const iDone = table.header.indexOf('완료 기준');
    const iCode = table.header.indexOf('#');
    for (const { cells: row, line } of table.rows) {
      if (row.length !== table.header.length) {
        problems.push(`${GAP}:${line} 열이 ${row.length}개다(머리글 ${table.header.length}개) — 칸이 밀리면 상태·승인이 다른 뜻이 된다`);
        continue;
      }
      if (iCode >= 0 && /^[A-Z]-\d+$/.test(row[iCode])) codes.add(row[iCode]);

      if (iStatus >= 0) {
        const status = row[iStatus];
        if (!STATUS_MARKS.some(m => status.startsWith(m))) {
          problems.push(`${GAP}:${line} 상태 칸이 "${status.slice(0, 20)}" 로 시작한다 — 머리말이 정의한 기호(${STATUS_MARKS.join(' ')}) 중 하나로 시작해야 한다`);
        }
        // 311(리뷰 L-2): 상태 칸의 세 자리 숫자를 **전부** 묶음 번호로 봐서 `409`(HTTP)·`080`(수신거부
        // 번호)·`500행` 같은 값이 들어가면 거짓 경보가 났다 — 뒤에 단위가 붙은 숫자는 묶음이 아니다.
        const statusNos = [...status.matchAll(/\b(\d{3})\b(\s*(?:행|건|개|번|자|%|원|초|분|시간|칸))?/g)]
          .filter(m => !m[2]).map(m => m[1]);
        for (const no of statusNos) {
          if (!new RegExp(`^- \\[x\\] ${no} `, 'm').test(roadmap)) {
            problems.push(`${GAP}:${line} 상태 칸이 묶음 ${no} 를 근거로 적었는데 로드맵에 그 묶음이 없다`);
          }
        }
      }

      if (iWhere >= 0) {
        for (const p of pathsIn(row[iWhere])) {
          if (!fileExists(p)) problems.push(`${GAP}:${line} 위치 칸의 \`${p}\` 가 없다 — 옮겼거나 지웠으면 표도 같이 고쳐야 한다`);
        }
      }

      if (iDone >= 0) {
        for (const m of row[iDone].matchAll(/npm run ([a-z0-9:-]+)/g)) {
          if (!scriptExists(m[1])) problems.push(`${GAP}:${line} 완료 기준의 \`npm run ${m[1]}\` 가 package.json 에 없다`);
        }
        for (const m of row[iDone].matchAll(/([A-Za-z0-9_-]+)\.spec\.ts/g)) {
          if (!specExists(`${m[1]}.spec.ts`)) problems.push(`${GAP}:${line} 완료 기준의 \`${m[0]}\` 가 e2e 에 없다`);
        }
      }
    }
  }

  // ⑥ 는 **표 밖의 글**(머리말·0절)만 본다 — 표의 항목 이름 "서버 테스트 0건·단위 프레임워크 없음" 은
  //    그 갭이 처음 무엇이었는지를 적은 **이름**이지 지금 상태 주장이 아니다(처음 짰을 때 그것을 잡았다).
  const prose = gap.split(/\r?\n/).filter(l => !l.trim().startsWith('|')).join('\n');
  const zero = prose.match(/서버(?: 자동)? 테스트 0건/);
  if (zero && hasServerTests) {
    problems.push(`${GAP}: "${zero[0]}" 은 사실이 아니다 — server/src 에 테스트가 있다(개수는 \`npm run test:server\` 가 센다)`);
  }

  // ⑦ 요약 절의 항목 코드가 표에 있는지 — 표를 지우고 요약만 남기면 유령 계획이 된다.
  //    **승인 대기열을 가리키는 줄은 건너뛴다**: 그 줄의 `A-15`·`B-2` 는 GAP 항목이 아니라 승인 번호다
  //    (처음 짰을 때 그 둘을 "표에 없는 항목" 이라고 보고했다).
  const at8 = gap.indexOf('## 8.');
  if (at8 >= 0) {
    for (const line of gap.slice(at8).split(/\r?\n/)) {
      if (/OWNER-APPROVAL|승인 필요/.test(line)) continue;
      for (const m of line.matchAll(/\b([A-Z]-\d+)\b/g)) {
        if (!codes.has(m[1])) problems.push(`${GAP}: 요약(8절)이 ${m[1]} 을 가리키는데 표에 그 항목이 없다`);
      }
    }
  }

  if (!pkg) problems.push('package.json 을 읽지 못했다');
  return problems;
}

function liveInputs() {
  const pkg = JSON.parse(read('package.json'));
  const serverTests = fs.readdirSync(path.join(ROOT, 'server', 'src')).filter(f => f.endsWith('.test.js'));
  return {
    gap: read(GAP),
    roadmap: read(ROADMAP),
    pkg,
    hasServerTests: serverTests.some(f => /\btest\(/.test(read(path.join('server', 'src', f)))),
    specExists: name => fs.existsSync(path.join(ROOT, 'e2e', name)),
    scriptExists: name => Boolean(pkg.scripts?.[name]),
    fileExists: exists,
  };
}

function selftest() {
  const base = liveInputs();
  const ok = (name, cond) => { if (!cond) { console.error(`[selftest] ${name} 덫 실패`); process.exit(1); } };
  // 340: 덫이 살아 있는 문서 글귀에 묶여 있으면, 그 글귀를 고친 날 치환이 헛돌고 덫은 조용히 약해진다
  //      (305 에서 같은 사고를 겪고 적어 두었는데 글귀로 치환하는 덫이 그대로 남아 있었다).
  //      sub() 는 **바꾼 것이 없으면 그 자리에서 멈춘다** — 면제 덫이 헛돌아 통과하는 길을 막는다.
  const sub = (text, find, rep) => {
    const out = text.replace(find, rep);
    if (out === text) { console.error(`[selftest] 덫이 헛돌았다 — 문서에서 ${find} 를 찾지 못했다(덫을 지금 문서에 맞게 고치세요)`); process.exit(1); }
    return out;
  };
  const with_ = over => checkGap({ ...base, ...over });
  const bite = (name, over, re) => ok(name, with_(over).some(p => re.test(p)));

  // 표 구조
  bite('칸 하나가 밀린 행', { gap: sub(base.gap, '| P-5 | 재고 입출고 원장·실사·발주 제안 |', '| P-5 | 재고 입출고 원장·실사·발주 제안 | 군더더기 |') }, /칸이 밀리면/);
  // 상태 기호
  bite('상태 기호 없음', { gap: sub(base.gap, '| P-6 | 매출 지표 | ✅ 147·260 |', '| P-6 | 매출 지표 | 완료 147·260 |') }, /기호.*중 하나로 시작/);
  // 없는 묶음 번호
  bite('없는 묶음 번호', { gap: sub(base.gap, '✅ 221·264·279·302', '✅ 221·264·279·999') }, /묶음 999 를 근거로 적었는데/);
  // 위치 칸의 없는 파일
  bite('위치 칸의 없는 파일', { gap: sub(base.gap, '`refundRule.ts`', '`refundRuleGone.ts`') }, /위치 칸의 `refundRuleGone\.ts` 가 없다/);
  // 개선 방법 칸의 제안 경로는 잡지 않는다(거짓 경보 금지)
  ok('제안 경로 면제', !with_({}).some(p => /analytics\/rfm\.ts/.test(p)));
  // 완료 기준의 없는 명령·스펙
  // 덫을 **문서 문구가 아니라 줄 모양**에 건다 — 처음엔 P-4 행의 완료 기준 글을 그대로 적어 두었다가
  // 305 에서 그 칸을 고치자 덫이 허공을 쳤다(가드의 덫이 낡으면 가드가 조용히 약해진다).
  // 341(리뷰 L-1): 이 덫도 sub() 로 가져온다 — P-4 행이 없어지면 **조용히** 헛돌지 않고 멈춘다
  const withFakeCmd = sub(base.gap, /^\| P-4 .*\|\s*$/m, m => m.replace(/\|\s*$/, '· 완료 기준은 npm run check:nope |'));
  bite('없는 npm 명령', { gap: withFakeCmd }, /npm run check:nope` 가 package.json 에 없다/);
  bite('없는 스펙 파일', { gap: sub(base.gap, 'month-view 스펙', 'month-view-gone.spec.ts 스펙') }, /month-view-gone\.spec\.ts` 가 e2e 에 없다/);
  // 서버 테스트 0건 주장
  bite('서버 테스트 0건 주장', { gap: sub(base.gap, /서버 자동 테스트는 node 내장 러너 \*\*\d+건\*\*/, '서버 자동 테스트 0건') }, /사실이 아니다/);
  ok('표의 항목 이름 속 0건 은 잡지 않는다', !with_({}).some(p => /0건/.test(p)));
  ok('서버 테스트가 정말 없으면 0건은 사실', !checkGap({ ...base, gap: sub(base.gap, /서버 자동 테스트는 node 내장 러너 \*\*\d+건\*\*/, '서버 자동 테스트 0건'), hasServerTests: false }).some(p => /사실이 아니다/.test(p)));
  // 요약의 유령 코드
  bite('요약의 유령 항목', { gap: sub(base.gap, '5. C-8/M-4 수신 동의', '5. C-99/M-4 수신 동의') }, /요약\(8절\)이 C-99/);
  // 311(리뷰 L-1·L-2): 펜스 안 예시 표와 단위가 붙은 숫자는 잡지 않는다
  ok('코드 펜스 면제', !with_({ gap: base.gap + '\n\n```markdown\n| # | 항목 | 상태 |\n|---|---|---|\n| X-1 | 예시 | 대기 |\n```\n' }).some(p => /상태 칸이|칸이 밀리면/.test(p)));
  ok('단위 붙은 숫자 면제', !with_({ gap: sub(base.gap, '✅ 221·264·279·302·305', '✅ 221·264·279·302·305 (표는 500행까지)') }).some(p => /묶음 500/.test(p)));
  // 처음 짰을 때 낸 거짓 경보 두 가지가 다시 생기지 않게
  ok('이스케이프한 파이프는 칸을 나누지 않는다', !with_({}).some(p => /칸이 밀리면/.test(p)));
  ok('승인 번호는 유령 항목이 아니다', !with_({}).some(p => /A-15|B-2/.test(p)));
  // 멀쩡한 상태에서는 0건
  const live = with_({});
  ok('지금 표는 통과', live.length === 0 || (console.error(live.join('\n')), false));

  console.log(`[check-gap-claims] selftest OK — 덫(코드 펜스·단위 붙은 숫자·밀린 칸·상태 기호·없는 묶음·위치 파일·제안 경로 면제·없는 명령·없는 스펙·0건 주장 2종·유령 항목·이스케이프 파이프·승인 번호·항목 이름 속 0건) 통과`);
}

const problems = (() => {
  if (process.argv.includes('--selftest')) { selftest(); return []; }
  return checkGap(liveInputs());
})();

if (problems.length > 0) {
  console.error(`[check-gap-claims] GAP 표가 사실과 다른 곳 ${problems.length}건:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nGAP 표는 "다음에 무엇을 할지" 를 고르는 근거다 — 낡은 표는 계획을 낡게 만든다.');
  process.exit(1);
}
if (!process.argv.includes('--selftest')) {
  console.log('[check-gap-claims] OK — 표 구조·상태 기호·묶음 번호·위치 파일·완료 기준 명령/스펙·요약 항목 전부 확인');
}
