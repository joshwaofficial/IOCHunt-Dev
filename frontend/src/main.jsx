import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'
import './index.css'
import App from './App.jsx'

// Configure global Axios defaults (send httpOnly session cookies automatically)
axios.defaults.withCredentials = true;

// Handle 401 Unauthorized globally to redirect unauthenticated users
axios.interceptors.response.use((response) => response, (error) => {
  if (error.response && error.response.status === 401) {
    // Only redirect if not already on the login page
    if (window.location.pathname !== '/login') {
      const reason = error.response?.data?.reason;
      localStorage.removeItem('iochunt_user');
      if (reason === 'inactivity_timeout' || reason === 'idle_timeout') {
        window.location.href = '/login?reason=idle_timeout';
      } else if (reason) {
        window.location.href = `/login?reason=${encodeURIComponent(reason)}`;
      } else {
        window.location.href = '/login';
      }
    }
  }
  return Promise.reject(error);
});

// Auto-recover from stale chunks after a new frontend deployment
function handleChunkLoadError(event) {
  const error = event?.reason || event?.error || event;
  const message = error?.message || String(error || '');
  if (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('error loading chunk')
  ) {
    if (event?.preventDefault) event.preventDefault();
    const last = sessionStorage.getItem('chunk_reload_retry');
    const now = Date.now();
    if (!last || now - parseInt(last, 10) > 15000) {
      sessionStorage.setItem('chunk_reload_retry', String(now));
      console.warn('[Vite] Dynamic chunk 404 detected after deployment. Auto-refreshing to latest build...');
      window.location.reload();
    }
  }
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const last = sessionStorage.getItem('chunk_reload_retry');
  const now = Date.now();
  if (!last || now - parseInt(last, 10) > 15000) {
    sessionStorage.setItem('chunk_reload_retry', String(now));
    window.location.reload();
  }
});

window.addEventListener('error', handleChunkLoadError);
window.addEventListener('unhandledrejection', handleChunkLoadError);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
