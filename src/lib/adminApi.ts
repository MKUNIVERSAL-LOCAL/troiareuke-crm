/**
 * adminApi.ts — NAS 관리자 API 연동 지점
 *
 * NAS 중앙 서버(VITE_AUTH_API_URL)가 설정되어 있으면 슈퍼어드민 세션으로
 * 지점 관리자 계정을 즉시 발급한다. 미설정 시 pending을 반환한다.
 *
 * 절대 금지: 이 파일에서 supabase.auth.admin.* 호출 금지.
 * 관리자 계정 생성/조회는 서버 사이드(NAS API)에서만 수행합니다.
 */
import { adminCreateUser, apiRequest, isAuthApiConfigured } from './authApi';

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

// ── 슈퍼어드민 전 데이터 조회 (NAS 서버 /api/admin/*) ─────────────────────

export interface AdminBranchOverview {
  branchId: string;
  branchName: string | null;
  userCount: number;
  recordCounts: Record<string, number>;
  photoCount: number;
  messageCount: number;
  lastActivity: string | null;
}

export interface AdminDataRow {
  id: string;
  updatedAt: string;
  data: Record<string, unknown>;
}

export interface AdminMessageLogRow {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  phone: string | null;
  status: string;
  reason: string | null;
  createdAt: string;
}

export interface AdminScheduledRow {
  id: string;
  sendAt: string;
  type: string;
  title: string | null;
  content: string | null;
  phones: string[];
  status: string;
}

export interface AdminPhotoEntity {
  entityKey: string;
  photoCount: number;
  updatedAt: string;
}

export function fetchAdminOverview() {
  return apiRequest<{ branches: AdminBranchOverview[] }>('/api/admin/overview');
}

export interface AdminBranchAnalytics {
  branchId: string;
  branchName: string | null;
  customers: { total: number; new30d: number };
  revenue: { total: number; refunded: number; paymentCount: number };
  revenueMonthly: { month: string; revenue: number; refunded: number }[];
  revenueDaily: { day: string; revenue: number }[];
  reservations: { total: number; completed: number; upcoming: number };
  treatments: number;
}

export function fetchAdminAnalytics() {
  return apiRequest<{ generatedAt: string; branches: AdminBranchAnalytics[] }>(
    '/api/admin/analytics'
  );
}

// ── 지점별 손익계산서 원자료 (연 단위 월별 매출·지출) ──────────
export interface AdminPnlRevenueRow {
  branchId: string;
  month: string; // YYYY-MM
  type: 'treatment' | 'product' | 'other';
  amount: number;
  count: number;
}

export interface AdminPnlExpenseRow {
  branchId: string;
  month: string; // YYYY-MM
  category: string;
  amount: number;
  count: number;
}

export interface AdminPnlResponse {
  year: string;
  generatedAt: string;
  branchNames: Record<string, string | null>;
  revenue: AdminPnlRevenueRow[];
  expenses: AdminPnlExpenseRow[];
}

export function fetchAdminPnl(year: string) {
  return apiRequest<AdminPnlResponse>(`/api/admin/pnl?year=${encodeURIComponent(year)}`);
}

// ── 공지사항 (본사 → 전 지점, NAS announcements 테이블) ────────
export interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'update' | 'warning' | 'event';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 지점: 게시 중 공지 (로그인 세션 필요) */
export function fetchAnnouncements() {
  return apiRequest<{ announcements: AnnouncementRow[] }>('/api/announcements');
}

export function adminListAnnouncements() {
  return apiRequest<{ announcements: AnnouncementRow[] }>('/api/admin/announcements');
}

export function adminCreateAnnouncement(payload: { title: string; content: string; type: string; isActive: boolean }) {
  return apiRequest<{ announcement: AnnouncementRow }>('/api/admin/announcements', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function adminUpdateAnnouncement(
  id: string,
  updates: Partial<{ title: string; content: string; type: string; isActive: boolean }>,
) {
  return apiRequest<{ announcement: AnnouncementRow }>(`/api/admin/announcements/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function adminDeleteAnnouncement(id: string) {
  return apiRequest<void>(`/api/admin/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function fetchAdminBranchData(
  branchId: string,
  collection: string,
  opts: { limit?: number; offset?: number; q?: string } = {}
) {
  const params = new URLSearchParams();
  params.set('limit', String(opts.limit ?? 50));
  params.set('offset', String(opts.offset ?? 0));
  if (opts.q) params.set('q', opts.q);
  return apiRequest<{ total: number; rows: AdminDataRow[] }>(
    `/api/admin/data/${encodeURIComponent(branchId)}/${encodeURIComponent(collection)}?${params.toString()}`
  );
}

export function fetchAdminBranchMessages(branchId: string, limit = 100) {
  return apiRequest<{ sendLog: AdminMessageLogRow[]; scheduled: AdminScheduledRow[] }>(
    `/api/admin/messages/${encodeURIComponent(branchId)}?limit=${limit}`
  );
}

export function fetchAdminBranchPhotos(branchId: string) {
  return apiRequest<{ entities: AdminPhotoEntity[] }>(
    `/api/admin/photos/${encodeURIComponent(branchId)}`
  );
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
