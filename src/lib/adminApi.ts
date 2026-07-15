/**
 * adminApi.ts — NAS 관리자 API 연동 지점
 *
 * NAS 중앙 서버(VITE_AUTH_API_URL)가 설정되어 있으면 슈퍼어드민 세션으로
 * 지점 관리자 계정을 즉시 발급한다. 미설정 시 pending을 반환한다.
 *
 * 절대 금지: 이 파일에서 supabase.auth.admin.* 호출 금지.
 * 관리자 계정 생성/조회는 서버 사이드(NAS API)에서만 수행합니다.
 */
import { adminCreateUser, isAuthApiConfigured } from './authApi';

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
  /** 서버가 발급한 임시 비밀번호 — 이 응답에서만 1회 확인 가능 */
  temporaryPassword?: string;
}

export async function createBranchAdmin(
  payload: CreateBranchAdminPayload
): Promise<AdminApiResult> {
  if (!isAuthApiConfigured) {
    return { ok: false, pending: true, reason: 'NAS 관리자 API 미연동' };
  }
  try {
    const result = await adminCreateUser({
      email: payload.email,
      role: 'admin',
      plan: payload.plan,
      branchId: payload.branchId,
      branchName: payload.branchName,
      shopType: payload.shopType,
    });
    return { ok: true, pending: false, temporaryPassword: result.temporaryPassword };
  } catch (e: any) {
    return { ok: false, pending: false, reason: e?.message || '계정 생성 요청 실패' };
  }
}
