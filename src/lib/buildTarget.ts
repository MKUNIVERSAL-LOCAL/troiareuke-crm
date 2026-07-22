// 프로그램(빌드) 단위 화면 분리 — 비코어
// 일반 exe에는 관리자 콘솔이, 어드민 exe에는 지점 화면이 절대 나오지 않게 한다.
// (기존에는 계정 권한으로만 나눠서, 일반 exe에 슈퍼어드민 로그인 시 관리자 화면이 뜨는 혼동 발생)
// 웹(브라우저)에서는 빌드 구분이 없으므로 기존 권한 기반 동작을 유지한다.

const api = (window as unknown as { electronAPI?: { isElectron?: boolean; isAdminBuild?: boolean } }).electronAPI;

export const IS_ELECTRON_APP = Boolean(api?.isElectron);
export const IS_ADMIN_BUILD = Boolean(api?.isAdminBuild);

/** 일반(지점용) exe에서 관리자 화면 차단 */
export const BLOCK_ADMIN_UI = IS_ELECTRON_APP && !IS_ADMIN_BUILD;
/** 어드민 exe에서 지점 화면 차단 */
export const BLOCK_STAFF_UI = IS_ELECTRON_APP && IS_ADMIN_BUILD;
