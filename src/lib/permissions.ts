// permissions — 역할별 할 수 있는 일 (비코어, 13차 점검 2026-11-23)
// 그동안 user.role 은 전화번호 마스킹과 모바일 더보기의 매출 숨김에만 쓰였고, 설정·직원 관리·매출·백업·고객 삭제/익명화는 직원(staff) 계정도 URL·메뉴로 전부 할 수 있었다.
// 오너 결정 #14(2026-11-23, 가정): 직원은 예약·고객·시술·제품·문자·AI 챗(매출 제외)까지, 그 밖은 매장 관리자 전용.
// 라우트(FeatureRouteGate)·메뉴(Sidebar/MobileTabBar)·파괴적 핸들러가 전부 이 한 곳을 본다 — 버튼 숨김만으로는 URL·딥링크·키보드 경로가 남는다.
import { isAuthApiConfigured } from './authApi';

export type Role = 'superadmin' | 'admin' | 'staff';

export type Action =
  | 'settings.open'      // 설정 화면 전체(영업시간·연동·AI 키·구독·백업·보존기간·시술 메뉴·앱 잠금)
  | 'staff.manage'       // 직원 관리 화면(추가·수정·삭제·퇴사·연락처·전원 실적)
  | 'sales.view'         // 매출·손익 화면, 대시보드 금액 카드, AI 챗 매출 블록
  | 'customer.delete'    // 고객 삭제·익명화(개별/일괄)·병합
  | 'customer.pii'       // 고객 전화·이메일·주소·생년월일 원문 보기·수정
  | 'ai.key'             // AI API 키 입력·삭제
  | 'consent.edit'       // 광고 수신 동의·거부 기록(고객 상세 동의 컨트롤) (159 리뷰 L-2)
  | 'campaign.manage'    // 자동 발송 캠페인 추가·수정·삭제·사용 토글 — "대상 확인·발송"은 발송 창과 같이 직원도 가능 (159 리뷰 L-2)
  | 'outbox.download';   // 서버가 거부한 저장분(고객 레코드 원문) 파일 내려받기

const ADMIN_ROLES: ReadonlySet<string> = new Set<Role>(['admin', 'superadmin']);

/** 역할이 없는 세션 — 서버(NAS) 모드에서는 직원으로(안전 쪽), 로컬 모드에서는 관리자로.
 *  로컬 모드는 가입이 항상 admin 이고 직원 계정이 없는데(코어 AuthContext), role 필드가 없는 구버전 세션을 직원으로 보면 매장 관리자가 자기 설정에서 영구히 잠긴다 (117~119 리뷰 #H3) */
export function isAdminRole(role: string | undefined | null): boolean {
  if (!role) return !isAuthApiConfigured;
  return ADMIN_ROLES.has(role);
}

/** 지금은 모든 Action 이 관리자 전용 — 이름을 나눠 둔 것은 나중에 직원에게 일부를 열 때 한 줄로 바꾸기 위해서 */
export function canDo(role: string | undefined | null, _action: Action): boolean {
  return isAdminRole(role);
}

/** 라우트 → 필요한 권한. 접두 일치(/settings?tab=…, /sales/… 포함) */
const ROUTE_ACTIONS: ReadonlyArray<[string, Action]> = [
  ['/settings', 'settings.open'],
  ['/staff', 'staff.manage'],
  ['/sales', 'sales.view'],
];

export function actionForRoute(pathname: string): Action | null {
  // react-router 라우트는 대소문자를 가리지 않으므로(/SETTINGS 도 설정 화면) 여기서도 소문자·후행 슬래시를 정리한다 (117~119 리뷰 #H1)
  const p = pathname.toLowerCase().split(/[?#]/)[0].replace(/\/+$/, '') || '/'; // '/settings?tab=shop' 같은 메뉴 링크도 같은 판정 — 체크리스트가 직원에게 남아 있었다 (120~122 리뷰 #H1)
  const hit = ROUTE_ACTIONS.find(([q]) => p === q || p.startsWith(q + '/'));
  return hit ? hit[1] : null;
}

export function canOpenRoute(role: string | undefined | null, pathname: string): boolean {
  const action = actionForRoute(pathname);
  return !action || canDo(role, action);
}

export const ADMIN_REQUIRED_MESSAGE = '관리자 권한이 필요합니다. 매장 관리자 계정으로 로그인해주세요.';
