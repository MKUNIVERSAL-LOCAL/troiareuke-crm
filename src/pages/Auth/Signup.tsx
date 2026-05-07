import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { TroiareukeLogo } from './Login';

const plans = [
  { key: 'trial', label: '14일 무료 체험', price: '무료', desc: '모든 기능 체험 가능', highlight: true, disabled: false },
  { key: 'starter', label: 'Starter', price: '29,000원/월', desc: '1개 샵 · 직원 3명', highlight: false, disabled: true },
  { key: 'pro', label: 'Pro', price: '59,000원/월', desc: '2개 샵 · 직원 무제한', highlight: false, disabled: true },
];

export default function Signup() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [step, setStep] = useState(1);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '', agree: false });

  const set = (k: string, v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) { setError('비밀번호가 일치하지 않습니다.'); return; }
    if (form.password.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return; }
    if (!form.agree) { setError('이용약관에 동의해주세요.'); return; }
    setLoading(true); setError('');
    try {
      await signup({ name: form.name, email: form.email, phone: form.phone, password: form.password });
      navigate('/onboarding');
    } catch {
      setError('회원가입에 실패했습니다. 다시 시도해주세요.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex justify-center mb-8"><TroiareukeLogo /></div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {['계정 정보', '약관 동의', '완료'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${step > i + 1 ? 'bg-green-100 text-green-700' : step === i + 1 ? 'bg-[#1a3a8f] text-white' : 'bg-gray-100 text-gray-400'}`}>
                {step > i + 1 ? <CheckCircle2 size={12} /> : <span>{i + 1}</span>}
                {s}
              </div>
              {i < 2 && <div className={`w-8 h-0.5 ${step > i + 1 ? 'bg-green-300' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-8">
          {step === 1 && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">계정 정보 입력</h2>
              <p className="text-sm text-gray-400 mb-6">14일 무료 체험 · 신용카드 불필요</p>
              {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
              <form onSubmit={e => { e.preventDefault(); if (!form.name || !form.email || !form.phone || !form.password) { setError('모든 항목을 입력해주세요.'); return; } setError(''); setStep(2); }} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">이름 *</label>
                  <input type="text" value={form.name} onChange={e => set('name', e.target.value)} className="auth-input" placeholder="홍길동" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">이메일 *</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className="auth-input" placeholder="example@email.com" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">휴대폰 번호 *</label>
                  <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} className="auth-input" placeholder="010-0000-0000" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">비밀번호 * (8자 이상)</label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)} className="auth-input pr-11" placeholder="비밀번호 (8자 이상)" required />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><EyeOff size={16} /></button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">비밀번호 확인 *</label>
                  <input type="password" value={form.confirm} onChange={e => set('confirm', e.target.value)} className="auth-input" placeholder="비밀번호 재입력" required />
                </div>
                <button type="submit" className="w-full py-3 bg-[#1a3a8f] text-white font-semibold rounded-xl hover:bg-[#0d2260] transition-all shadow-lg shadow-blue-100 mt-2">다음 단계</button>
              </form>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-6">플랜 선택 및 약관 동의</h2>
              <div className="space-y-3 mb-6">
                {plans.map(p => (
                  <div key={p.key} className={`p-4 rounded-2xl border-2 transition-all ${p.highlight ? 'border-[#1a3a8f] bg-blue-50' : 'border-gray-100'} ${p.disabled ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900">{p.label}</p>
                          {p.highlight && <span className="px-2 py-0.5 bg-[#1a3a8f] text-white rounded-full text-xs font-bold">선택됨</span>}
                          {p.disabled && <span className="px-2 py-0.5 bg-gray-200 text-gray-500 rounded-full text-xs font-bold">준비 중</span>}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{p.desc}</p>
                      </div>
                      <p className={`text-sm font-bold ${p.disabled ? 'text-gray-400' : 'text-[#1a3a8f]'}`}>{p.price}</p>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-400 text-center">14일 무료 체험 후 유료 플랜으로 전환할 수 있습니다</p>
              </div>
              <div className="space-y-3 mb-6">
                {['이용약관에 동의합니다 (필수)', '개인정보 처리방침에 동의합니다 (필수)', '마케팅 정보 수신에 동의합니다 (선택)'].map((t, i) => (
                  <label key={t} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" onChange={e => { if (i === 0) set('agree', e.target.checked); }} className="rounded text-blue-500 w-4 h-4" />
                    <span className="text-sm text-gray-700">{t}</span>
                  </label>
                ))}
              </div>
              {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-3 bg-gray-100 text-gray-600 font-semibold rounded-xl hover:bg-gray-200">이전</button>
                <button onClick={handleSubmit} disabled={loading} className="flex-1 py-3 bg-[#1a3a8f] text-white font-semibold rounded-xl hover:bg-[#0d2260] transition-all disabled:opacity-60">
                  {loading ? '처리 중...' : '무료 시작하기'}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          이미 계정이 있으신가요? <Link to="/login" className="text-blue-600 font-semibold">로그인</Link>
        </p>
      </div>

      <style>{`.auth-input { width: 100%; padding: 0.75rem 1rem; font-size: 0.875rem; border: 1px solid #e5e7eb; border-radius: 0.75rem; outline: none; transition: all 0.15s; } .auth-input:focus { box-shadow: 0 0 0 2px rgba(26,58,143,0.3); border-color: transparent; }`}</style>
    </div>
  );
}
