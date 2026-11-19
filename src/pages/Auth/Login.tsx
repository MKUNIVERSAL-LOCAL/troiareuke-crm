import { useRef, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Eye, EyeOff, Sparkles, CheckCircle, Mail, Phone, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isAuthApiConfigured } from '../../lib/authApi';
import { BLOCK_ADMIN_UI } from '../../lib/buildTarget';
import { useFocusTrap, useOverlayClose } from '../../lib/overlayStack';

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
  const resetRef = useRef<HTMLDivElement>(null);
  useFocusTrap(resetOpen, resetRef); // 재설정 창: 첫 입력란에 포커스, Tab 순환, 닫히면 열었던 링크로 (55)
  useOverlayClose(resetOpen, () => setResetOpen(false)); // Android 뒤로가기·Esc — 로그인 화면은 라우터 back 대상이 없어 이게 유일한 닫기 경로

  const resetComplete = new URLSearchParams(location.search).get('reset') === 'success';

  const openPasswordReset = () => setResetOpen(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('이메일과 비밀번호를 입력해주세요.'); return; }
    setLoading(true); setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (e: any) {
      const msg = e?.message || '';
      if (e?.name === 'AbortError' || /aborted/i.test(msg)) {
        setError('서버 응답이 없습니다(시간 초과). 인터넷 연결을 확인하고 잠시 후 다시 시도해주세요.');
      } else if (/Failed to fetch|Network|ENOTFOUND|name not resolved/i.test(msg)) {
        setError('서버에 연결할 수 없습니다. 인터넷 연결 또는 관리자에게 문의해주세요.');
      } else if (/올바르지 않|Invalid|invalid_credentials/i.test(msg)) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
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
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex justify-center">
            <TroiareukeLogo />
          </div>
          <div className="bg-white rounded-3xl shadow-xl p-5 sm:p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">로그인</h1>
            <p className="text-sm text-gray-400 mb-8">더마솔루션에 오신 것을 환영합니다</p>

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
                <label htmlFor="login-email" className="block text-xs font-medium text-gray-600 mb-1.5">이메일</label>
                <input
                  id="login-email"
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  inputMode="email"
                  autoComplete="email"
                  className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent transition-all"
                  placeholder="example@email.com"
                />
              </div>
              <div>
                <label htmlFor="login-password" className="block text-xs font-medium text-gray-600 mb-1.5">비밀번호</label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent transition-all pr-11"
                    placeholder="비밀번호 입력"
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-end text-xs">
                <button type="button" onClick={openPasswordReset} className="text-blue-600 hover:text-blue-700">
                  비밀번호 찾기
                </button>
              </div>
              <button
                type="submit" disabled={loading}
                className="w-full min-h-[48px] py-3 bg-[#1a3a8f] text-white font-semibold rounded-xl hover:bg-[#0d2260] transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
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
              <p className="text-sm text-gray-500">
                계정이 없으신가요?{' '}
                <Link to="/signup" className="text-blue-600 font-semibold hover:text-blue-700">무료로 시작하기</Link>
              </p>
            </div>

            {/* 지점 원장(앱 안 '관리자' 배지)이 누르던 막다른 입구 — 본사용임을 밝히고, 지점 exe에서는 아예 숨긴다 (3차 UX 점검 2026-11-19) */}
            {!BLOCK_ADMIN_UI && (
              <div className="mt-4 text-center">
                <Link to="/admin/login" className="text-xs text-gray-400 hover:text-primary-600 transition-colors">
                  본사(트로이아르케) 관리자 로그인 →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {resetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-reset-title"
          onMouseDown={e => { if (e.target === e.currentTarget) setResetOpen(false); }}
        >
          <div ref={resetRef} tabIndex={-1} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl outline-none">
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#1a3a8f]">
                {isAuthApiConfigured ? <Phone size={20} /> : <Mail size={20} />}
              </div>
              <button
                type="button"
                onClick={() => setResetOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>

            {isAuthApiConfigured ? (
              // 중앙서버 모드: 비밀번호 재설정은 본사 관리자 발급제 (오너 확정 2026-07-27 — 이메일 셀프 재설정 미도입)
              <div className="mt-5">
                <h2 id="password-reset-title" className="text-xl font-bold text-gray-900">비밀번호 재설정 안내</h2>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  비밀번호를 잊으셨다면 <span className="font-semibold text-gray-700">본사 관리자에게 연락</span>해주세요.
                  본인 확인 후 임시 비밀번호를 발급해드리며, 로그인하신 뒤 설정에서 새 비밀번호로 변경하시면 됩니다.
                </p>
                <p className="mt-2 text-sm text-gray-500">문의: <a href="mailto:mkclub21@gmail.com" className="text-blue-600 underline">mkclub21@gmail.com</a></p>
                <button
                  type="button"
                  onClick={() => setResetOpen(false)}
                  className="mt-6 w-full rounded-xl bg-[#1a3a8f] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0d2260]"
                >
                  확인
                </button>
              </div>
            ) : (
              // 로컬(오프라인) 모드: 재설정 메일을 보낼 서버가 없다 (2026-11-17 Supabase 메일 경로 폐기)
              <div className="mt-5">
                <h2 id="password-reset-title" className="text-xl font-bold text-gray-900">비밀번호 재설정 안내</h2>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  이 프로그램은 중앙 서버에 연결되어 있지 않아 재설정 메일을 보낼 수 없습니다.
                  설치한 관리자에게 문의해주세요.
                </p>
                <button
                  type="button"
                  onClick={() => setResetOpen(false)}
                  className="mt-6 w-full rounded-xl bg-[#1a3a8f] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0d2260]"
                >
                  확인
                </button>
              </div>
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
        <p className={`text-sm font-bold tracking-wider leading-tight ${white ? 'text-white' : 'text-[#1a3a8f]'}`}>DERMASOLUTION</p>
        <p className={`text-xs font-medium tracking-wide ${white ? 'text-blue-200' : 'text-gray-400'}`}>에스테틱 전용 CRM</p>
      </div>
    </div>
  );
}
