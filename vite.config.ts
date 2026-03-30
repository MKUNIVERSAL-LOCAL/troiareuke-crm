import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages: /troiareuke-crm/, Electron: ./
  base: process.env.DEPLOY_TARGET === 'ghpages' ? '/troiareuke-crm/' : './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
