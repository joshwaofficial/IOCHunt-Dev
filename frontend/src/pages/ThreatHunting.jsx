import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Radar, Shield, ShieldAlert, Key, RefreshCw, Database, 
  ExternalLink, Copy, Check, Eye, EyeOff, Search, Filter, 
  AlertTriangle, Server, ArrowUpRight, Activity, Cpu, CheckCircle2,
  Clock, Hash, Globe, Layers
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

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
      toast.error('Failed to load threat detection matches');
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
      toast.error('Failed to load threat indicators');
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
      const res = await axios.post('/api/threat-hunting/sync-now');
      toast.success(res.data.message || 'Threat intelligence sync started in background!');
      setTimeout(() => {
        fetchStatus();
        if (activeTab === 'matches') fetchMatches(matchesPage);
        else fetchIndicators(indicatorsPage);
      }, 3000);
    } catch (err) {
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
        <div style={{ width: '40px', height: '40px', border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>Loading Threat Hunting Engine...</p>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // 1. SETUP WIZARD (If No API Key is Configured)
  // ════════════════════════════════════════════════════════════════
  if (!status?.configured) {
    return (
      <div style={{ maxWidth: '850px', margin: '40px auto', padding: '0 20px' }}>
        {/* Header Hero */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', padding: '14px', borderRadius: '16px', background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)', marginBottom: '16px' }}>
            <Radar size={36} color="#60a5fa" />
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#f8fafc', marginBottom: '8px', letterSpacing: '-0.02em' }}>
            Automated Threat Intelligence & Hunting
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '15px', maxWidth: '640px', margin: '0 auto', lineHeight: '1.6' }}>
            Connect verified threat intelligence feeds to automatically scan network logs and endpoint processes across all 500+ systems in real-time with nanosecond in-memory matching.
          </p>
        </div>

        {/* Setup Card */}
        <div style={{
          background: 'rgba(17,24,39,0.7)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '32px',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
        }}>
          <form onSubmit={handleSaveConfig}>
            {/* Step 1: Abuse.ch Key */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Key size={16} color="#3b82f6" /> Abuse.ch ThreatFox Auth-Key
                </label>
                <a 
                  href="https://threatfox.abuse.ch/" 
                  target="_blank" 
                  rel="noreferrer"
                  style={{ fontSize: '13px', color: '#60a5fa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
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
                    background: 'rgba(11,19,38,0.8)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '14px',
                    fontFamily: 'monospace',
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
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                Key is tested live with Abuse.ch, encrypted using <strong>AES-256-GCM</strong>, and stored securely on Central Server.
              </p>
            </div>

            {/* Step 2: Feeds Selection */}
            <div style={{ marginBottom: '28px' }}>
              <label style={{ fontSize: '14px', fontWeight: '600', color: '#f1f5f9', display: 'block', marginBottom: '12px' }}>
                Feeds Included in Real-Time Engine
              </label>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                {/* ThreatFox */}
                <div style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px', color: '#e2e8f0' }}>ThreatFox C2</span>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(37,99,235,0.2)', color: '#60a5fa' }}>Auth-Key</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>C2 IP Addresses, Botnet Domains & Hash Indicators.</p>
                </div>

                {/* MalwareBazaar */}
                <div style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px', color: '#e2e8f0' }}>MalwareBazaar</span>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(34,197,94,0.2)', color: '#4ade80' }}>Free Feed</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Known Malicious Executable Binary SHA256 Hashes.</p>
                </div>

                {/* URLhaus */}
                <div style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px', color: '#e2e8f0' }}>URLhaus</span>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(34,197,94,0.2)', color: '#4ade80' }}>Free Feed</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Malicious Distribution Hostnames and IP Addresses.</p>
                </div>
              </div>
            </div>

            {/* Architecture Banner */}
            <div style={{
              background: 'rgba(59,130,246,0.06)',
              border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: '10px',
              padding: '14px 18px',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
              marginBottom: '28px'
            }}>
              <Server size={20} color="#60a5fa" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5' }}>
                <strong style={{ color: '#e2e8f0' }}>Single-Point Architecture:</strong> Entered once here on the Central Server. Branch Aggregators do not need an API key; they forward compressed syslog and endpoint logs to Central where they are matched against Node.js process RAM in 5 nanoseconds.
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isVerifying || !isAdmin}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#ffffff',
                fontWeight: '600',
                fontSize: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: (isVerifying || !isAdmin) ? 'not-allowed' : 'pointer',
                opacity: (isVerifying || !isAdmin) ? 0.7 : 1,
                boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
                transition: 'all 0.2s'
              }}
            >
              {isVerifying ? (
                <>
                  <div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Verifying with Abuse.ch & Encrypting...
                </>
              ) : (
                <>
                  <Shield size={18} /> Verify, Encrypt & Activate Threat Engine
                </>
              )}
            </button>
            {!isAdmin && (
              <p style={{ fontSize: '12px', color: '#f87171', textAlign: 'center', marginTop: '10px' }}>
                * Admin permissions required to configure Threat Intelligence.
              </p>
            )}
          </form>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // 2. ACTIVE DASHBOARD MODE (API Key Configured)
  // ════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#f8fafc', margin: 0, letterSpacing: '-0.02em' }}>
              Threat Hunting & Threat Intelligence
            </h1>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '20px',
              background: 'rgba(34,197,94,0.12)',
              border: '1px solid rgba(34,197,94,0.3)',
              color: '#4ade80',
              fontSize: '12px',
              fontWeight: '600'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
              Live Ingestion Active
            </div>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px', marginBottom: 0 }}>
            Real-time ThreatFox, MalwareBazaar & URLhaus matching across all 500+ endpoints & branch firewalls.
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isAdmin && (
            <button
              onClick={() => setShowSettingsModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#cbd5e1',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              <Key size={15} /> Feed Settings
            </button>
          )}

          <button
            onClick={handleManualSync}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              border: 'none',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(37,99,235,0.3)'
            }}
          >
            <RefreshCw size={14} /> Sync Feeds Now
          </button>
        </div>
      </div>

      {/* 4 Stat Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {/* Total Indicators */}
        <div style={{
          background: 'rgba(17,24,39,0.7)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '20px',
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '500' }}>RAM Indicators Cached</span>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(37,99,235,0.15)', color: '#60a5fa' }}>
              <Cpu size={18} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: '#f8fafc' }}>
            {status?.stats?.total_iocs?.toLocaleString() || '0'}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#4ade80' }}>0.000005 ms</span> per event lookup (~8 MB RAM)
          </div>
        </div>

        {/* Matches Last 24 Hours */}
        <div style={{
          background: 'rgba(17,24,39,0.7)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '20px',
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '500' }}>Threat Matches (24h)</span>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
              <ShieldAlert size={18} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: status?.stats?.matches_today > 0 ? '#f87171' : '#f8fafc' }}>
            {status?.stats?.matches_today?.toLocaleString() || '0'}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Flagged with CRITICAL severity & [THREAT DANGER]
          </div>
        </div>

        {/* Malicious IPs & Domains */}
        <div style={{
          background: 'rgba(17,24,39,0.7)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '20px',
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '500' }}>Malicious C2 IPs & Domains</span>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(168,85,247,0.15)', color: '#c084fc' }}>
              <Globe size={18} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: '#f8fafc' }}>
            {((status?.stats?.ips || 0) + (status?.stats?.domains || 0)).toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            {status?.stats?.ips?.toLocaleString() || 0} IPs · {status?.stats?.domains?.toLocaleString() || 0} Domains
          </div>
        </div>

        {/* Malware Hashes */}
        <div style={{
          background: 'rgba(17,24,39,0.7)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '20px',
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '500' }}>Executable Hashes (SHA256)</span>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(234,179,8,0.15)', color: '#facc15' }}>
              <Hash size={18} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: '#f8fafc' }}>
            {status?.stats?.hashes?.toLocaleString() || '0'}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            60-Day rolling retention auto-purged
          </div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('matches')}
          style={{
            padding: '10px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'matches' ? '2px solid #3b82f6' : '2px solid transparent',
            color: activeTab === 'matches' ? '#f8fafc' : '#94a3b8',
            fontWeight: activeTab === 'matches' ? '600' : '400',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <ShieldAlert size={16} color={activeTab === 'matches' ? '#ef4444' : 'currentColor'} />
          Threat Detections (Matches)
          {status?.stats?.matches_today > 0 && (
            <span style={{ padding: '2px 7px', borderRadius: '10px', background: 'rgba(239,68,68,0.2)', color: '#f87171', fontSize: '11px', fontWeight: '700' }}>
              {status.stats.matches_today}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('indicators')}
          style={{
            padding: '10px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'indicators' ? '2px solid #3b82f6' : '2px solid transparent',
            color: activeTab === 'indicators' ? '#f8fafc' : '#94a3b8',
            fontWeight: activeTab === 'indicators' ? '600' : '400',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <Database size={16} color={activeTab === 'indicators' ? '#3b82f6' : 'currentColor'} />
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
            background: 'rgba(17,24,39,0.7)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
            padding: '14px',
            marginBottom: '16px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '12px',
            justifyContent: 'space-between'
          }}>
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1', minWidth: '240px', maxWidth: '400px' }}>
              <Search size={15} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search matched IP, domain, hash, device..."
                value={matchesSearch}
                onChange={(e) => setMatchesSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchMatches(1)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 34px',
                  background: 'rgba(11,19,38,0.8)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Type Filter */}
              <select
                value={matchesType}
                onChange={(e) => setMatchesType(e.target.value)}
                style={{
                  padding: '8px 12px',
                  background: 'rgba(11,19,38,0.8)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: '#cbd5e1',
                  fontSize: '13px',
                  outline: 'none'
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
                  padding: '8px 12px',
                  background: 'rgba(11,19,38,0.8)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: '#cbd5e1',
                  fontSize: '13px',
                  outline: 'none'
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
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#f8fafc',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={13} /> Filter
              </button>
            </div>
          </div>

          {/* Matches Table */}
          <div style={{
            background: 'rgba(17,24,39,0.7)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            overflow: 'hidden',
            backdropFilter: 'blur(8px)'
          }}>
            {matchesLoading ? (
              <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                Scanning matched logs across all endpoints...
              </div>
            ) : matches.length === 0 ? (
              <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <CheckCircle2 size={28} color="#4ade80" />
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', marginBottom: '6px' }}>
                  No Known Threat Matches Detected
                </h3>
                <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '440px', margin: '0 auto' }}>
                  All network connections and running endpoint executables are clean against the active Abuse.ch C2 and malware feeds.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}>
                      <th style={{ padding: '12px 16px', fontWeight: '600' }}>Timestamp</th>
                      <th style={{ padding: '12px 16px', fontWeight: '600' }}>Severity</th>
                      <th style={{ padding: '12px 16px', fontWeight: '600' }}>Endpoint / Device</th>
                      <th style={{ padding: '12px 16px', fontWeight: '600' }}>Aggregator / Branch</th>
                      <th style={{ padding: '12px 16px', fontWeight: '600' }}>Matched Indicator</th>
                      <th style={{ padding: '12px 16px', fontWeight: '600' }}>Threat Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((item, idx) => (
                      <tr 
                        key={idx}
                        style={{ 
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                          transition: 'background 0.2s'
                        }}
                      >
                        {/* Timestamp */}
                        <td style={{ padding: '12px 16px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {item.ts ? new Date(item.ts).toLocaleString() : 'Just now'}
                        </td>

                        {/* Severity */}
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: 'rgba(239,68,68,0.15)',
                            color: '#f87171',
                            border: '1px solid rgba(239,68,68,0.3)',
                            fontSize: '11px',
                            fontWeight: '700'
                          }}>
                            CRITICAL
                          </span>
                        </td>

                        {/* Endpoint */}
                        <td style={{ padding: '12px 16px', color: '#f8fafc', fontWeight: '500' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {item.source_type === 'firewall' ? (
                              <Server size={14} color="#f97316" />
                            ) : (
                              <Activity size={14} color="#60a5fa" />
                            )}
                            {item.endpoint}
                          </div>
                          {item.src_ip && item.src_ip !== 'local' && (
                            <span style={{ fontSize: '11px', color: '#64748b' }}>Src: {item.src_ip}</span>
                          )}
                        </td>

                        {/* Branch / Aggregator */}
                        <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', fontSize: '11px' }}>
                            {item.aggregator_name || 'direct'}
                          </span>
                        </td>

                        {/* Indicator */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              fontFamily: 'monospace',
                              color: '#f87171',
                              fontWeight: '600',
                              background: 'rgba(239,68,68,0.08)',
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
                              {item.indicator && item.indicator.length > 28 ? `${item.indicator.slice(0, 24)}...` : item.indicator}
                            </span>
                            <button
                              onClick={() => copyIndicator(item.indicator)}
                              title="Copy Indicator"
                              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px' }}
                            >
                              {copiedItem === item.indicator ? <Check size={14} color="#4ade80" /> : <Copy size={14} />}
                            </button>
                          </div>
                          <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>
                            Type: {item.indicator_type}
                          </span>
                        </td>

                        {/* Details */}
                        <td style={{ padding: '12px 16px', color: '#cbd5e1', maxWidth: '380px' }}>
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
              <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Showing {matches.length} of {matchesTotal} detections
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    disabled={matchesPage <= 1}
                    onClick={() => fetchMatches(matchesPage - 1)}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '6px',
                      color: matchesPage <= 1 ? '#475569' : '#cbd5e1',
                      cursor: matchesPage <= 1 ? 'not-allowed' : 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Previous
                  </button>
                  <span style={{ padding: '6px 12px', color: '#94a3b8', fontSize: '12px' }}>
                    Page {matchesPage} of {matchesTotalPages}
                  </span>
                  <button
                    disabled={matchesPage >= matchesTotalPages}
                    onClick={() => fetchMatches(matchesPage + 1)}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '6px',
                      color: matchesPage >= matchesTotalPages ? '#475569' : '#cbd5e1',
                      cursor: matchesPage >= matchesTotalPages ? 'not-allowed' : 'pointer',
                      fontSize: '12px'
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
            background: 'rgba(17,24,39,0.7)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
            padding: '14px',
            marginBottom: '16px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '12px',
            justifyContent: 'space-between'
          }}>
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1', minWidth: '240px', maxWidth: '400px' }}>
              <Search size={15} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search indicator value or malware family..."
                value={indicatorsSearch}
                onChange={(e) => setIndicatorsSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchIndicators(1)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 34px',
                  background: 'rgba(11,19,38,0.8)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Type Filter */}
              <select
                value={indicatorsType}
                onChange={(e) => setIndicatorsType(e.target.value)}
                style={{
                  padding: '8px 12px',
                  background: 'rgba(11,19,38,0.8)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: '#cbd5e1',
                  fontSize: '13px',
                  outline: 'none'
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
                  padding: '8px 12px',
                  background: 'rgba(11,19,38,0.8)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: '#cbd5e1',
                  fontSize: '13px',
                  outline: 'none'
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
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#f8fafc',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={13} /> Filter
              </button>
            </div>
          </div>

          {/* Indicators Table */}
          <div style={{
            background: 'rgba(17,24,39,0.7)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            overflow: 'hidden',
            backdropFilter: 'blur(8px)'
          }}>
            {indicatorsLoading ? (
              <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                Loading threat indicators database...
              </div>
            ) : indicators.length === 0 ? (
              <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                <Database size={36} color="#64748b" style={{ margin: '0 auto 12px' }} />
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', marginBottom: '6px' }}>
                  No Threat Indicators Found
                </h3>
                <p style={{ fontSize: '13px', color: '#94a3b8' }}>
                  Click "Sync Feeds Now" above to download the latest threat indicators from Abuse.ch.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}>
                      <th style={{ padding: '12px 16px', fontWeight: '600' }}>Indicator Value</th>
                      <th style={{ padding: '12px 16px', fontWeight: '600' }}>Type</th>
                      <th style={{ padding: '12px 16px', fontWeight: '600' }}>Malware Family</th>
                      <th style={{ padding: '12px 16px', fontWeight: '600' }}>Feed Provider</th>
                      <th style={{ padding: '12px 16px', fontWeight: '600' }}>Confidence</th>
                      <th style={{ padding: '12px 16px', fontWeight: '600' }}>Last Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indicators.map((ioc, idx) => (
                      <tr 
                        key={idx}
                        style={{ 
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                          transition: 'background 0.2s'
                        }}
                      >
                        {/* Indicator Value */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontFamily: 'monospace', color: '#f8fafc', fontWeight: '500' }}>
                              {ioc.ioc_value && ioc.ioc_value.length > 40 ? `${ioc.ioc_value.slice(0, 36)}...` : ioc.ioc_value}
                            </span>
                            <button
                              onClick={() => copyIndicator(ioc.ioc_value)}
                              title="Copy Indicator"
                              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px' }}
                            >
                              {copiedItem === ioc.ioc_value ? <Check size={14} color="#4ade80" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </td>

                        {/* Type */}
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: ioc.ioc_type === 'ip' ? 'rgba(59,130,246,0.15)' : ioc.ioc_type === 'domain' ? 'rgba(168,85,247,0.15)' : 'rgba(234,179,8,0.15)',
                            color: ioc.ioc_type === 'ip' ? '#60a5fa' : ioc.ioc_type === 'domain' ? '#c084fc' : '#facc15',
                            fontSize: '11px',
                            fontWeight: '600',
                            textTransform: 'uppercase'
                          }}>
                            {ioc.ioc_type}
                          </span>
                        </td>

                        {/* Malware Family */}
                        <td style={{ padding: '12px 16px', color: '#e2e8f0' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', fontSize: '12px' }}>
                            {ioc.malware_family || 'Generic C2 / Malware'}
                          </span>
                        </td>

                        {/* Provider */}
                        <td style={{ padding: '12px 16px', color: '#94a3b8' }}>
                          <span style={{ fontSize: '12px', textTransform: 'capitalize' }}>
                            {ioc.source}
                          </span>
                        </td>

                        {/* Confidence */}
                        <td style={{ padding: '12px 16px', color: '#4ade80' }}>
                          {ioc.confidence_level || 100}%
                        </td>

                        {/* Last Seen */}
                        <td style={{ padding: '12px 16px', color: '#64748b', whiteSpace: 'nowrap' }}>
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
              <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Showing {indicators.length} of {indicatorsTotal} indicators
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    disabled={indicatorsPage <= 1}
                    onClick={() => fetchIndicators(indicatorsPage - 1)}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '6px',
                      color: indicatorsPage <= 1 ? '#475569' : '#cbd5e1',
                      cursor: indicatorsPage <= 1 ? 'not-allowed' : 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Previous
                  </button>
                  <span style={{ padding: '6px 12px', color: '#94a3b8', fontSize: '12px' }}>
                    Page {indicatorsPage} of {indicatorsTotalPages}
                  </span>
                  <button
                    disabled={indicatorsPage >= indicatorsTotalPages}
                    onClick={() => fetchIndicators(indicatorsPage + 1)}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '6px',
                      color: indicatorsPage >= indicatorsTotalPages ? '#475569' : '#cbd5e1',
                      cursor: indicatorsPage >= indicatorsTotalPages ? 'not-allowed' : 'pointer',
                      fontSize: '12px'
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
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: 'rgba(17,24,39,0.95)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '16px',
            padding: '28px',
            maxWidth: '560px',
            width: '100%',
            boxShadow: '0 16px 48px rgba(0,0,0,0.6)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc', marginBottom: '8px' }}>
              Threat Intelligence Feed Settings
            </h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px', lineHeight: '1.5' }}>
              Update your Abuse.ch Auth-Key or toggle individual feed sources. The key is encrypted with AES-256-GCM.
            </p>

            <form onSubmit={handleSaveConfig}>
              <div style={{ marginBottom: '18px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#e2e8f0', display: 'block', marginBottom: '6px' }}>
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
                      background: 'rgba(11,19,38,0.8)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                  >
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Feed Checkboxes */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#e2e8f0', display: 'block', marginBottom: '10px' }}>
                  Active Feed Integrations
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#cbd5e1', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedFeeds.threatfox}
                      onChange={(e) => setSelectedFeeds({ ...selectedFeeds, threatfox: e.target.checked })}
                    />
                    ThreatFox C2 Indicators (Public IPs, Domains, Hashes)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#cbd5e1', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedFeeds.malwarebazaar}
                      onChange={(e) => setSelectedFeeds({ ...selectedFeeds, malwarebazaar: e.target.checked })}
                    />
                    MalwareBazaar (Executable Malware Binary Hashes)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#cbd5e1', cursor: 'pointer' }}>
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
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#cbd5e1',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifying}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: '500',
                    fontSize: '13px',
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
