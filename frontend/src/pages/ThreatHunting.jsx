import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Radar, Key, RefreshCw, Database,
  ExternalLink, Copy, Check, Eye, EyeOff, Search,
  Server, CheckCircle2, ShieldAlert, X, Info, Activity, Filter, RotateCcw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import PremiumCard from '../components/PremiumCard';

export default function ThreatHunting() {
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase().includes('admin') || user?.role?.toLowerCase().includes('superadmin');

  // Page state
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [activeTab, setActiveTab] = useState('matches'); // 'matches' | 'indicators'

  // Setup Wizard State
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedFeeds, setSelectedFeeds] = useState({
    threatfox: true,
    malwarebazaar: true,
    urlhaus: true
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Detail Modal State (Popup on row click)
  const [selectedDetail, setSelectedDetail] = useState(null);

  // Matches State (Tab 1)
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesTotal, setMatchesTotal] = useState(0);
  const [matchesPage, setMatchesPage] = useState(1);
  const [matchesTotalPages, setMatchesTotalPages] = useState(1);
  const [matchesSearch, setMatchesSearch] = useState('');
  const [matchesType, setMatchesType] = useState('all');
  const [matchesSeverity, setMatchesSeverity] = useState('all');
  const [matchesSourceType, setMatchesSourceType] = useState('all');
  const [matchesTimeRange, setMatchesTimeRange] = useState('24h');

  // Indicators State (Tab 2)
  const [indicators, setIndicators] = useState([]);
  const [indicatorsLoading, setIndicatorsLoading] = useState(false);
  const [indicatorsTotal, setIndicatorsTotal] = useState(0);
  const [indicatorsPage, setIndicatorsPage] = useState(1);
  const [indicatorsTotalPages, setIndicatorsTotalPages] = useState(1);
  const [indicatorsSearch, setIndicatorsSearch] = useState('');
  const [indicatorsType, setIndicatorsType] = useState('all');
  const [indicatorsSource, setIndicatorsSource] = useState('all');
  const [indicatorsStatus, setIndicatorsStatus] = useState('all');
  const [indicatorsConfidence, setIndicatorsConfidence] = useState('all');

  // Copied indicator state for visual feedback
  const [copiedItem, setCopiedItem] = useState(null);

  // 1. Fetch Status
  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/threat-hunting/status');
      setStatus(res.data);
      if (res.data.feeds) {
        setSelectedFeeds(res.data.feeds);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load Threat Hunting status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // 2. Fetch Matches
  const fetchMatches = async (page = 1) => {
    try {
      setMatchesLoading(true);
      const res = await axios.get('/api/threat-hunting/matches', {
        params: {
          page,
          limit: 20,
          search: matchesSearch,
          type: matchesType,
          severity: matchesSeverity,
          sourceType: matchesSourceType,
          timeRange: matchesTimeRange
        }
      });
      setMatches(res.data.matches || []);
      setMatchesTotal(res.data.total || 0);
      setMatchesPage(res.data.page || 1);
      setMatchesTotalPages(res.data.totalPages || 1);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.details || err.response?.data?.error || 'Failed to load threat detection matches');
    } finally {
      setMatchesLoading(false);
    }
  };

  // 3. Fetch Indicators
  const fetchIndicators = async (page = 1) => {
    try {
      setIndicatorsLoading(true);
      const res = await axios.get('/api/threat-hunting/indicators', {
        params: {
          page,
          limit: 25,
          search: indicatorsSearch,
          type: indicatorsType,
          source: indicatorsSource,
          status: indicatorsStatus,
          confidence: indicatorsConfidence
        }
      });
      setIndicators(res.data.indicators || []);
      setIndicatorsTotal(res.data.total || 0);
      setIndicatorsPage(res.data.page || 1);
      setIndicatorsTotalPages(res.data.totalPages || 1);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to load threat indicators');
    } finally {
      setIndicatorsLoading(false);
    }
  };

  // Triggers when status is configured or active tab switches / filters change
  useEffect(() => {
    if (status?.configured) {
      if (activeTab === 'matches') {
        fetchMatches(1);
      } else {
        fetchIndicators(1);
      }
    }
  }, [
    status?.configured,
    activeTab,
    matchesType,
    matchesSeverity,
    matchesSourceType,
    matchesTimeRange,
    indicatorsType,
    indicatorsSource,
    indicatorsStatus,
    indicatorsConfidence
  ]);

  // Handle Save / Setup API Key
  const handleSaveConfig = async (e) => {
    if (e) e.preventDefault();
    if (!apiKeyInput.trim() && !status?.configured) {
      return toast.error('Please enter your Abuse.ch ThreatFox Auth-Key');
    }

    try {
      setIsVerifying(true);
      const res = await axios.post('/api/threat-hunting/config', {
        apiKey: apiKeyInput.trim() || undefined,
        feeds: selectedFeeds
      });

      toast.success(res.data.message || 'Threat Intelligence Feeds Connected!');
      setShowSettingsModal(false);
      setApiKeyInput('');
      await fetchStatus();
      setActiveTab('matches');
      fetchMatches(1);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.details || 'Failed to verify API key with Abuse.ch';
      toast.error(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle Manual Sync
  const handleManualSync = async () => {
    try {
      setIsSyncing(true);
      const res = await axios.post('/api/threat-hunting/sync-now');
      toast.success(res.data.message || 'Threat intelligence sync started in background!');
      setTimeout(() => {
        fetchStatus();
        if (activeTab === 'matches') fetchMatches(matchesPage);
        else fetchIndicators(indicatorsPage);
        setIsSyncing(false);
      }, 3000);
    } catch (err) {
      setIsSyncing(false);
      toast.error(err.response?.data?.error || 'Failed to trigger sync');
    }
  };

  // Copy helper
  const copyIndicator = (val) => {
    if (!val) return;
    navigator.clipboard.writeText(val);
    setCopiedItem(val);
    setTimeout(() => setCopiedItem(null), 2000);
    toast.success('Indicator copied to clipboard');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '16px' }}>
        <div style={{ width: '36px', height: '36px', border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: 'var(--muted)', fontSize: '13px', fontWeight: 600 }}>Loading Threat Hunting Engine...</p>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // 1. SETUP WIZARD (When API Key is not configured)
  // ════════════════════════════════════════════════════════════════
  if (!status?.configured) {
    return (
      <div style={{ maxWidth: '820px', margin: '40px auto', padding: '0 20px', width: '100%' }}>
        {/* Header Hero */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex',
            padding: '16px',
            borderRadius: '20px',
            background: 'rgba(37,99,235,0.08)',
            border: '1px solid rgba(37,99,235,0.2)',
            marginBottom: '16px'
          }}>
            <Radar size={40} color="#3b82f6" />
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px', letterSpacing: '-0.5px' }}>
            Automated Threat Intelligence & Hunting
          </h1>
          <p style={{ color: 'var(--muted2)', fontSize: '14px', maxWidth: '620px', margin: '0 auto', lineHeight: '1.6' }}>
            Connect verified threat feeds to automatically scan network logs and endpoint processes across all systems in real-time.
          </p>
        </div>

        {/* Setup Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.04)',
          position: 'relative'
        }}>
          <form onSubmit={handleSaveConfig}>
            {/* Step 1: Abuse.ch Key */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <Key size={16} color="#3b82f6" /> Abuse.ch ThreatFox Auth-Key
                </label>
                <a
                  href="https://threatfox.abuse.ch/"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                >
                  Get Free Key <ExternalLink size={12} />
                </a>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Paste your 32-character Auth-Key here..."
                  style={{
                    width: '100%',
                    padding: '12px 42px 12px 14px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '14px',
                    fontFamily: 'var(--mono)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '8px', lineHeight: '1.4' }}>
                Key is validated live with Abuse.ch, encrypted using <strong>AES-256-GCM</strong>, and stored securely on Central Server.
              </p>
            </div>

            {/* Step 2: Feeds Selection */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '12px', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Feeds Included in Real-Time Engine
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                {/* ThreatFox */}
                <div style={{
                  padding: '16px',
                  borderRadius: '10px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>ThreatFox C2</span>
                    <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: 'rgba(59,130,246,0.15)', color: '#3b82f6', fontFamily: 'var(--mono)' }}>Auth-Key</span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--muted2)', margin: 0, lineHeight: '1.4' }}>C2 IP Addresses, Botnet Domains & Hash Indicators.</p>
                </div>

                {/* MalwareBazaar */}
                <div style={{
                  padding: '16px',
                  borderRadius: '10px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>MalwareBazaar</span>
                    <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontFamily: 'var(--mono)' }}>Free Feed</span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--muted2)', margin: 0, lineHeight: '1.4' }}>Known Malicious Executable Binary SHA256 Hashes.</p>
                </div>

                {/* URLhaus */}
                <div style={{
                  padding: '16px',
                  borderRadius: '10px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>URLhaus</span>
                    <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontFamily: 'var(--mono)' }}>Free Feed</span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--muted2)', margin: 0, lineHeight: '1.4' }}>Malicious Distribution Hostnames and IP Addresses.</p>
                </div>
              </div>
            </div>

            {/* Architecture Banner */}
            <div style={{
              background: 'rgba(59,130,246,0.05)',
              border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: '10px',
              padding: '14px 16px',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
              marginBottom: '24px'
            }}>
              <Server size={18} color="#3b82f6" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '12px', color: 'var(--muted2)', lineHeight: '1.5' }}>
                <strong style={{ color: 'var(--text)' }}>Single-Point Architecture:</strong> Configured on the Central Server. Branch Aggregators forward syslog and endpoint telemetry to Central for automated real-time threat detection.
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isVerifying || !isAdmin}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: '8px',
                border: 'none',
                background: '#2563eb',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: (isVerifying || !isAdmin) ? 'not-allowed' : 'pointer',
                opacity: (isVerifying || !isAdmin) ? 0.7 : 1,
                boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
                transition: 'all 0.2s',
                fontFamily: 'var(--sans)'
              }}
            >
              {isVerifying ? (
                <>
                  <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Verifying with Abuse.ch & Encrypting...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>lock</span> Verify, Encrypt & Activate Threat Engine
                </>
              )}
            </button>
            {!isAdmin && (
              <p style={{ fontSize: '12px', color: '#ef4444', textAlign: 'center', marginTop: '10px' }}>
                * Admin permissions required to configure Threat Intelligence.
              </p>
            )}
          </form>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // 2. ACTIVE DASHBOARD MODE
  // ════════════════════════════════════════════════════════════════
  return (
    <div style={{ width: '100%', paddingBottom: '40px', position: 'relative' }}>
      {/* Top Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '20px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text)', margin: 0, letterSpacing: '-0.5px' }}>
              Threat Hunting & Threat Intelligence
            </h1>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              borderRadius: '20px',
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.25)',
              color: '#22c55e',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'var(--mono)'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              LIVE INGESTION
            </div>
          </div>
          <p style={{ color: 'var(--muted2)', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>
            Real-time ThreatFox, MalwareBazaar & URLhaus matching across all endpoints & branch firewalls.
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isAdmin && (
            <button
              onClick={() => setShowSettingsModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '6px',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Key size={14} /> Feed Settings
            </button>
          )}

          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '6px',
              background: '#2563eb',
              border: 'none',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: isSyncing ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 6px rgba(37,99,235,0.3)',
              transition: 'all 0.2s',
              opacity: isSyncing ? 0.7 : 1
            }}
          >
            <RefreshCw size={13} style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }} />
            {isSyncing ? 'Syncing...' : 'Sync Feeds Now'}
          </button>
        </div>
      </div>

      {/* 4 Premium Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <PremiumCard
          label="Active Threat Indicators"
          value={status?.stats?.total_iocs?.toLocaleString() || '0'}
          color="#3b82f6"
          icon="memory"
          subtitle="Real-time multi-feed threat intelligence"
        />
        <PremiumCard
          label="Threat Matches (24h)"
          value={status?.stats?.matches_today?.toLocaleString() || '0'}
          color="#ef4444"
          icon="crisis_alert"
          subtitle="Flagged CRITICAL with [THREAT DANGER]"
        />
        <PremiumCard
          label="Malicious C2 IPs & Domains"
          value={((status?.stats?.ips || 0) + (status?.stats?.domains || 0)).toLocaleString()}
          color="#a855f7"
          icon="public"
          subtitle={`${status?.stats?.ips?.toLocaleString() || 0} IPs · ${status?.stats?.domains?.toLocaleString() || 0} Domains`}
        />
        <PremiumCard
          label="Executable Hashes (SHA256)"
          value={status?.stats?.hashes?.toLocaleString() || '0'}
          color="#eab308"
          icon="fingerprint"
          subtitle="60-Day rolling retention auto-purged"
        />
      </div>

      {/* Tabs Navigation */}
      <div style={{
        display: 'flex',
        gap: '4px',
        borderBottom: '1px solid var(--border)',
        marginBottom: '20px'
      }}>
        <button
          onClick={() => setActiveTab('matches')}
          style={{
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'matches' ? '2px solid #2563eb' : '2px solid transparent',
            color: activeTab === 'matches' ? 'var(--text)' : 'var(--muted)',
            fontWeight: activeTab === 'matches' ? 700 : 500,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontFamily: 'var(--sans)'
          }}
        >
          <ShieldAlert size={15} color={activeTab === 'matches' ? '#ef4444' : 'currentColor'} />
          Threat Detections (Matches)
          {status?.stats?.matches_today > 0 && (
            <span style={{
              padding: '1px 6px',
              borderRadius: '10px',
              background: 'rgba(239,68,68,0.15)',
              color: '#ef4444',
              fontSize: '11px',
              fontWeight: 800,
              fontFamily: 'var(--mono)'
            }}>
              {status.stats.matches_today}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('indicators')}
          style={{
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'indicators' ? '2px solid #2563eb' : '2px solid transparent',
            color: activeTab === 'indicators' ? 'var(--text)' : 'var(--muted)',
            fontWeight: activeTab === 'indicators' ? 700 : 500,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontFamily: 'var(--sans)'
          }}
        >
          <Database size={15} color={activeTab === 'indicators' ? '#3b82f6' : 'currentColor'} />
          Threat Database (Feed Indicators)
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          TAB 1: THREAT DETECTIONS (MATCHES)
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'matches' && (
        <div>
          {/* Filters Bar */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '12px',
            justifyContent: 'space-between'
          }}>
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1', minWidth: '220px', maxWidth: '320px' }}>
              <Search size={14} color="var(--muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search matched IP, domain, hash, device..."
                value={matchesSearch}
                onChange={(e) => setMatchesSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchMatches(1)}
                style={{
                  width: '100%',
                  padding: '7px 12px 7px 34px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  fontSize: '12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'var(--sans)'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Type Filter */}
              <select
                value={matchesType}
                onChange={(e) => setMatchesType(e.target.value)}
                style={{
                  padding: '6px 10px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  fontSize: '12px',
                  outline: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--sans)'
                }}
              >
                <option value="all">All Types</option>
                <option value="ip">IP Address</option>
                <option value="domain">Domain Name</option>
                <option value="sha256">SHA256 Hash</option>
              </select>

              {/* Source Engine Filter */}
              <select
                value={matchesSourceType}
                onChange={(e) => setMatchesSourceType(e.target.value)}
                style={{
                  padding: '6px 10px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  fontSize: '12px',
                  outline: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--sans)'
                }}
              >
                <option value="all">All Sources</option>
                <option value="endpoint">Agent Endpoints</option>
                <option value="firewall">Firewall Network</option>
              </select>

              {/* Severity Filter */}
              <select
                value={matchesSeverity}
                onChange={(e) => setMatchesSeverity(e.target.value)}
                style={{
                  padding: '6px 10px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  fontSize: '12px',
                  outline: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--sans)'
                }}
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical Only</option>
              </select>

              {/* Time Range Filter */}
              <select
                value={matchesTimeRange}
                onChange={(e) => setMatchesTimeRange(e.target.value)}
                style={{
                  padding: '6px 10px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  fontSize: '12px',
                  outline: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--sans)'
                }}
              >
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="60d">Last 60 Days</option>
              </select>

              <button
                onClick={() => fetchMatches(1)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: '#2563eb',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Filter size={12} /> Filter
              </button>

              {(matchesSearch || matchesType !== 'all' || matchesSeverity !== 'all' || matchesSourceType !== 'all' || matchesTimeRange !== '24h') && (
                <button
                  onClick={() => {
                    setMatchesSearch('');
                    setMatchesType('all');
                    setMatchesSeverity('all');
                    setMatchesSourceType('all');
                    setMatchesTimeRange('24h');
                  }}
                  title="Reset all filters"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    color: 'var(--muted)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <RotateCcw size={12} /> Reset
                </button>
              )}
            </div>
          </div>

          {/* Matches Table */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            overflow: 'hidden'
          }}>
            {matchesLoading ? (
              <div style={{ padding: '60px', textAlign: 'center', color: 'var(--muted)' }}>
                <div style={{ width: '30px', height: '30px', border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Scanning matched logs across all endpoints...</span>
              </div>
            ) : matches.length === 0 ? (
              <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <CheckCircle2 size={26} color="#22c55e" />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>
                  No Known Threat Matches Detected
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--muted)', maxWidth: '440px', margin: '0 auto', lineHeight: '1.5' }}>
                  All network connections and running endpoint executables are clean against the active Abuse.ch C2 and malware feeds.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                      <th style={{ width: '16%', minWidth: '150px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Timestamp</th>
                      <th style={{ width: '12%', minWidth: '110px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Severity</th>
                      <th style={{ width: '18%', minWidth: '150px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Endpoint / Device</th>
                      <th style={{ width: '14%', minWidth: '120px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Aggregator / Branch</th>
                      <th style={{ width: '20%', minWidth: '170px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Matched Indicator</th>
                      <th style={{ width: '20%', minWidth: '180px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Threat Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((item, idx) => (
                      <tr
                        key={idx}
                        onClick={() => setSelectedDetail({ type: 'match', data: item })}
                        title="Click to view full threat match details"
                        style={{
                          borderBottom: '1px solid var(--border)',
                          transition: 'background 0.15s ease',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        {/* Timestamp */}
                        <td style={{ padding: '12px 16px', color: 'var(--muted2)', whiteSpace: 'nowrap', fontSize: '12px', fontFamily: 'var(--mono)' }}>
                          {item.ts ? new Date(item.ts).toLocaleString() : 'Just now'}
                        </td>

                        {/* Severity */}
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: 'rgba(239,68,68,0.12)',
                            color: '#ef4444',
                            border: '1px solid rgba(239,68,68,0.25)',
                            fontSize: '10px',
                            fontWeight: 800,
                            fontFamily: 'var(--mono)'
                          }}>
                            {item.severity ? item.severity.toUpperCase() : 'CRITICAL'}
                          </span>
                        </td>

                        {/* Endpoint */}
                        <td style={{ padding: '12px 16px', color: 'var(--text)', fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: item.source_type === 'firewall' ? '#f97316' : '#3b82f6' }}>
                              {item.source_type === 'firewall' ? 'local_fire_department' : 'computer'}
                            </span>
                            {item.endpoint}
                          </div>
                          {item.src_ip && item.src_ip !== 'local' && (
                            <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Src: {item.src_ip}</span>
                          )}
                        </td>

                        {/* Branch / Aggregator */}
                        <td style={{ padding: '12px 16px', color: 'var(--text)' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: '11px', fontFamily: 'var(--mono)' }}>
                            {item.aggregator_name || 'direct'}
                          </span>
                        </td>

                        {/* Indicator */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              fontFamily: 'var(--mono)',
                              color: '#ef4444',
                              fontWeight: 700,
                              background: 'rgba(239,68,68,0.08)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '12px'
                            }}>
                              {item.indicator && item.indicator.length > 28 ? `${item.indicator.slice(0, 24)}...` : item.indicator}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyIndicator(item.indicator);
                              }}
                              title="Copy Indicator"
                              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '2px' }}
                            >
                              {copiedItem === item.indicator ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                            </button>
                          </div>
                          <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                            Type: {item.indicator_type}
                          </span>
                        </td>

                        {/* Details */}
                        <td style={{ padding: '12px 16px', color: 'var(--muted2)', maxWidth: '360px' }}>
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px' }}>
                            {item.details}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {matchesTotalPages > 1 && (
              <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                  Showing {matches.length} of {matchesTotal} detections
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    disabled={matchesPage <= 1}
                    onClick={() => fetchMatches(matchesPage - 1)}
                    style={{
                      padding: '5px 10px',
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: matchesPage <= 1 ? 'var(--muted)' : 'var(--text)',
                      cursor: matchesPage <= 1 ? 'not-allowed' : 'pointer',
                      fontSize: '11px',
                      fontWeight: 600
                    }}
                  >
                    Previous
                  </button>
                  <span style={{ padding: '5px 10px', color: 'var(--muted2)', fontSize: '11px', fontFamily: 'var(--mono)' }}>
                    Page {matchesPage} of {matchesTotalPages}
                  </span>
                  <button
                    disabled={matchesPage >= matchesTotalPages}
                    onClick={() => fetchMatches(matchesPage + 1)}
                    style={{
                      padding: '5px 10px',
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: matchesPage >= matchesTotalPages ? 'var(--muted)' : 'var(--text)',
                      cursor: matchesPage >= matchesTotalPages ? 'not-allowed' : 'pointer',
                      fontSize: '11px',
                      fontWeight: 600
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB 2: THREAT DATABASE (FEED INDICATORS)
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'indicators' && (
        <div>
          {/* Filters Bar */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '12px',
            justifyContent: 'space-between'
          }}>
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1', minWidth: '240px', maxWidth: '380px' }}>
              <Search size={14} color="var(--muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search indicator value or malware family..."
                value={indicatorsSearch}
                onChange={(e) => setIndicatorsSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchIndicators(1)}
                style={{
                  width: '100%',
                  padding: '7px 12px 7px 34px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  fontSize: '12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'var(--sans)'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Type Filter */}
              <select
                value={indicatorsType}
                onChange={(e) => setIndicatorsType(e.target.value)}
                style={{
                  padding: '6px 10px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  fontSize: '12px',
                  outline: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--sans)'
                }}
              >
                <option value="all">All Types</option>
                <option value="ip">IP Address</option>
                <option value="domain">Domain Name</option>
                <option value="sha256">SHA256 Hash</option>
              </select>

              {/* Feed Filter */}
              <select
                value={indicatorsSource}
                onChange={(e) => setIndicatorsSource(e.target.value)}
                style={{
                  padding: '6px 10px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  fontSize: '12px',
                  outline: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--sans)'
                }}
              >
                <option value="all">All Feed Sources</option>
                <option value="threatfox">ThreatFox C2</option>
                <option value="malwarebazaar">MalwareBazaar</option>
                <option value="urlhaus">URLhaus</option>
              </select>

              {/* Status Filter */}
              <select
                value={indicatorsStatus}
                onChange={(e) => setIndicatorsStatus(e.target.value)}
                style={{
                  padding: '6px 10px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  fontSize: '12px',
                  outline: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--sans)'
                }}
              >
                <option value="all">All Statuses</option>
                <option value="online">Online / Active</option>
                <option value="offline">Offline / Dormant</option>
              </select>

              {/* Confidence Filter */}
              <select
                value={indicatorsConfidence}
                onChange={(e) => setIndicatorsConfidence(e.target.value)}
                style={{
                  padding: '6px 10px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  fontSize: '12px',
                  outline: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--sans)'
                }}
              >
                <option value="all">All Confidence</option>
                <option value="100">100% Verified</option>
                <option value="high">≥ 90% High</option>
                <option value="medium">70% – 85% Medium</option>
                <option value="50">≤ 50% Low / Caution</option>
              </select>

              <button
                onClick={() => fetchIndicators(1)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: '#2563eb',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Filter size={12} /> Filter
              </button>

              {(indicatorsSearch || indicatorsType !== 'all' || indicatorsSource !== 'all' || indicatorsStatus !== 'all' || indicatorsConfidence !== 'all') && (
                <button
                  onClick={() => {
                    setIndicatorsSearch('');
                    setIndicatorsType('all');
                    setIndicatorsSource('all');
                    setIndicatorsStatus('all');
                    setIndicatorsConfidence('all');
                  }}
                  title="Reset all filters"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    color: 'var(--muted)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <RotateCcw size={12} /> Reset
                </button>
              )}
            </div>
          </div>

          {/* Indicators Table */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            overflow: 'hidden'
          }}>
            {indicatorsLoading ? (
              <div style={{ padding: '60px', textAlign: 'center', color: 'var(--muted)' }}>
                <div style={{ width: '30px', height: '30px', border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Loading threat indicators database...</span>
              </div>
            ) : indicators.length === 0 ? (
              <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                <Database size={32} color="var(--muted)" style={{ margin: '0 auto 12px' }} />
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>
                  No Threat Indicators Found
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
                  Click "Sync Feeds Now" above to download the latest threat indicators from Abuse.ch.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                      <th style={{ width: '27%', minWidth: '220px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Indicator Value</th>
                      <th style={{ width: '18%', minWidth: '160px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Type & Status</th>
                      <th style={{ width: '23%', minWidth: '180px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Malware Family</th>
                      <th style={{ width: '13%', minWidth: '110px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Feed Provider</th>
                      <th style={{ width: '10%', minWidth: '100px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Confidence</th>
                      <th style={{ width: '9%', minWidth: '95px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px', textAlign: 'right' }}>Last Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indicators.map((ioc, idx) => (
                      <tr
                        key={idx}
                        onClick={() => setSelectedDetail({ type: 'indicator', data: ioc })}
                        title="Click to view full threat intelligence details"
                        style={{
                          borderBottom: '1px solid var(--border)',
                          transition: 'background 0.15s ease',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        {/* Indicator Value */}
                        <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              title={ioc.ioc_value}
                              style={{
                                fontFamily: 'var(--mono)',
                                color: 'var(--text)',
                                fontWeight: 600,
                                fontSize: '12px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '240px'
                              }}
                            >
                              {ioc.ioc_value}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyIndicator(ioc.ioc_value);
                              }}
                              title="Copy Indicator"
                              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '2px', flexShrink: 0 }}
                            >
                              {copiedItem === ioc.ioc_value ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </td>

                        {/* Type & Inline Status Badge */}
                        <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background: ioc.ioc_type === 'ip' ? 'rgba(59,130,246,0.12)' : ioc.ioc_type === 'domain' ? 'rgba(168,85,247,0.12)' : 'rgba(234,179,8,0.12)',
                              color: ioc.ioc_type === 'ip' ? '#3b82f6' : ioc.ioc_type === 'domain' ? '#a855f7' : '#eab308',
                              fontSize: '10px',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              fontFamily: 'var(--mono)'
                            }}>
                              {ioc.ioc_type}
                            </span>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: (ioc.status === 'online' || ioc.status === 'active') ? 'rgba(34,197,94,0.1)' : ioc.status === 'offline' ? 'rgba(100,116,139,0.15)' : 'rgba(148,163,184,0.1)',
                              color: (ioc.status === 'online' || ioc.status === 'active') ? '#22c55e' : ioc.status === 'offline' ? '#94a3b8' : 'var(--muted)',
                              border: `1px solid ${(ioc.status === 'online' || ioc.status === 'active') ? 'rgba(34,197,94,0.25)' : ioc.status === 'offline' ? 'rgba(100,116,139,0.25)' : 'var(--border)'}`,
                              fontSize: '10px',
                              fontWeight: 600,
                              fontFamily: 'var(--mono)',
                              textTransform: 'capitalize'
                            }}>
                              <span style={{
                                width: '5px',
                                height: '5px',
                                borderRadius: '50%',
                                background: (ioc.status === 'online' || ioc.status === 'active') ? '#22c55e' : ioc.status === 'offline' ? '#94a3b8' : '#64748b'
                              }} />
                              {ioc.status || 'online'}
                            </span>
                          </div>
                        </td>

                        {/* Malware Family */}
                        <td style={{ padding: '12px 16px', color: 'var(--text)', verticalAlign: 'middle' }}>
                          <span
                            title={ioc.malware_family || 'Generic C2 / Malware'}
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: 'var(--surface2)',
                              border: '1px solid var(--border)',
                              fontSize: '11px',
                              fontWeight: 600,
                              maxWidth: '190px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              display: 'inline-block',
                              verticalAlign: 'middle'
                            }}
                          >
                            {ioc.malware_family || 'Generic C2 / Malware'}
                          </span>
                        </td>

                        {/* Provider */}
                        <td style={{ padding: '12px 16px', color: 'var(--muted2)', verticalAlign: 'middle' }}>
                          <span style={{ fontSize: '12px', textTransform: 'capitalize', fontWeight: 500 }}>
                            {ioc.source_feed || ioc.source}
                          </span>
                        </td>

                        {/* Confidence */}
                        <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              color: (ioc.confidence_level || 100) >= 90 ? '#22c55e' : (ioc.confidence_level || 100) >= 75 ? '#eab308' : '#ef4444',
                              fontWeight: 700,
                              fontFamily: 'var(--mono)',
                              fontSize: '12px'
                            }}>
                              {ioc.confidence_level || 100}%
                            </span>
                            <span style={{
                              fontSize: '9px',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              background: (ioc.confidence_level || 100) >= 90 ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)',
                              color: (ioc.confidence_level || 100) >= 90 ? '#22c55e' : '#eab308',
                              fontWeight: 700,
                              letterSpacing: '0.3px',
                              textTransform: 'uppercase'
                            }}>
                              {(ioc.confidence_level || 100) >= 90 ? 'High' : 'Med'}
                            </span>
                          </div>
                        </td>

                        {/* Last Seen */}
                        <td style={{ padding: '12px 16px', color: 'var(--muted)', whiteSpace: 'nowrap', fontSize: '12px', fontFamily: 'var(--mono)', verticalAlign: 'middle', textAlign: 'right' }}>
                          {ioc.last_seen ? new Date(ioc.last_seen).toLocaleDateString() : 'Active'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {indicatorsTotalPages > 1 && (
              <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                  Showing {indicators.length} of {indicatorsTotal} indicators
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    disabled={indicatorsPage <= 1}
                    onClick={() => fetchIndicators(indicatorsPage - 1)}
                    style={{
                      padding: '5px 10px',
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: indicatorsPage <= 1 ? 'var(--muted)' : 'var(--text)',
                      cursor: indicatorsPage <= 1 ? 'not-allowed' : 'pointer',
                      fontSize: '11px',
                      fontWeight: 600
                    }}
                  >
                    Previous
                  </button>
                  <span style={{ padding: '5px 10px', color: 'var(--muted2)', fontSize: '11px', fontFamily: 'var(--mono)' }}>
                    Page {indicatorsPage} of {indicatorsTotalPages}
                  </span>
                  <button
                    disabled={indicatorsPage >= indicatorsTotalPages}
                    onClick={() => fetchIndicators(indicatorsPage + 1)}
                    style={{
                      padding: '5px 10px',
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: indicatorsPage >= indicatorsTotalPages ? 'var(--muted)' : 'var(--text)',
                      cursor: indicatorsPage >= indicatorsTotalPages ? 'not-allowed' : 'pointer',
                      fontSize: '11px',
                      fontWeight: 600
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          SETTINGS MODAL (Reconfigure Key or Feeds)
          ════════════════════════════════════════════════════════════════ */}
      {showSettingsModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--surface-solid)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '28px',
            maxWidth: '540px',
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px', letterSpacing: '-0.3px' }}>
              Threat Intelligence Feed Settings
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--muted2)', marginBottom: '20px', lineHeight: '1.5' }}>
              Update your Abuse.ch Auth-Key or toggle individual feed sources. The key is encrypted with AES-256-GCM.
            </p>

            <form onSubmit={handleSaveConfig}>
              <div style={{ marginBottom: '18px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '6px', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>
                  Update Abuse.ch ThreatFox Auth-Key (Leave empty to keep existing)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Enter new 32-character Auth-Key..."
                    style={{
                      width: '100%',
                      padding: '10px 38px 10px 12px',
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      color: 'var(--text)',
                      fontSize: '13px',
                      fontFamily: 'var(--mono)',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                  >
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Feed Checkboxes */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '10px', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>
                  Active Feed Integrations
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedFeeds.threatfox}
                      onChange={(e) => setSelectedFeeds({ ...selectedFeeds, threatfox: e.target.checked })}
                    />
                    ThreatFox C2 Indicators (Public IPs, Domains, Hashes)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedFeeds.malwarebazaar}
                      onChange={(e) => setSelectedFeeds({ ...selectedFeeds, malwarebazaar: e.target.checked })}
                    />
                    MalwareBazaar (Executable Malware Binary Hashes)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedFeeds.urlhaus}
                      onChange={(e) => setSelectedFeeds({ ...selectedFeeds, urlhaus: e.target.checked })}
                    />
                    URLhaus (Malicious Hostnames & Distribution IPs)
                  </label>
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '6px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    color: 'var(--muted2)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifying}
                  style={{
                    padding: '7px 16px',
                    borderRadius: '6px',
                    background: '#2563eb',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: isVerifying ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isVerifying ? 'Verifying & Saving...' : 'Save & Sync'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          FULL DETAIL POPUP MODAL (Row Click on Match or Indicator)
          ════════════════════════════════════════════════════════════════ */}
      {selectedDetail && (
        <div
          onClick={() => setSelectedDetail(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(5px)',
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface-solid, var(--surface))',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '740px',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: selectedDetail.type === 'match' ? 'rgba(239,68,68,0.06)' : 'rgba(37,99,235,0.04)',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  background: selectedDetail.type === 'match' ? 'rgba(239,68,68,0.15)' : 'rgba(37,99,235,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: selectedDetail.type === 'match' ? '#ef4444' : '#3b82f6'
                }}>
                  {selectedDetail.type === 'match' ? <ShieldAlert size={18} /> : <Database size={18} />}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.2px' }}>
                    {selectedDetail.type === 'match' ? 'Threat Detection Match Details' : 'Threat Intelligence Indicator Details'}
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    {selectedDetail.type === 'match'
                      ? 'Live event match against ThreatFox / MalwareBazaar / URLhaus feed'
                      : `Ingested from ${selectedDetail.data.source_feed || selectedDetail.data.source || 'Abuse.ch'}`}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedDetail(null)}
                title="Close"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px',
                  borderRadius: '6px',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Highlight Banner / Indicator Card */}
              <div style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '220px', flex: 1 }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.6px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    {selectedDetail.type === 'match' ? 'Triggered Indicator' : 'Indicator Value'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: selectedDetail.type === 'match' ? '#ef4444' : 'var(--text)',
                      fontFamily: 'var(--mono)',
                      wordBreak: 'break-all'
                    }}>
                      {selectedDetail.type === 'match' ? selectedDetail.data.indicator : selectedDetail.data.ioc_value}
                    </span>
                    <button
                      onClick={() => copyIndicator(selectedDetail.type === 'match' ? selectedDetail.data.indicator : selectedDetail.data.ioc_value)}
                      title="Copy Indicator"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--muted)',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      {copiedItem === (selectedDetail.type === 'match' ? selectedDetail.data.indicator : selectedDetail.data.ioc_value)
                        ? <Check size={16} color="#22c55e" />
                        : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* External Actions / Search Links */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {/* VirusTotal Link */}
                  <a
                    href={`https://www.virustotal.com/gui/search/${encodeURIComponent(selectedDetail.type === 'match' ? selectedDetail.data.indicator : selectedDetail.data.ioc_value)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: 'rgba(59,130,246,0.12)',
                      border: '1px solid rgba(59,130,246,0.25)',
                      color: '#3b82f6',
                      fontSize: '11px',
                      fontWeight: 700,
                      textDecoration: 'none'
                    }}
                  >
                    <ExternalLink size={12} /> VirusTotal
                  </a>

                  {/* Feed Direct Link */}
                  {selectedDetail.data.source_feed === 'malwarebazaar' && (
                    <a
                      href={`https://bazaar.abuse.ch/sample/${selectedDetail.data.ioc_value}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '11px',
                        fontWeight: 600,
                        textDecoration: 'none'
                      }}
                    >
                      <ExternalLink size={12} /> Bazaar Sample
                    </a>
                  )}

                  {selectedDetail.data.source_feed === 'threatfox' && (
                    <a
                      href={`https://threatfox.abuse.ch/browse.php?search=ioc%3A${encodeURIComponent(selectedDetail.type === 'match' ? selectedDetail.data.indicator : selectedDetail.data.ioc_value)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Search this IOC on ThreatFox"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '11px',
                        fontWeight: 600,
                        textDecoration: 'none'
                      }}
                    >
                      <ExternalLink size={12} /> ThreatFox Intel
                    </a>
                  )}

                  {selectedDetail.data.source_feed === 'urlhaus' && (
                    <a
                      href={`https://urlhaus.abuse.ch/browse.php?search=${encodeURIComponent(selectedDetail.type === 'match' ? selectedDetail.data.indicator : selectedDetail.data.ioc_value)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Search this IOC on URLhaus"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '11px',
                        fontWeight: 600,
                        textDecoration: 'none'
                      }}
                    >
                      <ExternalLink size={12} /> URLhaus Search
                    </a>
                  )}
                </div>
              </div>

              {/* Specific Content Based on Detail Type */}
              {selectedDetail.type === 'match' ? (
                /* ── MATCH EVENT DETAILS ── */
                <div style={{ display: 'grid', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)', display: 'block', marginBottom: '4px' }}>
                        Severity
                      </span>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: 'rgba(239,68,68,0.15)',
                        color: '#ef4444',
                        fontWeight: 800,
                        fontSize: '11px',
                        fontFamily: 'var(--mono)',
                        display: 'inline-block'
                      }}>
                        {selectedDetail.data.severity ? selectedDetail.data.severity.toUpperCase() : 'CRITICAL'} [THREAT DANGER]
                      </span>
                    </div>

                    <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)', display: 'block', marginBottom: '4px' }}>
                        Detection Engine
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize' }}>
                        {selectedDetail.data.source_type === 'firewall' ? 'Firewall Traffic Filter' : 'Endpoint Sentinel Agent'}
                      </span>
                    </div>

                    <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)', display: 'block', marginBottom: '4px' }}>
                        Endpoint / Device Name
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                        {selectedDetail.data.endpoint || 'Unknown Device'}
                      </span>
                    </div>

                    <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)', display: 'block', marginBottom: '4px' }}>
                        Aggregator / Branch
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                        {selectedDetail.data.aggregator_name || 'Central Server'}
                      </span>
                    </div>

                    <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)', display: 'block', marginBottom: '4px' }}>
                        Source IP
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                        {selectedDetail.data.src_ip || 'local'}
                      </span>
                    </div>

                    <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)', display: 'block', marginBottom: '4px' }}>
                        Detection Timestamp
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                        {selectedDetail.data.ts ? new Date(selectedDetail.data.ts).toLocaleString() : 'Just now'}
                      </span>
                    </div>
                  </div>

                  {/* Raw Details / Threat Context */}
                  <div style={{ padding: '14px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)', display: 'block', marginBottom: '8px' }}>
                      Threat Message & Raw Detection Context
                    </span>
                    <pre style={{
                      margin: 0,
                      padding: '10px',
                      background: 'rgba(0,0,0,0.25)',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '11px',
                      lineHeight: '1.6',
                      fontFamily: 'var(--mono)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: '180px',
                      overflowY: 'auto'
                    }}>
                      {selectedDetail.data.details || 'No additional raw log details available'}
                    </pre>
                  </div>
                </div>
              ) : (
                /* ── FEED INDICATOR DETAILS ── */
                <div style={{ display: 'grid', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)', display: 'block', marginBottom: '4px' }}>
                        IOC Type
                      </span>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: selectedDetail.data.ioc_type === 'ip' ? 'rgba(59,130,246,0.12)' : selectedDetail.data.ioc_type === 'domain' ? 'rgba(168,85,247,0.12)' : 'rgba(234,179,8,0.12)',
                        color: selectedDetail.data.ioc_type === 'ip' ? '#3b82f6' : selectedDetail.data.ioc_type === 'domain' ? '#a855f7' : '#eab308',
                        fontSize: '11px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        fontFamily: 'var(--mono)',
                        display: 'inline-block'
                      }}>
                        {selectedDetail.data.ioc_type === 'ip' ? 'IP Address' : selectedDetail.data.ioc_type === 'domain' ? 'Domain Hostname' : 'Executable SHA256'}
                      </span>
                    </div>

                    <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)', display: 'block', marginBottom: '4px' }}>
                        Live Endpoint Status
                      </span>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: (selectedDetail.data.status === 'online' || selectedDetail.data.status === 'active') ? 'rgba(34,197,94,0.1)' : selectedDetail.data.status === 'offline' ? 'rgba(100,116,139,0.15)' : 'rgba(148,163,184,0.1)',
                        color: (selectedDetail.data.status === 'online' || selectedDetail.data.status === 'active') ? '#22c55e' : selectedDetail.data.status === 'offline' ? '#94a3b8' : 'var(--muted)',
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: 'var(--mono)',
                        textTransform: 'capitalize'
                      }}>
                        <span style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: (selectedDetail.data.status === 'online' || selectedDetail.data.status === 'active') ? '#22c55e' : selectedDetail.data.status === 'offline' ? '#94a3b8' : '#64748b'
                        }} />
                        {selectedDetail.data.status || 'online'}
                      </span>
                    </div>

                    <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)', display: 'block', marginBottom: '4px' }}>
                        Confidence Level
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontSize: '13px',
                          fontWeight: 800,
                          color: (selectedDetail.data.confidence_level || 100) >= 90 ? '#22c55e' : '#eab308',
                          fontFamily: 'var(--mono)'
                        }}>
                          {selectedDetail.data.confidence_level || 100}%
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                          {(selectedDetail.data.confidence_level || 100) >= 90 ? 'Verified High-Threat' : 'Medium Confidence'}
                        </span>
                      </div>
                    </div>

                    <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)', display: 'block', marginBottom: '4px' }}>
                        Malware Family / Signature
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>
                        {selectedDetail.data.malware_family || 'Generic C2 / Malware'}
                      </span>
                    </div>

                    <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)', display: 'block', marginBottom: '4px' }}>
                        Source Provider
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>
                        {selectedDetail.data.source_feed || selectedDetail.data.source || 'Abuse.ch Feed'}
                      </span>
                    </div>

                    <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)', display: 'block', marginBottom: '4px' }}>
                        Last Verified Date
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                        {selectedDetail.data.last_seen ? new Date(selectedDetail.data.last_seen).toLocaleString() : 'Currently Active'}
                      </span>
                    </div>
                  </div>

                  {/* Confidence Calculation & Intelligence explanation note */}
                  <div style={{ padding: '12px 16px', background: 'rgba(59,130,246,0.06)', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <Info size={16} color="#3b82f6" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: '1.5' }}>
                      <strong>Confidence Calculation:</strong> {
                        selectedDetail.data.source_feed === 'malwarebazaar'
                          ? '100% confidence indicates confirmed malicious executable binary payload verified by Abuse.ch sandbox behavioral analysis.'
                          : selectedDetail.data.source_feed === 'urlhaus'
                            ? selectedDetail.data.status === 'online'
                              ? '100% confidence indicates actively serving malicious payload distribution URLs.'
                              : '80% confidence indicates dormant or offline distribution point retained for retrospective forensics.'
                            : 'Confidence is assessed by Abuse.ch security researchers and automated threat hunting sensors (ThreatFox).'
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', background: 'var(--surface2)' }}>
              <button
                onClick={() => setSelectedDetail(null)}
                style={{
                  padding: '7px 18px',
                  borderRadius: '6px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
