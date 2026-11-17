import { notify } from '../../lib/notify';
import { matchesSearch, todayISO, toISODate, thisYearMonthISO } from '../../lib/format';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { usePhotoCacheVersion } from '../../hooks/usePhotoCache';
import { Search, ClipboardList, Camera, ChevronRight, Trash2, Pencil, X, Loader2 } from 'lucide-react';
import Header from '../../components/layout/Header';
import Modal from '../../components/ui/Modal';
import { TreatmentLogStore, CustomerStore, StaffStore, ServiceStore, CustomerProgramStore, PaymentStore } from '../../lib/store';
import type { TreatmentLog } from '../../types';
import clsx from 'clsx';
import { maskPhone } from '../../lib/masking';
import { useAuth } from '../../contexts/AuthContext';
import { getPhotos, getPhotosAsync, getPhotoCount, setPhotos as savePhotos, clearPhotos, resizeImageFile, makePhotoId, syncPhotosFromNas, PHOTO_ANGLES, PHOTO_LABELS, type PhotoEntry, type PhotoAngle, type PhotoLabel } from '../../lib/photoStore';
import { findReferencePhotos, angleLabel } from '../../lib/beforeAfter';
import CameraOverlay, { isCameraPreviewSupported } from '../../components/CameraOverlay';
import { isAuthApiConfigured } from '../../lib/authApi';

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
  // 목록 표시용 사진 장수 — base64 캐시를 매 렌더·매 키 입력마다 파싱하지 않도록 목록이 바뀔 때만 계산
  const photoCacheVersion = usePhotoCacheVersion(); // IndexedDB 캐시 적재·동기화 후 장수 갱신
  const photoCounts = useMemo(
    () => new Map(treatmentLogs.map(t => [t.id, getPhotoCount(`treatment:${t.id}`)])),
    [treatmentLogs, photoCacheVersion],
  );

  useEffect(() => {
    loadLogs();
    // 다른 기기에서 올린 사진을 NAS에서 내려받아 반영
    const keys = TreatmentLogStore.getAll().map(t => `treatment:${t.id}`);
    syncPhotosFromNas(keys).then(changed => {
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
  const range = periodRange(period, today);
  const filtered = treatmentLogs
    .filter(t => matchesSearch(search, [t.customerName, t.staffName, t.treatmentDetails, t.programName]))
    .filter(t => !range || (t.treatmentDate >= range.from && t.treatmentDate <= range.to))
    .filter(t => !staffFilter || t.staffName === staffFilter)
    .sort((a, b) => b.treatmentDate.localeCompare(a.treatmentDate)); // 최신 시술 먼저

  const isFiltered = period !== 'all' || !!staffFilter || !!search.trim();
  const filterChips = (
    <div className="flex items-center gap-1.5 overflow-x-auto py-0.5" role="group" aria-label="시술 기록 필터">
      {PERIODS.map(p => (
        <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}
          className={clsx('flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border', period === p ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]' : 'bg-white text-gray-600 border-gray-200')}>
          {PERIOD_LABELS[p]}
        </button>
      ))}
      {staffNames.length > 0 && (
        <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} aria-label="담당자 필터"
          className="flex-shrink-0 ml-1 max-w-[9rem] truncate text-[11px] border border-gray-200 rounded-full px-2 py-1 bg-white text-gray-600">
          <option value="">담당자 전체</option>
          {staffNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      )}
      {(period !== 'all' || staffFilter) && (
        <button type="button" onClick={() => { setPeriod('all'); setStaffFilter(''); }} className="flex-shrink-0 text-[11px] text-gray-400 hover:text-gray-600 px-1">초기화</button>
      )}
    </div>
  );

  const handleDelete = (id: string) => {
    TreatmentLogStore.delete(id);
    clearPhotos(`treatment:${id}`); // 연결된 사진도 정리
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
      <div className="block lg:hidden flex-1 flex flex-col">
        {/* 검색바 */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 shadow-sm">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="고객명, 시술명, 직원명 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-4 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>
          <div className="mt-2">{filterChips}</div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <ClipboardList size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">시술 기록이 없습니다</p>
              <p className="text-xs text-slate-400 mt-1">PC에서 시술 기록을 추가하세요</p>
            </div>
          ) : (
            filtered.map(t => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="w-full bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-bold">{t.customerName[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{t.customerName}</p>
                      {t.programName && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                          {t.programName}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {t.treatmentDetails || t.programName || '시술 내역 없음'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t.treatmentDate}{t.treatmentTime ? ` ${t.treatmentTime}` : ''} · {t.staffName || '담당자 미지정'}
                      {(photoCounts.get(t.id) ?? 0) > 0 && <span className="ml-1.5 text-indigo-500">· 사진 {photoCounts.get(t.id)}장</span>}
                    </p>
                    {t.skinCondition && (
                      <p className="text-xs text-purple-600 mt-1">피부상태: {t.skinCondition}</p>
                    )}
                  </div>
                </div>
              </button>
            ))
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
              placeholder="고객명, 시술명, 직원명 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
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
                시술 기록이 없습니다. 새 기록을 추가해 주세요.
              </div>
            )}
            {filtered.map(t => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="w-full flex items-start gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-sm font-bold">{t.customerName[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm font-bold text-gray-900">{t.customerName}</p>
                    {t.programName && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-100 text-purple-700">
                        {t.programName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t.treatmentDetails || t.programName || '시술 내역 없음'}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {t.treatmentDate}{t.treatmentTime ? ` ${t.treatmentTime}` : ''} · {t.staffName || '담당자 미지정'}
                    {(photoCounts.get(t.id) ?? 0) > 0 && <span className="ml-1.5 text-indigo-500">· 사진 {photoCounts.get(t.id)}장</span>}
                  </p>
                  {t.skinCondition && (
                    <p className="text-[11px] text-purple-600 mt-1">피부상태: {t.skinCondition}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium text-gray-600">{t.sessionsUsed}회차</p>
                </div>
                <ChevronRight size={16} className="text-gray-300 mt-1 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {showAddModal && (
        <AddTreatmentModal
          prefill={prefill ?? undefined}
          onClose={() => { setShowAddModal(false); setPrefill(null); }}
          onSave={result => {
            const reservationId = prefill?.reservationId;
            setShowAddModal(false);
            setPrefill(null);
            loadLogs();
            // 예약 완료 처리에서 결제가 이미 등록된 건(referenceId=예약 id)이면 결제 연계를 다시 묻지 않는다
            const paidByReservation = !!reservationId && PaymentStore.getAll().some(p => p.referenceId === reservationId);
            if (result && !paidByReservation && window.confirm(`시술 기록을 저장했습니다.\n${result.customerName} 고객의 결제(${result.amount.toLocaleString()}원)도 바로 등록할까요?`)) {
              const q = new URLSearchParams({ new: '1', customer: result.customerId, amount: String(result.amount), memo: result.details });
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
    return { from: `${thisYearMonthISO()}-01`, to: toISODate(new Date(y, m, 0)) };
  }
  const d = new Date(); const dow = (d.getDay() + 6) % 7;
  const mon = new Date(d); mon.setDate(d.getDate() - dow);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { from: toISODate(mon), to: toISODate(sun) };
}

export interface TreatmentPrefill { customerId?: string; treatmentDate?: string; staffName?: string; serviceNames?: string[] }

function AddTreatmentModal({ treatment: editing, prefill, onClose, onSave }: { treatment?: TreatmentLog | null; prefill?: TreatmentPrefill; onClose: () => void; onSave: (result?: TreatmentSaveResult) => void }) {
  const { user: authUser } = useAuth();
  const isEdit = !!editing;
  const customers = CustomerStore.getAll();
  const staff = StaffStore.getAll();
  const services = ServiceStore.getAll();

  const [customerId, setCustomerId] = useState(editing?.customerId ?? (prefill?.customerId && customers.some(c => c.id === prefill.customerId) ? prefill.customerId : ''));
  const [customerProgramId, setCustomerProgramId] = useState(editing?.customerProgramId ?? '');
  const [staffName, setStaffName] = useState(editing?.staffName ?? (prefill?.staffName && staff.some(s => s.name === prefill.staffName) ? prefill.staffName : ''));
  const [treatmentDate, setTreatmentDate] = useState(editing?.treatmentDate ?? prefill?.treatmentDate ?? todayISO());
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
    // 가이드로 쓴 직전 사진의 각도를 그대로 물려받아 같은 각도끼리 비교되게 한다
    setPhotoList(prev => [...prev, { id: makePhotoId(), dataUrl, takenAt: new Date().toISOString(), label: prev.length === 0 ? 'before' : 'after', angle: reference?.angle }]);
    setShowCamera(false);
    notify('사진 1장을 추가했습니다.');
  };

  // Get active programs for the selected customer
  const activePrograms = customerId ? CustomerProgramStore.getActive(customerId) : [];

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
      for (const file of files) {
        try {
          const dataUrl = await resizeImageFile(file);
          added.push({ id: makePhotoId(), dataUrl, takenAt: new Date().toISOString() });
        } catch {
          // 개별 파일 실패는 건너뜀
        }
      }
      // 기본 태그: 기록의 첫 사진은 '시술 전', 이후는 '시술 후' (썸네일 아래에서 수정 가능).
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

    if (isEdit && editing) {
      TreatmentLogStore.update(editing.id, {
        customerId,
        customerName: customer.name,
        customerProgramId: customerProgramId || undefined,
        programName: linkedProgram?.programName || editing.programName || undefined,
        staffName: staffName || undefined,
        treatmentDate,
        treatmentDetails: details,
        skinCondition: skinCondition || undefined,
        staffNotes: staffNotes || undefined,
        nextAppointment: nextAppointment || undefined,
      });
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
      // 결제 연계: 회차권 차감이 아닌 단건 시술이고 선택한 시술 항목에 금액이 있으면 결제 등록으로 이어준다 (2026-11-17)
      const amount = linkedProgram ? 0 : selectedServices.reduce((sum, name) => sum + (services.find(s => s.name === name)?.price ?? 0), 0);
      if (saved && amount > 0) {
        onSave({ customerId, customerName: customer.name, amount, details: details || '' });
        return;
      }
    }

    onSave();
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={isEdit ? '시술 기록 수정' : '시술 기록 추가'} size="xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">고객 *</label>
            <select
              value={customerId}
              onChange={e => { setCustomerId(e.target.value); setCustomerProgramId(''); }}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="">고객 선택</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({maskPhone(c.phone, authUser?.role ?? 'staff')})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">담당 직원</label>
            <select
              value={staffName}
              onChange={e => setStaffName(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
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
            value={treatmentDate}
            onChange={e => setTreatmentDate(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
          />
        </div>

        {/* 프로그램 연결 (회차 차감) */}
        {customerId && activePrograms.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">프로그램 연결 (회차 차감)</label>
            <select
              value={customerProgramId}
              onChange={e => setCustomerProgramId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="">프로그램 미연결 (단건 시술)</option>
              {activePrograms.map(cp => (
                <option key={cp.id} value={cp.id}>
                  {cp.programName} ({cp.usedSessions}/{cp.totalSessions ?? '무제한'}회)
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">시술 항목</label>
          <div className="space-y-2">
            {services.map(s => (
              <label key={s.id} className="flex items-center gap-3 p-2.5 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedServices.includes(s.name)}
                  onChange={() => toggleService(s.name)}
                  className="rounded text-purple-500"
                />
                <span className="text-sm text-gray-700 flex-1">{s.name}</span>
                <span className="text-sm font-medium text-gray-800">{s.price.toLocaleString()}원</span>
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
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
            placeholder="시술 내용을 상세히 기록하세요 (비워두면 선택한 시술 항목으로 자동 기록)"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">피부 상태</label>
          <input
            type="text"
            value={skinCondition}
            onChange={e => setSkinCondition(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
            placeholder="예: 건조함, 트러블, 모공 확장 등"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">다음 방문 권장일</label>
          <input
            type="date"
            value={nextAppointment}
            onChange={e => setNextAppointment(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">메모</label>
          <textarea
            rows={3}
            value={staffNotes}
            onChange={e => setStaffNotes(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
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
                      className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      aria-label="사진 삭제"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <select
                      value={p.label ?? ''}
                      onChange={e => updatePhotoMeta(p.id, { label: (e.target.value || undefined) as PhotoLabel | undefined })}
                      className="flex-1 min-w-0 text-[11px] border border-gray-200 rounded-lg px-1 py-1 bg-white"
                      aria-label="시술 전후 구분"
                    >
                      <option value="">전/후</option>
                      {PHOTO_LABELS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                    </select>
                    <select
                      value={p.angle ?? ''}
                      onChange={e => updatePhotoMeta(p.id, { angle: (e.target.value || undefined) as PhotoAngle | undefined })}
                      className="flex-1 min-w-0 text-[11px] border border-gray-200 rounded-lg px-1 py-1 bg-white"
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
              <p className="text-[11px] font-semibold text-indigo-900 mb-1.5">
                직전 시술 사진 참고 — 같은 각도·거리·조명으로 찍으면 Before/After 비교가 정확해집니다
              </p>
              <div className="flex gap-2 overflow-x-auto">
                {referencePhotos.map(r => (
                  <figure key={r.id} className="flex-shrink-0 w-16">
                    <img src={r.dataUrl} alt="직전 시술 사진" className="w-16 h-16 object-cover rounded-lg border border-indigo-100" />
                    <figcaption className="text-[10px] text-gray-500 text-center mt-0.5 truncate">
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
              className="border-2 border-dashed border-purple-200 rounded-xl py-4 flex flex-col items-center gap-1.5 text-purple-500 disabled:opacity-50"
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
            className="hidden lg:flex w-full border-2 border-dashed border-gray-200 rounded-xl py-6 flex-col items-center gap-2 text-gray-400 hover:border-purple-300 hover:text-purple-400 transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 size={24} className="animate-spin" /> : <Camera size={24} />}
            <span className="text-sm">{uploading ? '사진 처리 중...' : !photosReady ? '저장된 사진 읽는 중...' : '사진 추가 (여러 장 가능)'}</span>
          </button>
          <p className="text-[11px] text-gray-400 mt-1">
            {isAuthApiConfigured
              ? '사진은 기기에 저장되고 중앙 서버(NAS)와 동기화되어 다른 기기에서도 볼 수 있습니다.'
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

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">취소</button>
          <button
            onClick={handleSave}
            disabled={!customerId}
            className={clsx(
              'flex-1 py-2.5 text-sm font-medium text-white rounded-xl transition-all shadow-md',
              customerId
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
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
  const photos = getPhotos(`treatment:${t.id}`);

  return (
    <Modal isOpen={true} onClose={onClose} title="시술 기록 상세" size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
            <span className="text-white text-lg font-bold">{t.customerName[0]}</span>
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
              {t.treatmentDate}{t.treatmentTime ? ` ${t.treatmentTime}` : ''} · {t.staffName || '담당자 미지정'}
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
            <p className="text-[11px] text-gray-400 mb-0.5">사용 회차</p>
            <p className="text-sm font-semibold text-gray-800">{t.sessionsUsed}회</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[11px] text-gray-400 mb-0.5">시술일</p>
            <p className="text-sm font-semibold text-gray-800">{t.treatmentDate}</p>
          </div>
        </div>

        {t.skinCondition && (
          <div className="bg-purple-50 rounded-xl p-3">
            <p className="text-[11px] text-purple-500 font-medium mb-0.5">피부 상태</p>
            <p className="text-sm text-purple-700">{t.skinCondition}</p>
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
            <ClipboardList size={14} className="text-green-600 flex-shrink-0" />
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
                <a key={p.id} href={p.dataUrl} target="_blank" rel="noreferrer" className="relative aspect-square">
                  <img src={p.dataUrl} alt="시술 사진" className="w-full h-full object-cover rounded-xl border border-gray-100 hover:opacity-90 transition" />
                  {(p.label === 'before' || p.label === 'after' || p.angle) && (
                    <span className={clsx('absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-white', p.label === 'after' ? 'bg-indigo-600/90' : 'bg-gray-800/80')}>
                      {p.label === 'before' ? '전' : p.label === 'after' ? '후' : ''}{p.angle ? (p.label === 'before' || p.label === 'after' ? ' · ' : '') + angleLabel(p.angle) : ''}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
            >
              <Trash2 size={14} />
              삭제
            </button>
          ) : (
            <button
              onClick={() => onDelete(t.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors"
            >
              <Trash2 size={14} />
              정말 삭제
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all"
          >
            <Pencil size={14} />
            수정
          </button>
          <button onClick={onClose} className="px-6 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">닫기</button>
        </div>
      </div>
    </Modal>
  );
}
