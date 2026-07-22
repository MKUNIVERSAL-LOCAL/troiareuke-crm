import { useState, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, LayoutGrid, List, RefreshCw, Clock, Trash2, Calendar, Search } from 'lucide-react';
import { format, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, isSameDay, parseISO, addMinutes } from 'date-fns';
import { ko } from 'date-fns/locale';
import Header from '../../components/layout/Header';
import { StatusBadge, SourceBadge } from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { ReservationStore, StaffStore, ServiceStore, CustomerStore, PaymentStore } from '../../lib/store';
import type { Reservation, Staff, Service, Customer } from '../../types';
import {
  isGoogleCalendarConnected,
  fetchCalendarEventsAsReservations,
  createCalendarEvent,
  deleteCalendarEvent,
} from '../../lib/googleCalendar';
import clsx from 'clsx';
import { maskPhone } from '../../lib/masking';
import { useAuth } from '../../contexts/AuthContext';

const TIME_SLOTS = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];

// ── Google Calendar 이벤트 매핑 (reservationId → eventId) ─────────────────
// 예약 수정/취소/삭제 시 캘린더의 유령 일정을 정리하기 위해 로컬에 매핑 보관.
// (Reservation 코어 타입에 googleEventId 필드가 없어 비코어 우회 저장)
const GCAL_MAP_KEY = 'crm_gcal_event_map';

function getGcalMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(GCAL_MAP_KEY) || '{}'); } catch { return {}; }
}

function rememberGcalEvent(reservationId: string, eventId: string): void {
  const m = getGcalMap();
  m[reservationId] = eventId;
  try { localStorage.setItem(GCAL_MAP_KEY, JSON.stringify(m)); } catch { /* noop */ }
}

/** 예약에 연결된 Google 이벤트를 캘린더에서 삭제하고 매핑 제거 (미연결/실패는 무시) */
function cleanupGcalEvent(reservationId: string): void {
  const m = getGcalMap();
  const eventId = m[reservationId];
  if (!eventId) return;
  delete m[reservationId];
  try { localStorage.setItem(GCAL_MAP_KEY, JSON.stringify(m)); } catch { /* noop */ }
  if (isGoogleCalendarConnected()) {
    deleteCalendarEvent(eventId).catch(() => { /* 캘린더 정리는 best-effort */ });
  }
}

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
  const [editReservation, setEditReservation] = useState<Reservation | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>(() => ReservationStore.getAll());
  const [staffList] = useState<Staff[]>(() => StaffStore.getAll());
  const [googleEvents, setGoogleEvents] = useState<GoogleEventLike[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const googleConnected = isGoogleCalendarConnected();

  const reloadReservations = useCallback(() => {
    setReservations(ReservationStore.getAll());
  }, []);

  // Google Calendar 이벤트 로드
  const loadGoogleEvents = useCallback(async () => {
    if (!googleConnected) { setGoogleEvents([]); return; }
    try {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const start = viewMode === 'day' ? new Date(currentDate) : weekStart;
      const end = viewMode === 'day' ? addDays(currentDate, 1) : addDays(weekStart, 7);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      const { asReservationLike } = await fetchCalendarEventsAsReservations(start, end);
      setGoogleEvents(asReservationLike);
    } catch {
      setGoogleEvents([]);
    }
  }, [googleConnected, currentDate, viewMode]);

  useEffect(() => { loadGoogleEvents(); }, [loadGoogleEvents]);

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

  const handleUpdateReservation = () => {
    reloadReservations();
    setSelectedReservation(null);
  };

  const handleDeleteReservation = () => {
    reloadReservations();
    setSelectedReservation(null);
  };

  // 모바일 전용 상태
  const [mobileTab, setMobileTab] = useState<'today' | 'week' | 'month'>('today');

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const normalizedSearch = search.trim().toLowerCase();
  const filteredReservations = reservations.filter(r => {
    const statusMatches = statusFilter === 'all' || r.status === statusFilter;
    const searchMatches = !normalizedSearch || [
      r.customerName,
      r.customerPhone,
      r.staffName,
      r.memo || '',
      ...r.services.map(service => service.serviceName),
    ].some(value => value.toLowerCase().includes(normalizedSearch));
    return statusMatches && searchMatches;
  });
  const mobileFilteredReservations = (() => {
    if (mobileTab === 'today') {
      return filteredReservations.filter(r => r.date === todayStr);
    } else if (mobileTab === 'week') {
      const wStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const wEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      return filteredReservations.filter(r => r.date >= wStart && r.date <= wEnd);
    } else {
      const mStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const mEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');
      return filteredReservations.filter(r => r.date >= mStart && r.date <= mEnd);
    }
  })().sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

  const STATUS_COLORS: Record<string, string> = {
    confirmed: 'bg-indigo-100 text-indigo-700',
    pending: 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-slate-100 text-slate-500',
    noshow: 'bg-red-100 text-red-600',
  };
  const STATUS_LABELS: Record<string, string> = {
    confirmed: '확정', pending: '대기', completed: '완료', cancelled: '취소', noshow: '노쇼',
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="예약 관리"
        subtitle="예약 현황 및 일정 관리"
        action={{ label: '예약 추가', onClick: () => setShowAddModal(true) }}
      />

      {/* ── 모바일 뷰 (< lg) ── 일별 리스트 */}
      <div className="block lg:hidden flex-1 flex flex-col">
        {/* 탭 필터 */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 shadow-sm">
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
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {mobileFilteredReservations.length === 0 ? (
            <div className="py-16 text-center">
              <Calendar size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">
                {mobileTab === 'today' ? '오늘' : mobileTab === 'week' ? '이번 주' : '이번 달'} 예약이 없습니다
              </p>
              <p className="text-xs text-slate-400 mt-1">PC에서 예약을 추가하세요</p>
            </div>
          ) : (
            mobileFilteredReservations.map(r => (
              <button
                key={r.id}
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
                      <span className={clsx(
                        'text-xs font-medium px-1.5 py-0.5 rounded-full',
                        STATUS_COLORS[r.status] ?? 'bg-slate-100 text-slate-500',
                      )}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {r.services.map(s => s.serviceName).join(', ')} · {r.staffName}
                    </p>
                    <p className="text-xs font-medium text-gray-700 mt-0.5">{r.totalPrice.toLocaleString()}원</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── 데스크톱 뷰 (lg+) ── 기존 캘린더 그대로 */}
      <div className="hidden lg:block p-8 flex-1">
        {/* Controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('prev')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
            <button onClick={() => setCurrentDate(new Date())} className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2">
              <RefreshCw size={14} /> 오늘
            </button>
            <button onClick={() => navigate('next')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
              <ChevronRight size={18} className="text-gray-600" />
            </button>
            <h3 className="text-base font-bold text-gray-900">
              {viewMode === 'week'
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
                      viewMode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
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
          <span className="text-xs text-gray-400 whitespace-nowrap">{filteredReservations.length}건</span>
        </div>

        {/* Calendar Views */}
        {viewMode === 'week' && (
          <WeekView weekDays={weekDays} reservations={filteredReservations} staffList={staffList} onSelect={setSelectedReservation} googleEvents={googleEvents} />
        )}
        {viewMode === 'day' && (
          <DayView date={currentDate} reservations={filteredReservations} staffList={staffList} onSelect={setSelectedReservation} googleEvents={googleEvents} />
        )}
        {viewMode === 'list' && (
          <ListView reservations={filteredReservations} onSelect={setSelectedReservation} googleEvents={googleEvents} />
        )}
      </div>

      {showAddModal && (
        <AddReservationModal onClose={() => setShowAddModal(false)} onSave={handleSaveReservation} />
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

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-8 border-b border-gray-100">
        <div className="py-3 px-3 text-xs text-gray-400 text-center border-r border-gray-100">시간</div>
        {weekDays.map((day, i) => {
          const isToday = isSameDay(day, today);
          const dayReservations = reservations.filter(r => isSameDay(parseISO(r.date), day));
          return (
            <div key={i} className={clsx('py-3 px-2 text-center border-r border-gray-100 last:border-r-0', isToday && 'bg-purple-50')}>
              <p className={clsx('text-[11px] font-medium', i === 5 ? 'text-blue-500' : i === 6 ? 'text-red-500' : 'text-gray-500')}>
                {dayNames[i]}
              </p>
              <p className={clsx('text-sm font-bold mt-0.5', isToday ? 'text-purple-600' : 'text-gray-800')}>
                {format(day, 'd')}
              </p>
              {dayReservations.length > 0 && (
                <span className="text-xs text-purple-500 font-medium">{dayReservations.length}건</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Time Grid */}
      <div className="overflow-y-auto max-h-[550px]">
        {TIME_SLOTS.map(time => (
          <div key={time} className="grid grid-cols-8 border-b border-gray-50 min-h-[56px]">
            <div className="py-2 px-3 text-[11px] text-gray-400 text-right border-r border-gray-100 pt-2 sticky left-0 bg-white">
              {time}
            </div>
            {weekDays.map((day, di) => {
              const isToday = isSameDay(day, today);
              const slotReservations = reservations.filter(r =>
                isSameDay(parseISO(r.date), day) && r.startTime === time
              );
              const slotGoogleEvents = googleEvents.filter(ge =>
                ge.date === format(day, 'yyyy-MM-dd') && ge.startTime === time
              );
              return (
                <div key={di} className={clsx(
                  'border-r border-gray-50 last:border-r-0 p-1 relative',
                  isToday && 'bg-purple-50/30'
                )}>
                  {slotReservations.map(r => {
                    const staff = staffList.find(s => s.id === r.staffId);
                    return (
                      <button
                        key={r.id}
                        onClick={() => onSelect(r)}
                        className="w-full text-left rounded-lg p-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80 shadow-sm"
                        style={{ backgroundColor: staff?.color || '#8B5CF6' }}
                      >
                        <p className="font-bold truncate">{r.customerName}</p>
                        <p className="opacity-80 truncate">{r.services[0]?.serviceName}</p>
                      </button>
                    );
                  })}
                  {slotGoogleEvents.map(ge => (
                    <a
                      key={`g-${ge.id}`}
                      href={ge.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full text-left rounded-lg p-1.5 text-xs font-medium text-white bg-blue-500 transition-opacity hover:opacity-80 shadow-sm block mt-0.5"
                    >
                      <p className="font-bold truncate flex items-center gap-0.5">
                        <Calendar size={9} className="flex-shrink-0" />
                        {ge.summary}
                      </p>
                    </a>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
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
  const dayReservations = reservations.filter(r => isSameDay(parseISO(r.date), date));
  const dayGoogleEvents = googleEvents.filter(ge => ge.date === format(date, 'yyyy-MM-dd'));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-bold text-gray-800">
          {dayReservations.length}건의 예약
          {dayGoogleEvents.length > 0 && <span className="text-blue-500 ml-2">+ Google {dayGoogleEvents.length}건</span>}
        </p>
        <div className="flex items-center gap-3">
          {staffList.map(s => (
            <div key={s.id} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }}></span>
              {s.name}
            </div>
          ))}
        </div>
      </div>
      <div className="overflow-y-auto max-h-[600px]">
        {TIME_SLOTS.map(time => {
          const slotRes = dayReservations.filter(r => r.startTime === time);
          const slotGoogle = dayGoogleEvents.filter(ge => ge.startTime === time);
          return (
            <div key={time} className="flex border-b border-gray-50 min-h-[60px]">
              <div className="w-20 flex-shrink-0 py-3 px-4 text-xs text-gray-400 border-r border-gray-100 font-medium">
                {time}
              </div>
              <div className="flex-1 p-2 flex gap-2 flex-wrap">
                {slotRes.map(r => {
                  const staff = staffList.find(s => s.id === r.staffId);
                  return (
                    <button
                      key={r.id}
                      onClick={() => onSelect(r)}
                      className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-[1.02] shadow-sm"
                      style={{ backgroundColor: staff?.color || '#8B5CF6' }}
                    >
                      <span className="font-bold">{r.customerName}</span>
                      <span className="text-white/80 text-xs">{r.services.map(s => s.serviceName).join(', ')}</span>
                      <span className="text-white/70 text-xs">{r.staffName}</span>
                    </button>
                  );
                })}
                {slotGoogle.map(ge => (
                  <a
                    key={`g-${ge.id}`}
                    href={ge.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-white bg-blue-500 transition-all hover:scale-[1.02] shadow-sm"
                  >
                    <Calendar size={14} className="flex-shrink-0" />
                    <span className="font-bold">{ge.summary}</span>
                    <span className="text-white/80 text-xs">{ge.startTime}~{ge.endTime}</span>
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({ reservations, onSelect, googleEvents = [] }: { reservations: Reservation[]; onSelect: (r: Reservation) => void; googleEvents?: GoogleEventLike[] }) {
  const sorted = [...reservations].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="divide-y divide-gray-50">
        {sorted.map(r => (
          <button
            key={r.id}
            onClick={() => onSelect(r)}
            className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors text-left"
          >
            <div className="text-center w-20 flex-shrink-0">
              <p className="text-xs font-medium text-gray-500">{r.date.slice(5).replace('-', '/')}</p>
              <p className="text-sm font-bold text-purple-600 mt-0.5">{r.startTime}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">{r.customerName[0]}</span>
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
              <p className="text-sm font-bold text-gray-800">{r.totalPrice.toLocaleString()}원</p>
              <p className="text-xs text-gray-400 mt-0.5">{r.startTime} ~ {r.endTime}</p>
            </div>
            <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
          </button>
        ))}
        {/* Google Calendar 이벤트 */}
        {googleEvents.map(ge => (
          <a
            key={`g-${ge.id}`}
            href={ge.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-4 px-6 py-4 hover:bg-blue-50/50 transition-colors text-left"
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

function AddReservationModal({ reservation: editing, onClose, onSave }: { reservation?: Reservation | null; onClose: () => void; onSave: () => void }) {
  const { user: authUser } = useAuth();
  const isEdit = !!editing;
  const customers = CustomerStore.getAll();
  const staffList = StaffStore.getAll();
  const services = ServiceStore.getAll().filter(s => s.isActive);

  const [customerId, setCustomerId] = useState(editing?.customerId ?? '');
  const [staffId, setStaffId] = useState(editing?.staffId ?? '');
  const [serviceId, setServiceId] = useState(editing?.services?.[0]?.serviceId ?? '');
  const [date, setDate] = useState(editing?.date ?? format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState(editing?.startTime ?? '10:00');
  const [source, setSource] = useState<Reservation['source']>(editing?.source ?? 'manual');
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [addToGoogle, setAddToGoogle] = useState(!isEdit && isGoogleCalendarConnected());
  const googleAvailable = isGoogleCalendarConnected();
  const [formError, setFormError] = useState('');

  const handleSave = () => {
    // 조용한 실패 금지 — 무엇이 비었는지 명확히 안내
    if (!customerId || !staffId || !serviceId) {
      const missing = [
        !customerId && '고객',
        !staffId && '담당 직원',
        !serviceId && '시술',
      ].filter(Boolean).join(', ');
      const guide = [
        staffList.length === 0 && !staffId ? '등록된 직원이 없습니다 — 직원 관리에서 먼저 등록해주세요.' : '',
        services.length === 0 && !serviceId ? '등록된 시술이 없습니다 — 설정 > 시술 관리에서 먼저 등록해주세요.' : '',
      ].filter(Boolean).join(' ');
      setFormError(`${missing}을(를) 선택해주세요. ${guide}`.trim());
      return;
    }
    setFormError('');

    const customer = customers.find(c => c.id === customerId);
    const staff = staffList.find(s => s.id === staffId);
    const service = services.find(s => s.id === serviceId);
    if (!customer || !staff || !service) return;

    // Calculate endTime from service duration
    const [h, m] = startTime.split(':').map(Number);
    const startDate = new Date(2000, 0, 1, h, m);
    const endDate = addMinutes(startDate, service.duration);
    const endTime = format(endDate, 'HH:mm');

    // 이중예약 방지 — 같은 담당자·같은 날 시간대 겹침 검사 (취소/노쇼·본인 제외)
    const overlap = ReservationStore.getAll().find(r =>
      r.id !== editing?.id &&
      r.staffId === staff.id &&
      r.date === date &&
      r.status !== 'cancelled' && r.status !== 'noshow' &&
      startTime < r.endTime && endTime > r.startTime
    );
    if (overlap) {
      const proceed = window.confirm(
        `${staff.name} 담당자가 그 시간(${overlap.startTime}~${overlap.endTime}, ${overlap.customerName})에 이미 예약이 있습니다.\n그래도 등록하시겠습니까?`
      );
      if (!proceed) return;
    }

    const reservation: Omit<Reservation, 'id'> = {
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      staffId: staff.id,
      staffName: staff.name,
      services: [{
        serviceId: service.id,
        serviceName: service.name,
        price: service.price,
        duration: service.duration,
      }],
      date,
      startTime,
      endTime,
      status: editing?.status ?? 'confirmed',
      source,
      memo: memo || undefined,
      totalPrice: service.price,
    };

    if (isEdit && editing) {
      // 수정: 기존 예약 갱신 (상태·네이버ID 등 보존)
      ReservationStore.update(editing.id, reservation);
      // Google 캘린더에 옛 정보가 남지 않도록 기존 이벤트 삭제 후 재생성
      const oldEventId = getGcalMap()[editing.id];
      if (oldEventId && isGoogleCalendarConnected()) {
        deleteCalendarEvent(oldEventId).catch(() => { /* best-effort */ });
        createCalendarEvent({ ...reservation, id: editing.id } as Reservation)
          .then(ev => rememberGcalEvent(editing.id, ev.id))
          .catch(() => { /* Google 동기화 실패해도 CRM 예약은 저장됨 */ });
      }
    } else {
      const saved = ReservationStore.save(reservation);
      // Google Calendar에도 추가 — 이벤트 id를 기억해 취소/삭제 시 정리 가능하게
      if (addToGoogle && googleAvailable && saved) {
        createCalendarEvent({ ...reservation, id: saved.id })
          .then(ev => rememberGcalEvent(saved.id, ev.id))
          .catch(() => {
            // Google Calendar 동기화 실패해도 CRM 예약은 저장됨
          });
      }
    }
    onSave();
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={isEdit ? '예약 수정' : '예약 추가'} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">고객 *</label>
            <select
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="">고객 선택</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({maskPhone(c.phone, authUser?.role ?? 'staff')})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">담당 직원 *</label>
            <select
              value={staffId}
              onChange={e => setStaffId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="">직원 선택</option>
              {staffList.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">시술 *</label>
          <select
            value={serviceId}
            onChange={e => setServiceId(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            <option value="">시술 선택</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name} ({s.duration}분 / {s.price.toLocaleString()}원)</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">날짜 *</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">시작 시간 *</label>
            <select
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">예약 경로</label>
            <select
              value={source}
              onChange={e => setSource(e.target.value as Reservation['source'])}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
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
          <textarea
            rows={2}
            value={memo}
            onChange={e => setMemo(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
            placeholder="특이사항"
          />
        </div>
        {googleAvailable && !isEdit && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={addToGoogle}
              onChange={e => setAddToGoogle(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-300"
            />
            <Calendar size={14} className="text-blue-500" />
            <span className="text-sm text-gray-700">Google 캘린더에도 추가</span>
          </label>
        )}
        {formError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {formError}
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">취소</button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all shadow-md"
          >
            예약 저장
          </button>
        </div>
      </div>
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
  const handleCancel = () => {
    ReservationStore.updateStatus(r.id, 'cancelled');
    cleanupGcalEvent(r.id); // 취소된 예약은 Google 캘린더에서도 제거
    onUpdate();
  };

  const handleComplete = () => {
    ReservationStore.updateStatus(r.id, 'completed');
    // 완료 → 결제 브리지: 기존엔 상태만 바뀌고 매출에 잡히지 않아 Sales에서 수기 재입력이 필요했음
    if (r.totalPrice > 0) {
      const alreadyPaid = PaymentStore.getAll().some(p => p.referenceId === r.id);
      if (alreadyPaid) {
        alert('완료 처리했습니다. (이 예약의 결제는 이미 등록되어 있어 중복 등록하지 않았습니다)');
      } else if (window.confirm(
        `완료 처리했습니다.\n\n결제 ${r.totalPrice.toLocaleString()}원(카드)도 함께 등록할까요?\n` +
        `(금액·결제수단 수정은 매출 화면에서 가능합니다)`
      )) {
        PaymentStore.save({
          customerId: r.customerId,
          customerName: r.customerName,
          paymentDate: r.date,
          type: 'single_treatment',
          typeLabel: r.services.map(s => s.serviceName).join(', ') || '시술',
          referenceId: r.id,
          amount: r.totalPrice,
          paymentMethod: '카드',
          discountAmount: 0,
          status: 'completed',
          memo: '예약 완료 처리에서 자동 등록',
        });
      }
    }
    onUpdate();
  };

  const handleDelete = () => {
    if (window.confirm('이 예약을 삭제하시겠습니까?')) {
      ReservationStore.delete(r.id);
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
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
                <span className="text-white font-bold">{r.customerName[0]}</span>
              </div>
              <div>
                <p className="font-bold text-gray-900">{r.customerName}</p>
                <p className="text-xs text-gray-400">{maskPhone(r.customerPhone, user?.role ?? 'staff')}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <SourceBadge source={r.source} />
              <StatusBadge status={r.status} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <InfoItem label="날짜" value={r.date} />
          <InfoItem label="시간" value={`${r.startTime} ~ ${r.endTime}`} />
          <InfoItem label="담당자" value={r.staffName} />
          <InfoItem label="금액" value={`${r.totalPrice.toLocaleString()}원`} />
        </div>

        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">시술 내역</p>
          {r.services.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <span className="text-sm text-gray-700">{s.serviceName}</span>
              <span className="text-sm font-semibold text-gray-800">{s.price.toLocaleString()}원</span>
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

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleCancel}
            className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
          >
            취소처리
          </button>
          <button
            onClick={handleComplete}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-green-500 rounded-xl hover:bg-green-600 transition-colors"
          >
            완료처리
          </button>
          <button
            onClick={handleDelete}
            className="py-2.5 px-3 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors flex items-center gap-1"
          >
            <Trash2 size={14} /> 삭제
          </button>
          <button onClick={onEdit} className="flex-1 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all">수정</button>
        </div>
      </div>
    </Modal>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className="text-[11px] text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-800">{value}</p>
    </div>
  );
}
