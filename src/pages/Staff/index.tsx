import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { notify } from '../../lib/notify';
import { readableTextOn } from '../../lib/color';
import { Phone, Mail, Plus, Trash2, Edit3, Search, Users } from 'lucide-react';
import Header from '../../components/layout/Header';
import Modal from '../../components/ui/Modal';
import StaffPerformanceCard from '../../components/StaffPerformanceCard';
import { StaffStore, ReservationStore, TreatmentLogStore } from '../../lib/store';
import { todayISO, thisYearMonthISO, formatPhoneInput, formatPrice } from '../../lib/format';
import type { Staff } from '../../types';

const SPECIALTY_OPTIONS = ['피부관리', '바디관리', '왁싱', '각질관리'];
// 과거 저장 데이터의 '마사지' 전문분야는 '바디관리'로 표시 (2026-07-30 명칭 변경)
const normalizeSpecialty = (s: string) => (s === '마사지' ? '바디관리' : s);
const COLOR_OPTIONS = ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#6366F1', '#14B8A6'];
// 색상 버튼의 읽는 이름 — 화면 낭독기가 hex를 글자 단위로 읽지 않게 (리뷰 2026-11-19)
const COLOR_NAMES: Record<string, string> = { '#8B5CF6': '보라', '#EC4899': '분홍', '#F59E0B': '주황', '#10B981': '초록', '#3B82F6': '파랑', '#EF4444': '빨강', '#6366F1': '남보라', '#14B8A6': '청록' };

// 로컬(KST) 기준 — toISOString()은 UTC라 0~9시(KST)에 전날/지난달로 어긋남 (Sales 페이지와 동일 수정)
function getToday() {
  return todayISO();
}

function getYearMonth() {
  return thisYearMonthISO();
}

export default function StaffPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  // 첫 설정 체크리스트·예약 안내(/staff?new=1) → 바로 추가 모달, 1회 캡처 후 URL 정리 (2026-11-18)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('new') === '1') { setShowAddModal(true); setSearchParams({}, { replace: true }); }
  }, [searchParams, setSearchParams]);
  const [selected, setSelected] = useState<Staff | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [reloadTick, setReloadTick] = useState(0); // 직원 추가·수정·삭제 후 실적 표 재집계 (2026-11-18)

  const reload = () => {
    setStaffList(StaffStore.getAll());
    setReloadTick(t => t + 1);
  };

  useEffect(() => {
    reload();
  }, []);

  const today = getToday();
  const yearMonth = getYearMonth();
  // 통계는 취소/노쇼 제외 (직원 성과 부풀림 방지)
  const isActiveRes = (r: { status: string }) => r.status !== 'cancelled' && r.status !== 'noshow';
  const allReservations = ReservationStore.getAll().filter(isActiveRes);
  const todayReservations = allReservations.filter(r => r.date === today);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredStaff = staffList.filter(staff => {
    const statusMatches = statusFilter === 'all'
      || (statusFilter === 'active' ? staff.isActive : !staff.isActive);
    const searchMatches = !normalizedSearch || [
      staff.name,
      staff.role,
      staff.phone,
      staff.email || '',
      ...staff.specialty,
    ].some(value => value.toLowerCase().includes(normalizedSearch));
    return statusMatches && searchMatches;
  });

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="직원 관리"
        subtitle={`총 ${staffList.length}명`}
        action={{ label: '직원 추가', onClick: () => setShowAddModal(true) }}
      />

      <div className="p-4 sm:p-6 lg:p-8 flex-1">
        <div className="bg-white rounded-2xl border border-gray-100 p-3 mb-5 flex flex-col md:flex-row gap-3 md:items-center">
          <label className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="직원명, 역할, 연락처, 전문분야 검색"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none"
              aria-label="직원 검색"
            />
          </label>
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl overflow-x-auto no-scrollbar pr-6">
            {([
              ['active', '재직'],
              ['inactive', '퇴사·비활성'],
              ['all', '전체'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium ${statusFilter === value ? 'bg-white text-[#1a3a8f] shadow-sm' : 'text-gray-600'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap">{filteredStaff.length}명 표시</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {filteredStaff.map(staff => {
            const staffTodayRes = todayReservations.filter(r => r.staffId === staff.id);
            const monthlyRevenue = allReservations
              .filter(r => r.staffId === staff.id && r.date.startsWith(yearMonth))
              .reduce((s, r) => s + r.totalPrice, 0);

            return (
              <div
                key={staff.id}
                onClick={() => setSelected(staff)}
                className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md cursor-pointer transition-all hover:-translate-y-0.5"
              >
                <div className="text-center mb-5">
                  <div
                    className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center text-2xl font-bold shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${staff.color}, ${staff.color}cc)`, color: readableTextOn(staff.color) }}
                  >
                    {staff.name[0]}
                  </div>
                  <h3 className="text-base font-bold text-gray-900">{staff.name}{!staff.isActive && <span className="ml-1.5 align-middle text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">퇴사</span>}</h3>
                  <p className="text-xs text-slate-600 mt-0.5">{staff.role}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                    <p className="text-base font-bold text-gray-800">{staffTodayRes.length}</p>
                    <p className="text-xs text-gray-400">오늘 예약</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-2.5 text-center" title="완료·예정 포함, 취소·노쇼 제외">
                    <p className="text-base font-bold text-gray-800">{formatPrice(monthlyRevenue)}</p>
                    <p className="text-xs text-gray-400 whitespace-nowrap" title="이달 예약표 금액 합(예정·미완료 포함, 취소·노쇼 제외) — 실적표의 완료 예약액·실결제액과 다릅니다">월 예약액(예정 포함)</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {staff.specialty.map(s => (
                    <span key={s} className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs font-medium">{normalizeSpecialty(s)}</span>
                  ))}
                </div>

                <div className="space-y-1.5 text-xs text-gray-500">
                  {staff.phone && (
                    <div className="flex items-center gap-2">
                      <Phone size={11} className="text-gray-400" />
                      {staff.phone}
                    </div>
                  )}
                  {staff.email && (
                    <div className="flex items-center gap-2">
                      <Mail size={11} className="text-gray-400" />
                      {staff.email}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredStaff.length === 0 && (
            <div className="md:col-span-2 xl:col-span-4 bg-white rounded-2xl border border-gray-100 py-14 text-center">
              <Users size={36} className="text-gray-200 mx-auto mb-3" />
              {staffList.length === 0 ? (
                <>
                  <p className="text-sm font-medium text-gray-500">아직 직원이 없습니다</p>
                  <p className="text-xs text-gray-400 mt-1">예약과 시술 기록의 담당자로 쓰입니다 — 옆의 [직원 추가]로 등록하세요 (원장님 본인도 포함)</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-500">조건에 맞는 직원이 없어요</p>
                  <p className="text-xs text-gray-400 mt-1">검색어나 재직 상태를 바꿔보세요</p>
                </>
              )}
            </div>
          )}

          {/* Add Staff Card */}
          <button
            onClick={() => setShowAddModal(true)}
            className="hidden lg:flex bg-white rounded-2xl p-5 border-2 border-dashed border-gray-200 hover:border-primary-300 transition-colors flex-col items-center justify-center gap-3 text-gray-400 hover:text-primary-500 min-h-[120px] md:min-h-[280px]"
          >
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <Plus size={20} />
            </div>
            <span className="text-sm font-medium">직원 추가</span>
          </button>
        </div>

        <StaffPerformanceCard tick={reloadTick} />

        {/* Staff Schedule Overview */}
        <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">오늘 직원별 예약 현황</h3>
          </div>
          <div className="p-6 space-y-4">
            {filteredStaff.map(staff => {
              const todayRes = todayReservations.filter(r => r.staffId === staff.id);
              return (
                <div key={staff.id} className="flex items-center gap-4">
                  <div className="flex items-center gap-2 w-28 flex-shrink-0">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: staff.color }}></span>
                    <span className="text-sm font-medium text-gray-700">{staff.name}</span>
                  </div>
                  <div className="flex-1 flex gap-2 flex-wrap">
                    {todayRes.length === 0 ? (
                      <span className="text-xs text-gray-500">예약 없음</span>
                    ) : (
                      todayRes.map(r => (
                        <div
                          key={r.id}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ backgroundColor: staff.color, color: readableTextOn(staff.color) }}
                        >
                          <span>{r.startTime}</span>
                          <span>{r.customerName}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showAddModal && (
        <AddStaffModal
          onClose={() => setShowAddModal(false)}
          onSave={() => {
            reload();
            setShowAddModal(false);
          }}
        />
      )}
      {selected && (
        <StaffDetailModal
          staff={selected}
          onClose={() => setSelected(null)}
          onUpdate={() => {
            reload();
            setSelected(null);
          }}
          onDelete={() => {
            reload();
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function AddStaffModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('피부관리사');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [hireDate, setHireDate] = useState(getToday());
  const [specialty, setSpecialty] = useState<string[]>([]);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);

  const toggleSpecialty = (s: string) => {
    setSpecialty(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const handleSave = () => {
    if (!name.trim() || !phone.trim()) {
      notify('이름과 전화번호는 필수입니다.');
      return;
    }
    if (StaffStore.getAll().some(s => s.isActive && s.name.trim() === name.trim())) {
      notify('같은 이름의 재직 직원이 이미 있습니다. 시술·제품 판매 기록을 이름으로 구분하므로 다른 이름(예: 김수아B)으로 등록해주세요.');
      return;
    }
    StaffStore.save({
      name: name.trim(),
      role,
      phone: phone.trim(),
      email: email.trim() || undefined,
      specialty,
      color,
      isActive: true,
      hireDate,
    });
    onSave();
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="직원 추가" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">이름 *</label>
            <input
              type="text"
              aria-label="이름"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
              placeholder="이름 입력"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">역할 *</label>
            <select
              aria-label="역할"
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              <option value="대표">대표</option>
              <option value="원장">원장</option>
              <option value="부원장">부원장</option>
              <option value="실장">실장</option>
              <option value="피부관리사">피부관리사</option>
              <option value="에스테티션">에스테티션</option>
              <option value="테라피스트">테라피스트</option>
              <option value="상담팀">상담팀</option>
              <option value="마케팅팀">마케팅팀</option>
              <option value="매니저">매니저</option>
              <option value="인턴">인턴</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">전화번호 *</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(formatPhoneInput(e.target.value))}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
            placeholder="010-0000-0000"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">이메일</label>
          <input
            type="email"
            aria-label="이메일"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">입사일</label>
          <input
            type="date"
            aria-label="입사일"
            value={hireDate}
            onChange={e => setHireDate(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
        </div>

        {/* Specialty multi-select */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">전문 분야</label>
          <div className="flex flex-wrap gap-2">
            {SPECIALTY_OPTIONS.map(s => (
              <label
                key={s}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer border transition-colors ${
                  specialty.includes(s)
                    ? 'bg-purple-100 text-purple-700 border-purple-300'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={specialty.includes(s)}
                  onChange={() => toggleSpecialty(s)}
                  className="sr-only"
                />
                {s}
              </label>
            ))}
          </div>
        </div>

        {/* Color picker */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">색상</label>
          <div className="flex gap-2">
            {COLOR_OPTIONS.map(c => (
              <button
                key={c}
                type="button"
                aria-label={`색상 ${COLOR_NAMES[c] ?? c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  color === c ? 'border-gray-800 scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">취소</button>
          <button onClick={handleSave} className="flex-1 py-2.5 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl transition-colors">저장</button>
        </div>
      </div>
    </Modal>
  );
}

function StaffDetailModal({
  staff,
  onClose,
  onUpdate,
  onDelete,
}: {
  staff: Staff;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(staff.name);
  const [role, setRole] = useState(staff.role);
  const [phone, setPhone] = useState(staff.phone);
  const [email, setEmail] = useState(staff.email || '');
  const [hireDate, setHireDate] = useState(staff.hireDate);
  const [specialty, setSpecialty] = useState<string[]>(staff.specialty.map(normalizeSpecialty));
  const [color, setColor] = useState(staff.color);

  const yearMonth = getYearMonth();
  // 통계는 취소/노쇼 제외
  const allReservations = ReservationStore.getAll().filter(r => r.status !== 'cancelled' && r.status !== 'noshow');
  const staffReservations = allReservations.filter(r => r.staffId === staff.id);
  const monthRevenue = allReservations
    .filter(r => r.staffId === staff.id && r.date.startsWith(yearMonth))
    .reduce((s, r) => s + r.totalPrice, 0);

  const toggleSpecialty = (s: string) => {
    setSpecialty(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const handleUpdate = () => {
    if (!name.trim() || !phone.trim()) {
      notify('이름과 전화번호는 필수입니다.');
      return;
    }
    const newName = name.trim();
    if (StaffStore.getAll().some(s => s.id !== staff.id && s.isActive && s.name.trim() === newName)) {
      notify('같은 이름의 재직 직원이 이미 있습니다. 다른 이름으로 저장해주세요.');
      return;
    }
    if (newName !== staff.name) {
      // 시술 기록은 담당자를 이름으로 들고 있어 함께 고친다(실적 표 연결 유지). 제품 판매는 코어에 수정 API가 없어 옛 이름으로 남는다.
      // 같은 이름의 다른 직원(퇴사자 포함)이 있으면 이름 매칭이 그 사람의 기록까지 빼앗으므로 시술 기록은 건드리지 않는다 (11차 #H5)
      const sameName = StaffStore.getAll().some(s => s.id !== staff.id && s.name.trim() === staff.name.trim());
      const logs = sameName ? [] : TreatmentLogStore.getAll().filter(t => t.staffName === staff.name);
      logs.forEach(t => TreatmentLogStore.update(t.id, { staffName: newName }));
      if (sameName) notify('같은 이름의 다른 직원이 있어 과거 시술 기록의 담당자 이름은 바꾸지 않았습니다(기록은 그 직원 이름으로 남습니다).');
      // 예약도 담당자 이름을 비정규화해 들고 있다(타임라인·완료 누락 카드·예약 카드 표시) (정합성 감사 2026-11-19)
      const resv = ReservationStore.getAll().filter(r => r.staffId === staff.id && r.staffName !== newName);
      resv.forEach(r => ReservationStore.update(r.id, { staffName: newName }));
      if (logs.length > 0 || resv.length > 0) notify(`시술 기록 ${logs.length}건·예약 ${resv.length}건의 담당자 이름도 '${newName}'(으)로 바꿨습니다.`);
    }
    StaffStore.update(staff.id, {
      name: name.trim(),
      role,
      phone: phone.trim(),
      email: email.trim() || '', // '' — 서버 PATCH가 실제로 지우게 (undefined는 키 제외)
      specialty,
      color,
      hireDate,
    });
    onUpdate();
  };

  // 퇴사 처리/복직 — 삭제 대신 isActive만 바꿔 과거 예약·시술·실적의 담당자 연결을 유지한다 (2026-11-18)
  const handleToggleActive = () => {
    const leaving = staff.isActive;
    // 복직도 추가·수정과 같은 규칙 — 같은 이름의 재직자가 둘이면 이름으로 잇는 시술·판매 기록이 구분되지 않는다 (리뷰 2026-11-19)
    if (!leaving && StaffStore.getAll().some(s => s.id !== staff.id && s.isActive && s.name.trim() === staff.name.trim())) {
      notify('같은 이름의 재직 직원이 이미 있어 복직할 수 없습니다. 이 직원의 [수정]에서 이름을 구분되게(예: 김수아B) 바꾼 뒤 복직해주세요.');
      return;
    }
    const futureRes = leaving ? ReservationStore.getAll().filter(r => r.staffId === staff.id && r.date >= todayISO() && (r.status === 'confirmed' || r.status === 'pending')).length : 0;
    if (!window.confirm(leaving
      ? `"${staff.name}" 직원을 퇴사 처리할까요?${futureRes > 0 ? `\n앞으로의 예약 ${futureRes}건은 담당자가 이 직원으로 남고 그 시간은 계속 잡혀 있습니다 — 예약 화면에서 담당자를 바꿔주세요.` : ''}\n새 예약·시술의 담당자 목록에서 빠지고, 과거 기록과 실적은 그대로 남습니다. 언제든 복직할 수 있습니다.`
      : `"${staff.name}" 직원을 복직 처리할까요?`)) return;
    StaffStore.update(staff.id, { isActive: !leaving });
    if (leaving) notify.info('퇴사 처리했습니다.'); else notify.success('복직 처리했습니다.');
    onUpdate();
  };
  const handleDelete = () => {
    const linkedRes = ReservationStore.getAll().filter(r => r.staffId === staff.id).length;
    const linkedLogs = TreatmentLogStore.getAll().filter(t => t.staffName === staff.name).length;
    const detail = linkedRes + linkedLogs > 0
      ? `\n연결된 예약 ${linkedRes}건·시술 기록 ${linkedLogs}건은 남지만 담당자 연결이 끊겨 직원 실적·필터에서 빠집니다. 퇴사한 직원이라면 [퇴사 처리]를 권장합니다.`
      : '';
    if (!window.confirm(`"${staff.name}" 직원을 삭제할까요?${detail}\n복구할 수 없습니다.`)) return;
    StaffStore.delete(staff.id);
    onDelete();
  };

  if (editing) {
    return (
      <Modal isOpen={true} onClose={onClose} title="직원 수정" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">이름 *</label>
              <input
                type="text"
                aria-label="이름"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">역할 *</label>
              <select
                aria-label="역할"
                value={role}
                onChange={e => setRole(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
              >
                <option value="대표">대표</option>
                <option value="원장">원장</option>
                <option value="부원장">부원장</option>
                <option value="실장">실장</option>
                <option value="피부관리사">피부관리사</option>
                <option value="에스테티션">에스테티션</option>
                <option value="테라피스트">테라피스트</option>
                <option value="상담팀">상담팀</option>
                <option value="마케팅팀">마케팅팀</option>
                <option value="매니저">매니저</option>
                  <option value="인턴">인턴</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">전화번호 *</label>
            <input
              type="tel"
              aria-label="전화번호"
              placeholder="010-0000-0000"
              value={phone}
              onChange={e => setPhone(formatPhoneInput(e.target.value))}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">이메일</label>
            <input
              type="email"
              aria-label="이메일"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">입사일</label>
            <input
              type="date"
              aria-label="입사일"
              value={hireDate}
              onChange={e => setHireDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">전문 분야</label>
            <div className="flex flex-wrap gap-2">
              {SPECIALTY_OPTIONS.map(s => (
                <label
                  key={s}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer border transition-colors ${
                    specialty.includes(s)
                      ? 'bg-purple-100 text-purple-700 border-purple-300'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={specialty.includes(s)}
                    onChange={() => toggleSpecialty(s)}
                    className="sr-only"
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">색상</label>
            <div className="flex gap-2">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c}
                  type="button"
                  aria-label={`색상 ${COLOR_NAMES[c] ?? c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    color === c ? 'border-gray-800 scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setEditing(false)} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">취소</button>
            <button onClick={handleUpdate} className="flex-1 py-2.5 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl transition-colors">저장</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="직원 상세" size="md">
      <div className="space-y-4">
        <div className="text-center">
          <div
            className="w-20 h-20 rounded-2xl mx-auto mb-3 flex items-center justify-center text-3xl font-bold shadow-xl"
            style={{ background: `linear-gradient(135deg, ${staff.color}, ${staff.color}cc)`, color: readableTextOn(staff.color) }}
          >
            {staff.name[0]}
          </div>
          <h3 className="text-lg font-bold text-gray-900">{staff.name}{!staff.isActive && <span className="ml-2 align-middle text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">퇴사</span>}</h3>
          <p className="text-sm text-slate-600">{staff.role}</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-purple-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-purple-700">{staffReservations.length}</p>
            <p className="text-xs text-purple-700 mt-0.5">총 예약</p>
          </div>
          <div className="bg-pink-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-pink-700">{formatPrice(monthRevenue)}</p>
            <p className="text-xs text-pink-700 mt-0.5">이번달 예약액(예정 포함)</p>
            <p className="text-2xs text-pink-700">(완료·예정 포함, 취소·노쇼 제외)</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-blue-700">{staff.hireDate.split('-')[0]}</p>
            <p className="text-xs text-blue-700 mt-0.5">입사년도</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">전문 분야</p>
          <div className="flex flex-wrap gap-2">
            {staff.specialty.map(s => (
              <span key={s} className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-sm font-medium">{normalizeSpecialty(s)}</span>
            ))}
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-gray-600"><Phone size={14} /> {staff.phone}</div>
          {staff.email && <div className="flex items-center gap-2 text-gray-600"><Mail size={14} /> {staff.email}</div>}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleToggleActive}
            className={`flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors ${staff.isActive ? 'text-gray-600 bg-gray-100 hover:bg-gray-200' : 'text-green-700 bg-green-50 hover:bg-green-100'}`}
            title={staff.isActive ? '담당자 목록에서 빼고 기록·실적은 유지' : '다시 재직으로'}
          >
            {staff.isActive ? '퇴사 처리' : '복직'}
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
          >
            <Trash2 size={14} />
            삭제
          </button>
          <button
            onClick={() => setEditing(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl transition-colors"
          >
            <Edit3 size={14} />
            수정
          </button>
        </div>
      </div>
    </Modal>
  );
}
