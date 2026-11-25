#!/usr/bin/env node
/**
 * 릴리스 한 명령 (220) — 2026-11-25 v1.0.62·v1.0.63 을 손으로 돌린 순서를 그대로 스크립트로 묶는다.
 * 목적: 나중에 기능만 올려도 패치가 빨리 나가게. 단계마다 멈추고, 실패한 단계부터 다시 이어갈 수 있다.
 *
 *   node scripts/release-run.mjs --list                  단계 목록만
 *   node scripts/release-run.mjs --dry-run               무엇을 할지만 출력(아무것도 바꾸지 않음)
 *   node scripts/release-run.mjs                         전체 실행(main 브랜치에서)
 *   node scripts/release-run.mjs --from=build            그 단계부터 이어서
 *   node scripts/release-run.mjs --only=verify           그 단계만
 *   node scripts/release-run.mjs --skip=server           특정 단계 건너뛰기(쉼표로 여러 개)
 *
 * 하지 않는 일(일부러): 버전 올리기·노트 분리·PR 머지는 사람이 판단할 일이라 제외한다(선행 조건으로 검사만 한다).
 * 서버 재배포(server)는 `server/` 변경이 있을 때만 필요하고 NAS sudo 규칙이 있어야 돌아간다 — 없으면 건너뛰고 끝에 알린다.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const args = process.argv.slice(2);
const has = name => args.includes(name);
const valueOf = name => {
  const hit = args.find(a => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
};
const dryRun = has('--dry-run');
const from = valueOf('--from');
const only = valueOf('--only');
const skip = (valueOf('--skip') || '').split(',').map(s => s.trim()).filter(Boolean);

const run = (cmd, cmdArgs, opts = {}) => execFileSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', ...opts });
const capture = (cmd, cmdArgs) => execFileSync(cmd, cmdArgs, { cwd: root, encoding: 'utf8' }).trim();
const npm = script => run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script]);
const node = (script, scriptArgs = []) => run('node', [path.join('scripts', script), ...scriptArgs]);

/** 서버 코드가 지난 태그 이후 바뀌었는가 — 바뀌지 않으면 재배포가 필요 없다 */
function serverChanged() {
  try {
    const prev = capture('git', ['describe', '--tags', '--abbrev=0', '--match=v*', 'HEAD^']);
    const out = capture('git', ['diff', '--name-only', `${prev}..HEAD`, '--', 'server/']);
    return out.length > 0;
  } catch {
    return true; // 알 수 없으면 "바뀌었다" 로 보고 사람에게 알린다
  }
}

const steps = [
  {
    id: 'preflight',
    label: '선행 조건 — main 브랜치·작업 트리 깨끗·.env.local 없음·노트 버전 일치',
    fn: () => {
      const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
      if (branch !== 'main') throw new Error(`main 브랜치에서 실행하세요(현재 ${branch}). PR 머지 뒤 main 으로 옮기고 다시 실행합니다.`);
      const dirty = capture('git', ['status', '--porcelain']);
      if (dirty) throw new Error(`커밋하지 않은 변경이 있습니다:\n${dirty}`);
      if (fs.existsSync(path.join(root, '.env.local'))) throw new Error('.env.local 이 있습니다 — 빌드에 QA 오버라이드가 섞입니다(v1.0.34 실사고). 지우고 다시 실행하세요.');
      const notes = fs.readFileSync(path.join(root, 'docs', 'RELEASE-NOTES-CURRENT.md'), 'utf8');
      const head = notes.trim().split('\n')[0] || '';
      if (!head.startsWith(`v${version} `)) throw new Error(`릴리스 노트 첫 줄(${head.slice(0, 20)})이 package.json ${version} 과 다릅니다 — 버전 올리기·노트 분리를 먼저 하세요.`);
      try {
        capture('git', ['rev-parse', `v${version}`]);
        throw new Error(`태그 v${version} 이 이미 있습니다 — 버전을 올리고 다시 실행하세요.`);
      } catch (e) {
        if (String(e.message).includes('이미 있습니다')) throw e; // 위에서 던진 것
      }
      console.log(`선행 조건 통과 — main, 깨끗, v${version}`);
    },
  },
  { id: 'checks', label: '검사 — 라우트·e2e 타입·배포 불변·릴리스 노트·업데이터·outbox·코어 잠금', fn: () => { npm('release:all'); } },
  { id: 'build', label: '빌드 — 설치형·포터블(ENV 마커는 다음 단계에서 확인)', fn: () => { npm('electron:build:release'); } },
  {
    id: 'markers',
    label: 'ENV 마커 — app.asar 에 NAS 주소가 있고 Supabase 흔적이 없는지(포터블 exe 는 압축이라 오탐)',
    fn: () => {
      const asar = path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar');
      if (!fs.existsSync(asar)) throw new Error('app.asar 이 없습니다 — build 단계를 먼저 실행하세요.');
      const buf = fs.readFileSync(asar);
      const count = needle => buf.toString('latin1').split(needle).length - 1;
      const nas = count('crm-api.mkcorp.familyds.com');
      const supabase = count('hmgxhrtqfbffqrleorxf');
      const ver = count(version);
      if (nas < 1) throw new Error('NAS 주소 마커가 없습니다 — .env 오염(서버 연결 빠진 exe) 의심.');
      if (supabase > 0) throw new Error('Supabase 마커가 있습니다 — 구 .env 오염 의심.');
      if (ver < 1) throw new Error(`버전 ${version} 문자열이 asar 에 없습니다.`);
      console.log(`마커 확인 — NAS ${nas} · Supabase ${supabase} · v${version} ${ver}`);
    },
  },
  { id: 'portable', label: '포터블 업데이트 매니페스트(해시·노트 포함)', fn: () => { npm('electron:portable:prepare'); } },
  { id: 'mobile', label: '모바일 번들·매니페스트', fn: () => { npm('mobile:prepare'); } },
  { id: 'github', label: `GitHub Release v${version} 생성·자산 업로드`, fn: () => { node('create-github-release.mjs'); } },
  { id: 'channel', label: 'NAS 업데이트 채널 게시(해시 대조 뒤 원자 교체)', fn: () => { node('publish-nas-channel.mjs'); } },
  {
    id: 'server',
    label: 'NAS 서버 재배포 — server/ 변경이 있을 때만',
    fn: () => {
      if (!serverChanged()) { console.log('server/ 변경 없음 — 재배포 생략(서버는 그대로 최신).'); return; }
      console.log('server/ 변경 있음 — 재배포를 시도합니다. sudo 규칙이 없으면 NO_SUDO 로 끝나고, 그때는 오너가 DSM 작업을 한 번 등록해야 합니다.');
      node('deploy-nas-server.mjs');
    },
  },
  { id: 'verify', label: '배포 검증 — 서버 헬스·재설정 페이지·기능 API·인증 라우트·채널 버전', fn: () => { npm('verify:nas'); } },
];

if (has('--list') || has('--help')) {
  console.log(`릴리스 단계 (v${version})`);
  for (const s of steps) console.log(`  ${s.id.padEnd(9)} ${s.label}`);
  console.log('\n옵션: --dry-run · --from=<id> · --only=<id> · --skip=<id,id>');
  process.exit(0);
}

let picked = steps;
if (only) {
  picked = steps.filter(s => s.id === only);
  if (picked.length === 0) { console.error(`그런 단계가 없습니다: ${only}`); process.exit(1); }
} else if (from) {
  const at = steps.findIndex(s => s.id === from);
  if (at < 0) { console.error(`그런 단계가 없습니다: ${from}`); process.exit(1); }
  picked = steps.slice(at);
}
picked = picked.filter(s => !skip.includes(s.id));

console.log(`\n릴리스 v${version} — 단계 ${picked.length}개${dryRun ? ' (dry-run: 아무것도 바꾸지 않습니다)' : ''}`);
for (const s of picked) console.log(`  · ${s.id} — ${s.label}`);
console.log('');

if (dryRun) {
  console.log('dry-run 이라 여기서 끝냅니다. 실제로 돌리려면 --dry-run 없이 실행하세요.');
  process.exit(0);
}

const done = [];
for (const step of picked) {
  const started = new Date();
  console.log(`\n── [${step.id}] ${step.label}`);
  try {
    step.fn();
  } catch (e) {
    console.error(`\n✖ [${step.id}] 실패: ${e.message || e}`);
    console.error(`끝난 단계: ${done.join(' → ') || '없음'}`);
    console.error(`고친 뒤 이어서: node scripts/release-run.mjs --from=${step.id}`);
    process.exit(1);
  }
  const sec = Math.round((Date.now() - started.getTime()) / 1000);
  done.push(step.id);
  console.log(`✔ [${step.id}] 완료 (${sec}초)`);
}

console.log(`\n✅ 릴리스 v${version} 단계 ${done.length}개 완료: ${done.join(' → ')}`);
console.log('남은 일: 릴리스 기록 커밋(로드맵·브리핑·노션), 48시간 내 어드민 대시보드 구버전 지점 0곳 확인(DISTRIBUTION-POLICY).');
