import { isImeKey } from '../../lib/ime';
﻿import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { monthCloseBlock } from '../../lib/monthClose';
import { createPortal } from 'react-dom';
import { notify } from '../../lib/notify';
import { healCustomerStatsWhenReady, buildCustomerStatsIndex, statsFor } from '../../lib/customerStats';
import { usedSessionsFor, remainingFor, healProgramSessionsWhenReady } from '../../lib/programSessions';
import { remainingSessions } from '../../lib/programSessionsRule';
import { countPaymentUnits } from '../../lib/paymentCount';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Search, Plus, User, ChevronRight, AlertCircle, X, CheckCircle,
  Scissors, ChevronDown, Tag,
  Sparkles, Activity, Download, Pencil, Trash2, Upload, Camera, Loader2, Send, Images, ArrowLeftRight, CreditCard, CalendarPlus, GitMerge, MessageSquare, MoreHorizontal, UserX, FileText
} from 'lucide-react';
import { CustomerStore, ProgramStore, CustomerProgramStore, TreatmentLogStore, StaffStore, MessageHistoryStore, SettingsStore, PaymentStore, ReservationStore } from '../../lib/store';
import { sendMessages } from '../../lib/messagingGateway';
import { isAuthApiConfigured } from '../../lib/authApi';
import {
  ConsultationStore, loadConsultations, deriveSkinType, buildSolutionDraft
} from '../../lib/consultationStore';
import { HOMECARE_PROBLEMS, recommendHomecare } from '../../data/homecareGuide';
import TimelapseViewer from '../../components/TimelapseViewer';
import { resizeImageFile, getPhotos, getPhotosAsync, setPhotos as savePhotos, clearPhotos, makePhotoId, syncPhotosFromNas, type PhotoEntry } from '../../lib/photoStore';
import { collectCustomerPhotos, photoCaption, daysBetween, renderComparison, comparisonFileName, angleLabel, type DatedPhoto } from '../../lib/beforeAfter';
import { PHOTO_LABELS } from '../../lib/photoStore';
import { exportFile, dataUrlToBlob } from '../../lib/mobileBridge';
import { useOverlayClose, useFocusTrap, useMenuKeys } from '../../lib/overlayStack';
import PhoneLink from '../../components/ui/PhoneLink';
import PullToRefreshIndicator from '../../components/ui/PullToRefreshIndicator';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useDataRefreshed } from '../../hooks/useDataRefreshed';
import { refreshFromServer } from '../../lib/liveRefresh';
import { IS_MOBILE_APP } from '../../lib/platform';
import PhotoLightbox, { type LightboxPhoto } from '../../components/PhotoLightbox';
import CustomerMergeModal from '../../components/CustomerMergeModal';
import CustomerTimeline from '../../components/CustomerTimeline';
import FollowUpCard from '../../components/FollowUpCard'; // 연락 기록·미루기 (249)
import CustomerHistoryCard from '../../components/CustomerHistoryCard'; // 정보 변경 이력 (252)
import MemoPresetChips from '../../components/MemoPresetChips'; // 자주 쓰는 메모 문구 (255)
import { logCustomerEdit, logCustomerGrade, logCustomerGradeBatch, logCustomerEditBatch } from '../../lib/customerHistory';
import { snoozedCustomerIds } from '../../lib/followUp';
import { describeHidden } from '../../lib/followUpRule';
import ProgramManageModal from '../../components/ProgramManageModal';
import { isProgramExpired, getUsablePrograms, getExpiredPrograms, expiredProgramsHint, EXPIRED_LINK_BLOCKED } from '../../lib/customerPrograms';
import { mergeBlockReason, findDuplicateCandidates, previewMerge } from '../../lib/customerMerge';
import { propagateCustomerIdentity, countIdentityCopies, IDENTITY_PROPAGATION_CONFIRM_AT, scrubCustomerBeforeDelete, DELETED_CUSTOMER_NAME } from '../../lib/customerIdentity';
import { parseTags, topTags } from '../../lib/customerTags';
import ConsentControl from '../../components/ConsentControl';
import { isConsentTag, mergeGeneralTags } from '../../lib/consentRule';
import { exportConsultationPdf } from '../../lib/consultReport';
import { useIsMobileLayout } from '../../hooks/useMediaQuery';
import { usePhotoCacheVersion } from '../../hooks/usePhotoCache';
import { getCustomerRevisitInfo, getCustomerVisitCycle, getRevisitDueCustomers } from '../../lib/reminderEngine';
import { getProgramAlerts } from '../../lib/programAlerts';
import { getNoRebookCustomerIds } from '../../lib/todayTasks';
import { rememberRecipients } from '../../lib/messageRecipients';
import { countAnonymizeResidue } from '../../lib/anonymizeResidueCount';
import { describeAnonymizeResidue } from '../../lib/anonymizeResidue';
import { buildSegmentIndex } from '../../lib/customerSegments';
import { isCountableCustomer } from '../../lib/customerScope'; // 익명화·샘플 고객 제외 (236)
// 태그 마스터 (237, GAP C-1) — 같은 뜻의 태그가 갈라지지 않게 목록에서 눌러 넣는다
import { getTagMaster, saveTagMaster } from '../../lib/tagMaster';
import { addMasterTag, removeMasterTag, tagChoices, appendTagToInput, countInputTags, renameTagOnCustomer, renameTagInList, previewRename, normalizeTagName, MAX_MASTER_TAGS, MAX_TAGS_PER_CUSTOMER } from '../../lib/tagMasterRule';
// 등급 자동 제안 (236, GAP C-1) — 규칙은 순수 모듈, 적용은 사람이 고른 것만
import { suggestGrade, GRADE_RULE_TEXT, GRADE_SUGGEST_NOTE, type SuggestGrade } from '../../lib/gradeSuggestRule';
import { listSavedSegments, buildSegmentFacts, segmentIds, renameTagInSavedSegments, segmentsUsingTag } from '../../lib/savedSegments';
import { describeSegment, type SavedSegment } from '../../lib/segmentFilterRule';
import SegmentEditorModal from '../../components/SegmentEditorModal';
import { CHURN_LABEL, CHURN_HIGH_RATIO } from '../../lib/churnRule';
import { getCustomerValue } from '../../lib/customerValue';
import { recordPrivacyAction } from '../../lib/privacyLog';
import { askConfirm } from '../../lib/confirmDialog';
import { getRetentionPolicy, getExpiredCustomers, anonymizeCustomers, isAnonymized } from '../../lib/retentionPolicy';
import { analyzeSkinPhoto, isSkinAnalysisAvailable, SKIN_LABELS, type SkinAnalysisResult } from '../../lib/skinAnalysis';
import { isBeaconConsultationEnabled, onFeatureFlagsChanged } from '../../lib/featureFlags';
import { refreshAiProxyStatus, onAiProxyStatusChanged } from '../../lib/aiProxy';
import { writeWorkbook, loadXlsx } from '../../lib/dataExport';
import type { Customer, CustomerGrade, Gender, Program, CustomerProgram, PaymentMethod, Consultation, BeaconMetrics } from '../../types';
import { maskPhone } from '../../lib/masking';
import { getAllPaymentMethods } from '../../lib/paymentMethods';
import { useAuth } from '../../contexts/AuthContext';
import { formatPrice, formatDate, todayISO as today, formatPhoneInput, matchesSearch, toISODate, parseISODate, localISODate, formatLocalDate } from '../../lib/format';
import { daysBetween as calendarDaysBetween } from '../../lib/revisitRule';
import { canDo, canOpenRoute, ADMIN_REQUIRED_MESSAGE } from '../../lib/permissions';
import { canSeePii, emailFor, birthDateFor, phoneFor } from '../../lib/pii';
import { parseAmount, normalizePhone, isISODate, coerceISODate } from '../../lib/inputRules'; // beforeAfter.daysBetween(사진 D+N)과 이름이 겹친다

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
  return d ? calendarDaysBetween(d, today()) : null; // 달력 일수 — new Date('YYYY-MM-DD')(UTC 자정) 산술은 KST 09시 전에 하루 적고 오늘 방문이 -1일이 됐다 (12차 #H3)
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
  // 월·연이 바뀌어 그 달에 없는 날(2월 31일 등)이 남으면 비운다 — 일 목록만 줄고 값은 남아 잘못된 생년월일이 저장되던 것 (3차 UX 점검 2026-11-19)
  function clampDay(ny: string, nm: string, nd: string): string {
    const max = ny && nm ? new Date(Number(ny), Number(nm), 0).getDate() : 31;
    return nd && Number(nd) > max ? '' : nd;
  }
  const sel = 'px-2 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 hover:border-indigo-300 transition cursor-pointer';
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <select className={sel} aria-label="생년" value={y} onChange={e => { const nd = clampDay(e.target.value, mo, d); setY(e.target.value); if (nd !== d) setD(nd); emit(e.target.value, mo, nd); }}>
        <option value="">연도</option>
        {years.map(yr => <option key={yr} value={yr}>{yr}년</option>)}
      </select>
      <select className={sel} aria-label="생월" value={mo} onChange={e => { const nd = clampDay(y, e.target.value, d); setMo(e.target.value); if (nd !== d) setD(nd); emit(y, e.target.value, nd); }}>
        <option value="">월</option>
        {months.map(m => <option key={m} value={m}>{Number(m)}월</option>)}
      </select>
      <select className={sel} aria-label="생일" value={d} onChange={e => { setD(e.target.value); emit(y, mo, e.target.value); }}>
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
      {thumbs.length > 4 && <span className="text-xs text-gray-400">+{thumbs.length - 4}</span>}
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
              fileName: isCompare ? comparisonFileName(customerName).replace(/\.png$/, '.jpg') : `${customerName.replace(/[\\/:*?"<>|]/g, '')}_상담사진_${consultDate}.jpg`, // 기록용 비교 이미지는 JPEG로 압축 저장됨
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
        <button type="button" onClick={onAdd} className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
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
            <span className="text-xs text-gray-500">완료 {countPaymentUnits(completed)}건{payments.length !== completed.length ? ` · 전체 ${countPaymentUnits(payments)}건` : ''}</span> {/* 분할 결제 2행 = 1건 — 매출 화면과 같은 단위 (10차 #M2) */}
            <span className="text-sm font-bold text-gray-900">{formatPrice(total)}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {shown.map(p => (
              <div key={p.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">
                    {p.typeLabel}
                    {p.status !== 'completed' && (
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded text-2xs ${p.status === 'refunded' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{PAYMENT_STATUS_LABEL[p.status] ?? p.status}</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-600 truncate">{formatDate(p.paymentDate)} · {p.paymentMethod}{p.memo ? ` · ${p.memo}` : ''}</p>
                </div>
                <span className={`text-sm font-semibold whitespace-nowrap ${p.status === 'refunded' ? 'text-rose-500 line-through' : 'text-gray-900'}`}>{formatPrice(p.amount)}</span>
              </div>
            ))}
          </div>
          {payments.length > shown.length && <p className="text-xs text-gray-500 mt-1">외 {payments.length - shown.length}건 — 전체는 매출 화면 참조</p>}
        </>
      )}
    </div>
  );
}

/** 예약 노쇼 횟수 — 예약 받을 때 참고(확인 전화·선결제 권장) (2026-11-17) */
/**
 * 프로그램 카드의 차감·이용 내역 — 어떤 관리로 몇 회가 차감됐는지(시술 기록 연동). PC 상세 패널에만 있던 것을 모바일 카드에도 (2026-11-19 ㊹).
 * 회차권은 '차감 내역 -N회', 기간제는 '이용 내역'(차감 표기 없음). 10건까지, 나머지는 최근 시술 기록으로.
 */
function ProgramUsageList({ cp, customerId }: { cp: CustomerProgram; customerId: string }) {
  const deductions = TreatmentLogStore.getByCustomer(customerId).filter(t => t.customerProgramId === cp.id && t.sessionsUsed > 0);
  if (deductions.length === 0) return null;
  const sessionBased = cp.totalSessions !== null;
  return (
    <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
      <p className="text-xs font-medium text-gray-400">{sessionBased ? '차감 내역' : '이용 내역'} ({deductions.length}건)</p>
      {deductions.slice(0, 10).map(t => (
        <div key={t.id} className="flex items-center justify-between text-xs text-gray-500">
          <span className="truncate mr-2">
            {formatDate(t.treatmentDate)} · {t.treatmentDetails || t.programName || '관리'}
            {t.staffName ? ` (${t.staffName})` : ''}
          </span>
          {sessionBased && <span className="font-semibold text-orange-700 whitespace-nowrap">-{t.sessionsUsed}회</span>}
        </div>
      ))}
      {deductions.length > 10 && (
        <p className="text-xs text-gray-500">외 {deductions.length - 10}건은 아래 최근 시술 기록에서 볼 수 있습니다</p>
      )}
    </div>
  );
}

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
    <span className={`${cls} ${late ? 'text-rose-600' : info.daysLeft <= 7 ? 'text-amber-700' : 'text-gray-700'}`} title={info.basis === 'recommended' ? '시술 기록의 다음 방문 권장일' : `마지막 방문일 + ${info.cycleBasis === 'personal' ? '이 고객의 방문 주기' : '매장 기본 주기'} ${info.cycleDays}일`}>
      {formatDate(info.dueDate)} ({late ? `${-info.daysLeft}일 지남` : info.daysLeft === 0 ? '오늘' : `D-${info.daysLeft}`})
    </span>
  );
}

const LIST_PAGE = 100; // 목록 1회 표시 수 — [더 보기]로 늘린다

export default function Customers() {
  const { user } = useAuth();
  const canManage = canDo(user?.role, 'customer.delete'); // 삭제·익명화·병합 — 메뉴 항목과 핸들러 양쪽에서 본다 (13차 #H4)
  const piiOk = canSeePii(user?.role);                     // 전화·이메일·주소·생년월일 원문 (13차 #H5·H6)
  const canSales = canOpenRoute(user?.role, '/sales');   // [결제 추가] 는 매출 화면으로 가므로 직원에게는 안내만 (117~119 리뷰 #H4)
  /** 확인창을 닫은 뒤 포커스를 돌려줄 ⋯ 버튼 — 메뉴 항목은 메뉴가 닫히며 사라지므로 보이는 쪽 ⋯ (15차 #M2) */
  const menuAnchor = () => (moreBtnRef.current?.offsetParent ? moreBtnRef.current : mobileMoreBtnRef.current?.offsetParent ? mobileMoreBtnRef.current : null);
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
    const beforeMemo = selected.memo;
    CustomerStore.update(selected.id, { memo: selected.memo ? `${selected.memo}\n${line}` : line });
    logCustomerEdit(selected.id, { memo: beforeMemo }, { memo: selected.memo ? `${selected.memo}\n${line}` : line }, user?.name); // 빠른 메모도 기록 (254 리뷰 H-2)
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
  // 한 줄 메모에도 같은 문구를 쓴다 — 줄바꿈 대신 ' · ' 로 잇는다 (255)
  const quickMemoPresets = () => <MemoPresetChips value={quickMemo} onChange={setQuickMemo} oneLine label="빠른 메모 문구" />;
  // 헤더 전역 검색(?q=)에서 넘어온 검색어를 초기값·변경 모두 반영
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const qParam = searchParams.get('q');
  useEffect(() => {
    // q가 실제로 바뀔 때만 — 다른 파라미터(retention 등) 변경이 손으로 고친 검색어를 되돌리지 않게 (리뷰 2026-11-17)
    if (qParam !== null) setSearch(qParam);
  }, [qParam]);
  const [gradeFilter, setGradeFilter] = useState<CustomerGrade | '전체'>(() => {
    const g = searchParams.get('grade'); // 대시보드 VIP 카드 → /customers?grade=VIP (3차 UX 점검 2026-11-19)
    return g === 'VIP' || g === '골드' || g === '일반' || g === '신규' ? g : '전체';
  });
  useEffect(() => {
    // ?grade=는 첫 진입의 초기값으로만 쓰고 URL에서 지운다 — 남겨 두면 [필터 초기화] 뒤 보존기간 토글(URL 복사)·새로고침에 VIP로 되돌아간다 (리뷰 63)
    const keys = ['grade', 'churn', 'revisit', 'programAlert', 'norebook'].filter(k => searchParams.get(k)); // 대시보드 딥링크 4종도 초기값으로만 — 칩 해제 뒤 새로고침에 되살아나지 않게 (139 #M1, 187 리뷰 M-1)
    if (keys.length === 0) return;
    const next = new URLSearchParams(searchParams);
    for (const k of keys) next.delete(k);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [tagFilter, setTagFilter] = useState(''); // 태그 칩 필터 (2026-11-18)
  // 저장 세그먼트(조건 조합) — 칩으로 고르면 목록이 그 조건으로 좁혀진다 (166, GAP C-6·M-2)
  const [savedSegments, setSavedSegments] = useState<SavedSegment[]>(() => listSavedSegments());
  const [segmentFilterId, setSegmentFilterId] = useState('');
  const [segmentEditor, setSegmentEditor] = useState<SavedSegment | null | 'new'>(null);
  const [churnOnly, setChurnOnly] = useState(() => searchParams.get('churn') === '1'); // 이탈 위험 높음만 (136) — 대시보드 "오늘 할 일" 딥링크 (138)
  const [revisitOnly, setRevisitOnly] = useState(() => searchParams.get('revisit') === '1'); // 재방문 권장일 지남 (138)
  const [programAlertOnly, setProgramAlertOnly] = useState(() => searchParams.get('programAlert') === '1'); // 회차권 소진·만료 임박 (138)
  const revisitIds = useMemo(() => (revisitOnly ? new Set(getRevisitDueCustomers(0).map(d => d.customer.id)) : null), [revisitOnly, customers]);
  const programAlertIds = useMemo(() => (programAlertOnly ? new Set(getProgramAlerts().map(a => a.customer.id)) : null), [programAlertOnly, customers]); // 고객 단위 — 한 고객의 알림 2건을 2명으로 세지 않는다 (250 리뷰 L-8)
  const [norebookOnly, setNorebookOnly] = useState(() => searchParams.get('norebook') === '1'); // 이달 방문·다음 예약 없음 — 대시보드 재예약률 타일·오늘 할 일 딥링크 (184)
  const norebookIds = useMemo(() => (norebookOnly ? getNoRebookCustomerIds() : null), [norebookOnly, customers]);
  // 목록 정렬 — 최근 방문순(기본)·이름순·등록순·누적 결제순 (2026-11-18)
  type SortKey = 'recent' | 'name' | 'registered' | 'spent';
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: 'recent', label: '최근 방문순' },
    { value: 'name', label: '이름순' },
    { value: 'registered', label: '최근 등록순' },
    { value: 'spent', label: '누적 결제순' },
  ];
  // 목록·정렬·행 표기는 기록 재계산값 — 저장 증분값은 상세를 열어 heal 하기 전까지 어긋나 보였다 (10차 숫자 점검 #H1). customers 가 바뀔 때(loadAll)마다 다시 센다
  const statsIndex = useMemo(() => buildCustomerStatsIndex(), [customers]);
  const tagOptionsForChips = useMemo(() => topTags(customers, 24), [customers]); // 태그 칩(237) — 아래 필터 칩(상위 12)과 달리 더 많이 보여 준다
  const statsOf = (c: Customer) => statsFor(c, statsIndex);
  const segmentIndex = useMemo(() => buildSegmentIndex(statsIndex), [statsIndex]); // RFM 구분·이탈 위험(개인 주기 대비) — 전수 1회 (136)
  const segmentFacts = useMemo(() => buildSegmentFacts(), [customers, statsIndex]); // 저장 세그먼트 평가 사실 (166) // eslint-disable-line react-hooks/exhaustive-deps
  const activeSegment = savedSegments.find(sg => sg.id === segmentFilterId) ?? null;
  const segmentFilterIds = useMemo(() => (activeSegment ? segmentIds(activeSegment.condition, segmentFacts) : null), [activeSegment, segmentFacts]);
  const segmentCounts = useMemo(() => new Map(savedSegments.map(sg => [sg.id, segmentIds(sg.condition, segmentFacts).size])), [savedSegments, segmentFacts]); // 칩 인원은 검색 글자마다 다시 세지 않게 (170 리뷰 L-1)
  // 연락을 미뤄 둔 고객 — 할 일 딥링크 필터(이탈 위험·재방문·회차권·재예약 없음)에서만 숨긴다 (249)
  const [followUpTick, setFollowUpTick] = useState(0); // 연락 기록 저장 뒤 숨김 집합·칩 숫자를 다시 센다 (249)
  const snoozedIds = useMemo(() => snoozedCustomerIds(), [customers, followUpTick]);
  // 칩 숫자도 목록·대시보드와 같은 기준(미루기 제외) — 세 숫자가 갈라지던 것 (250 리뷰 M-4)
  const churnHighCount = useMemo(() => { let n = 0; for (const [id, v] of segmentIndex.entries()) if (v.churn?.level === 'high' && !snoozedIds.has(id)) n++; return n; }, [segmentIndex, snoozedIds]);
  const chipCount = useCallback((ids: Set<string> | null) => (ids ? [...ids].filter(id => !snoozedIds.has(id)).length : 0), [snoozedIds]);
  // 등급 올릴 후보 — 전수 1회(기록 재계산값 기준). 자동 적용은 하지 않는다 (236, GAP C-1)
  const gradeSuggestions = useMemo(() => {
    const out: { id: string; name: string; current: string; suggested: SuggestGrade; reason: string }[] = [];
    for (const c of customers) {
      if (!isCountableCustomer(c)) continue; // 익명화·삭제 고객은 대상이 아니다
      const st = statsFor(c, statsIndex);
      const sug = suggestGrade({ current: c.grade, visits: st.totalVisits, spent: st.totalSpent, segment: segmentIndex.get(c.id)?.rfm.segment });
      if (sug) out.push({ id: c.id, name: c.name, current: c.grade, suggested: sug.grade, reason: sug.reason });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [customers, statsIndex, segmentIndex]);
  // 태그 마스터 — 설정 행에서 읽고, 고객 창의 칩과 관리 패널이 같은 목록을 쓴다 (237)
  const [tagMaster, setTagMaster] = useState<string[]>(() => getTagMaster());
  const [tagPanel, setTagPanel] = useState(false);
  // 설정 행이 아직 서버에서 안 왔을 때 빈 목록으로 덮어쓰지 않게, 패널을 열 때·다른 기기 변경 때 다시 읽는다 (238, 리뷰 M-6)
  const openTagPanel = () => { setTagMaster(getTagMaster()); setTagPanel(true); };
  const [tagDraft, setTagDraft] = useState('');
  const tagChipChoices = useMemo(() => tagChoices(tagMaster, tagOptionsForChips), [tagMaster, tagOptionsForChips]);
  /** 칩 클릭 — 상한·거부 사유가 있으면 알리고, 없으면 입력칸에 더한다 (238, 리뷰 M-5) */
  function appendTagWith(current: string, tag: string, apply: (next: string) => void) {
    const r = appendTagToInput(current, tag);
    if (r.error) { notify(r.error); return; }
    if (r.value !== current) apply(r.value);
  }
  function addToMaster() {
    const r = addMasterTag(tagMaster, tagDraft);
    if (r.error) { notify(r.error); return; }
    setTagMaster(saveTagMaster(r.list));
    setTagDraft('');
  }
  // 태그 이름 일괄 변경 (239) — 이미 갈라진 태그("민감"·"민감성피부")를 손으로 고치려면 고객을 하나씩 열어야 해서 아무도 안 한다
  const [renameFrom, setRenameFrom] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState('');
  const [renaming, setRenaming] = useState(false);
  function startRename(tag: string) { setRenameFrom(tag); setRenameTo(tag); }
  async function applyRename() {
    if (!renameFrom || renaming) return;
    setRenaming(true); // 확인창 앞에서 먼저 잠근다 — 더블클릭에 확인창이 두 번 열리지 않게 (242, 리뷰 L-2)
    try {
      const all = CustomerStore.getAll().filter(isCountableCustomer);
      // 저장되는 이름으로 미리 정규화한다 — 전에는 확인창·토스트가 정규화 전 이름을 말해 저장값과 달랐다 (242, 리뷰 M-3)
      const target = normalizeTagName(renameTo);
      const preview = previewRename(all, renameFrom, renameTo);
      if (preview.error || !target) { notify(preview.error ?? '바꿀 이름을 확인해주세요.'); return; }
      const inactive = CustomerStore.getAll().filter(c => !isCountableCustomer(c) && renameTagOnCustomer(c.tags, renameFrom, target).changed).length;
      const segments = segmentsUsingTag(renameFrom); // 세그먼트 조건도 함께 바꾼다 (242, 리뷰 H-1)
      if (preview.affected === 0) {
        // 고객에게 붙은 태그가 없으면 목록 이름만 바꾼다 — "바꿨습니다" 를 거짓으로 말하지 않게 그대로 알린다
        setTagMaster(saveTagMaster(renameTagInList(getTagMaster(), renameFrom, target)));
        const movedSegments = renameTagInSavedSegments(renameFrom, target);
        if (movedSegments.length > 0) setSavedSegments(listSavedSegments());
        notify(`목록의 태그 이름만 바꿨습니다(이 태그가 붙은 고객은 없습니다): ${renameFrom} → ${target}${movedSegments.length > 0 ? ` · 세그먼트 ${movedSegments.length}개 조건도 함께 바꿨습니다` : ''}`);
        setRenameFrom(null);
        return;
      }
      const lines = [
        `"${renameFrom}" 을 "${target}" 으로 바꿀까요?`,
        `고객 ${preview.affected}명의 태그가 바뀝니다${preview.merges > 0 ? `(그중 ${preview.merges}명은 이미 "${target}" 이 있어 하나로 합쳐집니다)` : ''}.`,
        ...(segments.length > 0 ? [`저장 세그먼트 ${segments.length}개(${segments.slice(0, 2).join(', ')}${segments.length > 2 ? ' 외' : ''})의 조건도 함께 바뀝니다.`] : []),
        ...(inactive > 0 ? [`탈퇴·익명화 고객 ${inactive}명은 그대로 둡니다(개인정보 보존 정책).`] : []),
        preview.merges > 0 ? '합쳐진 고객은 반대로 바꿔도 원래대로 돌아가지 않습니다.' : '되돌리려면 반대로 한 번 더 바꿔야 합니다.',
      ];
      if (!(await askConfirm({ title: '태그 이름 바꾸기', message: lines.join('\n'), confirmLabel: '이름 바꾸기', cancelLabel: '닫기' }))) return;
      const ids = all.filter(c => renameTagOnCustomer(c.tags, renameFrom, target).changed).map(c => c.id);
      let done = 0;
      let applied = 0;
      const renameRows: { id: string; before: { tags?: string[] }; after: { tags?: string[] } }[] = []; // 이력은 끝에서 한 번에 (254 리뷰 H-2·H-3)
      const step = () => {
        try {
          // 코어 update() 는 한 명마다 고객 표 전체를 저장한다 → 25명씩 (238 리뷰 H-3 과 같은 이유)
          for (const id of ids.slice(done, done + 25)) {
            const c = CustomerStore.getById(id);
            if (!c) continue;
            const r = renameTagOnCustomer(c.tags, renameFrom, target);
            if (!r.changed) continue; // 그 사이 다른 기기가 태그를 지웠다
            CustomerStore.update(id, { tags: r.tags });
            renameRows.push({ id, before: { tags: c.tags }, after: { tags: r.tags } });
            applied += 1;
          }
        } catch (e) {
          setRenaming(false);
          console.error('[customers] 태그 이름 변경 실패:', e);
          notify(`태그 이름을 ${applied}명까지 바꾸고 저장이 실패했습니다. 저장 공간을 확인한 뒤 다시 시도해주세요.`);
          loadAll();
          return;
        }
        done += 25;
        if (done < ids.length) { setTimeout(step, 0); return; }
        setTagMaster(saveTagMaster(renameTagInList(getTagMaster(), renameFrom, target))); // 적용 중 추가된 태그를 덮지 않게 다시 읽는다 (242, 리뷰 L-4)
        const movedSegments = renameTagInSavedSegments(renameFrom, target);
        if (movedSegments.length > 0) setSavedSegments(listSavedSegments());
        setRenaming(false);
        logCustomerEditBatch(renameRows, user?.name); // 태그 일괄 변경도 고객마다 이력에(저장은 한 번) (254 리뷰 H-2)
        setRenameFrom(null);
        const skipped = ids.length - applied;
        notify(`고객 ${applied}명의 태그를 "${target}" 으로 바꿨습니다${preview.merges > 0 ? ` (${preview.merges}명은 기존 태그와 합쳐짐)` : ''}${skipped > 0 ? ` · ${skipped}명은 그 사이 바뀌어 건너뜀` : ''}${movedSegments.length > 0 ? ` · 세그먼트 ${movedSegments.length}개 조건도 함께 바꿈` : ''}.`);
        loadAll();
      };
      setTimeout(step, 0);
    } finally {
      // 청크가 시작되면 step 이 끝낼 때 풀고, 그 전에 빠져나온 경우(거절·검증 실패)는 여기서 푼다
      if (!renameFrom) setRenaming(false);
    }
  }
  function dropFromMaster(tag: string) {
    setTagMaster(saveTagMaster(removeMasterTag(tagMaster, tag)));
  }
  const [gradePanel, setGradePanel] = useState(false);
  const [gradePicked, setGradePicked] = useState<Set<string>>(new Set());
  const openGradePanel = () => { setGradePicked(new Set(gradeSuggestions.map(g => g.id))); setGradePanel(true); };
  const [gradeApplying, setGradeApplying] = useState(false);
  /**
   * 고른 고객만 등급을 올린다 — 되돌릴 수 없으니 먼저 확인하고,
   * 코어 update() 가 한 명마다 고객 테이블 전체를 저장하므로 25명씩 끊어 돌린다(500명이면 4초 넘게 멈춘다, 성능 감사 2026-11-18) (238, 리뷰 H-3)
   */
  async function applyGradeSuggestions() {
    const picked = gradeSuggestions.filter(g => gradePicked.has(g.id));
    if (picked.length === 0) { notify('적용할 고객을 하나 이상 선택해주세요.'); return; }
    if (gradeApplying) return;
    const sample = picked.slice(0, 3).map(g => `${g.name} ${g.current}→${g.suggested}`).join(', ');
    if (!(await askConfirm({
      title: '등급 올리기',
      message: `${picked.length}명의 등급을 올릴까요?\n${sample}${picked.length > 3 ? ` 외 ${picked.length - 3}명` : ''}\n되돌리려면 고객 상세에서 등급을 직접 바꿔야 합니다.`,
      confirmLabel: '등급 올리기',
      cancelLabel: '닫기',
    }))) return;
    setGradeApplying(true);
    let done = 0;
    let applied = 0;
    const appliedRows: { id: string; from?: string; to: string }[] = [];
    const step = () => {
      try {
        for (const g of picked.slice(done, done + 25)) {
          if (CustomerStore.getById(g.id)?.grade !== g.current) continue; // 그 사이 직원이 바꿨으면 건드리지 않는다
          CustomerStore.update(g.id, { grade: g.suggested });
          appliedRows.push({ id: g.id, from: g.current, to: g.suggested }); // 이력은 루프 끝에서 한 번에 (254 리뷰 H-3)
          applied += 1;
        }
      } catch (e) {
        setGradeApplying(false);
        console.error('[customers] 등급 일괄 적용 실패:', e);
        notify(`등급을 ${applied}명까지 올리고 저장이 실패했습니다. 저장 공간을 확인한 뒤 남은 고객을 다시 시도해주세요.`);
        loadAll();
        return;
      }
      done += 25;
      if (done < picked.length) { setTimeout(step, 0); return; }
      setGradeApplying(false);
      logCustomerGradeBatch(appliedRows, user?.name); // 저장 한 번 — 전에는 고객마다 전체 이력을 다시 썼다 (254 리뷰 H-3)
      setGradePanel(false);
      notify(`${applied}명의 등급을 올렸습니다.${picked.length - applied > 0 ? ` (${picked.length - applied}명은 그 사이 등급이 바뀌어 건너뜀)` : ''}`);
      loadAll();
    };
    setTimeout(step, 0);
  }
  const selectedSeg = selected ? segmentIndex.get(selected.id) ?? null : null; // RFM 구분·이탈 위험 (136)
  const compareCustomers = (a: Customer, b: Customer): number => {
    switch (sortKey) {
      case 'name': return a.name.localeCompare(b.name, 'ko');
      case 'registered': return (b.registeredAt || '').localeCompare(a.registeredAt || '');
      case 'spent': return statsOf(b).totalSpent - statsOf(a).totalSpent || a.name.localeCompare(b.name, 'ko');
      default: { // 최근 방문순 — 방문 기록 없는 고객은 등록일(로컬)로, 그래도 같으면 이름
        const av = statsOf(a).lastVisitDate || localISODate(a.registeredAt || '');
        const bv = statsOf(b).lastVisitDate || localISODate(b.registeredAt || '');
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
    if (target) openCustomer(target); // 프로그램 목록까지 같이 (리뷰 2026-11-18)
    else notify('고객을 찾을 수 없습니다 — 삭제됐거나 병합된 고객입니다.'); // 기록의 고객명 링크가 먹통처럼 보이지 않게 (11차 #L3)
    const next = new URLSearchParams(searchParams); next.delete('open');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [addForm, setAddForm] = useState({ name: '', phone: '', email: '', address: '', gender: '여성' as Gender, grade: '신규' as CustomerGrade, skinType: '', memo: '', birthDate: '', referralSource: '', tags: '', allergies: '' });
  const [addPrivacyConsent, setAddPrivacyConsent] = useState(false);

  // 고객 수정 모달
  const [showEditModal, setShowEditModal] = useState(false);
  // 모바일/데스크톱 패널이 둘 다 DOM에 있어 타임랩스(NAS 동기화·사진 디코딩)가 2회 돌던 것을 활성 레이아웃만 렌더
  const isMobileLayout = useIsMobileLayout();
  // 타임랩스가 NAS에서 사진을 받아오면 최근 시술 썸네일도 같은 데이터를 다시 읽도록 리렌더
  const [photoTick, setPhotoTick] = useState(0);
  const [detailTick, setDetailTick] = useState(0); // loadAll마다 증가 — 활동 타임라인 재계산 (2026-11-18)
  const selectedCycle = useMemo(() => (selected ? getCustomerVisitCycle(selected.id) : null), [selected?.id, detailTick, customers]); // 글자 입력마다 전수 스캔하지 않게 (139 #M8)
  const selectedValue = useMemo(() => (selected ? getCustomerValue(selected.id) : null), [selected?.id, detailTick, customers]); // 실현 매출·객단가·연간 기대(예측) (137) — detailTick 과 무관하게 렌더마다(기록 저장 뒤 바로 반영)
  const photoCacheVersion = usePhotoCacheVersion(); // IndexedDB 캐시가 비동기로 채워지면 썸네일·상담 사진을 다시 읽는다
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', address: '', gender: '여성' as Gender, grade: '신규' as CustomerGrade, skinType: '', memo: '', birthDate: '', referralSource: '', tags: '', allergies: '' });

  // 엑셀 업로드용 파일 input ref
  const importInputRef = useRef<HTMLInputElement>(null);

  // 등급(VIP) 변경 드롭다운
  const [showGradeMenu, setShowGradeMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false); // PC 상세 [⋯] — 병합·익명화·삭제 (파괴적 동작은 주 버튼 줄에서 분리, 2026-11-18)
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);       // PC ⋯ — 확인창을 닫은 뒤 포커스 복귀 (15차 #M2)
  const mobileMoreBtnRef = useRef<HTMLButtonElement>(null); // 모바일 ⋯
  const [showMobileMore, setShowMobileMore] = useState(false); // 모바일 상세 헤더 [⋯] — 수정·병합·익명화·삭제 (7차 UX 점검 2026-11-20)
  const mobileMoreRef = useRef<HTMLDivElement>(null);

  // 선택된 고객의 등급을 변경 (뱃지 클릭 → 드롭다운)
  function changeGrade(grade: CustomerGrade) {
    if (!selected || selected.grade === grade) { setShowGradeMenu(false); return; }
    const savedGrade = CustomerStore.update(selected.id, { grade });
    if (savedGrade) logCustomerGrade(selected.id, selected.grade, grade, user?.name); // 등급을 누가 바꿨는지 남긴다 (252)
    loadAll();          // 목록 뱃지도 갱신
    const updated = CustomerStore.getById(selected.id);
    if (updated) setSelected(updated);
    setShowGradeMenu(false);
    notify.success(`${grade} 등급으로 변경했습니다.`);
  }

  // 프로그램 등록 모달
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false); // 중복 고객 병합 (2026-11-18)
  const [manageProgram, setManageProgram] = useState<CustomerProgram | null>(null); // 프로그램 만료일·회차·완료 관리 (2026-11-18)
  const handleProgramManaged = () => {
    setManageProgram(null);
    if (selected) {
      setCustomerPrograms(CustomerProgramStore.getByCustomer(selected.id));
      // 빠른 시술 기록 창에서 [만료일 연장]으로 왔다면 — 연장 뒤 쓸 수 있는 프로그램이 하나뿐이면 바로 연결해 차감 누락을 막는다 (리뷰 2026-11-19)
      if (showTreatmentModal) {
        const usable = getUsablePrograms(selected.id);
        if (usable.length === 1) setTreatForm(f => (f.customerProgramId ? f : { ...f, customerProgramId: usable[0].id }));
      }
    }
    loadAll();
  };
  const dupCandidates = useMemo(() => (selected ? findDuplicateCandidates(selected, customers) : []), [selected, customers]); // 전화·이메일·이름+생년월일·이름+뒷 4자리 (171, GAP C-9)
  const openMergeFromHint = () => setShowMergeModal(true); // 병합 창이 중복 의심 후보를 먼저 보여준다 — 검색어 프리필 없음 (171·174)
  const dupHint = dupCandidates.length > 0 && (
    <button type="button" onClick={openMergeFromHint} data-testid="dup-hint"
      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 hover:bg-amber-100">
      <GitMerge size={12} />중복 의심 고객 {dupCandidates.length}명 — 병합하기
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
      else if (result === 'cancelled') notify('공유를 취소했습니다 — 결과지는 저장되지 않았습니다.');
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

  // 상담 기록 삭제 — PC·모바일 카드 공용
  function handleConsultDelete(c: Consultation) {
    if (!selected) return;
    if (!window.confirm('이 상담 기록을 삭제할까요?\n상담 사진·비교 이미지도 함께 삭제되며 되돌릴 수 없습니다.')) return; // 사진도 지워진다는 결과를 고지 (6차 UX 감사 2026-11-20)
    ConsultationStore.delete(c.id);
    clearPhotos(`consult:${c.id}`);
    setConsultations(ConsultationStore.getByCustomer(selected.id));
    setDetailTick(t => t + 1); // 활동 타임라인에서도 바로 사라지게
  }
  // 모바일 상담 기록은 최근 5건만 — [전체 보기]로 펼친다 (고객을 바꾸면 접힘)
  const [showAllMobileConsults, setShowAllMobileConsults] = useState(false);
  useEffect(() => { setShowAllMobileConsults(false); }, [selected?.id]);

  const pull = usePullToRefresh(async () => { await refreshFromServer({ force: true }); loadAll(); }, { enabled: !(selected && isMobileLayout) }); // 모바일: 목록에서만 당겨서 새로고침(풀스크린 상세 안에서는 무시)
  // Android 뒤로가기 — 열린 것 중 가장 위부터 하나씩 닫는다(상세 → 목록). 폼 모달은 Esc로는 닫지 않는다(입력 유실 방지, 취소 버튼으로)
  useOverlayClose(!!selected && isMobileLayout, () => setSelected(null), { escape: false });
  useOverlayClose(showAddModal, () => setShowAddModal(false), { escape: false });
  useOverlayClose(showGradeMenu, () => setShowGradeMenu(false)); // 등급 메뉴 — Esc·뒤로가기로 닫기
  useOverlayClose(showMoreMenu, () => setShowMoreMenu(false));
  useFocusTrap(showMoreMenu, moreMenuRef);
  useMenuKeys(showMoreMenu, moreMenuRef);
  useOverlayClose(showMobileMore, () => setShowMobileMore(false));
  useFocusTrap(showMobileMore, mobileMoreRef);
  useMenuKeys(showMobileMore, mobileMoreRef);
  // 모바일 상세에서 예약·메시지·결제 화면으로 간 뒤 뒤로가기 — 상세는 React state라 목록으로 떨어졌다. 떠나기 전에 현재 history 항목에
  // 고객 id를 남기고(URL은 그대로), 돌아오면 그 고객을 다시 연다 (7차 UX 점검 2026-11-20)
  const location = useLocation();
  useEffect(() => {
    const id = (location.state as { reopenCustomer?: string } | null)?.reopenCustomer;
    if (!id) return;
    const target = CustomerStore.getById(id);
    if (target) openCustomer(target);
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
  }, [location, navigate]);
  const leaveDetailTo = (to: string) => {
    if (selected) navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: { reopenCustomer: selected.id } });
    navigate(to);
  };
  // 포커스 트랩 — 첫 입력란 포커스·Tab 순환·닫힐 때 열었던 버튼으로 복원 (키보드 접근성 감사 2026-11-18)
  const addModalRef = useRef<HTMLDivElement>(null);
  const editModalRef = useRef<HTMLDivElement>(null);
  const programModalRef = useRef<HTMLDivElement>(null);
  const treatmentModalRef = useRef<HTMLDivElement>(null);
  const consultModalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(showAddModal, addModalRef);
  // 새 창 2개도 오버레이 스택·포커스 트랩에 올린다 — 안 올리면 안드로이드 뒤로가기가 뒤의 고객 등록 폼을 닫는다 (238, 리뷰 M-4)
  const tagPanelRef = useRef<HTMLDivElement>(null);
  const gradePanelRef = useRef<HTMLDivElement>(null);
  useOverlayClose(tagPanel, () => setTagPanel(false));
  useFocusTrap(tagPanel, tagPanelRef);
  useOverlayClose(gradePanel, () => { if (!gradeApplying) setGradePanel(false); });
  useFocusTrap(gradePanel, gradePanelRef);
  useFocusTrap(showEditModal, editModalRef);
  useFocusTrap(showProgramModal, programModalRef);
  useFocusTrap(showTreatmentModal, treatmentModalRef);
  useFocusTrap(showConsultModal, consultModalRef);
  useOverlayClose(showEditModal, () => setShowEditModal(false), { escape: false });
  useOverlayClose(showProgramModal, () => setShowProgramModal(false), { escape: false });
  useOverlayClose(showTreatmentModal, () => setShowTreatmentModal(false), { escape: false });
  useOverlayClose(showConsultModal, () => { setShowConsultModal(false); setSavedConsultId(null); }, { escape: false });

  async function exportComparison() {
    if (!comparison || !selected) return;
    try {
      const fileName = comparison.blob.type === 'image/jpeg' ? comparisonFileName(selected.name).replace(/\.png$/, '.jpg') : comparisonFileName(selected.name);
      const result = await exportFile(fileName, comparison.blob);
      if (result === 'downloaded') notify('비교 이미지를 내려받았습니다.');
      else if (result === 'cancelled') notify('공유를 취소했습니다 — 비교 이미지는 저장되지 않았습니다.');
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
    // 상담 기록 중앙 서버에서 1회 동기화 후 캐시 반영 — 실패하면 이 기기 캐시를 보여 준다고 알린다(무음 폴백 금지)
    // 오프라인이면 오프라인 띠가 이미 설명하고, 같은 세션에서 화면을 오갈 때마다 반복하지 않는다 (UX 점검 2026-11-19)
    loadConsultations().then(ok => {
      if (ok || navigator.onLine === false) return;
      try { if (sessionStorage.getItem('consult-load-warned')) return; sessionStorage.setItem('consult-load-warned', '1'); } catch { /* 저장 못 하면 매번 알림 */ }
      notify('서버에서 상담 기록을 받지 못해 이 기기에 저장된 기록을 표시합니다.');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selected) {
      setCustomerPrograms(CustomerProgramStore.getByCustomer(selected.id));
      const list = ConsultationStore.getByCustomer(selected.id);
      setConsultations(list);
      // 상담 사진(AI 분석·비교 이미지)은 photoStore(NAS crm_photos)에 있으므로 다른 PC/앱에서 저장한 것도 받아온다
      syncPhotosFromNas(list.map(c => `consult:${c.id}`)).then(({ changed }) => { if (changed) setConsultPhotoTick(t => t + 1); });
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
      logCustomerEdit(selected.id, { skinType: selected.skinType }, { skinType: consultForm.skinTypeResult }, user?.name); // 상담 저장이 바꾼 피부 타입도 기록 (254 리뷰 H-2)
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
    lines.push(`· 상담일: ${formatDate(consultForm.consultDate)}`);
    if (consultForm.skinTypeResult) lines.push(`· 피부 타입: ${consultForm.skinTypeResult}`);
    if (consultForm.concerns.length) lines.push(`· 주요 고민: ${consultForm.concerns.join(', ')}`);
    if (consultForm.recommendedSolution) lines.push('', `▷ 추천 솔루션\n${consultForm.recommendedSolution}`);
    if (consultForm.recommendedProducts) lines.push('', `▷ 추천 제품\n${consultForm.recommendedProducts}`);
    if (consultForm.nextConsultDate) lines.push('', `· 다음 상담 예정일: ${formatDate(consultForm.nextConsultDate)}`);
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
    // 게이트웨이 미연동(pending)은 발송을 시도한 것이 아니다 — 실패 건으로 이력·통계에 쌓지 않는다 (UX 점검 2026-11-19)
    if (!result.pending) rememberRecipients(MessageHistoryStore.save({ // 가드 안이라 pending 삼항은 데드 분기였음 — 제거 (206 리뷰 L-4). 수신 고객은 사이드맵에 (204·206)
      type: 'kakao-channel',
      templateName: '상담 결과 안내',
      title: `${selected.name}님 피부 상담 결과`,
      content,
      recipients: 1,
      successCount: result.sent,
      failCount: result.failed,
      sentAt: new Date().toISOString(), // 발송 화면과 같은 ISO — toLocaleString 행이 새로 생기지 않게 (6차 UX 감사 2026-11-20)
      status: result.sent > 0 ? 'sent' : 'failed',
      cost: result.sent > 0 ? 5 : 0,
    }).id, [selected.id]);
    setKakaoSending(false);
    if (result.pending) {
      setKakaoMsg('상담은 저장했습니다. 카카오 발송은 본사 서버에 발송사가 연동되면 되므로 지금은 실제로 전송되지 않았습니다. 발송 이력에는 남기지 않았습니다.');
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
  // 승급 대상 id만 고른다(쓰기 없음). 실제 쓰기는 runAutoPromote가 첫 화면을 그린 뒤 25명씩 — 코어 update()가 한 명마다
  // 테이블 전체를 저장해 500명이면 4초 넘게 멈추기 때문(대량 데이터 E2E 실측, 성능 감사 2026-11-18)
  function autoPromoteNewCustomers(): string[] {
    const todayStr = today();
    const candidates = CustomerStore.getAll().filter(c => c.grade === '신규' && !c.id.startsWith('sample_') && !!c.registeredAt && calendarDaysBetween(localISODate(c.registeredAt), todayStr) >= 90); // 달력 90일(등록 시각에 따라 90/91일로 갈리지 않게, 12차 #L8)
    if (candidates.length === 0) return [];
    // 시술 횟수는 한 번에 집계 — 신규 고객마다 시술 테이블 전체를 훑지 않게 (성능 감사 2026-11-18)
    const treatmentCount = new Map<string, number>();
    for (const t of TreatmentLogStore.getAll()) treatmentCount.set(t.customerId, (treatmentCount.get(t.customerId) || 0) + 1);
    return candidates.filter(c => (treatmentCount.get(c.id) || 0) >= 3).map(c => c.id);
  }
  const promoteRunning = useRef(false);
  function runAutoPromote() {
    if (promoteRunning.current) return;
    const ids = autoPromoteNewCustomers();
    if (ids.length === 0) return;
    promoteRunning.current = true;
    let i = 0;
    const promoted: { id: string; from?: string; to: string }[] = []; // 자동 승급도 이력에(저장은 한 번) (254 리뷰 H-2)
    const step = () => {
      try {
        // 그 사이 직원이 등급을 바꿨으면(VIP 등) 건드리지 않는다
        for (const id of ids.slice(i, i + 25)) if (CustomerStore.getById(id)?.grade === '신규') { CustomerStore.update(id, { grade: '일반' }); promoted.push({ id, from: '신규', to: '일반' }); }
      } catch (e) {
        promoteRunning.current = false; // 저장 실패(용량 등)로 가드가 잠기지 않게 — 다음 loadAll에서 재시도
        console.error('[customers] 자동 승급 저장 실패:', e);
        return;
      }
      i += 25;
      if (i < ids.length) { setTimeout(step, 0); return; }
      promoteRunning.current = false;
      logCustomerGradeBatch(promoted, '자동 승급');
      setCustomers(CustomerStore.getAll()); // 승급 결과를 목록에 반영
    };
    setTimeout(step, 0);
  }

  function loadAll() {
    setDetailTick(t => t + 1);
    runAutoPromote(); // 첫 화면을 그린 뒤 백그라운드로
    setCustomers(CustomerStore.getAll());
    // 활성 프로그램만 — 0건일 때 시술 메뉴를 프로그램처럼 보여 주던 폴백은 제거: 총회차 null(무제한)·만료 없는 회차권이 Service id 로 만들어졌다 (11차 #M6)
    setPrograms(ProgramStore.getAll().filter(p => p.isActive));
  }
  useDataRefreshed(() => { // 다른 기기의 변경이 서버에서 다시 읽혔을 때 — 열어 둔 상세도 최신 기록으로 (16차 #H3)
    loadAll();
    setSavedSegments(listSavedSegments()); // 다른 기기가 만든 세그먼트 칩 (170 리뷰 L-5)
    setSelected(prev => (prev ? CustomerStore.getById(prev.id) ?? prev : prev));
    if (selected) { // 열어 둔 상세의 회차권 목록도 서버 기준으로, 사용 회차는 기록 기준으로 (16차 #H2)
      setCustomerPrograms(CustomerProgramStore.getByCustomer(selected.id));
      healProgramSessionsWhenReady(selected.id, () => setCustomerPrograms(CustomerProgramStore.getByCustomer(selected.id)));
    }
  });

  // 보존기간 경과 고객 id — 고객 목록이나 정책이 바뀔 때만 재계산
  const expiredIds = useMemo(
    () => new Set(getExpiredCustomers().map(c => c.id)),
    [customers, retentionPolicy.enabled, retentionPolicy.years],
  );
  // 필터링 — 입력·정렬·목록이 바뀔 때만 (3,000명 × 초성 검색 + 한글 정렬을 매 렌더마다 하지 않게, 성능 감사 2026-11-18)
  const contactFilterOn = churnOnly || revisitOnly || programAlertOnly || norebookOnly;
  // 필터 술어 — filtered 와 "숨긴 인원" 이 **같은 조건**을 쓴다(미루기만 토글). 전에는 검색·등급·태그를
  // 빼먹어 숨긴 인원이 과대로 나왔다 (250 리뷰 M-7)
  const matchesFilters = useCallback((c: Customer, withFollowUp: boolean) => {
    if (!matchesSearch(search, [c.name, c.phone, c.email])) return false;
    if (!(gradeFilter === '전체' || c.grade === gradeFilter)) return false;
    if (tagFilter && !(c.tags || []).includes(tagFilter)) return false;
    if (retentionOnly && !expiredIds.has(c.id)) return false;
    if (churnOnly && segmentIndex.get(c.id)?.churn?.level !== 'high') return false;
    if (revisitIds && !revisitIds.has(c.id)) return false;
    if (programAlertIds && !programAlertIds.has(c.id)) return false;
    if (segmentFilterIds && !segmentFilterIds.has(c.id)) return false; // 저장 세그먼트 (166)
    if (norebookIds && !norebookIds.has(c.id)) return false; // (184)
    if (withFollowUp && contactFilterOn && snoozedIds.has(c.id)) return false; // 미뤄 둔 고객은 그 기한까지 숨긴다 (249)
    return true;
  }, [search, gradeFilter, tagFilter, retentionOnly, expiredIds, churnOnly, segmentIndex, revisitIds, programAlertIds, segmentFilterIds, norebookIds, contactFilterOn, snoozedIds]);
  const filtered = useMemo(() => customers.filter(c => matchesFilters(c, true)).sort(compareCustomers),
  [customers, matchesFilters, sortKey]);
  // 숨긴 인원 — 조용히 줄어든 숫자는 거짓말이다 (249). 같은 술어에서 미루기만 끄고 센다
  const hiddenByFollowUp = useMemo(() => {
    if (!contactFilterOn) return 0;
    return customers.filter(c => snoozedIds.has(c.id) && matchesFilters(c, false)).length;
  }, [customers, snoozedIds, contactFilterOn, matchesFilters]);
  // 고객별 활성 프로그램 수 — 행마다 전체 테이블을 훑지 않고 목록이 바뀔 때 한 번만 집계
  const activeProgCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const cp of CustomerProgramStore.getAll()) if (!cp.isCompleted) m.set(cp.customerId, (m.get(cp.customerId) || 0) + 1);
    return m;
    // detailTick: 프로그램 등록·관리는 고객 테이블을 바꾸지 않아 customers 참조가 그대로다 — loadAll이 올리는 tick으로 재계산 (리뷰 2026-11-18)
  }, [customers, detailTick]);
  // 목록은 100명씩 — 전부 마운트하면 수백 명부터 폰에서 버벅인다. 검색·필터·정렬이 바뀌면 처음부터
  const [listLimit, setListLimit] = useState(LIST_PAGE);
  useEffect(() => { setListLimit(LIST_PAGE); }, [search, gradeFilter, tagFilter, retentionOnly, sortKey, churnOnly, revisitOnly, programAlertOnly, segmentFilterId, norebookOnly]); // (170 리뷰 L-6)
  const visible = useMemo(() => filtered.slice(0, listLimit), [filtered, listLimit]);
  // 데스크 입력 속도: 검색창에서 Enter → 첫 결과 열기, 전역 검색(?q=)으로 왔는데 1명만 맞으면 바로 열기 (입력 속도 감사 2026-11-18)
  // 상세를 열 때 누적 결제액·방문 횟수·마지막 방문일을 기록(결제·예약·시술)에서 다시 세어 어긋나 있으면 고친다 — 서버 결제 링크 자동 기록·다기기·복원 뒤 drift (정합성 감사 2026-11-19)
  // 서버 하이드레이션이 끝난 뒤에만 — 캐시로 먼저 그려진 화면에서 비어 있는 결제 목록으로 0을 서버에 쓰지 않게 (리뷰 2026-11-19)
  // 고친 고객 한 명만 목록·상세에 반영 — loadAll()은 자동 승급·전체 재조회까지 돌려 상세를 열 때마다 목록이 다시 그려졌다 (리뷰 2026-11-20).
  // detailTick은 올리지 않는다 — 누적값(결제액·방문·마지막 방문일)만 바뀌어 타임라인·프로그램 수에 영향이 없다
  const applyHealed = (healed: Customer) => {
    setCustomers(prev => prev.map(c => (c.id === healed.id ? healed : c)));
    setSelected(prev => (prev?.id === healed.id ? healed : prev));
  };
  const openCustomer = (c: Customer) => {
    setSelected(c);
    setCustomerPrograms(CustomerProgramStore.getByCustomer(c.id));
    healCustomerStatsWhenReady(c.id, applyHealed);
    healProgramSessionsWhenReady(c.id, () => setCustomerPrograms(CustomerProgramStore.getByCustomer(c.id))); // 사용 회차를 기록 기준으로 (16차 #H2)
  };
  const openFirstMatch = () => { if (filtered.length > 0) openCustomer(filtered[0]); };
  const qHandled = useRef<string | null>(null); // 같은 q로는 1회만 — 검색어를 더 치거나 목록이 갱신될 때 다시 열리지 않게 (리뷰 2026-11-18)
  useEffect(() => {
    if (qParam && qHandled.current !== qParam && filtered.length === 1) { qHandled.current = qParam; openCustomer(filtered[0]); }
  }, [qParam, filtered]);
  // 빠른 시술 기록: 쓸 수 있는(미완료·미만료) 프로그램이 하나뿐이면 미리 연결해 둔다(회차 차감 누락 방지). 만료 회차권은 자동 연결하지 않는다 (리뷰 2026-11-19)
  const openTreatmentModal = () => {
    const active = selected ? getUsablePrograms(selected.id) : [];
    // 이전 고객의 프로그램 id·지난번 창의 시술일이 남아 엉뚱한 회차권이 차감되지 않게 항상 새로 (리뷰 2026-11-18, 11-19)
    setTreatForm(f => ({ ...f, treatmentDate: today(), customerProgramId: active.length === 1 ? active[0].id : '' }));
    setShowTreatmentModal(true);
  };
  const tagOptions = useMemo(() => tagOptionsForChips.slice(0, 12), [tagOptionsForChips]); // 전수 스캔은 한 번만 (238, 리뷰 LOW)
  // 걸러 둔 태그가 사라지면(마지막 고객에서 지움·병합·익명화·상위 12 밖) 빈 목록에 갇히지 않게 자동 해제
  useEffect(() => {
    if (tagFilter && !tagOptions.some(t => t.tag === tagFilter)) setTagFilter('');
  }, [tagOptions, tagFilter]);
  const tagChipsRow = (() => {
    const tags = tagOptions;
    if (tags.length === 0) return null;
    return (
      <div className="flex flex-nowrap overflow-x-auto no-scrollbar lg:flex-wrap lg:overflow-visible gap-1.5 py-1 -my-1 -mx-1 px-1" role="group" aria-label="태그 필터" data-testid="tag-filter">{/* 폰: 한 줄 가로 스크롤, PC: 줄바꿈 (186) */}
        {tags.map(({ tag, count }) => (
          <button key={tag} type="button" aria-pressed={tagFilter === tag} onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
            className={`flex-shrink-0 px-2.5 py-1 min-h-[36px] lg:min-h-0 rounded-full text-xs font-medium border transition-colors ${tagFilter === tag ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50'}`}>
            #{tag} <span className="font-normal">{count}</span>
          </button>
        ))}
      </div>
    );
  })();
  // 저장 세그먼트 칩 행 — 선택하면 조건으로 좁히고, 선택된 칩 옆에 [편집]. 만들기는 관리자(customer.pii 와 같은 관리자 묶음) (166)
  const savedSegmentRow = (savedSegments.length > 0 || canManage) ? (
    <div className="flex flex-nowrap overflow-x-auto no-scrollbar lg:flex-wrap lg:overflow-visible items-center gap-1.5 py-1 -my-1 -mx-1 px-1" role="group" aria-label="저장 세그먼트" data-testid="segment-filter">{/* 폰: 한 줄 가로 스크롤, PC: 줄바꿈 (186) */}
      {savedSegments.map(sg => {
        const n = segmentCounts.get(sg.id) ?? 0;
        const on = segmentFilterId === sg.id;
        return (
          <button key={sg.id} type="button" aria-pressed={on} title={describeSegment(sg.condition)} onClick={() => setSegmentFilterId(on ? '' : sg.id)}
            className={`flex-shrink-0 px-2.5 py-1 min-h-[36px] lg:min-h-0 rounded-full text-xs font-medium border transition-colors ${on ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]' : 'bg-white text-[#1a3a8f] border-blue-200 hover:bg-blue-50'}`}>
            {sg.name} <span className="font-normal">{n}</span>
          </button>
        );
      })}
      {activeSegment && <button type="button" onClick={() => navigate(`/messaging?segment=saved:${activeSegment.id}`)} className="flex-shrink-0 px-2 py-1 min-h-[36px] lg:min-h-0 rounded-full text-xs text-[#1a3a8f] border border-blue-200 bg-white hover:bg-blue-50" aria-label={`${activeSegment.name} 세그먼트에 발송`}>이 세그먼트에 발송</button>}{/* 발송 창 딥링크 saved:<id> 의 생산자 (170 리뷰 L-2) */}
      {activeSegment && canManage && <button type="button" onClick={() => setSegmentEditor(activeSegment)} className="flex-shrink-0 px-2 py-1 min-h-[36px] lg:min-h-0 rounded-full text-xs text-gray-600 border border-gray-200 bg-white hover:bg-gray-50" aria-label={`${activeSegment.name} 세그먼트 편집`}>편집</button>}
      {canManage && <button type="button" onClick={() => setSegmentEditor('new')} className="flex-shrink-0 px-2.5 py-1 min-h-[36px] lg:min-h-0 rounded-full text-xs font-medium text-gray-700 border border-dashed border-gray-300 bg-white hover:bg-gray-50">+ 세그먼트</button>}
      {canManage && gradeSuggestions.length > 0 && (
        <button type="button" onClick={openGradePanel} data-testid="grade-suggest-open"
          className="flex-shrink-0 px-2.5 py-1 min-h-[36px] lg:min-h-0 rounded-full text-xs font-medium text-emerald-800 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100">
          등급 올릴 후보 {gradeSuggestions.length}명
        </button>
      )}
    </div>
  ) : null;
  const tagChips = selected && (selected.tags || []).length > 0 ? (
    <span className="flex flex-wrap gap-1 mt-1" data-testid="customer-tags">
      {(selected.tags || []).map(t => <span key={t} className="text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">#{t}</span>)}
    </span>
  ) : null;

  async function handleAnonymizeExpired() {
    if (!canManage) { notify(ADMIN_REQUIRED_MESSAGE); return; }
    const targets = filtered.filter(c => expiredIds.has(c.id) && !isAnonymized(c));
    if (targets.length === 0) return;
    const residueBulk = describeAnonymizeResidue(countAnonymizeResidue(targets.map(c => c.id))); // 발송 이력 본문·제품 판매 이름은 코어 수정 수단이 없어 남는다 — 사실대로 (216)
    if (!(await askConfirm({ title: '보존기간 경과 고객 익명화', message: `보존기간이 지난 고객 ${targets.length}명을 익명화할까요?\n고객 정보와 예약·시술·결제·상담 기록의 이름·전화, 시술·상담 사진이 지워지며 되돌릴 수 없습니다. 방문·결제 통계는 남습니다.${residueBulk ? `\n${residueBulk}` : ''}`, confirmLabel: `${targets.length}명 익명화`, danger: true }))) return;
    const n = anonymizeCustomers(targets.map(c => c.id));
    recordPrivacyAction({ type: 'anonymize', count: n, actor: user?.name || user?.email || '알 수 없음', detail: '보존기간 경과 일괄' }); // 파기 대장 (9차 점검 #29)
    notify(`고객 ${n}명을 익명화했습니다.`);
    setSelected(null);
    loadAll();
  }

  // 고객 기록 엑셀(xlsx) 다운로드 — 현재 필터된 목록을 이메일 포함 전체 항목으로 내보냄
  async function exportToExcel() {
    if (filtered.length === 0) { notify('내보낼 고객이 없습니다.'); return; }
    const XLSX = await loadXlsx();
    const role = user?.role ?? 'staff';
    const rows = filtered.map(c => ({
      '이름': c.name,
      '전화번호': maskPhone(c.phone, role),
      '이메일': role !== 'staff' ? (c.email || '') : '',
      '주소': role !== 'staff' ? (c.address || '') : '',
      '성별': c.gender,
      '등급': c.grade,
      '생년월일': role !== 'staff' ? (c.birthDate || '') : '',
      '피부유형': c.skinType || '',
      '알레르기': c.allergies || '',
      '총방문(회)': statsOf(c).totalVisits, // 목록 행과 같은 기록 재계산값 (리뷰 2026-11-20)
      '누적결제(원)': statsOf(c).totalSpent,
      '마지막방문': statsOf(c).lastVisitDate || '',
      '등록일': localISODate(String(c.registeredAt || '')), // UTC 앞 10자는 새벽 등록을 전날로; 다른 날짜 열과 같은 "YYYY-MM-DD" (산출물 감사·리뷰 2026-11-20)
      '유입경로': c.referralSource || '',
      '태그': (c.tags || []).join(', '),
      '메모': role !== 'staff' ? (c.memo || '') : '', // 직원 계정은 메모·생년월일 제외(설정 내보내기와 같은 규칙)
    }));
    // 설정 > 데이터 내보내기와 같은 민감정보 안내행을 1행에 — 외부 공유 금지가 파일에 남게
    const ws = XLSX.utils.aoa_to_sheet([['⚠ 민감정보 포함 — 외부 공유 금지']]);
    XLSX.utils.sheet_add_json(ws, rows, { origin: 'A2' });
    ws['!cols'] = [
      { wch: 10 }, { wch: 15 }, { wch: 22 }, { wch: 20 }, { wch: 6 },
      { wch: 6 }, { wch: 12 }, { wch: 9 }, { wch: 12 }, { wch: 9 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 24 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '고객목록');
    const shopPrefix = (SettingsStore.get().name || 'CRM').replace(/[\\/:*?"<>|]/g, '');
    writeWorkbook(wb, `${shopPrefix}_고객목록_${today()}.xlsx`).then(r => { if (r === 'cancelled') notify('공유를 취소했습니다 — 엑셀 파일은 저장되지 않았습니다.'); }, e => notify(e instanceof Error ? e.message : '엑셀 파일을 내보내지 못했습니다.'));
  }

  // 업로드 가이드 모달 — 양식을 모르면 쓸 수 없는 기능이라 안내+양식 다운로드를 먼저 보여줌
  const [showImportGuide, setShowImportGuide] = useState(false);
  useOverlayClose(showImportGuide, () => setShowImportGuide(false));
  const importGuideRef = useRef<HTMLDivElement>(null);
  useFocusTrap(showImportGuide, importGuideRef);
  const gradeMenuRef = useRef<HTMLDivElement>(null);
  useFocusTrap(showGradeMenu, gradeMenuRef); // 현재 등급 항목(data-autofocus)에 포커스, 닫히면 등급 버튼으로
  useMenuKeys(showGradeMenu, gradeMenuRef);

  // 등급 칩 + 변경 메뉴 — PC 상세 헤더와 모바일 상세 헤더에서 같은 동작. 두 헤더는 isMobileLayout으로 배타 렌더라 ref·상태를 공유해도 안전하다.
  // 모바일(large)은 손가락 크기에 맞춰 항목을 키운다 (UX 점검 M8, 2026-11-19)
  const gradeChip = (sel: Customer, large: boolean) => (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowGradeMenu(v => !v)}
        className={`${large ? 'text-sm px-2.5 py-1 min-h-[32px]' : 'text-xs px-2 py-0.5'} rounded-full font-medium flex items-center gap-0.5 hover:ring-2 hover:ring-offset-1 hover:ring-blue-300 transition ${GRADE_COLORS[sel.grade]}`}
        aria-label={`${sel.grade} 등급 변경`}
        aria-haspopup="menu"
        aria-expanded={showGradeMenu}
      >
        {sel.grade}
        <ChevronDown size={11} />
      </button>
      {showGradeMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowGradeMenu(false)} />
          <div ref={gradeMenuRef} role="menu" aria-label="등급 선택" className={`absolute left-0 mt-1 z-20 bg-white border border-gray-100 rounded-xl shadow-lg py-1 ${large ? 'min-w-[120px]' : 'min-w-[90px]'}`}>
            {GRADES.map(g => (
              <button
                key={g}
                type="button"
                role="menuitemradio"
                aria-checked={g === sel.grade}
                data-autofocus={g === sel.grade ? '' : undefined}
                onClick={() => changeGrade(g)}
                className={`w-full text-left px-3 hover:bg-gray-50 flex items-center gap-1.5 ${large ? 'py-2.5 text-sm' : 'py-1.5 text-xs'} ${g === sel.grade ? 'font-bold text-blue-700' : 'text-gray-600'}`}
              >
                {g === sel.grade && <CheckCircle size={11} className="text-blue-600" />}
                <span className={g === sel.grade ? '' : 'ml-[18px]'}>{g}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  // 업로드 양식 엑셀 다운로드 (헤더 + 예시 2행)
  async function downloadImportTemplate() {
    const XLSX = await loadXlsx();
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
    writeWorkbook(wb, '고객_업로드_양식.xlsx').then(r => { if (r === 'cancelled') notify('공유를 취소했습니다 — 양식 파일은 저장되지 않았습니다.'); }, e => notify(e instanceof Error ? e.message : '양식 파일을 내보내지 못했습니다.'));
  }

  // 고객 엑셀/CSV 대량 업로드 — 다운로드와 동일한 헤더(이름/전화번호/이메일/성별/등급/생년월일/피부유형/유입경로/메모)를 인식
  function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { notify('엑셀 파일이 10MB를 넘습니다. 시트를 나눠 올려주세요.'); e.target.value = ''; return; } // 파서 멈춤 방지 (보안 감사 2026-11-19)
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const XLSX = await loadXlsx();
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // 우리 내보내기 파일은 1행이 한 칸짜리 민감정보 안내문이고 머리글이 2행 — 값이 2칸 이상인 첫 행을 머리글로 삼는다 (산출물 감사 2026-11-20)
        // range는 시트의 절대 행 — 빈 행을 건너뛰지 않고(blankrows) !ref의 시작 행을 더해 번호를 맞춘다(빈 1행·A3부터 시작하는 파일) (리뷰 2026-11-20)
        const startRow = XLSX.utils.decode_range(ws['!ref'] || 'A1').s.r;
        const grid = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: true });
        const headerRow = startRow + Math.max(0, grid.findIndex(r => r.filter(v => v !== '' && v != null).length >= 2));
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '', range: headerRow });
        if (rows.length === 0) { notify('시트에 데이터가 없습니다.'); return; }

        const normHeader = (h: string) => h.replace(/^\uFEFF/, '').replace(/\s/g, '').toLowerCase(); // 'Phone'·BOM 머리글도 맞춘다 (14차 #M4)
        const pick = (r: Record<string, any>, keys: string[]) => {
          for (const k of keys) {
            const hit = Object.keys(r).find(col => normHeader(col) === normHeader(k));
            if (hit && String(r[hit]).trim() !== '') return String(r[hit]).trim();
          }
          return '';
        };
        const normGender = (g: string): Gender => (g === '남성' || g === '남' ? '남성' : g === '여성' || g === '여' ? '여성' : '미입력');
        const normGrade = (g: string): CustomerGrade => (GRADES as string[]).includes(g) ? g as CustomerGrade : '신규';

        // 기존 전화번호로 중복 스킵
        const existingPhones = new Set(CustomerStore.getAll().map(c => normalizePhone(c.phone))); // 추가·수정과 같은 키 — +82 로 저장된 고객이 업로드 행과 다른 키가 되어 2건째가 생기던 것 (120~122 리뷰 #M1)
        let added = 0, skipped = 0, masked = 0, badBirth = 0;
        if (rows.length > 2000) { notify(`한 번에 2,000명까지 올릴 수 있습니다(현재 ${rows.length.toLocaleString('ko-KR')}행). 시트를 나눠 올려주세요.`); return; } // 행마다 전체 저장이 일어나 수천 행이면 멈춤·부분 저장 (14차 #H8)
        for (let ri = 0; ri < rows.length; ri++) {
          const r = rows[ri];
          if (ri > 0 && ri % 200 === 0) await new Promise(res => setTimeout(res, 0)); // 200행마다 화면에 양보
          const name = pick(r, ['이름', '고객명', '성함', 'name']).trim();
          let phone = pick(r, ['전화번호', '연락처', '휴대폰', '휴대폰번호', '핸드폰', '전화', 'phone', 'mobile', 'tel']);
          if (!name || !phone) { skipped++; continue; }
          if (/\*/.test(phone)) { skipped++; masked++; continue; } // 직원 계정이 내보낸 가린 번호(010-****-5678)는 새 고객으로 만들지 않는다 (리뷰 2026-11-20)
          let digits = normalizePhone(phone);
          // 엑셀 숫자 셀 함정: 앞 0이 사라진 번호(10xxxxxxxx) 복원
          if (digits.startsWith('10') && (digits.length === 9 || digits.length === 10)) {
            digits = '0' + digits;
            phone = digits;
          }
          if (existingPhones.has(digits)) { skipped++; continue; }
          existingPhones.add(digits);
          phone = formatPhoneInput(digits); // 직접 등록과 같은 010-0000-0000 형식 (3차 UX 점검 2026-11-19)
          // 생년월일 — 시리얼·'1990/01/15'·'1990년 1월 15일' 을 모두 'YYYY-MM-DD' 로, 못 읽으면 비우고 건수를 알린다(원문 저장은 생일 알림에서 조용히 빠졌다, 14차 #M3)
          const rawBirth = pick(r, ['생년월일', '생일', 'birthDate']);
          const birthDate = coerceISODate(rawBirth);
          if (rawBirth && !birthDate) badBirth++;
          CustomerStore.save({
            name, phone,
            gender: normGender(pick(r, ['성별', 'gender'])),
            grade: normGrade(pick(r, ['등급', 'grade'])),
            skinType: pick(r, ['피부유형', '피부타입', 'skinType']),
            memo: pick(r, ['메모', '비고', 'memo']).slice(0, 2000), // 폼의 2,000자 상한을 업로드로 우회하지 않게 (120~122 리뷰 #L8)
            birthDate: birthDate || undefined,
            referralSource: pick(r, ['유입경로', '유입', 'referralSource']) || undefined,
            email: pick(r, ['이메일', 'email']) || undefined,
            address: pick(r, ['주소', 'address']) || undefined,
            allergies: pick(r, ['알레르기', 'allergies']) || undefined, tags: parseTags(pick(r, ['태그', 'tags'])).filter(t => !isConsentTag(t)), isActive: true, // 업로드 열로 동의를 만들 수 없다 — 동의는 고객 상세 컨트롤로만 (165 리뷰 M-1)
          });
          added++;
        }
        loadAll();
        notify(`고객 업로드 완료: ${added}명 추가, ${skipped}건 건너뜀${masked > 0 ? ` · 가린 전화번호 ${masked}건 포함` : ''}${badBirth > 0 ? ` · 생년월일을 읽지 못해 비운 고객 ${badBirth}명` : ''}.`); // 토스트는 한 문장 — 건너뜀 사유·형식 안내는 업로드 안내 패널에 (15차 #M4)
      } catch (err) {
        notify('파일을 읽는 중 오류가 발생했습니다. 엑셀(.xlsx) 또는 CSV 형식인지 확인해주세요.');
      } finally {
        if (importInputRef.current) importInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // 고객 추가
  const resetAddForm = () => {
    setAddForm({ name: '', phone: '', email: '', address: '', gender: '여성', grade: '신규', skinType: '', memo: '', birthDate: '', referralSource: '', tags: '', allergies: '' });
    setAddPrivacyConsent(false);
  };
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
    const newPhone = normalizePhone(addForm.phone); // +82 번호도 같은 키로 — 추가·수정·업로드가 같은 규칙 (14차 #M2)
    const dup = CustomerStore.getAll().find(c => normalizePhone(c.phone) === newPhone && newPhone !== '');
    if (dup) {
      if (window.confirm(`이미 등록된 번호입니다: ${dup.name} (${dup.phone})\n기존 고객을 열까요? (새로 등록하지 않습니다)`)) {
        setShowAddModal(false);
        resetAddForm(); // 다음 [고객 추가]에 중복 고객의 이름·번호가 남지 않게 (리뷰 63)
        openCustomer(dup);
      }
      return;
    }
    CustomerStore.save({
      name: addForm.name.trim(), phone: addForm.phone.trim(), // 앞뒤 공백이 그대로 저장돼 같은 사람이 '홍길동'/'홍길동 ' 둘로 갈리던 것 (14차 #M1)
      gender: addForm.gender, grade: addForm.grade,
      skinType: addForm.skinType, memo: addForm.memo,
      birthDate: addForm.birthDate || undefined,
      referralSource: addForm.referralSource || undefined,
      email: addForm.email.trim() || undefined, allergies: addForm.allergies.trim() || undefined,
      address: addForm.address.trim() || undefined,
      tags: parseTags(addForm.tags).filter(t => !isConsentTag(t)), isActive: true, // 동의는 고객 상세의 동의 컨트롤로만 — 입력란 타이핑으로 못 만든다 (159 리뷰 H-1)
      privacyConsent: true, privacyConsentAt: new Date().toISOString(),
    });
    notify.success('고객을 등록했습니다.'); // 창만 닫히고 피드백이 없었다 (15차 #L10)
    setShowAddModal(false);
    resetAddForm();
    loadAll();
  }

  // 고객 수정 — 상세에서 '수정' 클릭 시 현재 값으로 폼 채우고 모달 오픈
  const editBaseRef = useRef<Customer | null>(null); // 수정 창을 연 시점의 고객 — diff 기준 (127~130 리뷰 #H3)
  function openEditModal() {
    if (!selected) return;
    editBaseRef.current = selected;
    setEditForm({
      name: selected.name, phone: selected.phone,
      email: selected.email ?? '', address: selected.address ?? '',
      gender: selected.gender,
      grade: selected.grade, skinType: selected.skinType ?? '',
      memo: selected.memo ?? '', birthDate: selected.birthDate ?? '',
      referralSource: selected.referralSource ?? '',
      tags: (selected.tags || []).filter(t => !isConsentTag(t)).join(', '), // 동의 태그는 폼에 보이지 않는다 — 10개 제한에 잘려 수신거부가 사라지던 것 (159 리뷰 H-1)
      allergies: selected.allergies ?? '',
    });
    setShowEditModal(true);
  }

  async function handleEditCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const identityChanged = editForm.name !== selected.name || (piiOk && editForm.phone !== selected.phone);
    // 연결 기록이 많으면(단골) 건마다 저장·서버 동기가 일어나 수 초 걸린다 — 저장 전에 알리고 확인 (리뷰 #H2)
    if (!editForm.name.trim()) { notify('이름을 입력해주세요.'); return; }
    if (piiOk && editForm.phone !== selected.phone) {
      const key = normalizePhone(editForm.phone);
      const dup = key && CustomerStore.getAll().find(c => c.id !== selected.id && normalizePhone(c.phone) === key);
      if (dup) { notify(`이미 등록된 번호입니다: ${dup.name}. 같은 사람이면 [중복 고객 병합]을 사용해주세요.`); return; } // 수정 경로에만 중복 검사가 없어 같은 번호 고객이 둘이 되던 것 (14차 #H9)
    }
    const copies = identityChanged ? countIdentityCopies(selected.id, { name: editForm.name.trim(), phone: piiOk ? editForm.phone.trim() : selected.phone }) : 0;
    if (copies > IDENTITY_PROPAGATION_CONFIRM_AT && !(await askConfirm({ title: '기록 일괄 수정', message: `이름·연락처가 바뀌어 연결된 기록 ${copies}건도 함께 고칩니다. 서버 동기화에 시간이 걸릴 수 있습니다. 계속할까요?`, confirmLabel: '함께 수정' }))) return;
    // 직원 계정은 PII 입력칸이 없으므로 기존 값을 그대로 둔다 (13차 #H5)
    // 바뀐 칸만 보낸다 — 서버 PATCH 가 병합이라, 폰에서 바꾼 전화번호를 PC 의 옛 수정 창이 메모만 고치며 되돌리던 것 (16차 #H1)
    const next: Partial<Customer> = {
      name: editForm.name.trim(), phone: piiOk ? editForm.phone.trim() : selected.phone,
      gender: editForm.gender, grade: editForm.grade,
      skinType: editForm.skinType, memo: editForm.memo,
      // 비운 값은 ''로 — undefined는 toDbCustomer가 키를 빼서 서버(JSON 병합 PATCH)에 옛 값이 남고 재로그인 때 되살아난다 (NAS 감사 2026-11-18). 소비자는 모두 truthy 검사
      birthDate: piiOk ? (editForm.birthDate || '') : (selected.birthDate || ''),
      referralSource: editForm.referralSource || '',
      email: piiOk ? (editForm.email.trim() || '') : (selected.email || ''),
      address: piiOk ? (editForm.address.trim() || '') : (selected.address || ''),
      tags: mergeGeneralTags(parseTags(editForm.tags), selected.tags), // 일반 태그만 바꾸고 동의 태그는 항상 보존 (159 리뷰 H-1)
      allergies: editForm.allergies.trim() || '',
    };
    const base = editBaseRef.current && editBaseRef.current.id === selected.id ? editBaseRef.current : selected; // 재조회로 selected 가 바뀌어도 폼이 본 값과 비교
    const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => {
      const before = (base as unknown as Record<string, unknown>)[k];
      return JSON.stringify(v ?? '') !== JSON.stringify(before ?? (Array.isArray(v) ? [] : '')); // 비운 값 '' 과 저장 안 된 undefined 는 같은 뜻
    })) as Partial<Customer>;
    if (Object.keys(changed).length > 0) {
      const saved = CustomerStore.update(selected.id, changed);
      // 누가 언제 무엇을 바꿨는지 남긴다 — 저장이 안 됐으면 이력도 남기지 않는다 (252, 250 리뷰 L-4 와 같은 규칙)
      if (saved) logCustomerEdit(selected.id, base, { ...base, ...changed }, user?.name);
    }
    notify.success('고객 정보를 저장했습니다.'); // 전파 토스트보다 먼저 — 저장 자체를 알린다 (15차 #L10)
    if (identityChanged) {
      // 예약·시술·회차권·결제·상담에 복사된 이름(예약은 전화번호도) — 빠뜨리면 개명한 고객이 다른 화면 검색에서 사라지고 예약 카드가 옛 번호로 전화한다 (11차 #H1·H2)
      const n = propagateCustomerIdentity(selected.id, { name: editForm.name.trim(), phone: piiOk ? editForm.phone.trim() : selected.phone });
      if (n > 0) notify(`기록 ${n}건의 고객 이름·연락처도 함께 바꿨습니다.`);
    }
    const updated = CustomerStore.getById(selected.id);
    if (updated) setSelected(updated);
    setShowEditModal(false);
    loadAll();
  }

  // 고객 삭제 — 2단계 확인 후 제거
  function handleMerged() {
    if (!selected) return;
    setShowMergeModal(false);
    const updated = CustomerStore.getById(selected.id);
    setSelected(updated ?? null);
    loadAll();
  }

  // 고객 요청 등으로 개인정보만 지울 때 — 삭제와 달리 기록 연결·방문/결제 통계는 남는다 (2026-11-18)
  async function handleAnonymizeOne() {
    if (!selected || isAnonymized(selected)) return;
    if (!canManage) { notify(ADMIN_REQUIRED_MESSAGE); return; }
    const residueOne = describeAnonymizeResidue(countAnonymizeResidue([selected.id])); // (216)
    if (!(await askConfirm({ title: '고객 익명화', message: `'${selected.name}' 고객을 익명화할까요?\n이름·전화·이메일·주소·생년월일·메모·태그와 예약·시술·결제·상담 기록의 이름·전화, 시술·상담 사진이 지워지며 되돌릴 수 없습니다.\n방문·결제 통계와 기록 연결은 남습니다.${residueOne ? `\n${residueOne}` : ''}`, confirmLabel: '익명화', danger: true, returnFocusTo: menuAnchor() }))) return;
    const n = anonymizeCustomers([selected.id]);
    if (n === 0) { notify('익명화하지 못했습니다.'); return; }
    recordPrivacyAction({ type: 'anonymize', count: n, actor: user?.name || user?.email || '알 수 없음', detail: '개별 처리(고객 요청 등)' });
    notify('고객을 익명화했습니다.');
    const updated = CustomerStore.getById(selected.id);
    setSelected(updated ?? null);
    loadAll();
  }

  async function handleDeleteCustomer() {
    if (!selected) return;
    if (!canManage) { notify(ADMIN_REQUIRED_MESSAGE); return; }
    // 연결된 기록이 있으면 건수를 보여 주고 병합·익명화를 권한다 — 삭제하면 기록의 고객 연결이 끊겨 타임라인·통계에서 빠진다 (2026-11-18)
    const linked = previewMerge(selected.id);
    const linkedTotal = linked.reservations + linked.treatments + linked.programs + linked.payments + linked.consultations + linked.productSales;
    const detail = linkedTotal > 0
      ? `\n연결된 기록 ${linkedTotal}건(예약 ${linked.reservations}·시술 ${linked.treatments}·프로그램 ${linked.programs}·결제 ${linked.payments}·상담 ${linked.consultations}·제품 판매 ${linked.productSales})은 남지만 고객과의 연결이 끊겨 타임라인·통계에서 빠집니다. 남는 기록과 엑셀 장부의 고객명은 '${DELETED_CUSTOMER_NAME}'으로 바뀌고 시술·상담 사진은 삭제됩니다.\n${!mergeBlockReason(selected) ? '같은 사람이 두 번 등록된 경우라면 [병합]을, ' : ''}개인정보만 지우려면 [익명화]를 권장합니다.`
      : '\n연결된 기록이 없습니다.';
    // 앞으로의 예약·진행 중 회차권이 걸린 고객을 지우면 예약은 수정 불가, 회차권은 알림에서 사라진다 — 먼저 정리하게 (정합성 감사 2026-11-19)
    const futureRes = ReservationStore.getAll().filter(r => r.customerId === selected.id && r.date >= today() && (r.status === 'confirmed' || r.status === 'pending')).length;
    const activeProgs = CustomerProgramStore.getActive(selected.id).filter(cp => !isProgramExpired(cp)).length; // 만료된 회차권은 카드도 '만료'로 보이므로 막지 않는다 (리뷰 2026-11-19)
    if (futureRes > 0 || activeProgs > 0) {
      const blockers = [futureRes > 0 ? `앞으로의 예약 ${futureRes}건` : '', activeProgs > 0 ? `진행 중 회차권 ${activeProgs}개` : ''].filter(Boolean).join(', ');
      const guide = [futureRes > 0 ? '예약은 취소하고' : '', activeProgs > 0 ? '회차권은 [관리]에서 완료 처리(또는 등록 취소)한' : ''].filter(Boolean).join(' ');
      notify(`삭제할 수 없습니다 — ${blockers}이 남아 있습니다. ${guide} 뒤 삭제해주세요.`); // '건'·'개'로 끝나 조사는 늘 '이' (15차 #M5·#L1)
      return;
    }
    if (!(await askConfirm({ title: '고객 삭제', message: `'${selected.name}' 고객을 삭제할까요?${detail}\n고객 정보는 복구할 수 없습니다.`, confirmLabel: '삭제', danger: true, returnFocusTo: menuAnchor() }))) return;
    const scrubbed = scrubCustomerBeforeDelete(selected.id); // 얼굴 사진이 접근 불가 상태로 영구 잔류하고 상담 기록이 실명으로 엑셀에 나가던 것 (11차 #H3·H6)
    CustomerStore.delete(selected.id);
    notify(scrubbed > 0 ? `고객을 삭제했습니다 — 기록 ${scrubbed}건의 이름·연락처를 정리하고 시술·상담 사진을 삭제했습니다.` : '고객을 삭제했습니다.');
    setSelected(null);
    loadAll();
  }

  // 프로그램 등록
  function handleRegisterProgram(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const prog = programs.find(p => p.id === progForm.programId);
    if (!prog) return;

    // 구매 날짜를 비우면 parseISODate('') 가 1900-01-01 이 되어 만료일 1900년(영구 차감 불가)·결제일 빈 값(매출 누락)이 됐다 (14차 #H1)
    if (!isISODate(progForm.purchaseDate)) { notify('구매 날짜를 선택해주세요.'); return; }
    { const blocked = monthCloseBlock(progForm.purchaseDate); if (blocked) { notify.error(blocked); return; } } // 월 마감 잠금 (147, GAP P-7)

    // 결제금액: 빈칸이면 정가, 입력했으면 그 값(0원 이벤트도 유효). 공백·통화기호가 섞여도 자릿수를 잃지 않게 공용 규칙 (14차 #H6)
    let pricePaid = prog.price;
    if (progForm.pricePaid.trim() !== '') {
      const parsed = parseAmount(progForm.pricePaid);
      if (parsed === null) {
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
    // 선택지에 없는 id(시술일 변경으로 만료·완료)가 남아 있으면 조용히 차감하지 않는다
    const linked = treatForm.customerProgramId ? getUsablePrograms(selected.id, treatForm.treatmentDate).find(cp => cp.id === treatForm.customerProgramId) : undefined;
    if (treatForm.customerProgramId && !linked) { notify(EXPIRED_LINK_BLOCKED); return; }

    TreatmentLogStore.save({
      customerId: selected.id,
      customerName: selected.name,
      customerProgramId: linked?.id,
      programName: linked?.programName,
      staffName: treatForm.staffName || undefined,
      treatmentDate: treatForm.treatmentDate,
      treatmentTime: treatForm.treatmentTime || undefined,
      sessionsUsed: 1,
      treatmentDetails: treatForm.treatmentDetails || undefined,
      skinCondition: treatForm.skinCondition || undefined,
      staffNotes: treatForm.staffNotes || undefined,
      nextAppointment: treatForm.nextAppointment || undefined,
    });
    // 코어 incrementVisit은 마지막 방문일을 UTC '오늘'로, 방문 횟수를 같은 날 예약 완료와 별도로 +1 한다 — 기록에서 다시 세어 바로 맞춘다(하이드레이션 뒤) (정합성 감사·리뷰 2026-11-19)
    healCustomerStatsWhenReady(selected.id, applyHealed);
    healProgramSessionsWhenReady(selected.id, () => setCustomerPrograms(CustomerProgramStore.getByCustomer(selected.id))); // (16차 #H2)

    setShowTreatmentModal(false);
    setTreatForm({ customerProgramId: '', staffName: '', treatmentDate: today(), treatmentTime: '', treatmentDetails: '', skinCondition: '', staffNotes: '', nextAppointment: '' });
    setCustomerPrograms(CustomerProgramStore.getByCustomer(selected.id));
    const updated = CustomerStore.getById(selected.id);
    if (updated) setSelected(updated);
    loadAll();
  }

  const selectedProgForForm = programs.find(p => p.id === progForm.programId);
  // 빠른 시술 기록 창의 차감 선택지·만료 안내 — 시술일 기준 (렌더마다 세 번 훑지 않게 한 번만)
  const treatUsable = selected && showTreatmentModal ? getUsablePrograms(selected.id, treatForm.treatmentDate) : [];
  const treatExpired = selected && showTreatmentModal ? getExpiredPrograms(selected.id, treatForm.treatmentDate) : [];

  return (
    <div className="flex flex-col h-full">
      {/* 저장 세그먼트 편집 창 — 데스크톱(hidden lg:flex)·모바일(lg:hidden) 블록 어느 쪽에 두어도 반대 폭에서 숨겨진다(Modal 은 포털이 아님) → 루트 바로 아래 (166·168) */}
      {tagPanel && (
        <div className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setTagPanel(false)}>
          <div ref={tagPanelRef} role="dialog" aria-modal="true" aria-label="태그 목록 관리" onClick={e => e.stopPropagation()} tabIndex={-1}
            className="modal-card bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col" data-testid="tag-master-panel">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">태그 목록 관리</h2>
              <p className="mt-1 text-xs text-gray-500">매장이 쓰는 태그를 미리 정해 두면 고객 창에서 눌러 넣을 수 있습니다. 같은 뜻의 태그가 "민감성·민감·민감성피부" 처럼 갈라지면 태그 필터·발송 대상이 조용히 나뉩니다. 목록에서 지워도 고객에 붙은 태그는 그대로 남습니다({MAX_MASTER_TAGS}개까지).</p>
            </div>
            <div className="px-5 py-3 flex gap-2">
              <input value={tagDraft} onChange={e => setTagDraft(e.target.value)} aria-label="새 태그" placeholder="예: 민감성"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addToMaster(); } }}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm" />
              <button type="button" onClick={addToMaster} className="px-4 py-2 bg-[#1a3a8f] text-white text-sm font-medium rounded-xl">추가</button>
            </div>
            <ul className="flex-1 overflow-y-auto px-5 pb-3 flex flex-wrap gap-1.5 content-start">
              {tagMaster.length === 0 && <li className="text-xs text-gray-400 py-2">아직 등록한 태그가 없습니다. 위에서 추가해 주세요.</li>}
              {tagMaster.map(t => (
                <li key={t} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-50 text-[#1a3a8f] border border-blue-200">
                  #{t}
                  <button type="button" onClick={() => startRename(t)} aria-label={`${t} 태그 이름 바꾸기`} className="text-blue-400 hover:text-[#1a3a8f]" title="이름 바꾸기(고객 태그도 함께 바뀝니다)">✎</button>
                  <button type="button" onClick={() => dropFromMaster(t)} aria-label={`${t} 태그 목록에서 지우기`} className="text-blue-400 hover:text-red-600">✕</button>
                </li>
              ))}
            </ul>
            {renameFrom && (
              <div className="px-5 py-3 border-t border-gray-100 space-y-2" data-testid="tag-rename">
                <p className="text-xs text-gray-600"><b>#{renameFrom}</b> 이름 바꾸기 — 이 태그가 붙은 고객의 태그도 함께 바뀌고, 바꾼 이름이 이미 있으면 하나로 합쳐집니다.</p>
                <div className="flex gap-2">
                  <input value={renameTo} onChange={e => setRenameTo(e.target.value)} aria-label="바꿀 태그 이름"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void applyRename(); } }}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                  <button type="button" onClick={() => void applyRename()} disabled={renaming}
                    className="px-4 py-2 bg-[#1a3a8f] text-white text-sm font-medium rounded-xl disabled:opacity-60">{renaming ? '바꾸는 중...' : '바꾸기'}</button>
                  <button type="button" onClick={() => setRenameFrom(null)} disabled={renaming}
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 disabled:opacity-60">취소</button>
                </div>
              </div>
            )}
            <div className="px-5 py-4 border-t border-gray-100">
              <button type="button" onClick={() => setTagPanel(false)} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">닫기</button>
            </div>
          </div>
        </div>
      )}
      {gradePanel && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!gradeApplying) setGradePanel(false); }}>
          <div ref={gradePanelRef} role="dialog" aria-modal="true" aria-label="등급 올릴 후보" onClick={e => e.stopPropagation()} tabIndex={-1}
            className="modal-card bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" data-testid="grade-suggest-panel">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">등급 올릴 후보 {gradeSuggestions.length}명</h2>
              <p className="mt-1 text-xs text-gray-500">{GRADE_RULE_TEXT}</p>
              <p className="mt-1 text-xs text-gray-400">{GRADE_SUGGEST_NOTE}</p>
            </div>
            <ul className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {gradeSuggestions.map(g => (
                <li key={g.id} className="px-5 py-3 flex items-center gap-3">
                  <input type="checkbox" checked={gradePicked.has(g.id)} aria-label={`${g.name} 등급 올리기`}
                    onChange={e => setGradePicked(prev => { const next = new Set(prev); if (e.target.checked) next.add(g.id); else next.delete(g.id); return next; })}
                    className="w-4 h-4 accent-[#1a3a8f]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{g.name}</p>
                    <p className="text-xs text-gray-500">{g.reason}</p>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{g.current} → <b className="text-emerald-700">{g.suggested}</b></span>
                </li>
              ))}
            </ul>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
              <button type="button" onClick={() => setGradePanel(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">닫기</button>
              <button type="button" onClick={applyGradeSuggestions} disabled={gradeApplying} className="flex-1 py-2.5 bg-[#1a3a8f] text-white text-sm font-semibold rounded-xl hover:bg-[#15306e] disabled:opacity-60">
                {gradeApplying ? '적용 중...' : `선택한 ${gradePicked.size}명 등급 올리기`}
              </button>
            </div>
          </div>
        </div>
      )}
      {segmentEditor !== null && <SegmentEditorModal segment={segmentEditor === 'new' ? null : segmentEditor} facts={segmentFacts} tagOptions={[...new Set([...tagOptions.map(t => t.tag), ...((segmentEditor !== 'new' && segmentEditor?.condition.tagsAny) || [])])]} onClose={() => setSegmentEditor(null)} onSaved={() => { setSegmentEditor(null); const next = listSavedSegments(); setSavedSegments(next); if (!next.some(sg => sg.id === segmentFilterId)) setSegmentFilterId(''); }} />}

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
                onKeyDown={e => { if (e.key === 'Enter' && !isImeKey(e)) { e.preventDefault(); openFirstMatch(); } }}
                aria-label="고객 검색" placeholder="고객명, 전화번호 검색"
                className="w-full h-10 pl-9 pr-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
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
          {tagChipsRow}
          {savedSegmentRow}
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
              className="flex-shrink-0 px-2.5 py-1.5 min-h-[36px] rounded-lg text-sm font-medium bg-gray-100 text-gray-700 border-0 focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
            >
              {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            {revisitOnly && (
              <button type="button" onClick={() => setRevisitOnly(false)} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-[#1a3a8f] text-white" title="대시보드 오늘 할 일에서 연 필터 — 누르면 해제" aria-label="재방문 권장 필터 해제">재방문 권장 {chipCount(revisitIds)} ✕</button>
            )}
            {programAlertOnly && (
              <button type="button" onClick={() => setProgramAlertOnly(false)} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-[#1a3a8f] text-white" title="대시보드 오늘 할 일에서 연 필터 — 누르면 해제" aria-label="회차권 알림 필터 해제">회차권 알림 {chipCount(programAlertIds)} ✕</button>
            )}
            {norebookOnly && (
              <button type="button" onClick={() => setNorebookOnly(false)} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-[#1a3a8f] text-white" title="이달 방문했지만 다음 예약이 없는 고객 — 대시보드 재예약률에서 연 필터, 누르면 해제" aria-label="재예약 없음 필터 해제" data-testid="norebook-chip">재예약 없음 {chipCount(norebookIds)} ✕</button>
            )}
            {norebookOnly && (norebookIds?.size ?? 0) > 0 && ( /* 재예약 권유 문자까지 한 흐름 — 발송 창 딥링크 norebook 의 생산자 (202) */
              <button type="button" onClick={() => navigate('/messaging?segment=norebook')} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs text-[#1a3a8f] border border-blue-200 bg-white hover:bg-blue-50" aria-label="재예약 없음 고객에게 발송" data-testid="norebook-send">이 고객들에게 발송</button>
            )}
            {/* 연락을 미뤄 둔 고객은 숨겼다는 사실을 적는다 — 조용히 줄어든 숫자는 거짓말이다 (249) */}
            {hiddenByFollowUp > 0 && (
              <span className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs text-gray-600 bg-gray-100" data-testid="follow-up-hidden" title={describeHidden(hiddenByFollowUp) ?? ''}>미룬 {hiddenByFollowUp}명 숨김</span>
            )}
            {(churnHighCount > 0 || churnOnly) && (
              <button type="button" aria-pressed={churnOnly} onClick={() => setChurnOnly(v => !v)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${churnOnly ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
                title={`마지막 방문 뒤 지난 날이 이 고객의 방문 주기 ${CHURN_HIGH_RATIO}배를 넘고 다음 예약이 없는 고객`}>
                이탈 위험 {churnHighCount}
              </button>
            )}
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
          {retentionOnly && canManage && (
            <div className="mt-2 flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl" data-testid="retention-bar">
              <p className="text-xs text-amber-800 min-w-0">보존기간({retentionPolicy.years}년) 경과 {filtered.length}명 — 개인 식별 정보·기록의 이름·사진을 지우고 통계만 남깁니다</p>
              <button
                type="button"
                onClick={handleAnonymizeExpired}
                disabled={filtered.length === 0}
                className="flex-shrink-0 min-h-[44px] px-3 inline-flex items-center bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
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
              <p className="text-sm text-slate-500">{customers.length === 0 ? '아직 고객이 없습니다' : '조건에 맞는 고객이 없어요'}</p>
              {customers.length === 0 ? (
                <button onClick={() => setShowAddModal(true)} className="mt-3 px-4 py-2 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium">
                  첫 고객 등록하기
                </button>
              ) : (
                // 검색 오타에 '첫 고객 등록'을 권하면 중복 고객이 생긴다 — 필터를 풀어 주는 길만 (3차 UX 점검 2026-11-19)
                <button type="button" onClick={() => { setSearch(''); setGradeFilter('전체'); setTagFilter(''); setRetentionOnly(false); setChurnOnly(false); setRevisitOnly(false); setProgramAlertOnly(false); }} className="mt-3 px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium">
                  필터 초기화
                </button>
              )}
            </div>
          ) : (
            visible.map(customer => {
              const daysSince = getDaysSince(statsOf(customer).lastVisitDate ?? undefined);
              return (
                <button
                  key={customer.id}
                  onClick={() => openCustomer(customer)} // 목록에서 열 때도 누적값 재계산(70·71)을 거친다 — E2E customer-stats가 잡은 누락 (95, 2026-11-20)
                  className="w-full bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-left min-h-[72px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {customer.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{customer.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${GRADE_COLORS[customer.grade]}`}>
                          {customer.grade}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {phoneFor(user?.role, customer.phone)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {daysSince === null ? '방문 기록 없음' : daysSince === 0 ? '오늘 방문' : `${daysSince}일 전 방문`} · 방문 {statsOf(customer).totalVisits}회{segmentIndex.get(customer.id)?.churn?.level === 'high' && <span className="text-rose-700 font-medium"> · 이탈 위험</span>}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />
                  </div>
                </button>
              );
            })
          )}
          {filtered.length > listLimit && (
            <button type="button" onClick={() => setListLimit(n => n + LIST_PAGE)}
              className="w-full py-3 text-sm font-medium text-[#1a3a8f] bg-white border border-gray-200 rounded-xl hover:bg-gray-50 min-h-[44px]">
              더 보기 ({filtered.length - listLimit}명 남음)
            </button>
          )}
        </div>

        <PullToRefreshIndicator {...pull} />
        {/* 모바일 고객 상세 — 풀스크린 모달 (활성 레이아웃일 때만 마운트) */}
        {selected && isMobileLayout && (
          <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
            {/* 헤더 */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 pb-3 pt-safe-3 flex items-center gap-3 shadow-sm">
              <button
                onClick={() => setSelected(null)}
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200"
                aria-label="뒤로가기"
              >
                <ChevronRight size={18} className="rotate-180 text-gray-600" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-gray-900 truncate">{selected.name}</span>
                  {gradeChip(selected, true)}
                </div>
              </div>
              {canManage ? ( /* 직원은 수정만 남아 1항목 메뉴가 되므로 [수정] 버튼을 바로 (15차 #M8) */
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMobileMore(v => !v)}
                  ref={mobileMoreBtnRef}
                  aria-label="고객 관리 더보기"
                  title="수정·병합·익명화·삭제"
                  aria-haspopup="menu"
                  aria-expanded={showMobileMore}
                  className="w-11 h-11 flex items-center justify-center rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  <MoreHorizontal size={18} />
                </button>
                {showMobileMore && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMobileMore(false)} />
                    <div ref={mobileMoreRef} role="menu" aria-label="고객 관리 더보기" className="absolute right-0 mt-1 z-20 w-56 bg-white border border-gray-100 rounded-xl shadow-lg py-1">
                      <button type="button" role="menuitem" onClick={() => { setShowMobileMore(false); openEditModal(); }}
                        className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                        <Pencil size={15} className="text-gray-400" />고객 정보 수정
                      </button>
                      {canManage && !mergeBlockReason(selected) && (
                        <button type="button" role="menuitem" onClick={() => { setShowMobileMore(false); setShowMergeModal(true); }}
                          title="같은 사람이 두 번 등록된 경우, 다른 고객의 기록을 이 고객으로 합칩니다"
                          className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                          <GitMerge size={15} className="text-gray-400" />중복 고객 병합
                        </button>
                      )}
                      {canManage && !isAnonymized(selected) && !selected.id.startsWith('sample_') && (
                        <button type="button" role="menuitem" onClick={() => { setShowMobileMore(false); handleAnonymizeOne(); }} aria-label="고객 익명화"
                          title="개인정보만 지우고 방문·결제 통계와 기록 연결은 남깁니다"
                          className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                          <UserX size={15} className="text-gray-400" />고객 익명화
                        </button>
                      )}
                      {canManage && (
                      <button type="button" role="menuitem" onClick={() => { setShowMobileMore(false); handleDeleteCustomer(); }} aria-label="고객 삭제"
                        className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                        <Trash2 size={15} />고객 삭제
                      </button>
                      )}
                    </div>
                  </>
                )}
              </div>
              ) : (
              <button type="button" onClick={openEditModal} aria-label="고객 정보 수정" title="고객 정보 수정"
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200">
                <Pencil size={18} />
              </button>
              )}
            </div>

            {/* 상세 콘텐츠 스크롤 */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {/* 기본 정보 */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-3">기본 정보</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">전화번호</span>
                    <PhoneLink phone={selected.phone} role={piiOk ? 'admin' : 'staff'} className="text-sm font-medium text-gray-900 tabular-nums" />
                  </div>
                  {selected.email && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">이메일</span>
                      <span className="text-sm font-medium text-gray-900 tabular-nums truncate ml-2">{emailFor(user?.role, selected.email)}</span>
                    </div>
                  )}
                  {selected.birthDate && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">생년월일</span>
                      <span className="text-sm font-medium text-gray-900 tabular-nums">{birthDateFor(user?.role, selected.birthDate)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">피부 타입</span>
                    <span className="text-sm font-medium text-gray-900 tabular-nums">{selected.skinType || '-'}</span>
                  </div>
                  {selected.allergies && (
                    <div className="flex justify-between gap-2" data-testid="allergy-row">
                      <span className="text-xs text-amber-700 font-medium">알레르기·주의</span>
                      <span className="text-xs font-semibold text-amber-800 text-right">{selected.allergies}</span>
                    </div>
                  )}
                  {selected.address && piiOk && (
                    <div className="flex justify-between gap-2">
                      <span className="text-xs text-gray-500">주소</span>
                      <span className="text-sm font-medium text-gray-900 tabular-nums text-right truncate">{selected.address}</span>
                    </div>
                  )}
                  {selected.referralSource && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">유입 경로</span>
                      <span className="text-sm font-medium text-gray-900 tabular-nums">{selected.referralSource}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">총 방문</span>
                    <span className="text-sm font-medium text-gray-900 tabular-nums">{selected.totalVisits}회</span>
                  </div>
                  {selectedSeg && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">고객 구분</span>
                      <span className="text-sm font-medium text-gray-900 text-right" data-testid="rfm-segment">
                        {selectedSeg.rfm.segment}
                        {selectedSeg.churn && <span className={`ml-1 text-xs ${selectedSeg.churn.level === 'high' ? 'text-rose-700 font-semibold' : selectedSeg.churn.level === 'medium' ? 'text-amber-700' : 'text-gray-500'}`}>· 이탈 위험 {CHURN_LABEL[selectedSeg.churn.level]}</span>}
                        <span className="block text-xs text-gray-500 font-normal">최근성 {selectedSeg.rfm.r}·빈도 {selectedSeg.rfm.f}·금액 {selectedSeg.rfm.m} — 최근 1년, 매장 내 5분위</span>
                      </span>
                    </div>
                  )}
                  {selectedCycle && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">방문 주기</span>
                      <span className="text-sm font-medium text-gray-900 tabular-nums text-right" data-testid="visit-cycle">
                        {selectedCycle.days}일 <span className="text-xs text-gray-500">{selectedCycle.basis === 'personal' ? '이 고객 기준' : '매장 기준'}</span>
                        <span className="block text-xs text-gray-500 font-normal">{selectedCycle.basis === 'personal' ? `방문 간격 ${selectedCycle.intervals}개의 중앙값` : '방문 3회 미만이라 매장 기본 주기'}</span>
                      </span>
                    </div>
                  )}
                  {selectedNoShows > 0 && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">노쇼</span>
                      <span className="text-sm font-medium text-rose-600 tabular-nums" data-testid="noshow-count">{selectedNoShows}회</span>
                    </div>
                  )}
                  {dupHint}
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">총 결제</span>
                    <span className="text-sm font-medium text-gray-900 tabular-nums" title="완료된 결제 합 — 회차권 판매액 포함(현금 유입)">{formatPrice((selected.totalSpent || 0))}</span>
                  </div>
                  {selectedValue && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-500">실현 매출</span>
                        <span className="text-sm font-medium text-gray-900 tabular-nums text-right" data-testid="realized-revenue">{formatPrice(selectedValue.realizedRevenue)}<span className="block text-xs text-gray-500 font-normal">회차권은 사용한 회차만큼(기간제 전액)</span></span>
                      </div>
                      {selectedValue.avgTicket !== null && (
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500">객단가</span>
                          <span className="text-sm font-medium text-gray-900 tabular-nums text-right">{formatPrice(selectedValue.avgTicket)}<span className="block text-xs text-gray-500 font-normal">실현 매출 ÷ 방문 {statsOf(selected).totalVisits}회</span></span>
                        </div>
                      )}
                      {selectedValue.annualForecast !== null && canDo(user?.role, 'sales.view') && ( /* 매출 전망은 매출 화면·대시보드 금액 카드와 같은 권한 (139 #M7) */
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500">연간 기대 매출 <span className="text-gray-500">(예측)</span></span>
                          <span className="text-sm font-medium text-gray-700 tabular-nums text-right">{formatPrice(selectedValue.annualForecast)}<span className="block text-xs text-gray-500 font-normal">객단가 × 365 ÷ 방문 주기 {selectedCycle?.days ?? '-'}일 — 지금 리듬이 1년 이어질 때</span></span>
                        </div>
                      )}
                    </>
                  )}
                  {(statsOf(selected).lastVisitDate || selected.lastVisitDate) && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">마지막 방문</span>
                      <span className="text-sm font-medium text-gray-900 tabular-nums">{formatDate(statsOf(selected).lastVisitDate || selected.lastVisitDate)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">다음 방문 권장</span>
                    <RevisitBadge customerId={selected.id} size="sm" />
                  </div>
                </div>
                {tagChips}{selected && <ConsentControl customer={selected} onChanged={() => { loadAll(); setSelected(prev => (prev ? CustomerStore.getAll().find(c => c.id === prev.id) ?? prev : prev)); }} />}
                <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">메모</p>
                  {selected.memo ? <p className="text-xs text-gray-700 whitespace-pre-line break-words max-h-64 overflow-y-auto">{selected.memo}</p> : <p className="text-xs text-gray-500">메모 없음</p>}
                  {quickMemoRow(true)}
                  {quickMemoPresets()}
                </div>
              </div>

              {/* 피부 상담 이력 (모바일) */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase">피부 상담 이력</p>
                  <button
                    onClick={openConsultModal}
                    className="text-xs font-medium text-indigo-600 flex items-center gap-1 px-2 py-2 -my-2 -mr-2 rounded-lg active:bg-indigo-50"
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
                    {(showAllMobileConsults ? consultations : consultations.slice(0, 5)).map(c => (
                      <div key={c.id} className="p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-800">{formatDate(c.consultDate)}{c.staffName ? <span className="font-normal text-gray-400"> · {c.staffName}</span> : null}</p>
                          <span className="flex items-center gap-1.5">
                            {c.skinTypeResult && <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{c.skinTypeResult}</span>}
                            <button type="button" onClick={() => handleConsultDelete(c)} aria-label={`${formatDate(c.consultDate)} 상담 삭제`} className="p-2.5 -m-2 text-gray-300 active:text-red-600"><X size={16} /></button>
                          </span>
                        </div>
                        {c.concerns.length > 0 && <p className="text-xs text-gray-600 mt-0.5">{c.concerns.join(', ')}</p>}
                        {c.recommendedSolution && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{c.recommendedSolution}</p>}
                        {c.recommendedProducts.length > 0 && <p className="text-xs text-gray-500 mt-0.5">🧴 {c.recommendedProducts.join(', ')}</p>}
                        {c.managerNote && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{c.managerNote}</p>}
                        {c.nextConsultDate && <p className="text-xs text-indigo-600 mt-0.5">다음 관리 권고일: {formatDate(c.nextConsultDate)}</p>}
                        <ConsultPhotoStrip consultId={c.id} consultDate={c.consultDate} customerName={selected.name} tick={consultPhotoTick + photoCacheVersion} onOpen={setLightbox} />
                        <button
                          type="button"
                          onClick={() => handleConsultPdf(c)}
                          disabled={pdfBusyId === c.id}
                          aria-label={`${formatDate(c.consultDate)} 상담 결과지 PDF`}
                          className="mt-2 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-indigo-100 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          <FileText size={12} />{pdfBusyId === c.id ? '만드는 중...' : '결과지 PDF'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openConsultEdit(c)}
                          aria-label={`${formatDate(c.consultDate)} 상담 수정`}
                          className="mt-2 ml-1.5 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          <Pencil size={12} />수정
                        </button>
                      </div>
                    ))}
                    {consultations.length > 5 && !showAllMobileConsults && (
                      <button type="button" onClick={() => setShowAllMobileConsults(true)} className="w-full py-2 text-xs font-medium text-indigo-600 bg-white border border-indigo-100 rounded-lg">
                        전체 {consultations.length}건 보기
                      </button>
                    )}
                  </div>
                )}
              </div>


              {/* 프로그램 목록 */}
              {customerPrograms.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-3">등록 프로그램</p>
                  <div className="space-y-2">
                    {customerPrograms.map(cp => (
                      <div key={cp.id} data-testid="program-card" className={`p-3 bg-slate-50 rounded-lg ${cp.isCompleted || isProgramExpired(cp) ? 'border border-dashed border-gray-300' : 'border border-transparent'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-semibold text-gray-800">{cp.programName}</p>
                          <span className="flex items-center gap-1.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                              cp.isCompleted ? 'bg-slate-200 text-slate-600' : isProgramExpired(cp) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                            }`}>{cp.isCompleted ? '완료' : isProgramExpired(cp) ? '만료' : '진행중'}</span>
                            <button type="button" onClick={() => setManageProgram(cp)} aria-label={`${cp.programName} 관리`}
                              className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-600">관리</button>
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">결제 {formatPrice(cp.pricePaid)} · 등록 {formatDate(cp.purchaseDate)}{cp.expiryDate ? ` · 만료일 ${formatDate(cp.expiryDate)}` : ''}</p>
                        {cp.totalSessions != null && (
                          <>
                            <p className="text-xs text-gray-500">
                              사용 {usedSessionsFor(cp)}회 / 총 {cp.totalSessions}회 · 잔여 {remainingFor(cp)}회
                            </p>
                            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mt-1" aria-hidden="true">
                              <div className={`h-1.5 rounded-full ${usedSessionsFor(cp) / cp.totalSessions >= 0.8 ? 'bg-orange-400' : 'bg-blue-400'}`}
                                style={{ width: `${Math.min((usedSessionsFor(cp) / cp.totalSessions) * 100, 100)}%` }} />
                            </div>
                          </>
                        )}
                        {cp.totalSessions == null && <p className="text-xs text-gray-500">기간제 프로그램</p>}
                        <ProgramUsageList cp={cp} customerId={selected.id} />
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
                            <p className="text-xs font-semibold text-gray-800">{formatDate(log.treatmentDate)}</p>
                            {log.staffName && <span className="text-xs text-gray-400">{log.staffName}</span>}
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5">{log.treatmentDetails || log.programName || '시술 내역 없음'}</p>
                          {log.skinCondition && <p className="text-xs text-gray-400 mt-0.5">피부 상태: {log.skinCondition}</p>}
                          <TreatmentPhotoStrip logId={log.id} treatmentDate={log.treatmentDate} customerName={selected.name} tick={photoTick + photoCacheVersion} onOpen={setLightbox} />
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <CustomerPaymentHistory compact customerId={selected.id} onAdd={() => (canSales ? leaveDetailTo(`/sales?new=1&customer=${selected.id}`) : notify.info('결제 등록은 매장 관리자 계정에서 매출 화면으로 해주세요.'))} />

              <FollowUpCard key={`fu-${selected.id}`} customerId={selected.id} actor={user?.name} onSaved={() => { setDetailTick(t => t + 1); setFollowUpTick(t => t + 1); }} />
              <CustomerHistoryCard key={`ch-${selected.id}`} customerId={selected.id} tick={detailTick} />
              <CustomerTimeline key={selected.id} customerId={selected.id} compact tick={detailTick} />

            </div>
            {/* 하단 고정 액션 — 응대 중 가장 자주 쓰는 네 가지를 엄지 범위에. 수정·병합·익명화·삭제는 헤더 [⋯] (7차 UX 점검 2026-11-20) */}
            <div className="bg-white border-t border-gray-100 px-3 pt-2 pb-safe-2 flex gap-2">
              {!isAnonymized(selected) && (
                <>
                  <button
                    type="button"
                    onClick={() => leaveDetailTo(`/reservations?new=1&customer=${selected.id}`)}
                    className="flex-1 min-h-[48px] bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-50 transition-colors flex flex-col items-center justify-center gap-0.5 whitespace-nowrap"
                  >
                    <CalendarPlus size={16} />예약 추가
                  </button>
                  <button
                    type="button"
                    onClick={() => leaveDetailTo(`/messaging?customer=${selected.id}`)}
                    className="flex-1 min-h-[48px] bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-50 transition-colors flex flex-col items-center justify-center gap-0.5 whitespace-nowrap"
                  >
                    <MessageSquare size={16} />메시지
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={openTreatmentModal}
                className="flex-1 min-h-[48px] bg-[#1a3a8f] text-white rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-0.5 whitespace-nowrap"
              >
                <Scissors size={16} />시술 기록
              </button>
              <button
                type="button"
                onClick={() => setShowProgramModal(true)}
                className="flex-1 min-h-[48px] bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-50 transition-colors flex flex-col items-center justify-center gap-0.5 whitespace-nowrap"
              >
                <Plus size={16} />회차권 등록
              </button>
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
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/comma-separated-values,text/plain"
              onChange={handleImportExcel}
              className="hidden"
            />
            <button
              onClick={() => setShowImportGuide(true)}
              aria-label="업로드"
              title="엑셀(xlsx)/CSV로 고객 대량 등록 (이름·전화번호 필수, 중복 자동 제외)"
              className="flex items-center gap-1 px-3 py-1.5 whitespace-nowrap bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 transition-all duration-200"
            >
              <Upload size={12} /><span className="hidden 2xl:inline">업로드</span>
            </button>
            <button
              onClick={exportToExcel}
              aria-label="다운로드"
              title="현재 목록을 엑셀(xlsx)로 다운로드"
              className="flex items-center gap-1 px-3 py-1.5 whitespace-nowrap bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 transition-all duration-200"
            >
              <Download size={12} /><span className="hidden 2xl:inline">다운로드</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 whitespace-nowrap bg-[#1a3a8f] text-white rounded-lg text-xs font-medium hover:bg-[#152f75] transition-all duration-200"
            >
              <Plus size={12} />고객 추가
            </button>
          </div>
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !isImeKey(e)) { e.preventDefault(); openFirstMatch(); } }}
              aria-label="고객 검색" placeholder="이름, 전화번호 검색 (Enter로 첫 결과 열기)"
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>
          {tagChipsRow}
          {savedSegmentRow}
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
              className="flex-shrink-0 px-2.5 py-1.5 min-h-[36px] rounded-lg text-sm font-medium bg-gray-100 text-gray-700 border-0 focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
            >
              {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            {revisitOnly && (
              <button type="button" onClick={() => setRevisitOnly(false)} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-[#1a3a8f] text-white" title="대시보드 오늘 할 일에서 연 필터 — 누르면 해제" aria-label="재방문 권장 필터 해제">재방문 권장 {chipCount(revisitIds)} ✕</button>
            )}
            {programAlertOnly && (
              <button type="button" onClick={() => setProgramAlertOnly(false)} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-[#1a3a8f] text-white" title="대시보드 오늘 할 일에서 연 필터 — 누르면 해제" aria-label="회차권 알림 필터 해제">회차권 알림 {chipCount(programAlertIds)} ✕</button>
            )}
            {norebookOnly && (
              <button type="button" onClick={() => setNorebookOnly(false)} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-[#1a3a8f] text-white" title="이달 방문했지만 다음 예약이 없는 고객 — 대시보드 재예약률에서 연 필터, 누르면 해제" aria-label="재예약 없음 필터 해제" data-testid="norebook-chip">재예약 없음 {chipCount(norebookIds)} ✕</button>
            )}
            {norebookOnly && (norebookIds?.size ?? 0) > 0 && ( /* 재예약 권유 문자까지 한 흐름 — 발송 창 딥링크 norebook 의 생산자 (202) */
              <button type="button" onClick={() => navigate('/messaging?segment=norebook')} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs text-[#1a3a8f] border border-blue-200 bg-white hover:bg-blue-50" aria-label="재예약 없음 고객에게 발송" data-testid="norebook-send">이 고객들에게 발송</button>
            )}
            {/* 연락을 미뤄 둔 고객은 숨겼다는 사실을 적는다 — 조용히 줄어든 숫자는 거짓말이다 (249) */}
            {hiddenByFollowUp > 0 && (
              <span className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs text-gray-600 bg-gray-100" data-testid="follow-up-hidden" title={describeHidden(hiddenByFollowUp) ?? ''}>미룬 {hiddenByFollowUp}명 숨김</span>
            )}
            {(churnHighCount > 0 || churnOnly) && (
              <button type="button" aria-pressed={churnOnly} onClick={() => setChurnOnly(v => !v)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${churnOnly ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
                title={`마지막 방문 뒤 지난 날이 이 고객의 방문 주기 ${CHURN_HIGH_RATIO}배를 넘고 다음 예약이 없는 고객`}>
                이탈 위험 {churnHighCount}
              </button>
            )}
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
          {retentionOnly && canManage && (
            <div className="mt-2 flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl" data-testid="retention-bar">
              <p className="text-xs text-amber-800 min-w-0">보존기간({retentionPolicy.years}년) 경과 {filtered.length}명 — 개인 식별 정보·기록의 이름·사진을 지우고 통계만 남깁니다</p>
              <button
                type="button"
                onClick={handleAnonymizeExpired}
                disabled={filtered.length === 0}
                className="flex-shrink-0 min-h-[44px] px-3 inline-flex items-center bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
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
              <p className="text-sm text-gray-400">{customers.length === 0 ? '아직 고객이 없습니다' : '조건에 맞는 고객이 없어요'}</p>
              {customers.length === 0 && (
                <button type="button" onClick={() => setShowAddModal(true)} className="mt-3 px-4 py-2 bg-[#1a3a8f] text-white rounded-xl text-xs font-medium hover:bg-[#152f75]">첫 고객 등록하기</button>
              )}
            </div>
          ) : (
            visible.map(customer => {
              const daysSince = getDaysSince(statsOf(customer).lastVisitDate ?? undefined);
              const churn = segmentIndex.get(customer.id)?.churn ?? null; // 일괄 60일 대신 이 고객의 방문 주기 대비 (136)
              const isRisk = churn?.level === 'high';
              const activeProgs = activeProgCount.get(customer.id) || 0;
              return (
                <button
                  key={customer.id}
                  onClick={() => openCustomer(customer)} // 목록에서 열 때도 누적값 재계산(70·71)을 거친다 — E2E customer-stats가 잡은 누락 (95, 2026-11-20)
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 ${selected?.id === customer.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {customer.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-gray-900 truncate">{customer.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${GRADE_COLORS[customer.grade]}`}>
                          {customer.grade}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 truncate">{phoneFor(user?.role, customer.phone)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-600 pl-10">
                    <span>방문 {statsOf(customer).totalVisits}회</span>
                    {activeProgs > 0 && (
                      <span className="text-primary-600 font-medium">활성 {activeProgs}개</span>
                    )}
                    {isRisk && churn && <span className="inline-flex items-center gap-0.5 text-rose-700 font-medium" title={`${daysSince}일 미방문 — 이 고객 방문 주기의 ${Math.round(churn.ratio * 100)}%`}><AlertCircle size={11} />이탈 위험</span>}
                  </div>
                </button>
              );
            })
          )}
          {filtered.length > listLimit && (
            <button type="button" onClick={() => setListLimit(n => n + LIST_PAGE)}
              className="w-full py-3 text-sm font-medium text-[#1a3a8f] bg-white border border-gray-200 rounded-xl hover:bg-gray-50 min-h-[44px]">
              더 보기 ({filtered.length - listLimit}명 남음)
            </button>
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
                  <div className="w-14 h-14 flex-shrink-0 rounded-2xl bg-primary-500 flex items-center justify-center text-white text-xl font-bold">
                    {selected.name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-gray-900 whitespace-nowrap">{selected.name}</h2>
                      {gradeChip(selected, false)}
                    </div>
                    <p className="text-sm text-gray-500"><PhoneLink phone={selected.phone} role={piiOk ? 'admin' : 'staff'} /></p>
                    {selected.skinType && <p className="text-xs text-gray-400 mt-0.5">피부 유형: {selected.skinType}</p>}
                    {(() => {
                      // 폼에서 받는 정보를 상세에서도 보이게 — 이메일·주소는 목록 내보내기(이 화면)와 같은 규칙으로 staff 역할에게 숨김, 역할을 모르면 숨김 (2026-11-18)
                      const parts = [
                        selected.gender && selected.gender !== '미입력' ? selected.gender : '',
                        selected.birthDate ? `생일 ${birthDateFor(user?.role, selected.birthDate)}` : '',
                        piiOk && selected.email ? selected.email : '',
                        piiOk && selected.address ? selected.address : '',
                        selected.referralSource ? `유입 ${selected.referralSource}` : '',
                      ].filter(Boolean);
                      return parts.length > 0 ? <p className="text-xs text-gray-400 mt-0.5 truncate" title={parts.join(' · ')}>{parts.join(' · ')}</p> : null;
                    })()}
                    {selected.allergies && (
                      <p className="text-xs mt-0.5 text-amber-800 font-medium bg-amber-50 border border-amber-100 rounded-lg px-2 py-0.5 inline-block" data-testid="allergy-row">⚠ 알레르기·주의: {selected.allergies}</p>
                    )}
                    <p className={`text-xs mt-0.5 ${isAnonymized(selected) ? 'text-gray-400' : selected.privacyConsent ? 'text-green-700' : 'text-amber-700'}`}>
                      개인정보 동의: {isAnonymized(selected)
                        ? '익명화됨 (보존기간 경과)'
                        : selected.privacyConsent
                          ? `동의함${selected.privacyConsentAt ? ` (${formatLocalDate(selected.privacyConsentAt)})` : ''}`
                          : '기록 없음 (구 등록 고객)'}
                    </p>
                    {selectedNoShows > 0 && (
                      <p className="text-xs mt-0.5 text-rose-600 font-medium" data-testid="noshow-badge">노쇼 {selectedNoShows}회 — 예약 확인 연락을 권장합니다</p>
                    )}
                    {tagChips}{selected && <ConsentControl customer={selected} onChanged={() => { loadAll(); setSelected(prev => (prev ? CustomerStore.getAll().find(c => c.id === prev.id) ?? prev : prev)); }} />}{dupHint}
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
                    onClick={openTreatmentModal}
                    className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap bg-[#1a3a8f] text-white rounded-xl text-xs font-medium hover:bg-[#152f75] transition-colors"
                  >
                    <Scissors size={12} />시술 기록
                  </button>
                  <button
                    onClick={() => setShowProgramModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-50 transition-colors"
                  >
                    <Plus size={12} />회차권 등록
                  </button>
                  {!isAnonymized(selected) && (
                    <>
                      <button
                        onClick={() => navigate(`/reservations?new=1&customer=${selected.id}`)}
                        className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-50 transition-colors"
                        title="이 고객으로 예약 추가 창을 엽니다"
                      >
                        <CalendarPlus size={12} />예약 추가
                      </button>
                      <button
                        onClick={() => navigate(`/messaging?customer=${selected.id}`)}
                        className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-50 transition-colors"
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
                  {canManage && ( /* 병합·익명화·삭제 — 관리자만 (13차 #H4). hidden 속성은 flex 클래스가 이겨 보였다 */
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowMoreMenu(v => !v)}
                      ref={moreBtnRef}
                      aria-label="더보기"
                      title="병합·익명화·삭제"
                      aria-haspopup="menu"
                      aria-expanded={showMoreMenu}
                      className="flex items-center gap-1 px-2.5 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-50 transition-colors"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {showMoreMenu && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)} />
                        <div ref={moreMenuRef} role="menu" aria-label="고객 관리 더보기" className="absolute right-0 mt-1 z-20 w-56 bg-white border border-gray-100 rounded-xl shadow-lg py-1">
                          {canManage && !mergeBlockReason(selected) && (
                            <button type="button" role="menuitem" onClick={() => { setShowMoreMenu(false); setShowMergeModal(true); }}
                              title="같은 사람이 두 번 등록된 경우, 다른 고객의 기록을 이 고객으로 합칩니다"
                              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                              <GitMerge size={13} className="text-gray-400" />중복 고객 병합
                            </button>
                          )}
                          {canManage && !isAnonymized(selected) && !selected.id.startsWith('sample_') && (
                            <button type="button" role="menuitem" onClick={() => { setShowMoreMenu(false); handleAnonymizeOne(); }} aria-label="고객 익명화"
                              title="개인정보만 지우고 방문·결제 통계와 기록 연결은 남깁니다"
                              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                              <UserX size={13} className="text-gray-400" />고객 익명화
                            </button>
                          )}
                          {canManage && (
                          <button type="button" role="menuitem" onClick={() => { setShowMoreMenu(false); handleDeleteCustomer(); }} aria-label="고객 삭제"
                            className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2">
                            <Trash2 size={13} />고객 삭제
                          </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-5 gap-3 mt-4 pt-4 border-t border-gray-50">
                <div className="text-center">
                  <p className="text-xs text-gray-400">총 방문</p>
                  <p className="text-lg font-bold text-gray-900" data-testid="customer-total-visits">{selected.totalVisits}회</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">누적 결제</p>
                  <p className="text-lg font-bold text-gray-900" data-testid="customer-total-spent">{formatPrice(selected.totalSpent)}</p>
                  {selectedValue && selectedValue.realizedRevenue !== (selected.totalSpent || 0) && <p className="text-xs text-gray-500" title="회차권은 사용한 회차만큼만">실현 {formatPrice(selectedValue.realizedRevenue)}</p>}
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">마지막 방문</p>
                  <p className="text-sm font-semibold text-gray-700">{formatDate(statsOf(selected).lastVisitDate || selected.lastVisitDate)}</p>
                  {selectedCycle && <p className="text-xs text-gray-500">주기 {selectedCycle.days}일{selectedCycle.basis === 'shop' ? ' (매장 기준)' : ''}</p>}
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">등록일</p>
                  <p className="text-sm font-semibold text-gray-700">{formatLocalDate(selected.registeredAt)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">다음 방문 권장</p>
                  <p><RevisitBadge customerId={selected.id} /></p>
                </div>
              </div>

              {(selectedSeg || selectedCycle || selectedValue) && (
                <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-gray-50" data-testid="customer-analytics">
                  {selectedSeg && (
                    <div>
                      <p className="text-xs text-gray-500">고객 구분</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedSeg.rfm.segment}{selectedSeg.churn && <span className={`ml-1 text-xs font-medium ${selectedSeg.churn.level === 'high' ? 'text-rose-700' : selectedSeg.churn.level === 'medium' ? 'text-amber-700' : 'text-gray-500'}`}>· 이탈 위험 {CHURN_LABEL[selectedSeg.churn.level]}</span>}</p>
                      <p className="text-xs text-gray-500">최근성 {selectedSeg.rfm.r}·빈도 {selectedSeg.rfm.f}·금액 {selectedSeg.rfm.m} (최근 1년, 매장 내 5분위)</p>
                    </div>
                  )}
                  {selectedCycle && (
                    <div>
                      <p className="text-xs text-gray-500">방문 주기</p>
                      <p className="text-sm font-semibold text-gray-900 tabular-nums">{selectedCycle.days}일 <span className="text-xs font-normal text-gray-500">{selectedCycle.basis === 'personal' ? '이 고객 기준' : '매장 기준'}</span></p>
                      <p className="text-xs text-gray-500">{selectedCycle.basis === 'personal' ? `방문 간격 ${selectedCycle.intervals}개의 중앙값` : '방문 3회 미만이라 매장 기본 주기'}</p>
                    </div>
                  )}
                  {selectedValue && (
                    <div>
                      <p className="text-xs text-gray-500">실현 매출</p>
                      <p className="text-sm font-semibold text-gray-900 tabular-nums">{formatPrice(selectedValue.realizedRevenue)}</p>
                      <p className="text-xs text-gray-500">회차권은 사용한 회차만큼(기간제 전액)</p>
                    </div>
                  )}
                  {selectedValue && selectedValue.avgTicket !== null && (
                    <div>
                      <p className="text-xs text-gray-500">객단가</p>
                      <p className="text-sm font-semibold text-gray-900 tabular-nums">{formatPrice(selectedValue.avgTicket)}</p>
                      <p className="text-xs text-gray-500">실현 매출 ÷ 방문 {statsOf(selected).totalVisits}회{selectedValue.annualForecast !== null && canDo(user?.role, 'sales.view') ? ` · 연간 기대 ${formatPrice(selectedValue.annualForecast)} (예측: × 365 ÷ 주기)` : ''}</p>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-3 p-3 bg-gray-50 rounded-xl">
                {selected.memo ? <p className="text-xs text-gray-700 whitespace-pre-line break-words max-h-64 overflow-y-auto">{selected.memo}</p> : <p className="text-xs text-gray-500">메모 없음</p>}
                {quickMemoRow(false)}
                {quickMemoPresets()}
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
                            onClick={() => handleConsultDelete(c)}
                            className="text-gray-300 hover:text-red-600"
                            aria-label={`${formatDate(c.consultDate)} 상담 삭제`}
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
                                <p className="text-2xs text-gray-400">{e.label}</p>
                                <p className="text-xs font-bold text-indigo-700">{e.v}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {c.recommendedSolution && (
                          <div className="mt-1 p-2.5 bg-white rounded-lg border border-indigo-50">
                            <p className="text-2xs font-semibold text-indigo-600 mb-0.5">추천 솔루션</p>
                            <p className="text-xs text-gray-700 whitespace-pre-line">{c.recommendedSolution}</p>
                          </div>
                        )}
                        {c.recommendedProducts.length > 0 && (
                          <p className="text-xs text-gray-500 mt-1.5">🧴 {c.recommendedProducts.join(', ')}</p>
                        )}
                        {c.managerNote && (
                          <p className="text-xs text-gray-500 mt-1.5">{c.managerNote}</p>
                        )}
                        {c.nextConsultDate && (
                          <p className="text-xs text-indigo-600 mt-1.5">다음 관리 권고일: {formatDate(c.nextConsultDate)}</p>
                        )}
                        <ConsultPhotoStrip consultId={c.id} consultDate={c.consultDate} customerName={selected.name} tick={consultPhotoTick + photoCacheVersion} onOpen={setLightbox} />
                        <button
                          type="button"
                          onClick={() => handleConsultPdf(c)}
                          disabled={pdfBusyId === c.id}
                          aria-label={`${formatDate(c.consultDate)} 상담 결과지 PDF`}
                          className="mt-2 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-indigo-100 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          <FileText size={12} />{pdfBusyId === c.id ? '만드는 중...' : '결과지 PDF'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openConsultEdit(c)}
                          aria-label={`${formatDate(c.consultDate)} 상담 수정`}
                          className="mt-2 ml-1.5 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"
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
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                >
                  <Plus size={12} />추가
                </button>
              </div>

              {customerPrograms.length === 0 ? (
                <div className="text-center py-6">
                  <Tag size={28} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">등록된 회차권이 없어요</p>
                  <button onClick={() => setShowProgramModal(true)} className="mt-2 text-xs text-primary-600 hover:underline">
                    회차권 등록하기
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {customerPrograms.map(cp => {
                    const used = usedSessionsFor(cp); // 기록에서 센 사용 회차 (16차 #H2)
                    const remaining = remainingFor(cp);
                    const progress = cp.totalSessions ? (used / cp.totalSessions) * 100 : 0;
                    const isExpired = isProgramExpired(cp);
                    return (
                      <div
                        key={cp.id}
                        data-testid="program-card"
                        className={`border rounded-xl p-4 ${cp.isCompleted || isExpired ? 'border-dashed border-gray-300 bg-slate-50' : 'border-blue-100 bg-blue-50/30'}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{cp.category}</span>
                              {cp.isCompleted && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">완료</span>}
                              {isExpired && !cp.isCompleted && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">만료</span>}
                            </div>
                            <p className="font-semibold text-sm text-gray-900 mt-1">{cp.programName}</p>
                          </div>
                          <div className="flex items-start gap-2">
                            <div className="text-right">
                              <p className="text-xs text-gray-400">결제</p>
                              <p className="text-sm font-bold text-gray-800">{formatPrice(cp.pricePaid)}</p>
                            </div>
                            <button type="button" onClick={() => setManageProgram(cp)} aria-label={`${cp.programName} 관리`}
                              className="px-2 py-1 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 whitespace-nowrap">관리</button>
                          </div>
                        </div>

                        {cp.totalSessions !== null ? (
                          <>
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                              <span>사용 {used}회 / 총 {cp.totalSessions}회</span>
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

                        <ProgramUsageList cp={cp} customerId={selected.id} />
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
                          <Scissors size={14} className="text-green-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-800 truncate">{log.programName || log.treatmentDetails || '시술 내역 없음'}</p>
                            <span className="text-xs text-slate-600 flex-shrink-0 ml-2">{formatDate(log.treatmentDate)}</span>
                          </div>
                          {log.staffName && <p className="text-xs text-slate-600">담당: {log.staffName}</p>}
                          {log.treatmentDetails && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{log.treatmentDetails}</p>}
                          <TreatmentPhotoStrip logId={log.id} treatmentDate={log.treatmentDate} customerName={selected.name} tick={photoTick + photoCacheVersion} onOpen={setLightbox} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <CustomerPaymentHistory customerId={selected.id} onAdd={() => (canSales ? navigate(`/sales?new=1&customer=${selected.id}`) : notify.info('결제 등록은 매장 관리자 계정에서 매출 화면으로 해주세요.'))} />

            <FollowUpCard key={`fu-${selected.id}`} customerId={selected.id} actor={user?.name} onSaved={() => { setDetailTick(t => t + 1); setFollowUpTick(t => t + 1); }} />
            <CustomerHistoryCard key={`ch-${selected.id}`} customerId={selected.id} tick={detailTick} />
            <CustomerTimeline key={selected.id} customerId={selected.id} tick={detailTick} />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <User size={48} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">고객을 선택하세요</p>
            <p className="text-sm text-gray-500 mt-1">왼쪽 목록에서 고객을 클릭하면 상세 정보가 표시됩니다</p>
          </div>
        </div>
      )}

      {/* ───── 고객 엑셀 업로드 가이드 모달 ───── */}
      {showImportGuide && (
        <div className="modal-backdrop fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div ref={importGuideRef} role="dialog" aria-modal="true" aria-label="엑셀 업로드 안내" className="modal-card bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">고객 엑셀 업로드</h2>
              <button onClick={() => setShowImportGuide(false)} className="text-gray-400 hover:text-gray-600 hover:rotate-90 transition-all duration-200" aria-label="닫기"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                기존에 관리하던 고객 명단을 엑셀 파일로 한 번에 등록할 수 있습니다.
                아래 <strong>양식 다운로드</strong>로 받은 파일에 고객 정보를 채운 뒤 업로드하세요.
              </p>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-xs text-gray-600">
                <p className="font-bold text-gray-800 text-sm mb-1">양식 안내</p>
                <p>• <strong className="text-red-600">필수</strong>: <strong>이름</strong>, <strong>전화번호</strong> — 둘 중 하나라도 없으면 그 줄은 건너뜁니다</p>
                <p>• 선택: 성별(남성/여성), 등급(신규·VIP 등), 생년월일(1990-01-15 형식), 피부유형, 유입경로, 이메일, 주소, 메모</p>
                <p>• 첫 번째 줄은 반드시 <strong>항목 이름(헤더)</strong>이어야 하고, 첫 번째 시트만 읽습니다</p>
                <p>• 이미 등록된 고객과 <strong>전화번호가 같으면 자동으로 건너뜁니다</strong> (중복 걱정 없음) — 기존 고객 정보는 바뀌지 않는 신규 추가 전용입니다</p>
                <p>• 생년월일을 읽지 못한 줄은 생년월일만 비우고 등록합니다 (YYYY-MM-DD 로 적어주세요)</p>
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
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl hover:bg-[#152f75] transition-colors"
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
          <div ref={addModalRef} role="dialog" aria-modal="true" aria-label="고객 추가" className="modal-card my-auto bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">고객 추가</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 hover:rotate-90 transition-all duration-200" aria-label="닫기"><X size={18} /></button>
            </div>
            <form onSubmit={handleAddCustomer} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">이름 *</label>
                  <input aria-label="이름" required value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" placeholder="홍길동" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">전화번호 *</label>
                  <input aria-label="전화번호" type="tel" inputMode="numeric" autoComplete="off" required value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: formatPhoneInput(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" placeholder="010-0000-0000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">성별</label>
                  <select aria-label="성별" value={addForm.gender} onChange={e => setAddForm(f => ({ ...f, gender: e.target.value as Gender }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                    <option value="여성">여성</option><option value="남성">남성</option><option value="미입력">미입력</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">등급</label>
                  <select aria-label="등급" value={addForm.grade} onChange={e => setAddForm(f => ({ ...f, grade: e.target.value as CustomerGrade }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">{/* 연/월/일 3칸 — PC 모달(max-w-md)에서도 반 폭이면 "연도"가 잘려 항상 한 줄 전체 (리뷰 2026-11-18) */}
                  <label className="block text-xs font-medium text-gray-600 mb-1">생년월일</label>
                  <BirthDateSelect value={addForm.birthDate} onChange={v => setAddForm(f => ({ ...f, birthDate: v }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">피부 유형</label>
                  <select aria-label="피부 유형" value={addForm.skinType} onChange={e => setAddForm(f => ({ ...f, skinType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                    <option value="">선택 안함</option>
                    {['건성', '지성', '복합성', '민감성', '중성'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">이메일</label>
                <input aria-label="이메일" type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" placeholder="example@email.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">주소</label>
                <input aria-label="주소" type="text" value={addForm.address} onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" placeholder="예: 서울시 강남구 테헤란로 1" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">유입 경로</label>
                <select aria-label="유입 경로" value={addForm.referralSource} onChange={e => setAddForm(f => ({ ...f, referralSource: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                  <option value="">선택</option>
                  {['네이버', '카카오', '지인 소개', '간판', '유튜브', 'SNS', '직접 방문', '기타'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">태그 <span className="text-gray-400 font-normal">(쉼표로 구분)</span></label>
                <input value={addForm.tags} onChange={e => setAddForm(f => ({ ...f, tags: e.target.value }))} aria-label="태그" placeholder="예: 민감성, 재구매, 단골"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                <div className="mt-1.5 flex flex-wrap gap-1" data-testid="tag-chips">
                  {tagChipChoices.map(c => (
                    <button key={c.tag} type="button" onClick={() => appendTagWith(addForm.tags, c.tag, next => setAddForm(fm => ({ ...fm, tags: next })))}
                      disabled={countInputTags(addForm.tags) >= MAX_TAGS_PER_CUSTOMER && !addForm.tags.includes(c.tag)}
                      className={`px-2 py-0.5 rounded-full text-xs border disabled:opacity-40 ${c.registered ? 'bg-blue-50 text-[#1a3a8f] border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                      title={c.registered ? `${c.count}명 사용 중` : `목록에 없는 태그 · ${c.count}명 사용 중`}>
                      #{c.tag}{c.registered ? '' : ' (미등록)'}
                    </button>
                  ))}
                  {canManage && (
                    <button type="button" onClick={openTagPanel} data-testid="tag-master-open"
                      className="px-2 py-0.5 rounded-full text-xs border border-dashed border-gray-300 text-gray-600">태그 목록 관리</button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">알레르기·주의사항</label>
                <input value={addForm.allergies} onChange={e => setAddForm(f => ({ ...f, allergies: e.target.value }))} aria-label="알레르기" placeholder="예: 레티놀 자극, 견과류 알레르기"
                  className="w-full px-3 py-2 border border-amber-200 bg-amber-50/40 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">메모</label>
                <textarea aria-label="메모" maxLength={2000} value={addForm.memo} onChange={e => setAddForm(f => ({ ...f, memo: e.target.value }))}
                  rows={2} placeholder="특이사항 (알레르기는 위 칸에)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none" />
              </div>
              <label className="flex items-start gap-2 p-3 bg-blue-50/60 border border-blue-100 rounded-xl cursor-pointer">
                <input type="checkbox" checked={addPrivacyConsent} onChange={e => setAddPrivacyConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4" />
                <span className="text-xs text-gray-700 leading-relaxed">
                  <span className="font-semibold">[필수] 개인정보 수집·이용 동의</span><br />
                  고객 관리 목적으로 이름·연락처 등 개인정보를 수집·이용하는 것에 대해 고객 본인의 동의를 받았습니다.
                </span>
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all">취소</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium hover:bg-[#152f75] transition-all duration-200">등록</button>
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
          <div ref={editModalRef} role="dialog" aria-modal="true" aria-label="고객 정보 수정" className="modal-card my-auto bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">고객 정보 수정</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600 hover:rotate-90 transition-all duration-200" aria-label="닫기"><X size={18} /></button>
            </div>
            <form onSubmit={handleEditCustomer} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">이름 *</label>
                  <input aria-label="이름" required value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" placeholder="홍길동" />
                </div>
                {piiOk ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">전화번호 *</label>
                  <input aria-label="전화번호" type="tel" inputMode="numeric" autoComplete="off" required value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: formatPhoneInput(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" placeholder="010-0000-0000" />
                </div>
                ) : (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">전화번호</p>
                  <p className="px-3 py-2 text-sm text-gray-500 bg-gray-50 rounded-xl tabular-nums">{maskPhone(selected.phone, 'staff')}</p>
                  <p className="mt-1 text-xs text-gray-500">전화·이메일·주소·생년월일은 매장 관리자만 수정할 수 있습니다.</p>{/* 툴팁은 폰에서 볼 수 없다 (15차 #M9) */}
                </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">성별</label>
                  <select aria-label="성별" value={editForm.gender} onChange={e => setEditForm(f => ({ ...f, gender: e.target.value as Gender }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                    <option value="여성">여성</option><option value="남성">남성</option><option value="미입력">미입력</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">등급</label>
                  <select aria-label="등급" value={editForm.grade} onChange={e => setEditForm(f => ({ ...f, grade: e.target.value as CustomerGrade }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {piiOk && (
                <div className="col-span-2">{/* 연/월/일 3칸 — PC 모달(max-w-md)에서도 반 폭이면 "연도"가 잘려 항상 한 줄 전체 (리뷰 2026-11-18) */}
                  <label className="block text-xs font-medium text-gray-600 mb-1">생년월일</label>
                  <BirthDateSelect value={editForm.birthDate} onChange={v => setEditForm(f => ({ ...f, birthDate: v }))} />
                </div>
                )}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">피부 유형</label>
                  <select aria-label="피부 유형" value={editForm.skinType} onChange={e => setEditForm(f => ({ ...f, skinType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                    <option value="">선택 안함</option>
                    {['건성', '지성', '복합성', '민감성', '중성'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              {piiOk && (<>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">이메일</label>
                <input aria-label="이메일" type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" placeholder="example@email.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">주소</label>
                <input aria-label="주소" type="text" value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" placeholder="예: 서울시 강남구 테헤란로 1" />
              </div>
              </>)}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">유입 경로</label>
                <select aria-label="유입 경로" value={editForm.referralSource} onChange={e => setEditForm(f => ({ ...f, referralSource: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                  <option value="">선택</option>
                  {['네이버', '카카오', '지인 소개', '간판', '유튜브', 'SNS', '직접 방문', '기타'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">태그 <span className="text-gray-400 font-normal">(쉼표로 구분)</span></label>
                <input value={editForm.tags} onChange={e => setEditForm(f => ({ ...f, tags: e.target.value }))} aria-label="태그" placeholder="예: 민감성, 재구매, 단골"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                <div className="mt-1.5 flex flex-wrap gap-1" data-testid="tag-chips">
                  {tagChipChoices.map(c => (
                    <button key={c.tag} type="button" onClick={() => appendTagWith(editForm.tags, c.tag, next => setEditForm(fm => ({ ...fm, tags: next })))}
                      disabled={countInputTags(editForm.tags) >= MAX_TAGS_PER_CUSTOMER && !editForm.tags.includes(c.tag)}
                      className={`px-2 py-0.5 rounded-full text-xs border disabled:opacity-40 ${c.registered ? 'bg-blue-50 text-[#1a3a8f] border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                      title={c.registered ? `${c.count}명 사용 중` : `목록에 없는 태그 · ${c.count}명 사용 중`}>
                      #{c.tag}{c.registered ? '' : ' (미등록)'}
                    </button>
                  ))}
                  {canManage && (
                    <button type="button" onClick={openTagPanel} data-testid="tag-master-open"
                      className="px-2 py-0.5 rounded-full text-xs border border-dashed border-gray-300 text-gray-600">태그 목록 관리</button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">알레르기·주의사항</label>
                <input value={editForm.allergies} onChange={e => setEditForm(f => ({ ...f, allergies: e.target.value }))} aria-label="알레르기" placeholder="예: 레티놀 자극, 견과류 알레르기"
                  className="w-full px-3 py-2 border border-amber-200 bg-amber-50/40 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">메모</label>
                <textarea aria-label="메모" maxLength={2000} value={editForm.memo} onChange={e => setEditForm(f => ({ ...f, memo: e.target.value }))}
                  rows={2} placeholder="특이사항 (알레르기는 위 칸에)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all">취소</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium hover:bg-[#152f75] transition-all duration-200">저장</button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* ───── 프로그램 등록 모달 ───── */}
      {showProgramModal && selected && createPortal(
        <div className="modal-backdrop fixed inset-0 bg-black/40 flex justify-center z-[60] p-4 overflow-y-auto">
          <div ref={programModalRef} role="dialog" aria-modal="true" aria-label="회차권 등록" className="modal-card my-auto bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">회차권 등록</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selected.name} 고객</p>
              </div>
              <button onClick={() => setShowProgramModal(false)} aria-label="닫기"><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleRegisterProgram} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">프로그램 선택 *</label>
                <select aria-label="프로그램 선택"
                  required
                  value={progForm.programId}
                  onChange={e => {
                    const prog = programs.find(p => p.id === e.target.value);
                    setProgForm(f => ({ ...f, programId: e.target.value, pricePaid: prog ? prog.price.toString() : '' }));
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                >
                  <option value="">{programs.length === 0 ? '등록할 수 있는 활성 프로그램이 없습니다' : '프로그램을 선택하세요'}</option>
                  {programs.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatPrice(p.price)}
                    </option>
                  ))}
                </select>
                {programs.length === 0 && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    먼저 시술 프로그램을 등록(또는 활성)하세요.{' '}
                    <button type="button" onClick={() => { setShowProgramModal(false); navigate('/programs'); }} className="underline font-medium">시술 프로그램으로 이동</button>
                  </p>
                )}
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
                  <input aria-label="실제 결제 금액"
                    required
                    type="text"
                    value={progForm.pricePaid && !Number.isNaN(parseInt(progForm.pricePaid)) ? parseInt(progForm.pricePaid).toLocaleString('ko-KR') : ''}
                    onChange={e => setProgForm(f => ({ ...f, pricePaid: e.target.value.replace(/,/g, '') }))}
                    className="w-full pl-3 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-gray-400">원</span>
                </div>
                {selectedProgForForm && progForm.pricePaid && parseInt(progForm.pricePaid) < selectedProgForForm.price && (
                  <p className="text-xs text-orange-700 mt-1">
                    💡 정가보다 {formatPrice(selectedProgForForm.price - parseInt(progForm.pricePaid))} 할인
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">결제 수단</label>
                  <select aria-label="결제 수단" value={progForm.paymentMethod} onChange={e => setProgForm(f => ({ ...f, paymentMethod: e.target.value as PaymentMethod }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                    {getAllPaymentMethods().map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">구매 날짜</label>
                  <input aria-label="구매 날짜" type="date" required value={progForm.purchaseDate} onChange={e => setProgForm(f => ({ ...f, purchaseDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">메모 (선택)</label>
                <input aria-label="메모 (선택)" value={progForm.notes} onChange={e => setProgForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" placeholder="특이사항 등" />
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => setShowProgramModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  <CheckCircle size={14} />회차권 등록
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
          <div ref={treatmentModalRef} role="dialog" aria-modal="true" aria-label="시술 기록 추가" className="modal-card my-auto bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">시술 기록 추가</h2>
                <p className="text-xs text-gray-400 mt-0.5">{treatUsable.length > 0 ? `${selected.name} — 회차 차감` : selected.name}</p>
              </div>
              <button onClick={() => setShowTreatmentModal(false)} aria-label="닫기"><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleTreatment} className="p-5 space-y-4">
              <div>
                <label htmlFor="quick-treat-program" className="block text-xs font-medium text-gray-600 mb-1">차감할 회차권·프로그램</label>
                <select id="quick-treat-program" aria-describedby={treatExpired.length > 0 ? 'expired-program-hint' : undefined}
                  value={treatForm.customerProgramId}
                  onChange={e => setTreatForm(f => ({ ...f, customerProgramId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                  <option value="">연결 안 함 (단건 시술)</option>
                  {treatUsable.map(cp => { const used = usedSessionsFor(cp); return ( // 기록에서 센 사용 회차 (16차 #H2)
                    <option key={cp.id} value={cp.id}>
                      {cp.totalSessions !== null ? `${cp.programName} · 잔여 ${remainingSessions(cp, used)}회 (${used}/${cp.totalSessions})` : `${cp.programName} · 기간제 (${used}회 이용)`}
                    </option>
                  ); })}
                </select>
                {treatExpired.length > 0 && (
                  <div id="expired-program-hint" data-testid="expired-program-hint" className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
                    <span className="flex-1 min-w-0">{expiredProgramsHint(treatExpired, '옆의 [만료일 연장] 버튼')}</span>
                    {/* 관리 창은 elevated Modal(z-[70])이라 이 창(z-[60]) 위에 겹쳐 뜬다 — 연장을 저장하면 handleProgramManaged가 선택지를 다시 계산하고 하나뿐이면 바로 연결한다 (UX 점검·리뷰 2026-11-19) */}
                    <button type="button" onClick={() => setManageProgram(treatExpired[0])}
                      className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 font-medium text-amber-800 hover:bg-amber-100">만료일 연장</button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">시술일 *</label>
                  <input aria-label="시술일" required type="date" value={treatForm.treatmentDate} onChange={e => {
                    // 시술일이 바뀌면 연결도 그 날짜 기준으로 — 만료돼 빠지면 비우고, 쓸 수 있는 회차권이 하나뿐이면 다시 연결 (리뷰 2026-11-19)
                    const v = e.target.value;
                    const usable = selected ? getUsablePrograms(selected.id, v) : [];
                    setTreatForm(f => ({ ...f, treatmentDate: v, customerProgramId: f.customerProgramId && usable.some(cp => cp.id === f.customerProgramId) ? f.customerProgramId : usable.length === 1 ? usable[0].id : '' }));
                  }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">시간</label>
                  <input aria-label="시간" type="time" value={treatForm.treatmentTime} onChange={e => setTreatForm(f => ({ ...f, treatmentTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">담당 직원</label>
                <select aria-label="담당 직원" value={treatForm.staffName} onChange={e => setTreatForm(f => ({ ...f, staffName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                  <option value="">선택</option>
                  {StaffStore.getAll().filter(s => s.isActive).map(s => (
                    <option key={s.id} value={s.name}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">시술 내용</label>
                <textarea aria-label="시술 내용" value={treatForm.treatmentDetails} onChange={e => setTreatForm(f => ({ ...f, treatmentDetails: e.target.value }))}
                  rows={2} placeholder="시술 내용을 기록하세요"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">피부 상태</label>
                <input aria-label="피부 상태" value={treatForm.skinCondition} onChange={e => setTreatForm(f => ({ ...f, skinCondition: e.target.value }))}
                  placeholder="오늘 피부 상태 메모"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">다음 예약 권고일</label>
                <input aria-label="다음 예약 권고일" type="date" value={treatForm.nextAppointment} onChange={e => setTreatForm(f => ({ ...f, nextAppointment: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => setShowTreatmentModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
                <button type="submit" className="flex-1 py-2.5 bg-green-700 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
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
          <div ref={consultModalRef} role="dialog" aria-modal="true" aria-label="피부 상담" className="modal-card my-auto bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between p-5 border-b border-gray-100 z-10">
              <div>
                <h2 className="font-bold text-gray-900 flex items-center gap-1.5">
                  <Sparkles size={16} className="text-indigo-600" />피부 상담{beaconEnabled ? ' · 비컨 분석' : ''}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{selected.name} 고객 · 1:1 맞춤 솔루션</p>
              </div>
              <button onClick={() => { setShowConsultModal(false); setSavedConsultId(null); }} aria-label="닫기"><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleSaveConsultation} className="p-5 space-y-5">
              {/* 상담일 / 담당 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">상담일 *</label>
                  <input aria-label="상담일" required type="date" value={consultForm.consultDate}
                    onChange={e => setConsultForm(f => ({ ...f, consultDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">담당 직원</label>
                  <select aria-label="담당 직원" value={consultForm.staffName} onChange={e => setConsultForm(f => ({ ...f, staffName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                    <option value="">선택</option>
                    {StaffStore.getAll().filter(s => s.isActive).map(s => (
                      <option key={s.id} value={s.name}>{s.name} ({s.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* AI 피부 분석 (킬러①) — 사진 → 비전 AI 분석. 비컨 토글이 켜졌거나 AI(본사 중계·지점 키)를 쓸 수 있으면 노출 (2026-09-07) */}
              {(beaconEnabled || skinAiAvailable) && (
              <div className="bg-primary-50 border border-primary-100 rounded-xl p-3.5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles size={14} className="text-primary-600" />
                  <label className="text-xs font-semibold text-primary-800">AI 피부 분석 (사진)</label>
                  <span className="text-2xs text-gray-400">· 관리 참고용 (의학적 진단 아님)</span>
                </div>
                <input ref={consultPhotoRef} type="file" accept="image/*" onChange={handleConsultPhoto} className="hidden" />
                <div className="flex gap-3">
                  {aiPhoto ? (
                    <img src={aiPhoto} alt="분석 사진" className="w-20 h-20 rounded-xl object-cover border border-indigo-100 flex-shrink-0" />
                  ) : (
                    <button type="button" onClick={() => consultPhotoRef.current?.click()}
                      className="w-20 h-20 rounded-xl border-2 border-dashed border-indigo-200 flex flex-col items-center justify-center gap-1 text-indigo-400 hover:border-indigo-400 transition-colors flex-shrink-0">
                      <Camera size={18} />
                      <span className="text-2xs">사진</span>
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    {aiPhoto && (
                      <div className="flex gap-2 mb-2">
                        <button type="button" onClick={runSkinAnalysis} disabled={aiAnalyzing}
                          className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1.5">
                          {aiAnalyzing ? <><Loader2 size={12} className="animate-spin" />분석 중...</> : <><Sparkles size={12} />AI 분석 실행</>}
                        </button>
                        <button type="button" onClick={() => consultPhotoRef.current?.click()}
                          className="px-3 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-lg text-xs font-medium hover:bg-gray-50">다른 사진</button>
                      </div>
                    )}
                    {!aiPhoto && (
                      <p className="text-xs text-gray-500 leading-relaxed">
                        고객 얼굴 사진을 올리면 AI가 수분·유분·색소·모공·주름을 분석해 아래 지표와 소견에 자동 반영합니다. 사진은 상담 기록에 함께 저장됩니다.
                        {!skinAiAvailable && ' (본사 AI 미설정 — 설정 > 연동 설정 > AI 피부분석에서 OpenAI/Gemini 키 입력 필요)'}
                      </p>
                    )}
                    {aiResult && !aiResult.available && (
                      <p className="text-xs text-amber-700">{aiResult.reason}</p>
                    )}
                    {aiResult?.available && aiResult.scores && (
                      <div className="grid grid-cols-5 gap-1.5">
                        {SKIN_LABELS.map(({ key, label }) => (
                          <div key={key} className="bg-white rounded-lg py-1.5 text-center border border-primary-100">
                            <p className="text-2xs text-gray-400">{label}</p>
                            <p className="text-sm font-bold text-primary-700">{aiResult.scores![key]}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {aiResult?.available && aiResult.comment && (
                      <p className="text-xs text-gray-600 mt-1.5">💬 {aiResult.comment}</p>
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
                  <span className="text-2xs text-gray-400">· 시술 사진 {baPhotos.length}장</span>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-2xs text-gray-500 mb-0.5">Before</label>
                    <select aria-label="비교 Before 사진" value={baBefore} onChange={e => { setBaBefore(Number(e.target.value)); setComparison(c => (c?.restored ? c : null)); }}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
                      {baPhotos.map((p, i) => <option key={p.id} value={i}>{photoCaption(p)}</option>)}
                    </select>
                  </div>
                  <ArrowLeftRight size={14} className="text-gray-400 mb-2 flex-shrink-0" />
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-2xs text-gray-500 mb-0.5">After</label>
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
                      <p className="font-medium text-gray-800">{comparison.days === null ? '저장된 비교 이미지입니다.' : comparison.days > 0 ? `D+${comparison.days} 비교 이미지가 준비됐습니다.` : '같은 날 찍은 사진의 비교 이미지가 준비됐습니다.'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">상담 저장 시 상담 기록에 함께 저장됩니다.</p>
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
                  <p className="text-xs text-gray-500 mt-2">{baBefore >= baAfter ? 'Before는 After보다 먼저 찍은 사진이어야 합니다.' : '고객에게 보여줄 Before/After를 골라 만들면 상담 기록에 첨부됩니다. (기본: 최초 ↔ 최신)'}</p>
                )}
              </div>
              )}

              {/* 피부 고민 체크리스트 */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">피부 고민 (고객 체크)</label>
                <div className="space-y-2.5">
                  {CONCERN_GROUPS.map(grp => (
                    <div key={grp.group}>
                      <p className="text-xs text-gray-400 mb-1">{grp.group}</p>
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
                            <span className="text-2xs text-gray-400">{s.problem}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 leading-snug">{s.description}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {s.steps.map((step, i) => (
                              <span key={step} className="text-2xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
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
                      <label className="block text-xs text-gray-500 mb-0.5" title={f.hint}>{f.label}</label>
                      <input type="number" min={0} max={100} inputMode="numeric"
                        value={consultForm.metrics[f.key as string] ?? ''}
                        onChange={e => setConsultForm(prev => ({ ...prev, metrics: { ...prev.metrics, [f.key as string]: e.target.value } }))}
                        placeholder="-"
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-300" />
                    </div>
                  ))}
                </div>
              </div>
              )}

              {/* 피부타입 판정 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">종합 피부 타입</label>
                  <select aria-label="종합 피부 타입" value={consultForm.skinTypeResult} onChange={e => setConsultForm(f => ({ ...f, skinTypeResult: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                    <option value="">선택</option>
                    {SKIN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">다음 관리 권고일</label>
                  <input aria-label="다음 관리 권고일" type="date" value={consultForm.nextConsultDate} onChange={e => setConsultForm(f => ({ ...f, nextConsultDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                </div>
              </div>

              {/* 맞춤 솔루션 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">1:1 맞춤 솔루션 (추천)</label>
                <textarea aria-label="1:1 맞춤 솔루션 (추천)" value={consultForm.recommendedSolution} onChange={e => setConsultForm(f => ({ ...f, recommendedSolution: e.target.value }))}
                  rows={4} placeholder="피부 문제를 체크하면 추천 홈케어를 자동 입력할 수 있습니다. 자유롭게 수정하세요."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none" />
              </div>

              {/* 추천 제품/프로그램 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">추천 제품·프로그램 (쉼표로 구분)</label>
                <input aria-label="추천 제품·프로그램 (쉼표로 구분)" value={consultForm.recommendedProducts} onChange={e => setConsultForm(f => ({ ...f, recommendedProducts: e.target.value }))}
                  placeholder="예: 수분 앰플, 진정 관리 10회권"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
              </div>

              {/* 관리사 소견 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">관리사 소견</label>
                <textarea aria-label="관리사 소견" value={consultForm.managerNote} onChange={e => setConsultForm(f => ({ ...f, managerNote: e.target.value }))}
                  rows={2} placeholder="고객 피부 상태 관찰 소견을 기록하세요"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none" />
                {/* 칩은 입력칸 아래 — 시술 기록·예약·빠른 메모와 같은 자리 (리뷰 L-2) */}
                <MemoPresetChips value={consultForm.managerNote} onChange={next => setConsultForm(fm => ({ ...fm, managerNote: next }))} />
              </div>

              <p className="text-xs text-gray-400">
                {beaconEnabled
                  ? '※ 비컨은 피부 상태를 분석·측정하는 미용 기기입니다. 본 상담은 의료 진단·처방·치료가 아닙니다.'
                  : '※ 본 상담은 의료 진단·처방·치료가 아닌 피부 분석·관리 소견입니다.'}
              </p>

              {kakaoMsg && (
                <div className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-3 py-2 leading-relaxed">
                  {kakaoMsg}
                </div>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={() => { setShowConsultModal(false); setSavedConsultId(null); }} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
                {/* 게이트웨이(중앙 서버) 없이는 보내지지 않고 '실패' 이력만 남으므로 서버 모드에서만 (3차 UX 점검 2026-11-19) */}
                {isAuthApiConfigured && (
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
                  )}
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
      {showMergeModal && selected && <CustomerMergeModal target={selected} onClose={() => setShowMergeModal(false)} onMerged={handleMerged} />}
      </div>
    </div>
  );
}
