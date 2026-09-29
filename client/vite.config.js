import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Express API runs on :4000; proxy /api so cookies stay same-origin.
const api = { '/api': { target: 'http://localhost:4000' } }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: api },
  preview: { proxy: api },
})
