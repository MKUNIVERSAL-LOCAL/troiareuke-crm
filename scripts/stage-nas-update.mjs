/**
 * NAS 업데이트 파일 배포 도구
 *
 * 사용법:
 *   $env:NAS_UPDATE_DIR='\\NAS이름\\공유폴더\\crm-updates'; npm run release:stage
 *
 * release/ 에서 NSIS 설치 파일·blockmap을 먼저 복사하고 latest.yml을 마지막에
 * 교체한다. 실행 중인 클라이언트가 반쯤 올라간 릴리스를 받지 않도록 하기 위함이다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(rootDir, 'release');
const targetDir = process.env.NAS_UPDATE_DIR;

if (!targetDir) {
  console.error('NAS_UPDATE_DIR 환경변수를 NAS의 crm-updates 공유 경로로 설정하세요.');
  process.exit(1);
}

const latestPath = path.join(releaseDir, 'latest.yml');
let latest;
try {
  latest = await fs.readFile(latestPath, 'utf8');
} catch {
  console.error('release/latest.yml 파일이 없습니다. 먼저 npm run electron:installer 를 실행하세요.');
  process.exit(1);
}

const artifactMatch = latest.match(/^path:\s*["']?(.+?)["']?\s*$/m);
if (!artifactMatch) {
  console.error('latest.yml에서 설치 파일 경로를 찾지 못했습니다.');
  process.exit(1);
}

const artifactName = artifactMatch[1];
if (path.basename(artifactName) !== artifactName || path.isAbsolute(artifactName)) {
  console.error(`latest.yml의 설치 파일 경로가 안전하지 않습니다: ${artifactName}`);
  process.exit(1);
}

const version = latest.match(/^version:\s*(.+)$/m)?.[1]?.trim();
if (!version) {
  console.error('latest.yml에서 배포 버전을 찾지 못했습니다.');
  process.exit(1);
}

const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf8'));
if (packageJson.version !== version) {
  console.error(`배포 파일 버전(${version})과 package.json 버전(${packageJson.version})이 다릅니다. 설치 파일을 다시 빌드하세요.`);
  process.exit(1);
}

const artifacts = [artifactName, `${artifactName}.blockmap`];
for (const name of artifacts) {
  try {
    const stat = await fs.stat(path.join(releaseDir, name));
    if (!stat.isFile() || stat.size === 0) throw new Error('empty artifact');
  } catch {
    console.error(`필수 배포 파일이 없습니다: release/${name}`);
    process.exit(1);
  }
}

await fs.mkdir(targetDir, { recursive: true });

async function copyAtomically(name) {
  const source = path.join(releaseDir, name);
  const finalPath = path.join(targetDir, name);
  const temporaryPath = `${finalPath}.uploading`;
  await fs.copyFile(source, temporaryPath);
  await fs.rename(temporaryPath, finalPath);
}

for (const name of artifacts) await copyAtomically(name);
// latest.yml은 마지막에 공개해야 클라이언트가 완성된 설치 파일만 받는다.
await copyAtomically('latest.yml');

console.log(`NAS 업데이트 배포 완료: ${targetDir}`);
console.log(`배포 버전: ${version}`);
