import { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, LayoutGrid, List, RefreshCw, Clock, Trash2 } from 'lucide-react';
import { format, addDays, subDays, startOfWeek, addWeeks, subWeeks, isSameDay, parseISO, addMinutes } from 'date-fns';
import { ko } from 'date-fns/locale';
import Header from '../../components/layout/Header';
import { StatusBadge, SourceBadge } from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { ReservationStore, StaffStore, ServiceStore, CustomerStore } from '../../lib/store';
import type { Reservation, Staff, Service, Customer } from '../../types';
import clsx from 'clsx';

const TIME_SLOTS = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];

type ViewMode = 'week' | 'day' | 'list';

export default function Reservations() {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>(() => ReservationStore.getAll());
  const [staffList] = useState<Staff[]>(() => StaffStore.getAll());

  const reloadReservations = useCallback(() => {
    setReservations(ReservationStore.getAll());
  }, []);

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

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="예약 관리"
        subtitle="예약 현황 및 일정 관리"
        action={{ label: '예약 추가', onClick: () => setShowAddModal(true) }}
      />

      <div className="p-8 flex-1">
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
            {/* Naver sync badge */}
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-xs font-medium text-green-700">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
              네이버 예약 동기화
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

        {/* Calendar Views */}
        {viewMode === 'week' && (
          <WeekView weekDays={weekDays} reservations={reservations} staffList={staffList} onSelect={setSelectedReservation} />
        )}
        {viewMode === 'day' && (
          <DayView date={currentDate} reservations={reservations} staffList={staffList} onSelect={setSelectedReservation} />
        )}
        {viewMode === 'list' && (
          <ListView reservations={reservations} onSelect={setSelectedReservation} />
        )}
      </div>

      {showAddModal && (
        <AddReservationModal onClose={() => setShowAddModal(false)} onSave={handleSaveReservation} />
      )}
      {selectedReservation && (
        <ReservationDetailModal
          reservation={selectedReservation}
          onClose={() => setSelectedReservation(null)}
          onUpdate={handleUpdateReservation}
          onDelete={handleDeleteReservation}
        />
      )}
    </div>
  );
}

function WeekView({ weekDays, reservations, staffList, onSelect }: {
  weekDays: Date[];
  reservations: Reservation[];
  staffList: Staff[];
  onSelect: (r: Reservation) => void;
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
                <span className="text-[10px] text-purple-500 font-medium">{dayReservations.length}건</span>
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
                        className="w-full text-left rounded-lg p-1.5 text-[10px] font-medium text-white transition-opacity hover:opacity-80 shadow-sm"
                        style={{ backgroundColor: staff?.color || '#8B5CF6' }}
                      >
                        <p className="font-bold truncate">{r.customerName}</p>
                        <p className="opacity-80 truncate">{r.services[0]?.serviceName}</p>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayView({ date, reservations, staffList, onSelect }: {
  date: Date;
  reservations: Reservation[];
  staffList: Staff[];
  onSelect: (r: Reservation) => void;
}) {
  const dayReservations = reservations.filter(r => isSameDay(parseISO(r.date), date));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-bold text-gray-800">{dayReservations.length}건의 예약</p>
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({ reservations, onSelect }: { reservations: Reservation[]; onSelect: (r: Reservation) => void }) {
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
      </div>
    </div>
  );
}

function AddReservationModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const customers = CustomerStore.getAll();
  const staffList = StaffStore.getAll();
  const services = ServiceStore.getAll().filter(s => s.isActive);

  const [customerId, setCustomerId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('10:00');
  const [source, setSource] = useState<Reservation['source']>('manual');
  const [memo, setMemo] = useState('');

  const handleSave = () => {
    if (!customerId || !staffId || !serviceId) return;

    const customer = customers.find(c => c.id === customerId);
    const staff = staffList.find(s => s.id === staffId);
    const service = services.find(s => s.id === serviceId);
    if (!customer || !staff || !service) return;

    // Calculate endTime from service duration
    const [h, m] = startTime.split(':').map(Number);
    const startDate = new Date(2000, 0, 1, h, m);
    const endDate = addMinutes(startDate, service.duration);
    const endTime = format(endDate, 'HH:mm');

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
      status: 'confirmed',
      source,
      memo: memo || undefined,
      totalPrice: service.price,
    };

    ReservationStore.save(reservation);
    onSave();
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="예약 추가" size="lg">
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
              {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
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

function ReservationDetailModal({ reservation: r, onClose, onUpdate, onDelete }: {
  reservation: Reservation;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const handleCancel = () => {
    ReservationStore.updateStatus(r.id, 'cancelled');
    onUpdate();
  };

  const handleComplete = () => {
    ReservationStore.updateStatus(r.id, 'completed');
    onUpdate();
  };

  const handleDelete = () => {
    if (window.confirm('이 예약을 삭제하시겠습니까?')) {
      ReservationStore.delete(r.id);
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
                <p className="text-xs text-gray-400">{r.customerPhone}</p>
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
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl">수정</button>
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
