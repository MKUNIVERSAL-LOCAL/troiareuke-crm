import { useState, useEffect, useCallback } from 'react';
import { Link2, Bell, Store, Palette, Clock, Plus, X, Pencil, Trash2, CreditCard, CheckCircle, Crown, Zap, Star, Calendar, HardDrive, FolderOpen, AlertCircle } from 'lucide-react';
import { sendMessages } from '../../lib/messagingGateway';
import { isGoogleCalendarConnected, startGoogleOAuth, clearTokens as clearGoogleTokens } from '../../lib/googleCalendar';
import Header from '../../components/layout/Header';
import { SettingsStore, ServiceStore } from '../../lib/store';
import type { ShopSettings, Service, Subscription } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { requestPayment, PLANS, type PlanInfo } from '../../lib/payment';
import { isBeaconConsultationEnabled, setBeaconConsultationEnabled } from '../../lib/featureFlags';
import clsx from 'clsx';

type SettingTab = 'shop' | 'integrations' | 'notifications' | 'services' | 'hours' | 'subscription' | 'backup';

const tabs = [
  { key: 'shop' as SettingTab, label: '샵 정보', icon: <Store size={16} /> },
  { key: 'hours' as SettingTab, label: '영업시간', icon: <Clock size={16} /> },
  { key: 'integrations' as SettingTab, label: '연동 설정', icon: <Link2 size={16} /> },
  { key: 'notifications' as SettingTab, label: '알림 설정', icon: <Bell size={16} /> },
  { key: 'services' as SettingTab, label: '시술 관리', icon: <Palette size={16} /> },
  { key: 'subscription' as SettingTab, label: '구독/플랜', icon: <CreditCard size={16} /> },
  { key: 'backup' as SettingTab, label: '데이터 백업', icon: <HardDrive size={16} /> },
];

const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];

const shopTypeOptions = ['피부관리실', '에스테틱샵', '메디컬 에스테틱', '홈케어 에스테틱', '스파 에스테틱', '기타'];

const emptyServiceForm = { name: '', category: '', duration: 60, price: 0, description: '' };

export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState<SettingTab>('shop');
  const [settings, setSettings] = useState<ShopSettings>(() => {
    const current = SettingsStore.get();
    if (current.name === '내 에스테틱 샵' && user?.shopName) {
      return { ...current, name: user.shopName };
    }
    return current;
  });
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const [beaconOn, setBeaconOn] = useState(() => isBeaconConsultationEnabled());
  const [services, setServices] = useState<Service[]>(() => ServiceStore.getAll());
  const [saved, setSaved] = useState<string | null>(null);

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
    const result = await sendMessages({
      type: 'sms',
      content: '[트로이아르케 CRM] 테스트 발송 메시지입니다.',
      recipients: 1,
    });
    if (result.pending) {
      setSmsTestMessage('SMS 게이트웨이가 아직 연동되지 않았습니다 (NAS 서버 연동 후 지원). 실제 발송되지 않습니다.');
    } else if (result.reason) {
      setSmsTestMessage(`발송 실패: ${result.reason}`);
    } else {
      setSmsTestMessage(`발송 완료 (성공 ${result.sent}건)`);
    }
    setSmsTestStatus('done');
    setTimeout(() => { setSmsTestStatus('idle'); setSmsTestMessage(null); }, 5000);
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
    const result = await electronAPI.backup.exportNow(snapshot);
    setBackupStatus(result.success ? 'done' : 'error');
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

      if (isSupabaseConfigured && user?.branchId) {
        const { data } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('branch_id', user.branchId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (data) {
          fetchedFromRemote = true;
          setCurrentSubscription({
            id: data.id,
            branchId: data.branch_id,
            plan: data.plan,
            status: data.status,
            startedAt: data.started_at,
            expiresAt: data.expires_at,
            paymentMethod: data.payment_method,
            amount: data.amount,
            currency: data.currency,
            impUid: data.imp_uid,
            merchantUid: data.merchant_uid,
            customerUid: data.customer_uid,
            notes: data.notes,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          });
        }
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

        if (isSupabaseConfigured && user?.branchId) {
          // 기존 구독 만료 처리
          if (currentSubscription?.id) {
            await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('id', currentSubscription.id);
          }
          await supabase.from('subscriptions').insert(subData);
        }

        localStorage.setItem('troiareuke_subscription', JSON.stringify({ ...subData, id: `sub_${Date.now()}` }));
        await loadSubscription();
        flash('플랜이 변경되었습니다');
      } catch {
        setPlanChangeError('플랜 변경에 실패했습니다.');
      } finally {
        setPlanChangeLoading(false);
      }
      return;
    }

    // 유료 플랜 결제
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

        if (isSupabaseConfigured && user?.branchId) {
          if (currentSubscription?.id) {
            await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('id', currentSubscription.id);
          }
          await supabase.from('subscriptions').insert(subData);
        }

        localStorage.setItem('troiareuke_subscription', JSON.stringify({ ...subData, id: `sub_${Date.now()}` }));
        await loadSubscription();
        flash('플랜이 변경되었습니다');
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
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);

  // Flash save feedback
  const flash = (msg = '저장 완료') => {
    setSaved(msg);
    setTimeout(() => setSaved(null), 1500);
  };

  // ─── Shop Info ────────────────────────────────────────────
  const handleShopSave = async () => {
    const shopName = settings.name.trim().replace(/\s*CRM\s*$/i, '').trim();
    if (!shopName) {
      flash('샵 이름을 입력해주세요');
      return;
    }

    const updatedSettings = { ...settings, name: shopName };
    setSettings(updatedSettings);
    SettingsStore.save({
      name: shopName,
      type: settings.type as ShopSettings['type'],
      phone: settings.phone,
      address: settings.address,
      pointRate: settings.pointRate,
    });

    // 다음 로그인에서도 같은 샵명이 보이도록 지점·로컬 세션을 함께 갱신한다.
    if (isSupabaseConfigured && user?.branchId) {
      await supabase.from('branches').update({
        name: shopName,
        phone: settings.phone || null,
        address: settings.address || null,
      }).eq('id', user.branchId);
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

    flash(`${shopName} CRM으로 설정했습니다`);
  };

  // ─── Business Hours ───────────────────────────────────────
  const updateHours = (day: string, field: string, value: string | boolean) => {
    setSettings(prev => ({
      ...prev,
      businessHours: {
        ...prev.businessHours,
        [day]: { ...prev.businessHours[day], [field]: value },
      },
    }));
  };

  const handleHoursSave = () => {
    SettingsStore.save({ businessHours: settings.businessHours });
    flash();
  };

  // ─── Integrations ─────────────────────────────────────────
  const handleNaverSave = () => {
    SettingsStore.save({ naverBooking: settings.naverBooking });
    flash();
  };

  const handleKakaoSave = () => {
    SettingsStore.save({ kakao: settings.kakao });
    flash();
  };

  const handleSmsSave = () => {
    SettingsStore.save({ smsApiKey: settings.smsApiKey, smsCallerId: settings.smsCallerId });
    flash();
  };

  // ─── Notifications ────────────────────────────────────────
  const toggleNotification = (key: keyof ShopSettings['notificationSettings']) => {
    const updated = {
      ...settings.notificationSettings,
      [key]: !settings.notificationSettings[key],
    };
    setSettings(prev => ({ ...prev, notificationSettings: updated }));
  };

  const handleNotificationsSave = () => {
    SettingsStore.save({ notificationSettings: settings.notificationSettings });
    flash();
  };

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
    if (!serviceForm.name || !serviceForm.category) return;
    if (editingService) {
      ServiceStore.update(editingService.id, {
        name: serviceForm.name,
        category: serviceForm.category,
        duration: serviceForm.duration,
        price: serviceForm.price,
        description: serviceForm.description || undefined,
      });
    } else {
      ServiceStore.save({
        name: serviceForm.name,
        category: serviceForm.category,
        duration: serviceForm.duration,
        price: serviceForm.price,
        description: serviceForm.description || undefined,
        isActive: true,
      });
    }
    setServices(ServiceStore.getAll());
    setShowServiceModal(false);
    flash(editingService ? '수정 완료' : '추가 완료');
  };

  const handleDeleteService = (id: string) => {
    if (!confirm('이 시술을 삭제하시겠습니까?')) return;
    ServiceStore.delete(id);
    setServices(ServiceStore.getAll());
    flash('삭제 완료');
  };

  // Group services by category
  const servicesByCategory = services.reduce<Record<string, Service[]>>((acc, svc) => {
    if (!acc[svc.category]) acc[svc.category] = [];
    acc[svc.category].push(svc);
    return acc;
  }, {});

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="설정" subtitle="샵 운영 환경을 설정하세요" />

      {/* Save feedback toast */}
      {saved && (
        <div className="fixed top-6 right-6 z-50 px-5 py-3 bg-green-500 text-white text-sm font-medium rounded-xl shadow-lg animate-fade-in">
          {saved}
        </div>
      )}

      <div className="p-8 flex-1">
        <div className="flex gap-6">
          {/* Sidebar tabs */}
          <div className="w-48 flex-shrink-0">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2 space-y-0.5">
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left',
                    tab === t.key
                      ? 'bg-purple-50 text-purple-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <span className={tab === t.key ? 'text-purple-500' : 'text-gray-400'}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1">
            {tab === 'shop' && (
              <SettingCard title="샵 기본 정보">
                <div className="space-y-4">
                  <FormRow label="샵 이름">
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={settings.name}
                        onChange={e => setSettings(prev => ({ ...prev, name: e.target.value }))}
                        className="form-input"
                        placeholder="예: 아르케스파"
                        maxLength={40}
                      />
                      <p className="text-xs text-gray-400">
                        프로그램명 미리보기: <strong className="text-[#1a3a8f]">{settings.name.trim().replace(/\s*CRM\s*$/i, '') || '샵 이름'} CRM</strong>
                      </p>
                    </div>
                  </FormRow>
                  <FormRow label="샵 유형">
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
                      onChange={e => setSettings(prev => ({ ...prev, phone: e.target.value }))}
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
                  <FormRow label="포인트 적립률">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={settings.pointRate}
                        onChange={e => setSettings(prev => ({ ...prev, pointRate: Number(e.target.value) }))}
                        className="form-input w-24"
                      />
                      <span className="text-sm text-gray-500">% (결제금액의 N%)</span>
                    </div>
                  </FormRow>
                  <div className="pt-4">
                    <button
                      onClick={handleShopSave}
                      className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium rounded-xl shadow-md hover:from-purple-600 hover:to-pink-600 transition-all"
                    >
                      저장하기
                    </button>
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
                      <div key={day} className="flex items-center gap-4">
                        <span className="text-sm font-medium text-gray-700 w-6">{day}</span>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!hours.isOff}
                            onChange={e => updateHours(day, 'isOff', !e.target.checked)}
                            className="rounded text-purple-500"
                          />
                          <span className="text-xs text-gray-500">영업</span>
                        </label>
                        <input
                          type="time"
                          value={hours.open}
                          onChange={e => updateHours(day, 'open', e.target.value)}
                          disabled={hours.isOff}
                          className="form-input text-sm w-28 disabled:opacity-40"
                        />
                        <span className="text-gray-400 text-sm">~</span>
                        <input
                          type="time"
                          value={hours.close}
                          onChange={e => updateHours(day, 'close', e.target.value)}
                          disabled={hours.isOff}
                          className="form-input text-sm w-28 disabled:opacity-40"
                        />
                        {hours.isOff && <span className="text-xs text-red-400 font-medium">휴무</span>}
                      </div>
                    );
                  })}
                  <div className="pt-4">
                    <button
                      onClick={handleHoursSave}
                      className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium rounded-xl shadow-md hover:from-purple-600 hover:to-pink-600 transition-all"
                    >
                      저장하기
                    </button>
                  </div>
                </div>
              </SettingCard>
            )}

            {tab === 'integrations' && (
              <div className="space-y-4">
                {/* 비컨 점수(AI 피부진단 수치) 기능 ON/OFF — 관리자 전용 */}
                {isAdmin && (
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
                        onClick={() => { const next = !beaconOn; setBeaconConsultationEnabled(next); setBeaconOn(next); }}
                        role="switch"
                        aria-checked={beaconOn}
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
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold bg-gray-300">
                        N
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900">네이버 예약</p>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                            <AlertCircle size={11} /> 준비 중
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">NAS 서버 연동 후 지원 예정</p>
                      </div>
                      <button
                        disabled
                        className="px-4 py-2 text-sm font-medium rounded-xl bg-gray-100 text-gray-400 cursor-not-allowed"
                        title="NAS 서버 연동 후 활성화됩니다"
                      >
                        연동하기
                      </button>
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
                      <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                      <span>네이버 예약 API 연동은 NAS 서버 구축 후 지원됩니다. 아래 플레이스 ID를 미리 입력해두면 연동 시 자동 적용됩니다.</span>
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
                        className="px-6 py-2 text-sm font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl shadow-md hover:from-purple-600 hover:to-pink-600 transition-all"
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
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold bg-gray-300">
                        K
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900">카카오 채널</p>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                            <AlertCircle size={11} /> 준비 중
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">NAS 서버 연동 후 지원 예정</p>
                      </div>
                      <button
                        disabled
                        className="px-4 py-2 text-sm font-medium rounded-xl bg-gray-100 text-gray-400 cursor-not-allowed"
                        title="NAS 서버 연동 후 활성화됩니다"
                      >
                        연동하기
                      </button>
                    </div>

                    <div className="flex items-center gap-3 p-4 rounded-xl border bg-gray-50 border-gray-200">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold bg-gray-300">
                        K
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900">카카오 오픈채팅</p>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                            <AlertCircle size={11} /> 준비 중
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">NAS 서버 연동 후 지원 예정</p>
                      </div>
                      <button
                        disabled
                        className="px-4 py-2 text-sm font-medium rounded-xl bg-gray-100 text-gray-400 cursor-not-allowed"
                        title="NAS 서버 연동 후 활성화됩니다"
                      >
                        연동하기
                      </button>
                    </div>

                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
                      <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                      <span>카카오 채널·오픈채팅 API 연동은 NAS 서버 구축 후 지원됩니다. 아래 ID/URL을 미리 입력해두면 연동 시 자동 적용됩니다.</span>
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
                        className="px-6 py-2 text-sm font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl shadow-md hover:from-purple-600 hover:to-pink-600 transition-all"
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
                        <p className="text-sm font-bold text-gray-900">Google Calendar</p>
                        {googleConnected ? (
                          <p className="text-xs text-blue-600 mt-0.5">연결됨 - 예약이 캘린더에 표시됩니다</p>
                        ) : (
                          <p className="text-xs text-gray-400 mt-0.5">연결되지 않음</p>
                        )}
                      </div>
                      {googleConnected ? (
                        <button
                          onClick={() => { clearGoogleTokens(); setGoogleConnected(false); flash('Google 캘린더 연결이 해제되었습니다'); }}
                          className="px-4 py-2 text-sm font-medium rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200"
                        >
                          연결 해제
                        </button>
                      ) : (
                        <button
                          onClick={() => startGoogleOAuth()}
                          className="px-4 py-2 text-sm font-medium rounded-xl bg-blue-500 text-white hover:bg-blue-600"
                        >
                          Google 캘린더 연결
                        </button>
                      )}
                    </div>
                    {googleConnected && (
                      <p className="text-xs text-gray-400">
                        예약 페이지에서 Google Calendar 이벤트가 함께 표시됩니다. 새 예약 생성 시 캘린더에도 자동 추가할 수 있습니다.
                      </p>
                    )}
                  </div>
                </SettingCard>

                {/* SMS */}
                <SettingCard title="SMS 발송 설정 (엔포+)">
                  <div className="space-y-4">
                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
                      <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                      <span>엔포+ SMS 게이트웨이는 NAS 서버 연동 후 실제 발송이 지원됩니다. API Key와 발신번호를 미리 입력해두면 연동 시 자동 적용됩니다.</span>
                    </div>
                    <FormRow label="API Key">
                      <input
                        type="password"
                        value={settings.smsApiKey || ''}
                        onChange={e => setSettings(prev => ({ ...prev, smsApiKey: e.target.value }))}
                        className="form-input"
                        placeholder="엔포+ API Key (미리 입력 가능)"
                      />
                    </FormRow>
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
                        className="px-6 py-2 text-sm font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl shadow-md hover:from-purple-600 hover:to-pink-600 transition-all"
                      >
                        저장하기
                      </button>
                    </div>
                  </div>
                </SettingCard>
              </div>
            )}

            {tab === 'notifications' && (
              <SettingCard title="자동 알림 설정">
                <div className="space-y-4">
                  {([
                    { key: 'reservationConfirm' as const, label: '예약 확인 문자', desc: '예약 등록 시 즉시 발송' },
                    { key: 'reservationReminder' as const, label: '예약 리마인더', desc: '예약 전날 오전 9시 발송' },
                    { key: 'birthdayMessage' as const, label: '생일 축하 메시지', desc: '생일 당일 오전 10시 카카오 발송' },
                    { key: 'novisitMessage' as const, label: '미방문 고객 케어', desc: '60일 미방문 시 카카오 발송' },
                  ]).map(n => (
                    <div key={n.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{n.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{n.desc}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={settings.notificationSettings[n.key]}
                          onChange={() => toggleNotification(n.key)}
                        />
                        <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
                      </label>
                    </div>
                  ))}
                  <div className="pt-2">
                    <button
                      onClick={handleNotificationsSave}
                      className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium rounded-xl shadow-md hover:from-purple-600 hover:to-pink-600 transition-all"
                    >
                      저장하기
                    </button>
                  </div>
                </div>
              </SettingCard>
            )}

            {tab === 'services' && (
              <SettingCard title="시술 항목 관리">
                <p className="text-sm text-gray-500 mb-4">시술 항목을 추가, 수정, 삭제할 수 있습니다.</p>
                <button
                  onClick={openAddService}
                  className="mb-4 px-4 py-2 text-sm font-medium bg-purple-50 text-purple-700 rounded-xl border border-purple-200 hover:bg-purple-100 flex items-center gap-1.5"
                >
                  <Plus size={14} /> 시술 추가
                </button>
                <div className="space-y-2">
                  {Object.keys(servicesByCategory).length === 0 && (
                    <p className="text-sm text-gray-400 py-4 text-center">등록된 시술이 없습니다.</p>
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
                                className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-0.5"
                              >
                                <Pencil size={12} /> 수정
                              </button>
                              <button
                                onClick={() => handleDeleteService(svc.id)}
                                className="text-xs text-red-500 hover:text-red-700 flex items-center gap-0.5"
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
                      <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100">
                        <div className="w-12 h-12 rounded-xl bg-purple-500 text-white flex items-center justify-center">
                          {currentSubscription?.plan === 'pro' ? <Crown size={24} /> :
                           currentSubscription?.plan === 'starter' ? <Zap size={24} /> :
                           <Star size={24} />}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-bold text-gray-900">
                            {PLANS.find(p => p.id === (currentSubscription?.plan || user?.plan))?.name || '무료 체험'}
                          </h3>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {currentSubscription?.plan === 'trial'
                              ? `무료 체험 중 (만료: ${currentSubscription.expiresAt ? new Date(currentSubscription.expiresAt).toLocaleDateString('ko-KR') : '알 수 없음'})`
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
                              {currentSubscription.startedAt ? new Date(currentSubscription.startedAt).toLocaleDateString('ko-KR') : '-'}
                            </p>
                          </div>
                          <div className="p-3 bg-gray-50 rounded-xl">
                            <p className="text-xs text-gray-400">만료일</p>
                            <p className="font-medium text-gray-700">
                              {currentSubscription.expiresAt ? new Date(currentSubscription.expiresAt).toLocaleDateString('ko-KR') : '-'}
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
                            isCurrent ? 'border-purple-300 bg-purple-50' : 'border-gray-100 hover:border-gray-200'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className={clsx(
                              'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                              plan.id === 'trial' ? 'bg-gray-100 text-gray-500' :
                              plan.id === 'starter' ? 'bg-blue-100 text-blue-600' :
                              'bg-purple-100 text-purple-600'
                            )}>
                              {plan.id === 'pro' ? <Crown size={20} /> :
                               plan.id === 'starter' ? <Zap size={20} /> :
                               <Star size={20} />}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-bold text-gray-900">
                                  {plan.name}
                                  {isCurrent && <span className="ml-2 text-xs font-medium text-purple-600">(현재 플랜)</span>}
                                </h4>
                                <p className="text-sm font-bold text-purple-700">
                                  {plan.price === 0 ? '무료' : `${plan.price.toLocaleString()}원/월`}
                                </p>
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">{plan.description}</p>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {plan.features.map(f => (
                                  <span key={f} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">{f}</span>
                                ))}
                              </div>
                            </div>
                            {!isCurrent && (
                              <button
                                onClick={() => handlePlanChange(plan)}
                                disabled={planChangeLoading}
                                className="flex-shrink-0 px-4 py-2 text-sm font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                              >
                                {planChangeLoading ? '처리 중...' : plan.price > 0 ? '결제하기' : '변경하기'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {planChangeError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                      {planChangeError}
                    </div>
                  )}

                  <div className="mt-4 p-3 bg-blue-50 rounded-xl text-xs text-blue-600">
                    Enterprise 플랜은 별도 문의가 필요합니다. support@troiareuke.com 으로 문의해주세요.
                  </div>
                </SettingCard>
              </div>
            )}

            {tab === 'backup' && (
              <div className="space-y-4">
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
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">
                      데이터 백업 기능은 데스크탑(Electron) 앱에서만 사용 가능합니다.
                    </p>
                  )}
                </SettingCard>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Service Add/Edit Modal */}
      {showServiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative">
            <button
              onClick={() => setShowServiceModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-gray-900 mb-5">
              {editingService ? '시술 수정' : '시술 추가'}
            </h3>
            <div className="space-y-4">
              <FormRow label="시술명">
                <input
                  type="text"
                  value={serviceForm.name}
                  onChange={e => setServiceForm(prev => ({ ...prev, name: e.target.value }))}
                  className="form-input"
                  placeholder="예: 수분관리"
                />
              </FormRow>
              <FormRow label="카테고리">
                <input
                  type="text"
                  value={serviceForm.category}
                  onChange={e => setServiceForm(prev => ({ ...prev, category: e.target.value }))}
                  className="form-input"
                  placeholder="예: 피부관리"
                />
              </FormRow>
              <FormRow label="소요시간">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={serviceForm.duration}
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
                    value={serviceForm.price}
                    onChange={e => setServiceForm(prev => ({ ...prev, price: Number(e.target.value) }))}
                    className="form-input w-32"
                  />
                  <span className="text-sm text-gray-500">원</span>
                </div>
              </FormRow>
              <FormRow label="설명">
                <input
                  type="text"
                  value={serviceForm.description}
                  onChange={e => setServiceForm(prev => ({ ...prev, description: e.target.value }))}
                  className="form-input"
                  placeholder="선택사항"
                />
              </FormRow>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowServiceModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200"
                >
                  취소
                </button>
                <button
                  onClick={handleServiceSubmit}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl shadow-md hover:from-purple-600 hover:to-pink-600"
                >
                  {editingService ? '수정하기' : '추가하기'}
                </button>
              </div>
            </div>
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
  return (
    <div className="flex items-center gap-4">
      <label className="text-sm font-medium text-gray-600 w-32 flex-shrink-0">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}
