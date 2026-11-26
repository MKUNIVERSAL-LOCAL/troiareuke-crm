#!/usr/bin/env node
/**
 * 창 접근성 게이트 커버리지 가드 — **접근성 게이트(axe)가 한 번도 열지 않는 창**을 센다 (289, GAP Q-3).
 *
 * 왜: 288 에서 "실사 삭제 줄·매출 분모 줄은 접근성 쓸이 밖" 이라는 285 의 기록을 사실로 바꿨지만,
 * 그때 쓴 방법은 **게이트 파일을 눈으로 읽는 것**이었다. 창은 48자리에서 열린다 — 눈으로 세면
 * 다음 창이 들어올 때 또 빠진다. 세는 방법을 여기 고정한다(276 화면 칸 가드와 같은 이유).
 *
 * **이 가드가 세는 것과 세지 않는 것**(278 실수를 되풀이하지 않기 위해 분명히 적는다):
 *  - 세는 것: 아래 `GATES` 의 파일들이 그 창을 **열어 axe 로 보는지**. 그 파일들만 창을 연다
 *    (`a11y.spec`·`a11y-mobile.spec` 은 라우트만 돈다).
 *  - 세지 않는 것: 그 창이 **기능 스펙으로 시험되는지**. 예약 요청함·고객 병합·재고 이동 이력은
 *    전용 스펙이 이미 돌린다 — 다만 **대비·이름·포커스를 axe 로 본 적이 없다**. 사유를 적을 때 이 둘을
 *    섞으면 멀쩡한 화면을 미시험으로 적게 된다(278·277 리뷰 M-6 과 같은 종류의 잘못).
 *
 * 세는 방법:
 *  - 창 자리: `<Modal …>` 여는 태그와, 문자열 안이 아닌 `role="dialog"` 속성. 이름은 `title=`·`aria-label=`
 *    의 **리터럴**(삼항 두 갈래·템플릿 포함)을 모은다.
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
];

/** 공용 창틀 — 이름을 부르는 쪽이 주므로 창 자리로 세지 않는다 */
const FRAMES = ['src/components/ui/Modal.tsx'];

/** 이름을 코드가 만드는 창 → 게이트가 그 창을 집는 문자열(testid 또는 제목 조각) */
const MARKER = {
  'src/components/ui/ConfirmDialog.tsx': 'confirm-dialog',
  'src/components/MetricDetailModal.tsx': 'metric-detail',
  'src/components/campaigns/CampaignRunModal.tsx': '캠페인 실행',
  'src/components/RevisitReminderCard.tsx': '재방문 안내 초안',
  'src/components/admin/AdminDialog.tsx': 'admin-dialog',
  'src/pages/Auth/Login.tsx': '비밀번호 재설정',
};

/**
 * 접근성 게이트가 아직 열지 않는 창 — **왜 아직 못 여는지**를 적는다.
 * "상태를 만들 자료가 더 필요하다" 와 "서버·계약·앱 런타임이 없으면 띄울 수 없다" 는 다른 이유다.
 */
const ALLOWED = {
  '결제 요청': 'NAS 서버 모드 전용 창(PG 계약 전, GAP P-8·결정 #4) — 로컬 모드 게이트로는 띄울 수 없다',
  '카메라 촬영': '앱(Capacitor) 카메라 오버레이 — 가짜 카메라로 여는 길은 before-after 스펙에만 있고, 그 상태에서 axe 를 돌리면 비디오 트랙이 떠 대비 측정이 흔들린다',
  '상세 보기': '어드민 자료 탐색기 창 — 서버에 실제 자료가 있어야 줄을 눌러 열 수 있다(어드민 게이트는 라우트만 돈다)',
  'src/components/admin/AdminDialog.tsx': '어드민 공용 창 — 지점 정지·요금제 변경처럼 서버 응답이 있어야 열린다(승인 대기)',
  '등급 올릴 후보': '방문·결제가 쌓인 고객이 있어야 후보가 생긴다 — 자료를 만드는 길이 grade-suggest 스펙에 있다 — 다음 창 묶음에서 옮긴다',
  '사진 크게 보기': '사진을 올린 뒤에만 열린다(가짜 파일로 올리는 길은 before-after 스펙에 있다) — 다음 창 묶음에서 옮긴다',
  '앱 잠금': 'PIN 을 켠 뒤 잠겨야 뜬다(screen-lock 스펙이 그 길을 돈다) — 다음 창 묶음에서 옮긴다',
  'src/components/campaigns/CampaignRunModal.tsx': '캠페인을 실제로 실행해야 열린다 — 발송 흉내까지 필요해 다음 창 묶음으로 미룬다',
  'src/components/RevisitReminderCard.tsx': '재방문 권장 대상이 있어야 초안 창이 열린다 — 다음 창 묶음에서 옮긴다',
  'src/pages/Auth/Login.tsx': '로그인 전 비밀번호 재설정 창 — 창 게이트는 가입·온보딩을 지난 뒤부터 돈다(라우트 게이트가 /login 화면 자체는 본다) — 로그인 전 상태를 따로 여는 묶음이 필요하다',
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

/** 그 자리가 문자열 안인지 — `closest('[role="dialog"]')` 같은 선택자를 창으로 세지 않기 위해 */
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
  for (const m of expr.matchAll(/"([^"\n]+)"|'([^'\n]+)'|`([^`\n${]+)`/g)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** `attr=` 값을 태그에서 꺼낸다 — 리터럴이면 문자열들, `{…}` 면 그 안의 리터럴들(없으면 빈 배열) */
function attrLiterals(tag, attr) {
  const m = new RegExp(`${attr}=("[^"]*"|'[^']*'|\\{)`).exec(tag);
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
  for (const { file, text } of sources) {
    if (FRAMES.includes(file)) continue;
    const add = (at, names) => sites.push({ file, line: text.slice(0, at).split('\n').length, names });
    for (const m of text.matchAll(/<Modal[\s>]/g)) {
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

/** 게이트가 집는 문자열 전부(넓게 본다 — 변수에 담아 쓰는 경우를 놓치지 않게) */
function gateStrings(gates) {
  const used = new Set();
  for (const { text } of gates) for (const v of literals(text)) used.add(v);
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
  // 부분 문자열은 참조가 아니다 — '맨손 창가' 가 '맨손 창' 을 덮지 않는다
  const used2 = gateStrings([{ text: "dialog('맨손 창가')" }]);
  if (!findUncovered([{ file: 'a.tsx', line: 1, names: ['맨손 창'] }], used2).length) { console.error('[selftest] 부분 문자열 덫 실패'); process.exit(1); }
  console.log('[check-modal-a11y] selftest OK — 덫 6개(리터럴·삼항·맨손 창·문자열 안 선택자·창틀 제외·이름 없는 창/MARKER 누락·부분 문자열) 통과');
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
