#!/usr/bin/env node
/**
 * 릴리스 리허설 (313) — `npm run release:rehearse`
 *
 * 왜: `release:checks` 의 마지막 단계는 **전체 Playwright** 다. 이 저장소에서는 그것이 메모리 부족으로
 *     아홉 번 중단된 이력이 있어 자율로 돌리지 않는다(오너 복귀 뒤 한 번). 그래서 묶음마다 "값싼
 *     단계만 손으로 골라" 돌려 왔는데, 287·309 에서 보듯 **손으로 고른 목록은 낡는다** —
 *     302~312 가 검사를 다섯 개 더했고 그중 하나라도 빠지면 리허설이 통과해도 릴리스가 멈춘다.
 *
 * 하는 일: `package.json` 의 `release:checks` 를 **그 자리에서 읽어** 단계를 만들고, 비싼 단계만 빼고 돌린다.
 *   - 빼는 것: `npm run test:e2e`(전체 Playwright) 하나뿐이다.
 *   - **빼는 목록이 그 하나와 다르면 멈춘다** — 새 비싼 단계가 조용히 건너뛰어지는 것을 막는다.
 *   그래서 이 스크립트는 `release:checks` 가 바뀌면 자동으로 함께 바뀐다(목록을 두 곳에 적지 않는다).
 *
 * 한계: 전체 Playwright·exe 빌드·채널 게시·서버 재배포는 여기서 돌지 않는다. 릴리스 당일에는
 *   `npm run release:run` 이 그 전부를 한다(복귀 안내 7절).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const chain = pkg.scripts?.['release:checks'];
if (!chain) {
  console.error('[release-rehearse] package.json 에 release:checks 가 없다 — 리허설할 목록을 만들 수 없다');
  process.exit(1);
}

const steps = chain.split('&&').map(s => s.trim()).filter(Boolean);
// 317(312~315 리뷰 L-1): `&&` 로 쪼개는 방식은 **문자열 안의 `&&`**(예: `node -e "a && b"`)를 모른다.
// 지금 체인에는 그런 단계가 없지만, 생기면 조용히 토막나는 대신 **여기서 멈춘다**.
const odd = steps.filter(s => !/^(npm run [a-z0-9:_-]+|node [\w./-]+\.(mjs|cjs|js)( .*)?)$/.test(s));
if (odd.length > 0) {
  console.error('[release-rehearse] release:checks 를 단계로 쪼갤 수 없다 — 명령 모양이 아닌 조각:');
  for (const o of odd) console.error(`  - ${o}`);
  console.error('  → 체인에 따옴표 안 && 가 들어갔을 수 있습니다. 그 단계를 npm 스크립트로 빼고 다시 돌리세요.');
  process.exit(1);
}
const EXPENSIVE = ['npm run test:e2e'];
const skipped = steps.filter(s => EXPENSIVE.includes(s));
const todo = steps.filter(s => !EXPENSIVE.includes(s));

if (skipped.length !== EXPENSIVE.length) {
  console.error(`[release-rehearse] 건너뛸 단계(${EXPENSIVE.join(', ')})를 release:checks 에서 찾지 못했다 — 체인이 바뀌었으니 이 스크립트를 함께 고치세요`);
  process.exit(1);
}

const run = step => {
  // 명령 전체를 셸에 그대로 넘긴다 — 인자를 쪼개 shell:true 로 넘기면 Node 가 경고한다(DEP0190)
  const r = spawnSync(step, { cwd: ROOT, encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` };
};

let failed = 0;
const started = Date.now();
for (const [i, step] of todo.entries()) {
  const at = Date.now();
  const { code, out } = run(step);
  const secs = Math.round((Date.now() - at) / 1000);
  const label = `${String(i + 1).padStart(2)}/${todo.length} ${step}`;
  if (code === 0) {
    process.stdout.write(`ok   ${label} (${secs}초)\n`);
  } else {
    failed += 1;
    process.stdout.write(`FAIL ${label} (${secs}초)\n`);
    // 317(리뷰 L-2): 꼬리 12줄로는 **무엇이** 실패했는지(테스트 이름·요약)가 잘렸다 —
    // 오류로 보이는 줄을 따로 먼저 찍고, 꼬리도 40줄로 늘린다.
    const lines = out.split(/\r?\n/);
    const hits = lines.filter(l => /not ok|AssertionError|error TS|✖|FAIL|실패|✘|Error:/.test(l)).slice(0, 12);
    if (hits.length > 0) process.stdout.write(`${hits.join('\n')}\n  ---- 아래는 출력 꼬리 ----\n`);
    process.stdout.write(`${lines.slice(-40).join('\n')}\n`);
  }
}

const mins = Math.round((Date.now() - started) / 6000) / 10;
process.stdout.write(`\n건너뜀: ${skipped.join(', ')} — 전체 Playwright 는 메모리 부족 중단 이력(9회) 때문에 오너가 한 번 돌린다(복귀 안내 1번)\n`);
if (failed > 0) {
  console.error(`[release-rehearse] 실패 ${failed}건 / ${todo.length}단계 (${mins}분)`);
  process.exit(1);
}
process.stdout.write(`[release-rehearse] OK — ${todo.length}단계 통과 (${mins}분). 남은 것은 전체 Playwright·빌드·채널·서버(release:run)\n`);
