import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load backend .env manually using Vite's loadEnv
  // process.env.BRANCH determines which .env to load (e.g., .env.mumbai)
  const branchName = process.env.BRANCH || '';
  const envFileMode = branchName ? branchName : '';
  
  // By passing envFileMode to loadEnv, Vite automatically looks for .env.${envFileMode}
  const backendEnv = loadEnv(envFileMode, path.resolve(__dirname, '../backend'), '');
  const backendPort = backendEnv.HTTPS_PORT || 3001

  return {
    plugins: [react()],
    server: {
    host: true,
    https: {
      key: fs.readFileSync(path.resolve(__dirname, '../iochunt.key')),
      cert: fs.readFileSync(path.resolve(__dirname, '../iochunt.crt')),
    },
    proxy: {
      '/api': {
        target: `https://127.0.0.1:${backendPort}`,
        changeOrigin: true,
        secure: false // Since we are using a self-signed cert
      }
    }
  }
  }
})
