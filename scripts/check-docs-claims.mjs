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
 *  ⑬ **부분 집합 리뷰 수**(335) — "기록 N개(`docs/REVIEW-*.md` 중 NNN 번 이상을 다루는 것)" 는 파일 이름의
 *     첫 묶음 번호로 **세어** 맞춘다. ② 는 전체 건수만 봐서, 오너가 가장 먼저 읽는 브리핑 §1 에서
 *     이 수가 낡은 것을 못 봤다(335 가 손으로 찾았다 — 그래서 가드가 덮게 했다).
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
/** 일부러 비운 칸 — 이유가 사실이어야 한다 */
const EMPTY_CELL_ALLOWED = [
  { rel: 'docs/RESEARCH-MESSAGING-BILLING.md', line: 73, why: '요금 비교 표에서 해당 없는 칸을 비워 둔 자리(값이 없다는 뜻이 맞다)' },
];

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
  // 298(리뷰 LOW-6): `당시(11-24) 54모듈`·`당시 기준 54모듈` 도 과거다 — 괄호·"기준" 까지 허용한다.
  // 312: `당시 — 213개`·`당시, 213개` 처럼 **줄표·쉼표·콜론**이 끼면 못 읽어 거짓 실패가 났다
  // (한국어로 자연스러운 모양이다 — 문서를 가드에 맞춰 비틀게 만들지 않는다).
  return /당시[\s)\]—–\-:,·]*$|당시\s*\([^)]*\)[\s—–\-:,·]*$|당시 기준[\s—–\-:,·]*$/.test(text.slice(Math.max(0, at - 24), at));
}

/**
 * 면제·남은 수 주장(321) — 어느 가드의 수인지까지 고른다. 인용문·'당시'·기준 문구의 과거 표시는 주장이 아니다.
 *
 * 324(321~323 리뷰 M-4): 전에는 앞 220자에 `화면 칸`·`창 자리` 라는 **낱말**이 있으면 파생 수로 읽었다.
 * 그래서 "화면 칸 커버리지 작업 뒤, 승인 대기 결정 중 **남은 2개**는 다음 주에 처리한다" 처럼 주제가
 * 전혀 다른 수를 면제 수로 신고했다(리뷰가 심어 확인한 **거짓 경보**). 이제 **기준 문구**
 * (`N칸 중 M칸`·`N개 중 M자리`)가 앞에 실제로 있어야 파생 수로 보고, 가드는 **그 문구의 모양**으로 고른다 —
 * `칸` 쌍이면 화면 칸 가드, `자리` 쌍이면 창 가드다. 낱말 근접보다 좁고 분명하다.
 */
const EXEMPT_GUARDS = {
  testids: { script: 'scripts/check-testid-coverage.mjs', label: 'npm run check:testids' },
  modal: { script: 'scripts/check-modal-a11y.mjs', label: 'npm run check:modal-a11y' },
};
// 324: 굵게 표시(`**53자리**`)도 같은 기준 문구다 — 못 읽으면 앞 줄의 다른 쌍을 집어 가드를 잘못 고른다
const BASE_PAIR = /(\d+)칸 중 \*{0,2}(\d+)칸|(?:화면\s*)?칸 \*{0,2}(\d+)개 중 \*{0,2}(\d+)개|\*{0,2}(\d+)개 중 \*{0,2}(\d+)자리/g;
function exemptionClaims(text, rel) {
  const out = [];
  for (const m of text.matchAll(/(?:남은|면제(?:는)?)\s*(\d+)\s*(?:칸|자리|개)/g)) {
    if (markedPast(text, m.index)) continue;
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    if ((text.slice(lineStart, m.index).match(/"/g) || []).length % 2 === 1) continue;
    const before = text.slice(Math.max(0, m.index - 220), m.index);
    const base = [...before.matchAll(BASE_PAIR)].pop();
    if (!base) continue; // 기준 문구가 없으면 이 수는 커버리지 파생 수가 아니다(324)
    if (markedPast(text, m.index - before.length + base.index)) continue;
    const key = /자리/.test(base[0]) ? 'modal' : 'testids';
    out.push({ rel, raw: m[0], n: Number(m[1]), guard: { key, ...EXEMPT_GUARDS[key] } });
  }
  return out;
}

/** 창 자리 커버리지 기준 수 주장(324, 리뷰 M-5) — ② 는 `칸` 쌍만 봐서 `56개 중 53자리` 는 검사 밖이었다 */
function modalSlotClaims(text, rel) {
  const out = [];
  for (const m of text.matchAll(/\*{0,2}(\d+)\*{0,2}개 중 (?:게이트가 여는 것 )?\*{0,2}(\d+)\*{0,2}자리/g)) {
    if (markedPast(text, m.index)) continue;
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    if ((text.slice(lineStart, m.index).match(/"/g) || []).length % 2 === 1) continue;
    out.push({ rel, raw: m[0], total: Number(m[1]), covered: Number(m[2]) });
  }
  return out;
}

/** outbox 테스트 수 주장(321) */
function outboxClaims(text, rel) {
  const out = [];
  // 324(321~323 리뷰 M-1): `N/N` 만 보던 탓에 `test:outbox 9` (슬래시 없음)가 **세션 시작 문서에
  // 그대로 남아** 있었다 — 321 이 그 피해를 막겠다고 만든 검사가 같은 피해를 놓쳤다. 두 표기를 다 본다.
  for (const m of text.matchAll(/outbox[^\n]{0,40}?(\d+)\s*\/\s*(\d+)|test:outbox[`\s*]*(\d+)(?![\d/])/g)) {
    if (markedPast(text, m.index)) continue;
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    if ((text.slice(lineStart, m.index).match(/"/g) || []).length % 2 === 1) continue;
    out.push({ rel, raw: m[0].slice(0, 40), n: Number(m[2] ?? m[3]) });
  }
  return out;
}

/** 문서가 주장하는 숫자들 */
function claimedNumbers(text) {
  const out = { rules: [], testids: [], libUnits: [], ranges: [], cumulative: [], reviews: [], reviewsFrom: [] };
  const fresh = m => !markedPast(text, m.index, m[0].length);
  // 285(리뷰 M-2): 문구를 좁게 보던 탓에 `lib-units.spec.ts 160건`·`lib-units(165개)`·맨 `231함수` 가
  // 전부 가드 밖이었다. 283 이 기계가 보던 표현을 지우고 못 보는 표현만 남겨 한 묶음 뒤 낡은 적도 있다.
  for (const m of text.matchAll(/(\d+)\s*모듈/g)) if (fresh(m)) out.rules.push({ modules: Number(m[1]), fns: null, raw: m[0] });
  for (const m of text.matchAll(/(\d+)\s*함수/g)) if (fresh(m)) out.rules.push({ modules: null, fns: Number(m[1]), raw: m[0] });
  // 312: `N칸 중 M칸` 만 보던 탓에 **"화면 칸 222개 중 217개"**(NEXT-ACTION) 가 검사 밖이었다 —
  // 311 은 이 넓히기를 셀프테스트 라벨에만 적고 **실제로는 넣지 않았다**(라벨이 거짓이었다).
  // 317(312~315 리뷰 L-6): `칸 224개 중 219개`(앞의 "화면" 없음)·`화면칸`(붙여쓰기)도 같은 주장이다
  for (const m of text.matchAll(/(\d+)칸 중 (\d+)칸|(?:화면\s*)?칸 (\d+)개 중 (\d+)개/g)) {
    if (!fresh(m)) continue;
    const total = Number(m[1] ?? m[3]);
    const covered = Number(m[2] ?? m[4]);
    out.testids.push({ total, covered, raw: m[0] });
  }
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
  // 335: **부분 집합 주장** — "기록 28개(`docs/REVIEW-*.md` 중 218 번 이상을 다루는 것)".
  // 전체 건수와 다른 수라서 기존 검사가 보지 못했고, 오너가 가장 먼저 읽는 문서에서 낡아 있었다.
  for (const m of text.matchAll(/기록\s*(\d+)\s*개\*{0,2}\(`?docs\/REVIEW-\*\.md`?\s*중\s*(\d+)\s*번\s*이상/g)) {
    if (fresh(m)) out.reviewsFrom.push({ count: Number(m[1]), from: Number(m[2]), raw: m[0] });
  }
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
  // 335: 부분 집합 실측 — 파일 이름의 **첫 묶음 번호**가 N 이상인 것을 센다
  const reviewNames = fs.readdirSync(path.join(ROOT, 'docs')).filter(x => /^REVIEW-\d+-\d+-\d{4}-\d{2}-\d{2}\.md$/.test(x));
  const reviewsFromCount = from => reviewNames.filter(x => Number(x.replace('REVIEW-', '').split('-')[0]) >= from).length;
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
    newestBatch, cumCount: lastCum ? Number(lastCum[2]) : null, reviewFiles, reviewsFromCount, countInRange, UNIFORM_FROM,
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
  // 335(검사 ⑬): 부분 집합 주장("기록 N개(REVIEW-*.md 중 NNN 번 이상을 다루는 것)")을 뽑아내는가.
  // 오너가 가장 먼저 읽는 브리핑 §1 에서 이 수가 낡아 있었는데 전체 건수만 보던 ② 는 못 봤다.
  {
    const sub = claimedNumbers('이 기간 분만 **기록 28개**(`docs/REVIEW-*.md` 중 218 번 이상을 다루는 것)이고');
    if (sub.reviewsFrom.length !== 1 || sub.reviewsFrom[0].count !== 28 || sub.reviewsFrom[0].from !== 218) {
      console.error(`[selftest] 부분 집합 리뷰 수 추출 실패: ${JSON.stringify(sub.reviewsFrom)}`); process.exit(1);
    }
    const none = claimedNumbers('리뷰 기록은 `docs/REVIEW-*.md` 42건이고');
    if (none.reviewsFrom.length !== 0) { console.error('[selftest] 전체 건수를 부분 집합으로 오인'); process.exit(1); }
    const past = claimedNumbers('11-25 당시 기록 24개(`docs/REVIEW-*.md` 중 218 번 이상을 다루는 것)');
    if (past.reviewsFrom.length !== 0) { console.error('[selftest] "당시" 가 붙은 과거 수를 세었다'); process.exit(1); }
  }
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
  // 312: "화면 칸 N개 중 M개" 도 같은 주장으로 모은다(311 의 라벨이 이 덫 없이 그렇게 적혀 있었다)
  const idsForm = claimedNumbers('화면 칸 222개 중 217개가 스펙에 닿는다.');
  if (idsForm.testids.length !== 1 || idsForm.testids[0].total !== 222 || idsForm.testids[0].covered !== 217) {
    console.error('[selftest] 화면 칸 개수형 덫 실패: ' + JSON.stringify(idsForm.testids)); process.exit(1);
  }
  const idsPast = claimedNumbers('당시 화면 칸 222개 중 217개였다.');
  if (idsPast.testids.length !== 0) { console.error('[selftest] 개수형 "당시" 면제 덫 실패'); process.exit(1); }
  // 312: 줄표·쉼표가 끼어도 과거 표시다
  for (const dash of ['당시 — 화면 칸 222개 중 217개', '당시, 화면 칸 222개 중 217개', '당시(11-26) — 화면 칸 222개 중 217개']) {
    if (claimedNumbers(dash).testids.length !== 0) { console.error('[selftest] 줄표 끼운 "당시" 면제 덫 실패: ' + dash); process.exit(1); }
  }
  if (claimedNumbers('화면 칸 222개 중 217개').testids.length !== 1) { console.error('[selftest] 표시 없는 개수형은 검사한다 덫 실패'); process.exit(1); }
  // 311(리뷰 L-1): 코드 펜스 안의 표는 보기용이라 검사하지 않는다
  if (tableProblems('```markdown\n| # | 내용 | 상태 |\n|---|---|---|\n| 1 | 가 |\n```', 'x.md').length !== 0) { console.error('[selftest] 코드 펜스 면제 덫 실패'); process.exit(1); }
  // 310: 중간 칸이 비면 잡는다(마지막 칸이 비는 것은 "아직 없음" 이라 잡지 않는다)
  const midEmpty = tableProblems('| # | 내용 | 상태 |\n|---|---|---|\n| 1 |  | 미반영 |', 'x.md');
  if (midEmpty.length !== 1 || !/2번 칸이 비어 있다/.test(midEmpty[0])) { console.error('[selftest] 중간 빈 칸 덫 실패: ' + JSON.stringify(midEmpty)); process.exit(1); }
  if (tableProblems('| # | 내용 | 상태 |\n|---|---|---|\n| 1 | 가 |  |', 'x.md').length !== 0) { console.error('[selftest] 마지막 빈 칸 면제 덫 실패'); process.exit(1); }
  // 317(리뷰 L-6): 앞의 "화면" 이 없거나 붙여쓴 꼴도 모은다
  for (const form of ['칸 224개 중 219개', '화면칸 224개 중 219개']) {
    if (claimedNumbers(form).testids.length !== 1) { console.error('[selftest] 개수형 변형 덫 실패: ' + form); process.exit(1); }
  }
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
  // 340: '테스트' 라는 말 없이 "러너 **35건**" 으로 적힌 자리(GAP 0절 실사고) — 숫자 아닌 말은 세지 않는다
  const stc3 = serverTestClaims('서버 자동 테스트는 node 내장 러너 **35건**(225~230).\n러너 두 벌을 쓴다.', 'x.md');
  if (stc3.length !== 1 || stc3[0].n !== 35) { console.error('[selftest] 러너만 적힌 수 덫 실패: ' + JSON.stringify(stc3)); process.exit(1); }
  // 321(318~320 리뷰 H-2): 파생 수(면제·남은) 주장 수집 — 가드 고르기·인용문·기준 문구의 과거 표시
  const ex1 = exemptionClaims('화면 칸 227개 중 227개, 면제 0개다.', 'x.md');
  if (ex1.length !== 1 || ex1[0].n !== 0 || ex1[0].guard.key !== 'testids') { console.error('[selftest] 면제 수 수집 덫 실패: ' + JSON.stringify(ex1.map(c => [c.n, c.guard.key]))); process.exit(1); }
  const ex2 = exemptionClaims('창 자리 56개 중 42자리 덮임, 남은 14개는 사유를 적음', 'x.md');
  if (ex2.length !== 1 || ex2[0].guard.key !== 'modal') { console.error('[selftest] 창 자리 가드 고르기 덫 실패'); process.exit(1); }
  // 윗줄의 "화면 칸" 이 아랫줄 "창 자리" 주장을 가로채지 않는다(표의 이웃 줄에서 실제로 그랬다)
  const ex3 = exemptionClaims('| check:testids | 화면 칸 227개 중 227개 |\n| check:modal-a11y | 창 자리 56개 중 42자리, 남은 14개 |', 'x.md');
  if (ex3.length !== 1 || ex3[0].guard.key !== 'modal') { console.error('[selftest] 가장 가까운 가드 덫 실패: ' + JSON.stringify(ex3.map(c => c.guard.key))); process.exit(1); }
  // 인용문·기준 문구가 과거로 표시된 자리는 주장이 아니다
  if (exemptionClaims('화면 칸 기록의 "남은 5칸" 을 고쳤다', 'x.md').length !== 0) { console.error('[selftest] 인용문 면제 덫 실패'); process.exit(1); }
  if (exemptionClaims('276~277 당시 — 화면 칸 213개 중 204개가 닿고, 남은 9개는 사유를 적어 둔다', 'x.md').length !== 0) { console.error('[selftest] 당시 물려받기 덫 실패'); process.exit(1); }
  if (exemptionClaims('승인 대기 남은 3개', 'x.md').length !== 0) { console.error('[selftest] 다른 주제 면제 덫 실패'); process.exit(1); }
  // 324(321~323 리뷰 M-4): **기준 문구가 없으면 파생 수가 아니다** — 낱말 근접만 보던 탓에
  // "화면 칸 커버리지 작업 뒤, 승인 대기 결정 중 남은 2개는…" 을 면제 수로 신고했다(거짓 경보)
  if (exemptionClaims('화면 칸 커버리지 작업 뒤, 승인 대기 결정 중 남은 2개는 다음 주에 처리한다.', 'x.md').length !== 0) { console.error('[selftest] 기준 문구 없는 수 덫 실패'); process.exit(1); }
  // 324(리뷰 M-4): 기준 문구가 **굵게** 적히면 앞 줄의 다른 쌍을 집어 **가드를 잘못 골랐다**
  const exBold = exemptionClaims('| check:testids | 227칸 중 227칸 덮임 |\n| check:modal-a11y | 창 자리 56개 중 **53자리** 덮임, 남은 3개는 사유를 적음 |', 'x.md');
  if (exBold.length !== 1 || exBold[0].guard.key !== 'modal') { console.error('[selftest] 굵은 기준 문구 덫 실패: ' + JSON.stringify(exBold.map(c => c.guard.key))); process.exit(1); }
  // 324(리뷰 M-5): 창 자리 **기준 수**도 주장이다(② 는 칸 쌍만 본다)
  const ms = modalSlotClaims('창 자리 56개 중 게이트가 여는 것 53자리\n창 자리 56개 중 **51자리** 덮임\n289 당시 — 56개 중 42자리', 'x.md');
  if (ms.length !== 2 || ms[0].covered !== 53 || ms[1].covered !== 51) { console.error('[selftest] 창 자리 기준 수 덫 실패: ' + JSON.stringify(ms)); process.exit(1); }
  // 324(리뷰 M-1): `test:outbox 9` (슬래시 없음)도 주장이고, 명령 이름이 아닌 글은 아니다
  const ob2 = outboxClaims('· test:updater · test:outbox 9 · mobile:prepare\nSQL 계약 10건 + outbox ⑩~⑫ 로 고정했다\n24(outbox 합치기 키 — 246 리뷰)', 'x.md');
  if (ob2.length !== 1 || ob2[0].n !== 9) { console.error('[selftest] 맨 outbox 수 덫 실패: ' + JSON.stringify(ob2)); process.exit(1); }
  // 324(리뷰 M-2): "러너 테스트 45개"·"지금은 45개)" 도 서버 테스트 수 주장이다
  const st2 = serverTestClaims('node 내장 러너 테스트 **45개**가 돈다.\n서버 테스트 도입(당시 25개, 지금은 45개)', 'x.md');
  if (st2.length !== 2 || st2.some(c => c.n !== 45)) { console.error('[selftest] 넓힌 서버 테스트 수 덫 실패: ' + JSON.stringify(st2)); process.exit(1); }
  // 321(리뷰 M-6): outbox 수 주장
  const ob = outboxClaims('npm run test:outbox  # 12/12\n당시 outbox 9/9 였다', 'x.md');
  if (ob.length !== 1 || ob[0].n !== 12) { console.error('[selftest] outbox 주장 수집 덫 실패: ' + JSON.stringify(ob)); process.exit(1); }
  // 308: 칸이 **모자란** 행도 잡는다 — 상태 칸이 비어 "대기인지 완료인지" 가 사라진다
  const shortRow = tableProblems('| # | 내용 | 상태 |\n|---|---|---|\n| 1 | 가 |', 'x.md');
  if (shortRow.length !== 1 || !/칸이 2개다/.test(shortRow[0])) { console.error('[selftest] 모자란 칸 덫 실패: ' + JSON.stringify(shortRow)); process.exit(1); }
  console.log(`[check-docs-claims] selftest OK — 덫(코드 펜스·화면 칸 개수형 2종·줄표 끼운 당시 3종·표시 없는 개수형·중간 빈 칸 2종·릴리스 단계 3종·서버 테스트 주장·표 열 수·모자란 칸·이스케이프 파이프·표 아닌 글·넓힌 자기 범위 말·숫자 3종·넓은 표현 2종·묶음 해시·범위·누계·리뷰 건수·당시 면제 3종·날짜만 면제 금지·브랜치 마침표·어순 반대 범위·범위 개수·묶음 없는 줄·당시 범위·참조 면제·자기 범위·한 줄에 섞인 참조·표시 없는 범위는 ② 밖·표시된 범위·네 자리 묶음·면제 수 6종·outbox 수·기준 문구 없는 수·굵은 기준 문구·창 자리 기준 수·맨 outbox 수·넓힌 서버 테스트 수·러너만 적힌 수·부분 집합 리뷰 수 3종) 통과`);
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
    // 335(검사 ⑬): 부분 집합 주장도 센다
    for (const v of c.reviewsFrom) {
      const real = live.reviewsFromCount(v.from);
      if (v.count !== real) problems.push(`${rel}: "${v.raw}…" 가 낡았다 — ${v.from} 번 이상을 다루는 리뷰 기록은 ${real}개`);
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
  const cellsOf = line => line.split(/(?<!\\)\|/).slice(1, -1);
  let header = null;
  let inFence = false; // 311(303~308 리뷰 L-1): ``` 펜스 안의 "표" 는 보기용 예시다 — 거짓 경보였다
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (/^```/.test(line)) { inFence = !inFence; header = null; continue; }
    if (inFence) continue;
    if (!line.startsWith('|')) { header = null; continue; }
    const next = (lines[i + 1] || '').trim();
    if (!header) {
      // 머리글은 **구분 줄**(|---|---|)이 바로 뒤에 와야 표다 — 그냥 파이프가 있는 글은 표가 아니다
      if (/^\|(\s*:?-{3,}:?\s*\|)+$/.test(next)) header = { cols: cellsOf(line).length, line: i + 1 };
      continue;
    }
    if (/^\|(\s*:?-{3,}:?\s*\|)+$/.test(line)) continue; // 구분 줄
    const cells = cellsOf(line);
    if (cells.length !== header.cols) {
      out.push(`${rel}:${i + 1} 표 행의 칸이 ${cells.length}개다(머리글 ${header.cols}개, ${header.line}줄) — 마크다운이 뒤쪽 칸을 버려 **화면에서 사라진다**`);
      continue;
    }
    // 310(303~308 리뷰 H-1): 칸 수만 맞으면 통과하던 탓에 **뜻이 어긋난 줄**을 놓쳤다 — 308 이 파이프를
    // 거꾸로 이스케이프해 수정 방향 칸이 비고 상태 칸에 본문 800자가 들어간 줄이 여덟 개 있었다.
    // 마지막이 아닌 칸이 비면 읽는 사람에게 "그 칸은 내용이 없다" 는 거짓이 된다.
    const emptyAt = cells.slice(0, -1).findIndex(c => c.trim() === '');
    if (emptyAt >= 0 && !EMPTY_CELL_ALLOWED.some(a => a.rel === rel && a.line === i + 1)) {
      out.push(`${rel}:${i + 1} 표 행의 ${emptyAt + 1}번 칸이 비어 있다 — 칸이 밀렸는지 보세요(일부러 비운 칸이면 EMPTY_CELL_ALLOWED 에 이유를 적으세요)`);
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
  // 340: 324 가 넓힌 뒤에도 "node 내장 러너 **35건**"(테스트라는 말이 없는 모양)이 남아 GAP 0절이
  //      실측 47 과 어긋난 채 **같은 문서의 Q-3 칸과 모순**이었다. 이제 '러너' 뒤에 바로 수가 와도 센다.
  // 324(321~323 리뷰 M-2): 붙어 있는 "서버 테스트 N개" 만 보던 탓에 "node 내장 러너 테스트 **45개**"·
  // "서버 테스트 도입(당시 25개, **지금은 45개**)" 두 줄이 실측 47 과 어긋난 채 남아 있었다.
  for (const m of text.matchAll(/서버(?: 자동)? 테스트 (\d+)(?:개|건)|러너(?: 테스트)? \*{0,2}(\d+)\*{0,2}\s*(?:개|건)|지금은 \*{0,2}(\d+)\*{0,2}개\)/g)) {
    if (markedPast(text, m.index)) continue;
    // 309: **인용문은 주장이 아니다** — "첫 실행에서 \"서버 자동 테스트 0건\" 을 잡았다" 처럼
    // 가드가 찾아낸 옛 문구를 그대로 적은 자리를 처음엔 낡은 주장으로 읽었다(거짓 경보 2건).
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const before = text.slice(lineStart, m.index);
    if ((before.match(/"/g) || []).length % 2 === 1) continue;
    out.push({ rel, raw: m[0], n: Number(m[1] ?? m[2] ?? m[3]) });
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

// ⑩ **"단추 N개·입력칸 M개" 는 장식 UI 가드가 세는 수와 같아야 한다** (317, 312~315 리뷰 L-9)
//
// 왜: 314 가 적은 `단추 721개·입력칸 239개` 는 **주석 안의 태그를 세고 있었다**(316 에서 717·238 로,
//     317 에서 태그 탐색을 고쳐 717·235 로 바뀌었다). 어떤 가드도 이 수를 보지 않아 두 묶음을 지나 틀린
//     채였다 — 이제 가드를 돌려 센 수와 맞춘다(주장이 없으면 돌리지 않는다).
{
  const claims = [];
  for (const rel of CURRENT_DOCS) {
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    const text = read(rel);
    for (const m of text.matchAll(/단추 (\d+)개·입력칸 (\d+)개/g)) {
      if (markedPast(text, m.index)) continue;
      claims.push({ rel, raw: m[0], buttons: Number(m[1]), inputs: Number(m[2]) });
    }
  }
  if (claims.length > 0) {
    const r = spawnSync(process.execPath, ['scripts/check-decorative.mjs'], { cwd: ROOT, encoding: 'utf8' });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const m = out.match(/단추 (\d+)개·입력칸 (\d+)개/);
    if (!m) {
      problems.push('장식 UI 가드의 출력에서 단추·입력칸 수를 찾지 못했다 — npm run check:decorative 를 먼저 보세요');
    } else {
      const [, b, i] = m;
      for (const c of claims) {
        if (c.buttons !== Number(b) || c.inputs !== Number(i)) {
          problems.push(`${c.rel}: "${c.raw}" 가 낡았다 — 지금은 단추 ${b}개·입력칸 ${i}개(npm run check:decorative)`);
        }
      }
    }
  }
}

// ⑪ **"면제 N개"·"남은 N칸/자리" 는 그 가드가 세는 수와 같아야 한다** (321, 318~320 리뷰 H-2)
//
// 왜: ② 는 `N칸 중 M칸` **두 수만** 봤다. 그래서 거기서 파생되는 "남은 K칸" 은 검사 밖이었고,
//     319·320 이 네 칸을 덮은 뒤에도 오너가 읽는 문서 셋이 **"남은 5칸은 승인·서버 선행"** 이라고
//     적고 있었다 — 승인 결정 문서가 이미 끝난 일을 기다리라고 말한 셈이다. 같은 가드 구멍으로
//     지난 두 리뷰의 HIGH 와 같은 종류가 또 통과했다. 파생 수도 함께 센다.
//     주의 둘: ① 같은 말이 **다른 가드**에도 쓰인다(화면 칸 / 창 자리) — 앞 글을 보고 가드를 고른다.
//     ② 파생 수는 **기준 문구("N칸 중 M칸")의 '당시' 표시를 물려받는다** — 그 기준이 과거로 표시돼
//     있으면 파생 수도 과거다(아니면 276~277 당시 기록이 거짓 실패가 된다).
{
  const claims = [];
  for (const rel of CURRENT_DOCS) {
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    claims.push(...exemptionClaims(read(rel), rel));
  }
  const counted = new Map();
  for (const c of claims) {
    if (!counted.has(c.guard.key)) {
      const r = spawnSync(process.execPath, [c.guard.script], { cwd: ROOT, encoding: 'utf8' });
      const out = `${r.stdout || ''}${r.stderr || ''}`;
      const m = out.match(/사유를 적어 둔 (\d+)개/);
      counted.set(c.guard.key, m ? Number(m[1]) : null);
    }
    const now = counted.get(c.guard.key);
    if (now === null) {
      problems.push(`${c.guard.label} 출력에서 면제 수를 찾지 못했다 — 그 명령을 먼저 보세요`);
    } else if (c.n !== now) {
      problems.push(`${c.rel}: "${c.raw}" 가 낡았다 — 지금 면제는 ${now}개(${c.guard.label})`);
    }
  }
}

// ⑪-2 **"창 자리 N개 중 M자리" 도 창 가드가 세는 수와 같아야 한다** (324, 321~323 리뷰 M-5)
//
// 왜: H-2 가 세운 문제는 "파생 수를 아무 가드도 보지 않는다" 였는데 321 이 막은 것은 `남은 N개` 뿐이었다.
//     ② 는 `N칸 중 M칸` 모양만 보므로 `56개 중 53자리` 는 그대로 검사 밖이었고(리뷰가 51자리로
//     바꿔 심어도 통과하는 것을 확인했다), 그 수는 오너 브리핑 가드 표와 상태 문서 양쪽에 적혀 있다.
{
  const claims = [];
  for (const rel of CURRENT_DOCS) {
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    claims.push(...modalSlotClaims(read(rel), rel));
  }
  if (claims.length > 0) {
    const r = spawnSync(process.execPath, ['scripts/check-modal-a11y.mjs'], { cwd: ROOT, encoding: 'utf8' });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const m = out.match(/창 자리 (\d+)개 중 게이트가 여는 것 (\d+)자리/);
    if (!m) {
      problems.push('창 접근성 가드의 출력에서 창 자리 수를 찾지 못했다 — npm run check:modal-a11y 를 먼저 보세요');
    } else {
      for (const c of claims) {
        if (c.total !== Number(m[1]) || c.covered !== Number(m[2])) {
          problems.push(`${c.rel}: "${c.raw}" 가 낡았다 — 지금은 ${m[1]}개 중 ${m[2]}자리(npm run check:modal-a11y)`);
        }
      }
    }
  }
}

// ⑫ **"outbox N/N" 은 그 테스트가 세는 수와 같아야 한다** (321, 318~320 리뷰 M-6)
//
// 왜: 재개 절차 문서가 `npm run test:outbox  # 9/9` 라고 적고 있었는데 실측은 **12/12** 였다.
//     다음 세션이 처음 읽는 문서라 "뭔가 바뀌었나" 로 오해할 자리고, 어떤 가드도 이 수를 보지 않았다.
{
  const claims = [];
  for (const rel of CURRENT_DOCS) {
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    claims.push(...outboxClaims(read(rel), rel));
  }
  if (claims.length > 0) {
    const r = spawnSync(process.execPath, ['scripts/test-nas-outbox.mjs'], { cwd: ROOT, encoding: 'utf8' });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const m = out.match(/(\d+)\/(\d+)/);
    if (!m) {
      problems.push('NAS 아웃박스 테스트 출력에서 개수를 찾지 못했다 — npm run test:outbox 를 먼저 보세요');
    } else {
      for (const c of claims) {
        if (c.n !== Number(m[2])) {
          problems.push(`${c.rel}: "${c.raw}" 가 낡았다 — 지금은 ${m[1]}/${m[2]}(npm run test:outbox)`);
        }
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
