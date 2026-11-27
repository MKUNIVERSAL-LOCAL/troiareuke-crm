#!/usr/bin/env node
/**
 * 창 접근성 게이트 커버리지 가드 — **접근성 게이트(axe)가 한 번도 열지 않는 창**을 센다 (289, GAP Q-3).
 *
 * 왜: 288 에서 "실사 삭제 줄·매출 분모 줄은 접근성 쓸이 밖" 이라는 285 의 기록을 사실로 바꿨지만,
 * 그때 쓴 방법은 **게이트 파일을 눈으로 읽는 것**이었다. 창은 수십 자리에서 열린다 — 눈으로 세면
 * 다음 창이 들어올 때 또 빠진다. 세는 방법을 여기 고정한다(276 화면 칸 가드와 같은 이유).
 * 실행값(지금)은 `--list` 가 말한다 — 머리말에 숫자를 적어 두면 그 숫자가 먼저 낡는다(293, 리뷰 LOW-4).
 *
 * **이 가드가 세는 것과 세지 않는 것**(278 실수를 되풀이하지 않기 위해 분명히 적는다):
 *  - 세는 것: 아래 `GATES` 의 파일들이 그 창을 **여는 자리에서 이름으로 집는지**. 그 파일들만 창을 연다
 *    (`a11y.spec`·`a11y-mobile.spec` 은 라우트만 돈다). 293 전에는 게이트 파일의 **모든 문자열**을 긁어
 *    **주석 한 줄만 적어도 통과**했다(리뷰 M-3 가 샌드박스로 재현). 이제 주석을 떼고
 *    `getByRole('dialog', { name: … })`·`dialog('…')`·`getByTestId('…')` 에서만 모은다.
 *  - 세지 않는 것: 그 창이 **기능 스펙으로 시험되는지**. 예약 요청함·고객 병합·재고 이동 이력은
 *    전용 스펙이 이미 돌린다 — 다만 **대비·이름·포커스를 axe 로 본 적이 없다**. 사유를 적을 때 이 둘을
 *    섞으면 멀쩡한 화면을 미시험으로 적게 된다(278·277 리뷰 M-6 과 같은 종류의 잘못).
 *
 * 세는 방법:
 *  - 창 자리: `<Modal …>`(창틀 태그) 여는 태그와, 문자열 안이 아닌 `role="dialog"` 속성. 이름은 `title=`·`aria-label=`
 *    의 **리터럴**(삼항 두 갈래·템플릿 포함)을 모은다. 주석은 먼저 공백으로 바꿔 세지 않는다(298).
 *  - 이름을 코드가 만드는 창(`title={title}`·`` title={`… ${name}`} ``·`aria-labelledby`)은 이름으로 찾을 수 없다 —
 *    `MARKER` 에 그 창을 게이트가 무엇으로 집는지(testid·제목 조각) 적고, 그 문자열이 게이트에 있어야 덮인 것으로 센다.
 *  - 공용 창틀(`src/components/ui/Modal.tsx`)은 창 자리가 아니다 — 이름은 부르는 쪽이 준다.
 *
 * 통과 조건: 게이트가 열지 않는 창이 **ALLOWED 와 정확히 같을 때만** 통과한다.
 *  - 새 창이 게이트 없이 들어오면 실패한다(이 가드의 목적).
 *  - ALLOWED 에 적힌 창이 덮이거나 사라지면 "목록이 낡았다" 고 실패한다.
 *
 * 사용: node scripts/check-modal-a11y.mjs [--selftest] [--list]
 * 함수는 내보내지 않는다 — 부르는 곳은 같은 파일의 `--selftest` 뿐이다(미사용 export 금지).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 창을 여는 접근성 게이트 — 라우트만 도는 게이트(a11y.spec·a11y-mobile.spec)는 여기 없다.
 * 2편(-extra)을 나눈 이유는 시간이 아니라 **한 창의 실패가 뒤쪽 창 검사를 가리지 않게** 하는 것이다
 * (makeStep 이 실패를 삼키고 기다린다 — 2편 머리말에 적어 뒀다).
 */
const GATES = [
  'e2e/a11y-modals.spec.ts',
  'e2e/a11y-modals-extra.spec.ts',
  'e2e/a11y-modals-mobile.spec.ts',
  'e2e/a11y-admin.spec.ts',
  // 322: 흉내 서버 빌드로 어드민 창을 여는 쓸이 — 321 까지 면제 사유였던 "서버 행이 없다" 를 없앴다
  'e2e/a11y-admin-nas.spec.ts',
  // 325: 지점 쪽도 같은 길 — 흉내 서버 빌드로 결제 요청 창을 열어 axe 를 돌린다
  'e2e/a11y-branch-nas.spec.ts',
];

/**
 * 공용 창틀 — 이름을 **부르는 쪽**이 주므로 창 자리로 세지 않고, 그 태그를 쓰는 자리를 창으로 센다.
 * 293(리뷰 M-1): `AdminDialog` 를 창 하나로 접어 두었더니 어드민 창 10곳이 1자리로 보였고,
 * 그 1자리에 적은 MARKER(`admin-dialog`)는 **어디에도 없는 문자열**이었다(= 영원히 미커버).
 */
const FRAMES = ['src/components/ui/Modal.tsx', 'src/components/admin/AdminDialog.tsx', 'src/components/admin/DangerConfirmModal.tsx'];
/** 창틀 태그 — `<Modal …>`·`<AdminDialog …>`·`<DangerConfirmModal …>` 의 `title` 이 창 이름이 된다 */
const FRAME_TAGS = ['Modal', 'AdminDialog', 'DangerConfirmModal'];

/** 이름을 코드가 만드는 창 → 게이트가 그 창을 집는 문자열(testid 또는 제목 조각) */
const MARKER = {
  'src/components/ui/ConfirmDialog.tsx': 'confirm-dialog',
  'src/components/MetricDetailModal.tsx': 'metric-detail',
  'src/components/campaigns/CampaignRunModal.tsx': '캠페인 실행',
  'src/components/RevisitReminderCard.tsx': '재방문 안내 초안',
  'src/pages/Auth/Login.tsx': '비밀번호 재설정 안내', // aria-labelledby 가 가리키는 제목이 창 이름이다 (295)
  'src/pages/Admin/AiService.tsx': '크레딧 지급',
  'src/pages/Admin/Subscriptions.tsx': '구독 수정',
  'src/components/admin/BackupRestoreView.tsx': '백업으로 복원',
};

/**
 * 접근성 게이트가 아직 열지 않는 창 — **왜 아직 못 여는지**를 적는다.
 * "상태를 만들 자료가 더 필요하다" 와 "서버·계약·앱 런타임이 없으면 띄울 수 없다" 는 다른 이유다.
 */
// 322: 320·321 이 적어 둔 "다음 단계" 를 했다 — `e2e/a11y-admin-nas.spec.ts` 가 **흉내 서버 빌드**로 어드민
// 창을 열어 axe 를 돌린다. 그래서 "서버 행이 없다" 사유로 남아 있던 일곱(관리자 초대·사용기간 설정·
// 임시 비밀번호 발급됨·지점 신청 검토·구독 수정·크레딧 지급·공지 수정)을 **덮고 지웠다**.
// 그 쓸이가 처음 돌자마자 **막는 위반 다섯 자리**를 찾았다 — 이름 없는 닫기 단추(critical)·이름 없는 게시
// 토글(critical)·승인 단추 3.76:1·AI 작은 라벨 3.75:1·크레딧 지급 단추 3.18:1. 300묶음 넘게 아무도 못 본 자리다.
// 323: 남은 넷(자료 탐색기 상세·백업으로 복원·지점 완전 삭제·계정 완전 삭제)도 같은 쓸이로 덮었다 —
// 거기서도 막는 위반 하나(백업·복원 탭 단추 3.18:1)가 더 나왔다. 어드민 창은 이제 **전부** 열어 본다.
// 328: 남은 면제는 **하나**(앱 카메라 오버레이)다 — 322·323 이 일곱과 넷을 덮은 뒤 주석만 "남은 셋"
// 으로 남아 있었다(리뷰 M-1). 수를 말하는 주석은 ALLOWED 와 함께 고쳐야 한다.
const ALLOWED = {
  '카메라 촬영': '앱(Capacitor) 카메라 오버레이 — 가짜 카메라로 여는 길은 mobile·screenshots 스펙에 있다(before-after 가 아니다, 293 리뷰 M-2). 그 상태에서 axe 를 돌리면 비디오 트랙이 떠 대비 측정이 흔들린다',
};

function listFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) listFiles(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** 여는 태그 하나 — 중괄호 안의 `>`(화살표 함수·비교)에 끊기지 않게 깊이를 센다 */
function openTag(text, at) {
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return text.slice(at, i + 1);
  }
  return null;
}

/**
 * 그 자리가 문자열 안인지 — `closest('[role="dialog"]')` 같은 선택자를 창으로 세지 않기 위해.
 * 298(293~296 리뷰 LOW-3): 줄 앞쪽의 **홀수 따옴표**(주석 안의 아포스트로피 같은 것)에 속아 진짜 창을 건너뛸 수 있었다.
 * 그래서 창을 세기 전에 **주석을 먼저 떼고**(`blankComments` — 301 에서 `stripComments` 와 합쳤다. 305, 리뷰 LOW-6:
 * 이 주석이 지워진 이름을 가리키고 있었다) 이 검사를 쓴다 — 아포스트로피는 대개 주석 안에 있다.
 */
function insideString(text, at) {
  const lineStart = text.lastIndexOf('\n', at) + 1;
  const before = text.slice(lineStart, at);
  for (const q of ['"', "'", '`']) {
    const n = before.split(q).length - 1;
    if (n % 2 === 1) return true;
  }
  return false;
}

function literals(expr) {
  const out = [];
  for (const m of expr.matchAll(/"([^"\n]+)"|'([^'\n]+)'|`([^`\n${]+)`/g)) {
    const v = m[1] ?? m[2] ?? m[3];
    // 템플릿 안의 따옴표까지 긁으면 `"${target.label}" 백업으로 복원` 에서 **변수 이름**이 창 이름이 된다 (293, 리뷰 발견)
    if (v.includes('${') || /^\s*$/.test(v)) continue;
    out.push(v);
  }
  return out;
}

/** `attr=` 값을 태그에서 꺼낸다 — 리터럴이면 문자열들, `{…}` 면 그 안의 리터럴들(없으면 빈 배열) */
function attrLiterals(tag, attr) {
  // `title=` 가 `subtitle=` 에 먼저 걸려 **부제목을 창 이름으로** 모으던 것을 막는다 (293, 리뷰 LOW-10)
  const m = new RegExp(`(?:^|[\\s{])${attr}=("[^"]*"|'[^']*'|\\{)`).exec(tag);
  if (!m) return null;
  if (m[1] !== '{') return literals(m[1]);
  const start = tag.indexOf(m[0]) + m[0].length - 1;
  let depth = 0;
  for (let i = start; i < tag.length; i++) {
    if (tag[i] === '{') depth += 1;
    else if (tag[i] === '}') { depth -= 1; if (depth === 0) return literals(tag.slice(start, i + 1)); }
  }
  return [];
}

/** 창 자리 수집 — { file, line, names[] } (names 가 비면 이름을 코드가 만드는 창) */
function dialogSites(sources) {
  const sites = [];
  for (const { file, text: raw } of sources) {
    if (FRAMES.includes(file)) continue;
    // 298(리뷰 LOW-4): 주석 속 `<Modal …>`·`role="dialog"` 를 창으로 세고 있었다(머리말은 "세지 않는다" 고 적혀 있었다).
    // 주석을 떼면 줄 번호가 흔들리지 않게 **같은 길이의 공백**으로 바꾼다.
    const text = blankComments(raw);
    const add = (at, names) => sites.push({ file, line: text.slice(0, at).split('\n').length, names });
    for (const m of text.matchAll(new RegExp(`<(?:${FRAME_TAGS.join('|')})[\\s>]`, 'g'))) {
      if (insideString(text, m.index)) continue; // 주석·문자열 속 태그는 창이 아니다 (293, 리뷰 LOW-10)
      const tag = openTag(text, m.index);
      if (tag === null) continue;
      add(m.index, attrLiterals(tag, 'title') ?? []);
    }
    for (const m of text.matchAll(/role="dialog"/g)) {
      if (insideString(text, m.index)) continue;
      const start = text.lastIndexOf('<', m.index);
      const tag = openTag(text, start) ?? '';
      add(m.index, attrLiterals(tag, 'aria-label') ?? []);
    }
  }
  return sites;
}

/**
 * 주석을 **같은 길이의 공백**으로 바꾼다 — 줄 번호·위치가 그대로 남는다 (298 → 301 에서 스캐너로).
 * 301(297~299 리뷰 M-6): 298 은 정규식으로 블록 주석을 먼저 지웠다. 그래서 **줄 주석 안의 `/*`**
 * (예: `// 정본은 /api/photos/* 에 있다`)부터 다음 `*\/` 까지가 통째로 공백이 되어 **그 사이의 진짜 창이
 * 사라졌다** — 가드가 조용히 놓치는 자리를 298 이 새로 만든 것이다. 문자열·템플릿·주석 상태를 들고
 * 한 문자씩 훑으면 그 혼동이 없다. 길이를 유지하므로 `dialogSites` 와 `gateStrings` 가 같은 함수를 쓴다.
 */
function blankComments(text) {
  let out = '';
  let i = 0;
  let mode = 'code'; // code | line | block | sq | dq | tpl | regex
  let prev = '';     // 코드에서 마지막으로 본 뜻 있는 글자 — 정규식 자리인지 가린다
  while (i < text.length) {
    const c = text[i], d = text[i + 1];
    if (mode === 'code') {
      if (c === '/' && d === '/') { mode = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; out += '  '; i += 2; continue; }
      // 306(300~302 리뷰 LOW-1): 정규식 리터럴 안의 `/*`·따옴표에 속아 **진짜 창을 삼켰다**
      // (`const re = /[/*]/;` 뒤의 창이 사라졌다). 정규식은 한 상태로 따로 들고 간다.
      // 310(303~308 리뷰 M-2): `<` 를 정규식 자리로 보던 탓에 **JSX 닫는 태그 `</span>` 의 `/`** 가
      // 정규식 시작이 되고, 같은 줄 뒤쪽 `{/* … */}` 의 `/` 가 그것을 닫아 **주석이 주석으로 안 보였다**
      // (주석 속 가짜 창이 진짜 창으로 세어졌다 — 거짓 경보). `<`·`>` 를 빼고, 같은 줄에서 닫히는
      // `/` 가 있을 때만 정규식으로 본다(정규식 리터럴은 한 줄 안에서 닫힌다).
      const closesOnLine = c === '/' && /^[^\n]*[^\\]\//.test(text.slice(i + 1, text.indexOf('\n', i) < 0 ? undefined : text.indexOf('\n', i)));
      if (c === '/' && '=(,:[!&|?{};+-*%~^'.includes(prev) && closesOnLine) { mode = 'regex'; out += c; i += 1; continue; }
      if (c === "'") mode = 'sq';
      else if (c === '"') mode = 'dq';
      else if (c === '`') mode = 'tpl';
      if (!/\s/.test(c)) prev = c;
      out += c; i += 1; continue;
    }
    if (mode === 'line') {
      if (c === '\n') { mode = 'code'; out += c; } else out += ' ';
      i += 1; continue;
    }
    if (mode === 'block') {
      if (c === '*' && d === '/') { mode = 'code'; out += '  '; i += 2; continue; }
      out += c === '\n' ? c : ' '; i += 1; continue;
    }
    if (mode === 'regex') {
      if (c === '\\') { out += text.slice(i, i + 2); i += 2; continue; }
      if (c === '[') { // 문자 클래스 안의 / 는 끝이 아니다
        while (i < text.length && text[i] !== ']') { out += text[i]; if (text[i] === '\\') { out += text[i + 1] ?? ''; i += 1; } i += 1; }
        continue;
      }
      if (c === '/' || c === '\n') { mode = 'code'; prev = '/'; }
      out += c; i += 1; continue;
    }
    // 문자열·템플릿 — 이스케이프를 건너뛰고 닫는 짝에서 code 로 돌아온다
    if (c === '\\') { out += text.slice(i, i + 2); i += 2; continue; }
    // 306(리뷰 LOW-1): `'`·`"` 문자열은 **줄을 넘지 못한다**(JS 문법). JSX 본문의 아포스트로피
    // (`<p>Let's go</p>`)에 걸려 상태가 파일 끝까지 이어지면 뒤의 주석 속 창이 진짜로 세어지거나
    // 진짜 창이 사라졌다 — 301 판의 폭발 반경이 298 판보다 컸던 이유다. 줄바꿈에서 코드로 돌아온다.
    if (c === '\n' && (mode === 'sq' || mode === 'dq')) { mode = 'code'; prev = ''; out += c; i += 1; continue; }
    if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"') || (mode === 'tpl' && c === '`')) { mode = 'code'; prev = c; }
    out += c; i += 1; continue;
  }
  // 템플릿·블록 주석이 끝까지 닫히지 않았다면 이 결과를 믿을 수 없다 — 조용히 틀린 답을 주지 않는다
  if (mode === 'tpl' || mode === 'block') {
    throw new Error(`blankComments: 파일 끝에서 '${mode}' 상태로 남았다 — 백틱·주석 짝이 맞지 않거나 스캐너가 못 보는 모양이 있다`);
  }
  return out;
}

/** `(` 짝이 닫히는 자리 — 없으면 끝까지 */
function closeParen(code, openAt) {
  let depth = 0;
  for (let i = openAt; i < code.length; i++) {
    if (code[i] === '(') depth += 1;
    else if (code[i] === ')') { depth -= 1; if (depth === 0) return i + 1; }
  }
  return code.length;
}

/**
 * 건너뛴 테스트의 창 이름은 "axe 로 봤다" 가 아니다 — 그 블록을 괄호 짝까지 지운다 (298 → 301 에서 넓힘).
 * 301(297~299 리뷰 M-5): 298 은 `test.skip('제목', fn)` 만 봤다. 이 저장소가 실제로 끄는 방법은 둘 더 있다 —
 *  ① `test.describe.skip('묶음', fn)` ② 테스트 본문 첫 줄의 **런타임 skip** `test.skip(true, '이유')`.
 * ②는 괄호가 그 문장에서 닫히므로 298 판은 **뒤의 창 이름을 전부 "덮였다" 로 남겼다** — 가장 쉬운 끄는
 * 방법에 그대로 열려 있었다. 상수 조건(`true`·인자 없음·`process.env`)이면 **그 테스트 블록째** 지운다.
 * 조건부(`isNearMidnightSeoul()` 처럼 때에 따라 도는 것)는 지우지 않는다 — 그건 "끈 것" 이 아니다.
 */
function dropSkipped(code) {
  let out = code;
  // 306(300~302 리뷰 LOW-2): `test.only` 가 있으면 **나머지 테스트가 아예 돌지 않는다** — 그 파일의
  // 창 이름을 "덮였다" 로 세면 가드가 통째로 거짓이 된다. 게이트 파일에 `.only` 는 사고이므로 즉시 멈춘다.
  if (/\btest(?:\.describe)?\.only\(/.test(out)) {
    throw new Error('접근성 게이트 파일에 test.only 가 있다 — 나머지 테스트가 돌지 않으므로 커버리지 수를 믿을 수 없다. .only 를 지우세요.');
  }
  // 306: `beforeEach/beforeAll` 안의 상수 skip 은 **그 파일 전체**를 끈다(`lastIndexOf('test(')` 로는 못 찾았다)
  for (const hook of ['test.beforeEach(', 'test.beforeAll(']) {
    let h = out.indexOf(hook);
    while (h >= 0) {
      const hookEnd = closeParen(out, out.indexOf('(', h));
      const body = out.slice(h, hookEnd);
      const m = body.match(/test\.(?:skip|fixme)\(\s*([^,)\n]*)/);
      if (m && isConstantSkipArg(m[1])) return ' '.repeat(out.length); // 이 파일은 아무 창도 열지 않는다
      h = out.indexOf(hook, hookEnd);
    }
  }
  for (const kind of ['test.describe.skip(', 'test.describe.fixme(', 'test.skip(', 'test.fixme(']) {
    let at = out.indexOf(kind);
    while (at >= 0) {
      const open = at + kind.length - 1;
      const end = closeParen(out, open);
      const arg = out.slice(open + 1, Math.min(end, open + 40)).trimStart();
      // 306: 런타임 `test.fixme(true, …)` 도 끄는 방법이다 — 301 은 `test.skip(` 만 블록째 지웠다
      if (isConstantSkipArg(arg) && (kind === 'test.skip(' || kind === 'test.fixme(')) {
        const testAt = out.lastIndexOf('test(', at);
        const blockEnd = testAt >= 0 ? closeParen(out, out.indexOf('(', testAt)) : end;
        const from = testAt >= 0 ? testAt : at;
        out = out.slice(0, from) + ' '.repeat(blockEnd - from) + out.slice(blockEnd);
      } else {
        out = out.slice(0, at) + ' '.repeat(end - at) + out.slice(end);
      }
      at = out.indexOf(kind);
    }
  }
  return out;
}

/**
 * 그 skip 조건이 **항상 참**인가 — 그러면 그 테스트는 끈 것이다.
 * 조건부(`isNearMidnightSeoul()`)는 때에 따라 돌므로 끈 것이 아니다(그 창은 실제로 검사된다).
 * 306(리뷰 LOW-2): 301 은 `true`·인자 없음·`process.env` 만 봤다. 아래 모양도 끄는 방법이다.
 * 한계: `test.skip(flag)` 처럼 **다른 곳에 정의된 소문자 값**은 글만 보고는 알 수 없다 — 대문자 상수처럼
 * 보이는 이름은 끈 것으로 보고(안전한 쪽), 소문자 호출·식은 조건부로 둔다.
 */
function isConstantSkipArg(arg) {
  // 310(303~308 리뷰 M-6): 대문자 상수 규칙이 `$` 앵커 때문에 **사유가 붙은 평범한 모양**
  // `test.skip(SKIP_FLAG, '이유')` 에서 걸리지 않았다 — 첫 인자만 떼어 본다.
  const a = String(arg).split(',')[0].trim();
  if (/^(true\b|\)|!{0,2}process\.env)/.test(a)) return true;
  if (/^!{0,2}(true|1)\b/.test(a)) return true;
  if (/^\d+\s*(===?|!==?|>=?|<=?)\s*\d+/.test(a)) return true;     // 1 === 1
  if (/^!{0,2}[A-Z][A-Z0-9_]+\)?$/.test(a)) return true;            // SKIP_FLAG, !SKIP_FLAG
  return false;
}

/**
 * 게이트가 **창을 여는 자리에서** 집는 이름 — `getByRole('dialog', { name })`·`dialog('…')`·`getByTestId('…')`.
 * 293(리뷰 M-3): 전에는 파일의 모든 문자열을 긁어 **주석 한 줄("'새 창' 은 다음에 연다")만 적어도 통과**했다.
 */
function gateStrings(gates) {
  const used = new Set();
  const PATTERNS = [
    /getByRole\(\s*['"]dialog['"]\s*,\s*\{\s*name:\s*(?:'([^'\n]+)'|"([^"\n]+)"|`([^`\n$]+)`)/g,
    // 이름에 고객 이름 같은 값이 섞이는 창은 정규식으로 집는다 — 그 조각이 MARKER 다 (295)
    /getByRole\(\s*['"]dialog['"]\s*,\s*\{\s*name:\s*\/([^/\n]+)\//g,
    /\bdialog\(\s*(?:'([^'\n]+)'|"([^"\n]+)"|`([^`\n$]+)`)/g,
    /getByTestId\(\s*(?:'([^'\n]+)'|"([^"\n]+)"|`([^`\n$]+)`)/g,
  ];
  for (const { text } of gates) {
    // 298(리뷰 LOW-5): `test.skip`·`test.fixme` 블록의 창 이름까지 "덮였다" 로 세고 있었다 —
    // 흔들리는 접근성 테스트를 건너뛰면 가드가 초록으로 남는다. 그 블록은 빼고 센다.
    const code = dropSkipped(blankComments(text));
    for (const re of PATTERNS) for (const m of code.matchAll(re)) used.add(m[1] ?? m[2] ?? m[3]);
  }
  return used;
}

/** 덮이지 않은 창 → [{ key, file, line, names }] (key 는 이름, 이름이 없으면 파일 경로) */
function findUncovered(sites, used) {
  const out = [];
  for (const s of sites) {
    if (s.names.length > 0) {
      if (s.names.some(n => used.has(n))) continue;
      out.push({ key: s.names[0], ...s });
      continue;
    }
    const marker = MARKER[s.file];
    if (marker === undefined) { out.push({ key: s.file, ...s, unmapped: true }); continue; }
    if (used.has(marker)) continue;
    out.push({ key: s.file, ...s });
  }
  // 같은 창이 여러 자리에서 열릴 수 있다 — 이름 기준으로 한 번만 센다
  const seen = new Set();
  return out.filter(o => (seen.has(o.key) ? false : seen.add(o.key)));
}

function selftest() {
  const src = [{
    file: 'src/pages/X/index.tsx',
    text: [
      '<Modal isOpen title="이름 있는 창">',                                  // 리터럴
      "<Modal isOpen title={edit ? '고친다' : '만든다'} size=\"md\">",         // 삼항 두 갈래
      '<div role="dialog" aria-modal="true" aria-label="맨손 창">',            // role="dialog"
      "const d = el.closest('[role=\"dialog\"]');",                           // 문자열 안 — 창이 아니다
      '<Modal isOpen onClose={() => a > b} title="화살표 뒤의 창">',           // 중괄호 안 `>` 에 끊기지 않는다
    ].join('\n'),
  }, {
    file: 'src/components/ui/Modal.tsx',
    text: '<div role="dialog" aria-label={title}>',                            // 창틀 — 세지 않는다
  }];
  const sites = dialogSites(src);
  const names = sites.map(s => s.names.join('|')).sort().join(',');
  const want = '고친다|만든다,맨손 창,이름 있는 창,화살표 뒤의 창';
  if (names !== want) { console.error(`[selftest] 창 수집 실패: ${names} ≠ ${want}`); process.exit(1); }

  const used = gateStrings([{ text: "dialog('이름 있는 창'); dialog('고친다'); getByTestId('confirm-dialog');" }]);
  const un = findUncovered(sites, used);
  const keys = un.map(u => u.key).sort().join(',');
  if (keys !== '맨손 창,화살표 뒤의 창') { console.error(`[selftest] 미커버 판정 실패: ${keys}`); process.exit(1); }
  // 이름을 코드가 만드는 창: MARKER 가 게이트에 있으면 덮인 것, 없으면 미커버, 아예 안 적혀 있으면 unmapped
  const dyn = [
    { file: 'src/components/ui/ConfirmDialog.tsx', line: 1, names: [] },
    { file: 'src/components/MetricDetailModal.tsx', line: 1, names: [] },
    { file: 'src/components/NewOne.tsx', line: 1, names: [] },
  ];
  const dynUn = findUncovered(dyn, used);
  if (dynUn.length !== 2 || !dynUn.every(u => u.file !== 'src/components/ui/ConfirmDialog.tsx')) {
    console.error(`[selftest] 이름 없는 창 판정 실패: ${dynUn.map(u => u.key).join(',')}`); process.exit(1);
  }
  if (!dynUn.find(u => u.file === 'src/components/NewOne.tsx')?.unmapped) { console.error('[selftest] MARKER 누락 덫 실패'); process.exit(1); }
  // 295: 정규식 이름도 창을 여는 자리다
  const byRe = gateStrings([{ text: "await expect(page.getByRole('dialog', { name: /재방문 안내 초안/ })).toBeVisible();" }]);
  if (!byRe.has('재방문 안내 초안')) { console.error('[selftest] 정규식 이름 수집 실패'); process.exit(1); }
  // 298(리뷰 LOW-4): 주석 속 창은 창이 아니다
  const inComment = dialogSites([{ file: 'src/pages/C.tsx', text: '// <Modal isOpen title="주석 속 창">\n<Modal isOpen title="진짜 창">' }]);
  if (inComment.length !== 1 || inComment[0].names[0] !== '진짜 창') { console.error(`[selftest] 주석 속 창 덫 실패: ${JSON.stringify(inComment.map(s => s.names))}`); process.exit(1); }
  // 298(리뷰 LOW-3): 줄 앞쪽 아포스트로피(주석 안)에 속아 진짜 창을 건너뛰지 않는다
  const apos = dialogSites([{ file: 'src/pages/D.tsx', text: "{/* 직원's 목록 */}<Modal isOpen title=\"놓치던 창\">" }]);
  if (apos.length !== 1 || apos[0].names[0] !== '놓치던 창') { console.error(`[selftest] 아포스트로피 덫 실패: ${JSON.stringify(apos.map(s => s.names))}`); process.exit(1); }
  // 301(리뷰 M-6): 줄 주석 안의 `/*` 가 뒤의 진짜 창을 삼키지 않는다
  const globComment = dialogSites([{ file: 'src/pages/G.tsx', text: '// 정본은 /api/photos/* 에 있다\n<Modal isOpen title="삼켜지면 안 되는 창">x</Modal>\n{/* 여기서 닫힌다 */}' }]);
  if (globComment.length !== 1 || globComment[0].names[0] !== '삼켜지면 안 되는 창') { console.error(`[selftest] 줄 주석 속 glob 덫 실패: ${JSON.stringify(globComment.map(s => s.names))}`); process.exit(1); }
  // 301(리뷰 M-5): describe.skip 과 런타임 skip 도 "덮였다" 가 아니다
  const describeSkip = gateStrings([{ text: "test.describe.skip('묶음', () => { await expect(page.getByRole('dialog', { name: '건너뛴 묶음 창' })).toBeVisible(); });" }]);
  if (describeSkip.has('건너뛴 묶음 창')) { console.error('[selftest] describe.skip 덫 실패'); process.exit(1); }
  const runtimeSkip = gateStrings([{ text: "test('창 묶음', async ({ page }) => {\n  test.skip(true, '흔들려서 끔');\n  await expect(page.getByRole('dialog', { name: '런타임으로 끈 창' })).toBeVisible();\n});" }]);
  if (runtimeSkip.has('런타임으로 끈 창')) { console.error(`[selftest] 런타임 skip 덫 실패: ${[...runtimeSkip].join(',')}`); process.exit(1); }
  const condSkip = gateStrings([{ text: "test('창 묶음', async ({ page }) => {\n  test.skip(isNearMidnightSeoul(), '자정 근처');\n  await expect(page.getByRole('dialog', { name: '조건부로만 건너뛰는 창' })).toBeVisible();\n});" }]);
  if (!condSkip.has('조건부로만 건너뛰는 창')) { console.error('[selftest] 조건부 skip 는 지우지 않는다 덫 실패'); process.exit(1); }
  // 298(리뷰 LOW-5): 건너뛴 테스트의 창 이름은 덮인 것이 아니다
  const skipped = gateStrings([{ text: "test.skip('x', async ({ page }) => { await expect(page.getByRole('dialog', { name: '건너뛴 창' })).toBeVisible(); });\nawait expect(page.getByRole('dialog', { name: '진짜로 연 창' })).toBeVisible();" }]);
  if (skipped.has('건너뛴 창') || !skipped.has('진짜로 연 창')) { console.error(`[selftest] test.skip 덫 실패: ${[...skipped].join(',')}`); process.exit(1); }
  // 293(리뷰 M-3): 주석에만 적힌 이름은 "열었다" 가 아니다
  const commented = gateStrings([{ text: "// 289: '새로 들어온 창' 은 다음 묶음에서 연다\nawait page.goto('/x');" }]);
  if (commented.has('새로 들어온 창')) { console.error('[selftest] 주석 우회 덫 실패'); process.exit(1); }
  const opened = gateStrings([{ text: "await expect(page.getByRole('dialog', { name: '새로 들어온 창' })).toBeVisible();" }]);
  if (!opened.has('새로 들어온 창')) { console.error('[selftest] 창 여는 자리 수집 실패'); process.exit(1); }
  // 293(리뷰 LOW-10): subtitle= 이 title= 보다 앞에 있어도 창 이름은 title 이다
  const sub = dialogSites([{ file: 'src/pages/Y.tsx', text: '<Modal subtitle="부제목" title="진짜 이름">' }]);
  if (sub.length !== 1 || sub[0].names[0] !== '진짜 이름') { console.error(`[selftest] subtitle 덫 실패: ${JSON.stringify(sub[0]?.names)}`); process.exit(1); }
  // 293(리뷰 M-1): 어드민 창틀을 쓰는 자리도 창으로 센다
  const adm = dialogSites([{ file: 'src/pages/Admin/Z.tsx', text: '<AdminDialog title="새 지점 추가" onClose={x}>' }]);
  if (adm.length !== 1 || adm[0].names[0] !== '새 지점 추가') { console.error('[selftest] 어드민 창틀 덫 실패'); process.exit(1); }
  // 306(300~302 리뷰 LOW-1): 정규식 리터럴 안의 `/*` 가 뒤의 진짜 창을 삼키지 않는다
  const reLiteral = dialogSites([{ file: 'src/pages/R.tsx', text: 'const re = /[/*]/;\n<Modal isOpen title="정규식 뒤의 창">x</Modal>' }]);
  if (reLiteral.length !== 1 || reLiteral[0].names[0] !== '정규식 뒤의 창') { console.error(`[selftest] 정규식 리터럴 덫 실패: ${JSON.stringify(reLiteral.map(s => s.names))}`); process.exit(1); }
  // 306(리뷰 LOW-1): JSX 본문의 아포스트로피가 **다음 줄까지** 문자열을 끌고 가지 않는다
  const jsxApos = dialogSites([{ file: 'src/pages/J.tsx', text: "<p>Let's go</p>\n{/* <Modal isOpen title=\"주석 속 가짜 창\"> */}\n<Modal isOpen title=\"아포스트로피 뒤의 진짜 창\">x</Modal>" }]);
  if (jsxApos.length !== 1 || jsxApos[0].names[0] !== '아포스트로피 뒤의 진짜 창') { console.error(`[selftest] JSX 아포스트로피 덫 실패: ${JSON.stringify(jsxApos.map(s => s.names))}`); process.exit(1); }
  // 306(리뷰 LOW-2): 런타임 `test.fixme(true, …)` 도 끈 것이다
  const runtimeFixme = gateStrings([{ text: "test('창 묶음', async ({ page }) => {\n  test.fixme(true, '고치는 중');\n  await expect(page.getByRole('dialog', { name: 'fixme 로 끈 창' })).toBeVisible();\n});" }]);
  if (runtimeFixme.has('fixme 로 끈 창')) { console.error(`[selftest] 런타임 fixme 덫 실패: ${[...runtimeFixme].join(',')}`); process.exit(1); }
  // 306(리뷰 LOW-2): beforeEach 안의 상수 skip 은 **그 파일 전체**를 끈다
  const hookSkip = gateStrings([{ text: "test.beforeEach(async () => { test.skip(true, '환경 없음'); });\ntest('창', async ({ page }) => { await expect(page.getByRole('dialog', { name: '훅으로 끈 창' })).toBeVisible(); });" }]);
  if (hookSkip.has('훅으로 끈 창')) { console.error(`[selftest] beforeEach skip 덫 실패: ${[...hookSkip].join(',')}`); process.exit(1); }
  // 310(리뷰 M-6): 사유가 붙은 대문자 상수 skip 도 끈 것이다
  const constSkip = gateStrings([{ text: "const SKIP_FLAG = true;\ntest('창 묶음', async ({ page }) => {\n  test.skip(SKIP_FLAG, '조건부');\n  await expect(page.getByRole('dialog', { name: '상수로 끈 창' })).toBeVisible();\n});" }]);
  if (constSkip.has('상수로 끈 창')) { console.error(`[selftest] 대문자 상수 skip 덫 실패: ${[...constSkip].join(',')}`); process.exit(1); }
  // 310(리뷰 M-2): JSX 닫는 태그 뒤의 블록 주석은 주석으로 본다(가짜 창을 세지 않는다)
  const jsxClose = dialogSites([{ file: 'src/components/P.tsx', text: '<span>x</span> {/* <Modal isOpen title="주석 속 가짜 창">y</Modal> */}\n<Modal isOpen title="진짜 창">z</Modal>' }]);
  if (jsxClose.length !== 1 || jsxClose[0].names[0] !== '진짜 창') { console.error(`[selftest] JSX 닫는 태그 덫 실패: ${JSON.stringify(jsxClose.map(s => s.names))}`); process.exit(1); }
  // 306(리뷰 LOW-2): `.only` 는 나머지를 안 돌리므로 커버리지 수를 믿을 수 없다 — 멈춘다
  let onlyThrew = false;
  try { gateStrings([{ text: "test.only('하나만', async ({ page }) => { await expect(page.getByRole('dialog', { name: '하나만 연 창' })).toBeVisible(); });" }]); }
  catch { onlyThrew = true; }
  if (!onlyThrew) { console.error('[selftest] test.only 덫 실패'); process.exit(1); }
  // 306: 닫히지 않은 백틱은 조용히 넘기지 않는다
  let unclosedThrew = false;
  try { dialogSites([{ file: 'src/pages/T.tsx', text: 'const t = `열고 안 닫음\n<Modal isOpen title="삼켜진 창">' }]); }
  catch { unclosedThrew = true; }
  if (!unclosedThrew) { console.error('[selftest] 닫히지 않은 템플릿 덫 실패'); process.exit(1); }
  // 부분 문자열은 참조가 아니다 — '맨손 창가' 가 '맨손 창' 을 덮지 않는다
  const used2 = gateStrings([{ text: "dialog('맨손 창가')" }]);
  if (!findUncovered([{ file: 'a.tsx', line: 1, names: ['맨손 창'] }], used2).length) { console.error('[selftest] 부분 문자열 덫 실패'); process.exit(1); }
  console.log(`[check-modal-a11y] selftest OK — 덫(JSX 닫는 태그·대문자 상수 skip·리터럴·삼항·맨손 창·문자열 안 선택자·창틀 제외·이름 없는 창/MARKER 누락·부분 문자열·주석 우회·창 여는 자리·subtitle·어드민 창틀·정규식 이름·주석 속 창·아포스트로피·test.skip·줄 주석 속 glob·describe.skip·런타임 skip·조건부 skip 보존·정규식 리터럴·JSX 아포스트로피·런타임 fixme·beforeEach skip·test.only·닫히지 않은 템플릿) 통과`);
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const read = files => files.map(file => ({ file: path.relative(ROOT, file).replace(/\\/g, '/'), text: fs.readFileSync(file, 'utf8') }));
const sites = dialogSites(read(listFiles(path.join(ROOT, 'src'))));
const used = gateStrings(read(GATES.map(p => path.join(ROOT, p))));
const uncovered = findUncovered(sites, used);

if (process.argv.includes('--list')) {
  const covered = sites.length - uncovered.length;
  for (const u of uncovered) console.log(`${u.key}\t${u.file}:${u.line}\t${ALLOWED[u.key] ?? '(사유 없음)'}`);
  console.log(`\n창 자리 ${sites.length}개 · 게이트가 열지 않는 창 ${uncovered.length}개(위) · 나머지 ${covered}자리`);
  process.exit(0);
}

const unmapped = uncovered.filter(u => u.unmapped && !(u.key in ALLOWED));
const unexpected = uncovered.filter(u => !u.unmapped && !(u.key in ALLOWED));
const stale = Object.keys(ALLOWED).filter(k => !uncovered.some(u => u.key === k));
if (unexpected.length > 0 || unmapped.length > 0 || stale.length > 0) {
  if (unexpected.length > 0) {
    console.error(`[check-modal-a11y] 접근성 게이트가 한 번도 열지 않는 창 ${unexpected.length}개:`);
    for (const u of unexpected) console.error(`  - ${u.key}  (${u.file}:${u.line})`);
    console.error('  → a11y-modals(또는 -mobile·-admin) 게이트에 그 창을 여는 step 을 더하거나, 왜 못 여는지 ALLOWED 에 적으세요.');
  }
  if (unmapped.length > 0) {
    console.error(`[check-modal-a11y] 이름을 코드가 만드는 창 ${unmapped.length}개가 MARKER 에 없습니다:`);
    for (const u of unmapped) console.error(`  - ${u.file}:${u.line}  (게이트가 이 창을 무엇으로 집는지 적으세요)`);
  }
  if (stale.length > 0) {
    console.error(`[check-modal-a11y] ALLOWED 가 낡았습니다 — 이미 덮였거나 사라진 창 ${stale.length}개: ${stale.join(', ')}`);
    console.error('  → 그 줄을 지우세요(사유만 남고 사실이 바뀌는 것을 막습니다).');
  }
  process.exit(1);
}
console.log(`[check-modal-a11y] OK — 창 자리 ${sites.length}개 중 게이트가 여는 것 ${sites.length - uncovered.length}자리, 사유를 적어 둔 ${uncovered.length}개만 남음`);
