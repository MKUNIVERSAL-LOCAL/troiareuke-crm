// DB 행 → API 응답 매퍼 (227, GAP Q-3)
// server.js 에 있던 정의를 그대로 옮겼다 — 동작 변경 없음. 지점 앱이 보는 "내 계정" 의 전부이고,
// 역할·상태·사용기간·버전 텔레메트리가 여기서 결정되므로 기본값이 틀리면 권한이 조용히 달라진다.
// trial_ends_at·created_at 은 스키마에서 NOT NULL 이라 Date 변환이 안전하다(nullable 인 service_ends_at·last_seen_at 은 null 분기).

export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone || undefined,
    shopName: row.shop_name || '',
    shopType: row.shop_type || '',
    plan: row.plan || 'trial',
    trialEndsAt: new Date(row.trial_ends_at).toISOString(),
    isOnboarded: Boolean(row.is_onboarded),
    role: row.role || 'staff',
    branchId: row.branch_id || undefined,
    branchName: row.branch_name || undefined,
    shopPhone: row.shop_phone || undefined,
    shopAddress: row.shop_address || undefined,
    businessNumber: row.business_number || undefined,
    isActive: row.is_active !== false,
    serviceEndsAt: row.service_ends_at ? new Date(row.service_ends_at).toISOString() : null,
    mustChangePassword: row.must_change_password === true,
    // 신청/승인 흐름 (2026-09-18) — pending: 승인 대기, approved: 로그인 가능, rejected: 거부 (reject_reason 표시)
    status: row.status || 'approved',
    rejectReason: row.reject_reason || null,
    // 프로그램 버전 텔레메트리 (배포 불변 원칙 — 구버전으로 남은 지점을 본사가 먼저 발견)
    lastAppVersion: row.last_app_version || null,
    lastAppMode: row.last_app_mode || null,
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
