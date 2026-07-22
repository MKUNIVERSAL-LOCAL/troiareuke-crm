import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(rootDir, 'release');
const artifactName = '트로이아르케 CRM.exe';
const sourcePath = path.join(releaseDir, artifactName);
const stageDir = path.join(releaseDir, 'portable-update');
const stagedArtifactPath = path.join(stageDir, artifactName);
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
  url: `${publicBaseUrl}/${encodeURIComponent(artifactName)}`,
  sha256,
  size: sourceStat.size,
  releaseDate: new Date().toISOString(),
  ...(notes ? { notes } : {}),
};

await fs.mkdir(stageDir, { recursive: true });
await fs.copyFile(sourcePath, stagedArtifactPath);
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

  await publishAtomically(artifactName);
  await publishAtomically('latest.json');
  console.log(`NAS 게시 완료: ${targetDir}`);
}

console.log(`포터블 업데이트 준비 완료: ${stageDir}`);
console.log(`버전: ${manifest.version}`);
console.log(`SHA-256: ${manifest.sha256}`);
