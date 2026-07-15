// 🔒 CORE — 보호 파일(코어 잠금). 수정 금지. 변경 필요 시 docs/CORE-LOCK.md 의 CORE_EDIT=1 우회 절차.
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { saveTokenFromHash } from './lib/googleCalendar'
import { isPasswordRecoveryHash } from './lib/appUrl'

// Supabase가 기본 Site URL로 복귀시킨 경우에도 비밀번호 재설정 화면으로 보낸다.
// 만료 오류는 Supabase 고유 error_code로만 판정해 Google OAuth 오류와 구분한다.
const isPasswordRecovery = isPasswordRecoveryHash(window.location.hash)

if (isPasswordRecovery && window.location.protocol !== 'file:') {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')
  const resetPath = `${basePath}/reset-password`
  if (window.location.pathname !== resetPath) {
    window.history.replaceState(
      null,
      '',
      `${resetPath}${window.location.search}${window.location.hash}`,
    )
  }
}

// ── Google OAuth 콜백 처리 ────────────────────────────────────
// Google implicit grant flow가 redirect_uri로 돌아올 때
// URL fragment에 access_token이 포함됨. HashRouter 마운트 전에 처리.
if (!isPasswordRecovery && window.location.hash.includes('access_token=')) {
  const saved = saveTokenFromHash(window.location.hash);
  if (saved) {
    // 토큰 저장 후 메인 앱의 설정 페이지로 리다이렉트
    const base = window.location.pathname.replace(/\/auth\/google\/callback\/?$/, '/');
    window.location.replace(base + '#/settings');
  }
} else {
  // /auth/google/callback 경로로 직접 접근했지만 토큰이 없는 경우
  if (window.location.pathname.includes('/auth/google/callback')) {
    const base = window.location.pathname.replace(/\/auth\/google\/callback\/?$/, '/');
    window.location.replace(base + '#/settings');
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
