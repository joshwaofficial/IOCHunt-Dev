import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Resolve TLS certificates from nginx/ssl
const keyPath = path.resolve(__dirname, '../nginx/ssl/iochunt.key')
const certPath = path.resolve(__dirname, '../nginx/ssl/iochunt.crt')

const httpsOptions = fs.existsSync(keyPath) && fs.existsSync(certPath) ? {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath)
} : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    https: httpsOptions,
    proxy: {
      '/api': {
        target: 'https://localhost:4001',
        changeOrigin: true,
        secure: false, // Allows self-signed cert in development
        ws: true // Support WebSocket and SSE
      }
    }
  }
})
