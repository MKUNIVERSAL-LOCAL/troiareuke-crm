#!/usr/bin/env node
/**
 * 경량 게이트 — 묶음 하나를 끝낼 때 돌리는 검사 묶음 (274).
 *
 * 왜 스크립트로 두는가: 로드맵의 묶음 기록마다 "경량 게이트 T=0 T2=0 …" 한 줄을 적어 왔지만
 * 그 게이트는 세션 임시 폴더의 셸 스크립트였다 — 저장소에 없으니 아무도 같은 검사를 다시 돌릴 수 없고,
 * 플래그 줄이 무엇을 뜻하는지도 기록에 없었다. 화면이든 문서든 **확인할 수 없는 말은 적지 않는다**
 * 는 규칙(CLAUDE.md §3)을 문서에도 적용한 것이다.
 *
 * 전체 Playwright 는 일부러 돌리지 않는다 — 메모리 부족으로 중단된 이력이 있어 오너 지시 뒤에만 돌린다.
 * 대신 핵심 흐름 하나(e2e/smoke.spec.ts)만 넣는다(272: 묶음 대상 스펙이 놓친 흐름 변화를 smoke 가 잡았다).
 *
 * 사용:
 *   node scripts/gate-light.mjs 274            # 묶음 번호(로그·플래그 파일 이름에 쓰인다)
 *   node scripts/gate-light.mjs 274 --no-smoke # smoke 생략(코드를 안 건드린 문서 묶음)
 *   node scripts/gate-light.mjs --out <dir>    # 로그를 둘 폴더(기본: .gate/)
 *
 * 끝에 한 줄로 결과를 적는다: `T=0 T2=0 B=0 E=0 P=SKIP D=0 R=0 C=0 V=0 K=0 U=0 O=0 M=0 L=0`
 * 0 이 아닌 칸이 하나라도 있으면 exit 1 — 그 칸의 이름으로 로그를 찾아 보면 된다.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCore } from './core-lock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const label = (argv.find(a => /^\d+$/.test(a)) ?? new Date().toISOString().slice(0, 10)).toString();
const noSmoke = argv.includes('--no-smoke');
const outAt = argv.indexOf('--out');
const outDir = path.resolve(ROOT, outAt >= 0 && argv[outAt + 1] ? argv[outAt + 1] : '.gate');

fs.mkdirSync(outDir, { recursive: true });
const logPath = path.join(outDir, `gate${label}.log`);
const flagPath = path.join(outDir, `gate${label}.flags`);
fs.writeFileSync(logPath, `# 경량 게이트 ${label} — ${new Date().toISOString()}\n`);

function log(text) {
  fs.appendFileSync(logPath, text.endsWith('\n') ? text : text + '\n');
}

/**
 * 한 단계 실행 — 출력은 로그 파일로, 돌려주는 값은 종료 코드.
 * 명령을 **한 문자열**로 합쳐 넘긴다: `shell: true` 에 인자 배열을 함께 주면 Node 가 DEP0190 경고를 띄운다
 * (셸이 인자를 다시 해석하므로). 여기 인자는 모두 이 파일에 적힌 고정 값이고 바깥 입력이 섞이지 않는다.
 */
function step(flag, title, cmd, args) {
  log(`\n===== [${flag}] ${title} :: ${cmd} ${args.join(' ')} =====`);
  const line = [cmd, ...args].join(' ');
  const r = spawnSync(line, { cwd: ROOT, shell: true, encoding: 'utf8' });
  log((r.stdout || '') + (r.stderr || ''));
  const code = r.status === null ? 1 : r.status; // 신호로 죽은 경우(메모리 등)도 실패다 — 조용히 0 으로 만들지 않는다
  process.stdout.write(`${flag} ${title}: ${code === 0 ? 'ok' : 'FAIL(' + code + ')'}\n`);
  return code;
}

/** 이 묶음이 코어 잠금 파일을 건드렸는지 — 건드렸으면 게이트가 막는다(CORE_EDIT 은 사람이 쓰는 것) */
function coreLockViolations() {
  const names = new Set();
  for (const args of [['diff', '--name-only', 'HEAD'], ['ls-files', '--others', '--exclude-standard']]) {
    const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
    for (const line of (r.stdout || '').split('\n')) if (line.trim()) names.add(line.trim());
  }
  const hits = [...names].filter(isCore);
  log(`\n===== [L] 코어 잠금 =====\n변경 파일 ${names.size}개, 코어 위반 ${hits.length}개\n${hits.join('\n')}`);
  if (hits.length > 0) process.stdout.write(`L 코어 잠금: FAIL — ${hits.join(', ')}\n`);
  else process.stdout.write('L 코어 잠금: ok\n');
  return hits.length === 0 ? 0 : 1;
}

if (fs.existsSync(path.join(ROOT, '.env.local'))) {
  // 빌드 오염 실사고(v1.0.34) — 게이트가 가장 먼저 말한다
  log('\n!!! .env.local 이 있습니다 — 빌드 전에 삭제해야 합니다 (docs/DISTRIBUTION-POLICY.md)');
  process.stdout.write('!! .env.local 이 있습니다 — 빌드 오염 위험(v1.0.34 실사고)\n');
}

const flags = {};
flags.T = step('T', '앱 타입', 'npx', ['tsc', '--noEmit']);
flags.T2 = step('T2', 'e2e 타입', 'npx', ['tsc', '-p', 'e2e', '--noEmit']);
flags.B = step('B', '앱 빌드', 'npm', ['run', 'build']);
flags.E = step('E', 'e2e 빌드', 'npm', ['run', 'build:e2e']);
flags.P = 'SKIP'; // 전체 Playwright — 메모리 부족 중단 이력, 오너 지시 뒤에만
process.stdout.write('P 전체 Playwright: SKIP (메모리 규칙)\n');
flags.D = step('D', '배포 불변', 'node', ['scripts/check-distribution-invariants.mjs']);
flags.R = step('R', '라우트', 'node', ['scripts/check-routes.mjs']);
flags.C = step('C', '규칙 커버리지', 'node', ['scripts/check-rule-coverage.mjs']);
flags.V = step('V', '화면 칸 커버리지', 'node', ['scripts/check-testid-coverage.mjs']); // 276
flags.K = noSmoke ? 'SKIP' : step('K', '스모크', 'npx', ['playwright', 'test', 'e2e/smoke.spec.ts', '--project=chromium', '--workers=1', '--reporter=line']);
if (noSmoke) process.stdout.write('K 스모크: SKIP (--no-smoke)\n');
flags.U = step('U', '업데이터 헬퍼', 'npm', ['run', 'test:updater']);
flags.O = step('O', 'NAS 아웃박스', 'npm', ['run', 'test:outbox']);
flags.M = step('M', '모바일 준비', 'npm', ['run', 'mobile:prepare']);
flags.L = coreLockViolations();

const line = Object.entries(flags).map(([k, v]) => `${k}=${v}`).join(' ');
fs.writeFileSync(flagPath, line + '\n');
process.stdout.write(`\n${line}\n로그: ${path.relative(ROOT, logPath)}\n`);
const failed = Object.entries(flags).filter(([, v]) => v !== 0 && v !== 'SKIP').map(([k]) => k);
if (failed.length > 0) {
  process.stdout.write(`실패한 칸: ${failed.join(', ')} — 로그에서 "===== [칸]" 을 찾아 보세요\n`);
  process.exit(1);
}
