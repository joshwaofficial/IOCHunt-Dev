import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Clock, LogOut, CheckCircle2, X, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function IdleTimerManager() {
  const { user, logout } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(60);
  const [isExtending, setIsExtending] = useState(false);
  const lastActiveRef = useRef(Date.now());
  const lastWriteRef = useRef(0);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const showWarningRef = useRef(false);

  showWarningRef.current = showWarning;

  const idleTimeoutMins = Number(user?.idle_timeout_mins) || 0;

  const updateActivity = useCallback(() => {
    const now = Date.now();
    lastActiveRef.current = now;

    // Throttle writing to localStorage to once every 5 seconds to minimize overhead
    if (now - lastWriteRef.current > 5000) {
      lastWriteRef.current = now;
      try {
        localStorage.setItem('iochunt_last_active', String(now));
      } catch (_) {}
    }
  }, []);

  // Resume activity, dismiss notification, and sync keep-alive with server
  const handleActivityResume = useCallback(async () => {
    setIsExtending(true);
    const now = Date.now();
    lastActiveRef.current = now;
    lastWriteRef.current = now;
    try {
      localStorage.setItem('iochunt_last_active', String(now));
    } catch (_) {}
    setShowWarning(false);

    try {
      await axios.post('/api/auth/keep-alive');
    } catch (e) {
      console.warn('[IdleTimer] keep-alive ping failed:', e);
    } finally {
      setIsExtending(false);
    }
  }, []);

  const handleManualLogout = async () => {
    setShowWarning(false);
    try {
      localStorage.removeItem('iochunt_last_active');
      if (logout) {
        await logout();
      } else {
        localStorage.removeItem('iochunt_user');
      }
    } catch (_) {}
    window.location.href = '/login?reason=idle_timeout';
  };

  // Activity listeners: Listen for user interaction
  useEffect(() => {
    if (!user || idleTimeoutMins <= 0) {
      setShowWarning(false);
      return;
    }

    // Initialize last active timestamp safely
    const now = Date.now();
    const stored = localStorage.getItem('iochunt_last_active');
    const parsed = stored ? parseInt(stored, 10) : NaN;
    const maxAllowedAgeMs = idleTimeoutMins * 60 * 1000;

    // Only accept stored timestamp if it is recent (within the active idle window)
    if (!isNaN(parsed) && parsed > 0 && (now - parsed) < maxAllowedAgeMs) {
      lastActiveRef.current = parsed;
    } else {
      lastActiveRef.current = now;
      try {
        localStorage.setItem('iochunt_last_active', String(now));
      } catch (_) {}
    }

    // When the warning popup is active, clicking ANYWHERE on the page, typing, or moving mouse
    // immediately dismisses the notification and resumes the active session!
    const events = ['mousedown', 'click', 'keydown', 'scroll', 'touchstart'];
    const handleInteraction = () => {
      if (showWarningRef.current) {
        handleActivityResume();
      } else {
        updateActivity();
      }
    };

    const handleMouseMove = (e) => {
      // Require > 5px movement to filter out desk vibrations / sensor micro-jitter
      const dx = Math.abs(e.clientX - lastMousePosRef.current.x);
      const dy = Math.abs(e.clientY - lastMousePosRef.current.y);
      if (dx < 5 && dy < 5) return;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      if (showWarningRef.current) {
        handleActivityResume();
      } else {
        updateActivity();
      }
    };

    events.forEach(evt => window.addEventListener(evt, handleInteraction, { passive: true }));
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // Listen to activity across multiple open tabs
    const handleStorage = (e) => {
      if (e.key === 'iochunt_last_active' && e.newValue) {
        const val = parseInt(e.newValue, 10);
        if (!isNaN(val)) {
          lastActiveRef.current = val;
          if (showWarningRef.current) {
            setShowWarning(false);
          }
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, handleInteraction));
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('storage', handleStorage);
    };
  }, [user?.id, idleTimeoutMins, updateActivity, handleActivityResume]);

  // Interval check every second
  useEffect(() => {
    if (!user || idleTimeoutMins <= 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const lastActive = lastActiveRef.current || now;
      const elapsedSec = Math.floor((now - lastActive) / 1000);
      const totalSec = idleTimeoutMins * 60;
      const remaining = totalSec - elapsedSec;

      // Warning window: show in the last 60 seconds (or half of totalSec if total <= 90s)
      const warnWindow = totalSec <= 90 ? Math.max(15, Math.floor(totalSec / 2)) : 60;

      if (remaining <= 0) {
        clearInterval(interval);
        setShowWarning(false);
        try {
          localStorage.removeItem('iochunt_last_active');
        } catch (_) {}
        if (logout) {
          axios.post('/api/auth/logout?reason=inactivity_timeout').catch(() => {});
          logout().catch(() => {});
        } else {
          localStorage.removeItem('iochunt_user');
        }
        window.location.href = '/login?reason=idle_timeout';
      } else if (remaining <= warnWindow) {
        setShowWarning(true);
        setRemainingSeconds(remaining);
      } else {
        setShowWarning(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [user?.id, idleTimeoutMins, logout]);

  if (!showWarning || idleTimeoutMins <= 0) return null;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const totalWindow = idleTimeoutMins * 60 <= 90 ? Math.max(15, Math.floor((idleTimeoutMins * 60) / 2)) : 60;
  const progressPercent = Math.min(100, Math.max(0, (remainingSeconds / Math.max(1, totalWindow)) * 100));

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 999999,
        width: '380px',
        maxWidth: 'calc(100vw - 40px)',
        background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.94))',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(245, 158, 11, 0.45)',
        boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.6), 0 0 25px rgba(245, 158, 11, 0.2)',
        borderRadius: '12px',
        overflow: 'hidden',
        color: '#f8fafc',
        animation: 'slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      }}
    >
      {/* Dynamic Keyframe Injection for smooth slide in */}
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(110%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>

      {/* Top Countdown Progress Strip */}
      <div
        style={{
          width: `${progressPercent}%`,
          height: '3px',
          background: remainingSeconds <= 20 ? '#ef4444' : '#f59e0b',
          transition: 'width 1s linear, background 0.3s ease'
        }}
      />

      <div style={{ padding: '16px 18px' }}>
        {/* Header with icon, title, countdown badge and close */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                background: remainingSeconds <= 20 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                border: `1px solid ${remainingSeconds <= 20 ? 'rgba(239, 68, 68, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: remainingSeconds <= 20 ? '#f87171' : '#fbbf24',
                flexShrink: 0
              }}
            >
              <Clock size={16} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '13px', color: '#f8fafc', letterSpacing: '-0.2px' }}>
                Idle Timeout Alert
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>
                {idleTimeoutMins}m Inactivity Limit
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '13px',
                fontWeight: 800,
                color: remainingSeconds <= 20 ? '#f87171' : '#fbbf24',
                background: 'rgba(0, 0, 0, 0.35)',
                padding: '3px 8px',
                borderRadius: '6px',
                border: `1px solid ${remainingSeconds <= 20 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
              }}
            >
              {timeFormatted}
            </span>

            <button
              onClick={handleActivityResume}
              title="Dismiss & stay active"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'color 0.15s'
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Message */}
        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#cbd5e1', lineHeight: 1.45 }}>
          You have been idle. Auto-logging out in <strong style={{ color: remainingSeconds <= 20 ? '#f87171' : '#fbbf24' }}>{remainingSeconds}s</strong>. Move mouse or click anywhere to stay signed in.
        </p>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={handleManualLogout}
            style={{
              flex: 1,
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              color: '#94a3b8',
              padding: '7px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              transition: 'all 0.15s'
            }}
          >
            <LogOut size={13} />
            Log Out Now
          </button>

          <button
            type="button"
            onClick={handleActivityResume}
            disabled={isExtending}
            style={{
              flex: 1.4,
              background: '#2563eb',
              border: 'none',
              color: '#ffffff',
              padding: '7px 12px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: isExtending ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)',
              transition: 'all 0.15s'
            }}
          >
            <CheckCircle2 size={13} />
            {isExtending ? 'Extending...' : 'I\'m Here / Stay Active'}
          </button>
        </div>
      </div>
    </div>
  );
}
