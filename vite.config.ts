import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// prod 빌드 시 index.html <head>에 CSP 메타 태그를 삽입하는 플러그인
// dev 서버에서는 적용하지 않아 HMR/WS 차단 없음
function cspMetaPlugin(): Plugin {
  const csp = [
    "default-src 'self'",
    // iamport CDN — payment.ts가 존재하므로 유지(미사용 시 제거 가능)
    "script-src 'self' 'unsafe-inline' https://cdn.iamport.kr",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://www.googleapis.com https://oauth2.googleapis.com http://127.0.0.1:19876",
    "img-src 'self' data: blob: https:",
    "frame-src 'self' https://accounts.google.com",
  ].join('; ')

  return {
    name: 'vite-plugin-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), cspMetaPlugin()],
  // GitHub Pages: /troiareuke-crm/, Electron: ./
  base: process.env.DEPLOY_TARGET === 'ghpages' ? '/troiareuke-crm/' : './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
