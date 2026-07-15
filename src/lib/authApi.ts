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

export const isAuthApiConfigured = Boolean(apiBaseUrl);

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isAuthApiConfigured) throw new Error('중앙 계정 서버가 설정되지 않았습니다.');
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '계정 서버 요청에 실패했습니다.');
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

export async function restoreAuthApiSession() {
  if (!localStorage.getItem(AUTH_TOKEN_KEY)) return null;
  try {
    const response = await apiRequest<{ user: AuthApiUser }>('/api/auth/me');
    return response.user;
  } catch {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    return null;
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
