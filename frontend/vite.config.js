import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    https: {
      key: fs.readFileSync(path.resolve(__dirname, '../backend/central.key')),
      cert: fs.readFileSync(path.resolve(__dirname, '../backend/central.crt')),
    },
    proxy: {
      '/api': {
        target: 'https://localhost:4001',
        changeOrigin: true,
        secure: false // Since we are using a self-signed cert
      }
    }
  }
})
