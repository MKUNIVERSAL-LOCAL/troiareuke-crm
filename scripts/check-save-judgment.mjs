#!/usr/bin/env node
/**
 * 설정 저장 판정 가드 (304) — `npm run check:save`
 *
 * 왜: 284~302 는 같은 잘못을 **열다섯 묶음에 걸쳐** 손으로 쫓았다 — `setPreference` 는 저장이 남았는지를
 *     돌려주는데(`PrefLanded`) 부르는 쪽이 그 답을 **버리고** "저장했습니다" 라고 말하는 길. 저장 공간이
 *     모자란 PC 에서는 화면에만 생기고 다시 열면 사라진다. 손으로 쫓는 동안에도 새 자리가 계속 생겼다
 *     (304 에서 다섯 자리를 더 찾았고, 그중 하나는 **확인 전에 예전 키를 지워 설정이 영구 소실**되는 길이었다).
 *     그래서 "판정을 버리는 새 자리" 를 기계가 막는다.
 *
 * 하는 일: `src/**` 의 `setPreference(` 호출을 모두 찾아 **답을 쓰는지** 본다.
 *   - 쓴다 = 대입(`const x = …`)·반환(`return …`)·다른 함수의 인자(`describePrefLoss(setPreference(…), …)`)·
 *     객체 값(`{ landed: setPreference(…) }`)·비교(`setPreference(…) === 'landed'`)
 *   - 버린다 = 그 자체가 한 문장(`setPreference('x', v);`)
 *   버리는 자리는 **아래 ALLOWED 에 이유와 함께** 적혀 있어야 한다. 이유 없이 새로 버리면 실패한다.
 *   ALLOWED 에 적힌 자리가 사라지면 그것도 실패한다 — 낡은 면제 목록은 가드를 조용히 약하게 만든다
 *   (278 에서 ALLOWED 사유 네 개가 사실과 달랐던 일이 있었다).
 *
 * 한계(정직하게): 글을 보는 검사다. 판정을 받아서 **아무것도 안 하는** 코드(`const landed = …;` 뒤에
 *   아무 쓰임이 없는 경우)는 잡지 못한다 — 그 종류는 `tsc` 의 미사용 변수 검사와 리뷰가 본다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

/** 판정을 버려도 되는 자리 — 이유가 사실이어야 하고, 자리가 사라지면 이 목록도 지워야 한다 */
const ALLOWED = [
  { file: 'src/lib/cancelReasons.ts', key: 'reservationCancelReasons',
    why: '정리 경로 — 취소·노쇼가 아니게 된 예약의 사유를 걷는다. 집계는 예약 상태로 먼저 걸러 세므로 고아 사유가 숫자를 틀리게 하지 않고, 다음 저장에서 다시 걷힌다 (301 리뷰 LOW-9)' },
  { file: 'src/lib/followUp.ts', key: 'followUps',
    why: '바로 아래에서 **되읽어 확인**하고 boolean 으로 돌려준다 — 판정을 버리는 것이 아니라 더 센 확인을 쓴다 (250 리뷰 M-3)' },
  { file: 'src/lib/fullBackup.ts', key: 'lastBackupAt',
    why: '마지막 백업 시각 표시용. 안 남으면 "마지막 백업" 이 비어 보일 뿐이고 백업 파일 자체는 이미 내려갔다 — 없는 실패를 알리지 않는다' },
  { file: 'src/lib/staffAliases.ts', key: 'staffAliases',
    why: '직원 이름 별칭을 **쓰면서 저절로 배우는** 목록이다. 사용자가 저장을 누른 적이 없어 알릴 자리가 없고, 안 남으면 다음에 다시 배운다' },
  { file: 'src/pages/ApiGuide/index.tsx', key: 'apiGuideStatus',
    why: '개발용 연동 가이드의 체크 상태. 어드민·개발자 화면이고 안 남으면 체크가 풀릴 뿐이다 (주석에 적혀 있음)' },
];

const files = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(name)) files.push(full);
  }
})(SRC);

/** 한 줄에서 `setPreference(` 앞의 글을 보고 "답을 쓰는가" 를 가린다 */
export function usesResult(before) {
  const t = before.trimEnd();
  if (t.endsWith('=') || t.endsWith('=>')) return true;        // const landed = … / () => …
  if (/\breturn$/.test(t)) return true;                         // return …
  if (t.endsWith('(') || t.endsWith(',')) return true;          // describePrefLoss(… , …)
  if (/[:?]$/.test(t)) return true;                             // { landed: … } / cond ? … : …
  if (t.endsWith('&&') || t.endsWith('||')) return true;        // a && …
  return false;
}

const discarded = [];
for (const full of files) {
  const rel = path.relative(ROOT, full).replace(/\\/g, '/');
  const text = fs.readFileSync(full, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes('export function setPreference')) return;
    let at = line.indexOf('setPreference(');
    while (at >= 0) {
      const before = line.slice(0, at);
      // 주석 줄은 보지 않는다 — 설명에 적힌 이름을 호출로 세면 거짓 경보가 된다
      const codeOnly = before.replace(/\/\/.*$/, '');
      if (!/^\s*(\*|\/\/)/.test(before) && codeOnly === before && !usesResult(before)) {
        const keyMatch = line.slice(at).match(/setPreference\(\s*'([^']+)'/);
        discarded.push({ file: rel, line: i + 1, key: keyMatch ? keyMatch[1] : '?' });
      }
      at = line.indexOf('setPreference(', at + 1);
    }
  });
}

const problems = [];
for (const d of discarded) {
  if (!ALLOWED.some(a => a.file === d.file && a.key === d.key)) {
    problems.push(`${d.file}:${d.line} setPreference('${d.key}') 의 저장 판정을 버린다 — 화면에 알리거나, 버려도 되는 이유를 scripts/check-save-judgment.mjs 의 ALLOWED 에 적으세요`);
  }
}
for (const a of ALLOWED) {
  if (!discarded.some(d => d.file === a.file && d.key === a.key)) {
    problems.push(`ALLOWED 가 낡았다: ${a.file} 의 '${a.key}' 는 이제 판정을 버리지 않는다(또는 자리가 사라졌다) — 목록에서 지우세요`);
  }
}

if (process.argv.includes('--selftest')) {
  const ok = (name, cond) => { if (!cond) { console.error(`[selftest] ${name} 덫 실패`); process.exit(1); } };
  // 쓰는 모양은 통과
  ok('대입', usesResult('  const landed = '));
  ok('반환', usesResult('  return '));
  ok('인자', usesResult('    const lost = describePrefLoss('));
  ok('객체 값', usesResult('  return { list: clean, landed: '));
  ok('삼항', usesResult('  const x = cond ? '));
  // 버리는 모양은 걸린다
  ok('문장', !usesResult('  '));
  ok('if 뒤', !usesResult('    if (removed > 0) '));
  ok('try 블록', !usesResult('  try { '));
  ok('세미콜론 뒤', !usesResult('  doSomething(); '));
  // 지금 저장소 상태
  ok('지금 버리는 자리는 전부 이유가 있다', problems.length === 0 || (console.error(problems.join('\n')), false));
  ok('ALLOWED 가 비어 있지 않다', ALLOWED.length > 0);
  ok('호출 자리를 실제로 찾았다', discarded.length >= ALLOWED.length);
  console.log(`[check-save-judgment] selftest OK — 덫 9개(대입·반환·인자·객체 값·삼항·문장·if 뒤·try 블록·세미콜론 뒤) + 지금 상태 통과`);
  process.exit(0);
}

if (problems.length > 0) {
  console.error(`[check-save-judgment] 저장 판정을 버리는 자리 ${problems.length}건:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\n저장 공간이 모자란 PC 에서는 화면에만 남고 다시 열면 사라집니다 — 그때 "저장했습니다" 는 거짓입니다.');
  process.exit(1);
}
console.log(`[check-save-judgment] OK — setPreference 호출 중 판정을 버리는 자리 ${discarded.length}개는 전부 이유가 적혀 있다`);
