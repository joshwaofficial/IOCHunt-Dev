import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'
import './index.css'
import App from './App.jsx'

// Configure global Axios defaults
axios.defaults.withCredentials = true;

// Attach Bearer token fallback if stored
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('iochunt_token');
  if (token && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Handle 401 Unauthorized globally to prevent infinite loops
axios.interceptors.response.use((response) => response, (error) => {
  if (error.response && error.response.status === 401) {
    // Only redirect if not already on the login page
    if (window.location.pathname !== '/login') {
      localStorage.removeItem('iochunt_token');
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
