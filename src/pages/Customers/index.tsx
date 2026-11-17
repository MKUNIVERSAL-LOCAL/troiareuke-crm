import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { notify } from '../../lib/notify';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search, Plus, User, ChevronRight, AlertCircle, X, CheckCircle,
  Scissors, ChevronDown, Tag,
  Sparkles, Activity, Download, Pencil, Trash2, Upload, Camera, Loader2, Send, Images, ArrowLeftRight, CreditCard, CalendarPlus, GitMerge, MessageSquare
} from 'lucide-react';
import { CustomerStore, ProgramStore, CustomerProgramStore, TreatmentLogStore, StaffStore, ServiceStore, MessageHistoryStore, SettingsStore, PaymentStore, ReservationStore } from '../../lib/store';
import { sendMessages } from '../../lib/messagingGateway';
import {
  ConsultationStore, loadConsultations, deriveSkinType, buildSolutionDraft
} from '../../lib/consultationStore';
import { HOMECARE_PROBLEMS, recommendHomecare } from '../../data/homecareGuide';
import TimelapseViewer from '../../components/TimelapseViewer';
import { resizeImageFile, getPhotos, getPhotosAsync, setPhotos as savePhotos, clearPhotos, makePhotoId, syncPhotosFromNas, type PhotoEntry } from '../../lib/photoStore';
import { collectCustomerPhotos, photoCaption, daysBetween, renderComparison, comparisonFileName, angleLabel, type DatedPhoto } from '../../lib/beforeAfter';
import { PHOTO_LABELS } from '../../lib/photoStore';
import { exportFile, dataUrlToBlob } from '../../lib/mobileBridge';
import { IS_MOBILE_APP } from '../../lib/platform';
import PhotoLightbox, { type LightboxPhoto } from '../../components/PhotoLightbox';
import CustomerMergeModal from '../../components/CustomerMergeModal';
import CustomerTimeline from '../../components/CustomerTimeline';
import ProgramManageModal from '../../components/ProgramManageModal';
import { mergeBlockReason, findSamePhoneCustomers } from '../../lib/customerMerge';
import { exportConsultationPdf } from '../../lib/consultReport';
import { FileText } from 'lucide-react';
import { useIsMobileLayout } from '../../hooks/useMediaQuery';
import { usePhotoCacheVersion } from '../../hooks/usePhotoCache';
import { getCustomerRevisitInfo } from '../../lib/reminderEngine';
import { getRetentionPolicy, getExpiredCustomers, anonymizeCustomers, isAnonymized } from '../../lib/retentionPolicy';
import { analyzeSkinPhoto, isSkinAnalysisAvailable, SKIN_LABELS, type SkinAnalysisResult } from '../../lib/skinAnalysis';
import { isBeaconConsultationEnabled, onFeatureFlagsChanged } from '../../lib/featureFlags';
import { refreshAiProxyStatus, onAiProxyStatusChanged } from '../../lib/aiProxy';
import * as XLSX from 'xlsx';
import { writeWorkbook } from '../../lib/dataExport';
import type { Customer, CustomerGrade, Gender, Program, CustomerProgram, PaymentMethod, Consultation, BeaconMetrics } from '../../types';
import { maskPhone } from '../../lib/masking';
import { getAllPaymentMethods } from '../../lib/paymentMethods';
import { useAuth } from '../../contexts/AuthContext';
import { formatPrice, formatDate, todayISO as today, formatPhoneInput, matchesSearch, toISODate, parseISODate } from '../../lib/format';

// 피부 고민 체크리스트 (한국 에스테틱 상담 실무 기준)
const CONCERN_GROUPS: { group: string; items: string[] }[] = [
  { group: '수분·유분', items: ['건조함', '속건조', '번들거림', '유수분 불균형'] },
  { group: '모공·각질', items: ['모공 늘어짐', '블랙헤드', '각질', '피지 과다'] },
  { group: '색소', items: ['기미', '잡티', '주근깨', '색소침착', '칙칙함'] },
  { group: '주름·탄력', items: ['잔주름', '탄력 저하', '처짐', '팔자주름'] },
  { group: '트러블', items: ['여드름', '뾰루지', '좁쌀', '여드름 흉터'] },
  { group: '민감·장벽', items: ['민감성', '붉어짐', '따가움', '홍조'] },
  { group: '기타', items: ['다크서클', '안색 저하', '푸석함'] },
];

// 비컨(AI 피부진단기) 측정 지표 — 0~100
const BEACON_FIELDS: { key: keyof BeaconMetrics; label: string; hint: string }[] = [
  { key: 'moisture', label: '수분', hint: '높을수록 촉촉' },
  { key: 'oil', label: '유분', hint: '높을수록 유분 많음' },
  { key: 'elasticity', label: '탄력', hint: '높을수록 탄탄' },
  { key: 'pigmentation', label: '색소침착', hint: '높을수록 침착 심함' },
  { key: 'pore', label: '모공', hint: '높을수록 모공 큼' },
  { key: 'wrinkle', label: '주름', hint: '높을수록 주름 많음' },
  { key: 'redness', label: '홍조', hint: '높을수록 붉음' },
  { key: 'sensitivity', label: '민감도', hint: '높을수록 민감' },
  { key: 'skinTone', label: '피부톤', hint: '높을수록 밝음' },
];

const SKIN_TYPES = ['건성', '지성', '복합성', '민감성', '중성'];

const emptyConsultForm = () => ({
  consultDate: today(),
  staffName: '',
  concerns: [] as string[],
  homecareProblems: [] as string[], // 홈케어 추천용 피부 문제(세트 타입) 체크
  metrics: {} as Record<string, string>, // 입력 편의를 위해 문자열로 보관
  skinTypeResult: '',
  managerNote: '',
  recommendedSolution: '',
  recommendedProducts: '',
  nextConsultDate: '',
});

const GRADE_COLORS: Record<CustomerGrade, string> = {
  VIP: 'bg-yellow-100 text-yellow-700',
  골드: 'bg-orange-100 text-orange-700',
  일반: 'bg-blue-100 text-blue-700',
  신규: 'bg-green-100 text-green-700',
};
const GRADES: CustomerGrade[] = ['VIP', '골드', '일반', '신규'];

function getDaysSince(d?: string) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}
function calcExpiryDate(days?: number | null, baseDate?: string) {
  if (!days) return undefined;
  const d = baseDate ? parseISODate(baseDate) : new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

// 생년월일 — 연/월/일 드롭다운 (네이티브 달력 대체). 3개 모두 선택 시에만 완전한 날짜를 emit.
function BirthDateSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts = (value || '').split('-');
  const [y, setY] = useState(parts[0] && parts[0] !== '0000' ? parts[0] : '');
  const [mo, setMo] = useState(parts[1] && parts[1] !== '00' ? parts[1] : '');
  const [d, setD] = useState(parts[2] && parts[2] !== '00' ? parts[2] : '');
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - 1930 + 1 }, (_, i) => String(thisYear - i));
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const daysInMonth = y && mo ? new Date(Number(y), Number(mo), 0).getDate() : 31;
  const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'));
  function emit(ny: string, nm: string, nd: string) {
    onChange(ny && nm && nd ? `${ny}-${nm}-${nd}` : '');
  }
  const sel = 'px-2 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-indigo-300 transition cursor-pointer';
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <select className={sel} value={y} onChange={e => { setY(e.target.value); emit(e.target.value, mo, d); }}>
        <option value="">연도</option>
        {years.map(yr => <option key={yr} value={yr}>{yr}년</option>)}
      </select>
      <select className={sel} value={mo} onChange={e => { setMo(e.target.value); emit(y, e.target.value, d); }}>
        <option value="">월</option>
        {months.map(m => <option key={m} value={m}>{Number(m)}월</option>)}
      </select>
      <select className={sel} value={d} onChange={e => { setD(e.target.value); emit(y, mo, e.target.value); }}>
        <option value="">일</option>
        {days.map(dy => <option key={dy} value={dy}>{Number(dy)}일</option>)}
      </select>
    </div>
  );
}

/** 최근 시술 기록 카드의 사진 썸네일(최대 4장) — 탭하면 크게 보기. PC·모바일 공용 (2026-11-17) */
function TreatmentPhotoStrip({ logId, treatmentDate, customerName, tick, onOpen }: { logId: string; treatmentDate: string; customerName: string; tick: number; onOpen: (p: LightboxPhoto) => void }) {
  void tick; // NAS 동기화 후 재읽기
  const thumbs = getPhotos(`treatment:${logId}`);
  if (thumbs.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 mt-2">
      {thumbs.slice(0, 4).map(p => {
        const tag = [PHOTO_LABELS.find(l => l.id === p.label)?.label, angleLabel(p.angle)].filter(Boolean).join(' · ');
        return (
          <button key={p.id} type="button" aria-label="시술 사진 크게 보기"
            onClick={() => onOpen({ dataUrl: p.dataUrl, caption: `${formatDate(treatmentDate)} 시술${tag ? ` · ${tag}` : ''}`, fileName: `${customerName}_시술사진_${treatmentDate}.jpg` })}
            className="w-10 h-10 rounded-lg overflow-hidden border border-gray-100 bg-white">
            <img src={p.dataUrl} alt="시술 사진" className="w-full h-full object-cover" />
          </button>
        );
      })}
      {thumbs.length > 4 && <span className="text-[11px] text-gray-400">+{thumbs.length - 4}</span>}
    </div>
  );
}

/** 상담 기록에 저장된 사진(AI 분석 사진·Before/After 비교) 썸네일 — 탭하면 크게 보기 (2026-11-17) */
function ConsultPhotoStrip({ consultId, consultDate, customerName, tick, onOpen }: { consultId: string; consultDate: string; customerName: string; tick: number; onOpen: (p: LightboxPhoto) => void }) {
  void tick; // NAS 동기화 후 재읽기
  const photos = getPhotos(`consult:${consultId}`);
  if (photos.length === 0) return null;
  return (
    <div className="flex gap-1.5 mt-2 flex-wrap">
      {photos.map(p => {
        const isCompare = p.label === 'compare';
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen({
              dataUrl: p.dataUrl,
              caption: `${formatDate(consultDate)} 상담 · ${isCompare ? 'Before/After 비교' : '상담 사진'}`,
              fileName: isCompare ? comparisonFileName(customerName).replace(/\.png$/, '.jpg') : `${customerName}_상담사진_${consultDate}.jpg`, // 기록용 비교 이미지는 JPEG로 압축 저장됨
            })}
            aria-label="상담 사진 크게 보기"
            className={`rounded-lg border border-indigo-100 overflow-hidden bg-white ${isCompare ? 'w-24 h-14' : 'w-14 h-14'}`}
          >
            <img src={p.dataUrl} alt={isCompare ? 'Before/After 비교 이미지' : '상담 사진'} className="w-full h-full object-cover" />
          </button>
        );
      })}
    </div>
  );
}

const PAYMENT_STATUS_LABEL: Record<string, string> = { completed: '완료', refunded: '환불', pending: '대기' };

/**
 * 고객 결제 내역 — 매출 화면(PaymentStore)의 이 고객 건만 최신순으로. 완료 합계·건수 요약 + 최근 10건,
 * [결제 등록]은 매출 화면 등록 모달을 고객 프리필(?new=1&customer=)로 연다 (2026-11-17, PC·모바일 공용)
 */
function CustomerPaymentHistory({ customerId, compact, onAdd }: { customerId: string; compact?: boolean; onAdd: () => void }) {
  const payments = PaymentStore.getAll()
    .filter(p => p.customerId === customerId)
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || b.createdAt.localeCompare(a.createdAt));
  const completed = payments.filter(p => p.status === 'completed');
  const total = completed.reduce((sum, p) => sum + p.amount, 0);
  const shown = payments.slice(0, 10);
  return (
    <div data-testid="customer-payments" className={compact ? 'bg-white rounded-xl border border-slate-200 p-4' : 'bg-white rounded-2xl border border-gray-100 p-5'}>
      <div className={`flex items-center justify-between ${compact ? 'mb-3' : 'mb-4'}`}>
        {compact
          ? <p className="text-xs font-semibold text-gray-500 uppercase">결제 내역</p>
          : <h3 className="font-bold text-gray-900">결제 내역</h3>}
        <button type="button" onClick={onAdd} className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1">
          <Plus size={12} />결제 등록
        </button>
      </div>
      {payments.length === 0 ? (
        <div className={compact ? 'text-center py-3' : 'text-center py-6'}>
          {!compact && <CreditCard size={28} className="text-gray-200 mx-auto mb-2" />}
          <p className={compact ? 'text-xs text-gray-400' : 'text-sm text-gray-400'}>결제 내역이 없어요</p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between px-3 py-2 bg-gray-50 rounded-lg mb-2">
            <span className="text-xs text-gray-500">완료 {completed.length}건{payments.length !== completed.length ? ` · 전체 ${payments.length}건` : ''}</span>
            <span className="text-sm font-bold text-gray-900">{formatPrice(total)}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {shown.map(p => (
              <div key={p.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">
                    {p.typeLabel}
                    {p.status !== 'completed' && (
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${p.status === 'refunded' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>{PAYMENT_STATUS_LABEL[p.status] ?? p.status}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-gray-400 truncate">{formatDate(p.paymentDate)} · {p.paymentMethod}{p.memo ? ` · ${p.memo}` : ''}</p>
                </div>
                <span className={`text-sm font-semibold whitespace-nowrap ${p.status === 'refunded' ? 'text-rose-500 line-through' : 'text-gray-900'}`}>{formatPrice(p.amount)}</span>
              </div>
            ))}
          </div>
          {payments.length > shown.length && <p className="text-[11px] text-gray-300 mt-1">외 {payments.length - shown.length}건 — 전체는 매출 화면 참조</p>}
        </>
      )}
    </div>
  );
}

/** 예약 노쇼 횟수 — 예약 받을 때 참고(확인 전화·선결제 권장) (2026-11-17) */
function noShowCount(customerId: string): number {
  return ReservationStore.getAll().filter(r => r.customerId === customerId && r.status === 'noshow').length;
}

/** 다음 방문 권장 표시 — 예약이 잡혀 있으면 예약일, 아니면 권장일과 남은 일수 */
function RevisitBadge({ customerId, size = 'md' }: { customerId: string; size?: 'sm' | 'md' }) {
  const info = getCustomerRevisitInfo(customerId);
  if (!info) return <span className={size === 'sm' ? 'text-xs font-medium text-gray-400' : 'text-sm font-semibold text-gray-400'}>-</span>;
  const cls = size === 'sm' ? 'text-xs font-medium' : 'text-sm font-semibold';
  if (info.upcomingReservation) {
    return <span className={`${cls} text-blue-600`}>예약 {formatDate(info.upcomingReservation)}</span>;
  }
  const late = info.daysLeft < 0;
  return (
    <span className={`${cls} ${late ? 'text-rose-600' : info.daysLeft <= 7 ? 'text-amber-600' : 'text-gray-700'}`} title={info.basis === 'recommended' ? '시술기록의 다음 방문 권장일' : '마지막 방문일 + 재방문 권장 주기'}>
      {formatDate(info.dueDate)} ({late ? `${-info.daysLeft}일 지남` : info.daysLeft === 0 ? '오늘' : `D-${info.daysLeft}`})
    </span>
  );
}

export default function Customers() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [customerPrograms, setCustomerPrograms] = useState<CustomerProgram[]>([]);
  const selectedNoShows = selected ? noShowCount(selected.id) : 0;
  // 빠른 메모 — 수정 모달 없이 날짜가 붙는 한 줄을 메모에 덧붙인다 (2026-11-18)
  const [quickMemo, setQuickMemo] = useState('');
  function handleQuickMemo() {
    if (!selected) return;
    const text = quickMemo.trim();
    if (!text) return;
    const line = `[${today()}] ${text}`;
    CustomerStore.update(selected.id, { memo: selected.memo ? `${selected.memo}\n${line}` : line });
    const updated = CustomerStore.getById(selected.id);
    if (updated) setSelected(updated);
    setQuickMemo('');
    loadAll();
    notify('메모를 추가했습니다.');
  }
  const quickMemoRow = (compact: boolean) => (
    <form onSubmit={e => { e.preventDefault(); handleQuickMemo(); }} className="flex gap-2 mt-2">
      <input
        value={quickMemo}
        onChange={e => setQuickMemo(e.target.value)}
        placeholder="한 줄 메모 (예: 저자극 제품 선호)"
        aria-label="빠른 메모"
        className={`flex-1 min-w-0 border border-gray-200 rounded-lg px-3 ${compact ? 'py-2 text-sm' : 'py-1.5 text-xs'} focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30`}
      />
      <button type="submit" disabled={!quickMemo.trim()}
        className={`flex-shrink-0 px-3 rounded-lg bg-[#1a3a8f] text-white font-medium disabled:opacity-40 ${compact ? 'py-2 text-sm' : 'py-1.5 text-xs'}`}>
        메모 추가
      </button>
    </form>
  );
  // 헤더 전역 검색(?q=)에서 넘어온 검색어를 초기값·변경 모두 반영
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const qParam = searchParams.get('q');
  useEffect(() => {
    // q가 실제로 바뀔 때만 — 다른 파라미터(retention 등) 변경이 손으로 고친 검색어를 되돌리지 않게 (리뷰 2026-11-17)
    if (qParam !== null) setSearch(qParam);
  }, [qParam]);
  const [gradeFilter, setGradeFilter] = useState<CustomerGrade | '전체'>('전체');
  // 목록 정렬 — 최근 방문순(기본)·이름순·등록순·누적 결제순 (2026-11-18)
  type SortKey = 'recent' | 'name' | 'registered' | 'spent';
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: 'recent', label: '최근 방문순' },
    { value: 'name', label: '이름순' },
    { value: 'registered', label: '최근 등록순' },
    { value: 'spent', label: '누적 결제순' },
  ];
  const compareCustomers = (a: Customer, b: Customer): number => {
    switch (sortKey) {
      case 'name': return a.name.localeCompare(b.name, 'ko');
      case 'registered': return (b.registeredAt || '').localeCompare(a.registeredAt || '');
      case 'spent': return (b.totalSpent || 0) - (a.totalSpent || 0) || a.name.localeCompare(b.name, 'ko');
      default: { // 최근 방문순 — 방문 기록 없는 고객은 등록일로, 그래도 같으면 이름
        const av = a.lastVisitDate || (a.registeredAt || '').slice(0, 10);
        const bv = b.lastVisitDate || (b.registeredAt || '').slice(0, 10);
        return bv.localeCompare(av) || a.name.localeCompare(b.name, 'ko');
      }
    }
  };
  // 개인정보 보존기간 경과 목록(?retention=1) — 대시보드 안내/칩에서 진입, 일괄 익명화 (P4, 2026-11-17)
  const retentionOnly = searchParams.get('retention') === '1';
  const retentionPolicy = getRetentionPolicy();
  const setRetentionOnly = (on: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (on) next.set('retention', '1'); else next.delete('retention');
    setSearchParams(next, { replace: true });
  };

  // 고객 추가 모달
  const [showAddModal, setShowAddModal] = useState(false);
  // 대시보드 빠른 작업(/customers?new=1) → 바로 등록 모달
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setShowAddModal(true);
    const next = new URLSearchParams(searchParams); next.delete('new');
    setSearchParams(next, { replace: true }); // 뒤로가기 때 추가 모달이 다시 뜨지 않게 (리뷰 2026-11-17)
  }, [searchParams, setSearchParams]);
  // 대시보드 카드(회차권 임박 등)에서 /customers?open=<id> → 해당 고객 상세를 바로 연다 (2026-11-17)
  useEffect(() => {
    const id = searchParams.get('open');
    if (!id) return;
    const target = CustomerStore.getById(id);
    if (target) setSelected(target);
    const next = new URLSearchParams(searchParams); next.delete('open');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [addForm, setAddForm] = useState({ name: '', phone: '', email: '', address: '', gender: '여성' as Gender, grade: '신규' as CustomerGrade, skinType: '', memo: '', birthDate: '', referralSource: '' });
  const [addPrivacyConsent, setAddPrivacyConsent] = useState(false);

  // 고객 수정 모달
  const [showEditModal, setShowEditModal] = useState(false);
  // 모바일/데스크톱 패널이 둘 다 DOM에 있어 타임랩스(NAS 동기화·사진 디코딩)가 2회 돌던 것을 활성 레이아웃만 렌더
  const isMobileLayout = useIsMobileLayout();
  // 타임랩스가 NAS에서 사진을 받아오면 최근 시술 썸네일도 같은 데이터를 다시 읽도록 리렌더
  const [photoTick, setPhotoTick] = useState(0);
  const [detailTick, setDetailTick] = useState(0); // loadAll마다 증가 — 활동 타임라인 재계산 (2026-11-18)
  const photoCacheVersion = usePhotoCacheVersion(); // IndexedDB 캐시가 비동기로 채워지면 썸네일·상담 사진을 다시 읽는다
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', address: '', gender: '여성' as Gender, grade: '신규' as CustomerGrade, skinType: '', memo: '', birthDate: '', referralSource: '' });

  // 엑셀 업로드용 파일 input ref
  const importInputRef = useRef<HTMLInputElement>(null);

  // 등급(VIP) 변경 드롭다운
  const [showGradeMenu, setShowGradeMenu] = useState(false);

  // 선택된 고객의 등급을 변경 (뱃지 클릭 → 드롭다운)
  function changeGrade(grade: CustomerGrade) {
    if (!selected || selected.grade === grade) { setShowGradeMenu(false); return; }
    CustomerStore.update(selected.id, { grade });
    loadAll();          // 목록 뱃지도 갱신
    const updated = CustomerStore.getById(selected.id);
    if (updated) setSelected(updated);
    setShowGradeMenu(false);
  }

  // 프로그램 등록 모달
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false); // 중복 고객 병합 (2026-11-18)
  const [manageProgram, setManageProgram] = useState<CustomerProgram | null>(null); // 프로그램 만료일·회차·완료 관리 (2026-11-18)
  const handleProgramManaged = () => {
    setManageProgram(null);
    if (selected) setCustomerPrograms(CustomerProgramStore.getByCustomer(selected.id));
    loadAll();
  };
  const [mergeQuery, setMergeQuery] = useState(''); // 중복 의심 안내에서 열면 전화번호가 미리 입력된다
  const samePhone = useMemo(() => (selected ? findSamePhoneCustomers(selected, customers) : []), [selected, customers]);
  const openMergeFromHint = () => { setMergeQuery(selected?.phone ?? ''); setShowMergeModal(true); };
  const dupHint = samePhone.length > 0 && (
    <button type="button" onClick={openMergeFromHint} data-testid="dup-hint"
      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 hover:bg-amber-100">
      <GitMerge size={12} />같은 전화번호 고객 {samePhone.length}명 — 병합하기
    </button>
  );
  const [progForm, setProgForm] = useState({ programId: '', pricePaid: '', paymentMethod: '카드' as PaymentMethod, purchaseDate: today(), notes: '' });

  // 시술 기록 (차감) 모달
  const [showTreatmentModal, setShowTreatmentModal] = useState(false);
  const [treatForm, setTreatForm] = useState({
    customerProgramId: '',
    staffName: '',
    treatmentDate: today(),
    treatmentTime: '',
    treatmentDetails: '',
    skinCondition: '',
    staffNotes: '',
    nextAppointment: '',
  });

  // 피부상담 모달
  const [showConsultModal, setShowConsultModal] = useState(false);
  const [consultForm, setConsultForm] = useState(emptyConsultForm());
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  // 같은 모달 세션에서 재저장 시 신규 생성 대신 갱신하기 위한 저장 id
  const [savedConsultId, setSavedConsultId] = useState<string | null>(null);

  // AI 피부 분석 (킬러①) — 사진 업로드 → 비전 AI 분석 → 지표/소견 자동 반영
  const [aiPhoto, setAiPhoto] = useState<string | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<SkinAnalysisResult | null>(null);
  const consultPhotoRef = useRef<HTMLInputElement>(null);
  const aiPhotoIdRef = useRef(makePhotoId()); // 저장+카톡 → 저장 재호출 시에도 같은 사진 id 유지

  // Before/After 비교 이미지를 상담 기록에 첨부 (킬러② 잔여 항목, 2026-11-17)
  const [baPhotos, setBaPhotos] = useState<DatedPhoto[]>([]);
  const [baBefore, setBaBefore] = useState(0);
  const [baAfter, setBaAfter] = useState(0);
  const [comparison, setComparison] = useState<{ id: string; dataUrl: string; blob: Blob; days: number | null; restored?: boolean; takenAt?: string } | null>(null);
  const editPhotosRef = useRef<{ had: boolean; aiTakenAt?: string }>({ had: false }); // 수정 세션이 사진을 갖고 시작했는지 — 없던 기록에 빈 tombstone을 보내지 않게
  const [comparing, setComparing] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxPhoto | null>(null);
  const [consultPhotoTick, setConsultPhotoTick] = useState(0);

  // 상담 결과지 PDF — 고객에게 건네는 A4 (PC 내려받기 / 모바일 공유 시트) (2026-11-17)
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  async function handleConsultPdf(c: Consultation) {
    if (!selected || pdfBusyId) return;
    setPdfBusyId(c.id);
    try {
      const result = await exportConsultationPdf(c, selected);
      if (result === 'downloaded') notify('상담 결과지 PDF를 내려받았습니다.');
    } catch (e) {
      notify(e instanceof Error ? e.message : '상담 결과지를 만들지 못했습니다.');
    } finally {
      setPdfBusyId(null);
    }
  }

  // 상담 모달 열기 — 여는 버튼 4곳이 같은 초기화를 쓴다. 렌더 전에 동기 초기화해 이전 고객의 AI 사진이 한 프레임 비치지 않게 (리뷰 2026-11-17)
  function openConsultModal() {
    if (!selected) return;
    const photos = collectCustomerPhotos(selected.id);
    setConsultForm(emptyConsultForm());
    setKakaoMsg(null);
    setSavedConsultId(null);
    setBaPhotos(photos);
    setBaBefore(0);
    setBaAfter(Math.max(0, photos.length - 1));
    setComparison(null);
    setAiPhoto(null);
    setAiResult(null);
    aiPhotoIdRef.current = makePhotoId();
    editPhotosRef.current = { had: false };
    setShowConsultModal(true);
  }

  // 기존 상담 수정 (2026-11-18) — 기록 값으로 폼을 채우고 savedConsultId를 둬 저장이 update로 가게. 사진은 상태로 되살린다(persistConsultation이 상태 기준으로 사진을 다시 쓰므로 비우면 삭제됨)
  async function openConsultEdit(c: Consultation) {
    if (!selected) return;
    const saved = await getPhotosAsync(`consult:${c.id}`); // 동기 getPhotos는 캐시 미적재 때 []라 사진을 지울 위험 — 반드시 읽어 온 뒤 연다
    if (saved === null) { notify('상담 사진을 읽지 못해 수정을 열 수 없습니다. 잠시 뒤 다시 시도해주세요.'); return; }
    const photos = collectCustomerPhotos(selected.id);
    const metrics: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.beaconMetrics || {})) if (typeof v === 'number') metrics[k] = String(v);
    setConsultForm({
      ...emptyConsultForm(),
      consultDate: c.consultDate,
      staffName: c.staffName || '',
      concerns: [...(c.concerns || [])],
      metrics,
      skinTypeResult: c.skinTypeResult || '',
      managerNote: c.managerNote || '',
      recommendedSolution: c.recommendedSolution || '',
      recommendedProducts: (c.recommendedProducts || []).join(', '),
      nextConsultDate: c.nextConsultDate || '',
    });
    setKakaoMsg(null);
    setSavedConsultId(c.id);
    setBaPhotos(photos);
    setBaBefore(0);
    setBaAfter(Math.max(0, photos.length - 1));
    const ai = saved.find(p => p.label === 'consult');
    const cmp = saved.find(p => p.label === 'compare');
    setAiPhoto(ai?.dataUrl ?? null);
    aiPhotoIdRef.current = ai?.id ?? makePhotoId();
    editPhotosRef.current = { had: saved.length > 0, aiTakenAt: ai?.takenAt };
    setComparison(cmp ? { id: cmp.id, dataUrl: cmp.dataUrl, blob: dataUrlToBlob(cmp.dataUrl), days: null, restored: true, takenAt: cmp.takenAt } : null);
    setAiResult(null);
    setShowConsultModal(true);
  }

  // 상담 모달을 IndexedDB 적재 전에 열었으면(빠른 탭) 적재 후 Before/After 후보를 다시 모은다
  useEffect(() => {
    if (!showConsultModal || !selected || baPhotos.length > 0) return;
    const photos = collectCustomerPhotos(selected.id);
    if (photos.length === 0) return;
    setBaPhotos(photos);
    setBaBefore(0);
    setBaAfter(photos.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoCacheVersion]);

  async function buildComparison() {
    if (!selected) return;
    const before = baPhotos[baBefore];
    const after = baPhotos[baAfter];
    if (!before || !after) return;
    setComparing(true);
    try {
      const blob = await renderComparison({ before, after, customerName: selected.name });
      // 상담 기록 저장용은 JPEG로 압축(PNG 1200×750 그대로 넣으면 localStorage 용량을 빨리 채운다)
      const dataUrl = await resizeImageFile(new File([blob], 'compare.png', { type: 'image/png' }), 1200, 0.8);
      setComparison({ id: makePhotoId(), dataUrl, blob, days: daysBetween(before.date, after.date) });
    } catch (e) {
      notify(e instanceof Error ? e.message : '비교 이미지를 만들지 못했습니다.');
    } finally {
      setComparing(false);
    }
  }

  async function exportComparison() {
    if (!comparison || !selected) return;
    try {
      const fileName = comparison.blob.type === 'image/jpeg' ? comparisonFileName(selected.name).replace(/\.png$/, '.jpg') : comparisonFileName(selected.name);
      const result = await exportFile(fileName, comparison.blob);
      if (result === 'downloaded') notify('비교 이미지를 내려받았습니다.');
    } catch (e) {
      notify(e instanceof Error ? e.message : '비교 이미지를 내보내지 못했습니다.');
    }
  }

  // 상담 결과 카카오 전송 상태
  const [kakaoSending, setKakaoSending] = useState(false);
  const [kakaoMsg, setKakaoMsg] = useState<string | null>(null);

  async function handleConsultPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(file, 1024, 0.85);
      setAiPhoto(dataUrl);
      setAiResult(null);
    } catch {
      notify('사진을 불러오지 못했습니다.');
    } finally {
      if (consultPhotoRef.current) consultPhotoRef.current.value = '';
    }
  }

  async function runSkinAnalysis() {
    if (!aiPhoto) return;
    setAiAnalyzing(true);
    try {
      const result = await analyzeSkinPhoto(aiPhoto);
      setAiResult(result);
      if (result.available && result.scores) {
        // 분석 점수를 비컨 지표 입력칸(문자열)으로 반영
        setConsultForm(f => ({
          ...f,
          metrics: {
            ...f.metrics,
            moisture: String(result.scores!.moisture),
            oil: String(result.scores!.oil),
            pigmentation: String(result.scores!.pigmentation),
            pore: String(result.scores!.pore),
            wrinkle: String(result.scores!.wrinkle),
          },
          managerNote: result.comment
            ? (f.managerNote ? `${f.managerNote}\n[AI 소견] ${result.comment}` : `[AI 소견] ${result.comment}`)
            : f.managerNote,
        }));
      }
    } finally {
      setAiAnalyzing(false);
    }
  }

  // 비컨(피부 상담) 기능 노출 — 관리자가 설정에서 토글. 기본 OFF(숨김).
  const [beaconEnabled, setBeaconEnabled] = useState(isBeaconConsultationEnabled());
  useEffect(() => onFeatureFlagsChanged(() => setBeaconEnabled(isBeaconConsultationEnabled())), []);
  // AI 피부분석 사용 가능 여부(본사 AI 중계 또는 지점 키) — 중계 상태는 비동기 조회라 변경 이벤트를 구독
  const [skinAiAvailable, setSkinAiAvailable] = useState(isSkinAnalysisAvailable());
  useEffect(() => {
    void refreshAiProxyStatus().then(() => setSkinAiAvailable(isSkinAnalysisAvailable()));
    return onAiProxyStatusChanged(() => setSkinAiAvailable(isSkinAnalysisAvailable()));
  }, []);

  useEffect(() => {
    loadAll();
    // 상담 기록 중앙 서버에서 1회 동기화 후 캐시 반영
    loadConsultations().catch(() => {});
  }, []);

  useEffect(() => {
    if (selected) {
      setCustomerPrograms(CustomerProgramStore.getByCustomer(selected.id));
      const list = ConsultationStore.getByCustomer(selected.id);
      setConsultations(list);
      // 상담 사진(AI 분석·비교 이미지)은 photoStore(NAS crm_photos)에 있으므로 다른 PC/앱에서 저장한 것도 받아온다
      syncPhotosFromNas(list.map(c => `consult:${c.id}`)).then(changed => { if (changed) setConsultPhotoTick(t => t + 1); });
    }
  }, [selected]);

  // 입력된 비컨 측정값(문자열)을 BeaconMetrics(숫자)로 변환
  function parseMetrics(m: Record<string, string>): BeaconMetrics {
    const out: BeaconMetrics = {};
    for (const { key } of BEACON_FIELDS) {
      const raw = m[key as string];
      if (raw !== undefined && raw !== '') {
        const n = Math.max(0, Math.min(100, parseInt(raw, 10)));
        if (!Number.isNaN(n)) (out as any)[key] = n;
      }
    }
    return out;
  }

  // 비컨값 입력 시 피부타입·솔루션 초안 자동 제안
  function applyDiagnosisDraft(nextMetrics: Record<string, string>, concerns: string[]) {
    const parsed = parseMetrics(nextMetrics);
    const type = deriveSkinType(parsed);
    const draft = buildSolutionDraft(parsed, concerns);
    setConsultForm(f => ({
      ...f,
      metrics: nextMetrics,
      skinTypeResult: f.skinTypeResult || type,
      recommendedSolution: draft,
    }));
  }

  // 상담 내용 저장 (공통) — 저장만 수행하고 폼 초기화/모달 닫기는 호출부에서 결정
  function persistConsultation() {
    if (!selected) return;
    const payload = {
      customerId: selected.id,
      customerName: selected.name,
      consultDate: consultForm.consultDate,
      staffName: consultForm.staffName || undefined,
      concerns: consultForm.concerns,
      beaconMetrics: parseMetrics(consultForm.metrics),
      skinTypeResult: consultForm.skinTypeResult || undefined,
      managerNote: consultForm.managerNote || undefined,
      recommendedSolution: consultForm.recommendedSolution || undefined,
      recommendedProducts: consultForm.recommendedProducts
        ? consultForm.recommendedProducts.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      nextConsultDate: consultForm.nextConsultDate || undefined,
      photos: [],
    };
    let consultId: string;
    if (savedConsultId && ConsultationStore.getById(savedConsultId)) {
      ConsultationStore.update(savedConsultId, payload);
      consultId = savedConsultId;
    } else {
      const saved = ConsultationStore.save(payload);
      setSavedConsultId(saved.id);
      consultId = saved.id;
    }
    // 상담 사진: AI 분석에 쓴 얼굴 사진 + Before/After 비교 이미지 (photoStore → NAS crm_photos)
    const takenAt = new Date().toISOString();
    const entries: PhotoEntry[] = [];
    if (aiPhoto) entries.push({ id: aiPhotoIdRef.current, dataUrl: aiPhoto, label: 'consult', takenAt: editPhotosRef.current.aiTakenAt ?? takenAt });
    if (comparison) entries.push({ id: comparison.id, dataUrl: comparison.dataUrl, label: 'compare', takenAt: comparison.takenAt ?? takenAt });
    if (entries.length > 0) {
      try { savePhotos(`consult:${consultId}`, entries); } catch { notify('사진 저장 용량을 초과해 상담 사진은 저장되지 않았습니다.'); }
      setConsultPhotoTick(t => t + 1);
    } else if (savedConsultId && editPhotosRef.current.had) {
      // 저장+카톡 전송으로 한 번 저장한 뒤 [제거]하고 다시 저장한 경우 — 기록의 사진도 지운다 (NAS tombstone 포함)
      clearPhotos(`consult:${consultId}`);
      setConsultPhotoTick(t => t + 1);
    }
    // 상담에서 판정한 피부타입을 고객 프로필에도 반영(있을 때)
    // 옛 상담을 고칠 때 그 기록의 피부타입이 최신 판정을 덮지 않게 — 최신 기록(또는 새 기록)일 때만 프로필 동기
    const isLatestRecord = !savedConsultId || consultations[0]?.id === savedConsultId;
    if (isLatestRecord && consultForm.skinTypeResult && consultForm.skinTypeResult !== selected.skinType) {
      CustomerStore.update(selected.id, { skinType: consultForm.skinTypeResult });
      const updated = CustomerStore.getById(selected.id);
      if (updated) setSelected(updated);
    }
    setConsultations(ConsultationStore.getByCustomer(selected.id));
    setDetailTick(t => t + 1); // 활동 타임라인(소견·판정)도 바로 갱신
  }

  // 피부상담 저장
  function handleSaveConsultation(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    persistConsultation();
    setShowConsultModal(false);
    setConsultForm(emptyConsultForm());
    setSavedConsultId(null);
  }

  // 상담 요약을 카카오 메시지 본문으로 구성
  function buildConsultationMessage(): string {
    const shopName = SettingsStore.get()?.name || '더마솔루션';
    const lines = [`[${shopName}] ${selected?.name}님 피부 상담 결과`, ''];
    lines.push(`· 상담일: ${consultForm.consultDate}`);
    if (consultForm.skinTypeResult) lines.push(`· 피부 타입: ${consultForm.skinTypeResult}`);
    if (consultForm.concerns.length) lines.push(`· 주요 고민: ${consultForm.concerns.join(', ')}`);
    if (consultForm.recommendedSolution) lines.push('', `▷ 추천 솔루션\n${consultForm.recommendedSolution}`);
    if (consultForm.recommendedProducts) lines.push('', `▷ 추천 제품\n${consultForm.recommendedProducts}`);
    if (consultForm.nextConsultDate) lines.push('', `· 다음 상담 예정일: ${consultForm.nextConsultDate}`);
    lines.push('', '※ 본 상담은 의료 진단·처방·치료가 아닌 피부 관리 소견입니다.');
    return lines.join('\n');
  }

  // 상담 저장 후 상담 내용을 카카오로 전송
  async function handleSaveAndSendKakao() {
    if (!selected) return;
    if (savedConsultId && !window.confirm('이미 저장된 상담입니다. 결과를 고객에게 다시 보낼까요? (발송 이력이 한 건 더 남습니다)')) return;
    persistConsultation();
    setKakaoSending(true);
    setKakaoMsg(null);
    const content = buildConsultationMessage();
    const result = await sendMessages({
      type: 'kakao-channel',
      content,
      title: `${selected.name}님 피부 상담 결과`,
      recipients: 1,
      phones: selected.phone ? [selected.phone] : [],
    });
    MessageHistoryStore.save({
      type: 'kakao-channel',
      templateName: '상담 결과 안내',
      title: `${selected.name}님 피부 상담 결과`,
      content,
      recipients: 1,
      successCount: result.pending ? 0 : result.sent,
      failCount: result.pending ? 1 : result.failed,
      sentAt: new Date().toLocaleString(),
      status: !result.pending && result.sent > 0 ? 'sent' : 'failed',
      cost: !result.pending && result.sent > 0 ? 5 : 0,
    });
    setKakaoSending(false);
    if (result.pending) {
      setKakaoMsg('상담은 저장됐어요. 단, 카카오 발송 게이트웨이가 아직 연동되지 않아 실제 전송은 되지 않았습니다 (설정>연동에서 준비 예정). 발송 이력에 기록됨.');
    } else if (result.sent > 0) {
      setKakaoMsg(`상담 저장 완료 · ${selected.name}님에게 카카오로 상담 결과를 전송했습니다.`);
    } else {
      setKakaoMsg(`상담은 저장됐으나 카카오 전송에 실패했습니다: ${result.reason ?? '알 수 없는 오류'}`);
    }
  }

  function toggleConcern(item: string) {
    setConsultForm(f => {
      const has = f.concerns.includes(item);
      const concerns = has ? f.concerns.filter(c => c !== item) : [...f.concerns, item];
      return { ...f, concerns };
    });
  }

  // 홈케어 추천용 피부 문제(세트 타입) 토글
  function toggleHomecareProblem(problem: string) {
    setConsultForm(f => {
      const has = f.homecareProblems.includes(problem);
      const homecareProblems = has
        ? f.homecareProblems.filter(p => p !== problem)
        : [...f.homecareProblems, problem];
      return { ...f, homecareProblems };
    });
  }

  // 체크된 피부 문제 → 추천 홈케어 세트를 '추천 제품·솔루션' 칸에 자동 반영
  function applyHomecareRecommendation() {
    const sets = recommendHomecare(consultForm.homecareProblems);
    if (sets.length === 0) return;
    // 추천 제품: 세트별 스텝 제품을 중복 없이 모음
    const products = Array.from(new Set(sets.flatMap(s => s.steps)));
    // 솔루션 요약: 세트명 + 설명
    const summary = sets.map(s => `[${s.name}] ${s.description}`).join('\n');
    setConsultForm(f => ({
      ...f,
      recommendedProducts: products.join(', '),
      recommendedSolution: f.recommendedSolution
        ? `${f.recommendedSolution}\n\n■ 추천 홈케어\n${summary}`
        : `■ 추천 홈케어\n${summary}`,
    }));
  }

  // 신규 → 일반(기존고객) 자동 승급: 등록 90일 경과 + 시술 3회 이상
  // (목록을 불러올 때마다 점검 — 조건 충족 시 1회만 승급되고 이후엔 '신규'가 아니라 재실행 안 됨)
  function autoPromoteNewCustomers() {
    const NINETY_DAYS = 90 * 86400000;
    const now = Date.now();
    CustomerStore.getAll().forEach(c => {
      if (c.grade !== '신규' || c.id.startsWith('sample_') || !c.registeredAt) return;
      const aged = now - new Date(c.registeredAt).getTime() >= NINETY_DAYS;
      if (!aged) return;
      const treatmentCount = TreatmentLogStore.getByCustomer(c.id).length;
      if (treatmentCount >= 3) {
        CustomerStore.update(c.id, { grade: '일반' });
      }
    });
  }

  function loadAll() {
    setDetailTick(t => t + 1);
    autoPromoteNewCustomers();
    setCustomers(CustomerStore.getAll());
    // Pull from ProgramStore first; if empty, create Program-like entries from ServiceStore
    const storePrograms = ProgramStore.getAll().filter(p => p.isActive);
    if (storePrograms.length > 0) {
      setPrograms(storePrograms);
    } else {
      // Fallback: convert ServiceStore entries to Program-compatible objects
      const services = ServiceStore.getAll().filter(s => s.isActive);
      const serviceAsPrograms: Program[] = services.map(s => ({
        id: s.id,
        shopId: '',
        name: s.name,
        category: s.category || '',
        totalSessions: null,
        validityDays: null,
        price: s.price,
        costPrice: 0,
        color: '#1a3a8f',
        isActive: true,
        createdAt: '',
      }));
      setPrograms(serviceAsPrograms);
    }
  }

  // 보존기간 경과 고객 id — 고객 목록이나 정책이 바뀔 때만 재계산
  const expiredIds = useMemo(
    () => new Set(getExpiredCustomers().map(c => c.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customers, retentionPolicy.enabled, retentionPolicy.years],
  );
  // 필터링
  const filtered = customers.filter(c => {
    const matchSearch = matchesSearch(search, [c.name, c.phone, c.email]);
    const matchGrade = gradeFilter === '전체' || c.grade === gradeFilter;
    const matchRetention = !retentionOnly || expiredIds.has(c.id);
    return matchSearch && matchGrade && matchRetention;
  }).sort(compareCustomers);

  function handleAnonymizeExpired() {
    const targets = filtered.filter(c => expiredIds.has(c.id) && !isAnonymized(c));
    if (targets.length === 0) return;
    if (!window.confirm(`보존기간이 지난 고객 ${targets.length}명을 익명화할까요?\n고객 정보와 예약·시술·결제·상담 기록의 이름·전화, 시술·상담 사진이 지워지며 되돌릴 수 없습니다. 방문·결제 통계는 남습니다.`)) return;
    const n = anonymizeCustomers(targets.map(c => c.id));
    notify(`고객 ${n}명을 익명화했습니다.`);
    setSelected(null);
    loadAll();
  }

  // 고객 기록 엑셀(xlsx) 다운로드 — 현재 필터된 목록을 이메일 포함 전체 항목으로 내보냄
  function exportToExcel() {
    if (filtered.length === 0) { notify('내보낼 고객이 없습니다.'); return; }
    const role = user?.role ?? 'staff';
    const rows = filtered.map(c => ({
      '이름': c.name,
      '전화번호': maskPhone(c.phone, role),
      '이메일': role !== 'staff' ? (c.email || '') : '',
      '주소': role !== 'staff' ? (c.address || '') : '',
      '성별': c.gender,
      '등급': c.grade,
      '생년월일': c.birthDate || '',
      '피부유형': c.skinType || '',
      '총방문(회)': c.totalVisits ?? 0,
      '누적결제(원)': c.totalSpent ?? 0,
      '마지막방문': c.lastVisitDate || '',
      '등록일': c.registeredAt ? String(c.registeredAt).split('T')[0] : '',
      '유입경로': c.referralSource || '',
      '태그': (c.tags || []).join(', '),
      '메모': c.memo || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 15 }, { wch: 22 }, { wch: 20 }, { wch: 6 },
      { wch: 6 }, { wch: 12 }, { wch: 9 }, { wch: 9 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 24 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '고객목록');
    writeWorkbook(wb, `고객목록_${today()}.xlsx`).catch(e => notify(e instanceof Error ? e.message : '엑셀 파일을 내보내지 못했습니다.'));
  }

  // 업로드 가이드 모달 — 양식을 모르면 쓸 수 없는 기능이라 안내+양식 다운로드를 먼저 보여줌
  const [showImportGuide, setShowImportGuide] = useState(false);

  // 업로드 양식 엑셀 다운로드 (헤더 + 예시 2행)
  function downloadImportTemplate() {
    const rows = [
      {
        '이름': '홍길동', '전화번호': '010-1234-5678', '성별': '여성', '등급': 'VIP',
        '생년월일': '1990-01-15', '피부유형': '건성', '유입경로': '인스타그램',
        '이메일': 'hong@example.com', '주소': '서울시 강남구', '메모': '민감성 피부, 향 알러지',
      },
      {
        '이름': '김철수', '전화번호': '010-9876-5432', '성별': '남성', '등급': '신규',
        '생년월일': '', '피부유형': '', '유입경로': '지인 소개',
        '이메일': '', '주소': '', '메모': '',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 6 }, { wch: 6 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '고객업로드양식');
    writeWorkbook(wb, '고객_업로드_양식.xlsx').catch(e => notify(e instanceof Error ? e.message : '양식 파일을 내보내지 못했습니다.'));
  }

  // 고객 엑셀/CSV 대량 업로드 — 다운로드와 동일한 헤더(이름/전화번호/이메일/성별/등급/생년월일/피부유형/유입경로/메모)를 인식
  function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
        if (rows.length === 0) { notify('시트에 데이터가 없습니다.'); return; }

        const pick = (r: Record<string, any>, keys: string[]) => {
          for (const k of keys) {
            const hit = Object.keys(r).find(col => col.replace(/\s/g, '') === k);
            if (hit && String(r[hit]).trim() !== '') return String(r[hit]).trim();
          }
          return '';
        };
        const normGender = (g: string): Gender => (g === '남성' || g === '남' ? '남성' : g === '여성' || g === '여' ? '여성' : '미입력');
        const normGrade = (g: string): CustomerGrade => (GRADES as string[]).includes(g) ? g as CustomerGrade : '신규';

        // 기존 전화번호로 중복 스킵
        const existingPhones = new Set(CustomerStore.getAll().map(c => c.phone.replace(/[^0-9]/g, '')));
        let added = 0, skipped = 0;
        rows.forEach(r => {
          const name = pick(r, ['이름', '고객명', '성함', 'name']);
          let phone = pick(r, ['전화번호', '연락처', '휴대폰', '전화', 'phone']);
          if (!name || !phone) { skipped++; return; }
          let digits = phone.replace(/[^0-9]/g, '');
          // 엑셀 숫자 셀 함정: 앞 0이 사라진 번호(10xxxxxxxx) 복원
          if (digits.startsWith('10') && (digits.length === 9 || digits.length === 10)) {
            digits = '0' + digits;
            phone = digits;
          }
          if (existingPhones.has(digits)) { skipped++; return; }
          existingPhones.add(digits);
          // 엑셀 날짜 시리얼 숫자로 들어온 생년월일 변환
          let birthDate = pick(r, ['생년월일', '생일', 'birthDate']);
          if (/^\d+$/.test(birthDate)) {
            const n = parseInt(birthDate, 10);
            if (n >= 20000 && n <= 60000) {
              birthDate = new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().split('T')[0];
            }
          }
          CustomerStore.save({
            name, phone,
            gender: normGender(pick(r, ['성별', 'gender'])),
            grade: normGrade(pick(r, ['등급', 'grade'])),
            skinType: pick(r, ['피부유형', '피부타입', 'skinType']),
            memo: pick(r, ['메모', '비고', 'memo']),
            birthDate: birthDate || undefined,
            referralSource: pick(r, ['유입경로', '유입', 'referralSource']) || undefined,
            email: pick(r, ['이메일', 'email']) || undefined,
            address: pick(r, ['주소', 'address']) || undefined,
            allergies: undefined, tags: [], isActive: true,
          });
          added++;
        });
        loadAll();
        notify(`고객 업로드 완료: ${added}명 추가, ${skipped}건 건너뜀(이름/전화 누락 또는 중복).`);
      } catch (err) {
        notify('파일을 읽는 중 오류가 발생했습니다. 엑셀(.xlsx) 또는 CSV 형식인지 확인해주세요.');
      } finally {
        if (importInputRef.current) importInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // 고객 추가
  function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    // 필수값 + 전화번호 중복 방지 (같은 고객이 두 레코드로 쪼개지지 않도록)
    if (!addForm.name.trim() || !addForm.phone.trim()) {
      notify('이름과 전화번호는 필수입니다.');
      return;
    }
    if (!addPrivacyConsent) {
      notify('개인정보 수집·이용 동의가 필요합니다. 고객에게 동의를 받은 뒤 체크해주세요.');
      return;
    }
    const normalize = (p: string) => p.replace(/\D/g, '');
    const newPhone = normalize(addForm.phone);
    const dup = CustomerStore.getAll().find(c => normalize(c.phone) === newPhone && newPhone !== '');
    if (dup) {
      notify(`이미 등록된 번호입니다: ${dup.name} (${dup.phone})\n기존 고객 정보를 사용해주세요.`);
      return;
    }
    CustomerStore.save({
      name: addForm.name, phone: addForm.phone,
      gender: addForm.gender, grade: addForm.grade,
      skinType: addForm.skinType, memo: addForm.memo,
      birthDate: addForm.birthDate || undefined,
      referralSource: addForm.referralSource || undefined,
      email: addForm.email.trim() || undefined, allergies: undefined,
      address: addForm.address.trim() || undefined,
      tags: [], isActive: true,
      privacyConsent: true, privacyConsentAt: new Date().toISOString(),
    });
    setShowAddModal(false);
    setAddForm({ name: '', phone: '', email: '', address: '', gender: '여성', grade: '신규', skinType: '', memo: '', birthDate: '', referralSource: '' });
    setAddPrivacyConsent(false);
    loadAll();
  }

  // 고객 수정 — 상세에서 '수정' 클릭 시 현재 값으로 폼 채우고 모달 오픈
  function openEditModal() {
    if (!selected) return;
    setEditForm({
      name: selected.name, phone: selected.phone,
      email: selected.email ?? '', address: selected.address ?? '',
      gender: selected.gender,
      grade: selected.grade, skinType: selected.skinType ?? '',
      memo: selected.memo ?? '', birthDate: selected.birthDate ?? '',
      referralSource: selected.referralSource ?? '',
    });
    setShowEditModal(true);
  }

  function handleEditCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    CustomerStore.update(selected.id, {
      name: editForm.name, phone: editForm.phone,
      gender: editForm.gender, grade: editForm.grade,
      skinType: editForm.skinType, memo: editForm.memo,
      birthDate: editForm.birthDate || undefined,
      referralSource: editForm.referralSource || undefined,
      email: editForm.email.trim() || undefined,
      address: editForm.address.trim() || undefined,
    });
    const updated = CustomerStore.getById(selected.id);
    if (updated) setSelected(updated);
    setShowEditModal(false);
    loadAll();
  }

  // 고객 삭제 — 2단계 확인 후 제거
  function handleMerged() {
    if (!selected) return;
    setShowMergeModal(false);
    setMergeQuery('');
    const updated = CustomerStore.getById(selected.id);
    setSelected(updated ?? null);
    loadAll();
  }

  function handleDeleteCustomer() {
    if (!selected) return;
    if (!window.confirm(`'${selected.name}' 고객을 삭제할까요?\n등록된 상담·시술 기록은 남지만 고객 정보는 복구할 수 없습니다.`)) return;
    CustomerStore.delete(selected.id);
    setSelected(null);
    loadAll();
  }

  // 프로그램 등록
  function handleRegisterProgram(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const prog = programs.find(p => p.id === progForm.programId);
    if (!prog) return;

    // 결제금액: 빈칸이면 정가, 입력했으면 그 값(0원 이벤트도 유효). 잘못된 값은 차단.
    const rawPrice = progForm.pricePaid.replace(/,/g, '').trim();
    let pricePaid = prog.price;
    if (rawPrice !== '') {
      const parsed = parseInt(rawPrice, 10);
      if (Number.isNaN(parsed) || parsed < 0) {
        notify('결제 금액을 올바르게 입력해주세요. (0 이상 숫자)');
        return;
      }
      pricePaid = parsed;
    }

    CustomerProgramStore.save({
      customerId: selected.id,
      customerName: selected.name,
      programId: prog.id,
      programName: prog.name,
      category: prog.category,
      totalSessions: prog.totalSessions,
      pricePaid,
      paymentMethod: progForm.paymentMethod,
      purchaseDate: progForm.purchaseDate,
      expiryDate: calcExpiryDate(prog.validityDays, progForm.purchaseDate),
      notes: progForm.notes || undefined,
    });

    setShowProgramModal(false);
    setProgForm({ programId: '', pricePaid: '', paymentMethod: '카드', purchaseDate: today(), notes: '' });
    setCustomerPrograms(CustomerProgramStore.getByCustomer(selected.id));
    loadAll();
    // 결제 저장으로 누적결제액(totalSpent)이 갱신됐으므로 상세 헤더도 즉시 반영
    const updated = CustomerStore.getById(selected.id);
    if (updated) setSelected(updated);
  }

  // 시술 기록 (회차 차감)
  function handleTreatment(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;

    TreatmentLogStore.save({
      customerId: selected.id,
      customerName: selected.name,
      customerProgramId: treatForm.customerProgramId || undefined,
      programName: treatForm.customerProgramId
        ? customerPrograms.find(cp => cp.id === treatForm.customerProgramId)?.programName
        : undefined,
      staffName: treatForm.staffName || undefined,
      treatmentDate: treatForm.treatmentDate,
      treatmentTime: treatForm.treatmentTime || undefined,
      sessionsUsed: 1,
      treatmentDetails: treatForm.treatmentDetails || undefined,
      skinCondition: treatForm.skinCondition || undefined,
      staffNotes: treatForm.staffNotes || undefined,
      nextAppointment: treatForm.nextAppointment || undefined,
    });

    setShowTreatmentModal(false);
    setTreatForm({ customerProgramId: '', staffName: '', treatmentDate: today(), treatmentTime: '', treatmentDetails: '', skinCondition: '', staffNotes: '', nextAppointment: '' });
    setCustomerPrograms(CustomerProgramStore.getByCustomer(selected.id));
    const updated = CustomerStore.getById(selected.id);
    if (updated) setSelected(updated);
    loadAll();
  }

  const selectedProgForForm = programs.find(p => p.id === progForm.programId);

  return (
    <div className="flex flex-col h-full">

      {/* ── 모바일 뷰 (< lg) ── 카드 리스트 */}
      <div className="flex flex-col lg:hidden flex-1">
        {/* 검색바 + 필터 */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 pt-3 pb-2 shadow-sm">
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="고객명, 전화번호 검색"
                className="w-full h-10 pl-9 pr-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {/* 모바일 고객 등록 (2026-11-17) — 스토어 앱 심사 대비: 핵심 기능이 PC 전용이면 '앱으로서 불완전' 판정 위험 */}
            <button
              onClick={() => setShowAddModal(true)}
              aria-label="고객 추가"
              className="flex-shrink-0 h-10 w-10 bg-[#1a3a8f] text-white rounded-xl flex items-center justify-center active:scale-95 transition"
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar pr-6">
            {(['전체', ...GRADES] as const).map(g => (
              <button
                key={g}
                onClick={() => setGradeFilter(g)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  gradeFilter === g ? 'bg-[#1a3a8f] text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {g}
              </button>
            ))}
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              aria-label="정렬"
              className="flex-shrink-0 px-2 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 border-0 focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
            >
              {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            {retentionPolicy.enabled && (
              <button
                type="button"
                onClick={() => setRetentionOnly(!retentionOnly)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${retentionOnly ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
                title={`마지막 방문 후 ${retentionPolicy.years}년이 지난 고객`}
              >
                보존기간 경과 {expiredIds.size}
              </button>
            )}
          </div>
          {retentionOnly && (
            <div className="mt-2 flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl" data-testid="retention-bar">
              <p className="text-xs text-amber-800 min-w-0">보존기간({retentionPolicy.years}년) 경과 {filtered.length}명 — 개인 식별 정보·기록의 이름·사진을 지우고 통계만 남깁니다</p>
              <button
                type="button"
                onClick={handleAnonymizeExpired}
                disabled={filtered.length === 0}
                className="flex-shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                {filtered.length}명 익명화
              </button>
            </div>
          )}
        </div>

        {/* 카드 목록 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <User size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">고객이 없습니다</p>
              <button onClick={() => setShowAddModal(true)} className="mt-3 px-4 py-2 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium">
                첫 고객 등록하기
              </button>
            </div>
          ) : (
            filtered.map(customer => {
              const daysSince = getDaysSince(customer.lastVisitDate);
              return (
                <button
                  key={customer.id}
                  onClick={() => {
                    setSelected(customer);
                    setCustomerPrograms(CustomerProgramStore.getByCustomer(customer.id));
                  }}
                  className="w-full bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-left min-h-[72px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {customer.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{customer.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${GRADE_COLORS[customer.grade]}`}>
                          {customer.grade}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {maskPhone(customer.phone, user?.role ?? 'staff')}
                      </p>
                      <p className="text-xs text-gray-400">
                        {daysSince === null ? '방문 기록 없음' : daysSince === 0 ? '오늘 방문' : `${daysSince}일 전 방문`} · 방문 {customer.totalVisits}회
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* 모바일 고객 상세 — 풀스크린 모달 (활성 레이아웃일 때만 마운트) */}
        {selected && isMobileLayout && (
          <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
            {/* 헤더 */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm">
              <button
                onClick={() => setSelected(null)}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200"
                aria-label="뒤로가기"
              >
                <ChevronRight size={18} className="rotate-180 text-gray-600" />
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-gray-900">{selected.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${GRADE_COLORS[selected.grade]}`}>
                    {selected.grade}
                  </span>
                </div>
              </div>
            </div>

            {/* 상세 콘텐츠 스크롤 */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {/* 기본 정보 */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-3">기본 정보</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">전화번호</span>
                    <span className="text-xs font-medium text-gray-900">{maskPhone(selected.phone, user?.role ?? 'staff')}</span>
                  </div>
                  {selected.email && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">이메일</span>
                      <span className="text-xs font-medium text-gray-900 truncate ml-2">{selected.email}</span>
                    </div>
                  )}
                  {selected.birthDate && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">생년월일</span>
                      <span className="text-xs font-medium text-gray-900">{selected.birthDate}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">피부 타입</span>
                    <span className="text-xs font-medium text-gray-900">{selected.skinType || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">총 방문</span>
                    <span className="text-xs font-medium text-gray-900">{selected.totalVisits}회</span>
                  </div>
                  {selectedNoShows > 0 && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">노쇼</span>
                      <span className="text-xs font-medium text-rose-600">{selectedNoShows}회</span>
                    </div>
                  )}
                  {dupHint}
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">총 결제</span>
                    <span className="text-xs font-medium text-gray-900">{(selected.totalSpent || 0).toLocaleString()}원</span>
                  </div>
                  {selected.lastVisitDate && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">마지막 방문</span>
                      <span className="text-xs font-medium text-gray-900">{formatDate(selected.lastVisitDate)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">다음 방문 권장</span>
                    <RevisitBadge customerId={selected.id} size="sm" />
                  </div>
                </div>
                <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">메모</p>
                  {selected.memo ? <p className="text-xs text-gray-700 whitespace-pre-line">{selected.memo}</p> : <p className="text-xs text-gray-300">메모 없음</p>}
                  {quickMemoRow(true)}
                </div>
              </div>

              {/* 피부 상담 이력 (모바일) */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase">피부 상담 이력</p>
                  <button
                    onClick={openConsultModal}
                    className="text-xs font-medium text-indigo-600 flex items-center gap-1"
                  >
                    <Sparkles size={12} />상담 기록
                  </button>
                </div>
                {consultations.length === 0 ? (
                  <div className="text-center py-3">
                    <p className="text-xs text-gray-400">상담 기록이 없어요</p>
                    <button type="button" onClick={openConsultModal} className="mt-2 text-xs font-medium text-indigo-600 hover:underline">첫 상담 시작하기</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {consultations.slice(0, 5).map(c => (
                      <div key={c.id} className="p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-800">{c.consultDate}</p>
                          {c.skinTypeResult && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{c.skinTypeResult}</span>}
                        </div>
                        {c.concerns.length > 0 && <p className="text-xs text-gray-600 mt-0.5">{c.concerns.join(', ')}</p>}
                        {c.recommendedSolution && <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{c.recommendedSolution}</p>}
                        <ConsultPhotoStrip consultId={c.id} consultDate={c.consultDate} customerName={selected.name} tick={consultPhotoTick + photoCacheVersion} onOpen={setLightbox} />
                        <button
                          type="button"
                          onClick={() => handleConsultPdf(c)}
                          disabled={pdfBusyId === c.id}
                          aria-label={`${formatDate(c.consultDate)} 상담 결과지 PDF`}
                          className="mt-2 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-indigo-100 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          <FileText size={12} />{pdfBusyId === c.id ? '만드는 중...' : '결과지 PDF'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openConsultEdit(c)}
                          aria-label={`${formatDate(c.consultDate)} 상담 수정`}
                          className="mt-2 ml-1.5 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
                        >
                          <Pencil size={12} />수정
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>


              {/* 프로그램 목록 */}
              {customerPrograms.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-3">등록 프로그램</p>
                  <div className="space-y-2">
                    {customerPrograms.map(cp => (
                      <div key={cp.id} className="p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-semibold text-gray-800">{cp.programName}</p>
                          <span className="flex items-center gap-1.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                              !cp.isCompleted ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                            }`}>{!cp.isCompleted ? '진행중' : '완료'}</span>
                            <button type="button" onClick={() => setManageProgram(cp)} aria-label={`${cp.programName} 관리`}
                              className="px-2 py-0.5 text-[11px] font-medium rounded-lg bg-white border border-gray-200 text-gray-600">관리</button>
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400">결제 {formatPrice(cp.pricePaid)} · 등록 {formatDate(cp.purchaseDate)}{cp.expiryDate ? ` · 만료일 ${formatDate(cp.expiryDate)}` : ''}</p>
                        {cp.totalSessions != null && (
                          <p className="text-xs text-gray-500">
                            {cp.usedSessions || 0}/{cp.totalSessions}회 · 잔여 {(cp.totalSessions - (cp.usedSessions || 0))}회
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Before/After 타임랩스 — 시술 사진이 있을 때만 (2026-11-17 모바일에도 노출) */}
              <TimelapseViewer customerId={selected.id} customerName={selected.name} onSynced={() => setPhotoTick(t => t + 1)} />

              {/* 최근 시술 기록 */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-3">최근 시술 기록</p>
                {(() => {
                  const logs = TreatmentLogStore.getByCustomer(selected.id).slice(0, 5);
                  if (logs.length === 0) return <p className="text-xs text-gray-400 text-center py-3">시술 기록이 없어요</p>;
                  return (
                    <div className="space-y-2">
                      {logs.map(log => (
                        <div key={log.id} className="p-3 bg-slate-50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-gray-800">{log.treatmentDate}</p>
                            {log.staffName && <span className="text-[11px] text-gray-400">{log.staffName}</span>}
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5">{log.treatmentDetails || log.programName || '시술 내역 없음'}</p>
                          {log.skinCondition && <p className="text-[11px] text-gray-400 mt-0.5">피부 상태: {log.skinCondition}</p>}
                          <TreatmentPhotoStrip logId={log.id} treatmentDate={log.treatmentDate} customerName={selected.name} tick={photoTick + photoCacheVersion} onOpen={setLightbox} />
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <CustomerPaymentHistory compact customerId={selected.id} onAdd={() => navigate(`/sales?new=1&customer=${selected.id}`)} />

              <CustomerTimeline key={selected.id} customerId={selected.id} compact tick={detailTick} />

              {/* 모바일 액션 — PC와 동일한 모달(body 포털) */}
              <div className="grid grid-cols-2 gap-2">
                {!isAnonymized(selected) && (
                  <>
                    <button
                      onClick={() => navigate(`/reservations?new=1&customer=${selected.id}`)}
                      className="py-2.5 bg-sky-600 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-1 whitespace-nowrap"
                    >
                      <CalendarPlus size={14} />예약 추가
                    </button>
                    <button
                      onClick={() => navigate(`/messaging?customer=${selected.id}`)}
                      className="py-2.5 bg-purple-600 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-1 whitespace-nowrap"
                    >
                      <MessageSquare size={14} />메시지
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowTreatmentModal(true)}
                  className="py-2.5 bg-green-500 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-1 whitespace-nowrap"
                >
                  <Scissors size={14} />시술 기록
                </button>
                <button
                  onClick={() => setShowProgramModal(true)}
                  className="py-2.5 bg-[#1a3a8f] text-white rounded-xl text-xs font-medium flex items-center justify-center gap-1 whitespace-nowrap"
                >
                  <Plus size={14} />프로그램 등록
                </button>
              </div>
              <button
                onClick={openEditModal}
                className="w-full py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 flex items-center justify-center gap-1.5"
              >
                <Pencil size={14} />고객 정보 수정
              </button>
              {!mergeBlockReason(selected) && (
                <button
                  type="button"
                  onClick={() => setShowMergeModal(true)}
                  className="w-full py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 flex items-center justify-center gap-1.5"
                >
                  <GitMerge size={14} />중복 고객 병합
                </button>
              )}
              <p className="text-xs text-slate-400 text-center pb-2">삭제는 PC에서 이용해주세요</p>
            </div>
          </div>
        )}
      </div>

      {/* ── 데스크톱 뷰 (lg+) ── 기존 레이아웃 그대로 */}
      <div className="hidden lg:flex h-full flex-1" data-testid="customers-desktop">
      {/* 왼쪽: 고객 목록 */}
      <div className="w-80 flex-shrink-0 border-r border-gray-100 flex flex-col bg-white">
        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h1 className="text-lg font-bold text-gray-900 flex-1 whitespace-nowrap">고객 관리</h1>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportExcel}
              className="hidden"
            />
            <button
              onClick={() => setShowImportGuide(true)}
              aria-label="업로드"
              title="엑셀(xlsx)/CSV로 고객 대량 등록 (이름·전화번호 필수, 중복 자동 제외)"
              className="flex items-center gap-1 px-3 py-1.5 whitespace-nowrap bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
            >
              <Upload size={12} /><span className="hidden 2xl:inline">업로드</span>
            </button>
            <button
              onClick={exportToExcel}
              aria-label="다운로드"
              title="현재 목록을 엑셀(xlsx)로 다운로드"
              className="flex items-center gap-1 px-3 py-1.5 whitespace-nowrap bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
            >
              <Download size={12} /><span className="hidden 2xl:inline">다운로드</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 whitespace-nowrap bg-[#1a3a8f] text-white rounded-lg text-xs font-medium hover:bg-[#152f75] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
            >
              <Plus size={12} />고객 추가
            </button>
          </div>
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="이름, 전화번호 검색"
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {(['전체', ...GRADES] as const).map(g => (
              <button
                key={g}
                onClick={() => setGradeFilter(g)}
                className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                  gradeFilter === g ? 'bg-[#1a3a8f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {g}
              </button>
            ))}
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              aria-label="정렬"
              className="flex-shrink-0 px-2 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 border-0 focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
            >
              {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            {retentionPolicy.enabled && (
              <button
                type="button"
                onClick={() => setRetentionOnly(!retentionOnly)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${retentionOnly ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
                title={`마지막 방문 후 ${retentionPolicy.years}년이 지난 고객`}
              >
                보존기간 경과 {expiredIds.size}
              </button>
            )}
          </div>
          {retentionOnly && (
            <div className="mt-2 flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl" data-testid="retention-bar">
              <p className="text-xs text-amber-800 min-w-0">보존기간({retentionPolicy.years}년) 경과 {filtered.length}명 — 개인 식별 정보·기록의 이름·사진을 지우고 통계만 남깁니다</p>
              <button
                type="button"
                onClick={handleAnonymizeExpired}
                disabled={filtered.length === 0}
                className="flex-shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                {filtered.length}명 익명화
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <p className="px-4 py-2 text-xs text-gray-400">{filtered.length}명</p>
          {filtered.length === 0 ? (
            <div className="p-8 text-center">
              <User size={32} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">고객이 없어요</p>
            </div>
          ) : (
            filtered.map(customer => {
              const daysSince = getDaysSince(customer.lastVisitDate);
              const isRisk = daysSince !== null && daysSince > 60;
              const activeProgs = CustomerProgramStore.getActive(customer.id).length;
              return (
                <button
                  key={customer.id}
                  onClick={() => {
                    setSelected(customer);
                    setCustomerPrograms(CustomerProgramStore.getByCustomer(customer.id));
                  }}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 ${selected?.id === customer.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {customer.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-gray-900 truncate">{customer.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${GRADE_COLORS[customer.grade]}`}>
                          {customer.grade}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 truncate">{maskPhone(customer.phone, user?.role ?? 'staff')}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400 pl-10">
                    <span>방문 {customer.totalVisits}회</span>
                    {activeProgs > 0 && (
                      <span className="text-blue-500 font-medium">활성 {activeProgs}개</span>
                    )}
                    {isRisk && <AlertCircle size={11} className="text-orange-400" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 오른쪽: 고객 상세 — 모바일 폭에서는 위의 모바일 상세가 담당하므로 렌더하지 않는다 (CSS hidden만으로는 사진 스트립·결제 내역이 2중 실행, 리뷰 2026-11-17) */}
      {selected && !isMobileLayout ? (
        <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {/* 기본 정보 카드 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-4 min-w-[260px] flex-1">
                  <div className="w-14 h-14 flex-shrink-0 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xl font-bold">
                    {selected.name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-gray-900 whitespace-nowrap">{selected.name}</h2>
                      <div className="relative">
                        <button
                          onClick={() => setShowGradeMenu(v => !v)}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-0.5 hover:ring-2 hover:ring-offset-1 hover:ring-blue-300 transition ${GRADE_COLORS[selected.grade]}`}
                          aria-label="등급 변경"
                        >
                          {selected.grade}
                          <ChevronDown size={11} />
                        </button>
                        {showGradeMenu && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowGradeMenu(false)} />
                            <div className="absolute left-0 mt-1 z-20 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-[90px]">
                              {GRADES.map(g => (
                                <button
                                  key={g}
                                  onClick={() => changeGrade(g)}
                                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-1.5 ${g === selected.grade ? 'font-bold text-blue-700' : 'text-gray-600'}`}
                                >
                                  {g === selected.grade && <CheckCircle size={11} className="text-blue-600" />}
                                  <span className={g === selected.grade ? '' : 'ml-[18px]'}>{g}</span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-500">{maskPhone(selected.phone, user?.role ?? 'staff')}</p>
                    {selected.skinType && <p className="text-xs text-gray-400 mt-0.5">피부 유형: {selected.skinType}</p>}
                    <p className={`text-xs mt-0.5 ${isAnonymized(selected) ? 'text-gray-400' : selected.privacyConsent ? 'text-green-600' : 'text-amber-500'}`}>
                      개인정보 동의: {isAnonymized(selected)
                        ? '익명화됨 (보존기간 경과)'
                        : selected.privacyConsent
                          ? `동의함${selected.privacyConsentAt ? ` (${selected.privacyConsentAt.slice(0, 10)})` : ''}`
                          : '기록 없음 (구 등록 고객)'}
                    </p>
                    {selectedNoShows > 0 && (
                      <p className="text-xs mt-0.5 text-rose-600 font-medium" data-testid="noshow-badge">노쇼 {selectedNoShows}회 — 예약 확인 연락을 권장합니다</p>
                    )}
                    {dupHint}
                  </div>
                </div>
                {/* 1366px 폭에서 버튼 글자가 세로로 깨지지 않도록 — 줄바꿈은 버튼 단위로 (2026-11-17) */}
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    onClick={openConsultModal}
                    className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap bg-indigo-600 text-white rounded-xl text-xs font-medium hover:bg-indigo-700 transition-colors"
                  >
                    <Sparkles size={12} />피부 상담
                  </button>
                  <button
                    onClick={() => setShowTreatmentModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap bg-green-500 text-white rounded-xl text-xs font-medium hover:bg-green-600 transition-colors"
                  >
                    <Scissors size={12} />시술 기록
                  </button>
                  <button
                    onClick={() => setShowProgramModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap bg-[#1a3a8f] text-white rounded-xl text-xs font-medium hover:bg-[#152f75] transition-colors"
                  >
                    <Plus size={12} />프로그램 등록
                  </button>
                  {!isAnonymized(selected) && (
                    <>
                      <button
                        onClick={() => navigate(`/reservations?new=1&customer=${selected.id}`)}
                        className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap bg-sky-600 text-white rounded-xl text-xs font-medium hover:bg-sky-700 transition-colors"
                        title="이 고객으로 예약 추가 창을 엽니다"
                      >
                        <CalendarPlus size={12} />예약 추가
                      </button>
                      <button
                        onClick={() => navigate(`/messaging?customer=${selected.id}`)}
                        className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap bg-purple-600 text-white rounded-xl text-xs font-medium hover:bg-purple-700 transition-colors"
                        title="이 고객 한 명에게 문자·카카오를 보냅니다"
                      >
                        <MessageSquare size={12} />메시지
                      </button>
                    </>
                  )}
                  <button
                    onClick={openEditModal}
                    className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap bg-gray-100 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-200 transition-colors"
                  >
                    <Pencil size={12} />수정
                  </button>
                  {!mergeBlockReason(selected) && (
                    <button
                      type="button"
                      onClick={() => setShowMergeModal(true)}
                      className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap bg-amber-50 text-amber-700 rounded-xl text-xs font-medium hover:bg-amber-100 transition-colors"
                      title="같은 사람이 두 번 등록된 경우, 다른 고객의 기록을 이 고객으로 합칩니다"
                    >
                      <GitMerge size={12} />병합
                    </button>
                  )}
                  <button
                    onClick={handleDeleteCustomer}
                    className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap bg-red-50 text-red-600 rounded-xl text-xs font-medium hover:bg-red-100 transition-colors"
                    aria-label="고객 삭제"
                  >
                    <Trash2 size={12} />삭제
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-3 mt-4 pt-4 border-t border-gray-50">
                <div className="text-center">
                  <p className="text-xs text-gray-400">총 방문</p>
                  <p className="text-lg font-bold text-gray-900">{selected.totalVisits}회</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">누적 결제</p>
                  <p className="text-lg font-bold text-gray-900">{formatPrice(selected.totalSpent)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">마지막 방문</p>
                  <p className="text-sm font-semibold text-gray-700">{formatDate(selected.lastVisitDate)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">등록일</p>
                  <p className="text-sm font-semibold text-gray-700">{formatDate(selected.registeredAt)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">다음 방문 권장</p>
                  <p><RevisitBadge customerId={selected.id} /></p>
                </div>
              </div>

              <div className="mt-3 p-3 bg-yellow-50 rounded-xl">
                {selected.memo ? <p className="text-xs text-yellow-700 whitespace-pre-line">📝 {selected.memo}</p> : <p className="text-xs text-yellow-600/60">📝 메모 없음</p>}
                {quickMemoRow(false)}
              </div>
            </div>

            {/* 피부 상담 이력 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900 flex items-center gap-1.5">
                  <Sparkles size={16} className="text-indigo-600" />피부 상담 이력
                </h3>
                <button
                  onClick={openConsultModal}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                >
                  <Plus size={12} />상담 기록
                </button>
              </div>

              {consultations.length === 0 ? (
                <div className="text-center py-6">
                  <Activity size={28} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">상담 기록이 없어요</p>
                  <button onClick={openConsultModal} className="mt-2 text-xs text-indigo-600 hover:underline">
                    첫 상담 시작하기
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {consultations.map(c => {
                    const metricEntries = BEACON_FIELDS
                      .map(f => ({ label: f.label, v: (c.beaconMetrics as any)?.[f.key] }))
                      .filter(e => e.v != null);
                    return (
                      <div key={c.id} className="border border-indigo-100 bg-indigo-50/30 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {c.skinTypeResult && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                                {c.skinTypeResult}
                              </span>
                            )}
                            <span className="text-sm font-semibold text-gray-800">{formatDate(c.consultDate)}</span>
                            {c.staffName && <span className="text-xs text-gray-400">· {c.staffName}</span>}
                          </div>
                          <button
                            onClick={() => {
                              if (window.confirm('이 상담 기록을 삭제할까요?')) {
                                ConsultationStore.delete(c.id);
                                clearPhotos(`consult:${c.id}`);
                                setConsultations(ConsultationStore.getByCustomer(selected.id));
                                setDetailTick(t => t + 1); // 활동 타임라인에서도 바로 사라지게
                              }
                            }}
                            className="text-gray-300 hover:text-red-400"
                            aria-label="상담 삭제"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        {c.concerns.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {c.concerns.map(cc => (
                              <span key={cc} className="text-xs px-1.5 py-0.5 rounded bg-white border border-indigo-100 text-gray-600">{cc}</span>
                            ))}
                          </div>
                        )}

                        {beaconEnabled && metricEntries.length > 0 && (
                          <div className="grid grid-cols-3 gap-1.5 mb-2">
                            {metricEntries.map(e => (
                              <div key={e.label} className="text-center bg-white rounded-lg py-1 border border-indigo-50">
                                <p className="text-[10px] text-gray-400">{e.label}</p>
                                <p className="text-xs font-bold text-indigo-700">{e.v}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {c.recommendedSolution && (
                          <div className="mt-1 p-2.5 bg-white rounded-lg border border-indigo-50">
                            <p className="text-[10px] font-semibold text-indigo-500 mb-0.5">추천 솔루션</p>
                            <p className="text-xs text-gray-700 whitespace-pre-line">{c.recommendedSolution}</p>
                          </div>
                        )}
                        {c.recommendedProducts.length > 0 && (
                          <p className="text-xs text-gray-500 mt-1.5">🧴 {c.recommendedProducts.join(', ')}</p>
                        )}
                        {c.managerNote && (
                          <p className="text-xs text-gray-500 mt-1.5">📝 {c.managerNote}</p>
                        )}
                        {c.nextConsultDate && (
                          <p className="text-xs text-indigo-500 mt-1.5">다음 관리 권고일: {formatDate(c.nextConsultDate)}</p>
                        )}
                        <ConsultPhotoStrip consultId={c.id} consultDate={c.consultDate} customerName={selected.name} tick={consultPhotoTick + photoCacheVersion} onOpen={setLightbox} />
                        <button
                          type="button"
                          onClick={() => handleConsultPdf(c)}
                          disabled={pdfBusyId === c.id}
                          aria-label={`${formatDate(c.consultDate)} 상담 결과지 PDF`}
                          className="mt-2 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-indigo-100 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          <FileText size={12} />{pdfBusyId === c.id ? '만드는 중...' : '결과지 PDF'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openConsultEdit(c)}
                          aria-label={`${formatDate(c.consultDate)} 상담 수정`}
                          className="mt-2 ml-1.5 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
                        >
                          <Pencil size={12} />수정
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 등록된 프로그램 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">등록 프로그램</h3>
                <button
                  onClick={() => setShowProgramModal(true)}
                  className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  <Plus size={12} />추가
                </button>
              </div>

              {customerPrograms.length === 0 ? (
                <div className="text-center py-6">
                  <Tag size={28} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">등록된 프로그램이 없어요</p>
                  <button onClick={() => setShowProgramModal(true)} className="mt-2 text-xs text-blue-500 hover:underline">
                    프로그램 등록하기
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {customerPrograms.map(cp => {
                    const remaining = cp.totalSessions !== null ? cp.totalSessions - cp.usedSessions : null;
                    const progress = cp.totalSessions ? (cp.usedSessions / cp.totalSessions) * 100 : 0;
                    const isExpired = cp.expiryDate && cp.expiryDate < today();
                    return (
                      <div
                        key={cp.id}
                        className={`border rounded-xl p-4 ${cp.isCompleted || isExpired ? 'border-gray-100 opacity-60' : 'border-blue-100 bg-blue-50/30'}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">{cp.category}</span>
                              {cp.isCompleted && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">완료</span>}
                              {isExpired && !cp.isCompleted && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-400">만료</span>}
                            </div>
                            <p className="font-semibold text-sm text-gray-900 mt-1">{cp.programName}</p>
                          </div>
                          <div className="flex items-start gap-2">
                            <div className="text-right">
                              <p className="text-xs text-gray-400">결제</p>
                              <p className="text-sm font-bold text-gray-800">{formatPrice(cp.pricePaid)}</p>
                            </div>
                            <button type="button" onClick={() => setManageProgram(cp)} aria-label={`${cp.programName} 관리`}
                              className="px-2 py-1 text-[11px] font-medium rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 whitespace-nowrap">관리</button>
                          </div>
                        </div>

                        {cp.totalSessions !== null ? (
                          <>
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                              <span>사용 {cp.usedSessions}회 / 총 {cp.totalSessions}회</span>
                              <span className="font-bold text-blue-600">잔여 {remaining}회</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-2 rounded-full transition-all ${progress >= 80 ? 'bg-orange-400' : 'bg-blue-400'}`}
                                style={{ width: `${Math.min(progress, 100)}%` }}
                              />
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-gray-400">기간제 프로그램</p>
                        )}

                        <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                          <span>등록일: {formatDate(cp.purchaseDate)}</span>
                          {cp.expiryDate && <span>만료일: {formatDate(cp.expiryDate)}</span>}
                        </div>

                        {/* 차감 내역 — 어떤 관리로 몇 회가 차감됐는지 (시술기록 연동) */}
                        {(() => {
                          const deductions = TreatmentLogStore.getByCustomer(selected.id)
                            .filter(t => t.customerProgramId === cp.id && t.sessionsUsed > 0);
                          if (deductions.length === 0) return null;
                          return (
                            <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                              <p className="text-[11px] font-medium text-gray-400">차감 내역 ({deductions.length}건)</p>
                              {deductions.slice(0, 10).map(t => (
                                <div key={t.id} className="flex items-center justify-between text-[11px] text-gray-500">
                                  <span className="truncate mr-2">
                                    {formatDate(t.treatmentDate)} · {t.treatmentDetails || t.programName || '관리'}
                                    {t.staffName ? ` (${t.staffName})` : ''}
                                  </span>
                                  <span className="font-semibold text-orange-500 whitespace-nowrap">-{t.sessionsUsed}회</span>
                                </div>
                              ))}
                              {deductions.length > 10 && (
                                <p className="text-[11px] text-gray-300">외 {deductions.length - 10}건 — 전체는 최근 시술 기록 참조</p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Before/After 타임랩스 (킬러②) — 시술 사진이 있을 때만 표시 */}
            {!isMobileLayout && <TimelapseViewer customerId={selected.id} customerName={selected.name} onSynced={() => setPhotoTick(t => t + 1)} />}

            {/* 최근 시술 기록 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-4">최근 시술 기록</h3>
              {(() => {
                const logs = TreatmentLogStore.getByCustomer(selected.id).slice(0, 5);
                if (logs.length === 0) return (
                  <div className="text-center py-6">
                    <Scissors size={28} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">시술 기록이 없어요</p>
                  </div>
                );
                return (
                  <div className="space-y-2">
                    {logs.map(log => (
                      <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                          <Scissors size={14} className="text-green-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-800 truncate">{log.programName || log.treatmentDetails || '시술 내역 없음'}</p>
                            <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{formatDate(log.treatmentDate)}</span>
                          </div>
                          {log.staffName && <p className="text-xs text-gray-400">담당: {log.staffName}</p>}
                          {log.treatmentDetails && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{log.treatmentDetails}</p>}
                          <TreatmentPhotoStrip logId={log.id} treatmentDate={log.treatmentDate} customerName={selected.name} tick={photoTick + photoCacheVersion} onOpen={setLightbox} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <CustomerPaymentHistory customerId={selected.id} onAdd={() => navigate(`/sales?new=1&customer=${selected.id}`)} />

            <CustomerTimeline key={selected.id} customerId={selected.id} tick={detailTick} />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <User size={48} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">고객을 선택하세요</p>
            <p className="text-sm text-gray-300 mt-1">왼쪽 목록에서 고객을 클릭하면 상세 정보가 표시됩니다</p>
          </div>
        </div>
      )}

      {/* ───── 고객 엑셀 업로드 가이드 모달 ───── */}
      {showImportGuide && (
        <div className="modal-backdrop fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="modal-card bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">고객 엑셀 업로드</h2>
              <button onClick={() => setShowImportGuide(false)} className="text-gray-400 hover:text-gray-600 hover:rotate-90 transition-all duration-200"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                기존에 관리하던 고객 명단을 엑셀 파일로 한 번에 등록할 수 있습니다.
                아래 <strong>양식 다운로드</strong>로 받은 파일에 고객 정보를 채운 뒤 업로드하세요.
              </p>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-xs text-gray-600">
                <p className="font-bold text-gray-800 text-sm mb-1">양식 안내</p>
                <p>• <strong className="text-red-500">필수</strong>: <strong>이름</strong>, <strong>전화번호</strong> — 둘 중 하나라도 없으면 그 줄은 건너뜁니다</p>
                <p>• 선택: 성별(남성/여성), 등급(신규·VIP 등), 생년월일(1990-01-15 형식), 피부유형, 유입경로, 이메일, 주소, 메모</p>
                <p>• 첫 번째 줄은 반드시 <strong>항목 이름(헤더)</strong>이어야 하고, 첫 번째 시트만 읽습니다</p>
                <p>• 이미 등록된 고객과 <strong>전화번호가 같으면 자동으로 건너뜁니다</strong> (중복 걱정 없음)</p>
                <p>• 엑셀(.xlsx, .xls)과 CSV 모두 지원</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={downloadImportTemplate}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-xl hover:bg-teal-100 transition-colors"
                >
                  <Download size={14} />양식 다운로드
                </button>
                <button
                  onClick={() => { setShowImportGuide(false); importInputRef.current?.click(); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-xl hover:bg-teal-700 transition-colors"
                >
                  <Upload size={14} />파일 선택해서 업로드
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───── 고객 추가 모달 ───── */}
      {/* 모바일(lg 미만)에서도 열리도록 body 포털로 렌더 — 이 블록은 데스크톱 전용(hidden lg:flex) 래퍼 안에 있다 */}
      {showAddModal && createPortal(
        <div className="modal-backdrop fixed inset-0 bg-black/40 flex justify-center z-50 p-4 overflow-y-auto">
          <div className="modal-card my-auto bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">고객 추가</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 hover:rotate-90 transition-all duration-200"><X size={18} /></button>
            </div>
            <form onSubmit={handleAddCustomer} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">이름 *</label>
                  <input required value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="홍길동" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">전화번호 *</label>
                  <input required value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: formatPhoneInput(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="010-0000-0000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">성별</label>
                  <select value={addForm.gender} onChange={e => setAddForm(f => ({ ...f, gender: e.target.value as Gender }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="여성">여성</option><option value="남성">남성</option><option value="미입력">미입력</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">등급</label>
                  <select value={addForm.grade} onChange={e => setAddForm(f => ({ ...f, grade: e.target.value as CustomerGrade }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">생년월일</label>
                  <BirthDateSelect value={addForm.birthDate} onChange={v => setAddForm(f => ({ ...f, birthDate: v }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">피부 유형</label>
                  <select value={addForm.skinType} onChange={e => setAddForm(f => ({ ...f, skinType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">선택 안함</option>
                    {['건성', '지성', '복합성', '민감성', '중성'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">이메일</label>
                <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="example@email.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">주소</label>
                <input type="text" value={addForm.address} onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="서울시 강남구..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">유입 경로</label>
                <select value={addForm.referralSource} onChange={e => setAddForm(f => ({ ...f, referralSource: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">선택</option>
                  {['네이버', '카카오', '지인 소개', '간판', '유튜브', 'SNS', '직접 방문', '기타'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">메모</label>
                <textarea value={addForm.memo} onChange={e => setAddForm(f => ({ ...f, memo: e.target.value }))}
                  rows={2} placeholder="특이사항, 알레르기 등"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <label className="flex items-start gap-2 p-3 bg-blue-50/60 border border-blue-100 rounded-xl cursor-pointer">
                <input type="checkbox" checked={addPrivacyConsent} onChange={e => setAddPrivacyConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#1a3a8f] focus:ring-blue-500" />
                <span className="text-xs text-gray-700 leading-relaxed">
                  <span className="font-semibold">[필수] 개인정보 수집·이용 동의</span><br />
                  고객관리 목적으로 이름·연락처 등 개인정보를 수집·이용하는 것에 대해 고객 본인의 동의를 받았습니다.
                </span>
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all">취소</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium hover:bg-[#152f75] hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200">등록</button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* ───── 고객 수정 모달 ───── */}
      {/* 모바일에서도 열리도록 body 포털 (데스크톱 전용 래퍼 안에 있음) — 2026-11-17 */}
      {showEditModal && selected && createPortal(
        <div className="modal-backdrop fixed inset-0 bg-black/40 flex justify-center z-[60] p-4 overflow-y-auto">
          <div className="modal-card my-auto bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">고객 정보 수정</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600 hover:rotate-90 transition-all duration-200"><X size={18} /></button>
            </div>
            <form onSubmit={handleEditCustomer} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">이름 *</label>
                  <input required value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="홍길동" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">전화번호 *</label>
                  <input required value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: formatPhoneInput(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="010-0000-0000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">성별</label>
                  <select value={editForm.gender} onChange={e => setEditForm(f => ({ ...f, gender: e.target.value as Gender }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="여성">여성</option><option value="남성">남성</option><option value="미입력">미입력</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">등급</label>
                  <select value={editForm.grade} onChange={e => setEditForm(f => ({ ...f, grade: e.target.value as CustomerGrade }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">생년월일</label>
                  <BirthDateSelect value={editForm.birthDate} onChange={v => setEditForm(f => ({ ...f, birthDate: v }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">피부 유형</label>
                  <select value={editForm.skinType} onChange={e => setEditForm(f => ({ ...f, skinType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">선택 안함</option>
                    {['건성', '지성', '복합성', '민감성', '중성'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">이메일</label>
                <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="example@email.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">주소</label>
                <input type="text" value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="서울시 강남구..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">유입 경로</label>
                <select value={editForm.referralSource} onChange={e => setEditForm(f => ({ ...f, referralSource: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">선택</option>
                  {['네이버', '카카오', '지인 소개', '간판', '유튜브', 'SNS', '직접 방문', '기타'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">메모</label>
                <textarea value={editForm.memo} onChange={e => setEditForm(f => ({ ...f, memo: e.target.value }))}
                  rows={2} placeholder="특이사항, 알레르기 등"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all">취소</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium hover:bg-[#152f75] hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200">저장</button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* ───── 프로그램 등록 모달 ───── */}
      {showProgramModal && selected && createPortal(
        <div className="modal-backdrop fixed inset-0 bg-black/40 flex justify-center z-[60] p-4 overflow-y-auto">
          <div className="modal-card my-auto bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">프로그램 등록</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selected.name} 고객</p>
              </div>
              <button onClick={() => setShowProgramModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleRegisterProgram} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">프로그램 선택 *</label>
                <select
                  required
                  value={progForm.programId}
                  onChange={e => {
                    const prog = programs.find(p => p.id === e.target.value);
                    setProgForm(f => ({ ...f, programId: e.target.value, pricePaid: prog ? prog.price.toString() : '' }));
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">프로그램을 선택하세요</option>
                  {programs.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.price.toLocaleString('ko-KR')}원
                    </option>
                  ))}
                </select>
              </div>

              {selectedProgForForm && (
                <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 space-y-1">
                  <p>📋 {selectedProgForForm.category} / {selectedProgForForm.totalSessions ? `${selectedProgForForm.totalSessions}회권` : '기간제'}</p>
                  {selectedProgForForm.validityDays && <p>📅 유효기간: {selectedProgForForm.validityDays}일</p>}
                  <p>💰 정가: {formatPrice(selectedProgForForm.price)}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">실제 결제 금액 *</label>
                <div className="relative">
                  <input
                    required
                    type="text"
                    value={progForm.pricePaid && !Number.isNaN(parseInt(progForm.pricePaid)) ? parseInt(progForm.pricePaid).toLocaleString('ko-KR') : ''}
                    onChange={e => setProgForm(f => ({ ...f, pricePaid: e.target.value.replace(/,/g, '') }))}
                    className="w-full pl-3 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-gray-400">원</span>
                </div>
                {selectedProgForForm && progForm.pricePaid && parseInt(progForm.pricePaid) < selectedProgForForm.price && (
                  <p className="text-xs text-orange-500 mt-1">
                    💡 정가보다 {formatPrice(selectedProgForForm.price - parseInt(progForm.pricePaid))} 할인
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">결제 방법</label>
                  <select value={progForm.paymentMethod} onChange={e => setProgForm(f => ({ ...f, paymentMethod: e.target.value as PaymentMethod }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {getAllPaymentMethods().map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">구매 날짜</label>
                  <input type="date" value={progForm.purchaseDate} onChange={e => setProgForm(f => ({ ...f, purchaseDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">메모 (선택)</label>
                <input value={progForm.notes} onChange={e => setProgForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="특이사항 등" />
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => setShowProgramModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  <CheckCircle size={14} />프로그램 등록
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* ───── 시술 기록 모달 ───── */}
      {showTreatmentModal && selected && createPortal(
        <div className="modal-backdrop fixed inset-0 bg-black/40 flex justify-center z-[60] p-4 overflow-y-auto">
          <div className="modal-card my-auto bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">시술 기록</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selected.name} — 회차 차감</p>
              </div>
              <button onClick={() => setShowTreatmentModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleTreatment} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">차감할 프로그램</label>
                <select value={treatForm.customerProgramId} onChange={e => setTreatForm(f => ({ ...f, customerProgramId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">선택 없음 (단순 기록)</option>
                  {CustomerProgramStore.getActive(selected.id).map(cp => (
                    <option key={cp.id} value={cp.id}>
                      {cp.programName} — 잔여 {cp.totalSessions !== null ? cp.totalSessions - cp.usedSessions : '∞'}회
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">시술일 *</label>
                  <input required type="date" value={treatForm.treatmentDate} onChange={e => setTreatForm(f => ({ ...f, treatmentDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">시간</label>
                  <input type="time" value={treatForm.treatmentTime} onChange={e => setTreatForm(f => ({ ...f, treatmentTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">담당자</label>
                <select value={treatForm.staffName} onChange={e => setTreatForm(f => ({ ...f, staffName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">선택</option>
                  {StaffStore.getAll().filter(s => s.isActive).map(s => (
                    <option key={s.id} value={s.name}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">시술 내용</label>
                <textarea value={treatForm.treatmentDetails} onChange={e => setTreatForm(f => ({ ...f, treatmentDetails: e.target.value }))}
                  rows={2} placeholder="시술 내용을 기록하세요"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">피부 상태</label>
                <input value={treatForm.skinCondition} onChange={e => setTreatForm(f => ({ ...f, skinCondition: e.target.value }))}
                  placeholder="오늘 피부 상태 메모"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">다음 예약 권고일</label>
                <input type="date" value={treatForm.nextAppointment} onChange={e => setTreatForm(f => ({ ...f, nextAppointment: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => setShowTreatmentModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
                <button type="submit" className="flex-1 py-2.5 bg-green-500 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  <Scissors size={14} />시술 기록 저장
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* ───── 피부 상담 모달 ───── */}
      {/* 모바일에서도 열리도록 body 포털 (2026-11-17) */}
      {showConsultModal && selected && createPortal(
        <div className="modal-backdrop fixed inset-0 bg-black/40 flex justify-center z-[60] p-4 overflow-y-auto">
          <div role="dialog" aria-modal="true" aria-label="피부 상담" className="modal-card my-auto bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between p-5 border-b border-gray-100 z-10">
              <div>
                <h2 className="font-bold text-gray-900 flex items-center gap-1.5">
                  <Sparkles size={16} className="text-indigo-600" />피부 상담{beaconEnabled ? ' · 비컨 분석' : ''}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{selected.name} 고객 · 1:1 맞춤 솔루션</p>
              </div>
              <button onClick={() => { setShowConsultModal(false); setSavedConsultId(null); }}><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleSaveConsultation} className="p-5 space-y-5">
              {/* 상담일 / 담당 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">상담일 *</label>
                  <input required type="date" value={consultForm.consultDate}
                    onChange={e => setConsultForm(f => ({ ...f, consultDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">담당 관리사</label>
                  <select value={consultForm.staffName} onChange={e => setConsultForm(f => ({ ...f, staffName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">선택</option>
                    {StaffStore.getAll().filter(s => s.isActive).map(s => (
                      <option key={s.id} value={s.name}>{s.name} ({s.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* AI 피부 분석 (킬러①) — 사진 → 비전 AI 분석. 비컨 토글이 켜졌거나 AI(본사 중계·지점 키)를 쓸 수 있으면 노출 (2026-09-07) */}
              {(beaconEnabled || skinAiAvailable) && (
              <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-indigo-100 rounded-xl p-3.5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles size={14} className="text-violet-600" />
                  <label className="text-xs font-semibold text-violet-900">AI 피부 분석 (사진)</label>
                  <span className="text-[10px] text-gray-400">· 관리 참고용 (의학적 진단 아님)</span>
                </div>
                <input ref={consultPhotoRef} type="file" accept="image/*" onChange={handleConsultPhoto} className="hidden" />
                <div className="flex gap-3">
                  {aiPhoto ? (
                    <img src={aiPhoto} alt="분석 사진" className="w-20 h-20 rounded-xl object-cover border border-indigo-100 flex-shrink-0" />
                  ) : (
                    <button type="button" onClick={() => consultPhotoRef.current?.click()}
                      className="w-20 h-20 rounded-xl border-2 border-dashed border-indigo-200 flex flex-col items-center justify-center gap-1 text-indigo-400 hover:border-indigo-400 transition-colors flex-shrink-0">
                      <Camera size={18} />
                      <span className="text-[10px]">사진</span>
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    {aiPhoto && (
                      <div className="flex gap-2 mb-2">
                        <button type="button" onClick={runSkinAnalysis} disabled={aiAnalyzing}
                          className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5">
                          {aiAnalyzing ? <><Loader2 size={12} className="animate-spin" />분석 중...</> : <><Sparkles size={12} />AI 분석 실행</>}
                        </button>
                        <button type="button" onClick={() => consultPhotoRef.current?.click()}
                          className="px-3 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-lg text-xs font-medium hover:bg-gray-50">다른 사진</button>
                      </div>
                    )}
                    {!aiPhoto && (
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        고객 얼굴 사진을 올리면 AI가 수분·유분·색소·모공·주름을 분석해 아래 지표와 소견에 자동 반영합니다. 사진은 상담 기록에 함께 저장됩니다.
                        {!skinAiAvailable && ' (본사 AI 미설정 — 설정 > 연동 설정 > AI 피부분석에서 OpenAI/Gemini 키 입력 필요)'}
                      </p>
                    )}
                    {aiResult && !aiResult.available && (
                      <p className="text-[11px] text-amber-600">{aiResult.reason}</p>
                    )}
                    {aiResult?.available && aiResult.scores && (
                      <div className="grid grid-cols-5 gap-1.5">
                        {SKIN_LABELS.map(({ key, label }) => (
                          <div key={key} className="bg-white rounded-lg py-1.5 text-center border border-indigo-50">
                            <p className="text-[10px] text-gray-400">{label}</p>
                            <p className="text-sm font-bold text-violet-700">{aiResult.scores![key]}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {aiResult?.available && aiResult.comment && (
                      <p className="text-[11px] text-gray-600 mt-1.5">💬 {aiResult.comment}</p>
                    )}
                  </div>
                </div>
              </div>
              )}

              {/* Before/After 비교 이미지 첨부 — 시술 사진이 2장 이상인 고객만 (킬러②, 2026-11-17) */}
              {baPhotos.length >= 2 && (
              <div className="bg-slate-50 border border-gray-200 rounded-xl p-3.5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Images size={14} className="text-indigo-600" />
                  <label className="text-xs font-semibold text-gray-800">Before/After 비교 이미지 첨부</label>
                  <span className="text-[10px] text-gray-400">· 시술 사진 {baPhotos.length}장</span>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-[10px] text-gray-500 mb-0.5">Before</label>
                    <select aria-label="비교 Before 사진" value={baBefore} onChange={e => { setBaBefore(Number(e.target.value)); setComparison(c => (c?.restored ? c : null)); }}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
                      {baPhotos.map((p, i) => <option key={p.id} value={i}>{photoCaption(p)}</option>)}
                    </select>
                  </div>
                  <ArrowLeftRight size={14} className="text-gray-400 mb-2 flex-shrink-0" />
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-[10px] text-gray-500 mb-0.5">After</label>
                    <select aria-label="비교 After 사진" value={baAfter} onChange={e => { setBaAfter(Number(e.target.value)); setComparison(c => (c?.restored ? c : null)); }}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
                      {baPhotos.map((p, i) => <option key={p.id} value={i}>{photoCaption(p)}</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={buildComparison} disabled={comparing || baBefore >= baAfter}
                    title={baBefore >= baAfter ? 'Before는 After보다 먼저 찍은 사진이어야 합니다' : undefined}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap">
                    {comparing ? <><Loader2 size={12} className="animate-spin" />만드는 중...</> : <><Images size={12} />{comparison ? '다시 만들기' : '비교 이미지 만들기'}</>}
                  </button>
                </div>
                {comparison ? (
                  <div className="flex flex-wrap gap-3 mt-3">
                    <button type="button" onClick={() => setLightbox({ dataUrl: comparison.dataUrl, caption: `${selected?.name ?? ''} Before/After 비교`, fileName: comparisonFileName(selected?.name).replace(/\.png$/, '.jpg') })}
                      aria-label="비교 이미지 크게 보기" className="rounded-lg overflow-hidden border border-gray-200 bg-white w-40 h-24 flex-shrink-0">
                      <img src={comparison.dataUrl} alt="비교 이미지 미리보기" className="w-full h-full object-cover" />
                    </button>
                    <div className="flex-1 min-w-[140px] text-xs text-gray-600">
                      <p className="font-medium text-gray-800">{comparison.days === null ? '저장된 비교 이미지입니다.' : `D+${comparison.days} 비교 이미지가 준비됐습니다.`}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">상담 저장 시 상담 기록에 함께 저장됩니다.</p>
                      <div className="flex gap-2 mt-2">
                        <button type="button" onClick={exportComparison}
                          className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center gap-1">
                          <Download size={12} />{IS_MOBILE_APP ? '이미지 공유' : '이미지 저장'}
                        </button>
                        <button type="button" onClick={() => setComparison(null)}
                          className="px-3 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-lg text-xs font-medium hover:bg-gray-50">제거</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500 mt-2">{baBefore >= baAfter ? 'Before는 After보다 먼저 찍은 사진이어야 합니다.' : '고객에게 보여줄 Before/After를 골라 만들면 상담 기록에 첨부됩니다. (기본: 최초 ↔ 최신)'}</p>
                )}
              </div>
              )}

              {/* 피부 고민 체크리스트 */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">피부 고민 (고객 체크)</label>
                <div className="space-y-2.5">
                  {CONCERN_GROUPS.map(grp => (
                    <div key={grp.group}>
                      <p className="text-[11px] text-gray-400 mb-1">{grp.group}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {grp.items.map(item => {
                          const active = consultForm.concerns.includes(item);
                          return (
                            <button key={item} type="button" onClick={() => toggleConcern(item)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'
                              }`}>
                              {item}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 홈케어 추천용 피부 문제 (진단기기 가이드 연동) */}
              <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-3.5">
                <label className="block text-xs font-semibold text-indigo-900 mb-2">
                  진단 후 피부 문제 체크 → 홈케어 추천
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {HOMECARE_PROBLEMS.map(problem => {
                    const active = consultForm.homecareProblems.includes(problem);
                    return (
                      <button key={problem} type="button" onClick={() => toggleHomecareProblem(problem)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'
                        }`}>
                        {problem}
                      </button>
                    );
                  })}
                </div>

                {/* 추천 세트 미리보기 */}
                {(() => {
                  const sets = recommendHomecare(consultForm.homecareProblems);
                  if (sets.length === 0) return null;
                  return (
                    <div className="mt-3 space-y-2">
                      {sets.map(s => (
                        <div key={s.id} className="bg-white border border-indigo-100 rounded-lg p-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-indigo-700">🧴 {s.name}</span>
                            <span className="text-[10px] text-gray-400">{s.problem}</span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1 leading-snug">{s.description}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {s.steps.map((step, i) => (
                              <span key={step} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                                {i + 1}. {step}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                      <button type="button" onClick={applyHomecareRecommendation}
                        className="w-full mt-1 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">
                        ↓ 추천 홈케어를 제품·솔루션 칸에 자동 입력
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* 비컨 측정 수치 — 비컨 기능 ON일 때만 (관리자 설정) */}
              {beaconEnabled && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                    <Activity size={13} className="text-indigo-500" />비컨 측정 수치 (0~100)
                  </label>
                  <button type="button"
                    onClick={() => applyDiagnosisDraft(consultForm.metrics, consultForm.concerns)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 font-medium hover:bg-indigo-100">
                    분석 → 맞춤 제안 자동작성
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {BEACON_FIELDS.map(f => (
                    <div key={f.key as string}>
                      <label className="block text-[11px] text-gray-500 mb-0.5" title={f.hint}>{f.label}</label>
                      <input type="number" min={0} max={100} inputMode="numeric"
                        value={consultForm.metrics[f.key as string] ?? ''}
                        onChange={e => setConsultForm(prev => ({ ...prev, metrics: { ...prev.metrics, [f.key as string]: e.target.value } }))}
                        placeholder="-"
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  ))}
                </div>
              </div>
              )}

              {/* 피부타입 판정 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">종합 피부 타입</label>
                  <select value={consultForm.skinTypeResult} onChange={e => setConsultForm(f => ({ ...f, skinTypeResult: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">선택</option>
                    {SKIN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">다음 관리 권고일</label>
                  <input type="date" value={consultForm.nextConsultDate} onChange={e => setConsultForm(f => ({ ...f, nextConsultDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              {/* 맞춤 솔루션 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">1:1 맞춤 솔루션 (추천)</label>
                <textarea value={consultForm.recommendedSolution} onChange={e => setConsultForm(f => ({ ...f, recommendedSolution: e.target.value }))}
                  rows={4} placeholder="피부 문제를 체크하면 추천 홈케어를 자동 입력할 수 있습니다. 자유롭게 수정하세요."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>

              {/* 추천 제품/프로그램 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">추천 제품·프로그램 (쉼표로 구분)</label>
                <input value={consultForm.recommendedProducts} onChange={e => setConsultForm(f => ({ ...f, recommendedProducts: e.target.value }))}
                  placeholder="예: 수분 앰플, 진정 관리 10회권"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              {/* 관리사 소견 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">관리사 소견</label>
                <textarea value={consultForm.managerNote} onChange={e => setConsultForm(f => ({ ...f, managerNote: e.target.value }))}
                  rows={2} placeholder="고객 피부 상태 관찰 소견을 기록하세요"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>

              <p className="text-[11px] text-gray-400">
                {beaconEnabled
                  ? '※ 비컨은 피부 상태를 분석·측정하는 미용 기기입니다. 본 상담은 의료 진단·처방·치료가 아닙니다.'
                  : '※ 본 상담은 의료 진단·처방·치료가 아닌 피부 분석·관리 소견입니다.'}
              </p>

              {kakaoMsg && (
                <div className="text-[11px] bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-3 py-2 leading-relaxed">
                  {kakaoMsg}
                </div>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={() => { setShowConsultModal(false); setSavedConsultId(null); }} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
                <button
                  type="button"
                  onClick={handleSaveAndSendKakao}
                  disabled={kakaoSending}
                  className="flex-1 py-2.5 bg-yellow-400 text-yellow-900 rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-yellow-500 disabled:opacity-50"
                  title="상담을 저장하고 상담 결과를 고객에게 카카오로 전송합니다"
                >
                  {kakaoSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  저장 + 카톡 전송
                </button>
                <button type="submit" className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  <CheckCircle size={14} />상담 저장
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
      {lightbox && <PhotoLightbox photo={lightbox} onClose={() => setLightbox(null)} />}
      {manageProgram && <ProgramManageModal program={manageProgram} onClose={() => setManageProgram(null)} onDone={handleProgramManaged} />}
      {showMergeModal && selected && <CustomerMergeModal target={selected} initialQuery={mergeQuery} onClose={() => { setShowMergeModal(false); setMergeQuery(''); }} onMerged={handleMerged} />}
      </div>
    </div>
  );
}
