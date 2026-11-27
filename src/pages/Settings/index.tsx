import { HIDE_ON_MOBILE, IS_MOBILE_APP } from '../../lib/platform';
import { sanitizeStorageSnapshot } from '../../lib/backupSanitize';
import { markBackupSaved } from '../../lib/fullBackup';
import { formatPhoneInput, todayISO, formatLocalDate } from '../../lib/format';
import { notify } from '../../lib/notify';
import { normalizeGreeting, MAX_GREETING } from '../../lib/receiptRule'; // 영수증 인사말 (256)
import { getPreference, setPreference } from '../../lib/shopPreferences';
import { describePrefLoss, describePrefRemovalLoss } from '../../lib/prefLandedRule'; // 저장이 정말 남았는지 (290·300)
import { prefSaveMode } from '../../lib/prefSaveMode'; // 290
import MemoPresetManager from '../../components/MemoPresetManager'; // 자주 쓰는 메모 문구 관리 (259)
import { memoPresets } from '../../lib/memoPresets'; // 영수증 인쇄 정보 (235)
// 고객 주의사항 키워드 — 매장이 쓰는 말을 더한다 (240, GAP C-11)
import { getCautionKeywords, saveCautionKeywords } from '../../lib/cautionKeywords';
import { CAUTION_KEYWORDS, sanitizeCautionKeywords } from '../../lib/customerAlertRule';
import { useOverlayClose, useFocusTrap } from '../../lib/overlayStack';
import { useState, useEffect, useCallback, useRef, useId, Children, isValidElement, cloneElement } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Link2, Bell, Store, Palette, Clock, Plus, X, Pencil, Trash2, CreditCard, CheckCircle, Crown, Zap, Star, Calendar, HardDrive, FolderOpen, AlertCircle, Download, Sparkles } from 'lucide-react';
import { EXPORT_DATASETS, exportDatasetsToXlsx } from '../../lib/dataExport';
import BackupRestoreCard from '../../components/settings/BackupRestoreCard';
import PhotoBackupCard from '../../components/settings/PhotoBackupCard';
import { sendMessages } from '../../lib/messagingGateway';
import { isGoogleCalendarConnected, startGoogleOAuth, clearTokens as clearGoogleTokens } from '../../lib/googleCalendar';
import Header from '../../components/layout/Header';
import PaymentMethodPicker from '../../components/PaymentMethodPicker';
import { SettingsStore, ServiceStore, ReservationStore, getShopId } from '../../lib/store';
import { askConfirm } from '../../lib/confirmDialog';
import { refreshFromServer } from '../../lib/liveRefresh';
import { useDataRefreshed } from '../../hooks/useDataRefreshed';
import type { ShopSettings, Service, Subscription } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { isAuthApiConfigured, updateAuthProfile } from '../../lib/authApi';
import { requestPayment, PLANS, type PlanInfo } from '../../lib/payment';
import { isBeaconConsultationEnabled, setBeaconConsultationEnabled, onFeatureFlagsChanged, PAYMENT_ENABLED } from '../../lib/featureFlags';
import { useFeatureAllowed } from '../../hooks/useFeature';
import UpdateNewsBoard from '../../components/ui/UpdateNewsBoard';
import SecurityGuideCard from '../../components/settings/SecurityGuideCard';
import ResourcesCard from '../../components/settings/ResourcesCard';
import AiServiceCard from '../../components/settings/AiServiceCard';
import AdOptOutCard from '../../components/settings/AdOptOutCard';
import ReservationPolicyCard from '../../components/settings/ReservationPolicyCard';
import AppLockCard from '../../components/settings/AppLockCard';
import RevisitCycleCard from '../../components/settings/RevisitCycleCard';
import RetentionPolicyCard from '../../components/settings/RetentionPolicyCard';
import clsx from 'clsx';

const GOOGLE_OAUTH_READY = Boolean((import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim());
const NAS_CONFIGURED = Boolean((import.meta.env.VITE_AUTH_API_URL as string | undefined)?.trim());

// ─── 기존 계정(다른 지점 ID) 로컬 데이터 이관 ─────────────────────────
// Supabase 베타 계정으로 쌓은 데이터는 crm_{옛지점ID}_* 키에 있어, 새 NAS 계정
// (새 지점 ID)으로 로그인하면 보이지 않는다. 옛 키를 현재 지점 키로 복사해두면
// 다음 실행 때 코어의 NAS 1회 이관 로직이 서버(NAS)로 밀어올린다.
interface LegacyShopData { shopId: string; customerCount: number; keyCount: number }

function findLegacyShopData(currentShopId: string): LegacyShopData[] {
  const found = new Map<string, { customerCount: number; keyCount: number }>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const m = key.match(/^crm_(.+?)_([a-z_]+)$/);
    if (!m || m[1] === currentShopId || m[1] === 'superadmin') continue;
    const entry = found.get(m[1]) || { customerCount: 0, keyCount: 0 };
    entry.keyCount++;
    if (m[2] === 'customers') {
      try {
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(list)) {
          entry.customerCount = list.filter((c: any) => c?.id && !String(c.id).startsWith('sample_')).length;
        }
      } catch { /* noop */ }
    }
    found.set(m[1], entry);
  }
  return [...found.entries()]
    .map(([shopId, v]) => ({ shopId, ...v }))
    .filter(s => s.customerCount > 0)
    .sort((a, b) => b.customerCount - a.customerCount);
}

/** 옛 지점 키 → 현재 지점 키 복사 (현재 쪽에 이미 데이터가 있는 키는 건너뜀). 복사한 키 수 반환 */
function importLegacyShopData(fromShopId: string, toShopId: string): number {
  const prefix = `crm_${fromShopId}_`;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) keys.push(key);
  }
  let copied = 0;
  for (const key of keys) {
    const target = `crm_${toShopId}_${key.slice(prefix.length)}`;
    let targetEmpty = true;
    try {
      const existing = localStorage.getItem(target);
      const parsed = existing ? JSON.parse(existing) : null;
      targetEmpty = parsed === null || (Array.isArray(parsed) && parsed.length === 0);
    } catch { targetEmpty = false; }
    if (!targetEmpty) continue; // 현재 계정 데이터를 절대 덮어쓰지 않음
    const value = localStorage.getItem(key);
    if (value !== null) {
      localStorage.setItem(target, value);
      copied++;
    }
  }
  return copied;
}

type SettingTab = 'shop' | 'integrations' | 'ai' | 'notifications' | 'services' | 'hours' | 'subscription' | 'backup' | 'notice';

const allTabs = [
  { key: 'shop' as SettingTab, label: '매장 정보', icon: <Store size={16} /> },
  { key: 'hours' as SettingTab, label: '영업시간', icon: <Clock size={16} /> },
  { key: 'integrations' as SettingTab, label: '연동 설정', icon: <Link2 size={16} /> },
  { key: 'ai' as SettingTab, label: 'AI 서비스', icon: <Sparkles size={16} /> }, // 이용 방식·키·모델·연결 테스트·마법사 (151)
  { key: 'notifications' as SettingTab, label: '알림 설정', icon: <Bell size={16} /> },
  { key: 'services' as SettingTab, label: '시술 관리', icon: <Palette size={16} /> },
  { key: 'subscription' as SettingTab, label: '구독/플랜', icon: <CreditCard size={16} /> },
  { key: 'backup' as SettingTab, label: '백업·보안', icon: <HardDrive size={16} /> }, // 앱 잠금·백신 예외 카드도 이 탭에 있다 (UX 점검 2026-11-19)
  { key: 'notice' as SettingTab, label: '공지사항', icon: <Bell size={16} /> },
];
// 모바일 앱(스토어 빌드)에서는 결제 유도 화면을 노출하지 않는다 — Apple 3.1.1 / Google Play 결제 정책 (src/lib/platform.ts)
const tabs = allTabs.filter(t => !(t.key === 'subscription' && HIDE_ON_MOBILE.subscription));

const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];

const shopTypeOptions = ['피부관리실', '에스테틱샵', '메디컬 에스테틱', '홈케어 에스테틱', '스파 에스테틱', '기타'];

const emptyServiceForm = { name: '', category: '', duration: 60, price: 0, description: '' };

export default function Settings() {
  const { user } = useAuth();
  // ?tab=services 같은 딥링크(예약·시술 안내, 첫 설정 체크리스트에서 진입) — 1회 캡처 후 URL 정리 (첫 실행 감사 2026-11-18)
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<SettingTab>(() => {
    const q = searchParams.get('tab');
    return q && tabs.some(t => t.key === q) ? (q as SettingTab) : 'shop'; // 모바일 앱에서 숨긴 탭(구독)은 받지 않는다
  });
  // 모바일 탭 칩 8개는 가로 스크롤 — 딥링크(?tab=services)로 들어오면 활성 탭이 화면 밖일 수 있어 가운데로 끌어온다 (7차 UX 점검 2026-11-20)
  const tabStripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!window.matchMedia('(max-width: 1023px)').matches) return;
    tabStripRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [tab]);
  useEffect(() => { if (searchParams.has('tab')) setSearchParams({}, { replace: true }); }, []);
  const [settings, setSettings] = useState<ShopSettings>(() => {
    const current = SettingsStore.get();
    if (current.name === '내 에스테틱 샵' && user?.shopName) {
      return { ...current, name: user.shopName };
    }
    return current;
  });
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  useDataRefreshed(() => setSettings(prev => ({ ...prev, holidays: SettingsStore.get().holidays || [] }))); // 다른 기기가 추가한 휴일을 저장 전에도 목록에 (리뷰 #L5) — 편집 중인 다른 칸은 건드리지 않는다
  // 설정 저장은 행 전체 PUT — 저장 직전 서버 기준으로 맞춘다. 맞추지 못했으면(미전송분·불통) 조용히 옛 캐시로 덮지 않고 알린다 (16차 #H1, 리뷰 #L5)
  const syncBeforeSave = async () => {
    const ok = await refreshFromServer({ force: true });
    if (isAuthApiConfigured && !ok) notify('서버와 맞추지 못해 이 기기 기준으로 저장합니다 — 다른 기기에서 바꾼 설정이 있으면 덮일 수 있습니다.');
  };
  const [beaconOn, setBeaconOn] = useState(() => isBeaconConsultationEnabled());
  const beaconAllowed = useFeatureAllowed('customers.beacon');
  // 원격 플래그가 마운트 이후 도착해도 토글 표시가 실제 값과 어긋나지 않게 구독
  useEffect(() => onFeatureFlagsChanged(() => setBeaconOn(isBeaconConsultationEnabled())), []);
  const [services, setServices] = useState<Service[]>(() => ServiceStore.getAll());

  // Subscription state
  const [currentSubscription, setCurrentSubscription] = useState<Subscription | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [planChangeLoading, setPlanChangeLoading] = useState(false);
  const [planChangeError, setPlanChangeError] = useState<string | null>(null);

  // SMS test send state
  const [smsTestStatus, setSmsTestStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [smsTestMessage, setSmsTestMessage] = useState<string | null>(null);

  const handleSmsTest = async () => {
    setSmsTestStatus('sending');
    setSmsTestMessage(null);
    // 테스트 수신처 = 설정된 샵 전화번호 (없으면 발송 불가 안내)
    const shopPhone = SettingsStore.get().phone;
    const result = await sendMessages({
      type: 'sms',
      content: '[더마솔루션] 테스트 발송 메시지입니다.',
      recipients: 1,
      phones: shopPhone ? [shopPhone] : [],
    });
    if (result.pending) {
      setSmsTestMessage('본사 서버에 발송사가 아직 연동되지 않아 실제 발송되지 않습니다. 연동되면 자동으로 발송됩니다.');
    } else if (result.reason) {
      setSmsTestMessage(`발송 실패: ${result.reason}`);
    } else {
      setSmsTestMessage(`발송 완료 (성공 ${result.sent}건)`);
    }
    setSmsTestStatus('done');
    setTimeout(() => { setSmsTestStatus('idle'); setSmsTestMessage(null); }, 5000);
  };

  // 데이터 내보내기 state — 기본 선택은 사장님 지정 핵심 5종
  const [exportSelection, setExportSelection] = useState<Set<string>>(
    () => new Set(['customers', 'consultations', 'payments', 'products', 'product_sales']),
  );
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'pdf'>('xlsx');
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const toggleExport = (key: string) => {
    setExportSelection(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleExport = async () => {
    setExporting(true);
    setExportMessage(null);
    try {
      const keys = EXPORT_DATASETS.filter(d => exportSelection.has(d.key)).map(d => d.key);
      const exportRole = isAdmin ? 'owner' : 'staff'; // 직원 계정은 전화번호 가림·메모·생년월일 제외 — 고객 목록 화면과 같은 규칙 (산출물 감사 2026-11-20)
      // 지출 원장은 매출 페이지에 들른 적이 있어야 캐시에 있다. 다른 기기에서 로그인 직후
      // 바로 내보내면 0건으로 조용히 빠지므로 서버에서 먼저 채운다 (실패 시 로컬 캐시 사용).
      let expenseNote = '';
      if (keys.includes('expenses')) {
        const ok = await (await import('../../lib/expenseStore')).loadExpenses().catch(() => false);
        if (!ok) expenseNote = ' (지출: 서버 미응답 — 이 기기 캐시 기준)'; // loadExpenses는 실패해도 reject하지 않고 false를 돌려준다
      }
      const result = exportFormat === 'pdf'
        ? await (await import('../../lib/pdfExport')).exportDatasetsToPdf(keys, exportRole)
        : await exportDatasetsToXlsx(keys, exportRole);
      const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
      const detail = `${result.fileName} — ${Object.keys(result.counts).length}개 항목, 총 ${total.toLocaleString()}행${expenseNote}`;
      setExportMessage(
        result.delivery === 'cancelled' ? '공유를 취소했습니다 — 파일은 저장되지 않았습니다. 다시 내보내 보낼 앱을 고르세요.'
          : result.delivery === 'shared' ? `공유 시트로 전달: ${detail}`
            : `다운로드 완료: ${detail}`,
      );
    } catch (e: any) {
      setExportMessage(e?.message || '내보내기에 실패했습니다.');
    } finally {
      setExporting(false);
    }
  };

  // Backup state
  const [backupStatus, setBackupStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const electronAPI = (window as Window & { electronAPI?: { backup?: { exportNow: (d: Record<string, string>) => Promise<{ success: boolean; filePath?: string; error?: string }>; openFolder: () => Promise<void> } } }).electronAPI;
  const isElectron = !!electronAPI?.backup;

  const handleBackupNow = async () => {
    if (!electronAPI?.backup) return;
    setBackupStatus('saving');
    const snapshot: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) snapshot[k] = localStorage.getItem(k) ?? '';
    }
    const result = await electronAPI.backup.exportNow(sanitizeStorageSnapshot(snapshot)); // AI 키·문자 API 키는 백업 파일에 넣지 않는다 (UX 점검 2026-11-19)
    setBackupStatus(result.success ? 'done' : 'error');
    if (result.success) markBackupSaved(); // 체크리스트 "전체 백업 1회" — Electron 경로도 기록 (193)
    if (result.success) notify.success(result.filePath ? `백업을 저장했습니다: ${result.filePath}` : '백업을 저장했습니다. [백업 폴더 열기]에서 확인하세요.'); // 어디에 저장됐는지 버튼 글자만으로는 모른다
    if (!result.success) notify(`백업 실패: ${result.error || '알 수 없는 오류'} — 백업 폴더 권한·경로를 확인해주세요.`); // 버튼 글자 3초만으로는 이유를 알 수 없다 (4차 UX 점검 2026-11-19)
    setTimeout(() => setBackupStatus('idle'), 3000);
  };

  // Load subscription data
  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    setSubscriptionLoading(true);
    try {
      let fetchedFromRemote = false;

      // NAS 모드: 플랜은 본사 계정(auth_users.plan)이 정본 — 세션 프로필을 그대로 보여준다
      if (isAuthApiConfigured && user) {
        fetchedFromRemote = true;
        setCurrentSubscription({
          id: 'nas',
          branchId: user.branchId || user.id,
          plan: user.plan,
          status: 'active',
          startedAt: user.createdAt,
          expiresAt: user.trialEndsAt,
          notes: '본사 계정 플랜',
        });
      }

      // 로컬 스토리지 폴백 — fetchedFromRemote 플래그로 stale closure 방지
      if (!fetchedFromRemote) {
        const stored = localStorage.getItem('troiareuke_subscription');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setCurrentSubscription({
              id: parsed.id || 'local',
              branchId: parsed.branch_id || user?.branchId || '',
              plan: parsed.plan || user?.plan || 'trial',
              status: parsed.status || 'active',
              startedAt: parsed.started_at || new Date().toISOString(),
              expiresAt: parsed.expires_at || new Date(Date.now() + 14 * 86400000).toISOString(),
              paymentMethod: parsed.payment_method,
              amount: parsed.amount,
              currency: parsed.currency,
              impUid: parsed.imp_uid,
              merchantUid: parsed.merchant_uid,
              notes: parsed.notes,
            });
          } catch { /* ignore */ }
        }
      }
    } catch {
      // 에러 시 user 정보에서 기본값
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handlePlanChange = async (plan: PlanInfo) => {
    if (plan.id === currentSubscription?.plan) return;
    if (plan.id === 'enterprise') return; // Enterprise는 문의 필요
    setPlanChangeError(null);

    if (isAuthApiConfigured) {
      // NAS 모드: 플랜은 본사가 계정 단위로 관리(어드민 콘솔 > 구독/지점) — 지점에서 바꾸면 서버와 어긋난 가짜 성공이 된다
      setPlanChangeError('플랜 변경은 본사 관리자가 처리합니다. 본사에 문의해주세요.');
      return;
    }

    if (plan.id === 'trial') {
      // 유료 → 무료로의 다운그레이드
      setPlanChangeLoading(true);
      try {
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + 14);

        const subData = {
          branch_id: user?.branchId || user?.id || '',
          plan: plan.id,
          status: 'active' as const,
          started_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          amount: 0,
          currency: 'KRW',
          notes: '무료 체험 전환',
        };

        localStorage.setItem('troiareuke_subscription', JSON.stringify({ ...subData, id: `sub_${Date.now()}` }));
        await loadSubscription();
        notify.success('플랜을 변경했습니다.');
      } catch {
        setPlanChangeError('플랜 변경에 실패했습니다.');
      } finally {
        setPlanChangeLoading(false);
      }
      return;
    }

    // 유료 플랜 결제 — 실 PG 계약 전까지 게이트 (테스트 PG로 결제 시 실청구 없이
    // '유료 활성' 기록만 생기는 가짜 결제 상태를 방지)
    if (!PAYMENT_ENABLED) {
      setPlanChangeError('구독 결제는 정식 오픈 준비 중입니다. 오픈 후 이용하실 수 있습니다.');
      return;
    }
    setPlanChangeLoading(true);
    try {
      const result = await requestPayment({
        planName: plan.name,
        amount: plan.price,
        buyerEmail: user?.email || '',
        buyerName: user?.name || '',
      });

      if (result.success) {
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        const subData = {
          branch_id: user?.branchId || user?.id || '',
          plan: plan.id,
          status: 'active' as const,
          started_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          payment_method: 'card',
          amount: plan.price,
          currency: 'KRW',
          imp_uid: result.impUid,
          merchant_uid: result.merchantUid,
          notes: `${plan.name} 플랜 결제`,
        };

        localStorage.setItem('troiareuke_subscription', JSON.stringify({ ...subData, id: `sub_${Date.now()}` }));
        await loadSubscription();
        notify.success('플랜을 변경했습니다.');
      } else {
        setPlanChangeError(result.error || '결제에 실패했습니다.');
      }
    } catch {
      setPlanChangeError('결제 처리 중 오류가 발생했습니다.');
    } finally {
      setPlanChangeLoading(false);
    }
  };

  // Google Calendar
  const [googleConnected, setGoogleConnected] = useState(() => isGoogleCalendarConnected());
  const refreshGoogleStatus = useCallback(() => {
    setGoogleConnected(isGoogleCalendarConnected());
  }, []);

  // 페이지 포커스 시 Google Calendar 연결 상태 갱신 (토큰 만료 감지)
  useEffect(() => {
    window.addEventListener('focus', refreshGoogleStatus);
    return () => window.removeEventListener('focus', refreshGoogleStatus);
  }, [refreshGoogleStatus]);

  // Service modal
  const [showServiceModal, setShowServiceModal] = useState(false);
  useOverlayClose(showServiceModal, () => setShowServiceModal(false), { escape: false }); // Android 뒤로가기 — 메뉴 폼은 Esc 제외
  const serviceModalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(showServiceModal, serviceModalRef); // 첫 입력란 포커스·Tab 순환·닫힐 때 복원
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);

  // ─── Shop Info ────────────────────────────────────────────
  // 서버 프로필 갱신(await)이 끝나기 전 연타로 두 번 저장되는 것 방지 (2026-11-18)
  const [shopSaving, setShopSaving] = useState(false);
  // 영수증 인쇄 정보 — 설정 행(NAS 동기). 사업자등록번호는 코어 AuthUser 에 있어 화면에서 쓸 수 없다 (235, GAP P-9)
  const [receiptInfo, setReceiptInfo] = useState<{ businessNumber?: string; ownerName?: string; greeting?: string }>(() => getPreference('receiptInfo') ?? {});
  const [memoPresetList, setMemoPresetList] = useState<string[]>(() => memoPresets()); // 자주 쓰는 메모 문구 (259, 리뷰 L-4)
  useDataRefreshed(() => setMemoPresetList(memoPresets())); // 시술 기록 창·다른 PC 변경을 따라간다 (262, 리뷰 L-6)
  // 주의 키워드 — 추가·삭제는 누른 즉시 설정 행에 저장(결제수단과 같은 방식) (240)
  const [cautionWords, setCautionWords] = useState<string[]>(() => getCautionKeywords());
  const [cautionDraft, setCautionDraft] = useState('');
  const addCautionWord = () => {
    // 저장되는 형태로 먼저 정리한다 — 전에는 원문과 저장값(공백 축약)이 달라 "저장하지 못했습니다" 가 거짓으로 떴고
    // 목록·입력칸이 저장값과 어긋났다 (242, 리뷰 M-2)
    const word = sanitizeCautionKeywords([cautionDraft])[0] ?? '';
    if (word.length < 2) { notify('키워드는 두 글자 이상으로 입력해주세요(한 글자는 아무 문장에나 걸립니다).'); return; }
    if (CAUTION_KEYWORDS.includes(cautionDraft.trim())) { notify(`"${cautionDraft.trim()}" 는 기본 키워드라 이미 경고로 올라갑니다.`); return; }
    if (cautionWords.includes(word)) { notify(`이미 있는 키워드입니다: ${word}`); return; }
    const next = saveCautionKeywords([...cautionWords, word]);
    if (!next.list.includes(word)) { notify('키워드를 저장하지 못했습니다. 글자 수·개수(20개)를 확인해주세요.'); return; } // 20개 상한에서 잘린 경우
    setCautionWords(next.list);
    setCautionDraft('');
    // 296: 목록에는 들어갔지만 이 PC 에 남지 않았으면 그 사실을 적는다(다시 열면 경고가 안 뜬다)
    const lostCaution = describePrefLoss(next.landed, '주의 키워드', prefSaveMode());
    if (lostCaution) notify.error(lostCaution); else notify('주의 키워드를 추가했습니다.');
  };
  const dropCautionWord = (word: string) => {
    const next = saveCautionKeywords(cautionWords.filter(w => w !== word));
    setCautionWords(next.list);
    const lost = describePrefRemovalLoss(next.landed, '주의 키워드', prefSaveMode()); // 296·300(리뷰 M-1)
    if (lost) notify.error(lost);
  };
  const saveReceiptInfo = async () => {
    const next = {
      businessNumber: receiptInfo.businessNumber?.trim() || undefined,
      ownerName: receiptInfo.ownerName?.trim() || undefined,
      greeting: normalizeGreeting(receiptInfo.greeting) ?? undefined, // 공백 축약·60자 (256)
    };
    await syncBeforeSave(); // 설정은 행 전체 PUT — 다른 PC 가 바꾼 영업시간·휴일을 옛 캐시로 덮지 않게 (16차 #H1, 리뷰 M-4)
    // 되읽어 확인 — 저장 공간이 꽉 찬 PC 에서 "저장했습니다" 가 거짓이 되지 않게 (254 리뷰 M-1).
    // 286 부터 판정은 `setPreference` 한 곳에서 한다(전에는 칸마다 손으로 비교했다 — 칸이 늘면 빠뜨린다).
    const lost = describePrefLoss(setPreference('receiptInfo', next), '영수증 인쇄 정보', prefSaveMode());
    setReceiptInfo(next);
    if (lost) notify.error(lost);
    else notify.success('영수증 인쇄 정보를 저장했습니다.');
  };
  const handleShopSave = async () => {
    if (shopSaving) return;
    setShopSaving(true);
    try { await doShopSave(); } finally { setShopSaving(false); }
  };
  const doShopSave = async () => {
    const shopName = settings.name.trim().replace(/\s*CRM\s*$/i, '').trim();
    await syncBeforeSave(); // 설정 저장은 행 전체 PUT — 다른 기기가 바꾼 영업시간·휴일을 옛 캐시로 덮지 않게 먼저 서버 기준으로 (16차 #H1)
    if (!shopName) {
      notify('매장 이름을 입력해주세요.');
      return;
    }

    const updatedSettings = { ...settings, name: shopName };
    setSettings(updatedSettings);
    SettingsStore.save({
      name: shopName,
      type: settings.type as ShopSettings['type'],
      phone: settings.phone,
      address: settings.address,
    });

    // 다음 로그인에서도 같은 샵명이 보이도록 지점·로컬 세션을 함께 갱신한다.
    let remoteFailed = false;
    if (isAuthApiConfigured) {
      // NAS 모드: 다른 PC가 로그인 시 받는 branchName은 서버 프로필이 정본 — 함께 갱신한다
      try {
        await updateAuthProfile({
          shopName,
          shopType: settings.type,
          shopPhone: settings.phone || undefined,
          shopAddress: settings.address || undefined,
        });
      } catch (e: any) {
        remoteFailed = true;
        console.warn('[Settings] 지점 정보 서버 반영 실패:', e?.message);
      }
    }

    try {
      const key = 'troiareuke_auth_user';
      const storedUser = JSON.parse(localStorage.getItem(key) || 'null');
      if (storedUser) {
        localStorage.setItem(key, JSON.stringify({
          ...storedUser,
          shopName,
          shopType: settings.type,
          branchName: shopName,
        }));
      }
    } catch { /* 세션 갱신 실패는 샵 설정 저장을 막지 않음 */ }

    notify.success(`${shopName} CRM으로 설정했습니다.`);
    if (remoteFailed) notify('서버 반영 실패 — 이 PC에는 저장됐지만 네트워크 확인 후 다시 저장해주세요.'); // 실패는 성공 토스트에 섞지 않는다 (UX 점검 2026-11-19)
  };

  // ─── Business Hours ───────────────────────────────────────
  const [hoursDirty, setHoursDirty] = useState(false); // 영업시간은 버튼 저장, 지정 휴일은 즉시 저장 — 미저장 이탈을 막는다 (4차 UX 점검 2026-11-19)
  const updateHours = (day: string, field: string, value: string | boolean) => {
    setHoursDirty(true);
    setSettings(prev => ({
      ...prev,
      businessHours: {
        ...prev.businessHours,
        [day]: { ...prev.businessHours[day], [field]: value },
      },
    }));
  };

  const handleHoursSave = async () => {
    // 종료<시작(오후 8시를 08:00으로 오타)·빈 값이 그대로 저장되면 이후 모든 예약에 "영업시간 밖" 경고가 뜬다 (4차 UX 점검 2026-11-19)
    for (const day of dayLabels) {
      const h = settings.businessHours[day];
      if (!h || h.isOff) continue;
      if (!h.open || !h.close) { notify(`${day}요일 영업시간을 모두 입력해주세요. 쉬는 날이면 체크를 풀어주세요.`); return; }
      if (h.open >= h.close) { notify(`${day}요일 종료 시간(${h.close})이 시작 시간(${h.open})보다 늦어야 합니다. 오후는 13:00~23:59로 적어주세요.`); return; }
    }
    await syncBeforeSave(); // 다른 기기의 휴일·연동 설정과 병합 (16차 #H1)
    const holidays = SettingsStore.get().holidays || []; // 휴일은 [추가]/[삭제] 때 즉시 저장되므로 서버 기준을 그대로 — 이 화면의 옛 목록으로 덮지 않는다
    SettingsStore.save({ businessHours: settings.businessHours, holidays });
    setSettings(prev => ({ ...prev, holidays }));
    setHoursDirty(false);
    notify.success('영업시간을 저장했습니다.');
  };

  // 지정 휴일(명절·임시 휴무) — 예약 저장 전 경고에 쓰인다. 날짜 추가/삭제 후 [저장하기] (2026-11-18)
  const [holidayInput, setHolidayInput] = useState('');
  const saveHolidays = (holidays: string[]) => {
    setSettings(prev => ({ ...prev, holidays }));
    SettingsStore.save({ holidays }); // 즉시 저장 — 영업시간 [저장하기]와 무관하게 유지(다른 탭 저장 버튼이 휴일을 안 담는 혼선 방지)
  };
  const addHoliday = async () => {
    const d = holidayInput;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { notify('날짜를 선택해주세요.'); return; }
    await syncBeforeSave(); // 다른 기기가 추가한 휴일 위에 더한다 (16차 #H1)
    saveHolidays([...new Set([...(SettingsStore.get().holidays || []), d])].sort());
    setHolidayInput('');
    notify(`${d} 휴일을 추가했습니다.`);
  };
  const removeHoliday = async (d: string) => { await syncBeforeSave(); saveHolidays((SettingsStore.get().holidays || []).filter(x => x !== d)); notify(`${d} 휴일을 삭제했습니다.`); }; // 추가와 같은 피드백 (6차 UX 감사 2026-11-20)

  // ─── Integrations ─────────────────────────────────────────
  const handleNaverSave = async () => {
    await syncBeforeSave(); // (16차 #H1)
    SettingsStore.save({ naverBooking: settings.naverBooking });
    notify.success('네이버 예약 연동 설정을 저장했습니다.');
  };

  const handleKakaoSave = async () => {
    await syncBeforeSave(); // (16차 #H1)
    SettingsStore.save({ kakao: settings.kakao });
    notify.success('카카오 연동 설정을 저장했습니다.');
  };

  const handleSmsSave = async () => {
    await syncBeforeSave(); // (16차 #H1)
    SettingsStore.save({ smsCallerId: settings.smsCallerId }); // 발송사 API 키는 본사 서버에만 — 지점 입력란 제거 (보안 감사 2026-11-19)
    notify.success('문자 발신번호를 저장했습니다.');
  };

  // ─── 기존 계정 데이터 이관 (베타 → NAS 컷오버) ───────────────
  const [legacyCandidates] = useState<LegacyShopData[]>(() => {
    try { return findLegacyShopData(getShopId()); } catch { return []; }
  });
  const handleLegacyImport = (candidate: LegacyShopData) => {
    const current = getShopId();
    if (!window.confirm(
      `이 컴퓨터에 저장된 기존 계정 데이터(고객 ${candidate.customerCount}명 포함)를\n` +
      `현재 계정으로 가져올까요?\n\n` +
      `가져온 데이터는 중앙 서버에 자동 저장됩니다.\n` +
      `현재 계정에 이미 있는 항목은 덮어쓰지 않습니다.`
    )) return;
    const copied = importLegacyShopData(candidate.shopId, current);
    notify(`${copied}개 항목을 가져왔습니다.\n프로그램을 다시 시작하면 중앙 서버 저장이 시작됩니다.`);
    window.location.reload();
  };

  // ─── AI 분석 키 (피부분석·AI챗봇 공유) ──────────────────────
  // AiChat이 Coming Soon 게이트로 막혀 있어도 피부분석이 쓸 키를 여기서 입력 가능하게 한다.
  // AI 키·모델은 설정 > AI 서비스 탭(AiServiceCard)으로 옮김 (151)

  // ─── Notifications ────────────────────────────────────────
  // ─── Services ─────────────────────────────────────────────
  const openAddService = () => {
    setEditingService(null);
    setServiceForm(emptyServiceForm);
    setShowServiceModal(true);
  };

  const openEditService = (svc: Service) => {
    setEditingService(svc);
    setServiceForm({
      name: svc.name,
      category: svc.category,
      duration: svc.duration,
      price: svc.price,
      description: svc.description || '',
    });
    setShowServiceModal(true);
  };

  const handleServiceSubmit = () => {
    if (!serviceForm.name.trim() || !serviceForm.category.trim()) { notify('시술명과 카테고리를 입력해주세요.'); return; }
    // 소요시간 0·음수는 예약 종료 시각을 역전시켜 이중예약 검사를 무력화하고, 가격 비움(0)은 결제 연계를 조용히 건너뛴다 (14차 #H7)
    if (!Number.isInteger(serviceForm.duration) || serviceForm.duration < 5 || serviceForm.duration > 600) { notify(editingService ? '소요시간은 5분 이상 600분 이하로 입력해주세요. 기존 값이 범위를 벗어나 있어 먼저 고쳐야 저장됩니다.' : '소요시간은 5분 이상 600분 이하로 입력해주세요.'); return; }
    if (!Number.isFinite(serviceForm.price) || serviceForm.price < 0) { notify('가격은 0 이상 숫자로 입력해주세요.'); return; }
    if (editingService) {
      ServiceStore.update(editingService.id, {
        name: serviceForm.name.trim(),
        category: serviceForm.category.trim(),
        duration: serviceForm.duration,
        price: serviceForm.price,
        description: serviceForm.description || undefined,
      });
    } else {
      ServiceStore.save({
        name: serviceForm.name.trim(),
        category: serviceForm.category.trim(),
        duration: serviceForm.duration,
        price: serviceForm.price,
        description: serviceForm.description || undefined,
        isActive: true,
      });
    }
    setServices(ServiceStore.getAll());
    setShowServiceModal(false);
    notify.success(editingService ? '시술 메뉴를 수정했습니다.' : '시술 메뉴를 추가했습니다.');
  };

  const handleDeleteService = async (id: string) => {
    const svc = services.find(sv => sv.id === id);
    // 삭제된 메뉴가 걸린 예약은 폼의 시술 목록에 못 들어가 시간·메모 수정도 막힌다(다른 메뉴로 바꾸면 금액이 현재가로 덮임) — 판매만 멈추려면 비활성 (11차 #M5)
    const linked = ReservationStore.getAll().filter(r => (r.services ?? []).some(sv => sv.serviceId === id)).length;
    const detail = linked > 0
      ? `\n이 시술이 걸린 예약 ${linked}건은 시술명은 남지만 시술을 바꾸지 않으면 수정할 수 없게 됩니다.\n판매만 멈추려면 삭제 대신 [비활성]을 권장합니다.`
      : '\n예약·시술 기록에 남은 시술명은 그대로 유지됩니다.';
    if (!(await askConfirm({ title: '시술 메뉴 삭제', message: `${svc ? `'${svc.name}' 시술` : '이 시술'}을 삭제할까요?${detail}`, confirmLabel: '삭제', danger: true }))) return;
    ServiceStore.delete(id);
    setServices(ServiceStore.getAll());
    notify.success('시술 메뉴를 삭제했습니다.');
  };

  // Group services by category
  const servicesByCategory = services.reduce<Record<string, Service[]>>((acc, svc) => {
    if (!acc[svc.category]) acc[svc.category] = [];
    acc[svc.category].push(svc);
    return acc;
  }, {});

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="설정" subtitle="매장 운영 환경을 설정해주세요" />

      <div className="p-4 lg:p-8 flex-1">
        {/* 모바일(lg 미만): 탭을 가로 스크롤 칩으로 쌓고 본문은 전체 폭 — 2단 고정 폭은 412px에서 입력란이 화면 밖으로 밀렸다 (2026-11-17) */}
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          {/* Sidebar tabs */}
          <div className="w-full lg:w-48 flex-shrink-0">
            <div ref={tabStripRef} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2 flex lg:block gap-1 overflow-x-auto no-scrollbar pr-6 lg:space-y-0.5">
              {tabs.map(t => (
                <button
                  key={t.key}
                  aria-current={tab === t.key ? 'true' : undefined}
                  onClick={() => {
                    if (tab === 'hours' && t.key !== 'hours' && hoursDirty) {
                      if (!window.confirm('영업시간 변경을 저장하지 않았습니다. 버리고 이동할까요?')) return;
                      setSettings(prev => ({ ...prev, businessHours: SettingsStore.get().businessHours })); // 메모리의 수정본을 저장본으로 되돌린다 (리뷰 67)
                      setHoursDirty(false);
                    }
                    setTab(t.key);
                  }}
                  className={clsx(
                    'flex-shrink-0 lg:w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left whitespace-nowrap',
                    tab === t.key
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <span className={tab === t.key ? 'text-primary-600' : 'text-gray-400'}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {tab === 'shop' && (
              <SettingCard title="매장 기본 정보">
                <div className="space-y-4">
                  <FormRow label="매장 이름">
                    <div className="space-y-2">
                      <input
                        type="text"
                        aria-label="매장 이름"
                        value={settings.name}
                        onChange={e => setSettings(prev => ({ ...prev, name: e.target.value }))}
                        className="form-input"
                        placeholder="예: 아르케스파"
                        maxLength={40}
                      />
                      <p className="text-xs text-gray-400">
                        프로그램명 미리보기: <strong className="text-[#1a3a8f]">{settings.name.trim().replace(/\s*CRM\s*$/i, '') || '매장 이름'} CRM</strong>
                      </p>
                    </div>
                  </FormRow>
                  <FormRow label="매장 유형">
                    <select
                      value={settings.type}
                      onChange={e => setSettings(prev => ({ ...prev, type: e.target.value as ShopSettings['type'] }))}
                      className="form-input"
                    >
                      {shopTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </FormRow>
                  <FormRow label="대표 전화">
                    <input
                      type="tel"
                      value={settings.phone}
                      onChange={e => setSettings(prev => ({ ...prev, phone: formatPhoneInput(e.target.value) }))}
                      className="form-input"
                    />
                  </FormRow>
                  <FormRow label="주소">
                    <input
                      type="text"
                      value={settings.address}
                      onChange={e => setSettings(prev => ({ ...prev, address: e.target.value }))}
                      className="form-input"
                    />
                  </FormRow>
                  <div className="pt-4">
                    <button
                      type="button"
                      onClick={handleShopSave}
                      disabled={shopSaving}
                      className="px-6 py-2.5 bg-[#1a3a8f] text-white text-sm font-medium rounded-xl hover:bg-[#15306e] transition-colors disabled:opacity-60"
                    >
                      {shopSaving ? '저장 중...' : '저장하기'}
                    </button>
                  </div>
                  {/* 고객 주의사항 키워드 — 메모에서 이 말이 든 줄이 예약·시술 창 경고로 올라간다 (240, GAP C-11) */}
                  <div className="pt-6 border-t border-gray-100" data-testid="settings-caution-keywords">
                    <h4 className="text-sm font-bold text-gray-900 mb-1">고객 주의사항 키워드</h4>
                    <p className="text-xs text-gray-400 mb-3">
                      고객 메모에 이 말이 들어간 줄은 예약 추가·수정 창, 예약 상세, 시술 기록 창에서 경고로 보입니다.
                      기본 키워드(임신·금기·시술 불가·알레르기·켈로이드·복용 중·민감 등 {CAUTION_KEYWORDS.length}개)는 이미 들어 있고, 매장에서 쓰는 말만 더하면 됩니다(두 글자 이상, 20개까지).
                      "주의사항 없음" 처럼 없다고 적은 줄은 경고로 띄우지 않습니다.
                    </p>
                    <div className="flex gap-2">
                      <input value={cautionDraft} onChange={e => setCautionDraft(e.target.value)} aria-label="새 주의 키워드"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCautionWord(); } }}
                        placeholder="예: 레이저 금지, 필러 이력" className="form-input flex-1" maxLength={40} />
                      <button type="button" onClick={addCautionWord} className="px-4 py-2 bg-[#1a3a8f] text-white text-sm font-medium rounded-xl whitespace-nowrap">추가</button>
                    </div>
                    {cautionWords.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-1.5">
                        {cautionWords.map(w => (
                          <li key={w} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-amber-50 text-amber-800 border border-amber-200">
                            {w}
                            <button type="button" onClick={() => dropCautionWord(w)} aria-label={`${w} 키워드 지우기`} className="text-amber-700 hover:text-red-700">✕</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {/* 영수증 인쇄 정보 — 고객에게 주는 영수증에 찍힌다. 사업자등록번호는 가입 계정(코어)에 있어 여기서 따로 받는다 (235, GAP P-9) */}
                  <div className="pt-6 border-t border-gray-100" data-testid="settings-receipt-info">
                    <h4 className="text-sm font-bold text-gray-900 mb-1">영수증 인쇄 정보</h4>
                    <p className="text-xs text-gray-400 mb-3">매출 &gt; 결제 내역의 [영수증]으로 저장하는 PDF 에 찍힙니다. 사업자등록번호·대표자명은 머리말에, 인사말은 합계 아래 한 줄로 들어갑니다. 비워 두면 그 줄을 빼고 인쇄하고, 영수증에 안내가 함께 나옵니다. 세금계산서·현금영수증은 이 영수증으로 대체되지 않습니다.</p>
                    <div className="space-y-4">
                      <FormRow label="사업자등록번호">
                        <input type="text" aria-label="사업자등록번호" value={receiptInfo.businessNumber ?? ''}
                          onChange={e => setReceiptInfo(v => ({ ...v, businessNumber: e.target.value }))}
                          className="form-input" placeholder="000-00-00000" maxLength={20} />
                      </FormRow>
                      <FormRow label="대표자명">
                        <input type="text" aria-label="대표자명" value={receiptInfo.ownerName ?? ''}
                          onChange={e => setReceiptInfo(v => ({ ...v, ownerName: e.target.value }))}
                          className="form-input" placeholder="예: 홍길동" maxLength={30} />
                      </FormRow>
                      <FormRow label="인사말 (선택)">
                        <div>
                          <input type="text" aria-label="영수증 인사말" value={receiptInfo.greeting ?? ''}
                            onChange={e => setReceiptInfo(v => ({ ...v, greeting: e.target.value }))}
                            className="form-input" placeholder="예: 오늘도 찾아주셔서 감사합니다" maxLength={MAX_GREETING} />
                          {/* 왜 환불 영수증에는 안 나오는지 미리 말해 둔다 — 고장으로 오해하던 것 (리뷰 M-2) */}
                          <p className="mt-1 text-xs text-gray-400">결제 영수증 합계 아래에 한 줄로 찍힙니다({MAX_GREETING}자). 환불 영수증·결제 예정 내역서에는 찍지 않습니다.</p>
                        </div>
                      </FormRow>
                      <button type="button" onClick={saveReceiptInfo}
                        className="px-6 py-2.5 bg-[#1a3a8f] text-white text-sm font-medium rounded-xl hover:bg-[#15306e] transition-colors">영수증 정보 저장</button>
                    </div>
                  </div>
                  {/* 자주 쓰는 메모 문구 — 251~255 는 관리 패널이 시술 기록 창에만 있어 나머지 세 곳이 막다른 길이었다 (259, 리뷰 L-4) */}
                  <div className="pt-6 border-t border-gray-100" data-testid="settings-memo-presets">
                    <h4 className="text-sm font-bold text-gray-900 mb-1">자주 쓰는 메모 문구</h4>
                    <p className="text-xs text-gray-400 mb-3">시술 기록 메모·상담 소견·예약 메모·고객 한 줄 메모에서 눌러 넣는 문장입니다. 시술 기록 창에서도 바로 관리할 수 있습니다.</p>
                    <MemoPresetManager presets={memoPresetList} onChange={setMemoPresetList} beforeSave={syncBeforeSave} />
                  </div>
                  {/* 결제수단 — 결제 창을 열지 않고도 미리 준비(PILOT-CHECKLIST 24). 추가·삭제는 누른 즉시 지점 설정에 저장돼 같은 지점 모든 PC 에 보인다 (210) */}
                  <div className="pt-6 border-t border-gray-100" data-testid="settings-payment-methods">
                    <h4 className="text-sm font-bold text-gray-900 mb-1">결제수단</h4>
                    <p className="text-xs text-gray-400 mb-3">결제·판매 창에서 고를 수 있는 수단입니다. 기본 4종은 지울 수 없고, 추가한 수단은 ✕ 로 지웁니다(기존 결제 기록은 그대로). 추가·삭제는 바로 저장되고 같은 지점 모든 PC 에 보입니다.</p>
                    <PaymentMethodPicker value="" onChange={() => undefined} selectable={false} />
                  </div>
                </div>
              </SettingCard>
            )}

            {tab === 'hours' && (
              <SettingCard title="영업시간 설정">
                <div className="space-y-3">
                  {dayLabels.map(day => {
                    const hours = settings.businessHours[day];
                    if (!hours) return null;
                    return (
                      <div key={day} className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        <span className="text-sm font-medium text-gray-700 w-6">{day}</span>
                        <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={!hours.isOff}
                            onChange={e => updateHours(day, 'isOff', !e.target.checked)}
                            className="rounded"
                          />
                          <span className="text-xs text-gray-500">영업</span>
                        </label>
                        {/* 모바일(412px)에서는 시간 범위를 다음 줄로 내려 잘리지 않게 (2026-11-17) */}
                        <div className="flex items-center gap-2 w-full sm:w-auto pl-10 sm:pl-0">
                          <input
                            type="time"
                            aria-label={`${day}요일 시작 시간`}
                            value={hours.open}
                            onChange={e => updateHours(day, 'open', e.target.value)}
                            disabled={hours.isOff}
                            className="form-input text-sm w-28 min-w-0 disabled:opacity-40"
                          />
                          <span className="text-gray-400 text-sm">~</span>
                          <input
                            type="time"
                            aria-label={`${day}요일 종료 시간`}
                            value={hours.close}
                            onChange={e => updateHours(day, 'close', e.target.value)}
                            disabled={hours.isOff}
                            className="form-input text-sm w-28 min-w-0 disabled:opacity-40"
                          />
                          {hours.isOff && <span className="text-xs text-red-600 font-medium whitespace-nowrap">휴무</span>}
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-4 border-t border-gray-100 space-y-2" data-testid="holidays-editor">
                    <p className="text-sm font-medium text-gray-700">지정 휴일</p>
                    <p className="text-xs text-gray-400">명절·임시 휴무 날짜. 이 날에 예약을 잡으면 저장 전에 확인창이 뜹니다. 추가·삭제 즉시 저장됩니다.</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="date" value={holidayInput} onChange={e => setHolidayInput(e.target.value)} aria-label="휴일 날짜" className="form-input text-sm !w-44 min-w-0" />
                      <button type="button" onClick={addHoliday} className="px-3 py-2 text-sm font-medium rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200">휴일 추가</button>
                    </div>
                    {(settings.holidays || []).length > 0 ? (
                      <ul className="flex flex-wrap gap-2">
                        {(settings.holidays || []).map(d => (
                          <li key={d} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${d < todayISO() ? 'bg-gray-100 text-gray-600 border border-dashed border-gray-300' : 'bg-rose-50 text-rose-700'}`} title={d < todayISO() ? '지난 휴일' : undefined}>
                            {d}
                            <button type="button" onClick={() => removeHoliday(d)} aria-label={`${d} 휴일 삭제`} className="p-1.5 -m-1 rounded text-rose-400 hover:text-rose-600"><X size={14} /></button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-gray-500">지정한 휴일이 없어요</p>
                    )}
                    {(settings.holidays || []).some(d => d < todayISO()) && (
                      <button type="button" onClick={() => saveHolidays((settings.holidays || []).filter(d => d >= todayISO()))} className="text-xs text-gray-500 underline hover:text-gray-700">
                        지난 휴일 {(settings.holidays || []).filter(d => d < todayISO()).length}개 정리
                      </button>
                    )}
                  </div>
                  <div className="pt-4">
                    <button
                      onClick={handleHoursSave}
                      className="px-6 py-2.5 bg-[#1a3a8f] text-white text-sm font-medium rounded-xl hover:bg-[#15306e] transition-colors"
                    >
                      저장하기
                    </button>
                  </div>
                </div>
              </SettingCard>
            )}
            {tab === 'hours' && (
              <SettingCard title="베드·룸 자원">
                <ResourcesCard />
              </SettingCard>
            )}
            {tab === 'hours' && <ReservationPolicyCard />}

            {tab === 'ai' && (
              <SettingCard title="AI 서비스">
                <AiServiceCard />
              </SettingCard>
            )}

            {tab === 'integrations' && (
              <div className="space-y-4">
                {/* 비컨 점수(AI 피부진단 수치) 기능 ON/OFF — 관리자 전용, 본사(어드민 콘솔)가 허용한 경우에만 노출 */}
                {isAdmin && beaconAllowed && (
                  <SettingCard title="비컨 점수 기록 (AI 피부진단기)">
                    <div className={clsx(
                      'flex items-center gap-3 p-4 rounded-xl border',
                      beaconOn ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-200'
                    )}>
                      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold', beaconOn ? 'bg-indigo-500' : 'bg-gray-300')}>
                        B
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900">비컨 측정 수치 · AI 피부분석</p>
                        <p className={clsx('text-xs mt-0.5', beaconOn ? 'text-indigo-600' : 'text-gray-400')}>
                          {beaconOn ? '사용 중 · 상담에 비컨 점수·AI 사진 분석이 표시됩니다' : '숨김 · 상담은 그대로, 비컨 점수·AI 피부분석 숨김'}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          // 304: 안 남았는데 "사용 중" 으로 두지 않는다 — 다시 열면 토글이 되돌아간다
                          const next = !beaconOn;
                          const lost = describePrefLoss(setBeaconConsultationEnabled(next), '비컨 측정 수치·AI 피부분석 표시 설정', prefSaveMode());
                          setBeaconOn(next);
                          if (lost) notify.error(lost);
                        }}
                        role="switch"
                        aria-checked={beaconOn}
                        aria-label="상담 화면에 비컨 점수·AI 피부 분석 표시"
                        className={clsx(
                          'relative w-12 h-7 rounded-full transition-colors duration-200 flex-shrink-0',
                          beaconOn ? 'bg-indigo-500' : 'bg-gray-300'
                        )}
                      >
                        <span className={clsx(
                          'absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all duration-200',
                          beaconOn ? 'left-6' : 'left-1'
                        )} />
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                      비컨 AI 피부진단기 연동(API)이 확정되기 전까지 상담 화면의 ‘비컨 측정 수치’ 입력·표시와 ‘AI 사진 피부분석’을 숨깁니다.
                      <strong className="text-gray-500"> 피부 상담과 홈케어 추천은 계속 사용됩니다.</strong> (이 기기에만 적용)
                    </p>
                  </SettingCard>
                )}
                {/* Naver */}
                <SettingCard title="네이버 예약 연동">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 rounded-xl border bg-gray-50 border-gray-200">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold bg-gray-500">
                        N
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900">네이버 예약</p>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                            <AlertCircle size={11} /> 준비 중
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">출시 시 안내해 드립니다</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
                      <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                      <span>네이버 예약 연동은 본사 제휴가 열리면 지원됩니다. 아래 플레이스 ID를 미리 입력해두면 연동 시 자동 적용됩니다.</span>
                    </div>
                    <FormRow label="네이버 플레이스 ID">
                      <input
                        type="text"
                        value={settings.naverBooking.placeId || ''}
                        onChange={e => setSettings(prev => ({
                          ...prev,
                          naverBooking: { ...prev.naverBooking, placeId: e.target.value },
                        }))}
                        className="form-input"
                        placeholder="연동 시 사용할 플레이스 ID 미리 입력"
                      />
                    </FormRow>
                    <div className="pt-2">
                      <button
                        onClick={handleNaverSave}
                        className="px-6 py-2 text-sm font-medium bg-[#1a3a8f] text-white rounded-xl hover:bg-[#15306e] transition-colors"
                      >
                        저장하기
                      </button>
                    </div>
                  </div>
                </SettingCard>

                {/* Kakao */}
                <SettingCard title="카카오 연동">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 rounded-xl border bg-gray-50 border-gray-200">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold bg-gray-500">
                        K
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900">카카오 채널</p>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                            <AlertCircle size={11} /> 준비 중
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">출시 시 안내해 드립니다</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 rounded-xl border bg-gray-50 border-gray-200">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold bg-gray-500">
                        K
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900">카카오 오픈채팅</p>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                            <AlertCircle size={11} /> 준비 중
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">출시 시 안내해 드립니다</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
                      <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                      <span>카카오 채널·오픈채팅 연동은 준비 중입니다. 아래 ID/URL을 미리 입력해두면 연동이 열릴 때 자동 적용됩니다.</span>
                    </div>

                    <FormRow label="카카오 채널 ID">
                      <input
                        type="text"
                        value={settings.kakao.channelId || ''}
                        onChange={e => setSettings(prev => ({
                          ...prev,
                          kakao: { ...prev.kakao, channelId: e.target.value },
                        }))}
                        className="form-input"
                        placeholder="연동 시 사용할 채널 ID 미리 입력"
                      />
                    </FormRow>
                    <FormRow label="오픈채팅 URL">
                      <input
                        type="text"
                        value={settings.kakao.openchatUrl || ''}
                        onChange={e => setSettings(prev => ({
                          ...prev,
                          kakao: { ...prev.kakao, openchatUrl: e.target.value },
                        }))}
                        className="form-input"
                        placeholder="연동 시 사용할 오픈채팅 URL 미리 입력"
                      />
                    </FormRow>
                    <div className="pt-2">
                      <button
                        onClick={handleKakaoSave}
                        className="px-6 py-2 text-sm font-medium bg-[#1a3a8f] text-white rounded-xl hover:bg-[#15306e] transition-colors"
                      >
                        저장하기
                      </button>
                    </div>
                  </div>
                </SettingCard>

                {/* Google Calendar */}
                <SettingCard title="Google 캘린더 연동">
                  <div className="space-y-4">
                    <div className={clsx(
                      'flex items-center gap-3 p-4 rounded-xl border',
                      googleConnected ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                    )}>
                      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center text-white', googleConnected ? 'bg-blue-500' : 'bg-gray-300')}>
                        <Calendar size={20} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900">Google 캘린더</p>
                        {googleConnected ? (
                          <p className="text-xs text-blue-600 mt-0.5">연결됨 - 예약이 캘린더에 표시됩니다</p>
                        ) : (
                          <p className="text-xs text-gray-400 mt-0.5">연결되지 않음</p>
                        )}
                      </div>
                      {googleConnected ? (
                        <button
                          onClick={() => { clearGoogleTokens(); setGoogleConnected(false); notify('Google 캘린더 연결을 해제했습니다.'); }}
                          className="px-4 py-2 text-sm font-medium rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200"
                        >
                          연결 해제
                        </button>
                      ) : GOOGLE_OAUTH_READY ? (
                        <button
                          onClick={() => startGoogleOAuth()}
                          className="px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                        >
                          Google 캘린더 연결
                        </button>
                      ) : (
                        <button
                          disabled
                          className="px-4 py-2 text-sm font-medium rounded-xl bg-gray-100 text-gray-400 cursor-not-allowed"
                          title="Google OAuth 클라이언트가 설정되지 않은 빌드입니다"
                        >
                          이 빌드에서는 연결 불가
                        </button>
                      )}
                    </div>
                    {googleConnected && (
                      <p className="text-xs text-gray-400">
                        예약 화면에서 Google 캘린더 일정이 함께 표시됩니다. 새 예약을 만들 때 캘린더에도 자동 추가할 수 있습니다.
                      </p>
                    )}
                  </div>
                </SettingCard>

                {/* SMS */}
                <SettingCard title="SMS 발송 설정 (엔포+)">
                  <div className="space-y-4">
                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
                      <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                      <span>문자 발송은 본사 계약 발송사를 통해 이뤄지며 발송사 인증 정보는 본사 서버에만 보관됩니다. 여기서는 이 지점의 발신번호만 입력합니다(발송사 등록 번호와 같아야 합니다).</span>
                    </div>
                    <FormRow label="발신번호">
                      <input
                        type="tel"
                        value={settings.smsCallerId || ''}
                        onChange={e => setSettings(prev => ({ ...prev, smsCallerId: e.target.value }))}
                        className="form-input"
                        placeholder="01012345678"
                      />
                    </FormRow>
                    {smsTestMessage && (
                      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
                        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                        <span>{smsTestMessage}</span>
                      </div>
                    )}
                    <div className="flex gap-3">
                      <button
                        onClick={handleSmsTest}
                        disabled={smsTestStatus === 'sending'}
                        className="px-4 py-2 text-sm font-medium bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {smsTestStatus === 'sending' ? '발송 중...' : '테스트 발송'}
                      </button>
                      <button
                        onClick={handleSmsSave}
                        className="px-6 py-2 text-sm font-medium bg-[#1a3a8f] text-white rounded-xl hover:bg-[#15306e] transition-colors"
                      >
                        저장하기
                      </button>
                    </div>
                  </div>
                </SettingCard>

              </div>
            )}

            {tab === 'notifications' && (
              <div className="space-y-6">
              <RevisitCycleCard />
              <AdOptOutCard />
              <RetentionPolicyCard />

              <SettingCard title="자동 발송(캠페인)">
                <p className="text-sm text-gray-600">예약 전날 안내·생일 축하·미방문 케어·회차권 만료 안내 같은 자동 발송은 <b>문자/카카오 발송 &gt; 발송하기 &gt; 자동 발송(캠페인)</b>에서 만들고, 대상을 확인한 뒤 승인해 보냅니다. 광고성 캠페인은 위 080 번호와 고객의 수신 동의를 따릅니다.</p>
                <Link to="/messaging" className="inline-block mt-3 px-4 py-2 text-sm font-medium text-[#1a3a8f] bg-blue-50 rounded-xl hover:bg-blue-100">캠페인 관리로 이동</Link>
              </SettingCard>
              </div>
            )}

            {tab === 'services' && (
              <SettingCard title="시술 항목 관리">
                <p className="text-sm text-gray-500 mb-4">시술 항목을 추가·수정·삭제할 수 있습니다.</p>
                <button
                  onClick={openAddService}
                  className="mb-4 px-4 py-2 text-sm font-medium bg-primary-50 text-primary-700 rounded-xl border border-primary-100 hover:bg-primary-100 flex items-center gap-1.5"
                >
                  <Plus size={14} /> 시술 추가
                </button>
                <div className="space-y-2">
                  {Object.keys(servicesByCategory).length === 0 && (
                    <p className="text-sm text-gray-400 py-4 text-center">등록된 시술이 없어요</p>
                  )}
                  {Object.entries(servicesByCategory).map(([cat, svcs]) => (
                    <div key={cat}>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2 py-2">{cat}</p>
                      <div className="space-y-1">
                        {svcs.map(svc => (
                          <div key={svc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm">
                            <span className="text-gray-700">{svc.name}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-gray-500">{svc.duration}분</span>
                              <span className="font-semibold text-gray-800">{svc.price.toLocaleString()}원</span>
                              <button
                                onClick={() => openEditService(svc)}
                                aria-label={`${svc.name} 수정`}
                                className="text-xs text-primary-600 hover:text-primary-800 flex items-center gap-0.5 px-2 py-2 rounded-lg hover:bg-primary-50"
                              >
                                <Pencil size={12} /> 수정
                              </button>
                              <button
                                onClick={() => handleDeleteService(svc.id)}
                                aria-label={`${svc.name} 삭제`}
                                className="text-xs text-red-700 flex items-center gap-0.5 px-2 py-2 rounded-lg hover:bg-red-50"
                              >
                                <Trash2 size={12} /> 삭제
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </SettingCard>
            )}

            {tab === 'subscription' && (
              <div className="space-y-4">
                {/* 현재 플랜 */}
                <SettingCard title="현재 구독 플랜">
                  {subscriptionLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 p-4 bg-primary-50 rounded-xl border border-primary-100">
                        <div className="w-12 h-12 rounded-xl bg-primary-600 text-white flex items-center justify-center">
                          {currentSubscription?.plan === 'pro' ? <Crown size={24} /> :
                           currentSubscription?.plan === 'starter' ? <Zap size={24} /> :
                           <Star size={24} />}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-bold text-gray-900">
                            {PLANS.find(p => p.id === (currentSubscription?.plan || user?.plan))?.name || '무료 체험'}
                          </h3>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {currentSubscription?.plan === 'trial'
                              ? `무료 체험 중 (만료: ${currentSubscription.expiresAt ? formatLocalDate(String(currentSubscription.expiresAt)) : '알 수 없음'})`
                              : currentSubscription?.amount
                                ? `${currentSubscription.amount.toLocaleString()}원/월`
                                : '활성 상태'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          <CheckCircle size={12} />
                          {currentSubscription?.status === 'active' ? '활성' : currentSubscription?.status || '활성'}
                        </div>
                      </div>

                      {currentSubscription && (
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="p-3 bg-gray-50 rounded-xl">
                            <p className="text-xs text-gray-400">시작일</p>
                            <p className="font-medium text-gray-700">
                              {currentSubscription.startedAt ? formatLocalDate(String(currentSubscription.startedAt)) : '-'}
                            </p>
                          </div>
                          <div className="p-3 bg-gray-50 rounded-xl">
                            <p className="text-xs text-gray-400">만료일</p>
                            <p className="font-medium text-gray-700">
                              {currentSubscription.expiresAt ? formatLocalDate(String(currentSubscription.expiresAt)) : '-'}
                            </p>
                          </div>
                          {currentSubscription.paymentMethod && (
                            <div className="p-3 bg-gray-50 rounded-xl">
                              <p className="text-xs text-gray-400">결제 수단</p>
                              <p className="font-medium text-gray-700">{currentSubscription.paymentMethod === 'card' ? '신용카드' : currentSubscription.paymentMethod}</p>
                            </div>
                          )}
                          {currentSubscription.impUid && (
                            <div className="p-3 bg-gray-50 rounded-xl">
                              <p className="text-xs text-gray-400">결제 ID</p>
                              <p className="font-medium text-gray-700 text-xs truncate">{currentSubscription.impUid}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </SettingCard>

                {/* 플랜 변경 */}
                <SettingCard title="플랜 변경">
                  <p className="text-sm text-gray-500 mb-4">필요에 맞는 플랜으로 변경하세요.</p>
                  <div className="space-y-3">
                    {PLANS.filter(p => p.id !== 'enterprise').map(plan => {
                      const isCurrent = plan.id === (currentSubscription?.plan || user?.plan || 'trial');
                      return (
                        <div
                          key={plan.id}
                          className={clsx(
                            'p-4 rounded-xl border-2 transition-all',
                            isCurrent ? 'border-primary-300 bg-primary-50' : 'border-gray-100 hover:border-gray-200'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className={clsx(
                              'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                              plan.id === 'trial' ? 'bg-gray-100 text-gray-600' :
                              plan.id === 'starter' ? 'bg-blue-100 text-blue-700' :
                              'bg-primary-600 text-white'
                            )}>
                              {plan.id === 'pro' ? <Crown size={20} /> :
                               plan.id === 'starter' ? <Zap size={20} /> :
                               <Star size={20} />}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-bold text-gray-900">
                                  {plan.name}
                                  {isCurrent && <span className="ml-2 text-xs font-medium text-primary-600">(현재 플랜)</span>}
                                </h4>
                                <p className="text-sm font-bold text-primary-700">
                                  {plan.price === 0 ? '무료' : `${plan.price.toLocaleString()}원/월`}
                                </p>
                              </div>
                              <p className="text-xs text-slate-600 mt-0.5">{plan.description}</p>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {plan.features.map(f => (
                                  <span key={f} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{f}</span>
                                ))}
                              </div>
                            </div>
                            {!isCurrent && (isAuthApiConfigured ? (
                              // NAS 모드: 플랜은 본사가 계정 단위로 관리 — 누르면 실패하는 버튼을 보여주지 않는다
                              <span className="flex-shrink-0 text-xs text-gray-400">본사에서 변경</span>
                            ) : plan.price > 0 && !PAYMENT_ENABLED ? (
                              <button
                                disabled
                                className="flex-shrink-0 px-4 py-2 text-sm font-medium bg-gray-100 text-gray-400 rounded-xl cursor-not-allowed"
                                title="실결제(PG) 오픈 준비 중입니다"
                              >
                                결제 준비 중
                              </button>
                            ) : (
                              <button
                                onClick={() => handlePlanChange(plan)}
                                disabled={planChangeLoading}
                                className="flex-shrink-0 px-4 py-2 text-sm font-medium bg-[#1a3a8f] text-white rounded-xl hover:bg-[#15306e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {planChangeLoading ? '처리 중...' : plan.price > 0 ? '결제하기' : '변경하기'}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {planChangeError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                      {planChangeError}
                    </div>
                  )}

                  <div className="mt-4 p-3 bg-blue-50 rounded-xl text-xs text-blue-600">
                    Enterprise 플랜은 별도 문의가 필요합니다. support@troiareuke.com 으로 문의해주세요.
                  </div>
                </SettingCard>
              </div>
            )}

            {tab === 'notice' && (
              <SettingCard title="공지사항 · 업데이트 소식">
                <UpdateNewsBoard />
              </SettingCard>
            )}

            {tab === 'backup' && (
              <div className="space-y-4">
                {NAS_CONFIGURED && legacyCandidates.length > 0 && (
                  <SettingCard title="기존 계정 데이터 가져오기 (중앙 서버 이관)">
                    <div className="space-y-3">
                      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
                        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                        <span>
                          이 컴퓨터에 이전 계정으로 사용하던 데이터가 남아 있습니다. 아래 버튼을
                          누르면 현재 계정으로 가져오고, 중앙 서버에 자동 저장되어 다른
                          기기에서도 볼 수 있게 됩니다.
                        </span>
                      </div>
                      {legacyCandidates.map(c => (
                        <div key={c.shopId} className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-xl">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800">고객 {c.customerCount}명 · 데이터 {c.keyCount}종</p>
                            <p className="text-xs text-gray-400 font-mono truncate">이전 지점 ID: {c.shopId}</p>
                          </div>
                          <button
                            onClick={() => handleLegacyImport(c)}
                            className="flex-shrink-0 px-4 py-2 text-sm font-medium bg-[#1a3a8f] text-white rounded-xl hover:bg-[#0d2260] transition-colors"
                          >
                            가져오기
                          </button>
                        </div>
                      ))}
                    </div>
                  </SettingCard>
                )}

                <SettingCard title="데이터 내보내기">
                  <div className="space-y-4">
                    <p className="text-sm text-gray-500">
                      로그인한 계정의 매장 데이터만 내보내집니다. 선택한 항목이 {exportFormat === 'pdf' ? 'PDF 파일 하나로' : '시트별로 담긴 엑셀(.xlsx) 파일 하나로'} {IS_MOBILE_APP ? '만들어져 공유 시트로 전달됩니다' : '다운로드됩니다'}.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setExportSelection(new Set(EXPORT_DATASETS.filter(d => isAdmin || !d.adminOnly).map(d => d.key)))}
                        className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                      >
                        전체 선택
                      </button>
                      <button
                        onClick={() => setExportSelection(new Set())}
                        className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                      >
                        전체 해제
                      </button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {EXPORT_DATASETS.filter(d => isAdmin || !d.adminOnly).map(d => (
                        <label
                          key={d.key}
                          className={`flex items-start gap-2.5 px-3 py-2.5 border rounded-xl cursor-pointer transition-colors ${
                            exportSelection.has(d.key) ? 'border-primary-300 bg-primary-50/60' : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={exportSelection.has(d.key)}
                            onChange={() => toggleExport(d.key)}
                            className="mt-0.5 rounded"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-gray-800">
                              {d.label}
                              {d.sensitive && <span className="ml-1.5 text-2xs font-bold text-amber-700">민감정보</span>}
                            </span>
                            <span className="block text-xs text-gray-400 mt-0.5">{d.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                      <AlertCircle size={14} className="text-amber-700 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-700 leading-relaxed">
                        고객 연락처·피부상담 내역은 개인정보(민감정보)입니다. 다운로드한 파일은
                        외부 공유를 금지하고, 사용 후 안전하게 삭제해주세요. 시술 사진은 용량 문제로
                        엑셀에 포함되지 않습니다{isAuthApiConfigured ? ' — 서버에 올라간 사진은 본사에 요청해 파일로 받을 수 있습니다' : ''}.
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                        <button
                          onClick={() => setExportFormat('xlsx')}
                          className={`px-4 py-2.5 text-sm font-medium transition-colors ${exportFormat === 'xlsx' ? 'bg-[#1a3a8f] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                        >
                          엑셀 (.xlsx)
                        </button>
                        <button
                          onClick={() => setExportFormat('pdf')}
                          className={`px-4 py-2.5 text-sm font-medium transition-colors ${exportFormat === 'pdf' ? 'bg-[#1a3a8f] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                        >
                          PDF
                        </button>
                      </div>
                      <button
                        onClick={handleExport}
                        disabled={exportSelection.size === 0 || exporting}
                        className="flex items-center gap-2 px-5 py-2.5 min-h-[44px] bg-[#1a3a8f] text-white text-sm font-medium rounded-xl hover:bg-[#15306e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Download size={16} />
                        {exporting ? '생성 중...' : `선택 항목 다운로드 (${exportSelection.size}종)`}
                      </button>
                      {exportMessage && <p className="text-xs text-gray-500">{exportMessage}</p>}
                    </div>
                  </div>
                </SettingCard>

                {/* 앱 잠금(PIN) — 기기별, 기본 OFF (2026-11-18) */}
                <AppLockCard />
                {/* 백신 예외 등록 안내 — Electron에서만 렌더(electronAPI.securityGuide 없으면 카드가 스스로 null) */}
                <SecurityGuideCard />

                <SettingCard title="데이터 백업">
                  {isElectron ? (
                    <div className="space-y-4">
                      <p className="text-sm text-gray-500">
                        앱은 시작 시 자동으로 데이터를 백업하며, 6시간마다 자동 저장합니다.
                        최근 7일치 백업 파일이 보관됩니다.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={handleBackupNow}
                          disabled={backupStatus === 'saving'}
                          className="flex items-center gap-2 px-5 py-2.5 min-h-[44px] bg-[#1a3a8f] text-white text-sm font-medium rounded-xl hover:bg-[#15306e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <HardDrive size={16} />
                          {backupStatus === 'saving' ? '백업 중...' : backupStatus === 'done' ? '백업 완료!' : backupStatus === 'error' ? '백업 실패' : '지금 백업'}
                        </button>
                        <button
                          onClick={() => electronAPI?.backup?.openFolder()}
                          className="flex items-center gap-2 px-5 py-2.5 min-h-[44px] bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
                        >
                          <FolderOpen size={16} />
                          백업 폴더 열기
                        </button>
                      </div>
                      <p className="text-xs text-gray-400">
                        백업 파일 위치: 앱 데이터 폴더 / backups / troiareuke-YYYYMMDD-HHmmss.json
                        <br />사진은 이 백업 파일에 들어가지 않습니다 — 중앙 서버 연동 시 서버에 보관되고, 이 기기에는 대용량 저장소(IndexedDB)에 캐시됩니다.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">
                      자동 백업(6시간마다·7일 보관)은 데스크탑 앱 전용입니다. 아래 [백업 파일 저장]으로 직접 보관하세요.
                    </p>
                  )}
                </SettingCard>
                {/* 전체 백업 파일 저장·복원 — 로컬 모드 데이터 소실 방지, PC·모바일 공용 (2026-11-18) */}
                <BackupRestoreCard />
                {/* 전/후 사진은 용량 때문에 전체 백업에 들어가지 않는다 — 따로 내보내기·가져오기 (228, GAP C-3) */}
                <PhotoBackupCard />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Service Add/Edit Modal */}
      {showServiceModal && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div ref={serviceModalRef} role="dialog" aria-modal="true" aria-label={editingService ? '시술 수정' : '시술 추가'} className="modal-card bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative">
            <button
              type="button"
              onClick={() => setShowServiceModal(false)}
              aria-label="닫기"
              className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-gray-900 mb-5">
              {editingService ? '시술 수정' : '시술 추가'}
            </h3>
            <form onSubmit={e => { e.preventDefault(); handleServiceSubmit(); }} className="space-y-4">
              <FormRow label="시술명 *">
                <input
                  type="text"
                  aria-label="시술명"
                  value={serviceForm.name}
                  onChange={e => setServiceForm(prev => ({ ...prev, name: e.target.value }))}
                  className="form-input"
                  placeholder="예: 수분관리"
                />
              </FormRow>
              <FormRow label="카테고리 *">
                <input
                  type="text"
                  aria-label="카테고리"
                  value={serviceForm.category}
                  onChange={e => setServiceForm(prev => ({ ...prev, category: e.target.value }))}
                  className="form-input"
                  placeholder="예: 피부관리"
                  list="service-category-options"
                />
                {/* 자유 입력이라 오타로 그룹이 갈라지지 않게 기존 카테고리를 제안한다 */}
                <datalist id="service-category-options">
                  {[...new Set(services.map(sv => sv.category).filter(Boolean))].map(c => <option key={c} value={c} />)}
                </datalist>
              </FormRow>
              <FormRow label="소요시간">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    aria-label="소요시간(분)"
                    value={serviceForm.duration || ''}
                    onChange={e => setServiceForm(prev => ({ ...prev, duration: Number(e.target.value) }))}
                    className="form-input w-24"
                  />
                  <span className="text-sm text-gray-500">분</span>
                </div>
              </FormRow>
              <FormRow label="가격">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    aria-label="가격(원)"
                    value={serviceForm.price || ''}
                    onChange={e => setServiceForm(prev => ({ ...prev, price: Number(e.target.value) }))}
                    className="form-input w-32"
                  />
                  <span className="text-sm text-gray-500">원</span>
                </div>
              </FormRow>
              <FormRow label="설명">
                <input
                  type="text"
                  aria-label="설명"
                  value={serviceForm.description}
                  onChange={e => setServiceForm(prev => ({ ...prev, description: e.target.value }))}
                  className="form-input"
                  placeholder="선택사항"
                />
              </FormRow>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowServiceModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl hover:bg-[#15306e]"
                >
                  {editingService ? '저장' : '시술 추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .form-input {
          width: 100%;
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          border: 1px solid #e5e7eb;
          border-radius: 0.75rem;
          outline: none;
          transition: all 0.15s;
        }
        .form-input:focus {
          ring: 2px solid #c4b5fd;
          border-color: transparent;
          box-shadow: 0 0 0 2px #c4b5fd;
        }
      `}</style>
    </div>
  );
}

function SettingCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  // 자식이 input/select/textarea 하나뿐이면 id를 붙이고 라벨 htmlFor로 연결 — 접근성 이름 + 라벨 클릭으로 포커스 (axe "label" 위반 해소, 2026-11-18)
  const generated = useId();
  const only = Children.count(children) === 1 && isValidElement(children) ? children : null;
  const props = (only?.props ?? {}) as Record<string, unknown>;
  const native = !!only && typeof only.type === 'string' && ['input', 'select', 'textarea'].includes(only.type);
  const controlId = native ? ((props.id as string | undefined) ?? generated) : undefined;
  const content = native && controlId ? cloneElement(only, { id: controlId } as Record<string, unknown>) : children;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
      <label htmlFor={controlId} className="text-sm font-medium text-gray-600 sm:w-32 flex-shrink-0">{label}</label>
      <div className="flex-1 min-w-0">{content}</div>
    </div>
  );
}
