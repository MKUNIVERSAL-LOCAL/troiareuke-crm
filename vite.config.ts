import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Electron 패키징 시 상대 경로로 에셋 로드되도록 설정
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
