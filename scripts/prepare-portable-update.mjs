import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(rootDir, 'release');
const artifactName = '트로이아르케 CRM.exe';
// 공개 채널 파일명은 ASCII 고정 — DSM 발행 스크립트가 이 이름으로 올리며,
// 한글 파일명 URL은 채널에서 404가 나 앱 업데이트 다운로드가 실패한다 (v1.0.36 실사고).
const publicArtifactName = 'TroiareukeCRM-portable.exe';
const sourcePath = path.join(releaseDir, artifactName);
const stageDir = path.join(releaseDir, 'portable-update');
const stagedArtifactPath = path.join(stageDir, artifactName);
const stagedPublicArtifactPath = path.join(stageDir, publicArtifactName);
const publicBaseUrl = 'https://crm-update.mkcorp.familyds.com/portable';

const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf8'));
const sourceStat = await fs.stat(sourcePath).catch(() => null);
if (!sourceStat?.isFile() || sourceStat.size === 0) {
  console.error(`포터블 실행파일이 없습니다: ${sourcePath}`);
  console.error('먼저 npm run electron:build:portable 을 실행하세요.');
  process.exit(1);
}

const hash = crypto.createHash('sha256');
await new Promise((resolve, reject) => {
  const stream = createReadStream(sourcePath);
  stream.on('data', chunk => hash.update(chunk));
  stream.on('end', resolve);
  stream.on('error', reject);
});
const sha256 = hash.digest('hex');

// 변경 내용(릴리스 노트) — docs/RELEASE-NOTES-CURRENT.md가 있으면 매니페스트에 포함.
// 앱의 업데이트 배너가 이 내용을 사용자에게 보여준 뒤 [지금 업데이트] 클릭을 받는다.
const notesPath = path.join(rootDir, 'docs', 'RELEASE-NOTES-CURRENT.md');
const notes = await fs.readFile(notesPath, 'utf8')
  .then(text => text.trim().slice(0, 2000))
  .catch(() => '');

const manifest = {
  version: packageJson.version,
  url: `${publicBaseUrl}/${publicArtifactName}`,
  sha256,
  size: sourceStat.size,
  releaseDate: new Date().toISOString(),
  ...(notes ? { notes } : {}),
};

await fs.mkdir(stageDir, { recursive: true });
await fs.copyFile(sourcePath, stagedArtifactPath);
await fs.copyFile(sourcePath, stagedPublicArtifactPath); // gh release 업로드용 (수동 cp 단계 제거)
await fs.writeFile(path.join(stageDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

// 공지 게시판용 누적 업데이트 로그 — docs/RELEASE-HISTORY.json이 정본(커밋됨),
// 이번 버전 노트를 맨 앞에 추가(중복 방지)하고 history.json으로 스테이징한다.
const historyPath = path.join(rootDir, 'docs', 'RELEASE-HISTORY.json');
let history = [];
try { history = JSON.parse(await fs.readFile(historyPath, 'utf8')); } catch { history = []; }
if (notes && history[0]?.version !== packageJson.version) {
  history.unshift({
    version: packageJson.version,
    releaseDate: new Date().toISOString().slice(0, 10),
    notes,
  });
  await fs.writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
}
await fs.writeFile(path.join(stageDir, 'history.json'), `${JSON.stringify(history, null, 2)}\n`, 'utf8');

// 앱 내장 fallback(src/data/releaseHistory.ts)도 함께 갱신 — exe(file://)에서 업데이트 채널이
// CORS로 차단되어도 공지 게시판이 설치 시점 기준 로그를 표시할 수 있게 한다.
const bundledPath = path.join(rootDir, 'src', 'data', 'releaseHistory.ts');
const bundled = [
  '// ⚠️ 자동 생성 파일 — scripts/prepare-portable-update.mjs가 릴리스 때마다 갱신.',
  '// 공지 게시판의 오프라인/CORS 차단 시 fallback (서버 응답이 있으면 서버본 우선).',
  'export interface ReleaseHistoryEntry {',
  '  version: string;',
  '  releaseDate?: string;',
  '  notes?: string;',
  '}',
  '',
  `const releaseHistory: ReleaseHistoryEntry[] = ${JSON.stringify(history, null, 2)};`,
  '',
  'export default releaseHistory;',
  '',
].join('\n');
await fs.writeFile(bundledPath, bundled, 'utf8');

const nasRoot = process.env.NAS_UPDATE_DIR;
if (nasRoot) {
  const targetDir = path.join(nasRoot, 'portable');
  await fs.mkdir(targetDir, { recursive: true });

  async function publishAtomically(name) {
    const source = path.join(stageDir, name);
    const finalPath = path.join(targetDir, name);
    const temporaryPath = `${finalPath}.uploading`;
    await fs.copyFile(source, temporaryPath);
    await fs.rename(temporaryPath, finalPath);
  }

  await publishAtomically(publicArtifactName); // manifest.url이 가리키는 공개 파일명 — exe를 latest.json보다 먼저
  await publishAtomically('history.json');
  await publishAtomically('latest.json');
  console.log(`NAS 게시 완료: ${targetDir}`);
}

console.log(`포터블 업데이트 준비 완료: ${stageDir}`);
console.log(`버전: ${manifest.version}`);
console.log(`SHA-256: ${manifest.sha256}`);
