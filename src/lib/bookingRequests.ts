// bookingRequests — 예약 요청함 (비코어, 143·144, GAP R-6·R-10)
// 전화·카톡·네이버로 들어온 "예약 요청"을 바로 예약으로 못 잡을 때(담당자·베드 확인이 필요할 때) 적어 두고, 확인 뒤 예약으로 등록하거나 거절한다.
// 어댑터 인터페이스 하나로 — 지금은 이 기기 로컬(localStorage) 어댑터. 고객 온라인 예약 공개 라우트(승인 B-2)가 열리면 같은 인터페이스의
// 서버 어댑터로 바꾼다. 서버 왕복을 전제로 **전부 비동기**(144 리뷰 L-3) — 로컬 어댑터도 Promise 를 돌려줘 호출처가 바뀌지 않게.
// 요청은 예약이 아니다 — 겹침·가용 검사는 "예약으로 등록"에서 예약 폼이 한다.
import { getShopId, safeSetItem, CustomerStore } from './store';
import { normalizePhone } from './inputRules';
import type { BookingRequest, BookingChannel, Customer, ReservationSource } from '../types';

export type NewBookingRequest = Omit<BookingRequest, 'id' | 'createdAt' | 'status' | 'reservationId' | 'decidedAt'>;

export interface BookingRequestAdapter {
  list(): Promise<BookingRequest[]>;
  add(input: NewBookingRequest): Promise<BookingRequest>;
  update(id: string, patch: Partial<BookingRequest>): Promise<BookingRequest | null>;
}

const KEY = () => `crm_${getShopId()}_booking_requests`;
const KEEP_ACCEPTED_DAYS = 90; // 예약으로 이어진 요청은 90일(예약 이력 대조용)
const KEEP_REJECTED_DAYS = 7;  // 거절한 요청의 이름·전화는 7일 뒤 삭제 — 수집 목적이 사라졌다 (144 리뷰 L-7)

function read(): BookingRequest[] {
  try { const raw = localStorage.getItem(KEY()); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function keep(r: BookingRequest, now: number): boolean {
  if (r.status === 'new' || !r.decidedAt) return true;
  const days = r.status === 'rejected' ? KEEP_REJECTED_DAYS : KEEP_ACCEPTED_DAYS;
  return new Date(r.decidedAt).getTime() >= now - days * 86400000;
}
function write(list: BookingRequest[]): void {
  const now = Date.now();
  safeSetItem(KEY(), JSON.stringify(list.filter(r => keep(r, now))));
}
function genId(): string {
  return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// 마지막으로 읽은 목록(캐시) — 동기 건수 조회(대시보드)가 어댑터를 우회하지 않게 list/add/update 가 갱신한다. 서버 어댑터로 바뀌어도 같은 경로 (198, 191 리뷰 L-4)
let cache: BookingRequest[] | null = null;
function remember(list: BookingRequest[]): BookingRequest[] { cache = list; return list; }

/** 로컬 어댑터 — 이 기기에만 남는다(요청은 접수 직원이 바로 처리하는 짧은 대기 목록). 서버 어댑터는 승인 B-2 뒤 */
const localAdapter: BookingRequestAdapter = {
  list: async () => remember(read()),
  async add(input) {
    const req: BookingRequest = { ...input, id: genId(), createdAt: new Date().toISOString(), status: 'new' };
    write([...read(), req]);
    remember(read());
    return req;
  },
  async update(id, patch) {
    const list = read();
    const i = list.findIndex(r => r.id === id);
    if (i < 0) return null;
    list[i] = { ...list[i], ...patch };
    write(list);
    remember(read());
    return list[i];
  },
};

export const bookingRequests: BookingRequestAdapter = localAdapter;

export const CHANNEL_LABEL: Record<BookingChannel, string> = { phone: '전화', kakao: '카카오', naver: '네이버', web: '온라인' };
/** 요청 채널 → 예약 유입 경로(SourceBadge) */
export const CHANNEL_SOURCE: Record<BookingChannel, ReservationSource> = { phone: 'phone', kakao: 'kakao', naver: 'naver', web: 'app' };

/** 오늘 이후 처리 전 요청 건수(동기) — 대시보드 오늘 할 일용. 어댑터가 갱신한 캐시를 읽고, 아직 한 번도 읽지 않았으면 로컬 어댑터에서만 직접 읽는다(서버 어댑터면 0 — 첫 list 뒤 정확) (188·198) */
export function countNewRequests(today: string): number {
  const list = cache ?? (bookingRequests === localAdapter ? remember(read()) : []);
  return list.filter(r => r.status === 'new' && r.date >= today).length; // 지난 날짜 요청은 요청함에서만(영구 긴급 줄 방지) (191 리뷰)
}

/** 처리 전 요청 — 날짜·시간 순 */
export async function newRequests(): Promise<BookingRequest[]> {
  return (await bookingRequests.list()).filter(r => r.status === 'new').sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

export function findCustomerByPhone(phone: string): Customer | null {
  const p = normalizePhone(phone);
  if (!p) return null;
  return CustomerStore.getAll().find(c => !c.id.startsWith('sample_') && c.isActive !== false && normalizePhone(c.phone) === p) ?? null;
}

/** 요청의 고객 — 전화번호가 같은 고객이 있으면 그 고객, 없으면 신규 등록(요청 접수 때 받은 개인정보 동의를 기록). created 는 이번에 새로 만들었는지 */
export function ensureCustomerFor(req: BookingRequest): { customer: Customer; created: boolean } {
  const found = findCustomerByPhone(req.phone);
  if (found) return { customer: found, created: false };
  const customer = CustomerStore.save({
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
  return { customer, created: true };
}

export function acceptRequest(id: string, reservationId: string): Promise<BookingRequest | null> {
  return bookingRequests.update(id, { status: 'accepted', reservationId, decidedAt: new Date().toISOString() });
}

export function rejectRequest(id: string): Promise<BookingRequest | null> {
  return bookingRequests.update(id, { status: 'rejected', decidedAt: new Date().toISOString() });
}
