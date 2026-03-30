import { useState, useEffect } from 'react';
import { Link2, Bell, Store, Palette, Clock, Plus, X, Pencil, Trash2 } from 'lucide-react';
import Header from '../../components/layout/Header';
import { SettingsStore, ServiceStore } from '../../lib/store';
import type { ShopSettings, Service } from '../../types';
import clsx from 'clsx';

type SettingTab = 'shop' | 'integrations' | 'notifications' | 'services' | 'hours';

const tabs = [
  { key: 'shop' as SettingTab, label: '샵 정보', icon: <Store size={16} /> },
  { key: 'hours' as SettingTab, label: '영업시간', icon: <Clock size={16} /> },
  { key: 'integrations' as SettingTab, label: '연동 설정', icon: <Link2 size={16} /> },
  { key: 'notifications' as SettingTab, label: '알림 설정', icon: <Bell size={16} /> },
  { key: 'services' as SettingTab, label: '시술 관리', icon: <Palette size={16} /> },
];

const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];

const shopTypeOptions = ['피부관리실', '에스테틱샵', '메디컬 에스테틱', '홈케어 에스테틱', '스파 에스테틱', '기타'];

const emptyServiceForm = { name: '', category: '', duration: 60, price: 0, description: '' };

export default function Settings() {
  const [tab, setTab] = useState<SettingTab>('shop');
  const [settings, setSettings] = useState<ShopSettings>(() => SettingsStore.get());
  const [services, setServices] = useState<Service[]>(() => ServiceStore.getAll());
  const [saved, setSaved] = useState<string | null>(null);

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
  const handleShopSave = () => {
    SettingsStore.save({
      name: settings.name,
      type: settings.type as ShopSettings['type'],
      phone: settings.phone,
      address: settings.address,
      pointRate: settings.pointRate,
    });
    flash();
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
                    <input
                      type="text"
                      value={settings.name}
                      onChange={e => setSettings(prev => ({ ...prev, name: e.target.value }))}
                      className="form-input"
                    />
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
                {/* Naver */}
                <SettingCard title="네이버 예약 연동">
                  <div className="space-y-4">
                    <div className={clsx(
                      'flex items-center gap-3 p-4 rounded-xl border',
                      settings.naverBooking.isConnected ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                    )}>
                      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold', settings.naverBooking.isConnected ? 'bg-green-500' : 'bg-gray-300')}>
                        N
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900">네이버 예약</p>
                        {settings.naverBooking.isConnected ? (
                          <p className="text-xs text-green-600 mt-0.5">연동됨 · {settings.naverBooking.placeName} · 마지막 동기화: {settings.naverBooking.lastSyncAt}</p>
                        ) : (
                          <p className="text-xs text-gray-400 mt-0.5">연동되지 않음</p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setSettings(prev => ({
                            ...prev,
                            naverBooking: { ...prev.naverBooking, isConnected: !prev.naverBooking.isConnected },
                          }));
                        }}
                        className={clsx(
                          'px-4 py-2 text-sm font-medium rounded-xl',
                          settings.naverBooking.isConnected
                            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            : 'bg-green-500 text-white hover:bg-green-600'
                        )}
                      >
                        {settings.naverBooking.isConnected ? '연동 해제' : '연동하기'}
                      </button>
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
                    <div className={clsx(
                      'flex items-center gap-3 p-4 rounded-xl border',
                      settings.kakao.channelConnected ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'
                    )}>
                      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold', settings.kakao.channelConnected ? 'bg-yellow-400' : 'bg-gray-300')}>
                        K
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900">카카오 채널</p>
                        {settings.kakao.channelConnected ? (
                          <p className="text-xs text-yellow-600 mt-0.5">연동됨 · {settings.kakao.channelName}</p>
                        ) : (
                          <p className="text-xs text-gray-400 mt-0.5">연동되지 않음</p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setSettings(prev => ({
                            ...prev,
                            kakao: { ...prev.kakao, channelConnected: !prev.kakao.channelConnected },
                          }));
                        }}
                        className={clsx(
                          'px-4 py-2 text-sm font-medium rounded-xl',
                          settings.kakao.channelConnected ? 'bg-gray-100 text-gray-600' : 'bg-yellow-400 text-white'
                        )}
                      >
                        {settings.kakao.channelConnected ? '연동 해제' : '연동하기'}
                      </button>
                    </div>

                    <div className={clsx(
                      'flex items-center gap-3 p-4 rounded-xl border',
                      settings.kakao.openchatConnected ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'
                    )}>
                      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold', settings.kakao.openchatConnected ? 'bg-yellow-400' : 'bg-gray-300')}>
                        K
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900">카카오 오픈채팅</p>
                        {settings.kakao.openchatConnected ? (
                          <p className="text-xs text-yellow-600 mt-0.5">연동됨</p>
                        ) : (
                          <p className="text-xs text-gray-400 mt-0.5">연동되지 않음</p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setSettings(prev => ({
                            ...prev,
                            kakao: { ...prev.kakao, openchatConnected: !prev.kakao.openchatConnected },
                          }));
                        }}
                        className={clsx(
                          'px-4 py-2 text-sm font-medium rounded-xl',
                          settings.kakao.openchatConnected ? 'bg-gray-100 text-gray-600' : 'bg-yellow-400 text-white'
                        )}
                      >
                        {settings.kakao.openchatConnected ? '연동 해제' : '연동하기'}
                      </button>
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

                {/* SMS */}
                <SettingCard title="SMS 발송 설정 (엔포+)">
                  <div className="space-y-4">
                    <FormRow label="API Key">
                      <input
                        type="password"
                        value={settings.smsApiKey || ''}
                        onChange={e => setSettings(prev => ({ ...prev, smsApiKey: e.target.value }))}
                        className="form-input"
                      />
                    </FormRow>
                    <FormRow label="발신번호">
                      <input
                        type="tel"
                        value={settings.smsCallerId || ''}
                        onChange={e => setSettings(prev => ({ ...prev, smsCallerId: e.target.value }))}
                        className="form-input"
                      />
                    </FormRow>
                    <div className="flex gap-3">
                      <button className="px-4 py-2 text-sm font-medium bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100">
                        테스트 발송
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
