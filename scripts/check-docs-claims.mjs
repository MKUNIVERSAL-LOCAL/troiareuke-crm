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
 *  ⑭ **오너 브리핑의 품질 장치 표**(341, 335~340 리뷰 M-2) — `scripts/gate-light.mjs` 가 돌리는 `check:*` 가
 *     브리핑 §5 표에 **빠지지 않았는가**. 그 절은 오너가 "무엇이 기계로 막히나" 를 읽는 자리인데,
 *     335 가 세 줄을 더한 바로 뒤 묶음에서 `check:e2e-conv` 가 또 빠졌다(`check:routes`·`check:distribution` 은
 *     처음부터 없었다). ⑬ 은 **수**만 보고 **빠진 줄**은 보지 못한다.
 *  ⑮ **테스트 exe 빌드 시각**(341, 335~340 리뷰 M-6) — "테스트 exe … MM-DD HH:MM/HH:MM" 는
 *     `release`·`release-admin` 의 `win-unpacked/resources/app.asar` 수정 시각과 같아야 한다
 *     (경로를 글롭으로 적으면 별표와 슬래시가 이 주석을 닫아 버린다 — 341 에서 겪었다). 세 묶음 연속
 *     낡아 있었다(11-26 08:04·11-27 04:31 이라고 적혀 있었고 실제는 11-28 01:06/01:07).
 *     asar 가 없는 환경에서는 건너뛴다.
 *  ⑯ **코어 잠금 문서의 표 ↔ 정본**(353, 349~351 리뷰가 승인한 경계선) — `docs/CORE-LOCK.md` 의 보호 대상
 *     표에 적힌 경로 집합이 `scripts/core-lock.mjs` 의 `CORE_FILES`+`CORE_DIRS` 와 **같아야** 한다.
 *     350 이 이 표에서 배포 관련 **세 파일이 빠진 것**을 손으로 찾았다 — 표만 본 세션은 "잠금이 아니다"
 *     라고 믿고 코어를 고치려 든다(훅이 막지만 문서가 거짓을 말한 것이다). 반대 방향도 본다:
 *     잠기지 않은 파일을 잠금으로 적으면 아무도 그 파일을 고치지 않는다(352 가 겪은 M-3 의 이웃).
 *  ⑰ **브리핑 §4 가 선언한 범위 ↔ 그 표가 덮는 묶음 집합**(353, 349~351 리뷰 M-1) — 머리말이
 *     `(218~352, …)` 라고 적으면 표는 그 범위를 **빠짐없이** 덮어야 한다. 349 가 이 결함을 고쳤는데
 *     **한 묶음 뒤에 재발**했다(350·351 이 머리말 수만 올려 42개가 어디에도 없었다). 한 줄로 덮는
 *     행("위 행에 없는 나머지 전부")이 있으면 그 행의 범위가 머리말과 같아야 하고, 없으면 열거가
 *     완전해야 한다. 표에 적힌 번호가 **로드맵에 없는 묶음**이거나 머리말 범위를 벗어나는 것도 막는다.
 *  ⑱ **로드맵이 적은 시각 ↔ git 이 아는 커밋 시각**(354) — 묶음 줄 `(MM-DD HH:MM)` 과 재검증 줄의
 *     시각은 그 묶음이 적어 둔 커밋의 시각과 맞아야 한다. 353 에서 전수로 재니 **27곳**이 어긋나 있었고
 *     가장 심한 자리는 **3시간 39분**이었다(342 부터 벌어졌다 — 시계를 읽지 않고 더해 적었다).
 *     규칙이 비대칭인 이유: 묶음 줄은 **커밋하기 직전에** 적으므로 커밋이 뒤여야 한다(검사·푸시가
 *     사이에 든다 → 뒤로 20분까지). 거꾸로 **적은 시각이 커밋보다 뒤**면 아직 오지 않은 시각을
 *     적은 것이라 반올림 몫 5분만 둔다. 해시가 없는 줄(243 번 이전)은 git 에 물을 것이 없어 건너뛴다.
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
// ⑯ 은 **코드를 정본으로** 본다 — 문서를 문서와 맞추면 둘이 같이 낡는다(350 이 그 상태였다).
import { CORE_FILES, CORE_DIRS } from './core-lock.mjs';
// 363: 묶음 줄 삽입기의 덫도 여기서 함께 돈다 — 그 lib 이 지키는 것이 바로 이 로드맵이다.
import { selftest as insertSelftest } from './lib/insert-batch-line.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROADMAP = 'docs/COMMERCIALIZATION-ROADMAP-2026-11-17.md';
/** 해시 규약이 시작된 묶음 — 그 앞은 기록 당시 규약이 없었다 */
const HASH_FROM = 243;
// ⑱ 시각 대조의 허용 몫 (354) — 검사 블록이 최상위에서 바로 도므로 선언이 위에 있어야 한다
// 361(355~359 리뷰 L-5): 5분은 **잘못 적힌 창 셋을 덮고 있었다**(묶음 258·340·재검증 340 — 창이
// 커밋 시각을 아예 포함하지 않았다). 그 셋을 실측으로 고치고 몫을 2로 줄였다. 실측 분포는
// -4~+5분이고 -1(34줄)·-2(13줄)은 "커밋한 뒤 1~2분 안에 시각을 적은" 자리라 남긴다 —
// 지어낸 시각은 그보다 멀다(360 에서 내가 낸 것이 -5분이었다).
const TIME_BEFORE = 2;   // 적은 시각이 커밋보다 뒤여도 되는 몫(적는 순서·반올림)
const TIME_AFTER = 20;   // 커밋이 적은 시각보다 뒤일 수 있는 몫(검사·푸시가 사이에 든다)
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
/**
 * 로드맵이 적은 **모든 묶음 번호** — 155~164 는 `- [x] 155 PHASE 4 1/5 — …` 꼴이라
 * `batchLines()`(`- [x] NNN — `)로는 세어지지 않는다. 341: 누계를 실측하려고 느슨한 모양으로 센다.
 */
function allBatchNos(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    // 347(리뷰 L-1): 세 자리만 보면 네 자리 묶음(1000~)을 못 세고, 그 번호들이 "빠진 번호" 로 신고된다.
    // 같은 파일이 298 에서 범위 정규식으로 이미 겪은 종류다.
    const m = /^- \[x\] (\d{3,4})\b/.exec(line);
    // 347: 네 자리를 열면 `- [x] 2026 …` 같은 **연도**가 묶음으로 세어진다(덫이 그 자리를 지킨다).
    // 묶음 번호는 100~1999 로 본다 — 2000 이상은 연도다.
    if (m && Number(m[1]) < 2000) out.push(Number(m[1]));
  }
  return [...new Set(out)];
}

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
  // 347: **굵게 표시**가 끼어도 과거다("**11-25 당시** 테스트 exe …") — 312 가 줄표·쉼표에 넓힌 것과 같은 이유.
  return /당시[\s)\]—–\-:,·*]*$|당시\s*\([^)]*\)[\s—–\-:,·*]*$|당시 기준[\s—–\-:,·*]*$/.test(text.slice(Math.max(0, at - 24), at));
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
// 368: `N자리 중 M자리`(GAP 표의 모양)도 창 가드의 기준 문구다 — 없으면 그 뒤의 `남은 N개` 가
//      앞 줄의 **칸** 쌍에 붙어 가드를 잘못 고른다
const BASE_PAIR = /(\d+)칸 중 \*{0,2}(\d+)칸|(?:화면\s*)?칸 \*{0,2}(\d+)개 중 \*{0,2}(\d+)개|\*{0,2}(\d+)개 중 \*{0,2}(\d+)자리|\*{0,2}(\d+)자리 중 \*{0,2}(\d+)자리/g;
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

/**
 * 창 자리 커버리지 기준 수 주장(324, 리뷰 M-5) — ② 는 `칸` 쌍만 봐서 `56개 중 53자리` 는 검사 밖이었다.
 *
 * 368: 324 가 막은 것은 **한 모양**(`N개 중 M자리`)뿐이었다. GAP 표는 같은 수를 "지금 **56자리 중 55자리**"
 *      로 적고, 그 자리에 `99자리 중 98자리` 를 심어도 두 가드가 통과했다(심어 확인했다).
 *
 * 369(366~368 리뷰 H-2·M-2·M-3·H-3): 368 의 판이 **주제를 전혀 보지 않아** 거짓 경보를 냈다 —
 *      이 문서들은 `자리` 를 네 가드에 쓴다(대비 18자리·초점 200자리·키보드 18자리·창 56자리).
 *      리뷰가 "지금 18자리 중 17자리가 키보드로 닿는다" 를 심어 **창 가드의 낡은 수**로 신고되는 것을
 *      보였고(재현했다), 324 가 리뷰 M-4 를 받아 좁혀 둔 것을 368 이 다시 넓힌 셈이다.
 *      → 수 앞 60자(같은 칸 안)에 **창·모달·modal-a11y** 중 하나를 요구한다. 두 모양 모두에 건다.
 *
 *      인용 면제도 **표의 칸 단위**로 좁혔다. 전에는 줄 시작부터 `"` 홀짝을 셌는데 이 표의 Q-3 행은
 *      한 줄이 1만 자가 넘어, 앞쪽 글의 따옴표 짝이 깨지면 뒤의 모든 주장이 **조용히** 면제됐다.
 *      그리고 건너뛴 자리는 종류별로 **세어 찍는다**(과거·주제 밖·인용) — 조용한 건너뜀을 남기지 않는다.
 *
 *      `지금` 과 `당시` 가 함께 참일 수는 **없다**(당시 뒤에는 분리자만 와야 한다). 368 이 그 자리에
 *      "가까운 쪽이 이긴다" 는 우선순위 규칙을 적어 두었는데 **사실이 아니고**, 그 줄은 도달 불가였다
 *      (조합 전수로 동시 참 0회를 확인했다). 줄을 지우고 덫을 실제 갈림에 걸었다.
 */
const MODAL_SLOT_PAIR = /\*{0,2}(\d+)\*{0,2}자리 중 \*{0,2}(\d+)\*{0,2}자리/g;
const MODAL_COUNT_PAIR = /\*{0,2}(\d+)\*{0,2}개 중 (?:게이트가 여는 것 )?\*{0,2}(\d+)\*{0,2}자리/g;
/** 창 가드 이야기라는 표시 — 낱말 근접이 아니라 **같은 칸의 수 앞 60자**만 본다 */
/**
 * 창 가드 이야기인지 — **가장 가까운 주제 낱말이 이긴다** (372, 369~371 리뷰 M-5).
 *
 * 369 는 **수 앞 60자**만 봤다. 그래서 `지금 99자리 중 98자리가 창 접근성 게이트가 여는 자리입니다`
 * 처럼 주제 낱말이 **뒤**에 오면, 또 표에서 라벨이 **다른 칸**에 있으면(`| 창 접근성 | 지금 … |`)
 * 조용히 면제됐다. 넓히기만 하면 리뷰가 심은 "키보드 18자리" 류가 다시 걸리므로, 같은 `자리` 를
 * 쓰는 **다른 가드 낱말**(키보드·대비·초점)을 겨루게 두고 **수에 더 가까운 쪽**을 택한다.
 * 369 가 `지금`/`당시` 에 대해 "가까운 쪽이 이긴다" 고 **틀리게** 적어 둔 그 규칙을, 이번에는
 * 실제로 구현하고 덫으로 고정한다.
 */
// 375(372~374 리뷰 M-1): `창` 이 **창고·창구·창가·창문·창업** 에 걸렸다. 372 가 보는 범위를
//      "수 앞 60자" 에서 "같은 칸 + 라벨 칸" 으로 넓히면서 **수 뒤와 라벨 칸**이 새로
//      사정거리에 들어와, 평범한 두 문장이 창 가드의 낡은 수로 신고됐다(리뷰가 심어 보였고
//      나도 재현했다). 복합어만 인정하는 쪽으로 좁혀 보니 **GAP 표의 살아 있는 주장**
//      ("어드민 창 열한 개 … 지금 56자리 중 55자리")이 주제 밖으로 떨어졌다 — 이 글에서
//      홀로 선 `창` 은 진짜 주제어다. 그래서 **뒤에 붙어 다른 낱말이 되는 자리**만 뺀다.
const MODAL_TOPIC = /창(?![고구가문업])|모달|modal-a11y/g;
const OTHER_TOPIC = /키보드|대비|초점|keyboard|contrast|focus/g;
/** 표 행이면 그 수가 든 칸의 끝(다음 `|`), 아니면 줄 끝 */
function cellEnd(text, at) {
  const lineEnd = text.indexOf('\n', at) === -1 ? text.length : text.indexOf('\n', at);
  const bar = text.indexOf('|', at);
  return bar !== -1 && bar < lineEnd ? bar : lineEnd;
}
/** 표 행의 첫 칸(라벨) — 주제가 거기 적히는 모양이 흔하다 */
function rowLabel(text, at) {
  const lineStart = text.lastIndexOf('\n', at) + 1;
  if (text[lineStart] !== '|') return null;
  const second = text.indexOf('|', lineStart + 1);
  if (second === -1 || second > at) return null;
  return { from: lineStart + 1, to: second };
}
function modalTopicNear(text, at) {
  const from = cellStart(text, at);
  const to = cellEnd(text, at);
  const hay = [{ from, to }];
  const label = rowLabel(text, at);
  if (label) hay.push(label);
  let best = null;
  for (const span of hay) {
    const seg = text.slice(span.from, span.to);
    for (const [re, kind] of [[MODAL_TOPIC, true], [OTHER_TOPIC, false]]) {
      re.lastIndex = 0;
      for (let m = re.exec(seg); m !== null; m = re.exec(seg)) {
        const pos = span.from + m.index;
        const dist = pos < at ? at - pos : pos - at;
        if (best === null || dist < best.dist) best = { dist, modal: kind };
      }
    }
  }
  return best !== null && best.modal;
}
/** 표 행이면 그 수가 든 **칸**의 시작, 아니면 줄 시작 (369, 리뷰 M-2) */
function cellStart(text, at) {
  const lineStart = text.lastIndexOf('\n', at) + 1;
  if (text[lineStart] !== '|') return lineStart;
  const bar = text.lastIndexOf('|', at);
  return bar > lineStart ? bar + 1 : lineStart;
}
function modalSlotClaims(text, rel) {
  const out = [];
  const taken = [];
  const look = (at) => {
    const from = cellStart(text, at);
    const span = text.slice(from, at);
    return {
      quoted: (span.match(/"/g) || []).length % 2 === 1,
      topic: modalTopicNear(text, at),
    };
  };
  const add = (m, total, covered, kind) => out.push({ rel, raw: m[0], total, covered, kind });
  for (const m of text.matchAll(MODAL_COUNT_PAIR)) {
    taken.push([m.index, m.index + m[0].length]);
    const { quoted, topic } = look(m.index);
    if (quoted) { add(m, Number(m[1]), Number(m[2]), 'quoted'); continue; }
    if (markedPast(text, m.index)) { add(m, Number(m[1]), Number(m[2]), 'past'); continue; }
    if (!topic) { add(m, Number(m[1]), Number(m[2]), 'offtopic'); continue; }
    add(m, Number(m[1]), Number(m[2]), 'now');
  }
  for (const m of text.matchAll(MODAL_SLOT_PAIR)) {
    if (taken.some(([a, b]) => m.index >= a && m.index < b)) continue;
    const { quoted, topic } = look(m.index);
    if (quoted) { add(m, Number(m[1]), Number(m[2]), 'quoted'); continue; }
    // 수 **바로 앞**의 `지금` 만 지금 주장이다 — `당시` 와 함께 참일 수는 없다(369 에서 전수 확인)
    const now = /지금[\s—–\-:,·*]{0,4}$/.test(text.slice(Math.max(0, m.index - 12), m.index));
    if (!now) { add(m, Number(m[1]), Number(m[2]), 'past'); continue; }
    if (!topic) { add(m, Number(m[1]), Number(m[2]), 'offtopic'); continue; }
    add(m, Number(m[1]), Number(m[2]), 'now');
  }
  return out;
}

/**
 * 368: 대조할 주장만 고른다 — 비교부 안에 `filter(c => c.kind !== 'past')` 를 적어 두면
 *      셀프테스트가 그 줄을 볼 수 없다(364 H-1 에서 겪은 모양: 비교기만 찔러 배선이 덫 0종).
 */
function nowSlotClaims(claims) { return claims.filter(c => c.kind === 'now'); }
function pastSlotClaims(claims) { return claims.filter(c => c.kind === 'past'); }
const skippedSlotClaims = claims => claims.filter(c => c.kind === 'quoted' || c.kind === 'offtopic');

/**
 * 369(리뷰 H-1·M-3): **주장이 0개면 통과가 아니다.** 368 까지는 모양을 조금만 바꿔 적으면
 * (`지금` 한 낱말을 지우는 것만으로도) 대조 대상이 0개가 되고 가드는 조용히 통과했다.
 * 모양을 열거하는 쪽은 끝이 없으므로 **바닥**을 둔다 — 창 가드를 적은 문서에는 지금 주장이
 * 하나 이상 있어야 하고, 전체가 0개면 ⑪-2 가 꺼진 것이다. 366 이 ②-2 에서 쓴 "본검사가
 * 스스로 입력을 검사" 와 같은 장치다(그때도 리뷰가 "절반에 덫이 없다" 고 지적했다).
 */
const MODAL_GUARD_MENTION = /check:modal-a11y|창 자리/;
/**
 * 369(리뷰 M-3): **대조한 수가 지금 주장 수와 같아야 한다.** 비교부를 끄거나(`if (false)`),
 * 과거 쪽을 대조하거나, 수집을 지워도 전에는 조용히 통과했다(리뷰가 변이 셋으로 보였다).
 * 배선은 셀프테스트가 볼 수 없으므로 **본검사가 스스로 센다** — 366 의 ②-2 와 같은 장치.
 */
function comparedCountProblems(claimed, compared) {
  if (claimed === compared) return [];
  return [`창 자리 지금 주장 ${claimed}개 중 ${compared}개만 대조했다 — ⑪-2 의 배선이 끊겼다(369)`];
}

function slotFloorProblems(docs) {
  const out = [];
  let total = 0;
  for (const { rel, text, claims } of docs) {
    const now = claims.filter(c => c.kind === 'now');
    total += now.length;
    if (!MODAL_GUARD_MENTION.test(text)) continue;
    if (now.length === 0) out.push(`${rel}: 창 접근성 가드를 적으면서 **지금 주장이 하나도 없다** — 표기를 바꿔 ⑪-2 를 끈 것일 수 있다(369)`);
  }
  if (docs.length > 0 && total === 0) out.push('창 자리 "지금" 주장이 어느 문서에도 없다 — ⑪-2 가 아무것도 대조하지 않는다(369)');
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
  const out = { rules: [], testids: [], libUnits: [], ranges: [], cumulative: [], reviews: [], reviewsFrom: [], reviewRuns: [] };
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
  // 341(335~340 리뷰 H-1): "독립 리뷰 **40회**(이 기간만 25회)" 가 실측 42/28 과 어긋난 채
  // 세션 시작 문서에 있었다. ⑬ 은 "기록 N개(REVIEW-*.md 중 …)" 꼴만 봐서 이 말투를 지나쳤다.
  // 리뷰 1회 = 기록 1건이므로 전체는 파일 수와 같아야 하고, "이 기간만" 은 그 문서가 선언한
  // 범위 시작 번호로 센 값 **중 하나**와 같아야 한다(문서가 155~·218~ 둘을 선언하므로).
  for (const m of text.matchAll(/독립 리뷰 \*{0,2}(\d+)회\*{0,2}(?:\s*\(이 기간만 \*{0,2}(\d+)회)?/g)) {
    if (fresh(m)) out.reviewRuns.push({ total: Number(m[1]), subset: m[2] ? Number(m[2]) : null, raw: m[0] });
  }
  // lib-units 뒤에 공백·괄호·`.spec.ts` 가 끼어도 센다(개·건 둘 다)
  for (const m of text.matchAll(/lib-units(?:\.spec\.ts)?[^\d]{0,4}(\d+)\s*(?:개|건)/g)) out.libUnits.push({ count: Number(m[1]), raw: m[0] });
  return out;
}

/**
 * 시험 선언 세기(368) — **열 상관없이** 센다. 주석 줄은 세지 않는다.
 * 367 의 H-2: 열 0 만 세어 도움 함수 안의 선언을 못 보고 '선언 256개' 라고 적었다(실제 257).
 */
function countTestDecls(text) {
  let total = 0; let indented = 0;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trimStart();
    // 369(리뷰 H-3): 전에는 여기서 `//`·`*` 로 시작하는 줄을 건너뛰었는데 **막는 것이 0이었다** —
    //      아래 `^test` 가 이미 그 줄을 떨어뜨린다(주석 접두 7종으로 도달 0회 확인). 죽은 줄을 지웠다.
    //      주석 줄을 세지 않는다는 성질은 그대로이고, 그것을 보는 덫은 아래 정규식에 걸려 있다.
    if (!/^test(\.\w+)?\s*\(/.test(t)) continue;
    total += 1;
    if (line !== t) indented += 1;
  }
  return { total, indented };
}

/** 지금 세어 나오는 값 */
function liveNumbers() {
  const run = args => {
    const r = spawnSync('node', args, { cwd: ROOT, encoding: 'utf8' });
    return (r.stdout || '') + (r.stderr || '');
  };
  const rules = /순수 규칙 (\d+)개 모듈, export 함수 (\d+)개/.exec(run(['scripts/check-rule-coverage.mjs']));
  const ids = /화면 칸 (\d+)개 중 스펙이 보는 것 (\d+)개/.exec(run(['scripts/check-testid-coverage.mjs']));
  // 368: 전에는 `startsWith('test(')` 로 **열 0** 만 셌다. 367 이 바로 그 모양으로 틀렸다 —
  //      `e2e/a11y-shared.ts:71` 의 들여쓴 선언을 못 보고 '선언 256개' 라고 적었다(실제 257).
  //      이 파일은 지금 전부 열 0 이라 수가 같지만, 한 줄만 들여쓰면 조용히 줄어드는 잠복 결함이었다.
  //      몇 개가 들여쓰여 있는지도 함께 찍어 수를 설명할 수 있게 한다.
  const unitCounts = countTestDecls(read('e2e/lib-units.spec.ts'));
  const units = unitCounts.total;
  const roadmap = read(ROADMAP);
  const newestBatch = Math.max(...batchLines(roadmap).map(l => l.no));
  // 341(335~340 리뷰 M-5): 전에는 누계를 **로드맵이 스스로 적은 값**으로 믿었다("155~164 는 형식이 달라
  // 전수 집계를 할 수 없다"). 느슨한 모양(`- [x] NNN`)으로 세면 그 열 줄도 세어지므로 **실측**한다.
  // 그 가정 때문에 "묶음 186개" 가 통과했는데 실제는 185개였다 — 묶음 **161 이 없다**(162 줄이 순서를 바꿨다).
  // 340-155+1 같은 산수를 그대로 적으면 또 어긋나므로, 틀렸을 때 **빠진 번호**를 함께 말한다.
  const cums = [...roadmap.matchAll(/누계 155~(\d+) 묶음 (\d+)개/g)];
  const lastCum = cums.length > 0 ? cums[cums.length - 1] : null;
  const allNos = allBatchNos(roadmap);
  const cumReal = allNos.filter(n => n >= 155 && n <= newestBatch).length;
  const missingNos = [];
  for (let n = 155; n <= newestBatch; n += 1) if (!allNos.includes(n)) missingNos.push(n);
  // 범위 안의 묶음 수는 셀 수 있다 — `- [x] NNN — ` 형식이 쓰이기 시작한 165 번부터 (294, 리뷰 M-4)
  const UNIFORM_FROM = 165;
  // 341: 155~164 까지 세는 느슨한 모양을 쓴다 — 전에는 165 번부터만 세어 "155~340(186개)" 를 못 봤다
  const countInRange = (start, end) => allBatchNos(roadmap).filter(n => n >= start && n <= end).length;
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
    newestBatch, cumCount: cumReal, cumClaimed: lastCum ? Number(lastCum[2]) : null, missingNos,
    reviewFiles, reviewsFromCount, countInRange, UNIFORM_FROM,
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
  // 341(리뷰 M-6): exe 빌드 시각 주장 수집 — "당시" 는 면제
  const exeA = exeTimeClaims('- 테스트 exe: 지점·어드민 11-27 04:31/04:32 빌드\n- 11-24 당시 테스트 exe 11-24 01:02/01:03');
  if (exeA.length !== 1 || exeA[0].md !== '11-27' || exeA[0].branch !== '04:31' || exeA[0].admin !== '04:32') { console.error('[selftest] exe 시각 수집 덫 실패: ' + JSON.stringify(exeA)); process.exit(1); }
  const exeB = exeTimeClaims('- 테스트 exe(바탕화면 바로가기) = 11-26 **08:04**/08:05(지점·어드민)');
  if (exeB.length !== 1 || exeB[0].branch !== '08:04') { console.error('[selftest] exe 시각(굵게) 덫 실패: ' + JSON.stringify(exeB)); process.exit(1); }
  // 344(리뷰 M-1): 날짜 없이 시각만 적은 꼴도 모은다
  const exeD = exeTimeClaims('- 테스트 exe 19:56/19:57(184~224 포함)');
  if (exeD.length !== 1 || exeD[0].md !== null || exeD[0].branch !== '19:56') { console.error('[selftest] 날짜 없는 exe 시각 덫 실패: ' + JSON.stringify(exeD)); process.exit(1); }
  // 347(리뷰 H-1): "당시" 가 **시각 쪽**에 있는 꼴은 면제가 아니다 — 그 면제는 구분력이 없어 뗐다.
  // 과거 기록은 "11-25 당시 테스트 exe …" 처럼 **앞에서** 밝힌다(그 꼴은 markedPast 가 면제한다).
  const exeE = exeTimeClaims('- 테스트 exe(바탕화면) 11-25 당시 19:56/19:57');
  if (exeE.length !== 1) { console.error('[selftest] 시각 쪽 당시는 면제 아님 덫 실패: ' + JSON.stringify(exeE)); process.exit(1); }
  const exeF = exeTimeClaims('- 11-25 당시 테스트 exe 19:56/19:57');
  if (exeF.length !== 0) { console.error('[selftest] 앞에서 밝힌 과거 면제 덫 실패: ' + JSON.stringify(exeF)); process.exit(1); }
  // 347(리뷰 L-6): 쉼표를 넘어 무관한 시각 쌍을 집지 않는다
  const exeG = exeTimeClaims('- 테스트 exe 빌드 10분, 게이트 13:00/14:00 에 돌렸다');
  if (exeG.length !== 0) { console.error('[selftest] 쉼표 건너 시각쌍 덫 실패: ' + JSON.stringify(exeG)); process.exit(1); }
  // 347(리뷰 L-6): 인용은 주장이 아니다
  const exeH = exeTimeClaims('- 그때 가드가 "테스트 exe 19:56/19:57" 를 잡았다');
  if (exeH.length !== 0) { console.error('[selftest] exe 인용 면제 덫 실패: ' + JSON.stringify(exeH)); process.exit(1); }
  const exeC = exeTimeClaims('- 테스트 exe 는 다시 만들지 않았다(앱 변경 0건)');
  if (exeC.length !== 0) { console.error('[selftest] exe 시각 없는 줄 덫 실패'); process.exit(1); }
  // 341(335~340 리뷰 H-1): 리뷰 회수 주장 수집 — 전체와 "이 기간만", 그리고 "당시" 면제
  const rr = claimedNumbers('독립 리뷰 **40회**(이 기간만 25회) 했다.\n11-24 당시 독립 리뷰 30회.');
  if (rr.reviewRuns.length !== 1 || rr.reviewRuns[0].total !== 40 || rr.reviewRuns[0].subset !== 25) { console.error('[selftest] 리뷰 회수 수집 덫 실패: ' + JSON.stringify(rr.reviewRuns)); process.exit(1); }
  const rr2 = claimedNumbers('독립 리뷰 42회 돌렸다.');
  if (rr2.reviewRuns.length !== 1 || rr2.reviewRuns[0].subset !== null) { console.error('[selftest] 리뷰 회수(부분 없음) 덫 실패'); process.exit(1); }
  // 341(리뷰 M-5): 느슨한 모양으로 155~164 까지 센다 — 빠진 번호도 드러나야 한다
  const nos = allBatchNos('- [x] 155 PHASE 4 1/5 — 가\n- [x] 162 PHASE 5 — 나\n- [x] 165 — 다\n- 아닌 줄 170\n- [x] 2026 — 날짜');
  if (nos.join(',') !== '155,162,165') { console.error('[selftest] 느슨한 묶음 번호 덫 실패: ' + nos.join(',')); process.exit(1); }
  // 347(리뷰 L-1): 네 자리 묶음은 세고, 연도(2000 이상)는 세지 않는다
  const nos4 = allBatchNos('- [x] 999 — 가\n- [x] 1002 — 나\n- [x] 2026 — 날짜');
  if (nos4.join(',') !== '999,1002') { console.error('[selftest] 네 자리 묶음 덫 실패: ' + nos4.join(',')); process.exit(1); }
  // 341(리뷰 M-2): 브리핑 §5 에 빠진 가드를 찾는다
  const gateFake = "run('check-aaa.mjs');\nrun('check-bbb.mjs');";
  const scriptsFake = { 'check:aaa': 'node scripts/check-aaa.mjs', 'check:bbb': 'node scripts/check-bbb.mjs' };
  const briefFake = '## 4. 앞 절\n| x |\n## 5. 품질 장치\n| `npm run check:aaa` | 설명 |\n## 6. 다음 절\n| `npm run check:bbb` | 다른 절이라 세지 않는다 |';
  const missFake = missingGuardRows(briefFake, gateFake, scriptsFake);
  if (missFake.join(',') !== 'check:bbb') { console.error('[selftest] 빠진 가드 줄 덫 실패: ' + JSON.stringify(missFake)); process.exit(1); }
  const okFake = missingGuardRows(briefFake.replace('## 6. 다음 절', '| `npm run check:bbb` | 같은 절 |\n## 6. 다음 절'), gateFake, scriptsFake);
  if (okFake.length !== 0) { console.error('[selftest] 가드 줄 면제 덫 실패: ' + JSON.stringify(okFake)); process.exit(1); }
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
  // 369: 368 부터 과거 자리도 kind 로 **돌려준다**(세어 찍기 위해) — 대조 대상은 nowSlotClaims 가 고른다
  const msNow = nowSlotClaims(ms);
  if (msNow.length !== 2 || msNow[0].covered !== 53 || msNow[1].covered !== 51 || pastSlotClaims(ms).length !== 1) { console.error('[selftest] 창 자리 기준 수 덫 실패: ' + JSON.stringify(ms)); process.exit(1); }
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
// ── 새 검사(⑯⑰⑱)의 덫 — **수는 세어서 찍는다**(356, 352~354 리뷰 M-2).
  //    353·354 는 손으로 "12종"·"10종" 이라고 적었고 둘 다 틀렸다(실제 13·11).
  //    이 저장소의 다른 가드 넷은 이미 trapCount 를 쓴다(check-contrast-classes.mjs:803 의 교훈).
  // 363: 묶음 줄 삽입기(로드맵에 줄을 넣는 도구)의 덫 — 던지면 여기서 멈춘다
  const insertTraps = insertSelftest();
  let newTraps = 0;
  let skippedTraps = 0; // 361(리뷰 L-2): git 이 없으면 오프셋 덫이 돌지 않는다 — 수가 환경에 따라 달라지는 것을 **드러낸다**
  const trap = (name, cond) => { newTraps += 1; if (!cond) { console.error('[selftest] ' + name + ' 덫 실패'); process.exit(1); } };

  // ⑯ 코어 잠금 표 — 정본이 집합이므로 양방향 모두 본다 (353)
  {
    const lockDoc = rows => '# x\n\n## 보호 대상 (코어)\n\n| 파일 | 역할 |\n|---|---|\n' + rows + '\n\n## 다음 절\n';
    const real = ['a/b.ts', 'c/d.cjs', 'c/e.cjs', 'sb/'];
    const full = '| `a/b.ts` | 가 |\n| `c/d.cjs`, `c/e.cjs` | 나 |\n| `sb/**` | 다 |';
    trap('잠금 표 거짓 경보', lockDocProblems(lockDoc(full), real).length === 0);
    const dropped = lockDocProblems(lockDoc('| `a/b.ts` | 가 |\n| `sb/**` | 다 |'), real);
    trap('빠진 잠금 파일', dropped.length === 2 && /c\/d\.cjs/.test(dropped[0]));
    const extra = lockDocProblems(lockDoc(full + '\n| `x/y.ts` | 라 |'), real);
    trap('잠기지 않은 파일', extra.length === 1 && /정본\(scripts\/core-lock\.mjs\)에 없다/.test(extra[0]));
    // 한 칸에 두 경로를 적는 줄(electron/main.cjs, electron/preload.cjs)을 한 개로 세면 안 된다
    trap('한 칸 두 경로', lockDocPaths(lockDoc(full)).size === 4);
    // 디렉터리는 표가 sb/**, 정본이 sb/ 로 적는다 — 꼬리 별표만 떼고 같다고 본다
    trap('디렉터리 표기', lockDocProblems(lockDoc('| `a/b.ts` | 가 |\n| `c/d.cjs`, `c/e.cjs` | 나 |\n| `sb/` | 다 |'), real).length === 0);
    const noSec = lockDocProblems('# x\n\n## 딴 절\n', real);
    trap('절 없음', noSec.length === 1 && /절이 없다/.test(noSec[0]));
    // 356(리뷰 L-3): 렌더되지 않는 자리의 행을 "있다" 고 세면, 문서에서 사라진 줄이 가드를 통과한다
    const hiddenHtml = lockDocProblems(lockDoc('| `a/b.ts` | 가 |\n<!--\n| `c/d.cjs`, `c/e.cjs` | 나 |\n-->\n| `sb/**` | 다 |'), real);
    trap('HTML 주석 안의 행은 없는 것', hiddenHtml.length === 2 && /c\/d\.cjs/.test(hiddenHtml[0]));
    const fence = '```\n| `c/d.cjs`, `c/e.cjs` | 나 |\n```';
    const hiddenFence = lockDocProblems(lockDoc('| `a/b.ts` | 가 |\n' + fence + '\n| `sb/**` | 다 |'), real);
    trap('코드 펜스 안의 행은 없는 것', hiddenFence.length === 2);
  }

  // ⑰ 브리핑 §4 범위 (353, 349~351 리뷰 M-1)
  {
    const nos = [218, 219, 220, 221, 222];
    const sec4 = (head, rows) => '## 4. 지점이 보는 변화 (' + head + ', 기능군별)\n\n| 묶음 | 지점이 보는 것 |\n|---|---|\n' + rows + '\n\n## 5. 다음\n';
    const cover = '| **위 행에 없는 나머지 전부**(218~222 중 — 품질) | 품질 작업 |';
    const good = sec4('218~222', '| 218·219 | 가 |\n| 220~222 | 나 |\n' + cover);
    trap('§4 거짓 경보', section4Problems(good, nos).length === 0);
    // 머리말만 올리는 것이 349 가 고치고 350·351 이 되풀이한 모양이다
    const bumped = section4Problems(sec4('218~223', '| 218·219 | 가 |\n' + cover), [...nos, 223]);
    trap('머리말만 올림', bumped.length === 1 && /나머지 전부/.test(bumped[0]));
    // 덮개 줄이 없으면 열거가 완전해야 한다 — 범위 표기(218~220)는 펼쳐서 센다
    const holes = section4Problems(sec4('218~222', '| 218~220 | 가 |'), nos);
    trap('빠진 묶음', holes.length === 1 && /덮지 않는 묶음이 2개/.test(holes[0]));
    const outside = section4Problems(sec4('218~222', '| 999 | 가 |\n' + cover), nos);
    trap('범위 밖 묶음', outside.length === 1 && /머리말 범위\(218~222\) 밖/.test(outside[0]));
    const ghost = section4Problems(sec4('218~222', '| 221 | 가 |\n' + cover), [218, 219, 220, 222]);
    trap('없는 묶음', ghost.length === 1 && /로드맵에 없다/.test(ghost[0]));
    const noSec = section4Problems('## 3. 딴 절\n\n글\n', nos);
    trap('§4 절 없음', noSec.length === 1 && /"## 4\." 절이 없다/.test(noSec[0]));
    const noRange = section4Problems('## 4. 지점이 보는 변화 (기능군별)\n\n| 묶음 | 것 |\n|---|---|\n| 218 | 가 |\n', nos);
    trap('§4 범위 없음', noRange.length === 1 && /범위가 없다/.test(noRange[0]));
    // 356(리뷰 L-2): 앞쪽에 끼운 거짓 덮개가 조용히 묻히던 자리
    const twoCovers = section4Problems(sec4('218~222', '| **나머지 전부**(218~219 중) | 가 |\n' + cover), nos);
    trap('덮개가 둘', twoCovers.some(p => /"나머지 전부" 행이 2개/.test(p)));
    // 356(리뷰 L-4): 네 자리 묶음의 앞 세 자리를 번호로 읽으면 거짓 경보가 난다
    const four = section4Problems(sec4('218~222', '| 1000·1001 | 가 |\n' + cover), nos);
    trap('네 자리 묶음을 자르지 않는다', four.length === 2 && four.every(p => /묶음 100[01] /.test(p)));
    const year = section4Problems(sec4('218~222', '| 2026 년 작업 | 가 |\n' + cover), nos);
    trap('연도를 묶음으로 세지 않는다', year.length === 0);
  }

  // ⑱ 시각 ↔ 커밋 (354)
  {
    trap('같은 시각', timeGap('11-28', '07:30', '11-28', '07:30') === 0);
    trap('분 자리 창', timeGap('11-28', '07:3x', '11-28', '07:37') === 0);
    trap('커밋이 뒤', timeGap('11-28', '07:30', '11-28', '07:50') === 20);
    trap('적은 시각이 미래', timeGap('11-28', '07:40', '11-28', '07:30') === -10);
    trap('창 아래로 벗어남', timeGap('11-28', '07:4x', '11-28', '07:30') === -10);
    trap('날짜 넘김', timeGap('11-27', '23:50', '11-28', '00:05') === 15);
    // 352 가 실제로 적고 있던 값 — 219분 미래였다
    trap('352 실측', timeGap('11-28', '10:5x', '11-28', '07:11') === -219);
    // 356(리뷰 H-3): 달을 31일로 단순화하면 11-30 → 12-01 이 이틀이 된다(1455분). 달력으로 센다.
    trap('달 경계(11-30 → 12-01)', timeGap('11-30', '23:50', '12-01', '00:05', 2026) === 15);
    trap('해 넘김(12-31 → 01-01)', timeGap('12-31', '23:50', '01-01', '00:05', 2027) === 15);
    trap('2월 끝(02-28 → 03-01)', timeGap('02-28', '23:50', '03-01', '00:05', 2026) === 15);
    const road = [
      '- [x] 352 — **가**(11-28 07:11): 검증. 커밋 c0aacdb. 누계 155~352 묶음 197개.',
      '- [x] 240 — **나**(11-25 01:02): 해시 규약 앞이라 해시가 없다.',
      '- 2026-11-28 07:30 354차 재검증(353, PR #58): 가드 통과',
      '- 2026-11-28 07:11 353차 재검증(352, PR #58): 가드 통과',
      '- [x] 353 — **다**(11-28 07:30): 커밋 d1df183.',
    ].join('\n');
    const rows = timeClaimRows(road);
    trap('시각 줄 수집', rows.length === 4);
    trap('재검증 줄 수집', rows.filter(r => r.kind === '재검증').length === 2);
    trap('해시 없는 줄 면제', !rows.some(r => r.no === 240));
    trap('재검증 줄이 그 묶음 해시를 본다', rows.find(r => r.kind === '재검증' && r.no === 353).hash === 'd1df183');
    // 356(리뷰 H-2): 전에는 커밋 시각을 **돌리는 PC 의 지역시각**으로 읽어 UTC 러너에서 194건 거짓 경보가 났다.
    // 처음 쓴 덫은 같은 명령을 TZ 만 바꿔 두 번 불러 비교했는데, spawnSync 로 넘긴 TZ 를 이 환경의
    // git 이 따르지 않아 **두 값이 늘 같았다** — 덫이 돌지도 않는데 통과하는 모양이었다(변이 시험이 잡았다).
    // 이제 **커밋 자신의 오프셋**(%aI)에서 뽑은 값과 맞춘다 — 그게 이 검사의 정의다.
    {
      const r = spawnSync('git', ['log', '-1', '--format=%H %aI'], { cwd: ROOT, encoding: 'utf8' });
      const m = r.status === 0 ? /^([0-9a-f]{40}) (\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec((r.stdout || '').trim()) : null;
      const ct = m ? commitTimes() : null;
      const row = ct ? ct.find(x => x.h === m[1]) : null;
      if (m === null || ct === null) { skippedTraps += 1; console.log('[check-docs-claims] ⑱ 오프셋 덫 건너뜀 — git 을 읽을 수 없습니다'); }
      else trap('커밋 시각은 커밋 자신의 오프셋으로 읽는다', !!row && row.y === Number(m[2]) && row.md === m[3] + '-' + m[4] && row.hm === m[5] + ':' + m[6]);
    }
// 361(리뷰 L-1): 없는 날짜를 굴리지 않는다 — 전에는 11-31·02-30·04-31 등 20개 조합이 gap 0 으로 통과했다
    trap('없는 날짜는 null', timeGap('11-31', '07:30', '12-01', '07:30', 2026) === null);
    trap('없는 2월 말도 null', timeGap('02-30', '07:30', '03-02', '07:30', 2026) === null);
    trap('있는 날짜는 null 이 아니다', timeGap('11-30', '07:30', '12-01', '07:30', 2026) !== null);
    // 361(리뷰 L-3): 펜스·주석의 세 구멍
    {
      const doc = rows => '# x\n\n## 보호 대상 (코어)\n\n| 파일 | 역할 |\n|---|---|\n' + rows + '\n\n## 끝\n';
      const real = ['a/b.ts'];
      // 덫은 **절 안쪽**에 둬야 한다 — lockDocPaths 는 "## 보호 대상" 과 다음 "## " 사이만 본다.
      // (가) 인라인 코드 안의 <!-- 가 뒤의 진짜 --> 와 짝지으면 **가운데 진짜 행이 지워진다**
      const inline = doc('주의: `<!--` 로 감싸면 숨는다\n| `a/b.ts` | 가 |\n설명 끝 -->');
      trap('인라인 코드 안의 주석 시작은 주석이 아니다', lockDocProblems(inline, real).length === 0);
      // (나) 네 겹 펜스 안의 세 겹 줄이 토글을 뒤집으면 **안쪽 예시 행이 살아나** 정본에 없다고 신고된다
      const nested = doc('| `a/b.ts` | 가 |\n````\n```\n| `x/y.ts` | 예시 |\n```\n````');
      trap('네 겹 펜스 안은 전부 숨는다', lockDocProblems(nested, real).length === 0);
      // (다) 물결 펜스를 보지 않으면 그 안의 예시 행이 살아난다
      const tilde = doc('| `a/b.ts` | 가 |\n~~~\n| `x/y.ts` | 예시 |\n~~~');
      trap('물결 펜스 안도 숨는다', lockDocProblems(tilde, real).length === 0);
    }
    // 361(리뷰 L-4): §4 첫 칸이 묶음 번호 목록이 아니면 숫자를 묶음으로 읽지 않는다
    {
      const nos4 = [218, 219, 220, 221, 222];
      const sec = (rows) => '## 4. 지점이 보는 변화 (218~222, 기능군별)\n\n| 묶음 | 것 |\n|---|---|\n' + rows + '\n| **위 행에 없는 나머지 전부**(218~222 중) | 품질 |\n\n## 5. 끝\n';
      trap('분 단위 숫자를 묶음으로 읽지 않는다', section4Problems(sec('| 1455분 어긋남 | 가 |'), nos4).length === 0);
      trap('픽셀 숫자를 묶음으로 읽지 않는다', section4Problems(sec('| 412px 폭 | 가 |'), nos4).length === 0);
      trap('run 번호를 묶음으로 읽지 않는다', section4Problems(sec('| run 46083001984 | 가 |'), nos4).length === 0);
      trap('번호 목록은 그대로 읽는다', section4Problems(sec('| **218·219** | 가 |'), nos4).length === 0);
      trap('번호 목록의 범위 밖은 잡는다', section4Problems(sec('| 999 | 가 |'), nos4).some(p => /범위\(218~222\) 밖/.test(p)));
    }
// 363(리뷰 L-4): 02-29 를 "없는 날짜" 로 거짓 신고하던 자리 — 후보 연도를 ±2 로 넓혔다
    trap('02-29 는 없는 날짜가 아니다', timeGap('02-29', '23:50', '03-01', '00:05', 2026) !== null);
    trap('11-31 은 여전히 없는 날짜', timeGap('11-31', '23:50', '12-01', '00:05', 2026) === null);
    // 363(리뷰 L-3): 주석 안에 백틱이 홀수면 닫힌 주석도 안 지워졌다(설명과 동작이 달랐다)
    {
      const doc = rows => '# x\n\n## 보호 대상 (코어)\n\n| 파일 | 역할 |\n|---|---|\n' + rows + '\n\n## 끝\n';
      // 닫는 줄 **자신에** 홀수 백틱이 있을 때만 드러난다 — 줄이 바뀌면 codeLen 이 0 으로 돌아가므로.
      const hidden = doc('| `a/b.ts` | 가 |\n<!--\n| `x/y.ts` | 예시 |\n` 여기서 닫는다 -->');
      trap('주석 안의 표 행은 없는 것(닫는 줄에 홀수 백틱이어도)', lockDocProblems(hidden, ['a/b.ts']).length === 0);
      const oneLine = doc('| `a/b.ts` | 가 |\n<!-- 숨김 `코드 열고 끝 -->\n| `x/y.ts` | 예시 |');
      trap('한 줄 주석의 홀수 백틱이 뒤를 삼키지 않는다', lockDocProblems(oneLine, ['a/b.ts', 'x/y.ts']).length === 0);
    }
    // 363(리뷰 L-5): 붙임표 범위도 묶음 목록이다 — 전에는 그 칸을 통째로 건너뛰어 번호가 검사 밖이었다
    {
      const nos5 = [218, 219, 220, 221, 222];
      const sec = rows => '## 4. 지점이 보는 변화 (218~222, 기능군별)\n\n| 묶음 | 것 |\n|---|---|\n' + rows + '\n| **위 행에 없는 나머지 전부**(218~222 중) | 품질 |\n\n## 5. 끝\n';
      trap('붙임표 범위를 펼친다', section4Problems(sec('| 218-222 | 가 |'), nos5).length === 0);
      trap('붙임표 범위의 범위 밖도 잡는다', section4Problems(sec('| 900-902 | 가 |'), nos5).some(p => /범위\(218~222\) 밖/.test(p)));
      // 표 머리 칸("묶음")도 모양이 아니므로 함께 센다 — 특별 취급을 두지 않는다
      trap('모양이 아닌 칸은 센 수에 남는다', section4Scope(sec('| 1455분 | 가 |')).skippedCells.join(',') === '묶음,1455분');
    }
    // 363(리뷰 H-1): 자기를 가리키는 문장이 자기 커밋을 말하는가
    {
      const road = [
        '- [x] 360 — **가**(11-28 09:37): 검증. 커밋 0294575. **[자기 정정]** 이 줄의 시각을 처음에 09:42 로 적었다 — 커밋은 09:37 이다.',
        '- [x] 362 — **나**(11-28 09:53): 검증. 커밋 5780390. **[자기 정정]** 이 줄의 시각을 처음에 09:42 로 적었다 — 커밋은 09:37 이다.',
        '- [x] 354 — **다**(11-28 07:39): 342 는 04:4x 로 적었지만 실제 커밋은 04:13. 커밋 57f25e5.',
      ].join('\n');
      const claims = selfTimeClaims(road);
      trap('자기 시각 주장 둘만 모은다', claims.length === 2);
      trap('다른 묶음 커밋을 인용한 줄은 보지 않는다', !claims.some(c => c.no === 354));
      // 363: 따옴표로 **인용한** 자기 지칭 문장은 그 줄의 주장이 아니다
      const quoted = '- [x] 363 — **가**(11-28 10:30): 360 의 "**[자기 정정]** 이 줄의 시각을 처음에 09:42 로 적었다 — 커밋은 09:37" 을 되돌렸다. 커밋 c39e445.';
      trap('인용한 자기 지칭 문장은 보지 않는다', selfTimeClaims(quoted).length === 0);
      // 366(리뷰 L-3): "이 줄의" 뒤에 처음 오는 시각만 묶는다 — 줄 뒤쪽의 **다른 묶음** 커밋 시각은 아니다
      const withOther = '- [x] 363 — **가**(11-28 10:30): **[자기 정정]** 이 줄의 시각을 09:42 로 적었다 — 커밋은 10:31 이다. 그리고 362 의 커밋은 09:54 다. 커밋 c39e445.';
      const got = selfTimeClaims(withOther);
      trap('자기 지칭 뒤의 첫 시각만 본다', got.length === 1 && got[0].hm === '10:31');
      // 한글 따옴표로 인용한 자기 지칭도 면제한다
      const hangul = '- [x] 363 — **가**(11-28 10:30): 360 의 “이 줄의 시각을 처음에 09:42 로 적었다 — 커밋은 09:37” 을 되돌렸다. 커밋 c39e445.';
      trap('한글 따옴표 인용도 면제', selfTimeClaims(hangul).length === 0);
      // 376(리뷰 M-8): 같은 뜻의 말투도 본다
      const other = '- [x] 364 — **가**(11-28 10:30): **[자기 정정]** 이 기록 줄의 시각을 처음에 09:42 로 적었다 — 커밋은 09:37 이다. 커밋 c39e445.';
      trap('이 기록 줄의 도 자기 지칭이다', selfTimeClaims(other).length === 1);
      const other2 = other.replace('이 기록 줄의', '이 묶음 줄의');
      trap('이 묶음 줄의 도 자기 지칭이다', selfTimeClaims(other2).length === 1);
      trap('그냥 이 줄 은 아니다', selfTimeClaims(other.replace('이 기록 줄의', '이 줄 가까이의')).length === 0);
      // 366: ⑳ — 따옴표 안의 덫 수는 인용이다(만든 날 바로 이 거짓 경보가 났다)
      const roadTrap = [
        '- [x] 366 — **가**(11-28 11:50): 리뷰가 "덫 31종 통과" 가 찍히는 것을 보였다. 덫 57종 · 덫 43종. 커밋 abc1234.',
      ].join('\n');
      // 372(리뷰 M-6): 판정은 이제 `pairTrapClaims` 한 곳에서 한다 — 덫도 그쪽을 본다.
      //      전에는 `newestTrapClaims` 안의 복제된 판정을 보고 있었고, 프로덕션은 그 결과를 쓰지 않았다.
      const tc = newestTrapClaims(roadTrap);
      const tcPairs = pairTrapClaims(tc.line).map(p => p.n);
      trap('가장 새 묶음 줄을 고른다', tc.no === 366);
      trap('인용한 덫 수는 보지 않는다', !tcPairs.includes(31));
      trap('인용 밖의 덫 수는 본다', tcPairs.includes(57) && tcPairs.includes(43));
      // 372(리뷰 H-1): ⑳ 바닥 — 주장이 없으면 신고하고, 단위만 다른 모양은 집어서 말한다
      trap('덫 수 주장이 없으면 신고', trapFloorProblems(372, '- [x] 372 — **가**(11-28 15:00): 아무 수도 없다. 커밋 abc1234.', []).length === 1);
      trap('덫 N개 는 단위를 집어 말한다', trapFloorProblems(372, '- [x] 372 — 덫 106개 통과', [])[0].includes('덫 106개'));
      trap('덫은 N종 어순도 집어 말한다', trapFloorProblems(372, '- [x] 372 — 그 가드의 덫은 106종', [])[0].includes('덫은 106종'));
      trap('주장이 있으면 조용하다', trapFloorProblems(372, '- [x] 372 — 덫 106종(`check:docs`)', [{ n: 106, npm: 'check:docs' }]).length === 0);
      trap('줄을 못 찾으면 신고', trapFloorProblems(null, '', []).length === 1);
      // 370(366~368 리뷰 M-4): ⑳ 은 합집합과 비교해 **허용값이 7개**였다 — 기록은 이미 가드 이름을
      //      짝지어 적으니 그 짝을 읽어 **그 가드의 수와만** 겨룬다. 짝이 없으면 합집합으로 떨어진다.
      const pairLine = '- [x] 370 — **가**(11-28 14:00): 덫 85종(`check:docs`)·덫 29종(`check:gap`)·덫 7종. 커밋 abc1234.';
      const pairs = pairTrapClaims(pairLine);
      trap('덫 수에 붙은 가드 이름을 읽는다', pairs.length === 3 && pairs[0].npm === 'check:docs' && pairs[1].npm === 'check:gap' && pairs[2].npm === null);
      trap('굵게 적은 덫 수도 짝짓는다', pairTrapClaims('덫 **85종**(`check:docs`)')[0].npm === 'check:docs');
      // 374: 괄호 안에 설명이 이어져도 짝을 읽는다
      // 374: 괄호 안 설명이 **길게** 이어져도 짝을 읽는다 — 처음 덫은 짧은 글이라 통과했는데
      //      실제 기록(설명 40자 이상)에서는 못 읽었다. 덫 입력을 실제 길이로 맞춘다.
      trap('괄호 안 긴 설명이 이어져도 짝짓는다', pairTrapClaims('덫 8종(`check:notes`: 있는 이름·없는 이름·N 자리 2종·아이콘·띄어쓰기·수만 2종)')[0].npm === 'check:notes');
      trap('이름이 괄호 뒤에 바로 오지 않으면 짝이 아니다', pairTrapClaims('덫 8종(앞에 설명이 먼저 오고 `check:notes`)')[0].npm === null);
      trap('인용한 덫 수는 짝짓지 않는다', pairTrapClaims('리뷰가 "덫 31종(`check:docs`)" 이라고 적었다').length === 0);
      // package.json 이 npm 이름 → 스크립트의 정본이다(표를 두면 낡는다)
      const pkgFix = JSON.stringify({ scripts: { 'check:docs': 'node scripts/check-docs-claims.mjs --selftest && node scripts/check-docs-claims.mjs', 'check:gap': 'node scripts/check-gap-claims.mjs' } });
      trap('npm 이름을 스크립트로 바꾼다', guardScriptOf(pkgFix, 'check:docs') === 'check-docs-claims' && guardScriptOf(pkgFix, 'check:gap') === 'check-gap-claims');
      trap('없는 npm 이름은 null', guardScriptOf(pkgFix, 'check:nope') === null);
      // 다른 가드의 수를 적으면 **짝이 있을 때** 잡힌다(리뷰가 심어 통과시킨 바로 그 자리)
      const printedFix = { seen: new Set([85, 43, 29]), byGuard: new Map([['check-docs-claims', new Set([85, 7])], ['check-gap-claims', new Set([29])]]), dead: [] };
      const scriptOf = npm => guardScriptOf(pkgFix, npm);
      trap('짝이 맞으면 조용하다', trapClaimProblems([{ n: 85, npm: 'check:docs' }], printedFix, scriptOf).problems.length === 0);
      trap('다른 가드의 수를 적으면 잡는다', trapClaimProblems([{ n: 43, npm: 'check:docs' }], printedFix, scriptOf).problems.length === 1);
      trap('짝이 없으면 합집합과 겨룬다', trapClaimProblems([{ n: 43, npm: null }], printedFix, scriptOf).problems.length === 0);
      trap('짝 없는 주장 수를 센다', trapClaimProblems([{ n: 43, npm: null }], printedFix, scriptOf).unpaired === 1);
      trap('아무도 안 찍는 수는 짝이 없어도 잡는다', trapClaimProblems([{ n: 99, npm: null }], printedFix, scriptOf).problems.length === 1);
      // 370(리뷰 L-3): **새로 적는 재검증 차수는 직전+1** 이어야 한다(번호와 줄 수가 어긋나 있었다)
      // 371(366~368 리뷰 H-1 의 남은 몫): 계열 바닥 — 주장 0개는 통과가 아니다
      // 372(리뷰 H-2): 문서별 바닥 — 가드를 적은 문서가 수를 빼면 신고한다
      trap('문서별 바닥이 수 빠진 문서를 집는다', perDocFloorProblems([{ rel: 'a.md', mentions: true, claims: 0 }], '화면 칸').length === 1);
      trap('수가 있으면 조용하다', perDocFloorProblems([{ rel: 'a.md', mentions: true, claims: 2 }], '화면 칸').length === 0);
      trap('언급하지 않는 문서는 바닥 밖', perDocFloorProblems([{ rel: 'a.md', mentions: false, claims: 0 }], '화면 칸').length === 0);
      trap('주장이 있는 계열은 조용하다', familyFloorProblems({ 모듈: 2, 화면칸: 5 }).length === 0);
      trap('주장 0개 계열을 신고한다', familyFloorProblems({ 모듈: 0, 화면칸: 5 }).length === 1);
      trap('어느 계열인지 말한다', familyFloorProblems({ libUnits: 0 })[0].includes('libUnits'));
      trap('여러 계열이 비면 각각 신고한다', familyFloorProblems({ 모듈: 0, 함수: 0 }).length === 2);
      trap('재검증 차수가 직전+1 이면 조용하다', recheckSequenceProblems([370, 369, 368]).length === 0);
      trap('차수를 건너뛰면 잡는다', recheckSequenceProblems([372, 369, 368])[0].includes('370차'));
      trap('같은 차수를 또 적으면 잡는다', recheckSequenceProblems([370, 370, 369])[0].includes('두 번'));
      trap('줄이 하나뿐이면 보지 않는다', recheckSequenceProblems([370]).length === 0);
      // 370: 이 문서는 **오름 블록**(옛 3차~247차)과 **내림 블록**(지금)을 함께 가진다 —
      //      첫 판은 "문서 순서의 첫 줄" 을 가장 새 것으로 보아 134차를 가장 새 차수로 찍었다.
      trap('오름 블록 뒤의 내림 블록 맨 위를 본다', recheckSequenceProblems([100, 101, 370, 369, 368]).length === 0);
      // 372(리뷰 M-1): 370 은 여기서 "오름 블록만 있으면 보지 않는다" 를 지켰는데, 그 면제가
      //      **문서 끝에 새 줄을 붙이는 수법**을 그대로 통과시켰다(399차를 붙여도 조용했다).
      //      이 저장소의 새 줄 규칙은 "내림 블록 맨 위" 이므로, 최댓값이 마지막 줄이면 신고한다.
      // 373(리뷰 L-1): 최댓값 아래 창 안의 중복·건너뜀·뒤바뀜
      // 375(372~374 리뷰 L-1): 이 덫은 `372` 만 봐서, 중복 가지를 지워도 바로 아래 "1씩 줄어들지
      //      않는다" 가지가 같은 입력을 잡고 메시지에 372 가 들어가 **그대로 통과**했다.
      trap('창 안의 잇따른 중복을 잡는다', recheckSequenceProblems([373, 372, 372, 371])[0].includes('잇따라 두 번'));
      trap('창 안의 건너뜀을 잡는다', recheckSequenceProblems([373, 372, 370, 369])[0].includes('370'));
      trap('창 안의 뒤바뀜을 잡는다', recheckSequenceProblems([373, 372, 369, 370, 368]).length === 1);
      trap('창 밖(11번째 아래)의 불규칙은 보지 않는다', recheckSequenceProblems([383, 382, 381, 380, 379, 378, 377, 376, 375, 374, 326, 326, 324]).length === 0);
      trap('멀쩡한 내림 블록은 조용하다', recheckSequenceProblems([373, 372, 371, 370, 369]).length === 0);
      // 373(리뷰 M-2 의 뿌리): 가드 목록은 package.json 에서 뽑는다
      const pkgList = guardScriptsFromPkg(JSON.stringify({ scripts: {
        'check:docs': 'node scripts/check-docs-claims.mjs --selftest && node scripts/check-docs-claims.mjs',
        'check:gap': 'node scripts/check-gap-claims.mjs', 'build': 'vite build', 'check:e2e-types': 'tsc -p e2e --noEmit',
      } }));
      trap('check:* 의 스크립트만 모은다', pkgList.join(',') === 'check-docs-claims,check-gap-claims');
      trap('스크립트가 없는 check:* 는 건너뛴다', !guardScriptsFromPkg(JSON.stringify({ scripts: { 'check:e2e-types': 'tsc -p e2e --noEmit' } })).length);
      trap('망가진 package.json 은 빈 목록', guardScriptsFromPkg('{{{').length === 0);
      trap('지금 package.json 에서 여덟 개 이상 뽑힌다', guardScriptsFromPkg(read('package.json')).length >= 8);
      trap('최댓값이 마지막 줄이면 신고한다', recheckSequenceProblems([100, 101, 102]).length === 1);
      trap('문서 끝에 붙인 새 차수를 잡는다', recheckSequenceProblems([370, 369, 368, 399]).length === 1);
      trap('재검증 줄이 하나도 없으면 신고한다', recheckSequenceProblems([]).length === 1);
      trap('내림 블록 맨 위가 어긋나면 잡는다', recheckSequenceProblems([100, 101, 375, 369, 368]).length === 1);
    }
    // 356: ⑮ 의 asar 시각도 같은 결함이었다 — 서울 기준으로 못 박았는지 고정된 순간으로 확인한다
    {
      const kst = seoulStamp(new Date(Date.UTC(2026, 10, 27, 16, 6)));
      trap('asar 시각은 서울 기준', kst.md === '11-28' && kst.hm === '01:06');
      // 368: ⑪-2 — GAP 표의 모양(`N자리 중 M자리`)을 44묶음 동안 아무 가드도 보지 않았다.
      //      369: 덫 입력에 **주제 표시**(창)를 넣는다 — 368 의 덫 글은 주제가 없어 이제 'offtopic' 이다.
      const slotNow = modalSlotClaims('창 접근성: 지금 **56자리 중 55자리**이며 1개만 사유를 적어 둔다', 'x.md');
      trap('지금 표시가 붙은 자리-자리 주장을 본다', slotNow.length === 1 && slotNow[0].kind === 'now' && slotNow[0].total === 56 && slotNow[0].covered === 55);
      const slotPast = modalSlotClaims('295 에서 미룬 창 다섯 개를 넣어 56자리 중 42자리가 덮였고', 'x.md');
      trap('지금 표시가 없으면 과거 서술로 센다', slotPast.length === 1 && slotPast[0].kind === 'past');
      trap('과거 서술은 대조 대상이 아니다', nowSlotClaims(slotPast).length === 0 && pastSlotClaims(slotPast).length === 1);
      trap('지금 주장은 대조 대상이다', nowSlotClaims(slotNow).length === 1 && pastSlotClaims(slotNow).length === 0);
      const slotBoth = modalSlotClaims('창 자리 56개 중 게이트가 여는 것 55자리. 295 당시 — 창 56자리 중 42자리', 'x.md');
      trap('개-자리 모양과 섞여도 각각 센다', nowSlotClaims(slotBoth).length === 1 && nowSlotClaims(slotBoth)[0].covered === 55);
      // 369(리뷰 H-3): 368 은 "표시가 둘이면 가까운 쪽이 이긴다" 는 **우선순위 규칙을 적어 두었지만**
      //      `지금` 과 `당시` 는 함께 참일 수 없다(당시 뒤에는 분리자만 와야 한다 — 조합 전수로 동시 참 0회).
      //      그래서 그 판정 줄은 도달 불가였고, 그것을 "지킨다" 던 덫은 다른 이유로 통과했다.
      //      이제 **실제 갈림**을 본다: `당시` 뒤 수는 지금 표시가 없어 과거, `당시 … 지금 N` 은 지금이다.
      trap('당시 표시만 있으면 과거 서술', modalSlotClaims('창 289 당시 — 56자리 중 42자리', 'x.md').every(c => c.kind === 'past'));
      const slotMixed = modalSlotClaims('창 289 당시 지금 56자리 중 42자리', 'x.md');
      trap('당시가 앞서도 수 바로 앞 지금이 이긴다', slotMixed.length === 1 && slotMixed[0].kind === 'now');
      trap('개-자리 모양에 당시가 붙으면 과거', modalSlotClaims('창 자리 289 당시 56개 중 42자리', 'x.md').every(c => c.kind === 'past'));
      // 369(리뷰 H-2): **주제 표시가 없으면 창 가드의 수가 아니다** — 이 문서들은 `자리` 를 네 가드에 쓴다.
      //      리뷰가 "지금 18자리 중 17자리가 키보드로 닿는다" 를 심어 거짓 경보를 재현했다(나도 재현했다).
      const offTopic = modalSlotClaims('키보드 경로 가드: 훑은 자리 중 지금 18자리 중 17자리가 키보드로 닿는다', 'x.md');
      trap('주제 표시가 없으면 대조하지 않는다', offTopic.length === 1 && offTopic[0].kind === 'offtopic' && nowSlotClaims(offTopic).length === 0);
      // 375(리뷰 H-4): 372 기록은 "덫으로 고정했고" 라고 적었지만 `modalTopicNear` 를 찌르는 덫이
      //      **하나도 없었다**(거리 규칙·라벨 칸·칸 경계 전부). 리뷰가 세 변이를 무사통과시켰다.
      //      아래 기댓값은 **먼저 재서** 적은 것이다 — 372 는 기대를 먼저 적어 틀렸다.
      const topicAt = (text) => { const at = text.search(/\d+자리 중|\d+개 중/); return modalTopicNear(text, at); };
      trap('라벨 칸에만 주제가 있어도 본다', topicAt('| 창 접근성 | 지금 99자리 중 98자리 — 확인 |') === true);
      trap('가운데 칸의 주제는 보지 않는다', topicAt('| 가 | 창 자리 | 지금 99자리 중 98자리 |') === false);
      trap('같은 칸에서 다른 주제가 더 가까우면 주제 밖', topicAt('창 자리 이야기였지만 키보드 지금 99자리 중 98자리') === false);
      trap('같은 칸에서 창이 더 가까우면 주제', topicAt('키보드 이야기였지만 창 자리 지금 99자리 중 98자리') === true);
      trap('창고는 주제 낱말이 아니다', topicAt('지금 99자리 중 98자리를 치우고 창고로 옮겼다.') === false);
      trap('창구도 주제 낱말이 아니다', topicAt('| 예약 창구 수용 | 지금 99자리 중 98자리 |') === false);
      trap('홀로 선 창은 주제 낱말이다', topicAt('어드민 창 열한 개를 덮어 지금 56자리 중 55자리') === true);
      trap('대비 문장도 대조하지 않는다', modalSlotClaims('글자 대비: 지금 18자리 중 18자리가 기준을 넘는다', 'x.md').every(c => c.kind === 'offtopic'));
      trap('개-자리 모양도 주제 표시를 요구한다', modalSlotClaims('초점 표시: 지금 200개 중 199자리가 덮였다', 'x.md').every(c => c.kind === 'offtopic'));
      // 369(리뷰 M-2): 인용 면제는 **표의 칸 단위**다 — 전에는 줄 시작부터 따옴표를 세어, 1만 자가 넘는
      //      Q-3 행의 앞쪽 따옴표 짝이 깨지면 그 뒤 모든 주장이 **조용히** 면제됐다(리뷰가 심어 확인).
      const cellRow = '| 앞 칸에 짝 안 맞는 따옴표 " 가 있다 | 창 자리: 지금 56자리 중 55자리 |';
      trap('다른 칸의 따옴표는 면제하지 않는다', nowSlotClaims(modalSlotClaims(cellRow, 'x.md')).length === 1);
      const sameCell = '| 창 자리: 리뷰가 "지금 56자리 중 42자리 라고 적었다 |';
      trap('같은 칸의 인용은 면제한다', modalSlotClaims(sameCell, 'x.md').every(c => c.kind === 'quoted'));
      trap('건너뛴 자리는 종류별로 세어 돌려준다', skippedSlotClaims(modalSlotClaims(sameCell, 'x.md')).length === 1);
      // 369(리뷰 H-1·M-3): **주장이 0개면 통과가 아니다** — `지금` 한 낱말을 지우면 꺼지던 길을 닫는다
      const floorOff = slotFloorProblems([{ rel: 'a.md', text: '`npm run check:modal-a11y` 가 지킨다. 덮어 56자리 중 55자리.', claims: modalSlotClaims('`npm run check:modal-a11y` 가 지킨다. 덮어 56자리 중 55자리.', 'a.md') }]);
      trap('가드를 적고 지금 주장이 없으면 신고', floorOff.length === 2 && floorOff.some(p => /지금 주장이 하나도 없다/.test(p)));
      const floorOk = [{ rel: 'a.md', text: '`npm run check:modal-a11y`', claims: modalSlotClaims('창 자리: 지금 56자리 중 55자리', 'a.md') }];
      trap('지금 주장이 있으면 조용하다', slotFloorProblems(floorOk).length === 0);
      trap('주장이 전부 0개면 신고', slotFloorProblems([{ rel: 'a.md', text: '그냥 글', claims: [] }]).some(p => /아무것도 대조하지 않는다/.test(p)));
      trap('대조한 수가 주장 수와 같으면 조용하다', comparedCountProblems(3, 3).length === 0);
      trap('비교를 끄면 신고한다', comparedCountProblems(3, 0).length === 1);
      trap('일부만 대조하면 신고한다', comparedCountProblems(3, 2)[0].includes('2개만 대조'));
      trap('가드를 적지 않은 문서는 바닥 검사 밖', slotFloorProblems([{ rel: 'a.md', text: '그냥 글', claims: [] }, { rel: 'b.md', text: '창 자리: 지금 56자리 중 55자리', claims: modalSlotClaims('창 자리: 지금 56자리 중 55자리', 'b.md') }]).length === 0);
      // 368: 같은 수를 한 번만 센다 — 덮인 것의 **내역**을 적으면 두 모양이 겹친다
      //      ("창 자리 56개 중 55자리 중 42자리는 PC 게이트"). 겹친 자리를 또 세면 거짓 경보가 난다.
      //      처음 쓴 덫은 두 모양에 걸리지 않는 글이라 변이를 놓쳤다 — 겹침이 실제로 일어나는 글로 바꿨다.
      const slotNest = modalSlotClaims('창 자리 56개 중 55자리 중 42자리는 PC 게이트', 'x.md');
      trap('겹치는 자리를 두 번 세지 않는다', slotNest.length === 1 && slotNest[0].covered === 55);
      // 368: 기준 문구가 `자리 중 자리` 모양이어도 면제 수가 **창 가드**에 붙는다(BASE_PAIR)
      const exSlot = exemptionClaims('| check:testids | 227칸 중 227칸 |\n| check:modal-a11y | 지금 56자리 중 55자리, 남은 1개는 사유를 적음 |', 'x.md');
      trap('자리-자리 기준 문구도 창 가드를 고른다', exSlot.length === 1 && exSlot[0].guard.key === 'modal');
      // 368: 선언 세기 — 열 0 만 세던 367 의 H-2 가 다시 생기지 않게
      const decl = countTestDecls(['test(\'a\', () => {});', '  test(\'b\', () => {});', '// test(\'c\') 주석', ' * test(\'d\') 머리말', "  test.skip('e', () => {});"].join('\n'));
      trap('들여쓴 선언도 센다', decl.total === 3 && decl.indented === 2);
      trap('주석 줄의 test( 는 세지 않는다', countTestDecls("// test('x', () => {});").total === 0);
      trap('이름 안의 test( 는 세지 않는다', countTestDecls('latest(1);').total === 0);
    }
  }
  console.log(`[check-docs-claims] selftest OK — 덫(코드 펜스·화면 칸 개수형 2종·줄표 끼운 당시 3종·표시 없는 개수형·중간 빈 칸 2종·릴리스 단계 3종·서버 테스트 주장·표 열 수·모자란 칸·이스케이프 파이프·표 아닌 글·넓힌 자기 범위 말·숫자 3종·넓은 표현 2종·묶음 해시·범위·누계·리뷰 건수·당시 면제 3종·날짜만 면제 금지·브랜치 마침표·어순 반대 범위·범위 개수·묶음 없는 줄·당시 범위·참조 면제·자기 범위·한 줄에 섞인 참조·표시 없는 범위는 ② 밖·표시된 범위·네 자리 묶음·면제 수 6종·outbox 수·기준 문구 없는 수·굵은 기준 문구·창 자리 기준 수·맨 outbox 수·넓힌 서버 테스트 수·러너만 적힌 수·리뷰 회수 2종·exe 시각 8종·느슨한 묶음 번호 2종·빠진 가드 줄 2종·부분 집합 리뷰 수 3종) 통과 + 새 검사 덫 ${newTraps}종 + 삽입기 덫 ${insertTraps}종${skippedTraps > 0 ? ' (+ 건너뜀 ' + skippedTraps + '종 — git 을 읽을 수 없는 환경)' : ''}(코어 잠금 표·§4 범위·기록 시각 — **이 수는 세어서 찍는다**, 352~354 리뷰 M-2)`);
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

/**
 * ㉑ **수 계열마다 바닥**(371, 366~368 리뷰 H-1 의 남은 몫)
 *
 * 왜: 369 가 창 자리에 바닥을 두면서 "다른 수의 바닥 검사는 371" 이라고 적었다. 그 계열들은
 *     아직 **표기만 바꾸면 주장 0개가 되고 조용히 통과**한다(리뷰가 `모듈 99개·함수 98개` 처럼
 *     어순을 바꿔 빠져나가는 것을 전수로 보였다). 모양을 열거하는 쪽은 끝이 없으므로,
 *     "한 계열의 주장이 **하나도 없으면** 그 계열은 아무것도 대조하지 않는다" 를 신고한다.
 *
 * 설계 판단(371 에서 두 안을 측정해 고름):
 *   - **문서별 바닥**(그 가드를 적은 문서는 그 수를 적어야 한다)은 **면제가 필요해 버렸다** —
 *     여덟 계열 중 다섯에서 "가드를 언급하지만 수는 적지 않는" 정당한 문서가 있다(게이트 목록 등).
 *   - **낱말 가까이의 "수+단위" 가 전부 파서에 인정돼야 한다**는 안은 지금 문서에서 **거짓 경보 8건**을
 *     낸다(과거 서술·다른 주제의 수). 거짓을 말하는 가드는 사람이 끄게 되므로 쓰지 않는다(303).
 *   - 남은 것이 **계열별 전체 바닥**이다. 지금 문서에서 거짓 경보 0이고, 파서가 깨지거나 표기가
 *     전부 바뀌면 그 자리에서 울린다. 한계: 한 문서만 표기를 바꾸고 다른 문서가 수를 그대로 적고
 *     있으면 그 한 자리는 여전히 검사 밖이다(그 한계를 숨기지 않고 적는다).
 */
/**
 * 계열의 **문서별 바닥** (372, 369~371 리뷰 H-2 의 남은 몫)
 *
 * 371 은 "문서별 바닥은 여덟 계열 중 다섯에서 면제가 필요하다" 며 전체 바닥만 뒀다. 그 측정은
 * 맞았지만 **모든 계열이 그런 것은 아니다** — `화면 칸` 은 가드를 언급하는 다섯 문서가 **모두**
 * 수를 적고 있어 면제 없이 문서별 바닥을 걸 수 있다(369 의 ⑪-2 와 같은 장치).
 * `장식 UI` 는 GAP 표가 가드를 언급하면서 수는 적지 않으므로(정당한 산문) 전체 바닥만 둔다.
 */
function perDocFloorProblems(docs, label) {
  const out = [];
  for (const { rel, mentions, claims } of docs) {
    if (!mentions) continue;
    if (claims === 0) out.push(`${rel}: ${label} 가드를 적으면서 **그 수를 적지 않았다** — 표기를 바꿔 검사를 끈 것일 수 있다(372)`);
  }
  return out;
}

function familyFloorProblems(counts) {
  const out = [];
  for (const [name, n] of Object.entries(counts)) {
    if (n === 0) out.push(`"${name}" 계열의 주장이 어느 문서에도 없다 — 표기를 바꿔 이 검사를 끈 것일 수 있다(371). 적어도 한 문서가 지금 수를 적어야 한다`);
  }
  return out;
}

/** ㉑ 집계 그릇 — 각 블록이 자기 계열 수를 여기에 더한다 */
const familyCounts = {
  모듈: 0, 함수: 0, 화면칸: 0, libUnits: 0, 리뷰기록: 0, 리뷰회수: 0, 누계: 0, 묶음범위: 0, 서버테스트: 0, outbox: 0,
  // 372(369~371 리뷰 H-2): 371 은 "리뷰 H-1 의 남은 몫" 을 했다고 적었지만 리뷰가 **이름까지 적어 준**
  //      `장식 UI` 와 ⑪(면제·남은 수)를 빠뜨렸다. 둘 다 표기만 바꾸면 틀린 수가 통과했다
  //      (리뷰가 `단추 999개 · 입력칸 998개` 로 가운뎃점 앞뒤에 공백만 넣어 통과시켰고, 나도 재현했다).
  장식UI: 0, 면제: 0,
  // 376(372~374 리뷰 H-1, **여덟 번째**): `claimedNumbers` 가 모으는 여덟 중 `reviewsFrom` 만
  //      계열에 없었다 — 말투를 바꾸면 **오너가 가장 먼저 읽는 브리핑 §1 의 수**가 조용히 낡는다.
  //      하필 ⑬ 자신이 335 에서 바로 그 자리의 낡음 때문에 생긴 검사다(리뷰가 심어 보였고 나도 확인했다).
  부분집합리뷰: 0,
  // 376(리뷰 H-2, **아홉 번째**): ⑮ 는 `테스트 exe` 라는 글자에만 걸려, `테스트용 exe`·
  //      `테스트 실행 파일` 로 바꾸면 틀린 시각이 통과했다. 341 이 "세 묶음 연속 낡아 있었다" 는
  //      피해 때문에 만든 검사다.
  exe시각: 0,
};

// ② "지금 상태" 문서의 숫자가 지금 값과 같은가
{
  const live = liveNumbers();
  const idDocs = [];
  for (const rel of CURRENT_DOCS) {
    if (!fs.existsSync(path.join(ROOT, rel))) { problems.push(`${rel}: CURRENT_DOCS 목록에 있는데 파일이 없다`); continue; }
    const c = claimedNumbers(read(rel));
    for (const r of c.rules) {
      if (r.modules !== null) familyCounts.모듈 += 1;
      if (r.fns !== null) familyCounts.함수 += 1;
      if (r.modules !== null && r.modules !== live.modules) problems.push(`${rel}: "${r.raw}" 가 낡았다 — 지금은 ${live.modules}모듈`);
      if (r.fns !== null && r.fns !== live.fns) problems.push(`${rel}: "${r.raw}" 가 낡았다 — 지금은 ${live.fns}함수`);
    }
    familyCounts.화면칸 += c.testids.length;
    // 372(리뷰 H-2): 화면 칸은 **문서별 바닥**도 걸 수 있다 — 언급 문서 다섯이 모두 수를 적는다
    idDocs.push({ rel, mentions: /check:testids|화면\s*칸/.test(read(rel)), claims: c.testids.length });
    familyCounts.libUnits += c.libUnits.length;
    familyCounts.리뷰기록 += c.reviews.length;
    familyCounts.리뷰회수 += c.reviewRuns.length;
    familyCounts.부분집합리뷰 += c.reviewsFrom.length;
    familyCounts.묶음범위 += c.ranges.length;
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
      if (g.count !== null) {
        const real = live.countInRange(g.start, g.end);
        if (g.count !== real) problems.push(`${rel}: "${g.raw} … ${g.countRaw}" 가 맞지 않는다 — 로드맵에 ${g.start}~${g.end} 묶음은 ${real}개`);
      }
    }
    for (const u of c.cumulative) {
      if (u.end !== live.newestBatch || (live.cumCount !== null && u.count !== live.cumCount)) {
        const miss = live.missingNos.length > 0 ? ` (빠진 번호: ${live.missingNos.join('·')} — 산수로 적지 마세요)` : '';
        // 373(369~371 리뷰 L-2): 전에는 실측 번호와 다른 줄의 값을 **합성해** 따옴표로 적어,
        //      문서에서 검색해도 찾을 수 없는 문구를 인용했다. 읽은 **원문**을 그대로 인용한다.
        problems.push(`${rel}: 적힌 "${u.raw}" 가 실측과 다르다 — 로드맵의 묶음 줄을 세면 155~${live.newestBatch} 는 ${live.cumCount}개다${miss}`);
      }
    }
    for (const v of c.reviews) {
      if (v.count !== live.reviewFiles) problems.push(`${rel}: "${v.raw}" 가 낡았다 — docs/REVIEW-*.md 는 ${live.reviewFiles}건`);
    }
    // 341(리뷰 H-1): "독립 리뷰 N회(이 기간만 M회)" — 리뷰 1회 = 기록 1건
    for (const v of c.reviewRuns) {
      if (v.total !== live.reviewFiles) {
        problems.push(`${rel}: "${v.raw}" 가 낡았다 — 리뷰 기록은 ${live.reviewFiles}건이다(리뷰 1회 = 기록 1건)`);
      }
      if (v.subset !== null) {
        // 347(리뷰 M-1): 344 는 "가장 큰 시작 번호" 로 바꿨는데 그것도 틀린 기준이었다 —
        // 그 문서에 `341~346` 같은 줄이 하나 들어오면 정당한 줄이 **거짓 경보**를 만들고(리뷰 B),
        // 범위를 누계 꼴로만 적은 문서에서는 `real === null` 로 **조용히 넘어갔다**(리뷰 C).
        // "이 기간" 은 그 문서가 **자기 보고 범위로 선언한 것**이다 — 완료 묶음·출장 기간 같은 표시가 붙은 범위.
        const scoped = c.ranges.filter(g => g.start >= 155 && /완료 묶음|출장 기간|묶음 범위|지점이 보는 변화/.test(g.raw));
        const pool = scoped.length > 0 ? scoped : c.ranges.filter(g => g.start >= 155);
        const starts = [...new Set(pool.map(g => g.start))].sort((a, b) => a - b);
        const base = starts.length > 0 ? starts[starts.length - 1] : null;
        if (base === null) {
          problems.push(`${rel}: "${v.raw}" 가 "이 기간만" 을 적었는데 이 문서는 **자기 보고 범위를 선언하지 않았다** — "완료 묶음 NNN~MMM" 같은 줄이 있어야 셀 수 있다`);
        } else {
          const real = live.reviewsFromCount(base);
          if (v.subset !== real) {
            problems.push(`${rel}: "${v.raw}" 의 "이 기간만" 이 맞지 않는다 — 이 문서가 선언한 보고 범위(${base} 번부터)로 세면 ${real}건`);
          }
        }
      }
    }
    // 335(검사 ⑬): 부분 집합 주장도 센다
    for (const v of c.reviewsFrom) {
      const real = live.reviewsFromCount(v.from);
      if (v.count !== real) problems.push(`${rel}: "${v.raw}…" 가 낡았다 — ${v.from} 번 이상을 다루는 리뷰 기록은 ${real}개`);
    }
  }
  // 372(리뷰 H-2): 화면 칸은 문서별 바닥도 걸 수 있다 — 이 블록 안에서 모은 자료로 본다
  problems.push(...perDocFloorProblems(idDocs, '화면 칸'));
}

// ③ 문서가 가리키는 파일이 실재하는가
{
  const docs = fs.readdirSync(path.join(ROOT, 'docs')).filter(f => f.endsWith('.md'));
  let pointerSeen = 0;
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
      pointerSeen += 1;
    }
  }
  // 376(372~374 리뷰 M-7): 배선을 끊어도(읽는 글을 빈 문자열로 바꾸면) 아무 덫도 물지 않았다 —
  //      순수 함수에는 덫이 있지만 **부르는 줄**에는 없다. 본 수를 찍고 0이면 신고한다.
  console.log(`[check-docs-claims] ③ 문서 ${docs.length}개에서 가리킨 파일 ${pointerSeen}개 확인`);
  if (docs.length === 0 || pointerSeen === 0) problems.push('③ 이 문서 포인터를 한 개도 읽지 못했다 — 배선이 끊겼다(376)');
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

// ⑭ 브리핑 품질 장치 표 (341)
{
  // 344(리뷰 H-1): 파일 이름을 박아 두면 다음 브리핑이 생기는 순간 조용히 검사 밖이 된다 —
  // 301·307 이 검사 ⑥·CURRENT_DOCS 에서 메운 바로 그 구멍을 341 이 다시 냈다. 글롭으로 가장 최근 것을 본다.
  const brief = newestBriefing();
  if (brief === null) {
    problems.push('docs/OWNER-BRIEFING-*.md 가 없다 — 품질 장치 표를 검사할 문서가 없다(검사 ⑭)');
  } else {
    const miss = missingGuardRows(read(brief), read('scripts/gate-light.mjs'), JSON.parse(read('package.json')).scripts);
    for (const g of miss) {
      if (g === '!없는 절') { problems.push(`${brief}: "## 5." 절이 없다 — 품질 장치 표를 찾을 수 없다(검사 ⑭)`); continue; }
      problems.push(`${brief}: §5 품질 장치 표에 \`npm run ${g}\` 줄이 없다 — 게이트는 돌리는데 오너는 모른다`);
    }
  }
}

// ⑮ 테스트 exe 빌드 시각 (341)
{
  const branch = asarStamp('release/win-unpacked/resources/app.asar');
  const admin = asarStamp('release-admin/win-unpacked/resources/app.asar');
  if (!branch || !admin) {
    // 344(리뷰 M-2): 조용히 건너뛰면 CI 에서는 **없는 검사**인데 문서는 "가드가 지킨다" 고 적는다
    console.log('[check-docs-claims] ⑮ 건너뜀 — release/·release-admin 의 app.asar 가 없습니다(이 검사는 exe 를 빌드한 PC 에서만 돕니다)');
  }
  if (branch && admin) {
    let seen = 0;
    for (const rel of CURRENT_DOCS) {
      if (!fs.existsSync(path.join(ROOT, rel))) continue;
      for (const c of exeTimeClaims(read(rel))) {
        seen += 1;
        const dateOff = c.md !== null && c.md !== branch.md;
        if (dateOff || c.branch !== branch.hm || c.admin !== admin.hm) {
          problems.push(`${rel}: "…${c.raw}" 가 낡았다 — 지금 빌드는 ${branch.md} ${branch.hm}/${admin.hm}(asar 수정 시각). 과거 기록이면 "테스트 exe" **앞**에 "당시" 를 적으세요(예: 11-25 당시 테스트 exe …)`);
        }
      }
    }
    // 376(리뷰 H-2): 무엇을 봤는지 찍고, 계열 바닥이 세도록 넘긴다
    console.log(`[check-docs-claims] ⑮ 테스트 exe 시각 주장 ${seen}개 대조(지금 빌드 ${branch.md} ${branch.hm}/${admin.hm})`);
    familyCounts.exe시각 = seen;
  } else {
    // asar 이 없는 환경(CI)에서는 이 계열을 바닥에서 뺀다 — 셀 수 없는 것을 신고하지 않는다
    delete familyCounts.exe시각;
  }
}

// ⑯ 코어 잠금 문서의 표 ↔ scripts/core-lock.mjs (353)
{
  const doc = 'docs/CORE-LOCK.md';
  if (!fs.existsSync(path.join(ROOT, doc))) {
    problems.push(`${doc}: 코어 잠금 문서가 없다 — CLAUDE.md §1 이 상세로 가리키는 문서다(검사 ⑯)`);
  } else {
    for (const p of lockDocProblems(read(doc), [...CORE_FILES, ...CORE_DIRS])) problems.push(`${doc}: ${p}`);
  }
}

// ⑰ 브리핑 §4 가 선언한 범위 ↔ 표가 덮는 묶음 집합 (353)
{
  const brief = newestBriefing();
  if (brief === null) {
    problems.push('docs/OWNER-BRIEFING-*.md 가 없다 — §4 의 묶음 집합을 검사할 문서가 없다(검사 ⑰)');
  } else {
    for (const p of section4Problems(read(brief), allBatchNos(read(ROADMAP)))) problems.push(`${brief}: ${p}`);
    // 363(리뷰 L-5): 모양이 아니어서 **번호로 읽지 않은 칸**을 찍는다 — 조용히 빠지는 것을 막는다
    const sc = section4Scope(read(brief));
    if (sc !== null && sc.skippedCells.length > 0) {
      console.log(`[check-docs-claims] ⑰ 번호로 읽지 않은 §4 첫 칸 ${sc.skippedCells.length}개: ${sc.skippedCells.join(' · ')}`);
    }
  }
}

// ⑱ 로드맵의 시각 ↔ git 커밋 시각 (354)
{
  const commits = commitTimes();
  if (commits === null) {
    console.log('[check-docs-claims] ⑱ 건너뜀 — git log 를 읽을 수 없습니다');
  } else {
    const rows18 = timeClaimRows(read(ROADMAP));
    // 366(리뷰 L-8): 자기가 본 줄 수를 찍는다 — 354 가 적은 "이제 세어서 찍는다" 를 사실로 만든다
    console.log(`[check-docs-claims] ⑱ 시각을 대조한 줄 ${rows18.length}개(묶음 ${rows18.filter(r => r.kind === '묶음').length} + 재검증 ${rows18.filter(r => r.kind === '재검증').length})`);
    for (const r of rows18) {
      const c = commits.find(x => x.h.startsWith(r.hash));
      if (!c) continue; // 해시 실재는 ① 이 본다
      const d = timeGap(r.md, r.hm, c.md, c.hm, c.y);
      // 361(리뷰 L-1): 이제 timeGap 은 **없는 날짜**에 null 을 돌려준다(356 에서 죽은 가지로 지웠던 자리가
      // 실은 막아야 할 구멍이었다 — `11-31` 같은 날을 적어도 가드가 "맞다" 고 말했다).
      if (d === null) { problems.push(`${ROADMAP}: ${r.kind} ${r.no} 줄의 날짜 ${r.md} 는 **없는 날짜**다(커밋은 ${c.md} ${c.hm})`); continue; }
      if (d < -TIME_BEFORE) problems.push(`${ROADMAP}: ${r.kind} ${r.no} 줄의 시각 ${r.md} ${r.hm} 는 커밋(${c.md} ${c.hm})보다 ${-d}분 뒤다 — 아직 오지 않은 시각을 적었다(시계를 읽어 적으세요)`);
      else if (d > TIME_AFTER) problems.push(`${ROADMAP}: ${r.kind} ${r.no} 줄의 시각 ${r.md} ${r.hm} 가 커밋(${c.md} ${c.hm})보다 ${d}분 앞이다 — 시각을 사실대로 적으세요`);
    }
  }
}

// ⑳ 가장 새 묶음 줄의 "덫 N종" 이 가드가 찍는 수인가 (366)
{
  const { no, line } = newestTrapClaims(read(ROADMAP));
  const pairs = line ? pairTrapClaims(line) : [];
  // 372(369~371 리뷰 H-1): **⑳ 에는 바닥이 없었다.** `덫 106종` 을 `덫 106개` 로 한 글자만 바꾸면
  //      `pairs` 가 비어 블록 전체가 no-op 이 되고, 370 이 더한 **죽은 가드 신고까지 함께 꺼졌다**
  //      (리뷰가 심어 보였고 나도 재현했다). 369 가 ⑪-2 에서 비교를 `if` 밖으로 꺼낸 그 결함이
  //      ⑳ 에 그대로 남아 있었다 — "내 덫이 아무것도 보지 않는다" 의 일곱 번째다.
  //      묶음 줄은 **늘 덫 수를 적는다**(이 저장소의 규칙)이므로 면제가 필요 없다.
  problems.push(...trapFloorProblems(no, line, pairs));
  // 죽은 가드 신고는 주장이 없어도 해야 한다 — `if` 밖으로 꺼낸다
  {
    const printedAlways = pairs.length > 0 ? null : trapCountsPrinted();
    if (printedAlways) for (const g of printedAlways.dead) problems.push(`scripts/${g}.mjs --selftest 가 실패했다 — ⑳ 이 그 가드의 덫 수를 알 수 없다(먼저 그 가드를 보세요)`);
  }
  if (pairs.length > 0) {
    const printed = trapCountsPrinted();
    const pkg = read('package.json');
    const res = trapClaimProblems(pairs, printed, npm => guardScriptOf(pkg, npm));
    console.log(`[check-docs-claims] ⑳ 묶음 ${no} 줄의 덫 수 주장 ${pairs.length}개(가드 이름 짝 ${pairs.length - res.unpaired}개) / 가드가 찍는 수 ${[...printed.seen].sort((a, b) => a - b).join('·')}`);
    for (const p of res.problems) problems.push(`${ROADMAP}: ${p}`);
    // 372(리뷰 M-2): 짝이 없으면 합집합과 겨루게 되고 허용값이 여럿이다 — **짝을 적으라고** 신고한다
    if (res.unpaired > 0) problems.push(`${ROADMAP}: 묶음 ${no} 줄의 덫 수 ${res.unpaired}개에 **가드 이름이 붙어 있지 않다** — \`덫 N종(\\\`check:docs\\\`)\` 처럼 적으세요(짝이 없으면 다른 가드의 수로도 통과합니다)`);
    // 370(리뷰 M-4): 가드가 **죽으면** 그 수가 조용히 집합에서 빠진다 — 죽은 가드를 신고한다
    for (const g of printed.dead) problems.push(`scripts/${g}.mjs --selftest 가 실패했다 — ⑳ 이 그 가드의 덫 수를 알 수 없다(먼저 그 가드를 보세요)`);
  }
  // 370(리뷰 L-3): 새로 적는 재검증 차수가 직전+1 인가
  const rn = recheckNumbers(read(ROADMAP));
  console.log(`[check-docs-claims] ⑳-2 재검증 줄 ${rn.length}개 · 가장 새 차수 ${rn.length > 0 ? Math.max(...rn) : "(없음)"}(오름 블록 + 내림 블록)`);
  for (const p of recheckSequenceProblems(rn)) problems.push(`${ROADMAP}: ${p}`);
}

// ⑲ 자기를 가리키는 문장이 자기 커밋을 말하는가 (363)
{
  const commits = commitTimes();
  if (commits !== null) {
    const selfClaims = selfTimeClaims(read(ROADMAP));
    console.log(`[check-docs-claims] ⑲ 자기를 가리킨 시각 주장 ${selfClaims.length}개`);
    for (const r of selfClaims) {
      const c = commits.find(x => x.h.startsWith(r.hash));
      if (!c) continue; // 해시 실재는 ① 이 본다
      if (c.hm !== r.hm) {
        problems.push(`${ROADMAP}: 묶음 ${r.no} 줄이 "이 줄의 … 커밋은 ${r.hm}" 이라고 적었는데 그 줄의 커밋(${r.hash})은 ${c.hm} 이다 — 다른 줄의 문장이 끌려왔는지 보세요(360~362 리뷰 H-1)`);
      }
    }
  }
}

// 341(리뷰 M-5): 로드맵이 스스로 적은 **마지막 누계**도 실측과 맞아야 한다 — 전에는 이 값을 사실로 믿었다
{
  const live2 = liveNumbers();
  if (live2.cumClaimed !== null && live2.cumClaimed !== live2.cumCount) {
    const miss = live2.missingNos.length > 0 ? ` (빠진 번호: ${live2.missingNos.join('·')})` : '';
    problems.push(`${ROADMAP}: 마지막 "누계 155~${live2.newestBatch} 묶음 ${live2.cumClaimed}개" 가 실측과 다르다 — 묶음 줄을 세면 ${live2.cumCount}개${miss}`);
  }
}

// ⑭ **오너 브리핑의 품질 장치 표에 게이트의 가드가 빠지지 않았는가** (341, 335~340 리뷰 M-2)
//
// 왜: 브리핑 §5 는 오너가 "무엇이 기계로 막히나" 를 읽는 자리다. 335 가 세 줄을 더한 바로 다음
//     묶음에서 `check:e2e-conv` 가 또 빠졌고, `check:routes`·`check:distribution` 은 처음부터 없었다.
//     ⑬ 은 **수**만 보고 **빠진 줄**은 보지 못한다. 기준은 "게이트가 실제로 돌리는 것" 이다.
// ⑱ **로드맵이 적은 시각은 git 이 아는 커밋 시각과 맞아야 한다** (354)
//
// 왜: 353 에서 전수로 재니 묶음·재검증 줄 **27곳**이 어긋나 있었고 가장 심한 자리는 **3시간 39분**
//     이었다(352 는 10:5x 라고 적었지만 실제 커밋은 07:11). 342 부터 벌어진 것인데, 원인은
//     **시계를 읽지 않고 앞 묶음 시각에 더해 적은 것**이다. 오너는 월요일에 이 시각으로 "한 묶음에
//     얼마나 걸렸나" 를 읽는다 — 틀린 시각은 그 판단을 조용히 왜곡한다. git 이 정본인 비교라
//     352 가 받아들인 경계선 안에 있다(코드·VCS 가 답을 아는 것만 가드로 만든다).
/** 묶음 줄·재검증 줄에서 (시각, 묶음 번호, 해시)를 모은다 */
function timeClaimRows(text) {
  const hashOfBatch = new Map();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = /^- \[x\] (\d{3,4}) — /.exec(line);
    const h = hashOf(line);
    if (m && h && Number(m[1]) < 2000) hashOfBatch.set(Number(m[1]), h);
  }
  const out = [];
  for (const line of lines) {
    const bm = /^- \[x\] (\d{3,4}) — /.exec(line);
    const rm = /^- \d{4}-(\d{2})-(\d{2}) (\d{2}):(\d)([0-9x]) \d{3,4}차 재검증\((\d{3,4})[,)]/.exec(line);
    let row = null;
    if (bm && Number(bm[1]) < 2000) {
      const t = /\((\d{2})-(\d{2}) (\d{2}):(\d)([0-9x])/.exec(line);
      if (t) row = { no: Number(bm[1]), md: t[1] + '-' + t[2], hm: t[3] + ':' + t[4] + t[5], kind: '묶음' };
    } else if (rm) {
      row = { no: Number(rm[6]), md: rm[1] + '-' + rm[2], hm: rm[3] + ':' + rm[4] + rm[5], kind: '재검증' };
    }
    if (row === null) continue;
    const hash = hashOfBatch.get(row.no);
    if (!hash) continue; // 243 번 이전 줄은 해시가 없다 — git 에 물을 것이 없다
    out.push({ ...row, hash });
  }
  return out;
}
/** 적은 시각과 커밋 시각의 분 차이 — 0 이면 맞다. 음수는 적은 시각이 그만큼 미래 */
function timeGap(md, hm, cmd, chm, cYear = 2026) {
  if (md === cmd) return timeGapSameDay(hm, chm);
  // 356(352~354 리뷰 H-3): 전에는 `월*31 + 일` 로 셌다. 11월은 30일이므로 **11-30 → 12-01 이
  // 이틀**로 계산돼 1455분 어긋남을 신고했고(릴리스 경로가 이틀 뒤 막힐 자리였다), 12-31 → 01-01 은
  // -535665 분이 나왔다. 달력으로 센다. 기록은 MM-DD 만 적으므로 **연도는 커밋 연도 전후에서
  // 가장 가까운 해**를 고른다 — 그래야 해를 넘기는 자리(12-31 ↔ 01-01)가 맞는다.
  // 361(리뷰 L-1): `Date.UTC` 는 **없는 날짜를 다음 달로 굴린다** — 그래서 `11-31`·`02-30`·`04-31` 처럼
  // 존재하지 않는 날을 적어도 가드가 "맞다"(gap 0) 고 말했다(전수 탐색에서 20개 조합). 되읽어 월·일이
  // 보존되는지 확인하고, 어느 해에도 성립하지 않으면 **null** 을 돌려 호출부가 신고하게 한다.
  const dayIndex = (x, y) => {
    const mm = Number(x.slice(0, 2)), dd = Number(x.slice(3));
    const t = Date.UTC(y, mm - 1, dd);
    const d = new Date(t);
    if (d.getUTCMonth() + 1 !== mm || d.getUTCDate() !== dd) return null; // 없는 날짜
    return Math.floor(t / 86400000);
  };
  const ci = dayIndex(cmd, cYear);
  if (ci === null) return null;
  const within = timeGapSameDay(hm, chm);
  // 363(리뷰 L-4): ±1 만 보면 **02-29 가 "없는 날짜" 로 거짓 신고**된다(2025·2026·2027 에 윤년이 없다).
  // ±2 로 넓히면 윤년이 반드시 들어오고, 엉뚱한 해를 골라 어긋남을 숨길 위험은 없다 —
  // 한 해만 틀려도 차이가 50만 분이라 허용 몫(-2~+20)에 들 수 없다.
  let best = null;
  for (const y of [cYear - 2, cYear - 1, cYear, cYear + 1, cYear + 2]) {
    const si = dayIndex(md, y);
    if (si === null) continue;
    const g = (ci - si) * 1440 + within;
    if (best === null || Math.abs(g) < Math.abs(best)) best = g;
  }
  return best; // 전부 없는 날짜면 null
}
function timeGapSameDay(hm, chm) {
  const toMin = x => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
  const low = toMin(hm.endsWith('x') ? hm.replace('x', '0') : hm);
  const high = toMin(hm.endsWith('x') ? hm.replace('x', '9') : hm);
  const t = toMin(chm);
  if (t < low) return t - low;
  if (t > high) return t - high;
  return 0;
}
/**
 * ⑲ **자기를 가리키는 문장이 자기 커밋을 말하는가** (363, 360~362 리뷰 H-1)
 *
 * 왜: 361·362 를 넣을 때 내 패치가 **앞 줄의 꼬리를 그 줄로 끌어갔다** — 360 의
 * "**[자기 정정]** 이 줄의 시각을 처음에 09:42 로 적었다 — 커밋은 09:37" 이 362 줄 끝으로 옮겨져,
 * 362 줄이 **자기에 대해 거짓**을 말했다(362 의 커밋은 09:54). ⑱ 은 한 줄의 **첫** 시각만 보므로
 * 이 모양을 구조적으로 못 본다.
 *
 * 좁은 검사임을 밝혀 둔다: **"이 줄의"** 라고 스스로를 가리킨 문장에서 `커밋은 HH:MM` 을 적었을 때만
 * 본다. 다른 묶음의 커밋 시각을 인용하는 문장(354 가 342 의 04:13 을 적은 것처럼)은 "이 줄의" 가
 * 없으므로 걸리지 않는다 — 그 구분이 기계가 셀 수 있는 유일한 경계다.
 */
function selfTimeClaims(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    // 376(372~374 리뷰 M-8): `이 줄의` 다섯 글자에만 걸려 `이 기록 줄의`·`이 묶음 줄의` 로 적으면
    //      자기 지칭 거짓이 통과했다(리뷰가 심어 보였다). 같은 뜻의 말투를 함께 받는다.
    //      바닥은 두지 않는다 — 자기를 가리키는 문장은 **없을 수도 있는** 글이라 0개가 잘못은 아니다.
    if (!/이 (?:기록 |묶음 )?줄의/.test(line)) continue;
    const b = /^- \[x\] (\d{3,4}) — /.exec(line);
    const h = hashOf(line);
    if (!b || !h || Number(b[1]) >= 2000) continue;
    // 366(363~365 리뷰 L-3): 전에는 **줄의 첫 매치**만 보고 ASCII 따옴표만 셌다. 모든 매치로 넓히니
    // **거짓 경보**가 났다 — 363 줄의 "(362 의 커밋은 09:54)" 를 자기 주장으로 읽었다. "이 줄의" 와
    // 어느 시각이 묶이는지는 **말의 관계**라 줄 단위로는 알 수 없으므로 **위치로** 묶는다:
    // 각 "이 줄의" **뒤에 처음 오는** 커밋 시각 하나만 그 자기 지칭의 주장으로 본다(다음 "이 줄의" 전까지).
    // 그러면 리뷰가 걱정한 "인용이 먼저, 진짜가 나중" 도 자기 지칭마다 따로 보므로 함께 덮인다.
    const selfPos = [...line.matchAll(/이 (?:기록 |묶음 )?줄의/g)].map(x => x.index);
    for (let k = 0; k < selfPos.length; k += 1) {
      const from = selfPos[k];
      const until = k + 1 < selfPos.length ? selfPos[k + 1] : line.length;
      const m = /커밋은 (\d{2}):(\d{2})/.exec(line.slice(from, until));
      if (!m) continue;
      const before = line.slice(0, from + m.index);
      const ascii = (before.match(/"/g) || []).length;
      const open = (before.match(/[“‘]/g) || []).length;
      const close = (before.match(/[”’]/g) || []).length;
      // ASCII 는 홀짝으로, 한글 따옴표는 **열린 것이 더 많으면** 인용 안이다
      if (ascii % 2 === 1 || open > close) continue;
      out.push({ no: Number(b[1]), hm: m[1] + ':' + m[2], hash: h });
    }
  }
  return out;
}

/**
 * ⑳ **기록이 적은 "덫 N종" 이 어느 가드도 찍지 않는 수인가** (366, 363~365 리뷰 H-3)
 *
 * 왜: 363 의 기록이 삽입기 덫을 **6종**으로 적었는데 가드는 **7종**을 찍고 있었다. 하필 그 묶음이
 * "이 수는 세어서 찍는다 — 손으로 적지 말 것" 을 가드 안에 박아 둔 묶음이다. 가드 출력이 정본인
 * 비교이므로 352 의 경계선 안이다.
 *
 * 범위: **가장 새 묶음 줄 하나**만 본다 — 지난 줄의 수는 그때의 사실이다(역사 조작 금지, 350).
 * 한계: 다른 가드의 수와 **우연히 같은** 틀린 수는 통과한다.
 */
/**
 * 370(366~368 리뷰 M-4): 가드 **이름별로** 모은다. 전에는 합집합 하나였고 허용값이 7개여서
 * `덫 43종(check:docs)` 처럼 **다른 가드의 수**를 적어도 통과했다(리뷰가 심어 확인).
 * 그리고 `--selftest` 의 **종료 코드를 보지 않아** 가드가 죽으면 그 수가 조용히 집합에서 빠졌다
 * (리뷰의 사본에서 실제로 69 가 사라졌다) — 이제 죽은 가드를 신고한다.
 */
function trapCountsPrinted() {
  // 373(369~371 리뷰 M-2 의 뿌리): 전에는 **여덟 개를 박아** 두었다. 기록이 그 밖의 가드를 짝으로
  //      적으면 짝을 찾지 못해 합집합으로 떨어졌다(372 가 "짝을 적어라" 로 막았지만, 목록 자체가
  //      낡는 것은 그대로였다). `package.json` 의 `check:*` 가 정본이다 — 가드를 늘리면 함께 늘어난다.
  const guards = guardScriptsFromPkg(read('package.json'));
  const byGuard = new Map();
  const dead = [];
  const seen = new Set();
  for (const g of guards) {
    const r = spawnSync(process.execPath, [path.join('scripts', g + '.mjs'), '--selftest'], { cwd: ROOT, encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    const mine = new Set();
    for (const m of out.matchAll(/덫 \*{0,2}(\d+)종/g)) { mine.add(Number(m[1])); seen.add(Number(m[1])); }
    byGuard.set(g, mine);
    if (r.status !== 0) dead.push(g);
  }
  return { seen, byGuard, dead };
}

/**
 * ⑳ 바닥 (372, 369~371 리뷰 H-1) — 가장 새 묶음 줄에 **덫 수 주장이 하나라도** 있어야 한다.
 * `덫 N개`·`덫은 N종` 처럼 단위/어순을 바꾸면 ⑳ 이 통째로 꺼졌다. 단위만 다른 모양은
 * **무엇이 잘못됐는지 집어서** 말한다(그냥 "없다" 보다 고치기 쉽다).
 */
function trapFloorProblems(no, line, pairs) {
  if (pairs.length > 0) return [];
  if (!line) return ['로드맵에서 묶음 줄을 찾지 못했다 — ⑳ 이 아무것도 대조하지 않는다(372)'];
  const near = line.match(/덫 \*{0,2}\d+(개|가지|종류)|덫(?:은|이)\s*\*{0,2}\d+종/);
  if (near) return [`묶음 ${no} 줄이 덫 수를 "${near[0]}" 로 적었다 — ⑳ 은 \`덫 N종\` 만 읽는다(단위/어순을 맞추세요). 지금은 ⑳ 이 꺼진 상태다(372)`];
  return [`묶음 ${no} 줄에 **덫 수 주장이 없다** — ⑳ 이 아무것도 대조하지 않는다. 가드가 찍는 \`덫 N종(\\\`check:X\\\`)\` 를 그대로 옮기세요(372)`];
}

/**
 * `package.json` 의 `check:*` 가 부르는 스크립트 이름들 (373).
 * `--selftest` 를 받는 가드만 덫 수를 찍으므로, 그 스크립트 전부를 돌려 모은다.
 */
function guardScriptsFromPkg(pkgText) {
  let scripts = {};
  try { scripts = JSON.parse(pkgText).scripts || {}; } catch { return []; }
  const out = new Set();
  for (const [name, cmd] of Object.entries(scripts)) {
    if (!name.startsWith('check:')) continue;
    for (const m of String(cmd).matchAll(/scripts\/([a-z0-9-]+)\.mjs/g)) out.add(m[1]);
  }
  return [...out].sort();
}

/** `check:docs` 같은 npm 이름 → 스크립트 파일. package.json 이 정본이다(표를 두지 않는다) */
function guardScriptOf(pkgText, npmName) {
  let scripts = {};
  try { scripts = JSON.parse(pkgText).scripts || {}; } catch { return null; }
  const cmd = scripts[npmName];
  if (!cmd) return null;
  const m = /scripts\/([a-z0-9-]+)\.mjs/.exec(cmd);
  return m ? m[1] : null;
}

/**
 * 덫 수 주장을 **그 줄에 적힌 가드 이름과 짝지어** 돌려준다 (370).
 * `덫 85종(\`check:docs\`)` → { n: 85, npm: 'check:docs' }. 짝이 없으면 npm: null.
 */
function pairTrapClaims(line) {
  const out = [];
  for (const m of line.matchAll(/덫 \*{0,2}(\d+)종/g)) {
    const before = line.slice(0, m.index);
    const ascii = (before.match(/"/g) || []).length;
    const open = (before.match(/[“‘]/g) || []).length;
    const close = (before.match(/[”’]/g) || []).length;
    if (ascii % 2 === 1 || open > close) continue;
    const after = line.slice(m.index + m[0].length, m.index + m[0].length + 30);
    // 370: 굵게 닫는 `**` 가 `종` 과 가드 이름 **사이**에 온다(`덫 **85종**(check:docs)`) —
    //      이 두 글자를 건너뛰지 않으면 짝짓기가 조용히 실패한다(덫을 쓰면서 그 자리를 봤다).
    // 374: 괄호 안에 설명이 이어지는 자연스러운 글도 읽는다(`덫 8종(`check:notes`: 있는 이름…)`).
    //      전에는 괄호가 **가드 이름 바로 뒤에서 닫혀야** 했고, 넓힌 판도 괄호 안 설명이 40자를 넘으면
    //      못 읽었다 — **내 덫 입력이 실제 글보다 짧아** 그 한계를 보여 주지 못했다(374 에서 겪었다).
    //      이제 닫는 괄호를 요구하지 않고 **여는 괄호 바로 뒤의 이름**만 본다.
    const g = /^\*{0,2}\s*\(`?(check:[a-z0-9-]+)`?/.exec(after);
    out.push({ n: Number(m[1]), npm: g ? g[1] : null });
  }
  return out;
}

/** 짝지은 주장을 그 가드의 수와만 겨룬다. 짝이 없으면 합집합과 겨루고 그 사실을 함께 돌려준다 */
function trapClaimProblems(pairs, printed, scriptOf) {
  const out = [];
  let unpaired = 0;
  for (const c of pairs) {
    const script = c.npm ? scriptOf(c.npm) : null;
    const mine = script ? printed.byGuard.get(script) : null;
    if (mine) {
      if (!mine.has(c.n)) out.push(`묶음 줄이 "덫 ${c.n}종(${c.npm})" 이라고 적었는데 그 가드가 찍는 수는 ${[...mine].join("·") || "(없음)"} 다 — 가드의 \`--selftest\` 출력을 그대로 옮기세요`);
      continue;
    }
    unpaired += 1;
    if (!printed.seen.has(c.n)) out.push(`묶음 줄이 "덫 ${c.n}종" 이라고 적었는데 **어느 가드도 그 수를 찍지 않는다** — 가드의 \`--selftest\` 출력을 그대로 옮기세요(지금 찍히는 수: ${[...printed.seen].sort((a, b) => a - b).join("·")})`);
  }
  return { problems: out, unpaired };
}
/**
 * 370(366~368 리뷰 L-3): **새로 적는 재검증 차수가 직전+1 인가.** 번호는 370 까지 올라갔는데
 * 엄격 형식 줄은 **270개**이고 246·298·299·301·302·311·312·325 가 없고 326 이 두 번 있다 —
 * (376 정정: 370 이 적은 "360개" 는 틀렸다 — `차 재검증` 이 들어간 모든 줄 372곳과 섞어 센 수였다.
 *  372~374 리뷰 L-3 이 세어 보였고 나도 셌다. 주석의 수도 기록이라 틀리면 다음 사람을 잘못된
 *  전제로 보낸다.)
 * 어느 가드도 이 번호를 보지 않았다. 과거 줄은 고치지 않는 규칙이므로 **맨 위 두 줄만** 본다.
 */
function recheckSequenceProblems(numbers) {
  if (numbers.length === 0) return ['재검증 줄을 한 개도 읽지 못했다 — ⑳-2 가 아무것도 보지 않는다(372)'];
  if (numbers.length < 2) return [];
  const max = Math.max(...numbers);
  const at = numbers.indexOf(max);
  if (numbers.lastIndexOf(max) !== at) return [`재검증 차수 ${max} 가 두 번 적혀 있다 — 새 줄의 차수는 직전+1 이어야 한다(370)`];
  const below = numbers[at + 1];
  // 372(369~371 리뷰 M-1): 전에는 `below === undefined` 면 **조용히 통과**했다 — 그래서 새 줄을
  //      **문서 맨 끝**에 붙이면 차수가 399 여도 아무 말이 없었다(리뷰가 심어 보였고 나도 재현했다).
  //      가장 큰 차수가 마지막 줄에 있다는 것은 **내림 블록 맨 위가 아니라는 뜻**이므로 신고한다.
  if (below === undefined) return [`가장 새 재검증 줄(${max}차)이 문서의 **마지막 재검증 줄**이다 — 새 줄은 내림 블록 **맨 위**에 와야 한다(372)`];
  if (below !== max - 1) return [`가장 새 재검증 줄이 ${max}차인데 그 아래 줄은 ${below}차다 — 새 줄은 직전+1(${below + 1}차)로 **내림 블록 맨 위**에 와야 한다(370)`];
  // 373(369~371 리뷰 L-1): 370·372 는 **최댓값과 그 아래 한 줄**만 봤다. 그래서 최댓값이 아닌 자리에
  //      같은 차수를 한 번 더 적어도 조용했다(리뷰가 심어 보였다). 전수 중복 검사는 **역사 줄의**
  //      **326 중복**을 건드리게 되므로(과거는 고치지 않는다) **최댓값 아래 창**만 본다 —
  //      지금 1씩 줄어드는 구간은 **48줄**(373→326)이라 창 10줄은 그 안에 넉넉히 들어간다.
  //      한계: 창보다 깊은 불규칙(326 중복·빠진 246·298~302·311·312·325)은 설계상 보지 않는다.
  const WINDOW = 10;
  for (let i = at; i < Math.min(at + WINDOW, numbers.length) - 1; i += 1) {
    const a = numbers[i];
    const b = numbers[i + 1];
    if (b === a) return [`재검증 차수 ${a} 가 잇따라 두 번 적혀 있다 — 새 줄의 차수는 직전+1 이어야 한다(373)`];
    if (b !== a - 1) return [`재검증 차수가 ${a} 다음에 ${b} 다 — 맨 위 ${WINDOW}줄은 1씩 줄어들어야 한다(373, 창보다 깊은 역사 줄은 보지 않는다)`];
  }
  return [];
}

/** 재검증 줄의 차수를 **적힌 순서대로**(새 것이 위) 모은다 */
function recheckNumbers(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2} (\d{3,4})차 재검증\(/.exec(line);
    if (m) out.push(Number(m[1]));
  }
  return out;
}

/**
 * 가장 새 묶음 줄 (366). 372(369~371 리뷰 M-6): 전에는 이 안에서 `덫 N종` 을 긁고 따옴표 홀짝까지
 * 판정했는데, 370 이 짝짓기를 `pairTrapClaims` 로 옮긴 뒤로 **프로덕션은 그 결과를 쓰지 않았다** —
 * 남은 사용처가 셀프테스트 두 덫뿐이라, 그 덫들은 **프로덕션이 보지 않는 코드**를 지키고 있었다.
 * 줄만 돌려주고 판정은 `pairTrapClaims` 한 곳에서 한다(같은 논리가 두 군데 있던 것도 정리).
 */
function newestTrapClaims(text) {
  const lines = batchLines(text);
  if (lines.length === 0) return { no: null, line: '' };
  const newest = lines.reduce((a, b) => (b.no > a.no ? b : a), lines[0]);
  return { no: newest.no, line: newest.line };
}

/** 이 브랜치의 커밋 시각 표 — git 을 한 번만 부른다 */
function commitTimes() {
  // 356(352~354 리뷰 H-2): 전에는 `format-local` 이라 **돌리는 PC 의 시간대**로 읽었다 —
  // 기록의 시각은 KST 고정이므로 UTC 러너(client-ci 가 ubuntu-latest 다)에서 **194건 거짓 경보**가 났다.
  // `format` 은 커밋 자신이 들고 있는 오프셋(+0900)으로 찍으므로 어디서 돌려도 같은 값이 나온다.
  const r = spawnSync('git', ['log', '--format=%H %ad', '--date=format:%Y-%m-%d %H:%M'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) return null;
  const out = [];
  for (const line of (r.stdout || '').split('\n')) {
    const m = /^([0-9a-f]{40}) (\d{4})-(\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(line.trim());
    if (m) out.push({ h: m[1], y: Number(m[2]), md: m[3], hm: m[4] });
  }
  return out.length === 0 ? null : out;
}

/** 가장 최근 오너 브리핑 — 없으면 null (344 리뷰 H-1: 파일 이름을 박으면 다음 브리핑이 검사 밖이 된다) */
function newestBriefing() {
  const briefs = fs.readdirSync(path.join(ROOT, 'docs')).filter(f => /^OWNER-BRIEFING-.*\.md$/.test(f)).sort();
  return briefs.length === 0 ? null : `docs/${briefs[briefs.length - 1]}`;
}

/**
 * 356(352~354 리뷰 L-3): 렌더되지 않는 곳의 표 행을 "있다" 고 세면 안 된다 —
 * `<!-- -->` 로 감싼 줄이나 코드 펜스 안의 예시를 세면, 문서에서 사라진 행이 가드를 통과한다.
 * 줄 수를 지키려 공백으로 바꾼다(소스 가드의 `scripts/lib/blank-comments.mjs` 와 같은 원칙).
 */
function hiddenBlanked(md) {
  // 361(리뷰 L-3): 세 구멍을 메웠다 — (가) 여는 펜스보다 **짧은** 줄로는 닫히지 않는다(네 겹 펜스 안의
  // 세 겹 줄이 토글을 뒤집어 예시 행이 살아남았다), (나) `~~~` 펜스도 본다, (다) HTML 주석은
  // **인라인 코드 바깥**에서만 짝짓는다(전에는 코드 조각 안의 `<!--` 가 뒤의 진짜 `-->` 와 짝지어
  // 가운데의 진짜 표 행을 지웠다). 닫히지 않은 주석은 **그대로 둔다** — 조용히 지우는 쪽이 더 위험하다.
  const out = [];
  let fence = null; // { ch, len }
  for (const line of md.split('\n')) {
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (m) {
      const ch = m[1][0], len = m[1].length;
      if (fence === null) fence = { ch, len };
      else if (ch === fence.ch && len >= fence.len) fence = null;
      out.push('');
      continue;
    }
    out.push(fence === null ? line : '');
  }
  return blankHtmlComments(out.join('\n'));
}
/** 인라인 코드 바깥의 `<!-- … -->` 만 공백으로 (361) */
function blankHtmlComments(text) {
  const res = text.split('');
  let i = 0, codeLen = 0, start = -1;
  while (i < text.length) {
    const c = text[i];
    if (c === '\n') { codeLen = 0; i += 1; continue; } // 인라인 코드는 줄을 넘지 않는다
    // 363(360~362 리뷰 L-3): **주석 안에서는** 인라인 코드를 따라가지 않는다 — 주석 안에 백틱이
    // 홀수로 있으면 `codeLen` 이 열린 채 남아 뒤의 진짜 `-->` 를 못 알아봤다(머리말은 "닫히지 않은
    // 주석만 그대로 둔다" 고 적었는데 **닫힌 주석도** 안 지워졌다 — 설명과 동작이 달랐다).
    if (c === '`' && start < 0) {
      let n = 0;
      while (text[i + n] === '`') n += 1;
      if (codeLen === 0) codeLen = n;
      else if (n === codeLen) codeLen = 0;
      i += n;
      continue;
    }
    if (codeLen === 0 && start < 0 && text.startsWith('<!--', i)) { start = i; i += 4; continue; }
    if (codeLen === 0 && start >= 0 && text.startsWith('-->', i)) {
      for (let k = start; k < i + 3; k += 1) if (res[k] !== '\n') res[k] = ' ';
      start = -1;
      i += 3;
      continue;
    }
    i += 1;
  }
  return res.join('');
}

/** 표 첫 칸만 돌려준다 — 구분 줄·머리 줄은 건너뛴다 */
function firstCells(body) {
  const out = [];
  for (const line of body.split('\n')) {
    if (!/^\|/.test(line)) continue;
    const cells = line.split('|');
    if (cells.length < 3) continue;
    const first = cells[1];
    if (/^\s*:?-+:?\s*$/.test(first)) continue;
    out.push(first);
  }
  return out;
}

/** ⑯ 코어 잠금 문서 표의 경로 집합 — 절이 없으면 null (353) */
function lockDocPaths(text) {
  const sec = hiddenBlanked(text).split(/^## 보호 대상/m)[1];
  if (sec === undefined) return null;
  const out = new Set();
  for (const first of firstCells(sec.split(/^## /m)[0])) {
    // 표는 디렉터리를 `supabase/**` 로 적고 정본은 `supabase/` 로 적는다 — 꼬리 별표만 떼고 비교한다.
    for (const m of first.matchAll(/`([^`]+)`/g)) out.add(m[1].replace(/\*+$/, ''));
  }
  return out;
}

/** ⑯ 양방향 어긋남 (353) */
function lockDocProblems(text, real) {
  const listed = lockDocPaths(text);
  if (listed === null) return ['"## 보호 대상" 절이 없다 — 잠금 목록을 찾을 수 없다(검사 ⑯)'];
  const out = [];
  for (const p of real) {
    if (!listed.has(p)) out.push(`잠금 파일 \`${p}\` 가 표에 없다 — 이 문서만 본 세션은 "잠금이 아니다" 라고 믿는다(정본: scripts/core-lock.mjs)`);
  }
  for (const p of listed) {
    if (!real.includes(p)) out.push(`표의 \`${p}\` 는 정본(scripts/core-lock.mjs)에 없다 — 잠기지 않은 파일을 잠금으로 적었다`);
  }
  return out;
}

/** ⑰ 브리핑 §4 — 머리말 범위·열거된 묶음·한 줄로 덮는 행 (353) */
function section4Scope(briefText) {
  const sec = hiddenBlanked(briefText).split(/^## 4\./m)[1];
  if (sec === undefined) return null;
  const head = sec.split('\n')[0];
  // 356(리뷰 L-4): 세 자리만 보면 네 자리 묶음(1000~)의 앞 세 자리를 번호로 읽어 **거짓 경보**가 난다
  // (`| 1000·1001 |` → "묶음 100 이 범위 밖"). 같은 파일의 allBatchNos 는 347 리뷰 L-1 로 이미 고쳤다.
  const hm = head.match(/\((\d{3,4})~(\d{3,4})/);
  const listed = new Set();
  const catchAlls = [];
  const skippedCells = [];
  for (const first of firstCells(sec.split(/^## /m)[0])) {
    if (/나머지 전부/.test(first)) {
      // 356(리뷰 L-2): 전에는 마지막 것만 남겨 **앞쪽의 거짓 덮개가 조용히 묻혔다**
      const r = first.match(/(\d{3,4})~(\d{3,4})/);
      catchAlls.push(r ? { start: Number(r[1]), end: Number(r[2]) } : { start: null, end: null });
      continue;
    }
    // 361(리뷰 L-4): 전에는 첫 칸의 **모든** 3~4자리를 번호로 읽어 `1455분`·`412px`·`run 46083001984`
    // 같은 글에서 거짓 경보를 냈다. §4 의 첫 칸은 **묶음 번호 목록**(숫자와 ·~, 그리고 굵게 표시)이
    // 아니면 묶음을 적는 칸이 아니므로, 그 모양일 때만 센다. 모양이 아니면 그 칸은 건너뛴다(사람이 읽는다).
    const bare = first.replace(/\*\*/g, '').trim();
    // 363(리뷰 L-5): 붙임표 범위(`218-222`)도 묶음 목록이다 — 전에는 그 칸을 통째로 건너뛰어
    // 그 번호들이 **검사 밖**이 됐다(조용한 거짓 통과). 건너뛴 칸 수는 호출부가 찍는다.
    if (!/^[\d·~,\-\s]+$/.test(bare)) { skippedCells.push(bare.slice(0, 20)); continue; }
    let rest = bare;
    for (const m of bare.matchAll(/(\d{3,4})[~\-](\d{3,4})/g)) {
      const a = Number(m[1]), b = Number(m[2]);
      if (a < 2000 && b < 2000) for (let i = a; i <= b; i++) listed.add(i);
    }
    rest = rest.replace(/(\d{3,4})[~\-](\d{3,4})/g, ' ');
    for (const m of rest.matchAll(/\d{3,4}/g)) {
      const n = Number(m[0]);
      if (n < 2000) listed.add(n); // 2000 이상은 묶음이 아니라 연도다(allBatchNos 와 같은 경계)
    }
  }
  return { head: hm ? { start: Number(hm[1]), end: Number(hm[2]) } : null, listed, catchAll: catchAlls[0] ?? null, catchAlls, skippedCells };
}

/**
 * ⑰ 어긋남 — batchNos 는 로드맵의 실제 묶음 번호 (353)
 *
 * **보지 않는 것**(356, 352~354 리뷰 M-5): 덮개 행이 있는 동안 이 검사는 완전성을 재지 않는다 —
 * 하는 일은 (가) 덮개 범위 == 머리말 범위, (나) **명시로 적힌** 번호가 범위 안이고 로드맵에 있는가,
 * 둘뿐이다. 그래서 "§4 가 덮지 않는 묶음 0" 은 참이지만 **동어반복**이다. 349 가 331·332·334 를
 * "내부" 로 잘못 분류한 종류(≈100개가 한 줄 아래로 들어가는 것)는 **사람만 잡는다** — 분류의
 * 참거짓은 기계가 셀 수 있는 집합이 아니기 때문이다(352 가 받아들인 경계선).
 */
function section4Problems(briefText, batchNos) {
  const sc = section4Scope(briefText);
  if (sc === null) return ['"## 4." 절이 없다 — 지점이 보는 변화 표를 찾을 수 없다(검사 ⑰)'];
  if (sc.head === null) return ['§4 머리말에 "(NNN~MMM" 범위가 없다 — 범위를 적지 않으면 표의 완전함을 셀 수 없다(검사 ⑰)'];
  const out = [];
  const { start, end } = sc.head;
  const real = new Set(batchNos);
  for (const n of [...sc.listed].sort((a, b) => a - b)) {
    if (n < start || n > end) out.push(`§4 표에 묶음 ${n} 이 적혀 있는데 머리말 범위(${start}~${end}) 밖이다`);
    else if (!real.has(n)) out.push(`§4 표의 묶음 ${n} 은 로드맵에 없다 — 없는 묶음의 변화를 적었다`);
  }
  if (sc.catchAlls.length > 1) {
    out.push(`§4 에 "나머지 전부" 행이 ${sc.catchAlls.length}개다 — 어느 것이 덮는지 알 수 없다(하나만 두세요)`);
  }
  if (sc.catchAll !== null) {
    if (sc.catchAll.start !== start || sc.catchAll.end !== end) {
      const r = sc.catchAll.start === null ? '범위 없음' : `${sc.catchAll.start}~${sc.catchAll.end}`;
      out.push(`§4 의 "나머지 전부" 행이 적은 범위(${r})가 머리말(${start}~${end})과 다르다 — 머리말만 올리면 그 행이 덮는 범위가 조용히 뒤처진다`);
    }
  } else {
    const miss = [...real].filter(n => n >= start && n <= end && !sc.listed.has(n)).sort((a, b) => a - b);
    if (miss.length > 0) {
      out.push(`§4 머리말은 ${start}~${end} 인데 표가 덮지 않는 묶음이 ${miss.length}개다(${miss.slice(0, 8).join('·')}${miss.length > 8 ? '…' : ''}) — 한 줄로 덮는 행("위 행에 없는 나머지 전부")을 두거나 열거를 채우세요`);
    }
  }
  return out;
}

/** gate-light 가 돌리는 가드의 npm 이름 — 스크립트 파일 이름으로 package.json 을 거슬러 찾는다 */
function gateGuardNames(gateSrc, scripts) {
  const files = [...new Set([...gateSrc.matchAll(/(check-[a-z0-9-]+)\.mjs/g)].map(m => m[1]))];
  const out = [];
  for (const f of files) {
    const name = Object.keys(scripts).find(k => k.startsWith('check:') && scripts[k].includes(`${f}.mjs`));
    if (name) out.push(name);
  }
  return out.sort();
}
/** 브리핑 §5 에 빠진 가드 이름 */
function missingGuardRows(briefText, gateSrc, scripts) {
  const sec = briefText.split(/^## 5\./m)[1];
  // 347(리뷰 L-5): 전에는 이 문장을 **가드 이름 자리**에 끼워 넣어 "npm run 브리핑에 …" 로 깨졌다.
  // 호출부가 구분할 수 있게 표시를 붙여 돌려준다.
  if (sec === undefined) return ['!없는 절'];
  const body = sec.split(/^## /m)[0];
  const listed = new Set([...body.matchAll(/npm run (check:[a-z0-9-]+)/g)].map(m => m[1]));
  return gateGuardNames(gateSrc, scripts).filter(g => !listed.has(g));
}

/** 글에서 "테스트 exe … MM-DD HH:MM/HH:MM" 주장을 모은다 (341) */
function exeTimeClaims(text) {
  const out = [];
  // 344(리뷰 M-1): 날짜를 **필수**로 요구해 `테스트 exe 19:56/19:57` 꼴을 놓쳤다(세션 시작 문서에 낡은 자리 1건).
  // 날짜는 있으면 보고, 없으면 시각만 본다. "당시" 가 끼어 날짜와 시각이 떨어진 꼴도 같은 길로 들어온다.
  for (const m of text.matchAll(/테스트 exe[^\n,]{0,60}?(?:(\d{2})-(\d{2})[^\n]{0,8}?)?\*{0,2}(\d{2}):(\d{2})\*{0,2}\s*\/\s*\*{0,2}(\d{2}):(\d{2})/g)) {
    // 347(리뷰 H-1): 344 가 "적중 글귀 안의 당시" 를, 이어서 내가 "시각 앞 24자의 당시" 를 면제로 넣었는데
    // 둘 다 구분력이 없었다 — 복제 실험에서 "11-25 당시 것이 아니라 지금 01:06/01:07" 같은 줄이 통과했다.
    // 과거 표시는 294 가 검증한 `markedPast` 하나만 쓴다: **"테스트 exe" 앞**에 "당시" 가 있을 때만 과거다.
    // 문서가 과거임을 먼저 밝히게 하는 쪽이 가드가 지킬 수 있는 모양이다.
    if (markedPast(text, m.index)) continue;
    // 347(리뷰 L-6): 다른 수집기에는 다 있는 인용 면제가 ⑮ 에만 없었다 — 가드가 찾아낸 옛 문구를
    // 그대로 적은 자리를 낡은 주장으로 읽지 않는다(309 가 서버 테스트 수에서 겪은 것과 같다).
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    if ((text.slice(lineStart, m.index).match(/"/g) || []).length % 2 === 1) continue;
    out.push({ md: m[1] ? `${m[1]}-${m[2]}` : null, branch: `${m[3]}:${m[4]}`, admin: `${m[5]}:${m[6]}`, raw: m[0].slice(-28) });
  }
  return out;
}
/** 어떤 시각을 **서울 기준** MM-DD/HH:MM 으로 (356) */
function seoulStamp(date) {
  // 356(352~354 리뷰 H-2 와 같은 결함): 전에는 `getHours()` 로 **돌리는 PC 의 지역시각**을 읽었다.
  // 기록의 시각은 KST 고정이라 UTC 러너·다른 시간대 PC 에서 9시간 어긋난 거짓 경보가 났다
  // (TZ=UTC 로 재현: exe 시각 주장 2건이 "낡았다" 로 신고됐다). 시간대를 못 박는다.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const g = t => parts.find(x => x.type === t).value;
  return { md: `${g('month')}-${g('day')}`, hm: `${g('hour')}:${g('minute')}` };
}
/** 실제 asar 수정 시각 — 없으면 null */
function asarStamp(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return seoulStamp(fs.statSync(full).mtime);
}

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
  // 372(리뷰 L-7): 전에는 **루프 안 대입**이었다 — 문서별로 claims 를 초기화하는 리팩터 한 번에
  //      조용히 틀려지는 모양이다. 루프 **뒤에 한 번** 센다.
  familyCounts.서버테스트 = claims.length;
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
    familyCounts.장식UI += [...text.matchAll(/단추 (\d+)개·입력칸 (\d+)개/g)].length;
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
  familyCounts.면제 = claims.length;
  // 372(리뷰 H-2): ⑪ 은 주장 수를 **찍지도 않았다** — 무엇을 봤는지 말하지 않으면 조용히 잠든다(364)
  if (!process.argv.includes('--selftest')) {
    const byGuard = claims.reduce((acc, c) => { acc[c.guard.key] = (acc[c.guard.key] || 0) + 1; return acc; }, {});
    console.log(`[check-docs-claims] ⑪ 면제·남은 수 주장 ${claims.length}개 — ${Object.entries(byGuard).map(([k, v]) => `${k} ${v}`).join(' · ') || '(없음)'}`);
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
  const docs = [];
  for (const rel of CURRENT_DOCS) {
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    const text = read(rel);
    docs.push({ rel, text, claims: modalSlotClaims(text, rel) });
  }
  // 369(리뷰 M-12): 전에는 주장을 **따로 쌓았다** — 그 한 줄을 지우면 대조가 0개가 되고 조용했다.
  //      docs 에서 파생시키면 지울 줄이 없다(변이 표적을 가드로 막기보다 **구조로 없앤다**).
  const claims = docs.flatMap(d => d.claims);
  // 369(리뷰 H-1·M-3): 주장이 0개면 통과가 아니다 — 모양을 바꿔 가드를 끄는 길을 닫는다
  problems.push(...slotFloorProblems(docs));
  // 368: 과거 서술은 대조하지 않지만 **몇 개인지 찍는다**. 369: 주제 밖·인용도 종류별로 찍는다
  const now = nowSlotClaims(claims);
  const past = pastSlotClaims(claims);
  const skipped = skippedSlotClaims(claims);
  let compared = 0;
  if (!process.argv.includes("--selftest")) {
    console.log(`[check-docs-claims] ⑪-2 창 자리 주장 ${now.length}개 대조 · 과거 서술 ${past.length}개 · 주제 밖/인용 ${skipped.length}개 지나침${past.concat(skipped).length > 0 ? ` (${past.concat(skipped).map(c => `${c.rel}: ${c.raw}[${c.kind}]`).join(", ")})` : ""}`);
  }
  if (now.length > 0) {
    const r = spawnSync(process.execPath, ['scripts/check-modal-a11y.mjs'], { cwd: ROOT, encoding: 'utf8' });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const m = out.match(/창 자리 (\d+)개 중 게이트가 여는 것 (\d+)자리/);
    if (!m) {
      problems.push('창 접근성 가드의 출력에서 창 자리 수를 찾지 못했다 — npm run check:modal-a11y 를 먼저 보세요');
    } else {
      for (const c of now) {
        compared += 1;
        if (c.total !== Number(m[1]) || c.covered !== Number(m[2])) {
          problems.push(`${c.rel}: "${c.raw}" 가 낡았다 — 지금은 ${m[1]}개 중 ${m[2]}자리(npm run check:modal-a11y)`);
        }
      }
    }
  }
  // 369(리뷰 M-10): 이 줄이 `if (now.length > 0)` **안**에 있을 때는 블록째 끄면 조용했다 —
  //      바닥 검사가 "지금 주장 1개 이상" 을 보장하므로 **밖에서** 센 수를 대조한다.
  problems.push(...comparedCountProblems(now.length, compared));
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
  familyCounts.outbox = claims.length; // 372(리뷰 L-7): 루프 뒤에 한 번
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

// ㉑ 수 계열마다 바닥 — 주장이 0개인 계열은 아무것도 대조하지 않는다 (371)
{
  // 371: `누계 155~N 묶음 M개` 는 **로드맵 묶음 줄**에 적힌다(liveNumbers 가 거기서 읽어 대조한다).
  //      ② 의 문서들에서 세면 0 이 되어 첫 실행부터 거짓 경보였다 — 만든 자리에서 바로 보였다.
  // 372(369~371 리뷰 M-8): 전문에서 세면 **역사 줄 183개** 때문에 0 이 될 수 없어 바닥이 무의미했다.
  //      실제 대조는 **마지막 누계 하나**만 보므로, 세는 것도 **가장 새 묶음 줄**에서만 센다.
  familyCounts.누계 = (newestTrapClaims(read(ROADMAP)).line.match(/누계 155~\d+ 묶음 \d+개/g) || []).length;
  // 376(372~374 리뷰 H-3): 전에는 **한 줄**이 12계열 바닥을 모두 들고 있어, 그 줄을 지우면
  //      바닥이 동시에 꺼졌다. 계열마다 찍고 계열마다 신고해 한 줄의 무게를 나눈다.
  //      그래도 "신고하는 줄을 지우면 막을 수 없다" 는 한계는 남는다(366 부터 적어 온 그 종류).
  const shown = [];
  for (const [name, n] of Object.entries(familyCounts)) {
    shown.push(`${name} ${n}`);
    for (const p of familyFloorProblems({ [name]: n })) problems.push(p);
  }
  if (!process.argv.includes('--selftest')) console.log(`[check-docs-claims] ㉑ 계열별 주장 수(${shown.length}계열) — ${shown.join(' · ')}`);
}
if (problems.length > 0) {
  console.error(`[check-docs-claims] 확인할 수 없는 기록 ${problems.length}건:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('  → 기록을 사실로 고치세요(과거 날짜 기록은 그대로 두고, "지금 상태" 문서만 갱신합니다).');
  process.exit(1);
}
console.log('[check-docs-claims] OK — 묶음 해시 실재·지금 상태 숫자·문서 포인터·리뷰 반영 표시·버전/브랜치·자기 범위 표시·코어 잠금 표·§4 묶음 집합·기록 시각 전부 확인');
