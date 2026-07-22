// 어드민(총괄 관리자) 전용 실행파일 빌드 설정 — npm run electron:build:admin:dir
// 직원용 빌드와 appId·이름·출력폴더를 분리해 같은 PC에서 동시 실행 가능(프로필 분리).
// extraMetadata.adminBuild 가 electron/main.cjs 에서 어드민 모드 스위치로 쓰인다.
module.exports = {
  appId: 'com.troiareuke.crm.admin',
  productName: '트로이아르케 CRM 어드민',
  copyright: 'Copyright © 2024 TROIAREUKE',
  directories: { output: 'release-admin' },
  files: ['dist/**/*', 'electron/**/*'],
  extraMetadata: { adminBuild: true },
  win: {
    target: [{ target: 'portable', arch: ['x64'] }],
  },
  portable: {
    artifactName: '트로이아르케 CRM 어드민.exe',
    requestExecutionLevel: 'user',
  },
};
