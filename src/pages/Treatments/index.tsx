import { notify } from '../../lib/notify';
import { matchesSearch, todayISO, toISODate, parseISODate, formatDate, formatPrice } from '../../lib/format';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { usePhotoCacheVersion } from '../../hooks/usePhotoCache';
import { Search, ClipboardList, Camera, ChevronRight, Trash2, Pencil, X, Loader2 } from 'lucide-react';
import Header from '../../components/layout/Header';
import Modal from '../../components/ui/Modal';
import PrereqHint from '../../components/ui/PrereqHint';
import CustomerCombobox from '../../components/ui/CustomerCombobox';
import CustomerAlertLine from '../../components/CustomerAlertLine'; // 현장 주의사항 경고 (232, GAP C-11)
import DateQuickChips from '../../components/ui/DateQuickChips';
import PullToRefreshIndicator from '../../components/ui/PullToRefreshIndicator';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useDataRefreshed } from '../../hooks/useDataRefreshed';
import { refreshFromServer } from '../../lib/liveRefresh';
import { TreatmentLogStore, CustomerStore, StaffStore, ServiceStore, CustomerProgramStore, ReservationStore } from '../../lib/store';
import { healCustomerStatsWhenReady } from '../../lib/customerStats';
import { usedSessionsFor, healProgramSessionsWhenReady } from '../../lib/programSessions';
import { remainingSessions } from '../../lib/programSessionsRule';
import { appendProgramNote } from '../../lib/programNotes';
import type { TreatmentLog } from '../../types';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { canOpenRoute } from '../../lib/permissions';
import { isISODate } from '../../lib/inputRules';
import { getPhotos, getPhotosAsync, getPhotoCount, setPhotos as savePhotos, clearPhotos, resizeImageFile, makePhotoId, syncPhotosFromNas, PHOTO_ANGLES, PHOTO_LABELS, type PhotoEntry, type PhotoAngle, type PhotoLabel } from '../../lib/photoStore';
import { findReferencePhotos, angleLabel } from '../../lib/beforeAfter';
import CameraOverlay, { isCameraPreviewSupported } from '../../components/CameraOverlay';
import PhotoLightbox, { type LightboxPhoto } from '../../components/PhotoLightbox';
import { isAuthApiConfigured } from '../../lib/authApi';
import { getUsablePrograms, getExpiredPrograms, expiredProgramsHint, EXPIRED_LINK_BLOCKED } from '../../lib/customerPrograms';
import { hasPaymentFor } from '../../lib/pendingCompletion';

export default function Treatments() {
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const navigate = useNavigate();
  // 대시보드 빠른 작업(?new=1) → 바로 추가 모달
  const [searchParams, setSearchParams] = useSearchParams();
  // 예약 상세/대시보드에서 온 프리필은 1회만 캡처하고 URL을 비운다 — 닫은 뒤 수동으로 열거나 뒤로가기 했을 때 이전 예약 값이 다시 붙지 않게 (리뷰 2026-11-17)
  const [prefill, setPrefill] = useState<(TreatmentPrefill & { reservationId?: string }) | null>(null);
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setPrefill({
      customerId: searchParams.get('customer') ?? undefined,
      treatmentDate: searchParams.get('date') ?? undefined,
      staffName: searchParams.get('staff') ?? undefined,
      serviceNames: searchParams.getAll('services'), // 반복 키 — 쉼표가 든 메뉴명도 안전
      reservationId: searchParams.get('reservation') ?? undefined,
    });
    setShowAddModal(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  const [editing, setEditing] = useState<TreatmentLog | null>(null);
  const [selected, setSelected] = useState<TreatmentLog | null>(null);
  const [treatmentLogs, setTreatmentLogs] = useState<TreatmentLog[]>([]);
  // 고객 타임라인에서 /treatments?open=<id> → 해당 시술 상세를 바로 연다 (1회 캡처 후 URL 비움, 2026-11-18)
  useEffect(() => {
    const id = searchParams.get('open');
    if (!id) return;
    const log = TreatmentLogStore.getAll().find(t => t.id === id);
    if (log) setSelected(log);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const loadLogs = () => {
    setTreatmentLogs(TreatmentLogStore.getAll());
  };
  useDataRefreshed(loadLogs); // (16차 #H3)
  const pull = usePullToRefresh(async () => { await refreshFromServer({ force: true }); loadLogs(); }); // 모바일: 맨 위에서 당겨서 새로고침 — 서버부터
  // 목록 표시용 사진 장수 — base64 캐시를 매 렌더·매 키 입력마다 파싱하지 않도록 목록이 바뀔 때만 계산
  const photoCacheVersion = usePhotoCacheVersion(); // IndexedDB 캐시 적재·동기화 후 장수 갱신

  useEffect(() => {
    loadLogs();
    // 다른 기기에서 올린 사진을 NAS에서 내려받아 반영
    const keys = TreatmentLogStore.getAll().map(t => `treatment:${t.id}`);
    syncPhotosFromNas(keys).then(({ changed }) => {
      if (changed) setTreatmentLogs([...TreatmentLogStore.getAll()]);
    });
  }, []);

  // 기간·담당자 필터 (2026-11-18) — PC·모바일 공용 칩. 기간은 달력 단위(오늘/이번 주 월~일/이번 달 1일~말일, 로컬 날짜) — 미리 입력한 미래 기록도 그 기간 안이면 보인다
  const [period, setPeriod] = useState<Period>('all');
  const [staffFilter, setStaffFilter] = useState('');
  const staffNames = useMemo(() => {
    const fromStaff = StaffStore.getAll().filter(s => s.isActive).map(s => s.name);
    const fromLogs = treatmentLogs.map(t => t.staffName).filter((n): n is string => !!n);
    return [...new Set([...fromStaff, ...fromLogs])];
  }, [treatmentLogs]);
  const today = todayISO(); // 렌더마다 계산 — 자정을 넘겨 켜 둔 PC에서도 다음 렌더부터 새 날짜
  // 입력·필터·목록이 바뀔 때만 (15,000건을 매 키 입력마다 정렬하지 않게, 성능 감사 2026-11-18)
  const filtered = useMemo(() => {
    const range = periodRange(period, today);
    return treatmentLogs
      .filter(t => matchesSearch(search, [t.customerName, t.staffName, t.treatmentDetails, t.programName]))
      .filter(t => !range || (t.treatmentDate >= range.from && t.treatmentDate <= range.to))
      .filter(t => !staffFilter || t.staffName === staffFilter)
      .sort((a, b) => b.treatmentDate.localeCompare(a.treatmentDate)); // 최신 시술 먼저
  }, [treatmentLogs, search, period, staffFilter, today]);
  // 목록은 100건씩 — 전부 마운트하면 수백 건부터 폰에서 버벅인다. 검색·필터가 바뀌면 처음부터
  const [listLimit, setListLimit] = useState(LIST_PAGE);
  useEffect(() => { setListLimit(LIST_PAGE); }, [search, period, staffFilter]);
  const visible = useMemo(() => filtered.slice(0, listLimit), [filtered, listLimit]);
  // 목록 표시용 사진 장수 — 보이는 행만 (장수 0인 기록은 IndexedDB 조회를 유발하므로 15,000건 전체를 묻지 않는다)
  const photoCounts = useMemo(
    () => new Map(visible.map(t => [t.id, getPhotoCount(`treatment:${t.id}`)])),
    [visible, photoCacheVersion],
  );

  const isFiltered = period !== 'all' || !!staffFilter || !!search.trim();
  const filterChips = (
    <div className="flex items-center gap-1.5 overflow-x-auto py-0.5" role="group" aria-label="시술 기록 필터">
      {PERIODS.map(p => (
        <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}
          className={clsx('flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border', period === p ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]' : 'bg-white text-gray-600 border-gray-200')}>
          {PERIOD_LABELS[p]}
        </button>
      ))}
      {staffNames.length > 0 && (
        <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} aria-label="담당 직원 필터"
          className="flex-shrink-0 ml-1 max-w-[9rem] truncate text-xs border border-gray-200 rounded-full px-2 py-1 bg-white text-gray-600">
          <option value="">담당 직원 전체</option>
          {staffNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      )}
      {isFiltered && (
        <button type="button" onClick={() => { setPeriod('all'); setStaffFilter(''); setSearch(''); }} className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-600 px-1">초기화</button>
      )}
    </div>
  );

  const handleDelete = (id: string) => {
    const log = TreatmentLogStore.getAll().find(t => t.id === id);
    TreatmentLogStore.delete(id);
    clearPhotos(`treatment:${id}`); // 연결된 사진도 정리
    // 회차권 원장 — 기록이 사라지면 차감 행도 사라지므로, 복원된 회차를 기록 줄로 남긴다 (146, GAP P-1)
    if (log?.customerProgramId && (log.sessionsUsed || 0) > 0) appendProgramNote(log.customerProgramId, `시술 기록 삭제 → ${log.sessionsUsed}회 복원 (${formatDate(log.treatmentDate)} 시술)`);
    setSelected(null);
    loadLogs();
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="시술 기록"
        subtitle="고객 시술 이력 관리"
        action={{ label: '시술 기록 추가', onClick: () => setShowAddModal(true) }}
      />

      {/* ── 모바일 뷰 (< lg) ── 타임라인 카드 */}
      <PullToRefreshIndicator {...pull} />
      <div className="block lg:hidden flex-1 flex flex-col">
        {/* 검색바 — 모바일 상단 덩어리 바로 아래에 붙는다 (7차 UX 점검 2026-11-20) */}
        <div className="sticky top-mobile-header z-10 bg-white border-b border-gray-100 px-4 py-3 shadow-sm">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="고객명, 시술명, 직원명 검색"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-4 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>
          <div className="mt-2">{filterChips}</div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <ClipboardList size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">{isFiltered ? '조건에 맞는 시술 기록이 없습니다' : '시술 기록이 없습니다'}</p>
              {isFiltered
                ? <button type="button" onClick={() => { setPeriod('all'); setStaffFilter(''); setSearch(''); }} className="mt-3 px-4 py-2 bg-slate-100 text-gray-700 rounded-xl text-sm font-medium">필터 초기화</button>
                : <button type="button" onClick={() => setShowAddModal(true)} className="mt-3 px-4 py-2 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium">시술 기록 추가하기</button>}
            </div>
          ) : (
            visible.map(t => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="w-full bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-bold">{(t.customerName || '?')[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{t.customerName}</p>
                      {t.programName && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700">
                          {t.programName}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {t.treatmentDetails || t.programName || '시술 내역 없음'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(t.treatmentDate)}{t.treatmentTime ? ` ${t.treatmentTime}` : ''} · {t.staffName || '담당자 미지정'}
                      {(photoCounts.get(t.id) ?? 0) > 0 && <span className="ml-1.5 text-indigo-600">· 사진 {photoCounts.get(t.id)}장</span>}
                    </p>
                    {t.skinCondition && (
                      <p className="text-xs text-primary-600 mt-1">피부상태: {t.skinCondition}</p>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
          {filtered.length > listLimit && (
            <button type="button" onClick={() => setListLimit(n => n + LIST_PAGE)}
              className="w-full py-3 text-sm font-medium text-[#1a3a8f] bg-white border border-gray-200 rounded-xl hover:bg-gray-50 min-h-[44px]">
              더 보기 ({filtered.length - listLimit}건 남음)
            </button>
          )}
        </div>
      </div>

      {/* ── 데스크톱 뷰 (lg+) ── 기존 테이블 그대로 */}
      <div className="hidden lg:block p-8 flex-1" data-testid="treatments-desktop">
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="고객명, 시술명, 직원명 검색"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-gray-700">{isFiltered ? '검색 결과' : '총'} {filtered.length}건</p>
            {filterChips}
          </div>
          <div className="divide-y divide-gray-50">
            {filtered.length === 0 && (
              <div className="px-6 py-12 text-center text-sm text-gray-400">
                {isFiltered ? '조건에 맞는 시술 기록이 없습니다' : '시술 기록이 없습니다. 관리 후 사진과 함께 남겨 두면 다음 방문 때 비교할 수 있습니다.'}
                {isFiltered
                  ? <button type="button" onClick={() => { setPeriod('all'); setStaffFilter(''); setSearch(''); }} className="block mx-auto mt-3 px-4 py-2 bg-slate-100 text-gray-700 rounded-xl text-xs font-medium hover:bg-slate-200">필터 초기화</button>
                  : <button type="button" onClick={() => setShowAddModal(true)} className="block mx-auto mt-3 px-4 py-2 bg-[#1a3a8f] text-white rounded-xl text-xs font-medium hover:bg-[#152f75]">첫 시술 기록 남기기</button>}
              </div>
            )}
            {visible.map(t => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="w-full flex items-start gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-sm font-bold">{(t.customerName || '?')[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm font-bold text-gray-900">{t.customerName}</p>
                    {t.programName && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700">
                        {t.programName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t.treatmentDetails || t.programName || '시술 내역 없음'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDate(t.treatmentDate)}{t.treatmentTime ? ` ${t.treatmentTime}` : ''} · {t.staffName || '담당자 미지정'}
                    {(photoCounts.get(t.id) ?? 0) > 0 && <span className="ml-1.5 text-indigo-600">· 사진 {photoCounts.get(t.id)}장</span>}
                  </p>
                  {t.skinCondition && (
                    <p className="text-xs text-primary-600 mt-1">피부상태: {t.skinCondition}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium text-gray-600">{t.customerProgramId ? `회차 차감 ${t.sessionsUsed}회` : '단건'}</p>
                </div>
                <ChevronRight size={16} className="text-gray-300 mt-1 flex-shrink-0" />
              </button>
            ))}
            {filtered.length > listLimit && (
              <button type="button" onClick={() => setListLimit(n => n + LIST_PAGE)}
                className="w-full py-3 text-sm font-medium text-[#1a3a8f] bg-white border border-gray-200 rounded-xl hover:bg-gray-50 min-h-[44px]">
                더 보기 ({filtered.length - listLimit}건 남음)
              </button>
            )}
          </div>
        </div>
      </div>

      {showAddModal && (
        <AddTreatmentModal
          prefill={prefill ?? undefined}
          onClose={() => { setShowAddModal(false); setPrefill(null); }}
          onSave={(result, savedDate) => {
            const reservationId = prefill?.reservationId;
            setShowAddModal(false);
            setPrefill(null);
            loadLogs();
            // 예약 상세 [시술 기록 작성]에서 온 기록을 저장했으면 그 예약은 완료 — 돌아가서 [완료처리]를 또 누르지 않게 (입력 속도 감사 2026-11-18)
            // 회차권 연결(금액 0) 저장도 포함(result 없음). 예약 날짜와 다른 날짜로 저장했으면 건드리지 않는다(방문 횟수 2중 증가, 리뷰)
            if (reservationId) {
              const r = ReservationStore.getAll().find(x => x.id === reservationId);
              if (r && (r.status === 'confirmed' || r.status === 'pending') && (!savedDate || r.date === savedDate)) {
                ReservationStore.updateStatus(reservationId, 'completed');
                healCustomerStatsWhenReady(r.customerId); // 완료 +1이 같은 날 시술 기록과 겹쳐 두 번 세지지 않게 — 하이드레이션 뒤 (리뷰 2026-11-19)
              }
            }
            // 예약 완료 처리에서 결제가 이미 등록된 건(referenceId=예약 id)이면 결제 연계를 다시 묻지 않는다
            const paidByReservation = !!reservationId && hasPaymentFor(reservationId); // 환불된 결제는 '등록됨'으로 치지 않는다 — 예약 상세와 같은 기준
            notify.success('시술 기록을 저장했습니다.'); // 회차권 연결 저장(result 없음)도 같은 안내 — 성공 안내와 결제 질문을 분리 — confirm의 [취소]가 저장 취소로 읽히지 않게 (6차 UX 감사 2026-11-20)
            if (result && !paidByReservation && window.confirm(`${result.customerName} 고객의 결제 ${formatPrice(result.amount)}을 지금 매출에 등록할까요?\n(나중에 매출 화면에서도 등록할 수 있습니다)`)) {
              const q = new URLSearchParams({ new: '1', customer: result.customerId, amount: String(result.amount), memo: result.details });
              // 예약에서 온 기록이면 결제를 그 예약에 연결(referenceId) — 안 넘기면 예약 상세가 "결제 미등록"으로 보여 2중 등록된다 (정합성 감사 2026-11-19)
              if (reservationId && (!savedDate || ReservationStore.getAll().find(x => x.id === reservationId)?.date === savedDate)) q.set('reference', reservationId);
              navigate(`/sales?${q.toString()}`);
            }
          }}
        />
      )}
      {editing && (
        <AddTreatmentModal
          treatment={editing}
          onClose={() => setEditing(null)}
          onSave={() => {
            setEditing(null);
            loadLogs();
          }}
        />
      )}
      {selected && (
        <TreatmentDetailModal
          treatment={selected}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
          onEdit={() => { setEditing(selected); setSelected(null); }}
        />
      )}
    </div>
  );
}

/** 저장 직후 결제 연계에 필요한 요약 — 새 기록이고 시술 항목 금액이 있을 때만 채워진다 */
export interface TreatmentSaveResult { customerId: string; customerName: string; amount: number; details: string }

const LIST_PAGE = 100; // 목록 1회 표시 수 — [더 보기]로 늘린다

/** 예약 상세 [시술 기록 작성]에서 넘어온 프리필 — 존재하는 고객·담당자·시술 메뉴만 반영한다 (2026-11-17) */
type Period = 'all' | 'today' | 'week' | 'month';
const PERIODS: Period[] = ['all', 'today', 'week', 'month'];
const PERIOD_LABELS: Record<Period, string> = { all: '전체', today: '오늘', week: '이번 주', month: '이번 달' };
/** 달력 단위 기간 — 이번 주는 월~일, 이번 달은 1일~말일 (로컬 날짜). 전체면 null */
function periodRange(period: Period, today: string): { from: string; to: string } | null {
  if (period === 'all') return null;
  if (period === 'today') return { from: today, to: today };
  if (period === 'month') {
    const [y, m] = today.split('-').map(Number);
    return { from: `${today.slice(0, 7)}-01`, to: toISODate(new Date(y, m, 0)) };
  }
  const d = parseISODate(today); const dow = (d.getDay() + 6) % 7; // 전부 인자 기준 — 월·연 경계에서 '지금'과 섞이지 않게 (12차 #L5)
  const mon = new Date(d); mon.setDate(d.getDate() - dow);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { from: toISODate(mon), to: toISODate(sun) };
}

export interface TreatmentPrefill { customerId?: string; treatmentDate?: string; staffName?: string; serviceNames?: string[] }

function AddTreatmentModal({ treatment: editing, prefill, onClose, onSave }: { treatment?: TreatmentLog | null; prefill?: TreatmentPrefill; onClose: () => void; onSave: (result?: TreatmentSaveResult, savedDate?: string) => void }) {
  const { user: authUser } = useAuth();
  const goTo = useNavigate();
  const isEdit = !!editing;
  const customers = CustomerStore.getAll().filter(c => c.isActive !== false || c.id === editing?.customerId); // 익명화 고객은 새 기록 대상이 아니다 — 예약·결제·판매 폼과 같은 규칙 (리뷰 #M3)
  const staff = StaffStore.getAll().filter(s => s.isActive || s.name === editing?.staffName || s.name === prefill?.staffName); // 퇴사 직원은 새 시술 담당자 목록에서 제외 (기존 기록의 담당자는 유지)
  // 비활성 메뉴는 새 기록에서 제외(예약 추가와 동일). 단 수정 중인 기록에 이미 들어간 메뉴는 남긴다 — 빼면 selectedServices에서도 빠져 저장 때 내역이 조용히 사라진다 (리뷰 2026-11-18)
  const editedNames = new Set((editing?.treatmentDetails ?? '').split(',').map(s => s.trim()).filter(Boolean));
  const services = ServiceStore.getAll().filter(s => s.isActive || editedNames.has(s.name));

  const [customerId, setCustomerId] = useState(editing?.customerId ?? (prefill?.customerId && customers.some(c => c.id === prefill.customerId) ? prefill.customerId : ''));
  // 쓸 수 있는 회차권(미완료·미만료)이 하나뿐이면 미리 연결 — 안 그러면 '단건'으로 저장돼 회차가 차감되지 않는 실수가 잦다 (입력 속도 감사 2026-11-18)
  const onlyActiveProgram = (cid: string, asOf: string) => { const a = cid ? getUsablePrograms(cid, asOf) : []; return a.length === 1 ? a[0].id : ''; };
  const [customerProgramId, setCustomerProgramId] = useState(() => editing?.customerProgramId ?? onlyActiveProgram(prefill?.customerId && customers.some(c => c.id === prefill.customerId) ? prefill.customerId : '', prefill?.treatmentDate ?? todayISO()));
  const [staffName, setStaffName] = useState(editing?.staffName ?? (prefill?.staffName && staff.some(s => s.name === prefill.staffName) ? prefill.staffName : ''));
  const [treatmentDate, setTreatmentDate] = useState(editing?.treatmentDate ?? prefill?.treatmentDate ?? todayISO());
  // 시술일을 바꾸면 연결도 그 날짜 기준으로 맞춘다 — 만료돼 빠지면 비우고, 쓸 수 있는 회차권이 하나뿐이면 다시 연결(수정 중인 기록의 원래 연결은 유지)
  const changeTreatmentDate = (v: string) => {
    setTreatmentDate(v);
    setCustomerProgramId(prev => {
      if (prev && editing?.customerProgramId === prev) return prev;
      const usable = customerId ? getUsablePrograms(customerId, v) : [];
      if (prev && usable.some(cp => cp.id === prev)) return prev;
      return usable.length === 1 ? usable[0].id : '';
    });
  };
  // 수정 모드: 기존 시술 내용에서 시술 메뉴명과 일치하는 항목을 체크 상태로 복원. 예약 프리필도 같은 규칙(존재하는 메뉴만)
  const [selectedServices, setSelectedServices] = useState<string[]>(() => {
    const names = new Set(services.map(s => s.name));
    if (editing?.treatmentDetails) return editing.treatmentDetails.split(',').map(s => s.trim()).filter(n => names.has(n));
    return (prefill?.serviceNames ?? []).filter(n => names.has(n));
  });
  const [treatmentDetails, setTreatmentDetails] = useState(editing?.treatmentDetails ?? '');
  const [skinCondition, setSkinCondition] = useState(editing?.skinCondition ?? '');
  const [staffNotes, setStaffNotes] = useState(editing?.staffNotes ?? '');
  const [nextAppointment, setNextAppointment] = useState(editing?.nextAppointment ?? '');

  // 사진 (시술 전/후) — 로컬 photoStore에 별도 저장
  const [photos, setPhotoList] = useState<PhotoEntry[]>(() => (editing ? getPhotos(`treatment:${editing.id}`) : []));
  // 수정 모드: 저장된 사진을 확정값으로 읽을 때까지 사진 변경·저장을 막는다 — "아직 안 읽음"을 빈 목록으로 저장해 서버 사진을 지우는 사고 방지 (리뷰 2026-11-17)
  const [photosReady, setPhotosReady] = useState(!editing);
  const photosTouchedRef = useRef(false);
  const editCacheVersion = usePhotoCacheVersion();
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    getPhotosAsync(`treatment:${editing.id}`).then(v => {
      if (cancelled) return;
      if (v === null) { notify('저장된 사진을 읽지 못했습니다. 이번 저장에서는 사진을 바꾸지 않습니다.'); return; }
      if (!photosTouchedRef.current) setPhotoList(v);
      setPhotosReady(true);
    });
    return () => { cancelled = true; };
  }, [editing]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 모바일: capture 속성이 있는 입력은 앨범 대신 카메라 앱을 바로 연다 (PC 브라우저는 무시하고 파일 선택)
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // 촬영 가이드 카메라(직전 사진 반투명 오버레이) — 미리보기를 못 열면 기존 <input capture> 경로로 폴백 (2026-11-17)
  const [showCamera, setShowCamera] = useState(false);
  const openCamera = () => {
    if (isCameraPreviewSupported()) setShowCamera(true);
    else cameraInputRef.current?.click();
  };
  const handleCameraCapture = (dataUrl: string, reference: { angle?: PhotoAngle } | null) => {
    photosTouchedRef.current = true;
    // 가이드로 쓴 직전 사진의 각도를 그대로 물려받아 같은 각도끼리 비교되게 한다.
    // 라벨: 같은 각도의 '전'이 이미 있으면 '후', 없으면 '전' — 관리 전 정면·측면 2장을 찍을 때 두 번째가 '후'로 잘못 붙던 것 (3차 UX 점검 2026-11-19)
    setPhotoList(prev => [...prev, { id: makePhotoId(), dataUrl, takenAt: new Date().toISOString(), label: prev.some(p => p.label === 'before' && (p.angle ?? null) === (reference?.angle ?? null)) ? 'after' : 'before', angle: reference?.angle }]);
    setShowCamera(false);
    notify('사진 1장을 추가했습니다.');
  };

  // 차감 가능한 프로그램(미완료·시술일 기준 미만료). 만료된 회차권은 선택지에서 빼고 안내만 — 연장은 고객 상세 [관리]에서 (2026-11-19)
  // 수정 중인 기록이 이미 연결한 프로그램은 그 사이 만료·완료됐어도 그대로 보여준다 — 안 그러면 '미연결'로 보이는데 저장하면 연결이 남는 모순
  const editingLinked = editing?.customerProgramId && editing.customerId === customerId ? CustomerProgramStore.getById(editing.customerProgramId) : undefined;
  const usablePrograms = customerId ? getUsablePrograms(customerId, treatmentDate) : [];
  const expiredPrograms = (customerId ? getExpiredPrograms(customerId, treatmentDate) : []).filter(cp => cp.id !== editingLinked?.id);
  const activePrograms = editingLinked && !usablePrograms.some(cp => cp.id === editingLinked.id) ? [...usablePrograms, editingLinked] : usablePrograms;

  const toggleService = (name: string) => {
    setSelectedServices(prev =>
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    );
  };

  const handlePickPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const added: PhotoEntry[] = [];
      let failed = 0;
      for (const file of files) {
        try {
          const dataUrl = await resizeImageFile(file);
          added.push({ id: makePhotoId(), dataUrl, takenAt: new Date().toISOString() });
        } catch {
          failed += 1; // 개별 파일 실패는 건너뛰되 몇 장인지 알린다 (6차 UX 감사 2026-11-20)
        }
      }
      if (failed > 0) notify(`사진 ${failed}장은 읽지 못해 추가하지 않았습니다 (손상된 파일이거나 지원하지 않는 형식).`);
      // 기본 태그: 기록의 첫 사진은 '시술 전', 이후는 '시술 후' (썸네일 아래에서 수정 가능) — 전·후 한 장씩 올리는 Before/After 흐름이 기본(E2E 계약).
      // 각도 정보가 없는 업로드에 "전이 있으면 후" 규칙을 쓰면 전·후 2장을 한 번에 올릴 때 둘 다 '전'이 된다 — 각도 규칙은 카메라 촬영에만 (리뷰 63 검토).
      // 리사이즈 중 목록이 바뀔 수 있어 커밋 시점의 prev 길이로 판정한다.
      photosTouchedRef.current = true;
      setPhotoList(prev => [...prev, ...added.map((p, i) => ({ ...p, label: prev.length + i === 0 ? 'before' : 'after' }))]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const removePhotoLocal = (id: string) => { photosTouchedRef.current = true; setPhotoList(prev => prev.filter(p => p.id !== id)); };
  const updatePhotoMeta = (id: string, patch: Pick<PhotoEntry, 'label' | 'angle'>) => {
    photosTouchedRef.current = true;
    setPhotoList(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
  };
  // 촬영 가이드 — 같은 고객의 직전 시술 사진(각도별 최신 1장). 편집 중인 기록은 제외.
  // 사진 base64를 전부 읽는 작업이라 고객 선택이 바뀔 때만 계산한다 (키 입력마다 재계산 금지)
  const referencePhotos = useMemo(
    () => (customerId ? findReferencePhotos(customerId, editing?.id) : []),
    [customerId, editing?.id, editCacheVersion], // IndexedDB 적재가 모달을 연 뒤 끝나도 가이드가 채워지게
  );

  const handleSave = () => {
    if (!customerId) return;
    if (!isISODate(treatmentDate)) { notify('시술일을 선택해주세요.'); return; } // 고객 상세의 빠른 기록은 required 인데 이 화면은 비어도 저장돼 목록에서 사라졌다 (14차 #H5)

    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    // 수정 모드 함정(QA② F1): textarea가 기존 값으로 채워져 있으면 체크박스 변경이 항상 무시됐음.
    // 사용자가 textarea를 직접 고친 경우에만 textarea 우선, 아니면 체크박스 선택을 반영.
    const initialDetails = editing?.treatmentDetails ?? '';
    const userEditedText = treatmentDetails !== initialDetails;
    const details = (userEditedText
      ? treatmentDetails
      : selectedServices.join(', ') || treatmentDetails) || undefined;
    const linkedProgram = customerProgramId ? activePrograms.find(cp => cp.id === customerProgramId) : undefined;
    if (customerProgramId && !linkedProgram) { notify(EXPIRED_LINK_BLOCKED); return; }

    if (isEdit && editing) {
      TreatmentLogStore.update(editing.id, {
        customerId,
        customerName: customer.name,
        // 수정 시 비운 값은 ''/null로 — undefined는 서버 PATCH(JSON 병합)에서 키가 빠져 옛 값이 남는다 (NAS 감사 2026-11-18)
        customerProgramId: (customerProgramId || null) as unknown as string | undefined,
        programName: linkedProgram?.programName || (customerProgramId ? editing.programName : '') || '', // 연결을 끊었으면 옛 프로그램명도 지운다
        staffName: staffName || '',
        treatmentDate,
        treatmentDetails: details ?? '', // 비운 내역도 ''로 — undefined는 서버 PATCH에서 빠진다
        skinCondition: skinCondition || '',
        staffNotes: staffNotes || '',
        nextAppointment: nextAppointment || '',
      });
      // 회차권 연결을 바꾸면 양쪽 원장에 줄을 남긴다 — 풀린 쪽은 복원, 새로 연결된 쪽은 차감 행(시술 기록)이 생기므로 정보 줄만 (146)
      const prevProg = editing.customerProgramId || '';
      if (prevProg !== (customerProgramId || '')) {
        const n = editing.sessionsUsed || 1;
        if (prevProg) appendProgramNote(prevProg, `시술 기록 수정으로 연결 해제 → ${n}회 복원 (${formatDate(treatmentDate)} 시술)`);
        if (customerProgramId) appendProgramNote(customerProgramId, `시술 기록 수정으로 연결 (${formatDate(treatmentDate)} 시술, ${n}회 차감)`);
      }
      if (photosReady) {
        try { savePhotos(`treatment:${editing.id}`, photos); } catch { notify('사진 저장 용량을 초과했습니다. 일부 사진을 줄여주세요.'); }
      }
    } else {
      const saved = TreatmentLogStore.save({
        customerId,
        customerName: customer.name,
        customerProgramId: customerProgramId || undefined,
        programName: linkedProgram?.programName || undefined,
        staffName: staffName || undefined,
        treatmentDate,
        treatmentTime: new Date().toTimeString().slice(0, 5),
        sessionsUsed: 1,
        treatmentDetails: details,
        skinCondition: skinCondition || undefined,
        staffNotes: staffNotes || undefined,
        nextAppointment: nextAppointment || undefined,
      });
      if (saved && photos.length > 0) {
        try { savePhotos(`treatment:${saved.id}`, photos); } catch { notify('사진 저장 용량을 초과했습니다. 일부 사진을 줄여주세요.'); }
      }
      // 코어 incrementVisit은 마지막 방문일을 UTC '오늘'로, 방문 횟수를 같은 날 예약 완료와 별도로 +1 한다 — 기록에서 다시 세어 바로 맞춘다(모달이 든 customer 스냅샷이 아닌 저장소 기준) (정합성 감사·리뷰 2026-11-19)
      if (saved) { healProgramSessionsWhenReady(customerId); healCustomerStatsWhenReady(customerId); } // 회차권 사용 회차도 기록 기준으로 (16차 #H2)
      // 결제 연계: 회차권 차감이 아닌 단건 시술이고 선택한 시술 항목에 금액이 있으면 결제 등록으로 이어준다 (2026-11-17)
      const amount = linkedProgram ? 0 : selectedServices.reduce((sum, name) => sum + (services.find(s => s.name === name)?.price ?? 0), 0);
      if (saved && amount > 0) {
        onSave({ customerId, customerName: customer.name, amount, details: details || '' }, treatmentDate);
        return;
      }
    }

    onSave(undefined, treatmentDate);
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={isEdit ? '시술 기록 수정' : '시술 기록 추가'} size="xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">고객 *</label>
            <CustomerCombobox customers={customers} value={customerId} onChange={id => { setCustomerId(id); setCustomerProgramId(onlyActiveProgram(id, treatmentDate)); }} maskRole={authUser?.role ?? 'staff'} />
            {customers.length === 0 && <PrereqHint text="등록된 고객이 없습니다" action="고객 등록" onGo={() => { onClose(); goTo('/customers?new=1'); }} />}
            <CustomerAlertLine customerId={customerId} className="mt-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">담당 직원</label>
            <select
              aria-label="담당 직원"
              value={staffName}
              onChange={e => setStaffName(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              <option value="">직원 선택</option>
              {staff.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">시술일</label>
          <input
            type="date"
            aria-label="시술일"
            required
            value={treatmentDate}
            onChange={e => changeTreatmentDate(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
          <DateQuickChips value={treatmentDate} onChange={changeTreatmentDate} options={[{ label: '오늘', days: 0 }, { label: '어제', days: -1 }]} />
        </div>

        {/* 프로그램 연결 (회차 차감) */}
        {customerId && activePrograms.length > 0 && (
          <div>
            <label htmlFor="treat-program-link" className="block text-xs font-medium text-gray-600 mb-1.5">차감할 회차권·프로그램</label>
            <select
              id="treat-program-link"
              aria-describedby={expiredPrograms.length > 0 ? 'expired-program-hint' : undefined}
              value={customerProgramId}
              onChange={e => setCustomerProgramId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              <option value="">연결 안 함 (단건 시술)</option>
              {activePrograms.map(cp => { const used = usedSessionsFor(cp); return ( // 기록에서 센 사용 회차 (16차 #H2)
                <option key={cp.id} value={cp.id}>
                  {cp.totalSessions != null ? `${cp.programName} · 잔여 ${remainingSessions(cp, used)}회 (${used}/${cp.totalSessions})` : `${cp.programName} · 기간제 (${used}회 이용)`}
                </option>
              ); })}
            </select>
          </div>
        )}
        {customerId && expiredPrograms.length > 0 && (
          <div id="expired-program-hint" data-testid="expired-program-hint" className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-0">{expiredProgramsHint(expiredPrograms)}</span>
            {/* 이 창에서는 [관리]가 다른 화면 — 바로 가는 길을 주되, 입력 중인 내용이 저장되지 않음을 알린다 (UX 점검 2026-11-19) */}
            <button type="button" onClick={() => { if (window.confirm('고객 상세로 이동할까요? 지금 입력 중인 시술 기록은 저장되지 않습니다.')) { onClose(); goTo(`/customers?open=${encodeURIComponent(customerId)}`); } }}
              className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 font-medium text-amber-800 hover:bg-amber-100">고객 상세 열기</button>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">시술 항목</label>
          {services.length === 0 && (canOpenRoute(authUser?.role, '/settings')
            ? <PrereqHint text="등록된 시술 항목이 없습니다 — 내역은 아래 칸에 직접 적을 수 있습니다" action="시술 항목 등록" onGo={() => { onClose(); goTo('/settings?tab=services'); }} />
            : <p className="mt-1.5 text-xs text-amber-700">등록된 시술 항목이 없습니다 — 내역은 아래 칸에 직접 적을 수 있습니다. 시술 항목 등록은 매장 관리자에게 요청해주세요.</p>)} {/* 117~119 리뷰 #H4 */}
          <div className="space-y-2">
            {services.map(s => (
              <label key={s.id} className="flex items-center gap-3 p-2.5 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedServices.includes(s.name)}
                  onChange={() => toggleService(s.name)}
                  className="rounded"
                />
                <span className="text-sm text-gray-700 flex-1">{s.name}</span>
                <span className="text-sm font-medium text-gray-800">{formatPrice(s.price)}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">시술 상세 내용</label>
          <textarea
            rows={2}
            value={treatmentDetails}
            onChange={e => setTreatmentDetails(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none"
            placeholder="시술 내용을 상세히 기록하세요 (비워두면 선택한 시술 항목으로 자동 기록)"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">피부 상태</label>
          <input
            type="text"
            value={skinCondition}
            onChange={e => setSkinCondition(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
            placeholder="예: 건조함, 트러블, 모공 확장 등"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">다음 방문 권장일</label>
          <input
            type="date"
            aria-label="다음 방문 권장일"
            value={nextAppointment}
            onChange={e => setNextAppointment(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">메모</label>
          <textarea
            rows={3}
            value={staffNotes}
            onChange={e => setStaffNotes(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none"
            placeholder="시술 특이사항, 다음 방문 시 주의사항 등"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">시술 전후 사진</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePickPhotos}
            className="hidden"
          />
          {photos.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-2">
              {photos.map(p => (
                <div key={p.id} className="space-y-1">
                  <div className="relative group aspect-square">
                    <img src={p.dataUrl} alt="시술 사진" className="w-full h-full object-cover rounded-xl border border-gray-100" />
                    <button
                      type="button"
                      onClick={() => removePhotoLocal(p.id)}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center lg:opacity-0 lg:group-hover:opacity-100 transition"
                      aria-label="사진 삭제"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <select
                      value={p.label ?? ''}
                      onChange={e => updatePhotoMeta(p.id, { label: (e.target.value || undefined) as PhotoLabel | undefined })}
                      className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-1 py-1 bg-white"
                      aria-label="시술 전후 구분"
                    >
                      <option value="">전/후</option>
                      {PHOTO_LABELS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                    </select>
                    <select
                      value={p.angle ?? ''}
                      onChange={e => updatePhotoMeta(p.id, { angle: (e.target.value || undefined) as PhotoAngle | undefined })}
                      className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-1 py-1 bg-white"
                      aria-label="촬영 각도"
                    >
                      <option value="">각도</option>
                      {PHOTO_ANGLES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
          {referencePhotos.length > 0 && (
            <div className="mb-2 p-2.5 bg-indigo-50/60 border border-indigo-100 rounded-xl">
              <p className="text-xs font-semibold text-indigo-900 mb-1.5">
                직전 시술 사진 참고 — 같은 각도·거리·조명으로 찍으면 Before/After 비교가 정확해집니다
              </p>
              <div className="flex gap-2 flex-wrap">
                {referencePhotos.map(r => (
                  <figure key={r.id} className="flex-shrink-0 w-16">
                    <img src={r.dataUrl} alt="직전 시술 사진" className="w-16 h-16 object-cover rounded-lg border border-indigo-100" />
                    <figcaption className="text-2xs text-gray-500 text-center mt-0.5 truncate">
                      {r.date.slice(5)}{r.angle ? ` · ${angleLabel(r.angle)}` : ''}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePickPhotos}
            className="hidden"
          />
          {/* 모바일(lg 미만): 카메라 촬영 / 앨범 선택 두 갈래 — 시술 직후 바로 찍어 붙이는 흐름 (2026-11-17, P3) */}
          <div className="grid grid-cols-2 gap-2 lg:hidden">
            <button
              type="button"
              onClick={openCamera}
              disabled={uploading || !photosReady}
              className="border-2 border-dashed border-primary-200 rounded-xl py-4 flex flex-col items-center gap-1.5 text-primary-600 disabled:opacity-50"
            >
              {uploading ? <Loader2 size={22} className="animate-spin" /> : <Camera size={22} />}
              <span className="text-sm font-medium">{uploading ? '처리 중...' : '카메라로 촬영'}</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !photosReady}
              className="border-2 border-dashed border-gray-200 rounded-xl py-4 flex flex-col items-center gap-1.5 text-gray-500 disabled:opacity-50"
            >
              <ClipboardList size={22} />
              <span className="text-sm font-medium">앨범에서 선택</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !photosReady}
            className="hidden lg:flex w-full border-2 border-dashed border-gray-200 rounded-xl py-6 flex-col items-center gap-2 text-gray-400 hover:border-primary-300 hover:text-primary-500 transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 size={24} className="animate-spin" /> : <Camera size={24} />}
            <span className="text-sm">{uploading ? '사진 처리 중...' : !photosReady ? '저장된 사진 읽는 중...' : '사진 추가 (여러 장 가능)'}</span>
          </button>
          <p className="text-xs text-gray-400 mt-1">
            {isAuthApiConfigured
              ? '사진은 기기에 저장되고 중앙 서버와 동기화되어 다른 기기에서도 볼 수 있습니다.'
              : '사진은 이 기기에만 저장됩니다. (다른 기기 동기화는 중앙 서버 연동 후 지원)'}
          </p>
          {showCamera && (
            <CameraOverlay
              references={referencePhotos}
              onCapture={handleCameraCapture}
              onClose={() => setShowCamera(false)}
              onPickFromAlbum={() => { setShowCamera(false); fileInputRef.current?.click(); }} // 사용자 탭 안에서 동기 호출 — 파일 선택창이 열린다
            />
          )}
        </div>

        {!customerId && <p className="text-xs text-gray-500 text-center">고객을 선택하면 저장할 수 있습니다</p>}
        {/* 저장 행은 바닥에 고정 — 사진 구역 뒤에 있어 키보드가 올라오면 보이지 않았다. 발송 모달과 같은 패턴 (7차 UX 점검 2026-11-20) */}
        <div className="flex gap-3 sticky bottom-0 bg-white pt-3 -mx-6 px-6 -mb-4 pb-4 border-t border-gray-100 lg:rounded-b-2xl">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">취소</button>
          <button
            onClick={handleSave}
            disabled={!customerId}
            className={clsx(
              'flex-1 py-2.5 text-sm font-medium text-white rounded-xl transition-all shadow-md',
              customerId
                ? 'bg-[#1a3a8f] hover:bg-[#15306e]'
                : 'bg-gray-300 cursor-not-allowed'
            )}
          >
            저장
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TreatmentDetailModal({
  treatment: t,
  onClose,
  onDelete,
  onEdit,
}: {
  treatment: TreatmentLog;
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit: () => void;
}) {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxPhoto | null>(null);
  const photos = getPhotos(`treatment:${t.id}`);

  return (
    <Modal isOpen={true} onClose={onClose} title="시술 기록 상세" size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
          <div className="w-12 h-12 rounded-2xl bg-primary-500 flex items-center justify-center">
            <span className="text-white text-lg font-bold">{(t.customerName || '?')[0]}</span>
          </div>
          <div className="flex-1">
            {t.customerId ? (
              <button type="button" onClick={() => { onClose(); navigate(`/customers?open=${encodeURIComponent(t.customerId)}`); }}
                className="font-bold text-gray-900 text-base hover:underline text-left" title="고객 상세 열기" aria-label={`${t.customerName} 고객 상세 열기`}>
                {t.customerName}
              </button>
            ) : (
              <p className="font-bold text-gray-900 text-base">{t.customerName}</p>
            )}
            <p className="text-xs text-gray-400">
              {formatDate(t.treatmentDate)}{t.treatmentTime ? ` ${t.treatmentTime}` : ''} · {t.staffName || '담당자 미지정'}
            </p>
          </div>
        </div>

        {(t.treatmentDetails || t.programName) && (
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">시술 내역</p>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-sm text-gray-700">{t.treatmentDetails || t.programName}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-0.5">사용 회차</p>
            <p className="text-sm font-semibold text-gray-800">{t.sessionsUsed}회</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-0.5">시술일</p>
            <p className="text-sm font-semibold text-gray-800">{formatDate(t.treatmentDate)}</p>
          </div>
        </div>

        {t.skinCondition && (
          <div className="bg-primary-50 rounded-xl p-3">
            <p className="text-xs text-primary-600 font-medium mb-0.5">피부 상태</p>
            <p className="text-sm text-primary-800">{t.skinCondition}</p>
          </div>
        )}

        {t.staffNotes && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">메모</p>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">{t.staffNotes}</p>
          </div>
        )}

        {t.nextAppointment && (
          <div className="flex items-center gap-2 bg-green-50 rounded-xl p-3">
            <ClipboardList size={14} className="text-green-700 flex-shrink-0" />
            <p className="text-sm text-green-700 flex-1 min-w-0">다음 방문 권장: <strong>{t.nextAppointment}</strong></p>
            {/^\d{4}-\d{2}-\d{2}$/.test(t.nextAppointment) && (
              <button
                type="button"
                onClick={() => { onClose(); navigate(`/reservations?new=1&customer=${encodeURIComponent(t.customerId)}&date=${encodeURIComponent(t.nextAppointment!)}`); }}
                className="flex-shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 whitespace-nowrap"
              >
                이 날짜로 예약
              </button>
            )}
          </div>
        )}

        {photos.length > 0 && (
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">시술 전후 사진 ({photos.length})</p>
            <div className="grid grid-cols-4 gap-2">
              {photos.map(p => (
                <button key={p.id} type="button" onClick={() => setLightbox({ dataUrl: p.dataUrl, caption: `${t.customerName} · ${formatDate(t.treatmentDate)} 시술 사진`, fileName: `${t.customerName}_${t.treatmentDate}.jpg` })} className="relative aspect-square" aria-label="시술 사진 크게 보기">
                  <img src={p.dataUrl} alt="시술 사진" className="w-full h-full object-cover rounded-xl border border-gray-100 hover:opacity-90 transition" />
                  {(p.label === 'before' || p.label === 'after' || p.angle) && (
                    <span className={clsx('absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md text-2xs font-semibold text-white', p.label === 'after' ? 'bg-indigo-600/90' : 'bg-gray-800/80')}>
                      {p.label === 'before' ? '전' : p.label === 'after' ? '후' : ''}{p.angle ? (p.label === 'before' || p.label === 'after' ? ' · ' : '') + angleLabel(p.angle) : ''}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {confirmDelete && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            삭제하면 {t.customerProgramId ? `연결된 회차권 잔여 ${t.sessionsUsed}회가 복구되고 ` : ''}{photos.length > 0 ? `사진 ${photos.length}장이 함께 삭제되며 ` : ''}되돌릴 수 없습니다.
          </p>
        )}
        <div className="flex flex-wrap gap-3 pt-2">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
            >
              <Trash2 size={14} />
              삭제
            </button>
          ) : (
            <button
              onClick={() => onDelete(t.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors"
            >
              <Trash2 size={14} />
              정말 삭제
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl hover:bg-[#15306e] transition-colors"
          >
            <Pencil size={14} />
            수정
          </button>
          <button onClick={onClose} className="px-6 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">닫기</button>
        </div>
      </div>
      {lightbox && <PhotoLightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </Modal>
  );
}
