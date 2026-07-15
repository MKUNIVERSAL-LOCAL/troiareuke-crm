import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// prod 빌드 시 index.html <head>에 CSP 메타 태그를 삽입하는 플러그인
// dev 서버에서는 적용하지 않아 HMR/WS 차단 없음
function cspMetaPlugin(env: Record<string, string>): Plugin {
  const authApiSource = (() => {
    const raw = env.VITE_AUTH_API_URL?.trim()
    if (!raw) return ''
    if (env.VITE_NAS_CUTOVER_APPROVED !== 'true') {
      throw new Error('VITE_AUTH_API_URL requires VITE_NAS_CUTOVER_APPROVED=true after migration rehearsal approval')
    }
    const url = new URL(raw)
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
    if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.search || url.hash) {
      throw new Error('VITE_AUTH_API_URL must be an HTTPS origin without credentials, query, or hash')
    }
    return url.origin
  })()
  const csp = [
    "default-src 'self'",
    // iamport CDN — payment.ts가 존재하므로 유지(미사용 시 제거 가능)
    "script-src 'self' 'unsafe-inline' https://cdn.iamport.kr",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://www.googleapis.com https://oauth2.googleapis.com http://127.0.0.1:19876${authApiSource ? ` ${authApiSource}` : ''}`,
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

export default defineConfig(({ mode }) => {
  // loadEnv를 사용해야 .env에만 있는 VITE_AUTH_API_URL도 CSP와 컷오버 게이트에 반영된다.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string>
  const isElectronBuild = env.BUILD_TARGET === 'electron'
  const appBase =
    env.DEPLOY_TARGET === 'ghpages'
      ? '/troiareuke-crm/'
      : isElectronBuild
        ? './'
        : '/'

  return {
  plugins: [
    react(),
    cspMetaPlugin(env),
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
              start_url: appBase,
              scope: appBase,
              lang: 'ko-KR',
              icons: [
                {
                  src: `${appBase}icons/icon-192.png`,
                  sizes: '192x192',
                  type: 'image/png',
                  purpose: 'any',
                },
                {
                  src: `${appBase}icons/icon-512.png`,
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'any',
                },
                {
                  src: `${appBase}icons/icon-512-maskable.png`,
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable',
                },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
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
  base: appBase,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  }
})
