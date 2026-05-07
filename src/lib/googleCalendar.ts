/**
 * Google Calendar 연동 모듈
 *
 * - Implicit grant (response_type=token) OAuth flow (SPA, 백엔드 없음)
 * - Google Calendar API v3 REST endpoints
 * - localStorage 기반 토큰 저장
 */

import type { Reservation } from '../types';

// ─── 상수 ─────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

// Electron 앱에서는 로컬 콜백 서버(127.0.0.1:19876)를 기본 사용.
// 웹 배포 경로가 필요하면 .env 에 VITE_GOOGLE_REDIRECT_URI 를 설정하고
// Google Cloud Console > OAuth 승인된 리디렉션 URI 에도 동일한 값을 등록한다.
const IS_ELECTRON = typeof window !== 'undefined' && navigator.userAgent.includes('Electron');
const REDIRECT_URI =
  (import.meta.env.VITE_GOOGLE_REDIRECT_URI as string | undefined) ||
  'http://127.0.0.1:19876/google-callback';
const SCOPE = 'https://www.googleapis.com/auth/calendar';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

const TOKEN_KEY = 'google_calendar_token';
const TOKEN_EXPIRY_KEY = 'google_calendar_token_expiry';

// ─── 토큰 관리 ────────────────────────────────────────────────

export function getAccessToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!token || !expiry) return null;
  if (Date.now() > Number(expiry)) {
    // 토큰 만료됨
    clearTokens();
    return null;
  }
  return token;
}

export function isGoogleCalendarConnected(): boolean {
  return getAccessToken() !== null;
}

export function saveTokenFromHash(hash: string): boolean {
  // hash format: #access_token=...&token_type=Bearer&expires_in=3600&scope=...
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  const expiresIn = params.get('expires_in');

  if (!accessToken) return false;

  const expiryMs = Date.now() + (Number(expiresIn || 3600) * 1000);
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiryMs));
  return true;
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

// ─── OAuth Flow ───────────────────────────────────────────────

/** 비-Electron 환경에서 VITE_GOOGLE_REDIRECT_URI 가 설정되지 않은 경우의 가드 */
export function isGoogleCalendarAvailable(): boolean {
  return IS_ELECTRON || !!import.meta.env.VITE_GOOGLE_REDIRECT_URI;
}

export function startGoogleOAuth(): void {
  if (!isGoogleCalendarAvailable()) {
    alert(
      'Google 캘린더 연동은 데스크톱 앱(Windows/Mac)에서만 지원됩니다.\n' +
      '브라우저에서 연동이 필요하면 관리자에게 문의해주세요.'
    );
    return;
  }

  const state = crypto.randomUUID();
  sessionStorage.setItem('google_oauth_state', state);

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'token',
    scope: SCOPE,
    state,
    include_granted_scopes: 'true',
    prompt: 'consent',
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  // Electron: IPC를 통해 시스템 브라우저로 열고 로컬 서버에서 콜백 받기
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.startGoogleOAuth) {
    electronAPI.startGoogleOAuth({ authUrl });
    // 토큰 콜백 수신
    electronAPI.onGoogleOAuthToken((hash: string) => {
      if (saveTokenFromHash(hash)) {
        window.location.hash = '#/settings';
        window.location.reload();
      }
    });
  } else {
    // 웹 브라우저: 직접 리디렉트
    window.location.href = authUrl;
  }
}

// ─── API 헬퍼 ─────────────────────────────────────────────────

async function calendarFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new Error('Google Calendar 연결이 필요합니다.');

  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    clearTokens();
    throw new Error('Google 인증이 만료되었습니다. 다시 연결해주세요.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Calendar API 오류 (${res.status})`);
  }

  if (res.status === 204) return {} as T;
  return res.json();
}

// ─── Google Calendar 이벤트 타입 ──────────────────────────────

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  location?: string;
  status?: string;
  htmlLink?: string;
  colorId?: string;
}

interface CalendarEventsResponse {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
}

// ─── CRUD 함수들 ──────────────────────────────────────────────

/**
 * 지정 기간의 Google Calendar 이벤트를 가져옵니다.
 */
export async function fetchCalendarEvents(
  startDate: Date,
  endDate: Date,
): Promise<GoogleCalendarEvent[]> {
  const timeMin = startDate.toISOString();
  const timeMax = endDate.toISOString();
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });

  const data = await calendarFetch<CalendarEventsResponse>(
    `/calendars/primary/events?${params.toString()}`,
  );
  return data.items || [];
}

/**
 * CRM 예약을 Google Calendar 이벤트로 생성합니다.
 */
export async function createCalendarEvent(
  reservation: Reservation,
): Promise<GoogleCalendarEvent> {
  const startDateTime = `${reservation.date}T${reservation.startTime}:00`;
  const endDateTime = `${reservation.date}T${reservation.endTime}:00`;
  const serviceNames = reservation.services.map(s => s.serviceName).join(', ');

  const event = {
    summary: `[CRM] ${reservation.customerName} - ${serviceNames}`,
    description: [
      `고객: ${reservation.customerName}`,
      `연락처: ${reservation.customerPhone}`,
      `담당: ${reservation.staffName}`,
      `시술: ${serviceNames}`,
      `금액: ${reservation.totalPrice.toLocaleString()}원`,
      reservation.memo ? `메모: ${reservation.memo}` : '',
    ].filter(Boolean).join('\n'),
    start: { dateTime: startDateTime, timeZone: 'Asia/Seoul' },
    end: { dateTime: endDateTime, timeZone: 'Asia/Seoul' },
    colorId: '9', // blueberry (purple-ish)
  };

  return calendarFetch<GoogleCalendarEvent>('/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

/**
 * Google Calendar 이벤트를 삭제합니다.
 */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  await calendarFetch<Record<string, never>>(`/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
  });
}

/**
 * CRM 예약 전체를 Google Calendar에 동기화합니다.
 * (간단 구현: 기존 CRM 이벤트를 모두 삭제 후 재생성)
 */
export async function syncReservationsToCalendar(
  reservations: Reservation[],
): Promise<{ created: number; errors: number }> {
  let created = 0;
  let errors = 0;

  // 활성 예약만 동기화
  const active = reservations.filter(
    r => r.status === 'confirmed' || r.status === 'pending',
  );

  for (const r of active) {
    try {
      await createCalendarEvent(r);
      created++;
    } catch {
      errors++;
    }
  }

  return { created, errors };
}

/**
 * Google Calendar 이벤트를 CRM 예약 형식으로 변환합니다.
 * (읽기 전용: 실제 CRM 저장은 호출하는 쪽에서 처리)
 */
export async function fetchCalendarEventsAsReservations(
  startDate: Date,
  endDate: Date,
): Promise<{
  events: GoogleCalendarEvent[];
  asReservationLike: Array<{
    id: string;
    summary: string;
    date: string;
    startTime: string;
    endTime: string;
    isGoogleEvent: true;
    htmlLink?: string;
  }>;
}> {
  const events = await fetchCalendarEvents(startDate, endDate);

  const asReservationLike = events.map(ev => {
    const start = ev.start.dateTime ? new Date(ev.start.dateTime) : null;
    const end = ev.end.dateTime ? new Date(ev.end.dateTime) : null;

    return {
      id: ev.id,
      summary: ev.summary || '(제목 없음)',
      date: start
        ? start.toISOString().split('T')[0]
        : ev.start.date || '',
      startTime: start
        ? `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
        : '00:00',
      endTime: end
        ? `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
        : '00:00',
      isGoogleEvent: true as const,
      htmlLink: ev.htmlLink,
    };
  });

  return { events, asReservationLike };
}
