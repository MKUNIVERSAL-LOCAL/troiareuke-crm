#!/usr/bin/env node
/**
 * 스펙 관례 가드 (338) — `npm run check:e2e-conv`
 *
 * 왜: 338 이 전체 Playwright 를 **분할 실행**으로 바꾸면서 한 조각을 돌려 봤더니
 *     `month-view.spec.ts` 가 실패했다. 원인은 스펙이 "오늘" 을 `new Date().toISOString().slice(0, 10)`
 *     — 즉 **UTC 날짜**로 만든 것이었다. 화면은 **로컬 날짜**로 칸을 그리므로 한국 시간
 *     **00:00~09:00** 에는 하루 전 칸을 찾아 0건이 나온다. 즉 이 스펙은 **매일 아홉 시간 동안 빨갰다**.
 *     `isNearMidnightSeoul()` 로 자정 경계(23:45~00:05)는 건너뛰고 있었지만 원인은 경계가 아니라
 *     **시간대 변환**이었다. 오너의 월요일 아침 전체 실행이 바로 그 구간에 들어간다.
 *
 * 보는 것: `e2e/**.ts` 에서 `toISOString().slice(0, 10)` — 날짜 문자열을 UTC 로 만드는 자리.
 *     화면과 같은 로컬 날짜를 쓰려면 `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-…`
 *     꼴로 만든다(여러 스펙이 이미 그렇게 한다).
 *
 * 면제: 사유를 아래 `ALLOWED` 에 적는다. 하루 차이가 판정을 바꾸지 않는 자리(예: 2년 전 날짜로
 *     "1년 이상 미방문" 을 만드는 자리)는 UTC 로 만들어도 결과가 같다 — 그 사실을 적어 두면 면제다.
 *
 * 한계: `toISOString()` 전체를 금지하지는 않는다(시각까지 쓰는 자리는 UTC 가 맞다). 이 가드는
 *     **날짜 10자리만 잘라 쓰는** 모양만 본다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const E2E = path.join(ROOT, 'e2e');

/** 면제 — 파일·줄과 **왜 UTC 로도 같은 결과인지** 를 적는다 */
const ALLOWED = [
  {
    file: 'e2e/smoke.spec.ts',
    line: 725,
    why: '2년 전 날짜를 만들어 "1년 이상 미방문" 판정을 켜는 자리 — 하루 차이가 판정을 바꾸지 않는다',
  },
];

const BAD = /toISOString\(\)\.slice\(0,\s*10\)/g;

/** 이 글에서 UTC 날짜를 만드는 자리 — [{line}] */
export function utcDateSites(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    BAD.lastIndex = 0;
    if (BAD.test(lines[i])) out.push({ line: i + 1, raw: lines[i].trim().slice(0, 100) });
  }
  return out;
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

  ok('UTC 날짜를 잡는다', utcDateSites("const k = new Date().toISOString().slice(0, 10);").length === 1);
  ok('공백이 없어도 잡는다', utcDateSites('x.toISOString().slice(0,10)').length === 1);
  ok('로컬 날짜는 통과', utcDateSites("const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;").length === 0);
  ok('시각까지 쓰는 toISOString 은 통과', utcDateSites('c.registeredAt = old.toISOString();').length === 0);
  ok('7자리(연-월)만 자르면 통과', utcDateSites('d.toISOString().slice(0, 7)').length === 0);
  ok('여러 줄을 모두 센다', utcDateSites('a.toISOString().slice(0, 10)\nb.toISOString().slice(0, 10)').length === 2);
  ok('줄 번호를 센다', utcDateSites('x\ny.toISOString().slice(0, 10)')[0].line === 2);

  console.log(`[check-e2e-conv] selftest OK — 덫 ${trapCount}종 통과(UTC 날짜 2종·로컬 통과·시각 통과·연월 통과·여러 줄·줄 번호)`);
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const found = [];
for (const full of listFiles(E2E)) {
  const rel = path.relative(ROOT, full).replace(/\\/g, '/');
  for (const hit of utcDateSites(fs.readFileSync(full, 'utf8'))) found.push({ file: rel, ...hit });
}
const unexpected = found.filter(f => !ALLOWED.some(a => a.file === f.file && a.line === f.line));
const stale = ALLOWED.filter(a => !found.some(f => f.file === a.file && f.line === a.line));

if (unexpected.length > 0 || stale.length > 0) {
  if (unexpected.length > 0) {
    console.error(`[check-e2e-conv] UTC 날짜로 "오늘" 을 만드는 자리 ${unexpected.length}개:`);
    for (const f of unexpected) console.error(`  - ${f.file}:${f.line}  ${f.raw}`);
    console.error('  → 화면은 로컬 날짜로 그립니다. `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-…` 꼴로 만드세요.');
    console.error('    (한국 시간 00:00~09:00 에는 UTC 가 하루 전이라 그 자리가 매일 아홉 시간 동안 빨갛습니다)');
  }
  if (stale.length > 0) {
    console.error(`[check-e2e-conv] 사유를 적어 둔 자리 ${stale.length}개가 더는 없습니다 — 그 줄을 지우세요:`);
    for (const a of stale) console.error(`  - ${a.file}:${a.line}`);
  }
  process.exit(1);
}
console.log(`[check-e2e-conv] OK — UTC 날짜 자리 0개(사유를 적어 둔 자리 ${ALLOWED.length}개). 시각까지 쓰는 toISOString 은 보지 않습니다 — 머리말의 한계를 보세요`);
