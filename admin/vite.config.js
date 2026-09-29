import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const api = { '/api': { target: 'http://localhost:4000' } }

// Served at /admin/ in production (by the Express server) and on :5174 in dev.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: { port: 5174, strictPort: true, proxy: api },
  preview: { proxy: api },
})
