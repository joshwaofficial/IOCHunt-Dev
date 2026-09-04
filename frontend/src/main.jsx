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
      localStorage.removeItem('iochunt_user');
      window.location.href = '/login';
    }
  }
  return Promise.reject(error);
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
