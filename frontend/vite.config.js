import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Helper to safely load certs or disable HTTPS
const getHttpsConfig = () => {
  const keyPath = path.resolve(__dirname, '../backend/central.key');
  const certPath = path.resolve(__dirname, '../backend/central.crt');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }
  return false; // Disable HTTPS (e.g. inside Docker build)
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    https: getHttpsConfig(),
    proxy: {
      '/api': {
        target: 'https://localhost:4001',
        changeOrigin: true,
        secure: false // Since we are using a self-signed cert
      }
    }
  }
})
