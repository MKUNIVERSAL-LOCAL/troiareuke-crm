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

const manifest = {
  version: packageJson.version,
  url: `${publicBaseUrl}/${encodeURIComponent(artifactName)}`,
  sha256,
  size: sourceStat.size,
  releaseDate: new Date().toISOString(),
};

await fs.mkdir(stageDir, { recursive: true });
await fs.copyFile(sourcePath, stagedArtifactPath);
await fs.writeFile(path.join(stageDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

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
