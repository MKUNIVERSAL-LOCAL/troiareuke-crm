// 기능 레지스트리 — 어드민 기능 제어의 단일 카탈로그 (비코어)
// 어드민 콘솔(/admin/features)과 지점 화면 게이트(Layout/Sidebar)가 모두 이 목록을 사용한다.
// 새 기능을 어드민 제어 대상으로 추가하려면 여기에 항목 하나만 더하면 된다.

export type FeatureCategory = '핵심 모듈' | '부가 기능';

export interface FeatureDef {
  id: string;
  label: string;
  description: string;
  category: FeatureCategory;
  /** 어드민이 아무 설정도 안 했을 때의 기본 사용 가능 여부 */
  defaultOn: boolean;
  /** 모듈(페이지) 기능일 때의 라우트 — Layout 게이트·메뉴 필터 매핑용 */
  route?: string;
  /** 페이지가 자체 Coming Soon 화면을 갖고 있어 Layout 게이트에서 제외 (메뉴는 SOON 배지 유지) */
  selfGated?: boolean;
  /** 샵(기기)별 사용 토글 — 어드민이 허용해도 샵 관리자가 기기에서 끌 수 있는 기능 */
  deviceToggle?: { key: string; defaultOn: boolean };
}

export const FEATURES: FeatureDef[] = [
  // ── 핵심 모듈 (사이드바 메뉴 = 페이지 단위) ──────────────────────
  { id: 'module.customers', label: '고객 관리', description: '고객 등록·상담·사진·타임랩스 등 고객 관리 전체', category: '핵심 모듈', defaultOn: true, route: '/customers' },
  { id: 'module.programs', label: '시술 프로그램', description: '회차권·프로그램 관리', category: '핵심 모듈', defaultOn: true, route: '/programs' },
  { id: 'module.reservations', label: '예약 관리', description: '예약 등록·일정 관리', category: '핵심 모듈', defaultOn: true, route: '/reservations' },
  { id: 'module.treatments', label: '시술 기록', description: '시술 이력·전후 사진', category: '핵심 모듈', defaultOn: true, route: '/treatments' },
  { id: 'module.staff', label: '직원 관리', description: '직원 등록·관리', category: '핵심 모듈', defaultOn: true, route: '/staff' },
  { id: 'module.products', label: '제품/재고', description: '제품·재고 관리', category: '핵심 모듈', defaultOn: true, route: '/products' },
  { id: 'module.sales', label: '매출·손익 관리', description: '매출·지출·손익 분석', category: '핵심 모듈', defaultOn: true, route: '/sales' },
  { id: 'module.messaging', label: '문자/카카오 발송', description: 'SMS·카카오 메시지 발송', category: '핵심 모듈', defaultOn: true, route: '/messaging' },
  { id: 'module.aiChat', label: 'AI 분석 챗봇', description: '경영 데이터 AI 분석 챗봇 (끄면 Coming Soon 화면)', category: '핵심 모듈', defaultOn: false, route: '/ai-chat', selfGated: true },
  { id: 'module.apiGuide', label: 'API 연동 가이드', description: '외부 서비스 연동 안내 페이지', category: '핵심 모듈', defaultOn: true, route: '/api-guide' },

  // ── 부가 기능 (페이지 내부 세부 기능) ────────────────────────────
  {
    id: 'customers.beacon',
    label: '비컨 점수 기록 (AI 피부진단기)',
    description: '상담 화면의 비컨 측정 수치 입력·표시와 AI 사진 피부분석. 허용 시 샵 관리자가 설정에서 기기별로 켠다.',
    category: '부가 기능',
    defaultOn: true,
    deviceToggle: { key: 'feature_beacon_consultation', defaultOn: false },
  },
  {
    id: 'dashboard.revisitReminder',
    label: '재방문 리마인더',
    description: '대시보드의 재방문 대상 고객 카드·메시지 초안 생성',
    category: '부가 기능',
    defaultOn: true,
  },
];

export const FEATURE_MAP = new Map(FEATURES.map((f) => [f.id, f]));

export const FEATURE_CATEGORIES: FeatureCategory[] = ['핵심 모듈', '부가 기능'];

/** 현재 경로가 속한 모듈 기능 정의 (없으면 undefined — 대시보드/설정 등 항상 허용 화면) */
export function featureForPath(pathname: string): FeatureDef | undefined {
  return FEATURES.find((f) => f.route && (pathname === f.route || pathname.startsWith(`${f.route}/`)));
}
