import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Radar, Key, RefreshCw, Database, 
  ExternalLink, Copy, Check, Eye, EyeOff, Search,
  Server, CheckCircle2, ShieldAlert
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

  // Matches State (Tab 1)
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesTotal, setMatchesTotal] = useState(0);
  const [matchesPage, setMatchesPage] = useState(1);
  const [matchesTotalPages, setMatchesTotalPages] = useState(1);
  const [matchesSearch, setMatchesSearch] = useState('');
  const [matchesType, setMatchesType] = useState('all');
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
          source: indicatorsSource
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

  // Triggers when status is configured or active tab switches
  useEffect(() => {
    if (status?.configured) {
      if (activeTab === 'matches') {
        fetchMatches(1);
      } else {
        fetchIndicators(1);
      }
    }
  }, [status?.configured, activeTab, matchesType, matchesTimeRange, indicatorsType, indicatorsSource]);

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
            Connect verified threat feeds to automatically scan network logs and endpoint processes across all 500+ systems in real-time with nanosecond in-memory matching.
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
                <strong style={{ color: 'var(--text)' }}>Single-Point Architecture:</strong> Entered once here on Central Server. Branch Aggregators do not need an API key; they forward compressed syslog and endpoint logs to Central where they are matched against Node.js process RAM in 5 nanoseconds.
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
            Real-time ThreatFox, MalwareBazaar & URLhaus matching across all 500+ endpoints & branch firewalls.
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
          label="RAM Indicators Cached"
          value={status?.stats?.total_iocs?.toLocaleString() || '0'}
          color="#3b82f6"
          icon="memory"
          subtitle="0.000005 ms per event lookup (~8 MB RAM)"
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
            <div style={{ position: 'relative', flex: '1', minWidth: '240px', maxWidth: '380px' }}>
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
                <option value="all">All Indicator Types</option>
                <option value="ip">IP Address</option>
                <option value="domain">Domain Name</option>
                <option value="sha256">SHA256 Hash</option>
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
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={12} /> Filter
              </button>
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
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                      <th style={{ padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Timestamp</th>
                      <th style={{ padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Severity</th>
                      <th style={{ padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Endpoint / Device</th>
                      <th style={{ padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Aggregator / Branch</th>
                      <th style={{ padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Matched Indicator</th>
                      <th style={{ padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Threat Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((item, idx) => (
                      <tr 
                        key={idx}
                        style={{ 
                          borderBottom: '1px solid var(--border)',
                          transition: 'background 0.2s'
                        }}
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
                            CRITICAL
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
                              onClick={() => copyIndicator(item.indicator)}
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

              <button
                onClick={() => fetchIndicators(1)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={12} /> Filter
              </button>
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
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                      <th style={{ padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Indicator Value</th>
                      <th style={{ padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Type</th>
                      <th style={{ padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Malware Family</th>
                      <th style={{ padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Feed Provider</th>
                      <th style={{ padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Confidence</th>
                      <th style={{ padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Last Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indicators.map((ioc, idx) => (
                      <tr 
                        key={idx}
                        style={{ 
                          borderBottom: '1px solid var(--border)',
                          transition: 'background 0.2s'
                        }}
                      >
                        {/* Indicator Value */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)', fontWeight: 600, fontSize: '12px' }}>
                              {ioc.ioc_value && ioc.ioc_value.length > 40 ? `${ioc.ioc_value.slice(0, 36)}...` : ioc.ioc_value}
                            </span>
                            <button
                              onClick={() => copyIndicator(ioc.ioc_value)}
                              title="Copy Indicator"
                              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '2px' }}
                            >
                              {copiedItem === ioc.ioc_value ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </td>

                        {/* Type */}
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '3px 8px',
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
                        </td>

                        {/* Malware Family */}
                        <td style={{ padding: '12px 16px', color: 'var(--text)' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: '11px', fontWeight: 600 }}>
                            {ioc.malware_family || 'Generic C2 / Malware'}
                          </span>
                        </td>

                        {/* Provider */}
                        <td style={{ padding: '12px 16px', color: 'var(--muted2)' }}>
                          <span style={{ fontSize: '12px', textTransform: 'capitalize', fontWeight: 500 }}>
                            {ioc.source_feed || ioc.source}
                          </span>
                        </td>

                        {/* Confidence */}
                        <td style={{ padding: '12px 16px', color: '#22c55e', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: '12px' }}>
                          {ioc.confidence_level || 100}%
                        </td>

                        {/* Last Seen */}
                        <td style={{ padding: '12px 16px', color: 'var(--muted)', whiteSpace: 'nowrap', fontSize: '12px', fontFamily: 'var(--mono)' }}>
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
    </div>
  );
}
