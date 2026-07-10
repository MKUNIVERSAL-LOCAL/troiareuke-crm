/**
 * adminApi.ts — NAS 관리자 API 연동 지점
 *
 * 현재: 모든 함수가 pending 상태를 반환합니다.
 * NAS 백엔드 준비 완료 시 여기만 교체하면 됩니다.
 *
 * 절대 금지: 이 파일에서 supabase.auth.admin.* 호출 금지.
 * 관리자 계정 생성/조회는 service_role을 가진 서버 사이드(NAS API)에서만 수행합니다.
 */

export interface CreateBranchAdminPayload {
  email: string;
  branchId: string;
  branchName: string;
  shopType: string;
  plan: string;
}

export interface AdminApiResult {
  ok: boolean;
  pending: boolean;
  reason?: string;
}

/**
 * 지점 관리자 계정 생성 요청.
 *
 * TODO(NAS 연동): 아래 pending 블록을 제거하고 NAS 서버 엔드포인트 호출로 교체.
 * 예시:
 *   const res = await fetch('https://nas.troiareuke.local/api/admin/create-user', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json', 'X-Admin-Token': NAS_TOKEN },
 *     body: JSON.stringify(payload),
 *   });
 *   return res.ok ? { ok: true, pending: false } : { ok: false, pending: false, reason: await res.text() };
 */
export async function createBranchAdmin(
  _payload: CreateBranchAdminPayload
): Promise<AdminApiResult> {
  // NAS 관리자 API 미연동 — 연동 후 이 블록을 교체하세요.
  return { ok: false, pending: true, reason: 'NAS 관리자 API 미연동' };
}
