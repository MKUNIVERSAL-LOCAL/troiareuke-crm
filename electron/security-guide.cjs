// 백신 예외 등록 "안내 도우미" — 설정 > 데이터 백업 > "백신·보안 예외" 카드에서 호출.
//
// 배포 불변 원칙(docs/DISTRIBUTION-POLICY.md): 미서명 exe가 백신에 오탐·검역되면 재설치가 필요해진다.
// 이 모듈은 보안 설정을 프로그램이 대신 바꾸지 않는다. 사용자가 직접 등록할 수 있도록
//   1) 등록해야 할 폴더·실행 파일 경로를 계산해 주고
//   2) 그 경로를 클립보드에 복사해 주고
//   3) Windows 보안의 "바이러스 및 위협 방지 설정" 화면을 바로 열어 준다 (windowsdefender:// URI)
// 만 수행한다. 사용자는 열린 화면에서 [제외 추가] → 붙여넣기 두 번으로 끝난다.
const path = require('path');

/** 예외로 등록할 대상 — 포터블은 exe가 있는 폴더, 폴더형은 설치 폴더. 데이터 폴더(업데이트 파일 보관)는 공통. */
function getExclusionTargets(app) {
  const portable = process.env.PORTABLE_EXECUTABLE_FILE;
  const installDir = portable ? path.dirname(portable) : path.dirname(process.execPath);
  const exeName = path.basename(portable || process.execPath);
  return {
    paths: [installDir, app.getPath('userData')],
    processes: [exeName],
    isPortable: Boolean(portable),
  };
}

function registerSecurityGuideIpc({ app, ipcMain, shell, clipboard }) {
  ipcMain.handle('security-guide-targets', () => ({
    supported: process.platform === 'win32',
    packaged: app.isPackaged,
    ...getExclusionTargets(app),
  }));

  // Windows 보안 > 바이러스 및 위협 방지 설정 화면 열기 (Windows 10/11 공식 URI 스킴)
  ipcMain.handle('security-guide-open-defender', async () => {
    if (process.platform !== 'win32') return { success: false, reason: 'unsupported-platform' };
    try {
      await shell.openExternal('windowsdefender://threatsettings/');
      return { success: true };
    } catch (error) {
      return { success: false, reason: 'open-failed', detail: error.message };
    }
  });

  // 등록할 경로를 줄바꿈으로 이어 클립보드에 복사 (제외 추가 대화상자에 붙여넣기용)
  ipcMain.handle('security-guide-copy-paths', () => {
    const { paths } = getExclusionTargets(app);
    clipboard.writeText(paths.join('\r\n'));
    return { success: true, count: paths.length };
  });
}

module.exports = { registerSecurityGuideIpc, getExclusionTargets };
