#!/usr/bin/env node
/**
 * 스펙 관례 가드 (338·341) — `npm run check:e2e-conv`
 *
 * 왜: 338 이 전체 Playwright 를 **분할 실행**으로 바꾸면서 한 조각을 돌려 봤더니
 *     `month-view.spec.ts` 가 실패했다. 원인은 스펙이 "오늘" 을 `new Date().toISOString().slice(0, 10)`
 *     — 즉 **UTC 날짜**로 만든 것이었다. 화면은 **로컬 날짜**로 칸을 그리므로 한국 시간
 *     **00:00~09:00** 에는 하루 전 칸을 찾아 0건이 나온다. 즉 이 스펙은 **매일 아홉 시간 동안 빨갰다**.
 *     `isNearMidnightSeoul()` 로 자정 경계(23:45~00:05)는 건너뛰고 있었지만 원인은 경계가 아니라
 *     **시간대 변환**이었다. 오너의 월요일 아침 전체 실행이 바로 그 구간에 들어간다.
 *
 * 보는 것 ① **UTC 날짜**: `e2e/**.ts` 의 `toISOString().slice(0, 10)` — 날짜 문자열을 UTC 로 만드는 자리.
 *     화면과 같은 로컬 날짜를 쓰려면 `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-…`
 *     꼴로 만든다(여러 스펙이 이미 그렇게 한다). `toLocaleDateString('sv-SE')` 도 로컬 날짜라 통과다.
 *
 * 보는 것 ② **무시되는 timeout**(341, 335~340 리뷰 M-3): `isVisible({ timeout })` 처럼
 *     **Playwright 가 무시하는** 옵션. 설치된 1.63 의 `types.d.ts` 가 이 옵션을 `@deprecated This option
 *     is ignored.` 로 못 박고 있다 — `isVisible()` 은 **기다리지 않고 즉시** 답한다.
 *     339 가 모바일 스펙에서 인앱 확인 창을 누르려고 `isVisible({ timeout: 3_000 })` 를 썼고
 *     기록에 "경고가 늦게 떠도 3초는 기다린다" 고 적었는데 **그 기다림은 존재하지 않았다**.
 *     React 가 한 틱 늦게 그리면 조용히 건너뛰고, 뒤의 단언에서 간헐 실패가 된다.
 *     기다려야 하면 `expect(x).toBeVisible({ timeout })` 또는 `x.waitFor({ state:'visible', timeout })` 를 쓴다.
 *
 * 면제: 사유를 아래 `ALLOWED` 에 적는다. 하루 차이가 판정을 바꾸지 않는 자리(예: 2년 전 날짜로
 *     "1년 이상 미방문" 을 만드는 자리)는 UTC 로 만들어도 결과가 같다 — 그 사실을 적어 두면 면제다.
 *     면제 키는 `규칙 + 파일 + 줄` 이다(341: 한 줄에 두 자리가 있어도 각각 센다).
 *
 * 한계: `toISOString()` 전체를 금지하지는 않는다(시각까지 쓰는 자리는 UTC 가 맞다). 규칙 ① 은
 *     **날짜 10자리만 잘라 쓰는** 모양만 본다. 규칙 ② 는 위에 적은 여섯 함수만 본다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const E2E = path.join(ROOT, 'e2e');

/** 면제 — 규칙·파일·줄과 **왜 그래도 괜찮은지** 를 적는다 */
const ALLOWED = [
  {
    rule: 'utc-date',
    file: 'e2e/smoke.spec.ts',
    line: 725,
    why: '2년 전 날짜를 만들어 "1년 이상 미방문" 판정을 켜는 자리 — 하루 차이가 판정을 바꾸지 않는다',
  },
];

const RULES = [
  {
    key: 'utc-date',
    re: /toISOString\(\)\.slice\(0,\s*10\)/g,
    title: 'UTC 날짜로 "오늘" 을 만드는 자리',
    hint: [
      '  → 화면은 로컬 날짜로 그립니다. `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-…` 꼴로 만드세요.',
      '    (한국 시간 00:00~09:00 에는 UTC 가 하루 전이라 그 자리가 매일 아홉 시간 동안 빨갛습니다)',
    ],
  },
  {
    key: 'ignored-timeout',
    re: /\.(?:isVisible|isHidden|isEnabled|isDisabled|isChecked|isEditable)\s*\(\s*\{[^}]*timeout/g,
    title: 'Playwright 가 무시하는 timeout',
    hint: [
      '  → `isVisible()` 등은 기다리지 않고 즉시 답합니다(types.d.ts: "This option is ignored").',
      '    기다려야 하면 `await expect(x).toBeVisible({ timeout })` 또는',
      "    `await x.waitFor({ state: 'visible', timeout }).catch(() => {})` 를 쓰세요.",
    ],
  },
];

/**
 * 이 글에서 그 규칙에 걸리는 자리 — [{line, raw}].
 * 341(리뷰 L-5): 줄 단위로 `test()` 를 한 번만 보던 탓에 **한 줄에 두 자리**가 있으면 하나로 셌다.
 * 이제 모든 적중을 센다(면제 키가 파일+줄이라, 한 줄에 두 자리면 사유 하나로 둘이 면제됐다).
 */
export function sitesOf(text, re) {
  const out = [];
  const lineStarts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') lineStarts.push(i + 1);
  const lineOf = idx => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
  for (const m of text.matchAll(re)) {
    const line = lineOf(m.index);
    const end = text.indexOf('\n', m.index);
    const raw = text.slice(lineStarts[line - 1], end === -1 ? text.length : end);
    out.push({ line, raw: raw.trim().slice(0, 100) });
  }
  return out;
}

/** 규칙 ① 만 보는 옛 이름 — 덫과 호출자가 함께 쓴다 */
export function utcDateSites(text) {
  return sitesOf(text, RULES[0].re);
}

function listFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) listFiles(full, out);
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function selftest() {
  let trapCount = 0;
  const ok = (name, cond) => { trapCount += 1; if (!cond) { console.error(`[selftest] ${name} 덫 실패`); process.exit(1); } };
  const timeouts = text => sitesOf(text, RULES[1].re);

  // ① UTC 날짜
  ok('UTC 날짜를 잡는다', utcDateSites("const k = new Date().toISOString().slice(0, 10);").length === 1);
  ok('공백이 없어도 잡는다', utcDateSites('x.toISOString().slice(0,10)').length === 1);
  ok('로컬 날짜는 통과', utcDateSites("const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;").length === 0);
  ok('sv-SE 로컬 날짜는 통과', utcDateSites("d.toLocaleDateString('sv-SE')").length === 0);
  ok('시각까지 쓰는 toISOString 은 통과', utcDateSites('c.registeredAt = old.toISOString();').length === 0);
  ok('7자리(연-월)만 자르면 통과', utcDateSites('d.toISOString().slice(0, 7)').length === 0);
  ok('여러 줄을 모두 센다', utcDateSites('a.toISOString().slice(0, 10)\nb.toISOString().slice(0, 10)').length === 2);
  ok('줄 번호를 센다', utcDateSites('x\ny.toISOString().slice(0, 10)')[0].line === 2);
  // 341(리뷰 L-5): 한 줄에 두 자리
  ok('한 줄에 두 자리를 둘로 센다', utcDateSites('const [a,b] = [x.toISOString().slice(0, 10), y.toISOString().slice(0, 10)];').length === 2);

  // ② 무시되는 timeout
  ok('isVisible timeout 을 잡는다', timeouts('if (await x.isVisible({ timeout: 3_000 })) {}').length === 1);
  ok('공백이 없어도 잡는다(timeout)', timeouts('await x.isHidden({timeout:1000})').length === 1);
  ok('isEnabled·isChecked 도 본다', timeouts('await a.isEnabled({ timeout: 1 });\nawait b.isChecked({ timeout: 1 });').length === 2);
  ok('옵션 없는 isVisible 은 통과', timeouts('if (await x.isVisible()) {}').length === 0);
  ok('toBeVisible timeout 은 통과', timeouts('await expect(x).toBeVisible({ timeout: 3_000 });').length === 0);
  ok('waitFor timeout 은 통과', timeouts("await x.waitFor({ state: 'visible', timeout: 3_000 });").length === 0);
  ok('click timeout 은 통과', timeouts('await x.click({ timeout: 3_000 });').length === 0);
  ok('줄 번호를 센다(timeout)', timeouts('x\ny.isVisible({ timeout: 1 })')[0].line === 2);

  console.log(`[check-e2e-conv] selftest OK — 덫 ${trapCount}종 통과(UTC 날짜 ①: 적중 3종·통과 4종·줄 번호·한 줄 두 자리 / 무시되는 timeout ②: 적중 4종·통과 3종·줄 번호)`);
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const found = [];
for (const full of listFiles(E2E)) {
  const rel = path.relative(ROOT, full).replace(/\\/g, '/');
  const text = fs.readFileSync(full, 'utf8');
  for (const rule of RULES) {
    for (const hit of sitesOf(text, rule.re)) found.push({ rule: rule.key, file: rel, ...hit });
  }
}
const allowed = f => ALLOWED.some(a => a.rule === f.rule && a.file === f.file && a.line === f.line);
const unexpected = found.filter(f => !allowed(f));
const stale = ALLOWED.filter(a => !found.some(f => f.rule === a.rule && f.file === a.file && f.line === a.line));

if (unexpected.length > 0 || stale.length > 0) {
  for (const rule of RULES) {
    const hits = unexpected.filter(f => f.rule === rule.key);
    if (hits.length === 0) continue;
    console.error(`[check-e2e-conv] ${rule.title} ${hits.length}개:`);
    for (const f of hits) console.error(`  - ${f.file}:${f.line}  ${f.raw}`);
    for (const line of rule.hint) console.error(line);
  }
  if (stale.length > 0) {
    console.error(`[check-e2e-conv] 사유를 적어 둔 자리 ${stale.length}개가 더는 없습니다 — 그 줄을 지우세요:`);
    for (const a of stale) console.error(`  - ${a.rule} ${a.file}:${a.line}`);
  }
  process.exit(1);
}
console.log(`[check-e2e-conv] OK — UTC 날짜 0개·무시되는 timeout 0개(사유를 적어 둔 자리 ${ALLOWED.length}개). 시각까지 쓰는 toISOString 은 보지 않습니다 — 머리말의 한계를 보세요`);
