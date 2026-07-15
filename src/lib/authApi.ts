export interface AuthApiUser {
  id: string;
  email: string;
  name: string;
  phone?: string;
  shopName: string;
  shopType: string;
  plan: 'trial' | 'starter' | 'pro' | 'enterprise';
  trialEndsAt: string;
  isOnboarded: boolean;
  role: 'superadmin' | 'admin' | 'staff';
  branchId?: string;
  branchName?: string;
  shopPhone?: string;
  shopAddress?: string;
  isActive?: boolean;
  createdAt: string;
}

interface AuthResponse {
  user: AuthApiUser;
  token: string;
  expiresAt: string;
}

const apiBaseUrl = (import.meta.env.VITE_AUTH_API_URL as string | undefined)?.trim().replace(/\/$/, '') || '';
const AUTH_TOKEN_KEY = 'troiareuke_auth_token';
const API_TIMEOUT_MS = 10000;

export const isAuthApiConfigured = Boolean(apiBaseUrl);

/** 서버가 응답한 HTTP 오류 — 네트워크 실패(fetch TypeError)와 구분된다 */
export class AuthApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isAuthApiConfigured) throw new Error('중앙 계정 서버가 설정되지 않았습니다.');
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(API_TIMEOUT_MS)])
      : AbortSignal.timeout(API_TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new AuthApiError(data.error || '계정 서버 요청에 실패했습니다.', response.status);
  return data as T;
}

function saveAuth(response: AuthResponse) {
  localStorage.setItem(AUTH_TOKEN_KEY, response.token);
  return response.user;
}

export async function loginWithAuthApi(email: string, password: string) {
  const response = await apiRequest<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return saveAuth(response);
}

export async function signupWithAuthApi(data: { email: string; password: string; name: string; phone: string }) {
  const response = await apiRequest<AuthResponse>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return saveAuth(response);
}

export type RestoreResult =
  | { status: 'ok'; user: AuthApiUser }
  | { status: 'unauthenticated' }   // 토큰 없음/무효 — 로그아웃 처리
  | { status: 'offline' };          // 서버 미접속 — 캐시 세션 유지

export async function restoreAuthApiSession(): Promise<RestoreResult> {
  if (!localStorage.getItem(AUTH_TOKEN_KEY)) return { status: 'unauthenticated' };
  try {
    const response = await apiRequest<{ user: AuthApiUser }>('/api/auth/me');
    return { status: 'ok', user: response.user };
  } catch (error) {
    if (error instanceof AuthApiError && (error.status === 401 || error.status === 403)) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      return { status: 'unauthenticated' };
    }
    // 네트워크 실패 — 토큰을 파기하면 오프라인 사용이 불가능해지므로 유지
    return { status: 'offline' };
  }
}

export async function logoutFromAuthApi() {
  try {
    if (localStorage.getItem(AUTH_TOKEN_KEY)) {
      await apiRequest<void>('/api/auth/logout', { method: 'POST' });
    }
  } finally {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

export async function requestPasswordReset(email: string) {
  return apiRequest<{ message: string }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function updateAuthProfile(data: { shopName: string; shopType: string; shopPhone?: string; shopAddress?: string }) {
  const response = await apiRequest<{ user: AuthApiUser }>('/api/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return response.user;
}

// ── 관리자(슈퍼어드민) 전용: 계정 발급·관리 ─────────────────────
export interface AdminCreateUserPayload {
  email: string;
  name?: string;
  password?: string; // 미지정 시 서버가 임시 비밀번호 발급
  role?: 'admin' | 'staff';
  plan?: string;
  branchId?: string; // 기존 지점에 직원을 추가할 때
  branchName?: string;
  shopType?: string;
  shopPhone?: string;
  shopAddress?: string;
}

export async function adminListUsers() {
  const response = await apiRequest<{ users: AuthApiUser[] }>('/api/admin/users');
  return response.users;
}

export async function adminCreateUser(payload: AdminCreateUserPayload) {
  return apiRequest<{ user: AuthApiUser; temporaryPassword?: string }>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function adminUpdateUser(
  id: string,
  updates: { role?: 'admin' | 'staff'; plan?: string; isActive?: boolean; password?: string },
) {
  const response = await apiRequest<{ user: AuthApiUser }>(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return response.user;
}

export async function adminUpdateBranch(
  id: string,
  updates: { name?: string; shopType?: string; shopPhone?: string; shopAddress?: string; plan?: string; isActive?: boolean },
) {
  const response = await apiRequest<{ users: AuthApiUser[] }>(`/api/admin/branches/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return response.users;
}
