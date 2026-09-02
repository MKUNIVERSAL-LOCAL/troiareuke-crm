// GitHub Release 자동 생성 — npm run release:all 의 마지막 단계.
// package.json 버전으로 v{version} 릴리스를 만들고 스테이징 산출물 4종을 업로드한다.
// 선행: electron:build:portable + electron:portable:prepare 완료 상태.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const tag = `v${version}`;
const stageDir = path.join(rootDir, 'release', 'portable-update');
const notesPath = path.join(rootDir, 'docs', 'RELEASE-NOTES-CURRENT.md');

const assets = ['TroiareukeCRM-portable.exe', 'TroiareukeCRM-win64.zip', 'latest.json', 'history.json']
  .map((name) => path.join(stageDir, name));
for (const asset of assets) {
  if (!fs.existsSync(asset)) {
    console.error(`산출물 없음: ${asset}\n먼저 npm run electron:build:portable && npm run electron:portable:prepare 를 실행하세요.`);
    process.exit(1);
  }
}

// 노트 첫 줄에서 제목 추출 (예: "v1.0.46 업데이트 내용")
const firstLine = fs.readFileSync(notesPath, 'utf8').trim().split('\n')[0] || tag;
const title = `${tag} — ${firstLine.replace(/^v[\d.]+\s*/, '').trim() || '업데이트'}`;

// 이미 존재하는 태그면 실패 대신 안내 (배포 불변 원칙: 같은 버전 재게시 금지)
try {
  execFileSync('gh', ['release', 'view', tag], { cwd: rootDir, stdio: 'ignore' });
  console.error(`릴리스 ${tag} 가 이미 존재합니다. package.json 버전을 올린 뒤 다시 실행하세요.`);
  process.exit(1);
} catch {
  /* 없음 — 정상 진행 */
}

execFileSync('gh', ['release', 'create', tag, '--title', title, '--notes-file', notesPath, ...assets], {
  cwd: rootDir,
  stdio: 'inherit',
});
console.log(`\nGitHub Release ${tag} 게시 완료.`);
console.log('NAS 채널 반영: DSM CRM-publish-update 실행(또는 자동 스케줄) → crm-update 채널 라이브.');
