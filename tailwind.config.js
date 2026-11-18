/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 브랜드 네이비(#1a3a8f) 스케일 — 전에는 쓰이지 않는 자홍색이었고 화면은 리터럴 #1a3a8f를 239곳에 썼다 (UI 품질 기준 2026-11-18)
        primary: {
          50: '#eef3fb',
          100: '#d9e3f7',
          200: '#b4c6ee',
          300: '#86a0e0',
          400: '#5577cc',
          500: '#3356ad',
          600: '#1a3a8f',
          700: '#15306e',
          800: '#0d2260',
          900: '#091a47',
        },
        rose: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
          900: '#881337',
        },
      },
      fontFamily: {
        sans: ['Pretendard Variable', 'Pretendard', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', 'system-ui', 'sans-serif'],
      },
      // 한글 UI 글자 스케일 — 캡션 최소 12px(토스·당근 기준), 본문 행간 1.5. 11px는 배지 전용 2xs (UI 품질 기준 2026-11-18)
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px' }],
        xs: ['12px', { lineHeight: '18px' }],
        sm: ['14px', { lineHeight: '21px' }],
        base: ['16px', { lineHeight: '24px' }],
        lg: ['17px', { lineHeight: '26px' }],
        xl: ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '36px' }],
        '4xl': ['36px', { lineHeight: '40px' }],
      },
    },
  },
  plugins: [],
}
