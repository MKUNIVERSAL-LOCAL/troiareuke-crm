import { KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TroiareukeLogo } from './Login';

/**
 * /reset-password — 예전 Supabase 이메일 재설정 링크가 도착하는 자리.
 * 지금은 비밀번호 재설정이 본사 관리자 발급제(오너 확정 2026-07-27)라 이 화면에서 바꿀 수 있는 것이 없다.
 * 전에는 "이메일 링크에서 설정하세요"라고 안내해 로그인 화면의 "본사 관리자에게 연락"과 모순이었다 (9차 점검 2026-11-20).
 * 라우트(App.tsx)와 recovery 리다이렉트(main.tsx)는 코어 잠금 — 정리는 오너 승인 건으로 기록.
 */
export default function ResetPassword() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8"><TroiareukeLogo /></div>
        <div className="bg-white rounded-3xl shadow-xl p-5 sm:p-8">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1a3a8f] flex items-center justify-center mb-4">
            <KeyRound size={22} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">비밀번호 재설정 안내</h1>
          <p className="mt-3 text-sm leading-6 text-gray-500">
            비밀번호는 <span className="font-semibold text-gray-700">본사 관리자가 임시 비밀번호를 발급</span>해 드립니다.
            본인 확인 후 받은 임시 비밀번호로 로그인하신 뒤, 설정에서 새 비밀번호로 바꿔 주세요.
          </p>
          <p className="mt-2 text-sm text-gray-500">문의: <a href="mailto:mkclub21@gmail.com" className="text-blue-600 underline">mkclub21@gmail.com</a></p>
          <Link to="/login" className="mt-6 block w-full rounded-xl bg-[#1a3a8f] px-4 py-3 text-center text-sm font-semibold text-white hover:bg-[#0d2260]">
            로그인으로
          </Link>
        </div>
      </div>
    </div>
  );
}
