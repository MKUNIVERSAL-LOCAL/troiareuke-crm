import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Users, Scissors, Link2, CheckCircle, ChevronRight, Sparkles, CreditCard, Crown, Zap, Star, Plus, X, Upload, ChevronDown, ChevronUp, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { StaffStore, ServiceStore, ProgramStore, SettingsStore } from '../../lib/store';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { requestPayment, PLANS, type PlanInfo } from '../../lib/payment';
import type { ShopSettings, SubscriptionPlan } from '../../types';
import * as XLSX from 'xlsx';

const steps = [
  { icon: <Store size={20} />, label: '샵 정보', desc: '기본 정보 입력' },
  { icon: <Users size={20} />, label: '직원 설정', desc: '직원 등록' },
  { icon: <Scissors size={20} />, label: '시술 항목', desc: '메뉴 등록' },
  { icon: <Link2 size={20} />, label: '연동 설정', desc: '외부 서비스 연결' },
  { icon: <CreditCard size={20} />, label: '플랜 선택', desc: '요금제 선택' },
  { icon: <CheckCircle size={20} />, label: '완료', desc: '시작 준비' },
];

const shopTypes = ['피부관리실', '에스테틱샵', '메디컬 에스테틱', '홈케어 에스테틱', '스파 에스테틱', '기타'];

// ── 트로이아르케 공식 프로그램 ──
interface TroiProgram { name: string; desc: string; duration: number; price: number; }
interface TroiCategory { category: string; label: string; programs: TroiProgram[]; }

const TROIAREUKE_PROGRAMS: TroiCategory[] = [
  {
    category: 'face_basic', label: 'FACE CARE — Basic',
    programs: [
      { name: '아르케RX', desc: '1:1맞춤 앰플 피부 고민 해결 + 림프 근막 케어', duration: 70, price: 120000 },
      { name: '아르케스킨메이트', desc: '오늘의 피부 컨디션에 맞는 1:1맞춤 관리', duration: 60, price: 100000 },
      { name: 'AC관리', desc: '여드름, 트러블, 과다 피지 완벽 해결', duration: 60, price: 120000 },
      { name: 'SEN관리', desc: '예민, 민감, 홍조 피부 고민 해결', duration: 60, price: 130000 },
    ],
  },
  {
    category: 'face_special', label: 'FACE CARE — Special',
    programs: [
      { name: '트로이필 본 트로이 0.8g', desc: '피부 기초체력 + 각화 주기 정상화 약초필', duration: 60, price: 250000 },
      { name: '트로이필 퀵 트로이 0.4g', desc: '피부 기초체력 + 각화 주기 정상화 약초필', duration: 60, price: 150000 },
      { name: 'VVS 무결점관리 SINGLE', desc: '페이스 톤결광 무결점 물광 관리', duration: 70, price: 180000 },
      { name: 'VVS 무결점관리 PREMIUM', desc: '페이스 + 바디부분', duration: 80, price: 260000 },
      { name: 'VVS 무결점관리 LUXURY', desc: '페이스 + 바디부분 + 등', duration: 105, price: 310000 },
    ],
  },
  {
    category: 'machine', label: 'MACHINE CARE',
    programs: [
      { name: '멜라토닝 LIGHT', desc: '건식 + 습식 플라즈마', duration: 70, price: 195000 },
      { name: '멜라토닝 ADVANCE', desc: '건식 + 습식 플라즈마 + 소노자임', duration: 80, price: 250000 },
      { name: '멜라토닝 PRESTIGE', desc: '건식 + 습식 + 두피 플라즈마 + 소노자임', duration: 90, price: 280000 },
      { name: '아크소닉 BASIC', desc: '여드름 베이직 케어', duration: 80, price: 200000 },
      { name: '아크소닉 PREMIUM', desc: '여드름 딥 케어', duration: 100, price: 250000 },
      { name: 'LD소닉 SINGLE', desc: '페이스 + 등/데콜테 소노', duration: 90, price: 250000 },
      { name: 'LD소닉 PREMIUM', desc: '페이스 + 등/데콜테 소노 + 하이푸 5000샷', duration: 110, price: 350000 },
      { name: 'LD소닉 LUXURY', desc: '페이스 + 등/데콜테/전신 소노', duration: 120, price: 380000 },
    ],
  },
  {
    category: 'body', label: 'BODY CARE',
    programs: [
      { name: '얼리썸머 다이어트 베이직', desc: '바디전신 아로마LD오일 + 바디 도자', duration: 60, price: 150000 },
      { name: '얼리썸머 다이어트 전신', desc: '바디전신 + 페이스 팩', duration: 80, price: 200000 },
    ],
  },
];

const planIcons: Record<string, React.ReactNode> = {
  trial: <Star size={24} />,
  starter: <Zap size={24} />,
  pro: <Crown size={24} />,
  enterprise: <Sparkles size={24} />,
};

export default function Onboarding() {
  const navigate = useNavigate();
  const { completeOnboarding, user } = useAuth();
  const [step, setStep] = useState(0);
  const [shopName, setShopName] = useState('');
  const [shopType, setShopType] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [staffList, setStaffList] = useState([{ name: '', role: '대표' }]);
  // 시술 항목: 직접 입력 + 트로이아르케 프로그램 + 엑셀 업로드
  const [customServices, setCustomServices] = useState<{ name: string; duration: string; price: string }[]>([]);
  const [selectedTroiPrograms, setSelectedTroiPrograms] = useState<Set<string>>(new Set());
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [excelServices, setExcelServices] = useState<{ name: string; duration: number; price: number }[]>([]);
  const [excelFileName, setExcelFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>('trial');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const addStaff = () => setStaffList(p => [...p, { name: '', role: '피부관리사' }]);
  const updateStaff = (i: number, k: string, v: string) =>
    setStaffList(p => p.map((s, idx) => idx === i ? { ...s, [k]: v } : s));

  // 직접 입력 관련
  const addCustomService = () => setCustomServices(p => [...p, { name: '', duration: '', price: '' }]);
  const updateCustomService = (i: number, k: string, v: string) =>
    setCustomServices(p => p.map((s, idx) => idx === i ? { ...s, [k]: v } : s));
  const removeCustomService = (i: number) => setCustomServices(p => p.filter((_, idx) => idx !== i));

  // 트로이아르케 프로그램 토글
  const toggleTroiProgram = (name: string) => {
    setSelectedTroiPrograms(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };
  const toggleCategory = (cat: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // 엑셀 파일 업로드 처리
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFileName(file.name);

    try {
      // xlsx/xls/csv 모두 SheetJS로 실제 파싱 (엑셀 바이너리를 텍스트로 잘못 읽는 문제 해결)
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false });
      const parsed: { name: string; duration: number; price: number }[] = [];

      // 첫 줄 헤더 스킵
      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i] || [];
        const name = String(cols[0] ?? '').trim();
        const duration = parseInt(String(cols[1] ?? '60').replace(/[^\d]/g, ''), 10) || 60;
        const price = parseInt(String(cols[2] ?? '0').replace(/[^\d]/g, ''), 10) || 0;
        if (name) parsed.push({ name, duration, price });
      }
      if (parsed.length === 0) {
        alert('시술 데이터를 찾지 못했습니다. 1행은 헤더, 2행부터 [시술명, 소요시간(분), 가격] 순으로 입력해주세요.');
      }
      setExcelServices(parsed);
    } catch {
      alert('파일을 읽을 수 없습니다. 엑셀(.xlsx/.xls) 또는 CSV 파일을 올려주세요.');
    }
  };

  // 구독 정보를 Supabase에 저장
  const saveSubscription = async (plan: SubscriptionPlan, impUid?: string, merchantUid?: string, amount?: number) => {
    if (!user) return;

    const now = new Date();
    const expiresAt = new Date(now);

    if (plan === 'trial') {
      expiresAt.setDate(expiresAt.getDate() + 14); // 14일 무료 체험
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1); // 1개월
    }

    const subscriptionData = {
      branch_id: user.branchId || user.id,
      plan,
      status: 'active',
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      payment_method: plan === 'trial' ? null : 'card',
      amount: amount || 0,
      currency: 'KRW',
      imp_uid: impUid || null,
      merchant_uid: merchantUid || null,
      notes: plan === 'trial' ? '14일 무료 체험' : `${plan} 플랜 결제`,
    };

    if (isSupabaseConfigured) {
      const { error } = await supabase.from('subscriptions').insert(subscriptionData);
      if (error) {
        console.error('구독 저장 실패:', error);
      }
    }

    // 로컬에도 저장
    localStorage.setItem('troiareuke_subscription', JSON.stringify({
      ...subscriptionData,
      id: `sub_${Date.now()}`,
      createdAt: now.toISOString(),
    }));
  };

  // 플랜 선택 후 결제 처리
  const handlePlanSelect = async (plan: PlanInfo) => {
    setSelectedPlan(plan.id);
    setPaymentError(null);

    if (plan.id === 'trial' || plan.id === 'enterprise') {
      // 무료 체험 또는 Enterprise는 바로 진행
      setStep(5);
      return;
    }

    // 유료 플랜: 결제 진행
    setPaymentLoading(true);
    try {
      const result = await requestPayment({
        planName: plan.name,
        amount: plan.price,
        buyerEmail: user?.email || '',
        buyerName: user?.name || '',
      });

      if (result.success) {
        await saveSubscription(plan.id, result.impUid, result.merchantUid, plan.price);
        setStep(5);
      } else {
        setPaymentError(result.error || '결제에 실패했습니다. 다시 시도해주세요.');
      }
    } catch {
      setPaymentError('결제 처리 중 오류가 발생했습니다.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const finish = async () => {
    // ★ 1단계: branchId를 먼저 확정한 후 localStorage에 저장
    // 이렇게 해야 이후 모든 Store.save()가 올바른 shopKey를 사용함
    const STORAGE_KEY = 'troiareuke_auth_user';
    const currentUser = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const fixedBranchId = currentUser.branchId || currentUser.id;
    const updatedUser = {
      ...currentUser,
      shopName, shopType, shopPhone, shopAddress,
      isOnboarded: true,
      branchId: fixedBranchId,
      branchName: shopName,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));

    // 첫 설정에서 입력한 샵명을 프로그램 표시명(“○○○ CRM”)으로 즉시 사용한다.
    SettingsStore.save({
      name: shopName.trim(),
      type: shopType as ShopSettings['type'],
      phone: shopPhone,
      address: shopAddress,
    });

    // ★ 2단계: 이제 getShopId()가 fixedBranchId를 반환하므로 안전하게 데이터 저장
    // 직원 목록 저장
    staffList
      .filter(s => s.name.trim() !== '')
      .forEach(s => {
        StaffStore.save({
          name: s.name,
          role: s.role,
          phone: '',
          specialty: [],
          color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
          isActive: true,
          hireDate: new Date().toISOString().split('T')[0],
        });
      });

    // 직접 입력한 시술 항목 저장
    customServices.filter(s => s.name.trim()).forEach(s => {
      const svcPrice = parseInt(s.price.replace(/,/g, ''), 10) || 0;
      const svcDuration = parseInt(s.duration, 10) || 60;
      ServiceStore.save({
        name: s.name.trim(),
        category: '직접 입력',
        duration: svcDuration,
        price: svcPrice,
        isActive: true,
      });
      ProgramStore.save({
        name: s.name.trim(),
        category: '직접 입력',
        totalSessions: null,
        validityDays: null,
        price: svcPrice,
        costPrice: 0,
        description: undefined,
        color: '#1a3a8f',
        isActive: true,
      });
    });

    // 트로이아르케 프로그램 저장
    TROIAREUKE_PROGRAMS.forEach(cat => {
      cat.programs.forEach(p => {
        if (selectedTroiPrograms.has(p.name)) {
          ServiceStore.save({
            name: p.name,
            category: `트로이아르케 ${cat.label}`,
            duration: p.duration,
            price: p.price,
            isActive: true,
          });
          ProgramStore.save({
            name: p.name,
            category: `트로이아르케 ${cat.label}`,
            totalSessions: null,
            validityDays: null,
            price: p.price,
            costPrice: 0,
            description: p.desc,
            color: '#1a3a8f',
            isActive: true,
          });
        }
      });
    });

    // 엑셀 업로드 시술 항목 저장
    excelServices.forEach(s => {
      ServiceStore.save({
        name: s.name,
        category: '엑셀 업로드',
        duration: s.duration,
        price: s.price,
        isActive: true,
      });
      ProgramStore.save({
        name: s.name,
        category: '엑셀 업로드',
        totalSessions: null,
        validityDays: null,
        price: s.price,
        costPrice: 0,
        description: undefined,
        color: '#1a3a8f',
        isActive: true,
      });
    });

    // ★ 3단계: Supabase 저장은 백그라운드 (실패해도 무시)
    try {
      if (selectedPlan === 'trial' || selectedPlan === 'enterprise') {
        await saveSubscription(selectedPlan);
      }
      await completeOnboarding({ shopName, shopType, shopPhone, shopAddress });
    } catch { /* 무시 */ }

    // ★ 4단계: 강제 리로드로 대시보드 이동
    window.location.hash = '#/';
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f4ff] to-[#fafafa] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2.5 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#1a3a8f] flex items-center justify-center">
              <Sparkles size={20} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-black tracking-wider text-[#1a3a8f] leading-tight">TROIAREUKE</p>
              <p className="text-xs text-gray-400">에스테틱 전용 CRM</p>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">안녕하세요, {user?.name}님!</h1>
          <p className="text-sm text-gray-400 mt-1">에스테틱 샵 정보를 설정하고 CRM을 시작해보세요</p>
          <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-full">
            <Sparkles size={12} className="text-[#1a3a8f]" />
            <span className="text-xs font-semibold text-[#1a3a8f]">에스테틱 전용 CRM 솔루션</span>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center mb-8 overflow-x-auto">
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-center">
              <div className={`flex flex-col items-center gap-1 transition-all ${i <= step ? 'opacity-100' : 'opacity-40'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-[#1a3a8f] text-white shadow-lg shadow-blue-200' : 'bg-gray-100 text-gray-400'}`}>
                  {i < step ? <CheckCircle size={18} /> : s.icon}
                </div>
                <p className={`text-xs font-medium hidden sm:block ${i === step ? 'text-[#1a3a8f]' : 'text-gray-400'}`}>{s.label}</p>
              </div>
              {i < steps.length - 1 && (
                <div className={`w-8 sm:w-12 h-0.5 mx-1 transition-all ${i < step ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          {/* Step 0: 샵 기본 정보 */}
          {step === 0 && (
            <StepWrapper title="에스테틱 샵 기본 정보" subtitle="운영하시는 에스테틱 샵의 정보를 입력해주세요">
              <div className="space-y-4">
                <div>
                  <label className="ob-label">샵 이름 *</label>
                  <input value={shopName} onChange={e => setShopName(e.target.value)} className="ob-input" placeholder="예: 트로이아르케 에스테틱" />
                </div>
                <div>
                  <label className="ob-label">샵 유형 *</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {shopTypes.map(t => (
                      <button key={t} onClick={() => setShopType(t)}
                        className={`p-3 text-sm rounded-xl border-2 transition-all text-left font-medium ${shopType === t ? 'border-[#1a3a8f] bg-blue-50 text-[#1a3a8f]' : 'border-gray-100 text-gray-600 hover:border-gray-200'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="ob-label">대표 전화</label>
                    <input value={shopPhone} onChange={e => setShopPhone(e.target.value)} className="ob-input" placeholder="02-0000-0000" />
                  </div>
                  <div>
                    <label className="ob-label">주소</label>
                    <input value={shopAddress} onChange={e => setShopAddress(e.target.value)} className="ob-input" placeholder="서울시 강남구..." />
                  </div>
                </div>
              </div>
              <StepNav onNext={() => { if (shopName && shopType) setStep(1); }} nextDisabled={!shopName || !shopType} />
            </StepWrapper>
          )}

          {/* Step 1: 직원 설정 */}
          {step === 1 && (
            <StepWrapper title="직원 등록" subtitle="처음 직원 정보를 등록해주세요 (나중에 추가 가능)">
              <div className="space-y-3">
                {staffList.map((s, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-gray-50 rounded-xl">
                    <input value={s.name} onChange={e => updateStaff(i, 'name', e.target.value)}
                      className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                      placeholder={`직원 ${i + 1} 이름`} />
                    <select value={s.role} onChange={e => updateStaff(i, 'role', e.target.value)}
                      className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300">
                      {['대표', '원장', '부원장', '실장', '피부관리사', '에스테티션', '테라피스트', '상담팀', '마케팅팀', '매니저', '네일아티스트', '인턴'].map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                ))}
                <button onClick={addStaff} className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-300 hover:text-blue-400 transition-colors">
                  + 직원 추가
                </button>
              </div>
              <StepNav onPrev={() => setStep(0)} onNext={() => setStep(2)} skipLabel="나중에 설정" onSkip={() => setStep(2)} />
            </StepWrapper>
          )}

          {/* Step 2: 시술 항목 */}
          {step === 2 && (
            <StepWrapper title="시술 항목 등록" subtitle="직접 입력하거나, 트로이아르케 프로그램을 선택하거나, 엑셀 파일을 업로드하세요">
              <div className="space-y-6">

                {/* ① 직접 입력 */}
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <Plus size={14} className="text-[#1a3a8f]" /> 직접 입력
                  </h3>
                  <div className="space-y-2">
                    {customServices.map((s, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input value={s.name} onChange={e => updateCustomService(i, 'name', e.target.value)}
                          className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                          placeholder="시술명" />
                        <input value={s.duration} onChange={e => updateCustomService(i, 'duration', e.target.value)}
                          className="w-20 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 text-center"
                          placeholder="분" />
                        <input value={s.price} onChange={e => updateCustomService(i, 'price', e.target.value)}
                          className="w-28 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 text-right"
                          placeholder="가격 (원)" />
                        <button onClick={() => removeCustomService(i)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                    <button onClick={addCustomService}
                      className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-300 hover:text-blue-400 transition-colors flex items-center justify-center gap-1">
                      <Plus size={14} /> 시술 항목 추가
                    </button>
                  </div>
                </div>

                {/* ② 트로이아르케 프로그램 선택 */}
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <Sparkles size={14} className="text-[#1a3a8f]" /> 트로이아르케 프로그램 선택하기
                  </h3>
                  <div className="space-y-2">
                    {TROIAREUKE_PROGRAMS.map(cat => (
                      <div key={cat.category} className="border border-gray-200 rounded-xl overflow-hidden">
                        <button onClick={() => toggleCategory(cat.category)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#1a3a8f] uppercase">{cat.label}</span>
                            <span className="text-xs text-gray-400">
                              ({cat.programs.filter(p => selectedTroiPrograms.has(p.name)).length}/{cat.programs.length})
                            </span>
                          </div>
                          {openCategories.has(cat.category) ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                        </button>
                        {openCategories.has(cat.category) && (
                          <div className="divide-y divide-gray-100">
                            {cat.programs.map(p => {
                              const selected = selectedTroiPrograms.has(p.name);
                              return (
                                <button key={p.name} onClick={() => toggleTroiProgram(p.name)}
                                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                  <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${selected ? 'bg-[#1a3a8f]' : 'bg-gray-200'}`}>
                                    {selected && <CheckCircle size={12} className="text-white" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900">{p.name}</p>
                                    <p className="text-[11px] text-gray-400 truncate">{p.desc}</p>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-bold text-[#1a3a8f]">{p.price.toLocaleString()}원</p>
                                    <p className="text-xs text-gray-400">{p.duration}분</p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ③ 엑셀 파일 업로드 */}
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <Upload size={14} className="text-[#1a3a8f]" /> 엑셀/CSV 파일 업로드
                  </h3>
                  <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" onChange={handleExcelUpload} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full py-4 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-300 hover:text-blue-400 transition-colors flex flex-col items-center gap-1.5">
                    <FileSpreadsheet size={24} />
                    {excelFileName ? (
                      <span className="text-blue-600 font-medium">{excelFileName} ({excelServices.length}개 항목)</span>
                    ) : (
                      <>
                        <span>파일을 선택하세요</span>
                        <span className="text-xs">CSV/TSV 형식 (시술명, 시간(분), 가격(원))</span>
                      </>
                    )}
                  </button>
                  {excelServices.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                      {excelServices.map((s, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                          <span className="text-gray-700 font-medium">{s.name}</span>
                          <span className="text-gray-400">{s.duration}분 / {s.price.toLocaleString()}원</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 등록 요약 */}
                {(customServices.filter(s => s.name.trim()).length > 0 || selectedTroiPrograms.size > 0 || excelServices.length > 0) && (
                  <div className="p-3 bg-blue-50 rounded-xl text-xs text-blue-600">
                    총 {customServices.filter(s => s.name.trim()).length + selectedTroiPrograms.size + excelServices.length}개 시술 항목이 등록됩니다
                  </div>
                )}
              </div>
              <StepNav onPrev={() => setStep(1)} onNext={() => setStep(3)} skipLabel="나중에 설정" onSkip={() => setStep(3)} />
            </StepWrapper>
          )}

          {/* Step 3: 연동 설정 안내 */}
          {step === 3 && (
            <StepWrapper title="외부 서비스 연동" subtitle="나중에 설정 > 연동 설정에서도 할 수 있습니다">
              <div className="space-y-3">
                {[
                  { name: '네이버 예약', desc: '스마트플레이스 예약을 자동으로 받아옵니다', color: 'bg-green-500' },
                  { name: '카카오 채널', desc: '카카오톡으로 예약 확인·마케팅 메시지를 보냅니다', color: 'bg-yellow-400' },
                  { name: '엔포+ SMS', desc: 'SMS·LMS 문자 발송에 필요합니다', color: 'bg-blue-500' },
                ].map(item => (
                  <div key={item.name} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                    <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                      {item.name[0]}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-400">{item.desc}</p>
                    </div>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">나중에 설정</span>
                  </div>
                ))}
                <div className="p-3 bg-blue-50 rounded-xl text-xs text-blue-600">
                  API 연동 가이드를 메뉴에서 확인하세요. 순서대로 따라하면 됩니다.
                </div>
              </div>
              <StepNav onPrev={() => setStep(2)} onNext={() => setStep(4)} />
            </StepWrapper>
          )}

          {/* Step 4: 플랜 선택 (현재 무료 체험만 가능) */}
          {step === 4 && (
            <StepWrapper title="요금제 선택" subtitle="14일 무료 체험으로 시작합니다">
              <div className="space-y-3">
                {/* 무료 체험 - 선택됨 */}
                <div className="w-full text-left p-4 rounded-xl border-2 border-[#1a3a8f] bg-blue-50">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#1a3a8f] text-white">
                      {planIcons.trial}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-900">14일 무료 체험</h3>
                        <p className="text-sm font-bold text-[#1a3a8f]">무료</p>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">모든 기능 체험 가능 · 신용카드 불필요</p>
                    </div>
                  </div>
                </div>

                {/* 유료 플랜 - 준비 중 표시 */}
                {PLANS.filter(p => p.id !== 'enterprise' && p.id !== 'trial').map(plan => (
                  <div key={plan.id} className="w-full text-left p-4 rounded-xl border-2 border-gray-100 opacity-50">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        plan.id === 'starter' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                      }`}>
                        {planIcons[plan.id]}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-gray-900">{plan.name}</h3>
                          <p className="text-sm font-bold text-gray-400">{plan.price.toLocaleString()}원/월</p>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{plan.description}</p>
                        <span className="inline-block mt-1.5 text-xs px-2 py-0.5 bg-gray-200 text-gray-500 rounded-full">결제 기능 준비 중</span>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="p-3 bg-blue-50 rounded-xl text-xs text-blue-600">
                  14일 무료 체험 후 유료 플랜으로 전환할 수 있습니다. 체험 기간 중 모든 기능을 사용할 수 있습니다.
                </div>
              </div>
              <StepNav onPrev={() => setStep(3)} onNext={() => { setSelectedPlan('trial'); setStep(5); }} />
            </StepWrapper>
          )}

          {/* Step 5: 완료 */}
          {step === 5 && (
            <div className="p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#1a3a8f] to-blue-400 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-200">
                <CheckCircle size={36} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">설정 완료!</h2>
              <p className="text-gray-400 mb-2 text-sm">{shopName} 의 에스테틱 CRM이 준비되었습니다</p>
              <p className="text-xs text-blue-500 mb-2 font-medium">
                {selectedPlan === 'trial'
                  ? '14일 무료 체험이 시작됩니다'
                  : `${PLANS.find(p => p.id === selectedPlan)?.name || ''} 플랜이 활성화되었습니다`}
              </p>
              {selectedPlan !== 'trial' && (
                <p className="text-xs text-green-600 mb-6 font-medium flex items-center justify-center gap-1">
                  <CheckCircle size={12} /> 결제가 성공적으로 완료되었습니다
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 mb-8 text-sm">
                {['고객 관리 시작', '예약 등록', '직원 스케줄', 'AI 분석 챗봇'].map(f => (
                  <div key={f} className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl text-[#1a3a8f] font-medium">
                    <ChevronRight size={14} /> {f}
                  </div>
                ))}
              </div>
              <button onClick={finish} className="w-full py-3.5 bg-[#1a3a8f] text-white font-bold rounded-xl hover:bg-[#0d2260] transition-all shadow-lg shadow-blue-200 text-base">
                트로이아르케 에스테틱 CRM 시작하기
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .ob-label { display: block; font-size: 0.75rem; font-weight: 500; color: #4b5563; margin-bottom: 0.375rem; }
        .ob-input { width: 100%; padding: 0.625rem 0.75rem; font-size: 0.875rem; border: 1px solid #e5e7eb; border-radius: 0.75rem; outline: none; transition: all 0.15s; }
        .ob-input:focus { box-shadow: 0 0 0 2px rgba(26,58,143,0.25); border-color: transparent; }
      `}</style>
    </div>
  );
}

function StepWrapper({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-1">{title}</h2>
      <p className="text-sm text-gray-400 mb-6">{subtitle}</p>
      {children}
    </div>
  );
}

function StepNav({ onPrev, onNext, nextDisabled, skipLabel, onSkip }: {
  onPrev?: () => void; onNext?: () => void; nextDisabled?: boolean; skipLabel?: string; onSkip?: () => void;
}) {
  return (
    <div className="flex gap-3 mt-8">
      {onPrev && <button onClick={onPrev} className="px-6 py-2.5 bg-gray-100 text-gray-600 font-medium rounded-xl hover:bg-gray-200 text-sm">이전</button>}
      <div className="flex-1" />
      {skipLabel && onSkip && <button onClick={onSkip} className="px-4 py-2.5 text-gray-400 text-sm hover:text-gray-600">{skipLabel}</button>}
      {onNext && <button onClick={onNext} disabled={nextDisabled} className="px-8 py-2.5 bg-[#1a3a8f] text-white font-semibold rounded-xl hover:bg-[#0d2260] transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm shadow-md shadow-blue-100">다음</button>}
    </div>
  );
}
