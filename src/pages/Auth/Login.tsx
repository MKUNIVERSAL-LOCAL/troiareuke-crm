import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Eye, EyeOff, Sparkles, CheckCircle, Mail, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { requestPasswordReset, isAuthApiConfigured } from '../../lib/authApi';
import { getPasswordResetRedirectUrl } from '../../lib/appUrl';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const features = [
  '고객 관리 · 예약 · 시술 기록 통합',
  '네이버 예약 수동 등록 · 연동 준비',
  'SMS · 카카오 메시지 초안 관리',
  '매출 분석 · 재고 관리',
  '피부 상담 · 홈케어 추천 기록',
];

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');

  const resetComplete = new URLSearchParams(location.search).get('reset') === 'success';

  const openPasswordReset = () => {
    setResetEmail(email.trim());
    setResetError('');
    setResetSent(false);
    setResetOpen(true);
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = resetEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      setResetError('가입할 때 사용한 이메일을 입력해주세요.');
      return;
    }
    setResetLoading(true);
    setResetError('');
    try {
      if (isAuthApiConfigured) {
        // NAS 중앙 서버 (1회용 토큰 메일 발송)
        await requestPasswordReset(normalizedEmail);
      } else if (isSupabaseConfigured) {
        // NAS 미배포 환경 폴백: Supabase 재설정 메일 (웹 /reset-password로 복귀)
        const { error: resetRequestError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: getPasswordResetRedirectUrl(),
        });
        if (resetRequestError) throw resetRequestError;
      } else {
        setResetError('비밀번호 재설정 서버가 연결되어 있지 않습니다. 관리자에게 문의해주세요.');
        setResetLoading(false);
        return;
      }
      setResetSent(true);
    } catch (e: any) {
      const message = e?.message || '';
      if (/rate limit|too many|over_email_send_rate_limit/i.test(message)) {
        setResetError('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
      } else if (/Failed to fetch|Network|ENOTFOUND|name not resolved/i.test(message)) {
        setResetError('서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.');
      } else if (/설정되지 않|연결되어 있지 않/.test(message)) {
        setResetError(message);
      } else {
        setResetError('재설정 메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('이메일과 비밀번호를 입력해주세요.'); return; }
    setLoading(true); setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (e: any) {
      const msg = e?.message || '';
      if (/Failed to fetch|Network|ENOTFOUND|name not resolved/i.test(msg)) {
        setError('서버에 연결할 수 없습니다. 인터넷 연결 또는 관리자에게 문의해주세요.');
      } else if (/올바르지 않|Invalid|invalid_credentials/i.test(msg)) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else if (/Email not confirmed/i.test(msg)) {
        setError('이메일 인증이 필요합니다. 가입 시 받은 메일에서 확인 링크를 클릭해주세요.');
      } else if (msg) {
        setError(`로그인 실패: ${msg}`);
      } else {
        setError('로그인에 실패했습니다. 다시 시도해주세요.');
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#1a3a8f] to-[#0d2260] flex-col justify-between p-12 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full bg-white blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-48 h-48 rounded-full bg-blue-300 blur-3xl"></div>
        </div>
        <div className="relative">
          <TroiareukeLogo white />
          <p className="text-blue-200 mt-2 text-sm">에스테틱 전용 CRM 솔루션</p>
        </div>
        <div className="relative space-y-4">
          <h2 className="text-3xl font-bold leading-tight">
            에스테틱 샵 운영의<br />모든 것을 한 곳에서
          </h2>
          <p className="text-blue-200 text-sm leading-relaxed">
            피부관리실 · 에스테틱샵 전용<br />고객·예약·시술 통합 CRM 솔루션
          </p>
          <div className="space-y-3 pt-4">
            {features.map(f => (
              <div key={f} className="flex items-center gap-3">
                <CheckCircle size={16} className="text-blue-300 flex-shrink-0" />
                <span className="text-sm text-blue-100">{f}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative">
          <p className="text-blue-300 text-xs">14일 무료 체험 · 신용카드 불필요</p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex justify-center">
            <TroiareukeLogo />
          </div>
          <div className="bg-white rounded-3xl shadow-xl p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">로그인</h1>
            <p className="text-sm text-gray-400 mb-8">트로이아르케 CRM에 오신 것을 환영합니다</p>

            {error && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
            )}
            {resetComplete && (
              <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">이메일</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  inputMode="email"
                  autoComplete="email"
                  className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
                  placeholder="example@email.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">비밀번호</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all pr-11"
                    placeholder="비밀번호 입력"
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded text-blue-500" />
                  <span className="text-gray-500">자동 로그인</span>
                </label>
                <button type="button" onClick={openPasswordReset} className="text-blue-600 hover:text-blue-700">
                  비밀번호 찾기
                </button>
              </div>
              <button
                type="submit" disabled={loading}
                className="w-full min-h-[48px] py-3 bg-[#1a3a8f] text-white font-semibold rounded-xl hover:bg-[#0d2260] transition-all shadow-lg shadow-blue-200 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    로그인 중...
                  </span>
                ) : '로그인'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-100 text-center">
              {isAuthApiConfigured ? (
                <p className="text-sm text-gray-500">계정은 트로이아르케 관리자가 지점별로 발급합니다.</p>
              ) : (
                <p className="text-sm text-gray-500">
                  계정이 없으신가요?{' '}
                  <Link to="/signup" className="text-blue-600 font-semibold hover:text-blue-700">무료로 시작하기</Link>
                </p>
              )}
            </div>

            <div className="mt-4 text-center">
              <Link to="/admin/login" className="text-[11px] text-gray-400 hover:text-blue-500 transition-colors">
                관리자 로그인 →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {resetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-reset-title"
          onMouseDown={e => { if (e.target === e.currentTarget && !resetLoading) setResetOpen(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#1a3a8f]">
                <Mail size={20} />
              </div>
              <button
                type="button"
                onClick={() => setResetOpen(false)}
                disabled={resetLoading}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>

            {resetSent ? (
              <div className="mt-5">
                <h2 id="password-reset-title" className="text-xl font-bold text-gray-900">메일을 확인해주세요</h2>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  가입된 이메일이면 비밀번호 재설정 링크가 발송됩니다. 메일이 보이지 않으면 스팸함도 확인해주세요.
                </p>
                <button
                  type="button"
                  onClick={() => setResetOpen(false)}
                  className="mt-6 w-full rounded-xl bg-[#1a3a8f] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0d2260]"
                >
                  확인
                </button>
              </div>
            ) : (
              <form onSubmit={handlePasswordReset} className="mt-5">
                <h2 id="password-reset-title" className="text-xl font-bold text-gray-900">비밀번호 재설정</h2>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  가입할 때 사용한 이메일을 입력하면 새 비밀번호를 설정할 수 있는 링크를 보내드립니다.
                </p>
                <label className="mt-5 block text-xs font-medium text-gray-600" htmlFor="reset-email">이메일</label>
                <input
                  id="reset-email"
                  type="email"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="example@email.com"
                />
                {resetError && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">{resetError}</div>
                )}
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="mt-5 w-full min-h-[48px] rounded-xl bg-[#1a3a8f] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0d2260] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resetLoading ? '메일 보내는 중...' : '재설정 메일 보내기'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TroiareukeLogo({ white = false }: { white?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-lg ${white ? 'bg-white/20' : 'bg-[#1a3a8f]'}`}>
        <Sparkles size={18} className={white ? 'text-white' : 'text-white'} />
      </div>
      <div>
        <p className={`text-sm font-black tracking-wider leading-tight ${white ? 'text-white' : 'text-[#1a3a8f]'}`}>TROIAREUKE</p>
        <p className={`text-xs font-medium tracking-wide ${white ? 'text-blue-200' : 'text-gray-400'}`}>에스테틱 전용 CRM</p>
      </div>
    </div>
  );
}
