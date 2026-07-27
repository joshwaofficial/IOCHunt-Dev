import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Helper to safely load certs or disable HTTPS
const getHttpsConfig = () => {
  const keyPath = path.resolve(__dirname, '../iochunt.key');
  const certPath = path.resolve(__dirname, '../iochunt.crt');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }
  return false; // Disable HTTPS (e.g. inside Docker build)
};

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
      https: getHttpsConfig(),
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
