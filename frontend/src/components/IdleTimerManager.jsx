import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Clock, ShieldAlert, LogOut, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function IdleTimerManager() {
  const { user, logout } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(120);
  const [isExtending, setIsExtending] = useState(false);
  const lastActiveRef = useRef(Date.now());
  const lastWriteRef = useRef(0);

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

  // Handle "Stay Logged In"
  const handleStayLoggedIn = async () => {
    setIsExtending(true);
    try {
      await axios.post('/api/auth/keep-alive');
      const now = Date.now();
      lastActiveRef.current = now;
      lastWriteRef.current = now;
      try {
        localStorage.setItem('iochunt_last_active', String(now));
      } catch (_) {}
      setShowWarning(false);
    } catch (e) {
      console.warn('[IdleTimer] keep-alive ping failed:', e);
    } finally {
      setIsExtending(false);
    }
  };

  const handleManualLogout = async () => {
    setShowWarning(false);
    try {
      localStorage.removeItem('iochunt_last_active');
      await logout();
    } catch (_) {}
    window.location.href = '/login?reason=inactivity_timeout';
  };

  // Activity listeners
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
      // Stale or expired timestamp from a previous session — reset immediately to now
      lastActiveRef.current = now;
      try {
        localStorage.setItem('iochunt_last_active', String(now));
      } catch (_) {}
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleEvent = () => {
      // If warning modal is open, don't silently dismiss just by slight mouse wiggle;
      // require explicit click on "Stay Logged In" or interaction
      if (!showWarning) {
        updateActivity();
      }
    };

    events.forEach(evt => window.addEventListener(evt, handleEvent, { passive: true }));

    // Listen to activity in other open tabs
    const handleStorage = (e) => {
      if (e.key === 'iochunt_last_active' && e.newValue) {
        const val = parseInt(e.newValue, 10);
        if (!isNaN(val)) {
          lastActiveRef.current = val;
          if (showWarning) {
            setShowWarning(false);
          }
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, handleEvent));
      window.removeEventListener('storage', handleStorage);
    };
  }, [user?.id, idleTimeoutMins, showWarning, updateActivity]);

  // Interval check every second
  useEffect(() => {
    if (!user || idleTimeoutMins <= 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const lastActive = lastActiveRef.current || now;
      const elapsedSec = Math.floor((now - lastActive) / 1000);
      const totalSec = idleTimeoutMins * 60;
      const remaining = totalSec - elapsedSec;

      if (remaining <= 0) {
        clearInterval(interval);
        setShowWarning(false);
        try {
          localStorage.removeItem('iochunt_last_active');
        } catch (_) {}
        if (logout) {
          logout().catch(() => {});
        } else {
          localStorage.removeItem('iochunt_user');
        }
        window.location.href = '/login?reason=inactivity_timeout';
      } else if (remaining <= 120) {
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
  const progressPercent = Math.min(100, Math.max(0, (remainingSeconds / 120) * 100));

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(5, 7, 15, 0.82)',
        backdropFilter: 'blur(6px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        style={{
          background: 'linear-gradient(145deg, #0d121f, #090c14)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75), 0 0 30px rgba(245, 158, 11, 0.15)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '440px',
          padding: '28px',
          color: '#f8fafc',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Progress bar countdown */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '4px',
            width: `${progressPercent}%`,
            background: remainingSeconds <= 30 ? '#ef4444' : '#f59e0b',
            transition: 'width 1s linear, background 0.3s ease'
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: remainingSeconds <= 30 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              border: `1px solid ${remainingSeconds <= 30 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: remainingSeconds <= 30 ? '#f87171' : '#fbbf24',
              flexShrink: 0
            }}
          >
            <Clock size={24} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.3px' }}>
              Session Inactivity Warning
            </h3>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              Policy: {user.session_policy || 'Standard'} ({idleTimeoutMins}m idle limit)
            </span>
          </div>
        </div>

        <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: 1.6, margin: '0 0 20px' }}>
          You have been inactive. For your security and compliance, your active dashboard session will automatically terminate in:
        </p>

        {/* Countdown display */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            background: 'rgba(0, 0, 0, 0.4)',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            marginBottom: '24px'
          }}
        >
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '38px',
              fontWeight: 900,
              letterSpacing: '2px',
              color: remainingSeconds <= 30 ? '#ef4444' : '#f59e0b'
            }}
          >
            {timeFormatted}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            onClick={handleManualLogout}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid var(--border, #334155)',
              color: '#94a3b8',
              padding: '11px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            <LogOut size={16} />
            Sign Out Now
          </button>

          <button
            type="button"
            onClick={handleStayLoggedIn}
            disabled={isExtending}
            style={{
              flex: 1.4,
              background: '#2563eb',
              border: 'none',
              color: '#ffffff',
              padding: '11px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: isExtending ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
              transition: 'all 0.2s'
            }}
          >
            <CheckCircle2 size={16} />
            {isExtending ? 'Extending...' : 'Stay Signed In'}
          </button>
        </div>
      </div>
    </div>
  );
}
