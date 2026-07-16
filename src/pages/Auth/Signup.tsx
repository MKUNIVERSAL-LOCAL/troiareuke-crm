import { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle2, Paperclip, X } from 'lucide-react';
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
  const [form, setForm] = useState({ name: '', email: '', phone: '', businessNumber: '', password: '', confirm: '', agreeTerms: false, agreePrivacy: false, agreeMarketing: false });
  const [licenseImage, setLicenseImage] = useState(''); // 사업자등록증 사진 (data URL)
  const [licenseFileName, setLicenseFileName] = useState('');
  const licenseInputRef = useRef<HTMLInputElement>(null);

  const set = (k: string, v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

  // 사업자등록번호 자동 하이픈 (000-00-00000)
  const formatBusinessNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  };
  const isValidBusinessNumber = /^\d{3}-\d{2}-\d{5}$/.test(form.businessNumber);

  const handleLicenseFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('사업자등록증은 이미지 파일(jpg, png)만 첨부할 수 있습니다.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('사업자등록증 사진은 5MB 이하로 첨부해주세요.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setLicenseImage(String(reader.result || ''));
      setLicenseFileName(file.name);
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) { setError('비밀번호가 일치하지 않습니다.'); return; }
    if (form.password.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return; }
    if (!form.agreeTerms || !form.agreePrivacy) { setError('이용약관과 개인정보 처리방침에 모두 동의해주세요.'); return; }
    setLoading(true); setError('');
    try {
      await signup({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        businessNumber: form.businessNumber,
        businessLicenseImage: licenseImage || undefined,
      });
      navigate('/onboarding');
    } catch (e: any) {
      const msg = e?.message || '';
      if (/already registered|user already exists|duplicate/i.test(msg)) {
        setError('이미 가입된 이메일입니다. 로그인 페이지에서 시도해주세요.');
      } else if (/Email not confirmed/i.test(msg)) {
        // Supabase "Confirm email" 활성화 상태 — 가입은 됐으나 이메일 인증 대기
        setError('가입 완료! 이메일 인증 메일을 확인해주세요. 시연 환경에서는 Supabase 대시보드 → Authentication → Settings → "Confirm email"을 비활성화해주세요.');
      } else if (/Failed to fetch|Network|ENOTFOUND|name not resolved/i.test(msg)) {
        setError('서버에 연결할 수 없습니다. 잠시 후 다시 시도하거나 관리자에게 문의해주세요.');
      } else if (/invalid email/i.test(msg)) {
        setError('이메일 형식이 올바르지 않습니다.');
      } else if (/password/i.test(msg)) {
        setError('비밀번호 형식이 올바르지 않습니다 (8자 이상, 영문·숫자 조합 권장).');
      } else if (msg) {
        setError(`회원가입 실패: ${msg}`);
      } else {
        setError('회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
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
              <form onSubmit={e => { e.preventDefault(); if (!form.name || !form.email || !form.phone || !form.businessNumber || !form.password) { setError('모든 항목을 입력해주세요.'); return; } if (!isValidBusinessNumber) { setError('사업자등록번호 10자리를 확인해주세요. (예: 123-45-67890)'); return; } setError(''); setStep(2); }} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">샵명 *</label>
                  <input type="text" value={form.name} onChange={e => set('name', e.target.value)} className="auth-input" placeholder="예: 아르케스파 강남점" required />
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
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">사업자등록번호 *</label>
                  <input type="text" inputMode="numeric" value={form.businessNumber} onChange={e => set('businessNumber', formatBusinessNumber(e.target.value))} className="auth-input" placeholder="123-45-67890" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">사업자등록증 사진 (선택)</label>
                  <input ref={licenseInputRef} type="file" accept="image/*" className="hidden" onChange={e => { handleLicenseFile(e.target.files?.[0]); e.target.value = ''; }} />
                  {licenseImage ? (
                    <div className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-xl bg-gray-50">
                      <img src={licenseImage} alt="사업자등록증 미리보기" className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
                      <span className="flex-1 text-sm text-gray-600 truncate">{licenseFileName}</span>
                      <button type="button" onClick={() => { setLicenseImage(''); setLicenseFileName(''); }} className="p-1.5 text-gray-400 hover:text-red-500" aria-label="첨부 삭제"><X size={16} /></button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => licenseInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-[#1a3a8f] hover:text-[#1a3a8f] transition-all">
                      <Paperclip size={15} /> 사업자등록증 사진 첨부 (jpg·png, 5MB 이하)
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">비밀번호 * (8자 이상)</label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)} className="auth-input pr-11" placeholder="비밀번호 (8자 이상)" required />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{showPw ? <Eye size={16} /> : <EyeOff size={16} />}</button>
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
                {([
                  { key: 'agreeTerms', label: '이용약관에 동의합니다 (필수)' },
                  { key: 'agreePrivacy', label: '개인정보 처리방침에 동의합니다 (필수)' },
                  { key: 'agreeMarketing', label: '마케팅 정보 수신에 동의합니다 (선택)' },
                ] as const).map(item => (
                  <label key={item.key} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form[item.key]}
                      onChange={e => set(item.key, e.target.checked)}
                      className="rounded text-blue-500 w-4 h-4"
                    />
                    <span className="text-sm text-gray-700">{item.label}</span>
                  </label>
                ))}
                <label className="flex items-center gap-3 cursor-pointer pt-1 border-t border-gray-100 mt-1">
                  <input
                    type="checkbox"
                    checked={form.agreeTerms && form.agreePrivacy && form.agreeMarketing}
                    onChange={e => setForm(p => ({ ...p, agreeTerms: e.target.checked, agreePrivacy: e.target.checked, agreeMarketing: e.target.checked }))}
                    className="rounded text-blue-500 w-4 h-4"
                  />
                  <span className="text-sm font-medium text-gray-500">전체 동의</span>
                </label>
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
