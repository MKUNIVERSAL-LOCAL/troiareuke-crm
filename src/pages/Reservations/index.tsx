import { useState, useCallback, useEffect, useMemo, type CSSProperties, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { askConfirm } from '../../lib/confirmDialog';
import { notify } from '../../lib/notify';
import { ChevronLeft, ChevronRight, LayoutGrid, List, Clock, Trash2, Calendar, Search, Scissors } from 'lucide-react';
import { format, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, isSameDay, addMinutes } from 'date-fns';
import { ko } from 'date-fns/locale';
import Header from '../../components/layout/Header';
import { StatusBadge, SourceBadge } from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import PrereqHint from '../../components/ui/PrereqHint';
import CustomerCombobox from '../../components/ui/CustomerCombobox';
import PhoneLink from '../../components/ui/PhoneLink';
import DateQuickChips from '../../components/ui/DateQuickChips';
import PullToRefreshIndicator from '../../components/ui/PullToRefreshIndicator';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useDataRefreshed } from '../../hooks/useDataRefreshed';
import { refreshFromServer } from '../../lib/liveRefresh';
import { ReservationStore, StaffStore, ServiceStore, CustomerStore, PaymentStore, CustomerProgramStore, TreatmentLogStore, SettingsStore } from '../../lib/store';
import { healCustomerStatsWhenReady } from '../../lib/customerStats';
import { remainingFor, healProgramSessionsWhenReady } from '../../lib/programSessions';
import { getLastPaymentMethod, rememberPaymentMethod } from '../../lib/lastUsed';
import { checkBusinessHours } from '../../lib/businessHours';
import { findConflicts, toInterval, overlaps, toMinutes as toMinOf, type Interval } from '../../lib/schedulingRule';
import { nextAvailable } from '../../lib/availabilityRule';
import { dayWindow, checkStaffWindow, offRanges, describeWindow, dayKeyOf } from '../../lib/staffScheduleRule';
import { getReservationPolicy } from '../../lib/reservationPolicy';
import { decideOverlap } from '../../lib/reservationPolicyRule';
import { getStaffSchedule } from '../../lib/staffScheduleStore';
import { activeResources, allResources, resourceAssignments, resourceOf, assignResource } from '../../lib/resourceStore';
import { freeResources, resourceConflicts, RESOURCE_KIND_LABEL } from '../../lib/resourceRule';
import BookingRequestsModal from '../../components/BookingRequestsModal';
import { newRequests, ensureCustomerFor, acceptRequest, CHANNEL_SOURCE } from '../../lib/bookingRequests';
import { waitlistFor, describeWaitlist } from '../../lib/waitlistRule';
import { monthCloseBlock } from '../../lib/monthClose';
import type { BookingRequest } from '../../types';
import type { Reservation, Staff } from '../../types';
import {
  isGoogleCalendarConnected,
  fetchCalendarEventsAsReservations,
  createCalendarEvent,
  deleteCalendarEvent,
} from '../../lib/googleCalendar';
import { registeredPaymentsFor } from '../../lib/pendingCompletion';
import { readableTextOn } from '../../lib/color';
import { getGcalMap, rememberGcalEvent, cleanupGcalEvent, localizeGcalEventDates } from '../../lib/gcalEventMap'; // 예약 ↔ 캘린더 이벤트 매핑 (대시보드 노쇼 처리와 공유)
import { todayISO, formatDate, formatPrice } from '../../lib/format';
import { josa } from '../../lib/josa';
import { isProgramExpired, getUsablePrograms, getExpiredPrograms, expiredProgramsHint } from '../../lib/customerPrograms';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { canOpenRoute } from '../../lib/permissions';
import { isISODate } from '../../lib/inputRules';
import PaymentMethodPicker from '../../components/PaymentMethodPicker';

/** 예약표 시간 범위 — 설정 > 영업시간의 가장 이른 시작·가장 늦은 종료를 덮는 정시 범위. 기본 09:00~21:00, 영업시간이 더 넓으면 그만큼 확장
 *  (고정 09~21이라 08:00·21:30 예약을 잡을 수 없고 범위 밖 일정이 잘리던 것, 4차 UX 점검 2026-11-19) */
function gridRangeFromSettings(): { startMin: number; endMin: number } {
  let start = 9 * 60, end = 21 * 60;
  const bh = SettingsStore.get().businessHours || {};
  for (const h of Object.values(bh)) {
    if (!h || h.isOff) continue;
    const o = timeToMin(h.open), c = h.close === '00:00' ? 24 * 60 : timeToMin(h.close); // 자정 마감은 24:00 (리뷰 67)
    if (!Number.isNaN(o)) start = Math.min(start, Math.floor(o / 60) * 60);
    if (!Number.isNaN(c)) end = Math.max(end, Math.ceil(c / 60) * 60);
  }
  end = Math.min(Math.max(end, start + 60), 24 * 60);
  return { startMin: start, endMin: end };
}
const minToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** 표의 시간 행(정시) */
function hourSlots(range: { startMin: number; endMin: number }): string[] {
  const out: string[] = [];
  for (let m = range.startMin; m < range.endMin; m += 60) out.push(minToTime(m));
  return out;
}
/** 예약 추가의 시작 시간 선택지(30분 단위) */
function halfHourSlots(range: { startMin: number; endMin: number }): string[] {
  const out: string[] = [];
  for (let m = range.startMin; m < range.endMin; m += 30) out.push(minToTime(m));
  return out;
}
/** 지금 이후의 첫 30분 칸 — 오늘 예약을 추가할 때 기본값 (입력 속도 감사 2026-11-18). 영업 종료 뒤면 마지막 칸 */
function nextTimeSlot(slots: string[], now = new Date()): string {
  const rounded = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30;
  const hh = minToTime(Math.min(rounded, 23 * 60 + 30));
  return slots.find(t => t >= hh) ?? slots[slots.length - 1];
}
/** 고객의 활성 회차권 잔여 — 예약 추가·상세에서 바로 보이게 */
function ProgramBalance({ customerId }: { customerId: string }) {
  const active = customerId ? CustomerProgramStore.getActive(customerId) : [];
  if (active.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1" aria-label="회차권 잔여">
      {active.map(cp => (
        <span key={cp.id} className={`text-xs px-2 py-0.5 rounded-full border ${isProgramExpired(cp) ? 'bg-red-50 text-red-700 border-red-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
          {cp.programName}{cp.totalSessions != null ? ` · 잔여 ${remainingFor(cp)}회` : ' · 기간제'}{isProgramExpired(cp) ? ' · 만료' : ''}
        </span>
      ))}
    </div>
  );
}

// ── 스케줄러 시간 비례 렌더링 ─────────────────────────────────────
// 예약 블록을 관리시간(startTime~endTime)에 비례한 높이로 그리기 위한 유틸.
// 그리드 범위는 gridRangeFromSettings()로 뷰마다 계산해 넘긴다 (기본 09:00 ~ 21:00)

function timeToMin(t: string): number {
  const [h, m] = String(t || '').split(':').map(Number);
  if (Number.isNaN(h)) return NaN;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

interface ScheduleEvent<T> {
  item: T;
  startMin: number;
  endMin: number;
  lane: number;      // 같은 시간대에 겹치는 예약들의 가로 배치 순번
  laneCount: number; // 겹침 그룹의 전체 칸 수 (가로 분할 개수)
}

/** 하루치 이벤트에 겹침 레인을 배정. 겹치는 예약은 가로로 분할해 나란히 표시. */
function layoutDayEvents<T>(raw: { item: T; startMin: number; endMin: number }[], range: { startMin: number; endMin: number }): ScheduleEvent<T>[] {
  const events = raw
    .filter(e => !Number.isNaN(e.startMin) && e.startMin < range.endMin)
    .map(e => ({
      ...e,
      // endTime이 비었거나 역전이면 기본 1시간으로 보정, 그리드 범위로 클램프
      startMin: Math.max(e.startMin, range.startMin),
      endMin: Math.min(
        (Number.isNaN(e.endMin) || e.endMin <= e.startMin) ? e.startMin + 60 : e.endMin,
        range.endMin,
      ),
    }))
    .filter(e => e.endMin > range.startMin)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const out: ScheduleEvent<T>[] = [];
  let cluster: ScheduleEvent<T>[] = [];
  let clusterEnd = -1;
  const laneEnds: number[] = [];
  const flush = () => {
    for (const ev of cluster) { ev.laneCount = laneEnds.length; out.push(ev); }
    cluster = [];
    laneEnds.length = 0;
  };
  for (const e of events) {
    if (cluster.length && e.startMin >= clusterEnd) flush();
    let lane = laneEnds.findIndex(end => end <= e.startMin);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(e.endMin); }
    else laneEnds[lane] = e.endMin;
    const ev: ScheduleEvent<T> = { ...e, lane, laneCount: 1 };
    cluster.push(ev);
    clusterEnd = cluster.length === 1 ? e.endMin : Math.max(clusterEnd, e.endMin);
  }
  flush();
  return out;
}

/** 이벤트 블록의 절대배치 스타일 — 시작 슬롯 셀 기준, 시간 길이에 비례한 높이 */
function eventBlockStyle(ev: ScheduleEvent<unknown>, slotStartMin: number, rowH: number): CSSProperties {
  return {
    top: `${((ev.startMin - slotStartMin) / 60) * rowH + 2}px`,
    height: `${Math.max(((ev.endMin - ev.startMin) / 60) * rowH - 4, 20)}px`,
    left: `calc(${(ev.lane * 100) / ev.laneCount}% + 2px)`,
    width: `calc(${100 / ev.laneCount}% - 4px)`,
  };
}

// ── Google Calendar 이벤트 매핑 (reservationId → eventId) ─────────────────
type ViewMode = 'week' | 'day' | 'list';

interface GoogleEventLike {
  id: string;
  summary: string;
  date: string;
  startTime: string;
  endTime: string;
  isGoogleEvent: true;
  htmlLink?: string;
}

export default function Reservations() {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  // 대시보드 빠른 작업(?new=1) → 바로 추가 모달
  const [searchParams, setSearchParams] = useSearchParams();
  // 고객 상세 [예약 추가](?customer=) 프리필 — 1회 캡처 후 URL을 비워 수동 열기·뒤로가기에 다시 붙지 않게 (리뷰 2026-11-17)
  const [newCustomerId, setNewCustomerId] = useState<string | undefined>(undefined);
  const [newDate, setNewDate] = useState<string | undefined>(undefined); // 시술 기록 "다음 방문 권장" → 그 날짜로 예약 (2026-11-18)
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setNewCustomerId(searchParams.get('customer') ?? undefined);
    const d = searchParams.get('date');
    setNewDate(d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
    setShowAddModal(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  // 대시보드 오늘 예약 항목(?open=<id>) → 예약 상세 모달 바로 열기 (2026-11-17)
  useEffect(() => {
    const id = searchParams.get('open');
    if (!id) return;
    const target = ReservationStore.getAll().find(r => r.id === id);
    if (target) setSelectedReservation(target);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  const [editReservation, setEditReservation] = useState<Reservation | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>(() => ReservationStore.getAll());
  const [staffList] = useState<Staff[]>(() => StaffStore.getAll());
  const [googleEvents, setGoogleEvents] = useState<GoogleEventLike[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [staffFilter, setStaffFilter] = useState('all');
  const googleConnected = isGoogleCalendarConnected();
  const googleLoadErrorNotified = useRef(false); // Google 일정 로드 실패 알림은 1회만

  const reloadReservations = useCallback(() => {
    setReservations(ReservationStore.getAll());
  }, []);
  useDataRefreshed(() => { // 다른 기기가 잡은 예약이 재시작 없이 보이게 (16차 #H3) — 열어 둔 상세도 최신 객체로, 지워졌으면 닫는다 (리뷰 #M3)
    reloadReservations();
    setSelectedReservation(prev => (prev ? ReservationStore.getAll().find(x => x.id === prev.id) ?? null : null));
  });

  const [mobileTab, setMobileTab] = useState<'today' | 'week' | 'month'>('today');
  const [mobileMonthOffset, setMobileMonthOffset] = useState(0); // '이번달' 탭에서 ‹ › 로 다른 달 보기 (2026-11-18) — 다음 달 예약을 모바일에서도 찾을 수 있게

  // Google Calendar 이벤트 로드 — PC 주/일 범위와 모바일 목록 탭(오늘/이번주/이번달 ‹ ›) 범위의 합집합.
  // 모바일은 currentDate/viewMode를 바꾸지 않아 PC 주간만 받으면 월 탭에서 Google 일정이 빠진다 (리뷰 2026-11-18)
  const loadGoogleEvents = useCallback(async () => {
    if (!googleConnected) { setGoogleEvents([]); return; }
    try {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const pcStart = viewMode === 'day' ? new Date(currentDate) : weekStart;
      const pcEnd = viewMode === 'day' ? addDays(currentDate, 1) : addDays(weekStart, 7);
      const mDate = new Date(); mDate.setDate(1); mDate.setMonth(mDate.getMonth() + mobileMonthOffset);
      const mStart = mobileTab === 'today' ? new Date() : mobileTab === 'week' ? startOfWeek(new Date(), { weekStartsOn: 1 }) : startOfMonth(mDate);
      const mEnd = mobileTab === 'today' ? new Date() : mobileTab === 'week' ? endOfWeek(new Date(), { weekStartsOn: 1 }) : endOfMonth(mDate);
      const start = new Date(Math.min(pcStart.getTime(), mStart.getTime()));
      const end = new Date(Math.max(pcEnd.getTime(), mEnd.getTime()));
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      const { events, asReservationLike } = await fetchCalendarEventsAsReservations(start, end);
      setGoogleEvents(localizeGcalEventDates(events, asReservationLike)); // 새벽 일정이 전날에 붙던 UTC 날짜 보정 (12차 #H1)
    } catch {
      setGoogleEvents([]);
      // 조용히 비우면 "구글 일정이 왜 안 보이지"만 남는다 — 한 번만 알린다 (4차 UX 점검 2026-11-19)
      if (!googleLoadErrorNotified.current) { googleLoadErrorNotified.current = true; notify('Google 캘린더 일정을 불러오지 못했습니다. 설정 > 연동 설정에서 다시 연결해주세요.'); }
    }
  }, [googleConnected, currentDate, viewMode, mobileTab, mobileMonthOffset]);

  useEffect(() => { loadGoogleEvents(); }, [loadGoogleEvents]);
  // 모바일: 맨 위에서 당겨서 새로고침(이 기기 저장분 + Google 일정 다시 읽기)
  const pull = usePullToRefresh(async () => { await refreshFromServer({ force: true }); reloadReservations(); await loadGoogleEvents(); }); // 서버부터 다시 읽는다 — 캐시만 다시 읽던 "동작하는 척" 새로고침 (16차 #H3)
  // PC 키보드: ← → 주/일 이동, T 오늘, N 새 예약 — 입력 중이거나 모달이 열려 있으면 무시 (UI 품질 기준 2026-11-18)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (viewMode === 'list' && e.key !== 'n' && e.key !== 'N') return; // 목록 뷰엔 날짜 머리글이 없다 — 보이지 않는 주를 옮기지 않는다 (리뷰 67)
      if (e.key === 'ArrowLeft') { e.preventDefault(); navigate('prev'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); navigate('next'); }
      else if (e.key === 't' || e.key === 'T') { e.preventDefault(); setCurrentDate(new Date()); }
      else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setShowAddModal(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentDate, viewMode]);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const navigate = (dir: 'prev' | 'next') => {
    if (viewMode === 'week') {
      setCurrentDate(dir === 'prev' ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1));
    } else {
      setCurrentDate(dir === 'prev' ? subDays(currentDate, 1) : addDays(currentDate, 1));
    }
  };

  const handleSaveReservation = () => {
    reloadReservations();
    setShowAddModal(false);
  };
  // 예약 요청함 — 요청을 예약으로 등록하면 폼을 요청 내용으로 채우고, 저장되면 요청을 처리됨으로 (143, GAP R-6·R-10)
  const [showRequests, setShowRequests] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const refreshRequestCount = () => { void newRequests().then(l => setRequestCount(l.length)); }; // 어댑터는 비동기(서버 어댑터 대비) (144 리뷰 L-3)
  useEffect(() => { refreshRequestCount(); }, []);
  const [fromRequest, setFromRequest] = useState<{ req: BookingRequest; createdCustomerId?: string } | null>(null);
  const registerFromRequest = (req: BookingRequest) => {
    setShowRequests(false);
    const { customer, created } = ensureCustomerFor(req); // 전화번호가 같은 고객이면 그 고객, 없으면 신규 등록(접수 때 받은 동의 기록)
    setNewCustomerId(customer.id);
    setNewDate(req.date);
    setFromRequest({ req, createdCustomerId: created ? customer.id : undefined });
    setShowAddModal(true);
  };
  // 예약 없이 폼을 닫으면 이번에 새로 만든 고객은 되돌린다 — 요청은 처리 전으로 남는다 (144 리뷰 M-3)
  const cancelFromRequest = () => {
    if (fromRequest?.createdCustomerId) {
      CustomerStore.delete(fromRequest.createdCustomerId);
      notify.info('예약을 등록하지 않아 요청의 신규 고객 등록을 되돌렸습니다. 요청은 요청함에 그대로 있습니다.');
    }
    setFromRequest(null);
  };

  const handleUpdateReservation = () => {
    reloadReservations();
    setSelectedReservation(null);
  };

  const handleDeleteReservation = () => {
    reloadReservations();
    setSelectedReservation(null);
  };

  // 모바일 전용 상태
  // (mobileTab·mobileMonthOffset 선언은 위 Google 로드 앞으로 옮김)
  const mobileMonthDate = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + mobileMonthOffset); return d; })();

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const normalizedSearch = search.trim().toLowerCase();
  // 입력·필터·목록이 바뀔 때만 (8,000건을 매 렌더마다 훑지 않게, 성능 감사 2026-11-18)
  const filteredReservations = useMemo(() => reservations.filter(r => {
    const staffMatches = staffFilter === 'all' || r.staffId === staffFilter;
    const statusMatches = statusFilter === 'all' || r.status === statusFilter;
    const searchMatches = !normalizedSearch || [
      r.customerName,
      r.customerPhone,
      r.staffName,
      r.memo || '',
      ...r.services.map(service => service.serviceName),
    ].some(value => value.toLowerCase().includes(normalizedSearch));
    return staffMatches && statusMatches && searchMatches;
  }), [reservations, staffFilter, statusFilter, normalizedSearch]);
  // 주/일 뷰에는 그 기간 예약만 — 뷰 안에서 날짜 파싱(parseISO) 대신 문자열 비교
  const weekRange: readonly [string, string] = [format(weekDays[0], 'yyyy-MM-dd'), format(weekDays[6], 'yyyy-MM-dd')];
  const weekReservations = useMemo(() => filteredReservations.filter(r => r.date >= weekRange[0] && r.date <= weekRange[1]), [filteredReservations, weekRange[0], weekRange[1]]);
  const dayKey = format(currentDate, 'yyyy-MM-dd');
  const dayReservations = useMemo(() => filteredReservations.filter(r => r.date === dayKey), [filteredReservations, dayKey]);
  const mobileRange: readonly [string, string] = (() => {
    if (mobileTab === 'today') return [todayStr, todayStr];
    if (mobileTab === 'week') return [format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'), format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')];
    return [format(startOfMonth(mobileMonthDate), 'yyyy-MM-dd'), format(endOfMonth(mobileMonthDate), 'yyyy-MM-dd')];
  })();
  const mobileFilteredReservations = filteredReservations
    .filter(r => r.date >= mobileRange[0] && r.date <= mobileRange[1])
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  // Google 캘린더 일정 — PC 주/일/목록 뷰처럼 모바일 목록에도 같은 기간으로 (링크는 외부 브라우저)
  const mobileGoogleEvents = googleEvents
    .filter(ge => ge.date >= mobileRange[0] && ge.date <= mobileRange[1])
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));


  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="예약 관리"
        subtitle="예약 현황 및 일정 관리"
        action={{ label: '예약 추가', onClick: () => setShowAddModal(true) }}
        actions={(
          <button
            type="button"
            onClick={() => setShowRequests(true)}
            aria-label={requestCount > 0 ? `예약 요청함 ${requestCount}건` : '예약 요청함'}
            className={clsx('inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl border transition-colors', requestCount > 0 ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50')}
            title="전화·카톡·네이버로 받은 예약 요청을 적어 두고 확인 뒤 예약으로 등록"
          >
            예약 요청함{requestCount > 0 && <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-xs font-bold">{requestCount}</span>}
          </button>
        )}
      />

      {/* ── 모바일 뷰 (< lg) ── 일별 리스트 */}
      <PullToRefreshIndicator {...pull} />
      <div className="block lg:hidden flex-1 flex flex-col">
        {/* 탭 필터 — 모바일 상단 덩어리 바로 아래에 붙는다 (7차 UX 점검 2026-11-20) */}
        <div className="sticky top-mobile-header z-10 bg-white border-b border-gray-100 px-4 py-3 shadow-sm">
          <div className="flex gap-2">
            {(['today', 'week', 'month'] as const).map(tab => {
              const label = tab === 'today' ? '오늘' : tab === 'week' ? '이번주' : '이번달';
              return (
                <button
                  key={tab}
                  onClick={() => setMobileTab(tab)}
                  className={clsx(
                    'flex-1 py-2 rounded-xl text-sm font-medium transition-colors min-h-[44px]',
                    mobileTab === tab
                      ? 'bg-[#1a3a8f] text-white'
                      : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {mobileTab === 'month' && (
            <div className="flex items-center justify-between mt-2" data-testid="mobile-month-nav">
              <button type="button" onClick={() => setMobileMonthOffset(o => o - 1)} aria-label="이전 달" className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600"><ChevronLeft size={16} /></button>
              <button type="button" onClick={() => setMobileMonthOffset(0)} data-testid="mobile-month-label" className="text-sm font-semibold text-gray-800">{format(mobileMonthDate, 'yyyy년 M월')}{mobileMonthOffset !== 0 && <span className="ml-1 text-xs font-normal text-[#1a3a8f]">(이번달로)</span>}</button>
              <button type="button" onClick={() => setMobileMonthOffset(o => o + 1)} aria-label="다음 달" className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600"><ChevronRight size={16} /></button>
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <label className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="고객, 직원, 시술 검색"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none"
                aria-label="예약 검색"
              />
            </label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="border border-gray-200 rounded-xl px-2 text-xs bg-white outline-none"
              aria-label="예약 상태 필터"
            >
              <option value="all">전체 상태</option>
              <option value="pending">대기</option>
              <option value="confirmed">확정</option>
              <option value="completed">완료</option>
              <option value="cancelled">취소</option>
              <option value="noshow">노쇼</option>
            </select>
            <select
              value={staffFilter}
              onChange={e => setStaffFilter(e.target.value)}
              className="border border-gray-200 rounded-xl px-2 text-xs bg-white outline-none"
              aria-label="담당 직원 필터"
            >
              <option value="all">전체 직원</option>
              {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {mobileFilteredReservations.length === 0 && mobileGoogleEvents.length === 0 ? (
            <div className="py-16 text-center">
              <Calendar size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">
                {search.trim() || statusFilter !== 'all' || staffFilter !== 'all'
                  ? '조건에 맞는 예약이 없습니다'
                  : `${mobileTab === 'today' ? '오늘' : mobileTab === 'week' ? '이번 주' : format(mobileMonthDate, 'M월')} 예약이 없습니다`}
              </p>
              {search.trim() || statusFilter !== 'all' || staffFilter !== 'all'
                ? <button type="button" onClick={() => { setSearch(''); setStatusFilter('all'); setStaffFilter('all'); }} className="mt-3 px-4 py-2 bg-slate-100 text-gray-700 rounded-xl text-sm font-medium">필터 초기화</button>
                : <button type="button" onClick={() => { if (mobileTab === 'month' && mobileMonthOffset !== 0) setNewDate(format(mobileMonthDate, 'yyyy-MM-dd')); setShowAddModal(true); }} className="mt-3 px-4 py-2 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium">예약 추가하기</button>}
            </div>
          ) : (
            <>
            {mobileFilteredReservations.map(r => (
              <button
                key={r.id}
                type="button"
                data-testid="reservation-card"
                data-start={r.startTime}
                onClick={() => setSelectedReservation(r)}
                className="w-full bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-left min-h-[60px]"
              >
                <div className="flex items-start gap-3">
                  <div className="text-center w-14 flex-shrink-0 pt-0.5">
                    <p className="text-xs text-slate-500">{r.date.slice(5).replace('-', '/')}</p>
                    <p className="text-sm font-bold text-[#1a3a8f]">{r.startTime}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900">{r.customerName}</p>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {r.services.map(s => s.serviceName).join(', ')} · {r.staffName}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5 tabular-nums">{formatPrice(r.totalPrice)}</p>
                  </div>
                </div>
              </button>
            ))}
            {mobileGoogleEvents.map(ge => (
              <a
                key={`g-${ge.id}`}
                href={ge.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className={clsx('w-full bg-white rounded-xl border border-blue-100 shadow-sm p-4 text-left min-h-[60px] flex items-start gap-3', !ge.htmlLink && 'pointer-events-none')}
              >
                <div className="text-center w-14 flex-shrink-0 pt-0.5">
                  <p className="text-xs text-slate-500">{ge.date.slice(5).replace('-', '/')}</p>
                  <p className="text-sm font-bold text-blue-600">{ge.startTime}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900 truncate">{ge.summary}</p>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full"><Calendar size={10} /> Google</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{ge.startTime} ~ {ge.endTime}</p>
                </div>
              </a>
            ))}
            </>
          )}
        </div>
      </div>

      {/* ── 데스크톱 뷰 (lg+) ── 기존 캘린더 그대로 */}
      <div className="hidden lg:block p-8 flex-1">
        {/* Controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {viewMode !== 'list' && (<>
            <button type="button" onClick={() => navigate('prev')} aria-label="이전" className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
            <button onClick={() => setCurrentDate(new Date())} className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2">
              <Calendar size={14} /> 오늘
            </button>
            <button type="button" onClick={() => navigate('next')} aria-label="다음" className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
              <ChevronRight size={18} className="text-gray-600" />
            </button>
            <span className="hidden xl:inline ml-2 text-xs text-gray-400" title="키보드 단축키">← → 이동 · T 오늘 · N 새 예약</span>
            </>)}
            {/* 목록 뷰는 날짜와 무관한 전체 목록 — 날짜 머리글·‹ ›·오늘을 보여 주면 "오늘 목록"으로 오해한다 (4차 UX 점검 2026-11-19) */}
            <h3 className="text-base font-bold text-gray-900">
              {viewMode === 'list'
                ? `전체 예약 ${filteredReservations.length}건 · 날짜순`
                : viewMode === 'week'
                  ? `${format(weekStart, 'yyyy년 M월', { locale: ko })} ${format(weekStart, 'd')}일 ~ ${format(addDays(weekStart, 6), 'd')}일`
                  : format(currentDate, 'yyyy년 M월 d일 (EEEE)', { locale: ko })
              }
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Google Calendar sync badge */}
            {googleConnected && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-xs font-medium text-blue-700">
                <Calendar size={12} />
                Google 캘린더 연동
              </div>
            )}
            {/* Naver sync badge — 실제 연동 전까지 '준비 중' 표기 (오해 방지) */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-400" title="네이버 예약 연동은 준비 중입니다">
              <span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span>
              네이버 예약 (준비 중)
            </div>
            <div className="flex bg-gray-100 rounded-xl p-1">
              {(['week', 'day', 'list'] as ViewMode[]).map(m => {
                const labels = { week: '주간', day: '일간', list: '목록' };
                const icons = { week: <LayoutGrid size={14} />, day: <Clock size={14} />, list: <List size={14} /> };
                return (
                  <button
                    key={m}
                    onClick={() => setViewMode(m)}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                      viewMode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                    )}
                  >
                    {icons[m]} {labels[m]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-3 mb-4 flex gap-3 items-center">
          <label className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="고객명, 전화번호, 담당 직원, 시술 검색"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none"
              aria-label="예약 검색"
            />
          </label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none"
            aria-label="예약 상태 필터"
          >
            <option value="all">전체 상태</option>
            <option value="pending">대기</option>
            <option value="confirmed">확정</option>
            <option value="completed">완료</option>
            <option value="cancelled">취소</option>
            <option value="noshow">노쇼</option>
          </select>
          <select
            value={staffFilter}
            onChange={e => setStaffFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none"
            aria-label="담당 직원 필터"
          >
            <option value="all">전체 직원</option>
            {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <span className="text-xs text-gray-400 whitespace-nowrap">{filteredReservations.length}건</span>
        </div>

        {/* 직원별 예약현황 요약 — 현재 필터(상태·검색) 기준, 직원 클릭 시 해당 직원만 보기 */}
        <div className="flex flex-wrap gap-2 mb-4">
          {staffList.map(s => {
            const periodDates = viewMode === 'week'
              ? weekDays.map(d => format(d, 'yyyy-MM-dd'))
              : viewMode === 'day' ? [format(currentDate, 'yyyy-MM-dd')] : null;
            const count = reservations.filter(r => {
              if (r.staffId !== s.id) return false;
              if (statusFilter !== 'all' && r.status !== statusFilter) return false;
              if (periodDates && !periodDates.includes(r.date)) return false;
              // 검색어도 오른쪽 "N건"과 같은 기준으로 (4차 UX 점검 2026-11-19)
              if (normalizedSearch && ![r.customerName, r.customerPhone, r.staffName, r.memo || '', ...r.services.map(sv => sv.serviceName)].some(v => v.toLowerCase().includes(normalizedSearch))) return false;
              return true;
            }).length;
            const active = staffFilter === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setStaffFilter(active ? 'all' : s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  active ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name} {count}건{periodDates ? '' : ' (전체 기간)'}
              </button>
            );
          })}
        </div>

        {/* Calendar Views */}
        {viewMode === 'week' && (
          <WeekView weekDays={weekDays} reservations={weekReservations} staffList={staffList} onSelect={setSelectedReservation} googleEvents={googleEvents} />
        )}
        {viewMode === 'day' && (
          <DayView date={currentDate} reservations={dayReservations} staffList={staffList} onSelect={setSelectedReservation} googleEvents={googleEvents} />
        )}
        {viewMode === 'list' && (
          <ListView reservations={filteredReservations} onSelect={setSelectedReservation} googleEvents={googleEvents} filterKey={`${staffFilter}|${statusFilter}|${normalizedSearch}`} />
        )}
      </div>

      {showAddModal && (
        <AddReservationModal
          initialCustomerId={newCustomerId}
          initialDate={newDate}
          initialStartTime={fromRequest?.req.startTime}
          initialServiceId={fromRequest?.req.serviceId}
          initialMemo={fromRequest?.req.memo}
          initialSource={fromRequest ? CHANNEL_SOURCE[fromRequest.req.channel] : undefined}
          onClose={() => { setShowAddModal(false); setNewCustomerId(undefined); setNewDate(undefined); cancelFromRequest(); }}
          onSave={() => { setNewCustomerId(undefined); setNewDate(undefined); handleSaveReservation(); }}
          onSaved={id => { if (fromRequest) { const reqId = fromRequest.req.id; setFromRequest(null); void acceptRequest(reqId, id).then(refreshRequestCount, () => notify.error('예약은 저장했지만 요청을 처리됨으로 바꾸지 못했습니다. 요청함에서 다시 확인해주세요.')); } }}
        />
      )}
      {showRequests && (
        <BookingRequestsModal onClose={() => { setShowRequests(false); refreshRequestCount(); }} onRegister={registerFromRequest} />
      )}
      {editReservation && (
        <AddReservationModal
          reservation={editReservation}
          onClose={() => setEditReservation(null)}
          onSave={() => { reloadReservations(); setEditReservation(null); }}
        />
      )}
      {selectedReservation && (
        <ReservationDetailModal
          reservation={selectedReservation}
          onClose={() => setSelectedReservation(null)}
          onUpdate={handleUpdateReservation}
          onDelete={handleDeleteReservation}
          onEdit={() => { setEditReservation(selectedReservation); setSelectedReservation(null); }}
        />
      )}
    </div>
  );
}

function WeekView({ weekDays, reservations, staffList, onSelect, googleEvents = [] }: {
  weekDays: Date[];
  reservations: Reservation[];
  staffList: Staff[];
  onSelect: (r: Reservation) => void;
  googleEvents?: GoogleEventLike[];
}) {
  const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
  const today = new Date();
  const ROW_H = 56; // h-14 — 슬롯 1시간의 픽셀 높이 (블록 높이 계산 기준)
  const gridRange = useMemo(() => gridRangeFromSettings(), []);
  const timeSlots = hourSlots(gridRange);

  // 요일별로 예약+Google 이벤트를 시간 비례 배치 (겹침 레인 포함)
  const dayLayouts = weekDays.map(day => {
    const dayKey = format(day, 'yyyy-MM-dd');
    return layoutDayEvents<
      { kind: 'reservation'; r: Reservation } | { kind: 'google'; ge: GoogleEventLike }
    >([
      ...reservations
        .filter(r => r.date === dayKey)
        .map(r => ({ item: { kind: 'reservation' as const, r }, startMin: timeToMin(r.startTime), endMin: timeToMin(r.endTime) })),
      ...googleEvents
        .filter(ge => ge.date === dayKey)
        .map(ge => ({ item: { kind: 'google' as const, ge }, startMin: timeToMin(ge.startTime), endMin: timeToMin(ge.endTime) })),
    ], gridRange);
  });

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-8 border-b border-gray-100">
        <div className="py-3 px-3 text-xs text-gray-400 text-center border-r border-gray-100">시간</div>
        {weekDays.map((day, i) => {
          const isToday = isSameDay(day, today);
          const dayKey = format(day, 'yyyy-MM-dd');
          const dayReservations = reservations.filter(r => r.date === dayKey);
          return (
            <div key={i} className={clsx('py-3 px-2 text-center border-r border-gray-100 last:border-r-0', isToday && 'bg-primary-50')}>
              <p className={clsx('text-xs font-medium', i === 5 ? 'text-primary-600' : i === 6 ? 'text-red-600' : 'text-gray-500')}>
                {dayNames[i]}
              </p>
              <p className={clsx('text-sm font-bold mt-0.5', isToday ? 'text-primary-700' : 'text-gray-800')}>
                {format(day, 'd')}
              </p>
              {dayReservations.length > 0 && (
                <span className="text-xs text-primary-600 font-medium">{dayReservations.length}건</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Time Grid — 예약 블록은 관리시간(1시간=1칸, 2시간=2칸)에 비례한 높이로 표시 */}
      {/* 스크롤 영역 키보드 접근(axe scrollable-region-focusable) — 부모 overflow-hidden이 바깥 outline을 잘라 inset ring으로 표시 */}
      <div className="overflow-y-auto max-h-[550px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600" role="region" aria-label="시간표" tabIndex={0}>
        {timeSlots.map(time => {
          const slotStartMin = timeToMin(time);
          return (
            <div key={time} className="grid grid-cols-8 border-b border-gray-50 h-14">
              <div className="py-2 px-3 text-xs text-gray-400 text-right border-r border-gray-100 pt-2 sticky left-0 bg-white">
                {time}
              </div>
              {weekDays.map((day, di) => {
                const isToday = isSameDay(day, today);
                // 이 슬롯 시간대에 "시작"하는 이벤트만 여기서 그림 (블록이 아래 슬롯까지 이어짐)
                const slotEvents = dayLayouts[di].filter(ev =>
                  ev.startMin >= slotStartMin && ev.startMin < slotStartMin + 60
                );
                return (
                  <div key={di} className={clsx(
                    'border-r border-gray-50 last:border-r-0 relative',
                    isToday && 'bg-primary-50/40'
                  )}>
                    {slotEvents.map(ev => {
                      if (ev.item.kind === 'reservation') {
                        const r = ev.item.r;
                        const staff = staffList.find(s => s.id === r.staffId);
                        const tall = ev.endMin - ev.startMin >= 90;
                        const short = ev.endMin - ev.startMin < 60; // 30분 블록: 한 줄만 (4차 UX 점검 2026-11-19)
                        return (
                          <button
                            key={r.id}
                            type="button"
                            data-testid="reservation-block"
                            data-start={r.startTime}
                            onClick={() => onSelect(r)}
                            className="absolute z-10 text-left rounded-lg p-1.5 text-xs font-medium transition-opacity hover:opacity-80 shadow-sm overflow-hidden"
                            style={{ backgroundColor: staff?.color || '#8B5CF6', color: readableTextOn(staff?.color || '#8B5CF6'), ...eventBlockStyle(ev, slotStartMin, ROW_H) }}
                            title={`${r.customerName} · ${r.startTime}~${r.endTime}`}
                          >
                            {short ? (
                              <p className="font-bold truncate">{r.customerName} <span className="font-normal">· {r.services[0]?.serviceName}</span></p>
                            ) : (<>
                              <p className="font-bold truncate">{r.customerName}</p>
                              <p className="font-normal truncate">{r.services[0]?.serviceName}</p>
                            </>)}
                            {tall && <p className="font-normal truncate">{r.startTime}~{r.endTime}</p>}
                          </button>
                        );
                      }
                      const ge = ev.item.ge;
                      return (
                        <a
                          key={`g-${ge.id}`}
                          href={ge.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={clsx(
                            'absolute z-10 text-left rounded-lg p-1.5 text-xs font-medium text-white bg-blue-500 transition-opacity hover:opacity-80 shadow-sm overflow-hidden block',
                            !ge.htmlLink && 'pointer-events-none', // 링크 없으면 클릭 무반응 앵커 방지
                          )}
                          style={eventBlockStyle(ev, slotStartMin, ROW_H)}
                          title={`${ge.summary} · ${ge.startTime}~${ge.endTime}`}
                        >
                          <p className="font-bold truncate flex items-center gap-0.5">
                            <Calendar size={9} className="flex-shrink-0" />
                            {ge.summary}
                          </p>
                        </a>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 일간 — 직원별 열 (141, GAP R-2·R-4): 열마다 그 직원의 예약만, 근무표의 근무 밖(회색)·휴게(노랑)는 음영. 재직 직원 + 그날 예약이 있는 퇴사 직원 */
function StaffColumnsDay({ date, dayReservations, dayGoogleEvents, staffList, gridRange, timeSlots, onSelect }: {
  date: Date; dayReservations: Reservation[]; dayGoogleEvents: GoogleEventLike[]; staffList: Staff[];
  gridRange: { startMin: number; endMin: number }; timeSlots: string[]; onSelect: (r: Reservation) => void;
}) {
  const ROW_H = 60;
  const dayKey = dayKeyOf(date);
  const shopHours = SettingsStore.get().businessHours?.[dayKey];
  const assignments = resourceAssignments();
  const resourceNames = new Map(allResources().map(x => [x.id, x.name] as const)); // 미사용으로 바꾼 자원도 과거 배정은 이름으로 (142)
  const columns = staffList
    .filter(s => s.isActive || dayReservations.some(r => r.staffId === s.id))
    .map(s => {
      const win = dayWindow(getStaffSchedule(s.id), dayKey, shopHours);
      return {
        staff: s,
        label: describeWindow(win),
        shade: [
          ...offRanges(win, gridRange).map(iv => ({ ...iv, kind: 'off' as const })),
          ...win.breaks.map(iv => ({ startMin: Math.max(iv.startMin, gridRange.startMin), endMin: Math.min(iv.endMin, gridRange.endMin), kind: 'break' as const })).filter(iv => iv.endMin > iv.startMin),
        ],
        events: layoutDayEvents<Reservation>(dayReservations.filter(r => r.staffId === s.id).map(r => ({ item: r, startMin: timeToMin(r.startTime), endMin: timeToMin(r.endTime) })), gridRange),
      };
    });
  const googleLayout = layoutDayEvents<GoogleEventLike>(dayGoogleEvents.map(ge => ({ item: ge, startMin: timeToMin(ge.startTime), endMin: timeToMin(ge.endTime) })), gridRange);
  const hasGoogle = dayGoogleEvents.length > 0;
  const gridStyle: CSSProperties = { gridTemplateColumns: `5rem repeat(${Math.max(columns.length + (hasGoogle ? 1 : 0), 1)}, minmax(9rem, 1fr))` };
  const shadeIn = (shade: { startMin: number; endMin: number; kind: 'off' | 'break' }[], slotStartMin: number) => shade
    .filter(iv => iv.startMin < slotStartMin + 60 && iv.endMin > slotStartMin)
    .map(iv => {
      const top = Math.max(iv.startMin, slotStartMin), bottom = Math.min(iv.endMin, slotStartMin + 60);
      return <div key={`${iv.kind}-${top}`} aria-hidden className={clsx('absolute inset-x-0 pointer-events-none', iv.kind === 'off' ? 'bg-gray-100' : 'bg-amber-50')} style={{ top: `${((top - slotStartMin) / 60) * ROW_H}px`, height: `${((bottom - top) / 60) * ROW_H}px` }} />;
    });
  return (
    <div className="overflow-auto max-h-[600px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600" role="region" aria-label="직원별 시간표" tabIndex={0} data-testid="staff-columns">
      <div className="grid border-b border-gray-100 min-w-max sticky top-0 bg-white z-20" style={gridStyle}>
        <div className="py-2 px-3 text-xs text-gray-400 border-r border-gray-100">시간</div>
        {columns.map(c => (
          <div key={c.staff.id} data-testid="staff-column" className="py-2 px-3 border-r border-gray-100 last:border-r-0">
            <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.staff.color }} />{c.staff.name}</p>
            <p className="text-2xs text-gray-500">{c.label}</p>
          </div>
        ))}
        {hasGoogle && <div className="py-2 px-3"><p className="text-sm font-bold text-blue-700">Google</p><p className="text-2xs text-gray-500">{dayGoogleEvents.length}건</p></div>}
      </div>
      {columns.length === 0 && <p className="p-6 text-sm text-gray-500 text-center">재직 중인 직원이 없습니다. 직원 관리에서 직원을 추가하세요.</p>}
      {timeSlots.map(time => {
        const slotStartMin = timeToMin(time);
        return (
          <div key={time} className="grid border-b border-gray-50 h-[60px] min-w-max" style={gridStyle}>
            <div className="py-3 px-4 text-xs text-gray-400 border-r border-gray-100 font-medium sticky left-0 bg-white">{time}</div>
            {columns.map(c => (
              <div key={c.staff.id} className="relative border-r border-gray-100 last:border-r-0">
                {shadeIn(c.shade, slotStartMin)}
                {c.events.filter(ev => ev.startMin >= slotStartMin && ev.startMin < slotStartMin + 60).map(ev => {
                  const r = ev.item;
                  const tall = ev.endMin - ev.startMin >= 90;
                  const resName = resourceNames.get(assignments[r.id] ?? '');
                  return (
                    <button
                      key={r.id}
                      type="button"
                      data-testid="reservation-block"
                      data-start={r.startTime}
                      onClick={() => onSelect(r)}
                      className="absolute z-10 text-left rounded-xl px-2.5 py-1.5 text-sm font-medium transition-opacity hover:opacity-80 shadow-sm overflow-hidden"
                      style={{ backgroundColor: c.staff.color, color: readableTextOn(c.staff.color), ...eventBlockStyle(ev, slotStartMin, ROW_H) }}
                      title={`${r.customerName} · ${r.startTime}~${r.endTime}`}
                    >
                      <p className="truncate"><span className="font-bold">{r.customerName}</span><span className="text-xs ml-2 font-normal">{r.services.map(sv => sv.serviceName).join(', ')}</span>{resName && <span className="text-xs ml-2 font-normal">· {resName}</span>}</p>
                      {tall && <p className="text-xs mt-0.5 font-normal">{r.startTime}~{r.endTime}</p>}
                    </button>
                  );
                })}
              </div>
            ))}
            {hasGoogle && (
              <div className="relative">
                {googleLayout.filter(ev => ev.startMin >= slotStartMin && ev.startMin < slotStartMin + 60).map(ev => {
                  const ge = ev.item;
                  return (
                    <a
                      key={`g-${ge.id}`}
                      href={ge.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={clsx('absolute z-10 text-left rounded-xl px-2.5 py-1.5 text-sm font-medium text-white bg-blue-600 transition-opacity hover:opacity-80 shadow-sm overflow-hidden block', !ge.htmlLink && 'pointer-events-none')}
                      style={eventBlockStyle(ev, slotStartMin, ROW_H)}
                      title={`${ge.summary} · ${ge.startTime}~${ge.endTime}`}
                    >
                      <p className="truncate"><span className="font-bold">{ge.summary}</span><span className="text-xs ml-2 font-normal">{ge.startTime}~{ge.endTime}</span></p>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DayView({ date, reservations, staffList, onSelect, googleEvents = [] }: {
  date: Date;
  reservations: Reservation[];
  staffList: Staff[];
  onSelect: (r: Reservation) => void;
  googleEvents?: GoogleEventLike[];
}) {
  const dateKey = format(date, 'yyyy-MM-dd');
  const dayReservations = reservations.filter(r => r.date === dateKey);
  const dayGoogleEvents = googleEvents.filter(ge => ge.date === dateKey);
  const ROW_H = 60; // h-[60px] — 슬롯 1시간의 픽셀 높이
  const gridRange = useMemo(() => gridRangeFromSettings(), []);
  const timeSlots = hourSlots(gridRange);
  // 직원별 열 — 이 PC 의 보기 선택(기기 편의, 지점 데이터 아님) (141, GAP R-2)
  const [byStaff, setByStaff] = useState(() => { try { return localStorage.getItem('crm_ui_day_by_staff') === '1'; } catch { return false; } });
  const toggleByStaff = () => setByStaff(v => { const next = !v; try { localStorage.setItem('crm_ui_day_by_staff', next ? '1' : '0'); } catch { /* 저장 못 해도 이번 화면은 바뀐다 */ } return next; });

  // 시간 비례 배치 (겹침 레인 포함) — 주간 뷰와 동일한 방식
  const dayLayout = layoutDayEvents<
    { kind: 'reservation'; r: Reservation } | { kind: 'google'; ge: GoogleEventLike }
  >([
    ...dayReservations.map(r => ({ item: { kind: 'reservation' as const, r }, startMin: timeToMin(r.startTime), endMin: timeToMin(r.endTime) })),
    ...dayGoogleEvents.map(ge => ({ item: { kind: 'google' as const, ge }, startMin: timeToMin(ge.startTime), endMin: timeToMin(ge.endTime) })),
  ], gridRange);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-bold text-gray-800">
          {dayReservations.length}건의 예약
          {dayGoogleEvents.length > 0 && <span className="text-primary-600 ml-2">+ Google {dayGoogleEvents.length}건</span>}
        </p>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {!byStaff && staffList.map(s => (
            <div key={s.id} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }}></span>
              {s.name}
            </div>
          ))}
          <button
            type="button"
            aria-pressed={byStaff}
            onClick={toggleByStaff}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors', byStaff ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50')}
            title="직원마다 한 열씩 — 근무표의 근무 밖·휴게는 음영"
          >
            직원별 열
          </button>
        </div>
      </div>
      {byStaff ? (
        <StaffColumnsDay date={date} dayReservations={dayReservations} dayGoogleEvents={dayGoogleEvents} staffList={staffList} gridRange={gridRange} timeSlots={timeSlots} onSelect={onSelect} />
      ) : (
      <div className="overflow-y-auto max-h-[600px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600" role="region" aria-label="시간표" tabIndex={0}>{/* 예약 블록은 관리시간에 비례한 높이로 표시 (1시간=1칸, 2시간=2칸) */}
        {timeSlots.map(time => {
          const slotStartMin = timeToMin(time);
          const slotEvents = dayLayout.filter(ev =>
            ev.startMin >= slotStartMin && ev.startMin < slotStartMin + 60
          );
          return (
            <div key={time} className="flex border-b border-gray-50 h-[60px]">
              <div className="w-20 flex-shrink-0 py-3 px-4 text-xs text-gray-400 border-r border-gray-100 font-medium">
                {time}
              </div>
              <div className="flex-1 relative">
                {slotEvents.map(ev => {
                  if (ev.item.kind === 'reservation') {
                    const r = ev.item.r;
                    const staff = staffList.find(s => s.id === r.staffId);
                    const tall = ev.endMin - ev.startMin >= 90;
                    return (
                      <button
                        key={r.id}
                        onClick={() => onSelect(r)}
                        className="absolute z-10 text-left rounded-xl px-3 py-2 text-sm font-medium transition-opacity hover:opacity-80 shadow-sm overflow-hidden"
                        style={{ backgroundColor: staff?.color || '#8B5CF6', color: readableTextOn(staff?.color || '#8B5CF6'), ...eventBlockStyle(ev, slotStartMin, ROW_H) }}
                        title={`${r.customerName} · ${r.startTime}~${r.endTime}`}
                      >
                        <p className="truncate">
                          <span className="font-bold">{r.customerName}</span>
                          <span className="text-xs ml-2 font-normal">{r.services.map(s => s.serviceName).join(', ')}</span>
                          <span className="text-xs ml-2 font-normal">{r.staffName}</span>
                        </p>
                        {tall && <p className="text-xs mt-0.5 font-normal">{r.startTime}~{r.endTime}</p>}
                      </button>
                    );
                  }
                  const ge = ev.item.ge;
                  return (
                    <a
                      key={`g-${ge.id}`}
                      href={ge.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={clsx(
                        'absolute z-10 text-left rounded-xl px-3 py-2 text-sm font-medium text-white bg-blue-600 transition-opacity hover:opacity-80 shadow-sm overflow-hidden block',
                        !ge.htmlLink && 'pointer-events-none', // 링크 없으면 클릭 무반응 앵커 방지
                      )}
                      style={eventBlockStyle(ev, slotStartMin, ROW_H)}
                      title={`${ge.summary} · ${ge.startTime}~${ge.endTime}`}
                    >
                      <p className="truncate flex items-center gap-2">
                        <Calendar size={14} className="flex-shrink-0" />
                        <span className="font-bold">{ge.summary}</span>
                        <span className="text-xs font-normal">{ge.startTime}~{ge.endTime}</span>
                      </p>
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

function ListView({ reservations, onSelect, googleEvents = [], filterKey }: { reservations: Reservation[]; onSelect: (r: Reservation) => void; googleEvents?: GoogleEventLike[]; filterKey: string }) {
  const sorted = useMemo(() => [...reservations].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)), [reservations]);
  // 목록은 200건씩 — 전체 예약(수천 건)을 한 번에 마운트하지 않는다 (성능 감사 2026-11-18)
  const [limit, setLimit] = useState(200);
  useEffect(() => { setLimit(200); }, [filterKey]); // 필터·검색이 바뀔 때만 처음부터 — 예약 수정으로 목록이 새로 와도 펼친 상태 유지

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="divide-y divide-gray-50">
        {sorted.slice(0, limit).map(r => (
          <button
            key={r.id}
            onClick={() => onSelect(r)}
            className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors text-left"
          >
            <div className="text-center w-20 flex-shrink-0">
              <p className="text-xs font-medium text-gray-500">{r.date.slice(5).replace('-', '/')}</p>
              <p className="text-sm font-bold text-primary-700 mt-0.5">{r.startTime}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">{(r.customerName || '?')[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-gray-900">{r.customerName}</p>
                <SourceBadge source={r.source} />
                <StatusBadge status={r.status} />
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{r.services.map(s => s.serviceName).join(', ')} · {r.staffName}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold text-gray-800">{formatPrice(r.totalPrice)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{r.startTime} ~ {r.endTime}</p>
            </div>
            <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
          </button>
        ))}
        {sorted.length > limit && (
          <button type="button" onClick={() => setLimit(n => n + 200)} className="w-full py-3 text-sm font-medium text-[#1a3a8f] hover:bg-gray-50 min-h-[44px]">
            더 보기 ({sorted.length - limit}건 남음)
          </button>
        )}
        {/* Google Calendar 이벤트 */}
        {googleEvents.map(ge => (
          <a
            key={`g-${ge.id}`}
            href={ge.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className={clsx(
              'w-full flex items-center gap-4 px-6 py-4 hover:bg-blue-50/50 transition-colors text-left',
              !ge.htmlLink && 'pointer-events-none', // 링크 없으면 클릭 무반응 앵커 방지
            )}
          >
            <div className="text-center w-20 flex-shrink-0">
              <p className="text-xs font-medium text-gray-500">{ge.date.slice(5).replace('-', '/')}</p>
              <p className="text-sm font-bold text-blue-600 mt-0.5">{ge.startTime}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
              <Calendar size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-gray-900">{ge.summary}</p>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                  <Calendar size={10} /> Google
                </span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-400">{ge.startTime} ~ {ge.endTime}</p>
            </div>
            <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
          </a>
        ))}
      </div>
    </div>
  );
}

function AddReservationModal({ reservation: editing, initialCustomerId, initialDate, initialStartTime, initialServiceId, initialMemo, initialSource, onClose, onSave, onSaved }: {
  reservation?: Reservation | null; initialCustomerId?: string; initialDate?: string;
  /** 예약 요청함에서 넘어온 프리필 (143) */
  initialStartTime?: string; initialServiceId?: string; initialMemo?: string; initialSource?: Reservation['source'];
  onClose: () => void; onSave: () => void;
  /** 신규 저장 뒤 예약 id (요청 처리용) */
  onSaved?: (id: string) => void;
}) {
  const { user: authUser } = useAuth();
  const goTo = useNavigate();
  const isEdit = !!editing;
  // 익명화 고객·퇴사 직원·비활성 시술은 새 예약 선택지에서 빼되, 수정 중인 예약에 이미 걸린 것은 남긴다 — 아니면 메모만 고쳐도 조용히 저장이 안 됐다 (정합성 감사 2026-11-19)
  const customers = CustomerStore.getAll().filter(c => c.isActive !== false || c.id === editing?.customerId);
  const staffList = StaffStore.getAll().filter(s => s.isActive || s.id === editing?.staffId);
  const editingServiceId = editing?.services?.[0]?.serviceId;
  const services = ServiceStore.getAll().filter(s => s.isActive || s.id === editingServiceId);

  // 고객 상세 [예약 추가](?customer=)에서 왔으면 그 고객을 미리 선택 (2026-11-17)
  const [customerId, setCustomerId] = useState(editing?.customerId ?? (initialCustomerId && customers.some(c => c.id === initialCustomerId) ? initialCustomerId : ''));
  // 입력 속도: 직원이 한 명이면 그 직원, 아니면 로그인한 직원 본인; 시술이 하나면 그 시술; 오늘이면 지금 이후 첫 시간대 (입력 속도 감사 2026-11-18)
  const [staffId, setStaffId] = useState(editing?.staffId ?? (staffList.length === 1 ? staffList[0].id : (staffList.find(s => s.name === authUser?.name)?.id ?? '')));
  // 베드·룸 자원 — 신규는 자동 배정, 수정은 이미 붙은 자원(없으면 배정 안 함) (142, GAP R-5)
  const resources = useMemo(() => {
    const act = activeResources();
    const cur = editing ? resourceOf(editing.id) : null;
    return cur && !cur.isActive ? [...act, cur] : act; // 미사용으로 바꾼 자원에 붙은 예약을 수정해도 배정이 조용히 지워지지 않게 (144 리뷰 M-1)
  }, []);
  const [resourceChoice, setResourceChoice] = useState<string>(() => (editing ? (resourceOf(editing.id)?.id ?? 'none') : 'auto'));
  const [serviceId, setServiceId] = useState(editing?.services?.[0]?.serviceId ?? (initialServiceId && services.some(s => s.id === initialServiceId) ? initialServiceId : (services.length === 1 ? services[0].id : '')));
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const [date, setDate] = useState(editing?.date ?? initialDate ?? todayKey);
  const startOptions = useMemo(() => { // 설정 > 영업시간 범위, 30분 단위 (4차 UX 점검 2026-11-19). 직원 근무가 그 밖(심야 등)이면 그만큼 넓힌다 (144 리뷰 L-6)
    const range = gridRangeFromSettings();
    if (staffId && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const dayLabel = dayKeyOf(new Date(`${date}T00:00:00`));
      const win = dayWindow(getStaffSchedule(staffId), dayLabel, SettingsStore.get().businessHours?.[dayLabel]);
      if (!win.fromShopHours && win.work) {
        range.startMin = Math.min(range.startMin, Math.floor(win.work.startMin / 60) * 60);
        range.endMin = Math.max(range.endMin, Math.min(24 * 60, Math.ceil(win.work.endMin / 60) * 60));
      }
    }
    return halfHourSlots(range);
  }, [staffId, date]);
  const [startTime, setStartTime] = useState(editing?.startTime ?? initialStartTime ?? ((initialDate ?? todayKey) === todayKey ? nextTimeSlot(startOptions) : (startOptions.includes('10:00') ? '10:00' : startOptions[0])));
  // 선택한 담당자·날짜의 시작 칸 표시 — 예약 있음 > 휴게 > 근무 외(근무표가 있을 때만). 고르기 전에 보이게 (140·141, GAP R-3·R-4)
  const startMarks = useMemo(() => {
    const marks = new Map<string, string>();
    if (!staffId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return marks;
    const items = ReservationStore.getAll().filter(r => r.id !== editing?.id && r.staffId === staffId && r.date === date && r.status !== 'cancelled' && r.status !== 'noshow');
    const ivs = items.map(r => toInterval(r.startTime, r.endTime)).filter((v): v is NonNullable<typeof v> => v !== null);
    const dayLabel = dayKeyOf(new Date(`${date}T00:00:00`));
    const win = dayWindow(getStaffSchedule(staffId), dayLabel, SettingsStore.get().businessHours?.[dayLabel]);
    for (const t of startOptions) {
      const m = toMinOf(t); if (m === null) continue;
      if (ivs.some(iv => m >= iv.startMin && m < iv.endMin)) marks.set(t, '예약 있음');
      else if (win.breaks.some(b => m >= b.startMin && m < b.endMin)) marks.set(t, '휴게');
      else if (!win.fromShopHours && (!win.work || m < win.work.startMin || m >= win.work.endMin)) marks.set(t, '근무 외');
    }
    return marks;
  }, [staffId, date, startOptions, editing?.id]);
  const [source, setSource] = useState<Reservation['source']>(editing?.source ?? initialSource ?? 'manual');
  const [memo, setMemo] = useState(editing?.memo ?? initialMemo ?? '');
  const [addToGoogle, setAddToGoogle] = useState(!isEdit && isGoogleCalendarConnected());
  const googleAvailable = isGoogleCalendarConnected();
  const [formError, setFormError] = useState('');

  const handleSave = () => {
    if (!isISODate(date)) { setFormError('예약 날짜를 선택해주세요.'); return; } // 빈 날짜 예약은 달력·목록·겹침 검사 어디에도 안 잡히는 유령이 됐다 (14차 #H4)
    // 조용한 실패 금지 — 무엇이 비었는지 명확히 안내
    if (!customerId || !staffId || !serviceId) {
      const missing = [
        !customerId && '고객',
        !staffId && '담당 직원',
        !serviceId && '시술',
      ].filter(Boolean).join(', ');
      const guide = [
        customers.length === 0 && !customerId ? '등록된 고객이 없습니다 — 고객 관리에서 먼저 등록해주세요.' : '',
        staffList.length === 0 && !staffId ? '등록된 직원이 없습니다 — 직원 관리에서 먼저 등록해주세요.' : '',
        services.length === 0 && !serviceId ? '등록된 시술이 없습니다 — 설정 > 시술 관리에서 먼저 등록해주세요.' : '',
      ].filter(Boolean).join(' ');
      setFormError(`${josa(missing, '을/를')} 선택해주세요. ${guide}`.trim());
      return;
    }
    setFormError('');

    const customer = customers.find(c => c.id === customerId);
    const staff = staffList.find(s => s.id === staffId);
    const service = services.find(s => s.id === serviceId);
    if (!customer || !staff || !service) { setFormError('선택한 고객·담당자·시술 중 더 이상 쓸 수 없는 항목이 있습니다. 다시 선택해주세요.'); return; }

    // 다중 시술 예약 보호 — 편집 폼은 services[0]만 로드하므로 그대로 저장하면
    // 나머지 시술·금액이 소실됨. 시술을 안 바꿨으면 원본 전체 보존, 바꿨으면 확인 후 교체.
    let servicesPayload = [{
      serviceId: service.id,
      serviceName: service.name,
      price: service.price,
      duration: service.duration,
    }];
    let totalPrice = service.price;
    if (isEdit && editing && (editing.services?.length ?? 0) > 1) {
      if (editing.services[0]?.serviceId === service.id) {
        servicesPayload = editing.services;
        totalPrice = editing.totalPrice;
      } else {
        const proceed = window.confirm(
          `이 예약에는 시술이 ${editing.services.length}개 연결되어 있습니다. 선택한 시술 1개로 교체할까요?`
        );
        if (!proceed) return;
      }
    }

    // Calculate endTime from total service duration
    const totalDuration = servicesPayload.reduce((s, sv) => s + sv.duration, 0);
    const [h, m] = startTime.split(':').map(Number);
    const startDate = new Date(2000, 0, 1, h, m);
    const endDate = addMinutes(startDate, totalDuration);
    const endTime = format(endDate, 'HH:mm');

    // 이중예약 방지 — 같은 담당자·같은 날 시간대 겹침(취소/노쇼·본인 제외). 규칙은 순수 schedulingRule(반개구간·자정 넘김·깨진 시간은 겹침) (12차 #H2, 14차 #M7, 140)
    const sameStaffDay = ReservationStore.getAll().filter(r => r.id !== editing?.id && r.staffId === staff.id && r.date === date && r.status !== 'cancelled' && r.status !== 'noshow');
    const newStart = toMinOf(startTime) ?? 0;
    const newEnd = newStart + totalDuration;
    const overlap = findConflicts({ startMin: newStart, endMin: newEnd }, sameStaffDay)[0];
    // 담당자 근무 창 — 근무표(직원 수정)가 없으면 매장 영업시간. 휴게는 busy, 준비/정리 버퍼는 양쪽 예약에 붙어 간격을 만든다 (141, GAP R-4)
    const dayLabel = dayKeyOf(new Date(`${date}T00:00:00`));
    const win = dayWindow(getStaffSchedule(staff.id), dayLabel, SettingsStore.get().businessHours?.[dayLabel]);
    const pad = { b: win.bufferBeforeMin, a: win.bufferAfterMin };
    const existing = sameStaffDay.map(r => ({ r, iv: toInterval(r.startTime, r.endTime) })).filter((x): x is { r: Reservation; iv: Interval } => x.iv !== null);
    const bufferOverlap = !overlap && (pad.b > 0 || pad.a > 0)
      ? existing.find(x => overlaps({ startMin: newStart - pad.b, endMin: newEnd + pad.a }, { startMin: x.iv.startMin - pad.b, endMin: x.iv.endMin + pad.a }))?.r
      : undefined;
    // 휴무일·지정 휴일·영업시간 밖 경고 — 예외 영업이 있으니 막지 않고 확인만. 시간이 안 바뀐 수정(메모만 등)은 다시 묻지 않는다 (2026-11-18)
    const timeChanged = !editing || editing.date !== date || editing.startTime !== startTime || editing.endTime !== endTime || editing.staffId !== staff.id;
    const hoursWarnings = timeChanged ? checkBusinessHours(date, startTime, totalDuration) : [];
    const staffWarnings = timeChanged ? checkStaffWindow(win, staff.name, dayLabel, newStart, totalDuration).map(w => w.message) : [];
    // 걸리는 게 있으면 같은 담당자의 빈 시간 3개를 함께 알려 준다 — "안 된다"에서 끝나지 않게 (140·141, GAP R-4). 휴무면 제안할 게 없다
    const freeHint = (overlap || bufferOverlap || staffWarnings.length > 0) && win.work ? (() => {
      const busy = [...existing.map(x => ({ startMin: x.iv.startMin - pad.b, endMin: x.iv.endMin + pad.a })), ...win.breaks];
      const now = new Date();
      const notBeforeMin = date === todayKey ? now.getHours() * 60 + now.getMinutes() : null; // 오늘은 이미 지난 시각을 제안하지 않는다 (144 리뷰 M-5)
      const free = nextAvailable({ openMin: win.work.startMin, closeMin: win.work.endMin, durationMin: totalDuration, busy, bufferBeforeMin: pad.b, bufferAfterMin: pad.a, notBeforeMin }, 3);
      return free.length ? `${staff.name} 담당 빈 시간: ${free.join(', ')}` : `${staff.name} 담당은 이날 ${totalDuration}분짜리 빈 시간이 없습니다.`;
    })() : null;
    const warnings = [
      ...(overlap ? [`${staff.name} 담당자가 그 시간(${overlap.startTime}~${overlap.endTime}, ${overlap.customerName})에 이미 예약이 있습니다.`] : []),
      ...(bufferOverlap ? [`${staff.name} 담당자의 준비·정리 시간(앞 ${pad.b}분·뒤 ${pad.a}분)을 넣으면 ${bufferOverlap.startTime}~${bufferOverlap.endTime} 예약과 겹칩니다.`] : []),
      ...staffWarnings,
      ...(freeHint ? [freeHint] : []),
      ...hoursWarnings.map(w => w.message),
    ];
    // 베드·룸 자원 — 한 자원은 한 번에 예약 하나. 자동이면 목록 순서로 첫 빈 자원, 지정했는데 그 시간에 쓰고 있으면 확인(막지 않음) (142, GAP R-5)
    let resourceId: string | null = null;
    if (resources.length > 0 && resourceChoice !== 'none') {
      const cand = { startMin: newStart, endMin: newEnd, date, excludeId: editing?.id };
      const assignments = resourceAssignments();
      const allReservations = ReservationStore.getAll();
      const free = freeResources(resources, assignments, allReservations, cand);
      if (resourceChoice === 'auto') {
        resourceId = free[0]?.id ?? null;
        if (!resourceId) warnings.push(`빈 베드·룸이 없습니다(${resources.map(r => r.name).join(', ')} 모두 사용 중). 자원 없이 저장됩니다.`);
      } else {
        resourceId = resourceChoice;
        const busyBy = resourceConflicts(resourceChoice, assignments, allReservations, cand)[0];
        const name = resources.find(r => r.id === resourceChoice)?.name ?? '선택한 자원';
        if (busyBy) warnings.push(`${josa(name, '은/는')} 그 시간(${busyBy.startTime}~${busyBy.endTime}${busyBy.customerName ? `, ${busyBy.customerName}` : ''})에 이미 쓰고 있습니다.${free.length ? ` 빈 자원: ${free.map(r => r.name).join(', ')}` : ''}`);
      }
    }
    // 예약 정책 "겹치는 예약 금지" — 같은 담당자 겹침은 강행 없이 막고 빈 시간만 안내 (173, GAP R-3 2단계). 버퍼·근무 외·휴무 경고는 정책과 무관하게 확인만
    if (decideOverlap(getReservationPolicy(), !!overlap && timeChanged) === 'block') { // 시간을 바꾸지 않은 수정(메모 등)은 막지 않는다 — 정책 켠 뒤 기존 겹침 예약이 편집 불가가 되지 않게 (174 리뷰 M-1)
      notify.error(`${warnings[0]} 설정 > 영업시간 > 예약 정책이 겹치는 예약을 막고 있습니다.${freeHint ? ` ${freeHint}` : ''}`);
      return;
    }
    if (warnings.length > 0) {
      // 확인창은 하나로 — 모바일에서 네이티브 confirm 두 번은 답답하다
      const proceed = window.confirm(`${warnings.join('\n')}\n그래도 ${isEdit ? '저장' : '등록'}할까요?`);
      if (!proceed) return;
    }

    const reservation: Omit<Reservation, 'id' | 'status'> = { // status 는 저장 경로에서 따로 — 수정은 보내지 않고, 신규만 '확정' (16차 #H1)
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      staffId: staff.id,
      staffName: staff.name,
      services: servicesPayload,
      date,
      startTime,
      endTime,
      source,
      memo: memo || undefined,
      totalPrice,
    };

    if (isEdit && editing && editing.status === 'completed') {
      // 완료·결제된 예약의 금액·고객 변경 — 결제(PaymentStore)는 따라 바뀌지 않는다 (정합성 감사 2026-11-19)
      const paid = registeredPaymentsFor(editing.id).reduce((sum, p) => sum + p.amount, 0);
      const customerChanged = customer.id !== editing.customerId;
      if (paid > 0 && (customerChanged || totalPrice !== editing.totalPrice)) {
        if (!window.confirm(`이 예약에는 등록된 결제 ${formatPrice(paid)}이 있습니다. 예약의 ${customerChanged ? '고객' : '금액'}을 바꿔도 결제는 바뀌지 않습니다 — 매출 화면에서 결제를 따로 수정해주세요.\n그래도 저장할까요?`)) return;
      }
    }
    if (isEdit && editing) {
      // 수정: 기존 예약 갱신 — status 는 보내지 않는다. 폰에서 완료/노쇼 처리한 예약을 PC 의 옛 수정 창이 '확정'으로 되돌렸다 (16차 #H1)
      ReservationStore.update(editing.id, reservation);
      if (resources.length > 0) assignResource(editing.id, resourceId); // 자원 배정은 설정 행에 (142). 자원이 없으면 기존 배정은 그대로 (144 리뷰 M-1)
      // Google 캘린더에 옛 정보가 남지 않도록 기존 이벤트 삭제 후 재생성
      const oldEventId = getGcalMap()[editing.id];
      if (oldEventId && isGoogleCalendarConnected()) {
        deleteCalendarEvent(oldEventId).catch(() => { /* best-effort */ });
        createCalendarEvent({ ...reservation, status: editing.status, id: editing.id })
          .then(ev => rememberGcalEvent(editing.id, ev.id))
          .catch(() => notify('예약은 저장했지만 Google 캘린더 일정은 만들지 못했습니다. 캘린더에서 직접 추가해주세요.')); // 조용히 어긋나지 않게 (6차 UX 감사 2026-11-20)
      }
    } else {
      const saved = ReservationStore.save({ ...reservation, status: 'confirmed' });
      if (saved && resourceId) assignResource(saved.id, resourceId); // 자원 배정은 설정 행에 (142)
      if (saved) onSaved?.(saved.id);
      // Google Calendar에도 추가 — 이벤트 id를 기억해 취소/삭제 시 정리 가능하게
      if (addToGoogle && googleAvailable && saved) {
        createCalendarEvent(saved)
          .then(ev => rememberGcalEvent(saved.id, ev.id))
          .catch(() => notify('예약은 저장했지만 Google 캘린더 일정은 만들지 못했습니다. 캘린더에서 직접 추가해주세요.'));
      }
    }
    onSave();
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={isEdit ? '예약 수정' : '예약 추가'} size="lg">
      <form onSubmit={e => { e.preventDefault(); handleSave(); }} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">고객 *</label>
            <CustomerCombobox customers={customers} value={customerId} onChange={setCustomerId} maskRole={authUser?.role ?? 'staff'} />
            {customers.length === 0 && <PrereqHint text="등록된 고객이 없습니다" action="고객 등록" onGo={() => { onClose(); goTo('/customers?new=1'); }} />}
            <ProgramBalance customerId={customerId} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">담당 직원 *</label>
            <select aria-label="담당 직원"
              value={staffId}
              onChange={e => setStaffId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              <option value="">직원 선택</option>
              {staffList.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
            </select>
            {staffList.length === 0 && <PrereqHint text="등록된 직원이 없습니다" action="직원 등록" onGo={() => { onClose(); goTo('/staff?new=1'); }} />}
          </div>
          {resources.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">베드·룸</label>
              <select aria-label="베드·룸"
                value={resourceChoice}
                onChange={e => setResourceChoice(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
              >
                <option value="auto">자동 배정(빈 자원)</option>
                <option value="none">배정 안 함</option>
                {resources.map(r => <option key={r.id} value={r.id}>{r.name} ({RESOURCE_KIND_LABEL[r.kind]}{r.isActive ? '' : ', 미사용'})</option>)}
              </select>
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">시술 *</label>
          <select aria-label="시술"
            value={serviceId}
            onChange={e => setServiceId(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
          >
            <option value="">시술 선택</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name} ({s.duration}분 / {formatPrice(s.price)})</option>)}
          </select>
          {services.length === 0 && (canOpenRoute(authUser?.role, '/settings')
            ? <PrereqHint text="등록된 시술 항목이 없습니다" action="시술 항목 등록" onGo={() => { onClose(); goTo('/settings?tab=services'); }} />
            : <p className="mt-1.5 text-xs text-amber-700">등록된 시술 항목이 없습니다 — 매장 관리자에게 시술 항목 등록을 요청해주세요.</p>)} {/* 직원은 설정이 막혀 있다 (117~119 리뷰 #H4) */}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">날짜 *</label>
            <input
              type="date"
              aria-label="예약 날짜"
              required
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">시작 시간 *</label>
            <select aria-label="시작 시간"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              {!startOptions.includes(startTime) && <option value={startTime}>{startTime}</option>}
              {startOptions.map(t => <option key={t} value={t}>{t}{startMarks.has(t) ? ` · ${startMarks.get(t)}` : ''}</option>)}
            </select>
          </div>
          <DateQuickChips value={date} onChange={setDate} className="col-span-2 sm:col-span-3 sm:order-last !-mt-2.5" />{/* 폰: 날짜·시간 줄 바로 아래, sm+: 날짜·시간·경로 한 줄 뒤(빈 칸 없이) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">예약 경로</label>
            <select aria-label="예약 경로"
              value={source}
              onChange={e => setSource(e.target.value as Reservation['source'])}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              <option value="manual">직접등록</option>
              <option value="naver">네이버</option>
              <option value="kakao">카카오</option>
              <option value="phone">전화</option>
              <option value="walk-in">워크인</option>
              <option value="app">앱</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">메모</label>
          <textarea aria-label="메모"
            rows={2}
            value={memo}
            onChange={e => setMemo(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none"
            placeholder="특이사항"
          />
        </div>
        {googleAvailable && !isEdit && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={addToGoogle}
              onChange={e => setAddToGoogle(e.target.checked)}
              className="w-4 h-4"
            />
            <Calendar size={14} className="text-primary-600" />
            <span className="text-sm text-gray-700">Google 캘린더에도 추가</span>
          </label>
        )}
        {formError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {formError}
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">취소</button>
          <button
            type="submit"
            className="flex-1 py-2.5 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl hover:bg-[#15306e] transition-colors"
          >
            예약 저장
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReservationDetailModal({ reservation: r, onClose, onUpdate, onDelete, onEdit }: {
  reservation: Reservation;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { user } = useAuth();
  const goTo = useNavigate();
  const resource = resourceOf(r.id); // 베드·룸 배정 (142)
  // 예약 → 시술 기록(사진 첨부) 연계: 고객·시술일·담당자·시술 항목을 프리필해 시술 기록 화면을 연다 (2026-11-17)
  const openTreatmentLog = () => {
    const q = new URLSearchParams({ new: '1', customer: r.customerId, date: r.date, reservation: r.id });
    if (r.staffName) q.set('staff', r.staffName);
    r.services.map(s => s.serviceName).filter(Boolean).forEach(n => q.append('services', n)); // 반복 키 — 쉼표가 든 메뉴명도 안전
    goTo(`/treatments?${q.toString()}`);
  };
  // 이 예약에 등록된 결제(완료·대기, 환불 제외 — pendingCompletion과 같은 기준). 상세가 열려 있는 동안 결제가 바뀌는 길은 결제 창뿐이고 그 뒤 상세가 닫히므로 예약 id로만 메모 (2026-11-19)
  const paidForThis = registeredPaymentsFor(r.id); // 열 때 값으로 고정하면 다른 기기의 결제 등록을 모른 채 결제 창을 열어 이중 결제 (리뷰 #M3)
  const paidAmount = paidForThis.reduce((s, p) => s + p.amount, 0);
  // 이 예약 날짜에 작성된 이 고객의 시술 기록 — 시술 기록은 예약 id를 들고 있지 않아 코어 updateStatus와 같은 기준(고객+날짜)으로 센다.
  // 취소·복구해도 시술 기록과 회차 차감은 그대로 남으므로 confirm에 알린다 (UX 점검 2026-11-19)
  const logsOnDate = useMemo(() => TreatmentLogStore.getByCustomer(r.customerId).filter(t => t.treatmentDate === r.date), [r.customerId, r.date]);
  const logsWarn = logsOnDate.length > 0
    ? `\n\n이 날짜에 작성한 시술 기록 ${logsOnDate.length}건(회차 차감 포함)은 그대로 남습니다. 잘못 쓴 기록이면 시술 기록 화면에서 삭제해주세요.`
    : '';
  const handleCancel = async () => {
    // Google 캘린더 이벤트 삭제가 비가역이므로 확인 후 진행. 결제가 붙은 완료 예약은 취소해도 결제가 남는다는 걸 분명히 한다
    const warn = r.status === 'completed' && paidForThis.length > 0
      ? `\n\n이 예약은 완료 처리됐고 등록된 결제 ${formatPrice(paidAmount)}은 그대로 남습니다. 환불은 매출 화면에서 처리하세요.`
      : '';
    if (!(await askConfirm({ title: '예약 취소 처리', message: `이 예약을 취소 처리할까요?${warn}${logsWarn}`, confirmLabel: '취소 처리', cancelLabel: '닫기' }))) return; // 앱 확인창 (15차 #H3)
    ReservationStore.updateStatus(r.id, 'cancelled');
    cleanupGcalEvent(r.id); // 취소된 예약은 Google 캘린더에서도 제거
    // 빈 자리를 원한 대기 요청이 있으면 바로 안내 — 요청함을 열어 보지 않아도 알 수 있게 (185, GAP R-10)
    if (r.date >= todayISO()) void newRequests().then(list => { const msg = describeWaitlist(waitlistFor(list, r.date, r.startTime), formatDate(r.date)); if (msg) notify.info(msg); }).catch(() => undefined); // 지난 날짜 자리는 안내하지 않는다 (187 리뷰 L-4)
    onUpdate();
  };
  // 노쇼 — 상세에서 바로 처리 (2026-11-18). 고객 상세 "노쇼 N회"·직원 실적 제외·완료 누락 카드에서 빠진다.
  // 캘린더 일정도 지운다 — 남겨 두면 공유 캘린더에서 그 시간이 여전히 잡혀 보여 대체 예약이 이중 일정처럼 보인다(취소와 동일 처리)
  const canNoShow = r.date <= todayISO() && r.status !== 'cancelled' && r.status !== 'noshow' && r.status !== 'completed';
  // 잘못 취소·노쇼 처리한 예약을 되돌리는 길 — 상태만 '예약확정'으로, 취소 때 지운 Google 캘린더 일정은 다시 만든다 (리뷰 2026-11-19)
  const isClosed = r.status === 'cancelled' || r.status === 'noshow';
  const handleRestore = async () => {
    const google = isGoogleCalendarConnected();
    if (!(await askConfirm({ title: '예약 복구', confirmLabel: '복구', message: `이 예약을 다시 '예약확정'으로 되돌릴까요?${r.date <= todayISO() ? '\n고객이 실제로 방문했던 예약이면 대신 [완료처리]를 눌러주세요.' : ''}${google ? '\n\nGoogle 캘린더 일정도 다시 만듭니다.' : ''}${logsWarn}` }))) return;
    ReservationStore.updateStatus(r.id, 'confirmed');
    if (google) {
      createCalendarEvent({ ...r, status: 'confirmed' })
        .then(ev => rememberGcalEvent(r.id, ev.id))
        .catch(() => notify('예약은 되돌렸지만 Google 캘린더 일정은 다시 만들지 못했습니다. 캘린더에서 직접 추가해주세요.'));
    }
    notify.success('예약확정 상태로 되돌렸습니다. 시술 기록·결제는 바뀌지 않았습니다.');
    onUpdate();
  };
  const handleNoShow = async () => {
    if (!(await askConfirm({ title: '노쇼 처리', message: `${r.customerName} 고객이 ${formatDate(r.date)} ${r.startTime} 예약에 오지 않았나요? 노쇼로 기록합니다.`, confirmLabel: '노쇼 기록', cancelLabel: '닫기' }))) return;
    ReservationStore.updateStatus(r.id, 'noshow');
    cleanupGcalEvent(r.id);
    notify.info('노쇼로 기록했습니다. 고객 상세에 노쇼 횟수가 표시됩니다.');
    onUpdate();
  };

  const [showPayModal, setShowPayModal] = useState(false);

  const handleComplete = () => {
    ReservationStore.updateStatus(r.id, 'completed');
    healProgramSessionsWhenReady(r.customerId); // 회차권 사용 회차도 기록 기준으로 (16차 #H2)
    healCustomerStatsWhenReady(r.customerId); // 코어 +1이 같은 날 시술 기록과 겹치면 두 번 세진다 — 기록(다녀간 날 수)으로 바로 맞춤, 하이드레이션 뒤 (리뷰 2026-11-19)
    // 완료 → 결제 브리지: 기존엔 상태만 바뀌고 매출에 잡히지 않아 Sales에서 수기 재입력이 필요했음
    if (r.totalPrice > 0) {
      const alreadyPaid = paidForThis.length > 0;
      if (alreadyPaid) {
        notify.success('완료 처리했습니다. 결제는 이미 등록돼 있어 다시 묻지 않았습니다.');
      } else {
        // 결제수단 선택 모달로 — 단일/복합(분할) 결제와 커스텀 수단 지원
        setShowPayModal(true);
        return; // 결제 모달이 닫힐 때 onUpdate 호출
      }
    }
    onUpdate();
  };

  const handleDelete = async () => {
    // 삭제해도 이 예약 id로 등록된 결제는 남는다(취소처리와 같은 안내). [취소처리] 권유는 그 버튼이 있을 때만 (리뷰 2026-11-19)
    const payWarn = paidForThis.length > 0 ? `\n\n등록된 결제 ${formatPrice(paidAmount)}은 그대로 남습니다. 환불은 매출 화면에서 처리하세요.` : '';
    const cancelTip = isClosed ? '' : ' 고객이 취소한 예약이면 대신 [취소처리]를 써주세요.';
    if (await askConfirm({ title: '예약 삭제', message: `이 예약을 삭제할까요?\n취소처리와 달리 예약 기록이 남지 않고 되돌릴 수 없습니다.${cancelTip}${payWarn}${logsWarn}`, confirmLabel: '삭제', danger: true })) {
      ReservationStore.delete(r.id);
      assignResource(r.id, null); // 자원 배정도 함께 정리 (142)
      cleanupGcalEvent(r.id); // 삭제된 예약은 Google 캘린더에서도 제거
      onDelete();
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="예약 상세" size="md">
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center">
                <span className="text-white font-bold">{(r.customerName || '?')[0]}</span>
              </div>
              <div>
                {r.customerId ? (
                  <button type="button" onClick={() => { onClose(); goTo(`/customers?open=${encodeURIComponent(r.customerId)}`); }}
                    className="font-bold text-gray-900 hover:underline text-left" title="고객 상세 열기" aria-label={`${r.customerName} 고객 상세 열기`}>
                    {r.customerName}
                  </button>
                ) : (
                  <p className="font-bold text-gray-900">{r.customerName}</p>
                )}
                <p className="text-xs text-gray-400"><PhoneLink phone={r.customerPhone} role={user?.role ?? 'staff'} /></p>
              </div>
            </div>
            <div className="flex gap-2">
              <SourceBadge source={r.source} />
              <span data-testid="reservation-status"><StatusBadge status={r.status} /></span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <InfoItem label="날짜" value={formatDate(r.date)} />
          <InfoItem label="시간" value={`${r.startTime} ~ ${r.endTime}`} />
          <InfoItem label="담당자" value={r.staffName} />
          {resource && <InfoItem label="베드·룸" value={resource.name} />}
          <InfoItem label="금액" value={formatPrice(r.totalPrice)} />
        </div>
        <ProgramBalance customerId={r.customerId} />

        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">시술 내역</p>
          {r.services.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <span className="text-sm text-gray-700">{s.serviceName}</span>
              <span className="text-sm font-semibold text-gray-800">{formatPrice(s.price)}</span>
            </div>
          ))}
        </div>

        {r.naverBookingId && (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-xl">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            <span className="text-xs text-green-700 font-medium">네이버 예약 ID: {r.naverBookingId}</span>
          </div>
        )}

        {r.memo && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">메모</p>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">{r.memo}</p>
          </div>
        )}

        {r.status !== 'cancelled' && r.status !== 'noshow' && (
          <button
            type="button"
            onClick={openTreatmentLog}
            className="w-full py-2.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 transition-colors flex items-center justify-center gap-1.5"
            title="이 예약의 고객·날짜·시술 항목이 채워진 시술 기록 창을 엽니다 (사진 첨부)"
          >
            <Scissors size={14} />시술 기록 작성
          </button>
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          {!isClosed && (
            <button
              onClick={handleCancel}
              className="flex-1 min-w-[6.5rem] py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
            >
              취소처리
            </button>
          )}
          {canNoShow && (
            <button
              onClick={handleNoShow}
              className="flex-1 min-w-[6.5rem] py-2.5 text-sm font-medium text-rose-700 bg-rose-50 rounded-xl hover:bg-rose-100 transition-colors"
              title="고객이 오지 않은 예약 — 노쇼 횟수에 반영"
            >
              노쇼
            </button>
          )}
          {isClosed && (
            <button
              onClick={handleRestore}
              title="잘못 취소·노쇼 처리한 경우 — 예약확정으로 되돌립니다"
              className="flex-1 min-w-[6.5rem] py-2.5 text-sm font-medium text-[#1a3a8f] bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors"
            >
              예약 복구
            </button>
          )}
          {/* 이미 완료된 예약엔 '완료처리'를 다시 보이지 않는다(상태 배지가 완료를 보여줌). 결제가 아직 없으면 그 자리에 '결제 등록하기'.
              취소·노쇼 예약은 지난 날짜일 때만 완료처리(실제로 왔던 경우) — 앞으로의 예약은 [예약 복구]로 되돌린다 */}
          {r.status !== 'completed' ? (
            (!isClosed || r.date <= todayISO()) && (
              <button
                onClick={handleComplete}
                title={isClosed ? '고객이 실제로 방문했던 경우 — 바로 완료로 기록합니다' : undefined}
                className="flex-1 min-w-[6.5rem] py-2.5 text-sm font-medium text-white bg-green-700 rounded-xl hover:bg-green-800 transition-colors"
              >
                완료처리
              </button>
            )
          ) : r.totalPrice > 0 && paidForThis.length === 0 ? (
            <button
              onClick={() => setShowPayModal(true)}
              aria-describedby="unpaid-completed-hint"
              className="flex-1 min-w-[6.5rem] py-2.5 text-sm font-medium text-white bg-green-700 rounded-xl hover:bg-green-800 transition-colors"
            >
              결제 등록하기
            </button>
          ) : null}
          <button onClick={onEdit} className="flex-1 min-w-[6.5rem] py-2.5 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl hover:bg-[#15306e] transition-colors">수정</button>
        </div>
        {r.status === 'completed' && r.totalPrice > 0 && paidForThis.length === 0 && (
          <p id="unpaid-completed-hint" className="text-xs text-amber-700">완료 처리됐지만 결제가 아직 등록되지 않은 예약입니다.</p>
        )}
        {/* 삭제는 되돌릴 수 없는 보조 동작 — 주 동작 행과 떨어진 작은 글자 버튼으로. 고객이 취소한 예약은 [취소처리]가 맞다 (UX 점검 L5, 2026-11-19) */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleDelete}
            title="예약을 기록에서 완전히 지웁니다 — 고객이 취소한 예약은 [취소처리]를 써주세요"
            className="text-xs text-red-600 hover:text-red-700 hover:underline flex items-center gap-1 px-1.5 min-h-[44px] -my-2.5 rounded"
          >
            <Trash2 size={12} /> 이 예약 삭제
          </button>
        </div>
      </div>
      {showPayModal && (() => {
        // 시술 기록은 예약일(r.date)로 프리필되므로 회차권 사용 가능 여부도 같은 날짜 기준으로 판단한다 (리뷰 2026-11-19)
        const usable = getUsablePrograms(r.customerId, r.date);
        const expired = getExpiredPrograms(r.customerId, r.date);
        return (
          <CompletePaymentModal reservation={r} late={r.status === 'completed'} onDone={() => { setShowPayModal(false); onUpdate(); }} onTreatmentLog={usable.length > 0 ? () => { setShowPayModal(false); openTreatmentLog(); } : undefined}
            expiredNote={usable.length === 0 && expired.length > 0
              ? `${expiredProgramsHint(expired, '고객 상세의 [관리]', '')} 연장해서 차감하려면 [결제 등록 없이 닫기]로 나가 연장한 뒤 시술 기록을 작성하고, 단건으로 받았다면 아래에서 결제를 등록하세요.`
              : undefined} />
        );
      })()}
    </Modal>
  );
}

// 완료처리 결제 등록 모달 — 단일 결제 + 복합(2가지 수단 분할) + 커스텀 결제수단
function CompletePaymentModal({ reservation: r, onDone, onTreatmentLog, expiredNote, late }: { reservation: Reservation; onDone: () => void; onTreatmentLog?: () => void; expiredNote?: string; late?: boolean }) {
  const [mode, setMode] = useState<'single' | 'split'>('single');
  const [method, setMethod] = useState(getLastPaymentMethod() ?? '카드'); // 지난번 결제수단 (입력 속도 감사 2026-11-18)
  const [methodA, setMethodA] = useState('카드');
  const [methodB, setMethodB] = useState('현금');
  const [amountA, setAmountA] = useState(String(r.totalPrice));
  const [amountB, setAmountB] = useState('0');

  const basePayment = {
    customerId: r.customerId,
    customerName: r.customerName,
    paymentDate: r.date,
    type: 'single_treatment' as const,
    typeLabel: r.services.map(s => s.serviceName).join(', ') || '시술',
    referenceId: r.id,
    discountAmount: 0,
    status: 'completed' as const,
  };

  const handleSave = () => {
    { const blocked = monthCloseBlock(basePayment.paymentDate); if (blocked) { notify.error(blocked); return; } } // 월 마감 잠금 (147, GAP P-7)
    if (mode === 'single') {
      PaymentStore.save({ ...basePayment, amount: r.totalPrice, paymentMethod: method, memo: '예약 완료 처리에서 자동 등록' });
      rememberPaymentMethod(method);
    } else {
      const a = Math.max(0, Number(amountA.replace(/\D/g, '')) || 0);
      const b = Math.max(0, Number(amountB.replace(/\D/g, '')) || 0);
      if (a + b !== r.totalPrice) {
        notify(`분할 금액 합계(${formatPrice((a + b))})가 결제 금액(${formatPrice(r.totalPrice)})과 다릅니다.`);
        return;
      }
      if (methodA === methodB) {
        notify('두 결제수단이 같습니다. 단일 결제를 사용해주세요.');
        return;
      }
      const splitMemo = `복합결제 (${methodA} ${formatPrice(a)} + ${methodB} ${formatPrice(b)})`;
      if (a > 0) PaymentStore.save({ ...basePayment, amount: a, paymentMethod: methodA, memo: splitMemo });
      if (b > 0) PaymentStore.save({ ...basePayment, amount: b, paymentMethod: methodB, memo: splitMemo });
    }
    onDone();
  };

  return (
    <Modal isOpen={true} onClose={onDone} title="결제 등록" size="md">
      <div className="space-y-4">
        <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3 text-sm text-gray-700">
          {late ? '완료 처리된 예약입니다. 아직 등록되지 않은 결제 ' : '완료 처리됐습니다. 결제 '}<span className="font-bold">{formatPrice(r.totalPrice)}</span>을 매출에 등록하세요.
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => setMode('single')}
            className={`flex-1 py-2 rounded-xl text-sm border ${mode === 'single' ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]' : 'bg-white text-gray-600 border-gray-200'}`}>
            단일 결제
          </button>
          <button type="button" onClick={() => setMode('split')}
            className={`flex-1 py-2 rounded-xl text-sm border ${mode === 'split' ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]' : 'bg-white text-gray-600 border-gray-200'}`}>
            복합 결제 (카드+현금 등)
          </button>
        </div>

        {mode === 'single' ? (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">결제수단</p>
            <PaymentMethodPicker value={method} onChange={setMethod} />
          </div>
        ) : (
          <div className="space-y-3">
            {[
              { label: '결제수단 ①', m: methodA, setM: setMethodA, amt: amountA, setAmt: setAmountA },
              { label: '결제수단 ②', m: methodB, setM: setMethodB, amt: amountB, setAmt: setAmountB },
            ].map(row => (
              <div key={row.label} className="border border-gray-100 rounded-xl p-3 space-y-2">
                <p className="text-xs font-medium text-gray-500">{row.label}</p>
                <PaymentMethodPicker value={row.m} onChange={row.setM} />
                <input
                  inputMode="numeric"
                  value={row.amt}
                  onChange={e => row.setAmt(e.target.value.replace(/[^\d]/g, ''))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-300"
                  placeholder="금액(원)"
                />
              </div>
            ))}
            <p className="text-xs text-gray-400 text-right">
              합계 {formatPrice((Number(amountA) || 0) + (Number(amountB) || 0))} / 결제 금액 {formatPrice(r.totalPrice)}
            </p>
          </div>
        )}

        {onTreatmentLog && (
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2 flex-wrap text-xs text-blue-800">
            <span className="flex-1 min-w-0">회차권·프로그램이 있는 고객입니다. 그 프로그램으로 받은 시술이면 결제 대신 시술 기록을 작성해 차감하세요.</span>
            <button type="button" onClick={onTreatmentLog} className="px-3 py-1.5 rounded-lg bg-white border border-blue-200 font-medium text-[#1a3a8f] hover:bg-blue-100">시술 기록 작성 (회차 차감)</button>
          </div>
        )}
        {expiredNote && (
          <p className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">{expiredNote}</p>
        )}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onDone} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
            결제 등록 없이 닫기
          </button>
          <button type="button" onClick={handleSave} className="flex-1 py-2.5 bg-green-700 text-white rounded-xl text-sm font-medium hover:bg-green-800">
            결제 등록
          </button>
        </div>
      </div>
    </Modal>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-800">{value}</p>
    </div>
  );
}
