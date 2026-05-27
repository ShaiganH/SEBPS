import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_BACKEND_URL is injected by Docker Compose (set to http://api:8000).
// Falls back to localhost:8000 for plain local dev — no behaviour change.
const backendHttp = process.env.VITE_BACKEND_URL || 'http://localhost:8000'
const backendWs   = backendHttp.replace(/^http/, 'ws')

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',   // bind all interfaces so Docker can expose port 5173
    port: 5173,
    proxy: {
      '/api': { target: backendHttp, changeOrigin: true },
      '/ws':  { target: backendWs,   ws: true, changeOrigin: true },
    },
  },
})
