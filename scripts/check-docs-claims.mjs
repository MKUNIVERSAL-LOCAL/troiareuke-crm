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
 *  ② "지금 상태" 문서의 숫자 — 아래 CURRENT_DOCS 안의 `N모듈·M함수`·`N칸 중 M칸`·`lib-units N개`는
 *     **지금 세어 나오는 값**과 같아야 한다. 날짜가 붙은 기록(로드맵 묶음 항목·REVIEW-*)은 그때의
 *     사실이므로 검사하지 않는다 — 과거 기록을 고치는 것은 역사 조작이다.
 *  ③ 문서가 가리키는 파일 — 문서 안의 `docs/X.md`·`scripts/Y.mjs` 는 실재해야 한다(깨진 포인터 금지).
 *  ④ 리뷰 기록의 반영 표시 — `docs/REVIEW-*.md` 머리말(앞 3줄)에 "반영" 상태가 적혀 있어야 한다.
 *     조용히 묻힌 리뷰가 없다는 뜻이다.
 *  ⑤ 버전·브랜치 — "지금 상태" 문서가 적은 `vX.Y.Z` 와 `feat/...` 브랜치 이름이 **실물과 같아야** 한다.
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
  'docs/OWNER-BRIEFING-2026-11-30.md',
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

/** 문서가 주장하는 숫자들 */
function claimedNumbers(text) {
  const out = { rules: [], testids: [], libUnits: [] };
  // 285(리뷰 M-2): 문구를 좁게 보던 탓에 `lib-units.spec.ts 160건`·`lib-units(165개)`·맨 `231함수` 가
  // 전부 가드 밖이었다. 283 이 기계가 보던 표현을 지우고 못 보는 표현만 남겨 한 묶음 뒤 낡은 적도 있다.
  for (const m of text.matchAll(/(\d+)\s*모듈/g)) out.rules.push({ modules: Number(m[1]), fns: null, raw: m[0] });
  for (const m of text.matchAll(/(\d+)\s*함수/g)) out.rules.push({ modules: null, fns: Number(m[1]), raw: m[0] });
  for (const m of text.matchAll(/(\d+)칸 중 (\d+)칸/g)) out.testids.push({ total: Number(m[1]), covered: Number(m[2]), raw: m[0] });
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
  if (!rules || !ids) {
    // 이 가드는 다른 두 가드의 출력을 세므로, 그쪽이 실패하면 여기서 숫자를 읽을 수 없다.
    // 남의 실패를 떠안고 스택 트레이스로 끝내지 않고 **무엇을 먼저 고쳐야 하는지** 적는다 (285, 리뷰 LOW)
    console.error('[check-docs-claims] 숫자를 셀 수 없다 — 먼저 통과해야 하는 가드:');
    if (!rules) console.error('  - npm run check:rules (순수 규칙 커버리지)');
    if (!ids) console.error('  - npm run check:testids (화면 칸 커버리지)');
    console.error('  이 가드는 그 두 출력을 세어 "지금 상태" 문서의 숫자와 맞춥니다.');
    process.exit(2);
  }
  return { modules: Number(rules[1]), fns: Number(rules[2]), idTotal: Number(ids[1]), idCovered: Number(ids[2]), libUnits: units };
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
  console.log('[check-docs-claims] selftest OK — 덫 6개(숫자 3종·넓은 표현 2종·묶음 해시) 통과');
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
    const r = spawnSync('git', ['cat-file', '-e', `${h}^{commit}`], { cwd: ROOT });
    if (r.status !== 0) { problems.push(`${ROADMAP}: 묶음 ${no} 의 커밋 ${h} 가 이 저장소에 없다`); continue; }
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
    for (const m of text.matchAll(/feat\/[A-Za-z0-9._\/-]+/g)) {
      if (!branch || branch === 'HEAD' || m[0] === branch) continue;
      if (/릴리스 완료|머지\(/.test(lineOf(text, m.index))) continue; // 지난 릴리스 기록 = 역사
      problems.push(`${rel}: 브랜치 "${m[0]}" 가 지금 브랜치와 다르다 — ${branch}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`[check-docs-claims] 확인할 수 없는 기록 ${problems.length}건:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('  → 기록을 사실로 고치세요(과거 날짜 기록은 그대로 두고, "지금 상태" 문서만 갱신합니다).');
  process.exit(1);
}
console.log('[check-docs-claims] OK — 묶음 해시 실재·지금 상태 숫자·문서 포인터·리뷰 반영 표시·버전/브랜치 전부 확인');
