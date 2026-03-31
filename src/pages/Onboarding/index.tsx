import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Users, Scissors, Link2, CheckCircle, ChevronRight, Sparkles, CreditCard, Crown, Zap, Star } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { StaffStore, ServiceStore } from '../../lib/store';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { requestPayment, PLANS, type PlanInfo } from '../../lib/payment';
import type { SubscriptionPlan } from '../../types';

const steps = [
  { icon: <Store size={20} />, label: '샵 정보', desc: '기본 정보 입력' },
  { icon: <Users size={20} />, label: '직원 설정', desc: '직원 등록' },
  { icon: <Scissors size={20} />, label: '시술 항목', desc: '메뉴 등록' },
  { icon: <Link2 size={20} />, label: '연동 설정', desc: '외부 서비스 연결' },
  { icon: <CreditCard size={20} />, label: '플랜 선택', desc: '요금제 선택' },
  { icon: <CheckCircle size={20} />, label: '완료', desc: '시작 준비' },
];

const shopTypes = ['피부관리실', '에스테틱샵', '메디컬 에스테틱', '홈케어 에스테틱', '스파 에스테틱', '기타'];
const defaultServices = [
  '기본 피부관리 (90분 / 80,000원)',
  '프리미엄 피부관리 (120분 / 120,000원)',
  '메디컬 스킨케어 (90분 / 150,000원)',
  '림프 마사지 (60분 / 70,000원)',
  '등·어깨 마사지 (60분 / 65,000원)',
  '각질 관리 (45분 / 50,000원)',
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
  const [staffList, setStaffList] = useState([{ name: '', role: '원장' }]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>('trial');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const addStaff = () => setStaffList(p => [...p, { name: '', role: '피부관리사' }]);
  const updateStaff = (i: number, k: string, v: string) =>
    setStaffList(p => p.map((s, idx) => idx === i ? { ...s, [k]: v } : s));

  const toggleService = (s: string) =>
    setSelectedServices(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);

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

    // 선택된 시술 항목 파싱 후 저장
    selectedServices.forEach(s => {
      const match = s.match(/^(.+?)\s*\((\d+)분\s*\/\s*([\d,]+)원\)$/);
      if (match) {
        const name = match[1].trim();
        const duration = parseInt(match[2], 10);
        const price = parseInt(match[3].replace(/,/g, ''), 10);
        ServiceStore.save({
          name,
          category: '에스테틱',
          duration,
          price,
          isActive: true,
        });
      }
    });

    // 구독 정보 저장 (무료 체험인 경우)
    if (selectedPlan === 'trial' || selectedPlan === 'enterprise') {
      await saveSubscription(selectedPlan);
    }

    await completeOnboarding({ shopName, shopType, shopPhone, shopAddress });
    navigate('/');
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
              <p className="text-[10px] text-gray-400">에스테틱 전용 CRM</p>
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
                <p className={`text-[10px] font-medium hidden sm:block ${i === step ? 'text-[#1a3a8f]' : 'text-gray-400'}`}>{s.label}</p>
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
                      {['원장', '피부관리사', '에스테티션', '테라피스트', '매니저'].map(r => <option key={r}>{r}</option>)}
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
            <StepWrapper title="에스테틱 시술 항목" subtitle="주요 시술 항목을 선택해주세요 (나중에 수정 가능)">
              <div className="space-y-2">
                {defaultServices.map(s => (
                  <label key={s} onClick={() => toggleService(s)}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${selectedServices.includes(s) ? 'border-[#1a3a8f] bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}>
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${selectedServices.includes(s) ? 'bg-[#1a3a8f]' : 'bg-gray-100'}`}>
                      {selectedServices.includes(s) && <CheckCircle size={12} className="text-white" />}
                    </div>
                    <span className="text-sm text-gray-700">{s}</span>
                  </label>
                ))}
                <button className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-300 hover:text-blue-400 transition-colors">
                  + 직접 입력
                </button>
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
                        <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 bg-gray-200 text-gray-500 rounded-full">결제 기능 준비 중</span>
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
