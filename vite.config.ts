import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

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

// Electron 빌드 여부 — BUILD_TARGET=electron npm run build 로 전달
const isElectronBuild = process.env.BUILD_TARGET === 'electron'

export default defineConfig({
  plugins: [
    react(),
    cspMetaPlugin(),
    // PWA는 웹 빌드 전용. Electron 빌드에서는 비활성.
    ...(!isElectronBuild
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'icons/*.png'],
            manifest: {
              name: '트로이아르케 CRM',
              short_name: '아르케 CRM',
              description: '에스테틱 전용 고객 관리 시스템',
              theme_color: '#1a3a8f',
              background_color: '#ffffff',
              display: 'standalone',
              orientation: 'portrait',
              start_url: '/',
              scope: '/',
              lang: 'ko-KR',
              icons: [
                {
                  src: '/icons/icon-192.png',
                  sizes: '192x192',
                  type: 'image/png',
                  purpose: 'any',
                },
                {
                  src: '/icons/icon-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'any',
                },
                {
                  src: '/icons/icon-512-maskable.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable',
                },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
              // PDF 한글 폰트 청크(~2.7MB)가 프리캐시 기본 한도(2MB)를 넘으므로 상향
              maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
              runtimeCaching: [
                // Supabase REST API — NetworkFirst (3초 타임아웃)
                {
                  urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
                  handler: 'NetworkFirst',
                  options: {
                    cacheName: 'supabase-rest-cache',
                    networkTimeoutSeconds: 3,
                    expiration: {
                      maxEntries: 50,
                      maxAgeSeconds: 24 * 60 * 60, // 24시간
                    },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
                // Supabase Auth — NetworkOnly (캐시 안 함)
                {
                  urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/.*/i,
                  handler: 'NetworkOnly',
                },
                // Supabase Storage (시술 사진) — CacheFirst 30일
                {
                  urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'supabase-storage-cache',
                    expiration: {
                      maxEntries: 100,
                      maxAgeSeconds: 30 * 24 * 60 * 60, // 30일
                    },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
                // Google Fonts — CacheFirst 365일
                {
                  urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'google-fonts-cache',
                    expiration: {
                      maxEntries: 20,
                      maxAgeSeconds: 365 * 24 * 60 * 60, // 1년
                    },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
              ],
            },
          }),
        ]
      : []),
  ],
  // GitHub Pages: /troiareuke-crm/, Electron: ./  Web/PWA: /
  base:
    process.env.DEPLOY_TARGET === 'ghpages'
      ? '/troiareuke-crm/'
      : isElectronBuild
        ? './'
        : '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
