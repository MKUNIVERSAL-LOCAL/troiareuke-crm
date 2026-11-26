#!/usr/bin/env node
/**
 * 기록 검증 가드 — 문서가 **확인할 수 없는 말**을 적지 못하게 한다 (283, CLAUDE.md §3·§5).
 *
 * 왜: 274~282 의 독립 리뷰가 찾아낸 결함 중 상당수는 코드가 아니라 **기록**이었다 —
 * "고쳤다" 고 적었지만 단언은 여전히 통과할 수 없는 모양이었고(277 M-1), "네 곳 전부" 라고
 * 적었지만 한 곳뿐이었고(279 M-2), "쓸이에 모두 들어 있다" 는 네 항목 중 셋이 사실과 달랐다(279 M-3).
 * 숫자도 묶음을 거듭할수록 낡았다("54모듈·229함수" 가 실제 231 이었다 — 279 에서 손으로 발견).
 * 사람이 매번 다시 세는 대신, **기계가 셀 수 있는 주장만 기계가 지킨다**.
 *
 * 검사 네 가지:
 *  ① 묶음 기록의 커밋 해시 — 로드맵의 `- [x] NNN — …` 항목(243 번부터 해시를 적는 규약, **가장 최근 묶음 하나는 면제** — 해시는 커밋 뒤에 적는다)마다
 *     `커밋 <7자 이상 hex>` 가 있고 그 커밋이 **이 저장소에 실재**해야 한다. 없으면 그 묶음의
 *     주장을 아무도 되짚을 수 없다.
 *  ② "지금 상태" 문서의 숫자 — 아래 CURRENT_DOCS 안의 `N모듈·M함수`·`N칸 중 M칸`·`lib-units N개`,
 *     그리고 **가장 빨리 낡는 세 가지**(291, 리뷰 M-4 / 294 에서 어순·개수까지): **문서가 말하는 자기 범위**
 *     `NNN~MMM`(끝 번호 = 로드맵의 마지막 묶음, 같은 줄의 `묶음 N개`·`N묶음` 은 **그 범위의 실제 묶음 수**).
 *     표시(개수 동반·앞의 "묶음"·"완료 묶음/묶음 범위/출장 기간/지점이 보는 변화")가 있는 자리만 본다 —
 *     298 에서 "표시 없으면 기본 검사" 로 뒤집어 봤으나 **역사 줄에 거짓 경고 10건**이 나 되돌렸다(아래 ⑥ 과 짝),
 *     `묶음 155~NNN(MMM개)`·`누계 155~NNN 묶음 MMM개`(로드맵이 스스로 적은 누계와 같아야 한다),
 *     `REVIEW-*.md N건`(실제 파일 수). 로드맵·REVIEW-* 처럼 날짜가 붙은 **문서 전체**는 그때의 사실이라
 *     검사하지 않는다 — 과거 기록을 고치는 것은 역사 조작이다.
 *     "지금 상태" 문서 **안에** 과거 숫자를 적고 싶으면 그 자리에 **"당시"** 를 함께 적는다
 *     (예: "11-24 당시 54모듈"). 리뷰 M-7 은 "날짜가 있는 줄을 건너뛰자" 고 했지만 그러면
 *     M-4 가 찾은 낡은 줄("출장 기간(11-25 저녁~) 218~285")이 **날짜 때문에 면제**된다 — 낡은 것을
 *     숨기는 쪽이 아니라, 과거라고 밝힌 자리만 면제한다.
 *  ③ 문서가 가리키는 파일 — 문서 안의 `docs/X.md`·`scripts/Y.mjs` 는 실재해야 한다(깨진 포인터 금지).
 *  ④ 리뷰 기록의 반영 표시 — `docs/REVIEW-*.md` 머리말(앞 3줄)에 "반영" 상태가 적혀 있어야 한다.
 *     조용히 묻힌 리뷰가 없다는 뜻이다.
 *  ⑥ 자기 범위 표시가 사라지지 않는가 — `NEXT-ACTION`·`OWNER-BRIEFING`·`MASTER-DEVELOPMENT-STATUS` 는
 *     **표시된 범위**("완료 묶음: NNN~MMM" 같은 것)를 하나 이상 가져야 한다(298, 리뷰 M-4). 표시를 지우고
 *     "지금까지 …를 끝냈습니다" 로 바꿔 적으면 ② 가 보지 못하므로, **표시 자체가 없어지는 것**을 막는다.
 *  ⑤ 버전·브랜치 — "지금 상태" 문서가 적은 `vX.Y.Z` 와 `feat/...` 브랜치 이름이 **실물과 같아야** 한다.
 *     291(리뷰 M-5): `MASTER-DEVELOPMENT-STATUS.md` 에는 `(package.json)` 표기가 **적어도 하나** 있어야 한다 —
 *     그 표기가 없으면 버전 검사가 **아무것도 보지 않는** 상태가 된다(마커를 안 적으면 검사 밖인 구조).
 *     286 에서 `MASTER-DEVELOPMENT-STATUS.md` 가 11-24 상태(v1.0.62·PR #56)에 멈춘 채 발견됐다 —
 *     CLAUDE.md 7절이 세션 시작에 읽으라고 하는 문서인데 그 사이 묶음 150개가 지났다. 사람이 아니라
 *     기계가 지켜야 하는 종류다(코드 버전은 package.json, 브랜치는 git 이 답을 안다).
 *
 * 사용: node scripts/check-docs-claims.mjs [--selftest]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROADMAP = 'docs/COMMERCIALIZATION-ROADMAP-2026-11-17.md';
/** 해시 규약이 시작된 묶음 — 그 앞은 기록 당시 규약이 없었다 */
const HASH_FROM = 243;
/** "지금 상태" 를 말하는 문서 — 숫자가 낡으면 읽는 사람이 틀린 상태를 믿는다 */
const CURRENT_DOCS = [
  'docs/GLOBAL-CRM-GAP-ANALYSIS.md',
  'docs/NEXT-ACTION.md',
  'docs/OWNER-APPROVAL-QUEUE.md',
  // 307: 브리핑은 날짜가 파일명에 있다 — 이름이 바뀌면 조용히 검사 밖이 되므로 글롭으로 잡는다
  // (301 이 검사 ⑥ 에서 같은 구멍을 메웠는데 이 목록은 그대로 박혀 있었다).
  // **가장 최근 것만** 본다 — 지난 브리핑은 그때의 상태를 적은 역사다(그것까지 "지금 상태" 로 검사하면
  // 과거 기록을 고치게 만든다. 298 이 뒤집기를 되돌린 것과 같은 이유다).
  ...fs.readdirSync(path.join(ROOT, 'docs')).filter(f => /^OWNER-BRIEFING-.*\.md$/.test(f)).sort().slice(-1).map(f => `docs/${f}`),
  'docs/MASTER-DEVELOPMENT-STATUS.md',
];

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** 로드맵에서 묶음 번호 → 그 줄 */
function batchLines(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^- \[x\] (\d+) — /.exec(line);
    if (m) out.push({ no: Number(m[1]), line });
  }
  return out;
}

/** 그 줄이 적어 둔 커밋 해시(없으면 null) */
function hashOf(line) {
  const m = /커밋 ([0-9a-f]{7,40})/.exec(line);
  return m ? m[1] : null;
}

/**
 * 그 자리가 "과거다" 라고 밝힌 자리인지 — **그 숫자 바로 앞**에 "당시" 가 있을 때만 과거 숫자다 (291, 리뷰 M-7).
 * 294(288~292 리뷰 M-5): 앞뒤 20자를 보던 탓에 **"11-24 당시 54모듈 → 지금 99모듈"** 처럼 적으면
 * 뒤의 **현재 숫자까지 함께 면제**됐다 — 가드가 존재하는 이유를 정면으로 비켜 간다. **앞쪽 24자만** 본다
 * (298 에서 `당시(11-24)`·`당시 기준` 까지 받아들이려고 12 → 24자로 넓혔다. 301, 리뷰 LOW-3: 주석이 12자로 남아 있었다).
 */
function markedPast(text, at) {
  // 298(리뷰 LOW-6): `당시(11-24) 54모듈`·`당시 기준 54모듈` 도 과거다 — 괄호·"기준" 까지 허용한다
  return /당시[\s)\]]*$|당시\s*\([^)]*\)\s*$|당시 기준\s*$/.test(text.slice(Math.max(0, at - 24), at));
}

/** 문서가 주장하는 숫자들 */
function claimedNumbers(text) {
  const out = { rules: [], testids: [], libUnits: [], ranges: [], cumulative: [], reviews: [] };
  const fresh = m => !markedPast(text, m.index, m[0].length);
  // 285(리뷰 M-2): 문구를 좁게 보던 탓에 `lib-units.spec.ts 160건`·`lib-units(165개)`·맨 `231함수` 가
  // 전부 가드 밖이었다. 283 이 기계가 보던 표현을 지우고 못 보는 표현만 남겨 한 묶음 뒤 낡은 적도 있다.
  for (const m of text.matchAll(/(\d+)\s*모듈/g)) if (fresh(m)) out.rules.push({ modules: Number(m[1]), fns: null, raw: m[0] });
  for (const m of text.matchAll(/(\d+)\s*함수/g)) if (fresh(m)) out.rules.push({ modules: null, fns: Number(m[1]), raw: m[0] });
  for (const m of text.matchAll(/(\d+)칸 중 (\d+)칸/g)) if (fresh(m)) out.testids.push({ total: Number(m[1]), covered: Number(m[2]), raw: m[0] });
  // 291(리뷰 M-4): 묶음 범위·누계·리뷰 건수 — 묶음마다 바뀌어 가장 빨리 낡는다
  for (const m of text.matchAll(/누계 155~(\d+) 묶음 (\d+)개|묶음 155~(\d+)\s*\((\d+)개\)/g)) {
    if (fresh(m)) out.cumulative.push({ end: Number(m[1] ?? m[3]), count: Number(m[2] ?? m[4]), raw: m[0] });
  }
  // 294(리뷰 M-4): 전에는 `묶음 NNN~MMM` 어순만 봐서 **"출장 기간에 218~290 묶음 73개"** 가 비켜 갔다.
  // 같은 줄에 "묶음" 이 있으면 범위로 보고, 같은 줄의 `묶음 N개`·`N묶음` 은 **그 범위의 묶음 수**와 맞춘다.
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes('묶음')) continue;
    // 298(293~296 리뷰 M-4): 294 는 **면제가 기본**이었다 — 자기 범위 표시 셋(개수 동반·앞의 "묶음"·힌트)
    // 중 하나도 없으면 검사하지 않았다. 그래서 "지금까지 218~290 을 끝냈습니다" 처럼 **조금만 다르게 쓰면
    // 낡은 주장이 그대로 통과**했다(리뷰가 샌드박스로 재현). 이제 "묶음" 이 있는 줄의 범위는 **기본으로 검사**하고,
    // **참조 표시**가 있는 자리만 면제한다 — 294 가 덫으로 고정한 거짓 경고 7건(리뷰·exe·주기)은 그 목록이 그대로 막는다.
    const SCOPE_HINT = /완료 묶음|묶음 범위|출장 기간|지점이 보는 변화|끝낸 묶음|마친 묶음|진행 묶음|지금까지|현재까지/;
    // 개수 표기는 **그 앞의 가장 가까운 범위**에만 붙인다 — 한 줄에 범위가 둘이면(`155~264 묶음 110개 … (263~265 리뷰)`)
    // 모두에 붙여 엉뚱한 자리를 "맞지 않는다" 고 말했다 (294, 넓히면서 생긴 거짓 경고)
    // `3~4묶음마다` 는 개수가 아니라 **주기**다 — 개수로 세면 엉뚱한 범위에 붙는다 (294)
    const counts = [...line.matchAll(/묶음 (\d+)개|(?<![~\d])(\d+)묶음(?!마다)/g)].map(c => ({ at: c.index, n: Number(c[1] ?? c[2]), raw: c[0] }));
    const ranges = [...line.matchAll(/(\d{3,4})\s*~\s*(\d{3,4})/g)]; // 298(리뷰 LOW-7): 네 자리가 되면 `1000~1002` 를 `000~100` 으로 읽었다
    for (const m of ranges) {
      if (/^\s*\(\d+개\)/.test(line.slice(m.index + m[0].length, m.index + m[0].length + 12))) continue; // 누계 표기는 cumulative 가 센다
      if (/누계 155~/.test(line.slice(Math.max(0, m.index - 6), m.index + 4))) continue;
      if (markedPast(line, m.index, m[0].length)) continue;
      const end = m.index + m[0].length;
      const after = counts.filter(c => c.at > m.index);
      // 개수는 **바로 뒤**(15자 안)에 붙은 것만 그 범위의 것이다 — "271~273 뒤 … 3~4묶음마다" 처럼 한 줄에
      // 멀리 떨어진 개수를 끌어다 쓰면 엉뚱한 자리를 "맞지 않는다" 고 말한다 (294)
      const near = after.length > 0 && after[0].at - end <= 15 && !ranges.some(r => r.index > m.index && r.index < after[0].at);
      const owned = near ? after[0] : null;
      // **자기 범위 표시**가 있는 자리만 본다 — 개수 동반·바로 앞의 "묶음"·앞 30자의 자기 범위 말.
      // 298 에서 "표시가 없으면 기본 검사" 로 뒤집어 봤더니 **역사 줄에 거짓 경고 10건**이 났다
      // (`(완료 278~282)`·`155~183 은 v1.0.62 로 릴리스됨`·갭 표의 `225~230`). 낡은 주장을 막으려고
      // 과거 기록을 고치게 만드는 것은 이 가드가 금지하는 바로 그 일이다(리뷰 M-7 과 같은 이유).
      // 301(297~299 리뷰 M-7): 298 은 이 자리에 "리뷰 M-4 의 걱정은 검사 ⑥ 에서 막는다" 고 적었는데 **사실과 다르다** —
      // ⑥ 은 "표시된 범위가 **하나라도** 있는지" 만 본다. 올바른 한 줄이 이미 있으면 ⑥ 은 만족되고, 같은 문서에
      // **표시 없는 낡은 자기 주장을 새로 적어도** 아무 검사가 없다. 그래서 자기 범위를 뜻하는 말을 넓혔다
      // (끝낸/마친 묶음·지금까지·현재까지·진행 묶음) — 그래도 "표시 없이 적으면 ② 밖" 이라는 한계는 남는다.
      const prefixed = /묶음\s*$/.test(line.slice(Math.max(0, m.index - 4), m.index));
      const hinted = SCOPE_HINT.test(line.slice(Math.max(0, m.index - 30), m.index));
      if (!owned && !prefixed && !hinted) continue;
      out.ranges.push({
        start: Number(m[1]), end: Number(m[2]), raw: m[0],
        count: owned ? owned.n : null,
        countRaw: owned ? owned.raw : null,
      });
    }
  }
  for (const m of text.matchAll(/REVIEW-\*\.md[^\d]{0,4}(\d+)\s*건/g)) if (fresh(m)) out.reviews.push({ count: Number(m[1]), raw: m[0] });
  // lib-units 뒤에 공백·괄호·`.spec.ts` 가 끼어도 센다(개·건 둘 다)
  for (const m of text.matchAll(/lib-units(?:\.spec\.ts)?[^\d]{0,4}(\d+)\s*(?:개|건)/g)) out.libUnits.push({ count: Number(m[1]), raw: m[0] });
  return out;
}

/** 지금 세어 나오는 값 */
function liveNumbers() {
  const run = args => {
    const r = spawnSync('node', args, { cwd: ROOT, encoding: 'utf8' });
    return (r.stdout || '') + (r.stderr || '');
  };
  const rules = /순수 규칙 (\d+)개 모듈, export 함수 (\d+)개/.exec(run(['scripts/check-rule-coverage.mjs']));
  const ids = /화면 칸 (\d+)개 중 스펙이 보는 것 (\d+)개/.exec(run(['scripts/check-testid-coverage.mjs']));
  const units = read('e2e/lib-units.spec.ts').split(/\r?\n/).filter(l => l.startsWith('test(')).length;
  const roadmap = read(ROADMAP);
  const newestBatch = Math.max(...batchLines(roadmap).map(l => l.no));
  // 누계는 **로드맵이 스스로 적은 마지막 값**을 쓴다 — 묶음 155~164 는 기록 형식이 달라(`- [x] NNN — ` 아님)
  // 전수 집계를 할 수 없다. 기계가 지키는 것은 "다른 문서가 로드맵과 다른 숫자를 말하지 않는 것" 이다.
  const cums = [...roadmap.matchAll(/누계 155~(\d+) 묶음 (\d+)개/g)];
  const lastCum = cums.length > 0 ? cums[cums.length - 1] : null;
  // 범위 안의 묶음 수는 셀 수 있다 — `- [x] NNN — ` 형식이 쓰이기 시작한 165 번부터 (294, 리뷰 M-4)
  const batchNos = batchLines(roadmap).map(l => l.no);
  const UNIFORM_FROM = 165;
  const countInRange = (start, end) => batchNos.filter(n => n >= start && n <= end).length;
  const reviewFiles = fs.readdirSync(path.join(ROOT, 'docs')).filter(x => /^REVIEW-.*\.md$/.test(x)).length;
  if (!rules || !ids) {
    // 이 가드는 다른 두 가드의 출력을 세므로, 그쪽이 실패하면 여기서 숫자를 읽을 수 없다.
    // 남의 실패를 떠안고 스택 트레이스로 끝내지 않고 **무엇을 먼저 고쳐야 하는지** 적는다 (285, 리뷰 LOW)
    console.error('[check-docs-claims] 숫자를 셀 수 없다 — 먼저 통과해야 하는 가드:');
    if (!rules) console.error('  - npm run check:rules (순수 규칙 커버리지)');
    if (!ids) console.error('  - npm run check:testids (화면 칸 커버리지)');
    console.error('  이 가드는 그 두 출력을 세어 "지금 상태" 문서의 숫자와 맞춥니다.');
    process.exit(2);
  }
  return {
    modules: Number(rules[1]), fns: Number(rules[2]), idTotal: Number(ids[1]), idCovered: Number(ids[2]), libUnits: units,
    newestBatch, cumCount: lastCum ? Number(lastCum[2]) : null, reviewFiles, countInRange, UNIFORM_FROM,
  };
}

function selftest() {
  const c = claimedNumbers('가드는 54모듈·231함수 를 센다. 화면 칸 222칸 중 217칸. lib-units 165개.');
  if (c.rules.length !== 2 || c.rules[0].modules !== 54 || c.rules[1].fns !== 231) { console.error(`[selftest] 모듈·함수 추출 실패: ${JSON.stringify(c.rules)}`); process.exit(1); }
  // 285(리뷰 M-2): 좁은 문구만 보던 세 형태도 센다
  const wide = claimedNumbers('e2e/lib-units.spec.ts 160건, lib-units(165개), 그리고 231함수');
  if (wide.libUnits.length !== 2 || wide.libUnits[0].count !== 160 || wide.libUnits[1].count !== 165) { console.error(`[selftest] lib-units 넓게 보기 실패: ${JSON.stringify(wide.libUnits)}`); process.exit(1); }
  if (!wide.rules.some(r => r.fns === 231)) { console.error('[selftest] 맨 함수 수 추출 실패'); process.exit(1); }
  if (c.testids.length !== 1 || c.testids[0].covered !== 217) { console.error('[selftest] 칸 추출 실패'); process.exit(1); }
  if (c.libUnits.length !== 1 || c.libUnits[0].count !== 165) { console.error('[selftest] lib-units 추출 실패'); process.exit(1); }
  const b = batchLines('- [x] 243 — 무언가 (11-26 10:00): 커밋 abc1234. 끝\n- [ ] 999 — 아직\n- [x] 100 — 옛 묶음 해시 없음');
  if (b.length !== 2 || b[0].no !== 243) { console.error(`[selftest] 묶음 줄 추출 실패: ${JSON.stringify(b.map(x => x.no))}`); process.exit(1); }
  if (hashOf(b[0].line) !== 'abc1234' || hashOf(b[1].line) !== null) { console.error('[selftest] 해시 추출 실패'); process.exit(1); }
  // 291(리뷰 M-4·M-7): 묶음 범위·누계·리뷰 건수와 "당시" 면제
  // 301(리뷰 M-7): 넓힌 자기 범위 말
  const widened = claimedNumbers('- 끝낸 묶음: 218~290');
  if (widened.ranges.length !== 1) { console.error('[selftest] 넓힌 자기 범위 말 덫 실패'); process.exit(1); }
  const n291 = claimedNumbers('묶음 218~290 진행. 묶음 155~290(136개). docs/REVIEW-*.md 31건.');
  if (n291.ranges.length !== 1 || n291.ranges[0].end !== 290) { console.error(`[selftest] 묶음 범위 추출 실패: ${JSON.stringify(n291.ranges)}`); process.exit(1); }
  // 294(리뷰 M-4): 어순이 반대인 "출장 기간에 218~290 묶음 73개" 도 범위·개수로 잡는다
  const wideOrder = claimedNumbers('출장 기간에 218~290 묶음 73개를 끝냈습니다.');
  if (wideOrder.ranges.length !== 1 || wideOrder.ranges[0].count !== 73) { console.error(`[selftest] 어순 반대 범위 덫 실패: ${JSON.stringify(wideOrder.ranges)}`); process.exit(1); }
  const noBatchWord = claimedNumbers('전화 218~290 사이로 연락');
  if (noBatchWord.ranges.length !== 0) { console.error('[selftest] 묶음 없는 줄 덫 실패'); process.exit(1); }
  // 294: 특정 묶음 묶음을 가리키는 **참조**는 자기 범위가 아니다 — 검사하지 않는다
  const ref = claimedNumbers('exe 재빌드(288~290 포함, 묶음 기록). 독립 리뷰(196~198) 반영.');
  if (ref.ranges.length !== 0) { console.error(`[selftest] 참조 면제 덫 실패: ${JSON.stringify(ref.ranges)}`); process.exit(1); }
  // 298(리뷰 M-4): 표시가 없는 범위는 ② 가 보지 않는다(역사 줄을 고치게 만들지 않으려고) —
  // 그 대신 검사 ⑥ 이 "표시된 범위가 문서에 하나도 없으면" 실패한다. 둘이 짝이다.
  // 301(리뷰 M-7): '지금까지' 는 이제 자기 범위 말이다 — 298 때 빠져나간 그 문장이 검사에 들어온다
  const nowChecked = claimedNumbers('지금까지 218~290 을 끝냈습니다(묶음 목록은 로드맵에).');
  if (nowChecked.ranges.length !== 1) { console.error('[selftest] 넓힌 말이 검사에 들어와야 한다'); process.exit(1); }
  // 그래도 아무 말도 없는 문장은 ② 밖이다 — 그 한계는 머리말에 적어 둔다
  const plain = claimedNumbers('그동안 218~290 을 했습니다(묶음 목록은 로드맵에).');
  if (plain.ranges.length !== 0) { console.error(`[selftest] 표시 없는 범위는 ② 밖이어야 한다: ${JSON.stringify(plain.ranges)}`); process.exit(1); }
  const marked = claimedNumbers('- **완료 묶음**: 218~290');
  if (marked.ranges.length !== 1) { console.error('[selftest] 표시된 범위 수집 실패'); process.exit(1); }
  // 298(리뷰 LOW-6·LOW-7)
  const past2 = claimedNumbers('당시(11-24) 54모듈 이었다');
  if (past2.rules.length !== 0) { console.error('[selftest] 당시(괄호) 덫 실패'); process.exit(1); }
  const past3 = claimedNumbers('당시 기준 54모듈 이었다');
  if (past3.rules.length !== 0) { console.error('[selftest] 당시 기준 덫 실패'); process.exit(1); }
  const four = claimedNumbers('묶음 1000~1002 진행');
  if (four.ranges.length !== 1 || four.ranges[0].end !== 1002) { console.error(`[selftest] 네 자리 묶음 덫 실패: ${JSON.stringify(four.ranges)}`); process.exit(1); }
  const mixedLine = claimedNumbers('- **완료 묶음**: 218~293 (PR #58). 리뷰 반영(285~287)·3~4묶음마다 exe');
  if (mixedLine.ranges.length !== 1 || mixedLine.ranges[0].end !== 293) { console.error(`[selftest] 한 줄에 섞인 참조 덫 실패: ${JSON.stringify(mixedLine.ranges)}`); process.exit(1); }
  const scoped = claimedNumbers('- **완료 묶음**: 218~293 (PR #58, 묶음 기록)');
  if (scoped.ranges.length !== 1 || scoped.ranges[0].end !== 293) { console.error(`[selftest] 자기 범위 덫 실패: ${JSON.stringify(scoped.ranges)}`); process.exit(1); }
  // 294(리뷰 M-5): "당시" 는 **그 숫자 앞**만 면제한다 — 뒤의 현재 숫자는 계속 검사
  const mixed = claimedNumbers('11-24 당시 54모듈 → 지금 99모듈');
  if (mixed.rules.length !== 1 || mixed.rules[0].modules !== 99) { console.error(`[selftest] 당시 범위 덫 실패: ${JSON.stringify(mixed.rules)}`); process.exit(1); }
  if (n291.cumulative.length !== 1 || n291.cumulative[0].count !== 136) { console.error(`[selftest] 누계 추출 실패: ${JSON.stringify(n291.cumulative)}`); process.exit(1); }
  if (n291.reviews.length !== 1 || n291.reviews[0].count !== 31) { console.error(`[selftest] 리뷰 건수 추출 실패: ${JSON.stringify(n291.reviews)}`); process.exit(1); }
  const past = claimedNumbers('11-24 당시 54모듈 이었다. 당시 묶음 155~285(131개) 였다.');
  if (past.rules.length !== 0 || past.cumulative.length !== 0) { console.error(`[selftest] "당시" 면제 실패: ${JSON.stringify(past)}`); process.exit(1); }
  const dated = claimedNumbers('11-25 저녁~ 묶음 218~285 를 했다');  // 날짜만 있으면 면제되지 않는다(M-4 가 찾은 자리)
  if (dated.ranges.length !== 1) { console.error('[selftest] 날짜만 있는 줄 면제 금지 실패'); process.exit(1); }
  // 291(리뷰 M-5): 브랜치 이름 뒤 마침표를 먹지 않는다
  const br = /feat\/[A-Za-z0-9_\/-]+(?:\.[A-Za-z0-9_\/-]+)*/.exec('브랜치 feat/post-v1.0.63-2026-11-25.');
  if (br[0] !== 'feat/post-v1.0.63-2026-11-25') { console.error(`[selftest] 브랜치 마침표 덫 실패: ${br[0]}`); process.exit(1); }
  // 307: 표 열 수 — 칸이 밀린 행을 잡고, 이스케이프한 파이프와 "표가 아닌 글" 은 잡지 않는다
  const tbl = tableProblems('| # | 요청 | 상태 |\n|---|---|---|\n| 1 | 가 | 나 |\n| 2 | 가 | 나 | 다 |', 'x.md');
  if (tbl.length !== 1 || !/칸이 4개다/.test(tbl[0])) { console.error('[selftest] 표 열 수 덫 실패: ' + JSON.stringify(tbl)); process.exit(1); }
  if (tableProblems('| # | 값 |\n|---|---|\n| 1 | data \\| jsonb |', 'x.md').length !== 0) { console.error('[selftest] 이스케이프 파이프 면제 덫 실패'); process.exit(1); }
  if (tableProblems('| 이건 표가 아니다 |\n그냥 글', 'x.md').length !== 0) { console.error('[selftest] 구분 줄 없는 표 면제 덫 실패'); process.exit(1); }
  // 309: 릴리스 단계 대조 — 지금 안내는 통과해야 하고, 빠진 단계·순서 어긋남은 잡아야 한다
  if (releaseStepProblems().length !== 0) { console.error('[selftest] 릴리스 단계 대조 실패: ' + releaseStepProblems().join(' / ')); process.exit(1); }
  const runnerSrc = "{ id: 'preflight' }, { id: 'checks' }, { id: 'build' }, { id: 'verify' }";
  const okBrief = '| 단계 |\n|---|\n| preflight |\n| checks |\n| build |\n| verify |';
  if (releaseStepProblems({ runner: runnerSrc, briefing: okBrief }).length !== 0) { console.error('[selftest] 단계 대조 거짓 경보'); process.exit(1); }
  const missBrief = '| 단계 |\n|---|\n| preflight |\n| checks |\n| verify |';
  if (!releaseStepProblems({ runner: runnerSrc, briefing: missBrief }).some(p => /build 가 안내에 없다/.test(p))) { console.error('[selftest] 빠진 단계 덫 실패'); process.exit(1); }
  const orderBrief = '| 단계 |\n|---|\n| checks |\n| preflight |\n| build |\n| verify |';
  if (!releaseStepProblems({ runner: runnerSrc, briefing: orderBrief }).some(p => /순서가 실제와 다르다/.test(p))) { console.error('[selftest] 단계 순서 덫 실패'); process.exit(1); }
  // 309: 서버 테스트 수 주장 — 인용문·"당시" 는 주장이 아니고, 맨 주장은 모은다
  const stc = serverTestClaims('서버 테스트 45개가 돈다.\n첫 실행에서 "서버 자동 테스트 0건" 을 잡았다.\n당시 서버 테스트 25개였다.', 'x.md');
  if (stc.length !== 1 || stc[0].n !== 45) { console.error('[selftest] 서버 테스트 주장 수집 덫 실패: ' + JSON.stringify(stc)); process.exit(1); }
  // 308: 칸이 **모자란** 행도 잡는다 — 상태 칸이 비어 "대기인지 완료인지" 가 사라진다
  const shortRow = tableProblems('| # | 내용 | 상태 |\n|---|---|---|\n| 1 | 가 |', 'x.md');
  if (shortRow.length !== 1 || !/칸이 2개다/.test(shortRow[0])) { console.error('[selftest] 모자란 칸 덫 실패: ' + JSON.stringify(shortRow)); process.exit(1); }
  console.log('[check-docs-claims] selftest OK — 덫 32개(릴리스 단계 3종·서버 테스트 주장·표 열 수·모자란 칸·이스케이프 파이프·표 아닌 글·넓힌 자기 범위 말·숫자 3종·넓은 표현 2종·묶음 해시·범위·누계·리뷰 건수·당시 면제 3종·날짜만 면제 금지·브랜치 마침표·어순 반대 범위·범위 개수·묶음 없는 줄·당시 범위·참조 면제·자기 범위·한 줄에 섞인 참조·표시 없는 범위는 ② 밖·표시된 범위·네 자리 묶음) 통과');
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const problems = [];

// ① 묶음 기록의 커밋 해시가 실재하는가
{
  const lines = batchLines(read(ROADMAP));
  // 해시는 묶음 커밋 **뒤에** 적는다(커밋하기 전에는 해시를 알 수 없다) — 그래서 **가장 최근 묶음 하나**는
  // 아직 해시가 없을 수 있다. 그 하나만 면제하고, 그 앞 묶음은 전부 해시가 있어야 한다 (283).
  const newest = Math.max(...lines.map(l => l.no));
  for (const { no, line } of lines) {
    if (no < HASH_FROM || no === newest) continue;
    const h = hashOf(line);
    if (!h) { problems.push(`${ROADMAP}: 묶음 ${no} 에 커밋 해시가 없다 — 그 묶음의 주장을 되짚을 수 없다`); continue; }
    // 301(리뷰 LOW-2): 해시를 두 번 적어 둔 줄이 네 개 있었다(기록 커밋이 이미 있던 해시를 또 붙였다).
    // `hashOf` 는 첫 매치만 보므로 조용히 통과했다 — 한 줄에 둘이면 실패한다.
    const hashCount = (line.match(/커밋 [0-9a-f]{7,40}/g) || []).length;
    if (hashCount > 1) problems.push(`${ROADMAP}: 묶음 ${no} 줄에 커밋 해시가 ${hashCount}개다 — 하나만 남기세요`);
    const r = spawnSync('git', ['cat-file', '-e', `${h}^{commit}`], { cwd: ROOT });
    if (r.status !== 0) { problems.push(`${ROADMAP}: 묶음 ${no} 의 커밋 ${h} 가 이 저장소에 없다`); continue; }
    // 리베이스로 버려진 커밋도 `cat-file -e` 는 통과한다 — 지금 HEAD 에서 닿는지까지 본다 (291, 리뷰 LOW-9)
    const reach = spawnSync('git', ['merge-base', '--is-ancestor', h, 'HEAD'], { cwd: ROOT });
    if (reach.status !== 0) { problems.push(`${ROADMAP}: 묶음 ${no} 의 커밋 ${h} 는 지금 브랜치에서 닿지 않는다(리베이스로 버려진 커밋일 수 있다)`); continue; }
    // 실재만 보면 **남의 커밋 해시**를 적어도 통과한다 — 제목에 그 묶음 번호가 있는지까지 본다 (285, 리뷰 LOW)
    const subject = (spawnSync('git', ['show', '-s', '--format=%s', h], { cwd: ROOT, encoding: 'utf8' }).stdout || '').trim();
    if (!new RegExp(`(^|[^0-9])${no}([^0-9]|$)`).test(subject)) {
      problems.push(`${ROADMAP}: 묶음 ${no} 이 적은 커밋 ${h} 의 제목에 그 번호가 없다 — "${subject.slice(0, 60)}"`);
    }
  }
}

// ② "지금 상태" 문서의 숫자가 지금 값과 같은가
{
  const live = liveNumbers();
  for (const rel of CURRENT_DOCS) {
    if (!fs.existsSync(path.join(ROOT, rel))) { problems.push(`${rel}: CURRENT_DOCS 목록에 있는데 파일이 없다`); continue; }
    const c = claimedNumbers(read(rel));
    for (const r of c.rules) {
      if (r.modules !== null && r.modules !== live.modules) problems.push(`${rel}: "${r.raw}" 가 낡았다 — 지금은 ${live.modules}모듈`);
      if (r.fns !== null && r.fns !== live.fns) problems.push(`${rel}: "${r.raw}" 가 낡았다 — 지금은 ${live.fns}함수`);
    }
    for (const t of c.testids) {
      if (t.total !== live.idTotal || t.covered !== live.idCovered) problems.push(`${rel}: "${t.raw}" 가 낡았다 — 지금은 ${live.idTotal}칸 중 ${live.idCovered}칸`);
    }
    for (const u of c.libUnits) {
      if (u.count !== live.libUnits) problems.push(`${rel}: "${u.raw}" 가 낡았다 — 지금은 lib-units ${live.libUnits}개`);
    }
    // 291(리뷰 M-4): 묶음 범위의 끝은 마지막 묶음이어야 한다("218~285" 로 멈춘 채 다섯 묶음이 지났다)
    for (const g of c.ranges) {
      if (g.start >= 155 && g.end !== live.newestBatch) problems.push(`${rel}: "${g.raw}" 가 낡았다 — 마지막 묶음은 ${live.newestBatch} (과거 범위면 "당시" 를 함께 적으세요)`);
      // 294(리뷰 M-4): 범위와 묶음 수를 같은 줄에 적었으면 **그 범위의 실제 묶음 수**와 같아야 한다
      if (g.count !== null && g.start >= live.UNIFORM_FROM) {
        const real = live.countInRange(g.start, g.end);
        if (g.count !== real) problems.push(`${rel}: "${g.raw} … ${g.countRaw}" 가 맞지 않는다 — 로드맵에 ${g.start}~${g.end} 묶음은 ${real}개`);
      }
    }
    for (const u of c.cumulative) {
      if (u.end !== live.newestBatch || (live.cumCount !== null && u.count !== live.cumCount)) {
        problems.push(`${rel}: "${u.raw}" 가 로드맵과 다르다 — 로드맵은 155~${live.newestBatch} 묶음 ${live.cumCount}개`);
      }
    }
    for (const v of c.reviews) {
      if (v.count !== live.reviewFiles) problems.push(`${rel}: "${v.raw}" 가 낡았다 — docs/REVIEW-*.md 는 ${live.reviewFiles}건`);
    }
  }
}

// ③ 문서가 가리키는 파일이 실재하는가
{
  const docs = fs.readdirSync(path.join(ROOT, 'docs')).filter(f => f.endsWith('.md'));
  for (const f of docs) {
    const text = read(`docs/${f}`);
    const seen = new Set();
    // 하위 폴더(`docs/archive/x.md`)도 본다 (285, 리뷰 LOW)
    for (const m of text.matchAll(/(?:docs\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md|scripts\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:mjs|cjs))/g)) {
      const rel = m[0];
      // 뒤에 (신설)·(예정)·(계획) 이 붙은 것은 **앞으로 만들 파일**을 적은 계획이다 — 깨진 포인터가 아니다
      if (/^`?\s*\((신설|예정|계획)\)/.test(text.slice(m.index + rel.length, m.index + rel.length + 20))) continue;
      if (seen.has(rel)) continue;
      seen.add(rel);
      if (!fs.existsSync(path.join(ROOT, rel))) problems.push(`docs/${f}: 가리키는 파일이 없다 — ${rel}`);
    }
  }
}

// ④ 리뷰 기록마다 반영 상태가 적혀 있는가
{
  const doneBatches = new Set(batchLines(read(ROADMAP)).map(l => l.no));
  for (const f of fs.readdirSync(path.join(ROOT, 'docs')).filter(x => /^REVIEW-.*\.md$/.test(x))) {
    const head = read(`docs/${f}`).split(/\r?\n/).slice(0, 3).join('\n');
    // '반영' 글자만 있으면 통과하던 것 → **상태를 읽을 수 있는 형태**를 요구한다 (285, 리뷰 LOW).
    // 옛 규약 "반영 165"(= 그 묶음에서 반영했다)도 상태를 말하므로 받아들인다.
    if (!/반영\s*완료|미반영|반영 범위|전부 반영|반영 \d+/.test(head)) {
      problems.push(`docs/${f}: 머리말(앞 3줄)에 반영 상태가 없다 — "반영 완료"·"미반영"·"반영 <묶음번호>" 중 하나로 적으세요`);
    }
    // "반영 NNN 예정" 인데 그 묶음이 **이미 끝났으면** 낡은 표시다 — 반영했는지 아무도 알 수 없다
    const planned = /반영 (\d+) 예정/.exec(head);
    if (planned && doneBatches.has(Number(planned[1]))) {
      problems.push(`docs/${f}: "반영 ${planned[1]} 예정" 인데 묶음 ${planned[1]} 은 이미 끝났다 — 반영 결과로 바꾸세요`);
    }
  }
}

// ⑤ "지금 상태" 문서의 버전·브랜치가 실물과 같은가 (286)
//
// 버전은 **"(package.json)" 이라고 적어 둔 자리만** 본다 — 그 괄호가 "이건 실물 버전이다" 는 약속이다.
// 문서는 지난 릴리스(v1.0.62)·다음 릴리스(v1.0.64)·옛 실사고(v1.0.34)도 적으므로, 보이는 버전을
// 전부 package.json 과 맞추면 거짓 경고만 쏟아진다(286 에서 실제로 7건 났다).
// 브랜치도 **지난 릴리스를 적어 둔 줄은 그때의 브랜치가 맞다** — 그 줄은 역사이므로 건너뛴다.
{
  const pkgVersion = JSON.parse(read('package.json')).version;
  const branch = (spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout || '').trim();
  const lineOf = (text, at) => {
    const from = text.lastIndexOf('\n', at) + 1;
    const to = text.indexOf('\n', at);
    return to === -1 ? text.slice(from) : text.slice(from, to);
  };
  for (const rel of CURRENT_DOCS) {
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    const text = read(rel);
    for (const m of text.matchAll(/v(\d+\.\d+\.\d+)\*{0,2}\(package\.json\)/g)) {
      if (m[1] !== pkgVersion) problems.push(`${rel}: "${m[0]}" 가 실물과 다르다 — package.json 은 v${pkgVersion}`);
    }
    // `.` 를 문자 집합에 두면 문장 끝 마침표까지 먹어 "브랜치가 다르다" 는 거짓 실패가 난다 (291, 리뷰 M-5)
    for (const m of text.matchAll(/feat\/[A-Za-z0-9_\/-]+(?:\.[A-Za-z0-9_\/-]+)*/g)) {
      if (!branch || branch === 'HEAD' || m[0] === branch) continue;
      if (/릴리스 완료|머지\(/.test(lineOf(text, m.index))) continue; // 지난 릴리스 기록 = 역사
      problems.push(`${rel}: 브랜치 "${m[0]}" 가 지금 브랜치와 다르다 — ${branch}`);
    }
  }
}

// ⑥ 자기 범위를 말하는 문서는 **표시된 범위**를 하나 이상 가져야 한다 (298, 293~296 리뷰 M-4)
//
// ② 는 "자기 범위 표시가 있는 자리" 만 본다 — 표시 없이 "지금까지 218~290 을 끝냈습니다" 로 바꿔 적으면
// 검사 밖이 된다(리뷰가 샌드박스로 재현). 표시를 **기본 검사**로 뒤집으면 역사 줄에 거짓 경고가 쏟아지므로,
// 대신 **표시 자체가 사라지는 것**을 막는다: 아래 문서들은 "완료 묶음: NNN~MMM"·"묶음 NNN~MMM"·
// "NNN~MMM 묶음 N개" 같은 표시된 범위를 적어도 하나 가져야 한다. 그 한 줄이 ② 의 검사 대상이다.
{
  // 301(리뷰 LOW-6): 브리핑은 날짜가 파일명에 있어 다음 브리핑으로 바뀌면 **조용히 검사 밖**이 됐다 —
  // 글롭으로 잡고, 하나도 없으면 그것 자체를 문제로 적는다(면제가 기본이 되지 않게).
  const briefings = fs.readdirSync(path.join(ROOT, 'docs')).filter(f => /^OWNER-BRIEFING-.*\.md$/.test(f)).map(f => `docs/${f}`);
  if (briefings.length === 0) problems.push('docs/OWNER-BRIEFING-*.md 가 없다 — 복귀 브리핑은 자기 범위를 적는 문서다(검사 ⑥)');
  const SCOPED_DOCS = ['docs/NEXT-ACTION.md', 'docs/MASTER-DEVELOPMENT-STATUS.md', ...briefings.slice(-1)];
  for (const rel of SCOPED_DOCS) {
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    if (claimedNumbers(read(rel)).ranges.length === 0) {
      problems.push(`${rel}: 자기 범위를 **표시된 형태**로 적은 자리가 없다 — "완료 묶음: NNN~MMM" 처럼 적으세요(그러면 검사 ② 가 그 범위를 지킵니다)`);
    }
  }
}


// ⑦ **표의 행 열 수가 머리글과 같다** (307)
//
// 왜: 2026-11-26 에 승인 요청 23~26 을 적을 때, 열이 10개인 행을 열이 4개인 "C. 외부 계약" 표 아래에
//     붙였다. 마크다운은 **뒤쪽 칸을 조용히 버리므로** 오너가 읽는 화면에서 그 네 항목의
//     추천·검증·**상태** 칸이 보이지 않았다(상태가 "대기" 인지조차 알 수 없었다).
//     글은 다 적혀 있는데 화면에서 사라지는 종류라, 사람 눈으로는 몇 주를 지나칠 수 있다.
// 한계: 열 수만 본다 — 칸 **내용**이 머리글과 맞는지는 보지 못한다(그건 리뷰가 본다).
function tableProblems(text, rel) {
  const out = [];
  const lines = text.split(/\r?\n/);
  const cellsOf = line => line.split(/(?<!\\)\|/).slice(1, -1).length;
  let header = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) { header = null; continue; }
    const next = (lines[i + 1] || '').trim();
    if (!header) {
      // 머리글은 **구분 줄**(|---|---|)이 바로 뒤에 와야 표다 — 그냥 파이프가 있는 글은 표가 아니다
      if (/^\|(\s*:?-{3,}:?\s*\|)+$/.test(next)) header = { cols: cellsOf(line), line: i + 1 };
      continue;
    }
    if (/^\|(\s*:?-{3,}:?\s*\|)+$/.test(line)) continue; // 구분 줄
    const cols = cellsOf(line);
    if (cols !== header.cols) {
      out.push(`${rel}:${i + 1} 표 행의 칸이 ${cols}개다(머리글 ${header.cols}개, ${header.line}줄) — 마크다운이 뒤쪽 칸을 버려 **화면에서 사라진다**`);
    }
  }
  return out;
}
{
  // 308: **docs 전체**를 본다(`archive/` 만 뺀다 — 폐기 기록은 그때 모습대로 둔다).
  // 307 은 "지금 상태" 다섯 문서만 봤는데, 전수로 세어 보니 **23줄이 더** 잘려 있었다 —
  // 로드맵 둘(세션마다 읽는 문서)에서 6줄은 칸이 **모자라** 상태·GAP 칸이 비어 있었고,
  // 리뷰 기록 9개에서 17줄은 글 안의 파이프(정규식·코드)가 칸을 나눠 **지적 내용이 잘려** 있었다.
  const mdFiles = (function walk(dir) {
    return fs.readdirSync(dir).flatMap(name => {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) return name === 'archive' ? [] : walk(full);
      return name.endsWith('.md') ? [path.relative(ROOT, full).replace(/\\/g, '/')] : [];
    });
  })(path.join(ROOT, 'docs'));
  for (const rel of mdFiles) problems.push(...tableProblems(read(rel), rel));
}


// ⑧ **복귀 안내의 릴리스 단계 목록이 실제 단계와 같은 순서인가** (309)
//
// 왜: 오너는 복귀 당일 이 표를 보고 순서대로 누른다. 287 에서 손으로 대조해 **단계 이름 하나가 실제와
//     다르고 배포 검증 항목 수가 틀린 것**을 찾았는데, 그 뒤로도 단계는 계속 바뀐다(302~305 가 검사를 더했다).
//     손 대조는 다음에 또 낡으므로 기계가 본다 — 단계 id 와 **순서**까지 맞춘다.
function releaseStepProblems(injected) {
  const out = [];
  const runner = 'scripts/release-run.mjs';
  if (!injected && !fs.existsSync(path.join(ROOT, runner))) return [`${runner} 가 없다 — 복귀 안내가 가리키는 릴리스 명령이다`];
  const real = [...(injected ? injected.runner : read(runner)).matchAll(/id: '([a-z]+)'/g)].map(m => m[1]);
  const briefings = injected ? ['INJECTED'] : fs.readdirSync(path.join(ROOT, 'docs')).filter(f => /^OWNER-BRIEFING-.*\.md$/.test(f)).sort();
  const rel = briefings.length > 0 ? `docs/${briefings[briefings.length - 1]}` : null;
  if (!rel) return out; // ⑥ 이 "브리핑이 없다" 를 이미 말한다
  const text = injected ? injected.briefing : read(rel);
  // 표에서 `| id | …` 꼴 첫 칸만 모은다 — 단계 표는 id 를 그대로 쓴다
  const listed = [...text.matchAll(/^\|\s*([a-z]{4,12})\s*\|/gm)].map(m => m[1]).filter(id => real.includes(id));
  if (listed.length === 0) {
    out.push(`${rel}: 릴리스 단계 표가 없다 — ${runner} 의 단계(${real.join('·')})를 순서대로 적으세요`);
    return out;
  }
  const missing = real.filter(id => !listed.includes(id));
  if (missing.length > 0) out.push(`${rel}: 릴리스 단계 ${missing.join('·')} 가 안내에 없다 — 오너가 그 단계를 모른 채 릴리스한다`);
  const order = listed.filter((id, i) => listed.indexOf(id) === i);
  const realOrder = real.filter(id => order.includes(id));
  if (order.join('>') !== realOrder.join('>')) {
    out.push(`${rel}: 릴리스 단계 순서가 실제와 다르다 — 안내 ${order.join('>')} vs 실제 ${realOrder.join('>')}`);
  }
  return out;
}
problems.push(...releaseStepProblems());

// ⑨ **"서버 테스트 N개" 는 러너가 세는 수와 같아야 한다** (309)
//
// 왜: 복귀 안내·GAP 표가 이 수를 적는데 302·305 에서 25 → 35 → 45 로 늘었고 안내는 25 에 멈춰 있었다.
//     `test(` 를 세는 방식으로는 맞출 수 없다(반복으로 만드는 덫 테스트가 있다) — **러너를 실제로 돌려** 센다.
//     주장이 없는 저장소에서는 돌리지 않는다(검사가 느려질 이유가 없다).
function serverTestClaims(text, rel) {
  const out = [];
  for (const m of text.matchAll(/서버(?: 자동)? 테스트 (\d+)(?:개|건)/g)) {
    if (markedPast(text, m.index)) continue;
    // 309: **인용문은 주장이 아니다** — "첫 실행에서 \"서버 자동 테스트 0건\" 을 잡았다" 처럼
    // 가드가 찾아낸 옛 문구를 그대로 적은 자리를 처음엔 낡은 주장으로 읽었다(거짓 경보 2건).
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const before = text.slice(lineStart, m.index);
    if ((before.match(/"/g) || []).length % 2 === 1) continue;
    out.push({ rel, raw: m[0], n: Number(m[1]) });
  }
  return out;
}
{
  const claims = [];
  for (const rel of CURRENT_DOCS) {
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    claims.push(...serverTestClaims(read(rel), rel));
  }
  if (claims.length > 0) {
    const r = spawnSync(process.execPath, ['scripts/run-server-tests.mjs'], { cwd: ROOT, encoding: 'utf8' });
    const m = `${r.stdout || ''}${r.stderr || ''}`.match(/^# pass (\d+)/m) || `${r.stdout || ''}`.match(/pass (\d+)/);
    if (!m) {
      problems.push('서버 테스트 수를 세지 못했다 — scripts/run-server-tests.mjs 출력에서 pass 수를 찾을 수 없다');
    } else {
      const live = Number(m[1]);
      for (const c of claims) {
        if (c.n !== live) problems.push(`${c.rel}: "${c.raw}" 가 낡았다 — 지금은 ${live}개(npm run test:server)`);
      }
    }
  }
}

// ⑤-2 "지금 상태" 문서에 버전 마커가 하나도 없으면 ⑤ 의 버전 검사가 비어 있다 (291, 리뷰 M-5)
{
  const STATUS = 'docs/MASTER-DEVELOPMENT-STATUS.md';
  if (fs.existsSync(path.join(ROOT, STATUS)) && !/\(package\.json\)/.test(read(STATUS))) {
    problems.push(`${STATUS}: 코드 버전을 "vX.Y.Z(package.json)" 형태로 적은 자리가 없다 — 그러면 버전 검사가 아무것도 보지 않는다`);
  }
}

if (problems.length > 0) {
  console.error(`[check-docs-claims] 확인할 수 없는 기록 ${problems.length}건:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('  → 기록을 사실로 고치세요(과거 날짜 기록은 그대로 두고, "지금 상태" 문서만 갱신합니다).');
  process.exit(1);
}
console.log('[check-docs-claims] OK — 묶음 해시 실재·지금 상태 숫자·문서 포인터·리뷰 반영 표시·버전/브랜치·자기 범위 표시 전부 확인');
