// bookingRequests — 예약 요청함 (비코어, 143, GAP R-6·R-10)
// 전화·카톡·네이버로 들어온 "예약 요청"을 바로 예약으로 못 잡을 때(담당자·베드 확인이 필요할 때) 적어 두고, 확인 뒤 예약으로 등록하거나 거절한다.
// 어댑터 인터페이스 하나로 — 지금은 이 기기 로컬(localStorage) 어댑터. 고객 온라인 예약 공개 라우트(승인 B-2)가 열리면 같은 인터페이스의
// 서버 어댑터로 바꾸고 화면은 그대로 쓴다. 요청은 예약이 아니다 — 겹침·가용 검사는 "예약으로 등록"에서 예약 폼이 한다.
import { getShopId, safeSetItem, CustomerStore } from './store';
import { normalizePhone } from './inputRules';
import type { BookingRequest, BookingChannel, Customer, ReservationSource } from '../types';

export type NewBookingRequest = Omit<BookingRequest, 'id' | 'createdAt' | 'status' | 'reservationId' | 'decidedAt'>;

export interface BookingRequestAdapter {
  list(): BookingRequest[];
  add(input: NewBookingRequest): BookingRequest;
  update(id: string, patch: Partial<BookingRequest>): BookingRequest | null;
}

const KEY = () => `crm_${getShopId()}_booking_requests`;
const KEEP_DECIDED_DAYS = 90; // 처리된 요청은 90일 뒤 정리

function read(): BookingRequest[] {
  try { const raw = localStorage.getItem(KEY()); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function write(list: BookingRequest[]): void {
  const cutoff = Date.now() - KEEP_DECIDED_DAYS * 86400000;
  safeSetItem(KEY(), JSON.stringify(list.filter(r => r.status === 'new' || !r.decidedAt || new Date(r.decidedAt).getTime() >= cutoff)));
}
function genId(): string {
  return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/** 로컬 어댑터 — 이 기기에만 남는다(요청은 접수 직원이 바로 처리하는 짧은 대기 목록). 서버 어댑터는 승인 B-2 뒤 */
const localAdapter: BookingRequestAdapter = {
  list: () => read(),
  add(input) {
    const req: BookingRequest = { ...input, id: genId(), createdAt: new Date().toISOString(), status: 'new' };
    write([...read(), req]);
    return req;
  },
  update(id, patch) {
    const list = read();
    const i = list.findIndex(r => r.id === id);
    if (i < 0) return null;
    list[i] = { ...list[i], ...patch };
    write(list);
    return list[i];
  },
};

export const bookingRequests: BookingRequestAdapter = localAdapter;

export const CHANNEL_LABEL: Record<BookingChannel, string> = { phone: '전화', kakao: '카카오', naver: '네이버', web: '온라인' };
/** 요청 채널 → 예약 유입 경로(SourceBadge) */
export const CHANNEL_SOURCE: Record<BookingChannel, ReservationSource> = { phone: 'phone', kakao: 'kakao', naver: 'naver', web: 'app' };

/** 처리 전 요청 — 날짜·시간 순 */
export function newRequests(): BookingRequest[] {
  return bookingRequests.list().filter(r => r.status === 'new').sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

export function findCustomerByPhone(phone: string): Customer | null {
  const p = normalizePhone(phone);
  if (!p) return null;
  return CustomerStore.getAll().find(c => !c.id.startsWith('sample_') && c.isActive !== false && normalizePhone(c.phone) === p) ?? null;
}

/** 요청의 고객 — 전화번호가 같은 고객이 있으면 그 고객, 없으면 신규 등록(요청 접수 때 받은 개인정보 동의를 기록) */
export function ensureCustomerFor(req: BookingRequest): Customer {
  const found = findCustomerByPhone(req.phone);
  if (found) return found;
  return CustomerStore.save({
    name: req.customerName.trim(),
    phone: req.phone.trim(),
    gender: '미입력',
    grade: '신규',
    tags: [],
    isActive: true,
    referralSource: `${CHANNEL_LABEL[req.channel]} 예약 요청`,
    privacyConsent: req.privacyConsent,
    privacyConsentAt: req.privacyConsent ? req.createdAt : undefined,
  });
}

export function acceptRequest(id: string, reservationId: string): void {
  bookingRequests.update(id, { status: 'accepted', reservationId, decidedAt: new Date().toISOString() });
}

export function rejectRequest(id: string): void {
  bookingRequests.update(id, { status: 'rejected', decidedAt: new Date().toISOString() });
}
