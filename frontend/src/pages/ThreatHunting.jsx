import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Radar, Key, RefreshCw, Database,
  ExternalLink, Copy, Check, Eye, EyeOff, Search,
  Server, CheckCircle2, ShieldAlert, X, Info, Activity, Filter, RotateCcw,
  Clock, ShieldCheck, Network, AlertTriangle, Trash2, ArrowRight, User, Globe, FileCode
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import PremiumCard from '../components/PremiumCard';

// Helper to extract the genuine malicious indicator if an event recorded a DNS resolver (e.g. 8.8.8.8) as dst_ip
export const getRealIndicator = (item) => {
  if (!item) return '';
  const val = String(item.indicator || item.ioc_value || '').trim();
  const raw = String(item.details || item.msg || item.logdesc || '');
  
  // 1. If raw log details explicitly contain the matched threat indicator, extract it
  const match = raw.match(/\[THREAT DANGER\] Matched Known Threat:\s*([^\s,;]+)/i);
  if (match && match[1]) {
    const candidate = match[1].trim();
    if (/[a-zA-Z]/.test(candidate) || (candidate !== '8.8.8.8' && candidate !== '1.1.1.1')) {
      return candidate;
    }
  }

  // 2. If item has a genuine domain name in cfgobj
  if (item.cfgobj && item.cfgobj.trim() && !/^\d+\.\d+\.\d+\.\d+$/.test(item.cfgobj.trim())) {
    return item.cfgobj.trim();
  }

  // 3. If item indicator is a generic DNS resolver like 8.8.8.8, attempt extracting queried domain from raw details
  if (/^\d+\.\d+\.\d+\.\d+$/.test(val)) {
    const msgDomainMatch = raw.match(/(?:domain|qname|host|url|query)[:=\s]+([a-zA-Z0-9][-a-zA-Z0-9.]+\.[a-zA-Z]{2,})/i);
    if (msgDomainMatch && msgDomainMatch[1]) {
      return msgDomainMatch[1].trim();
    }
  }

  return val;
};

// Helper to determine the true indicator type (IP, Domain, Hash)
export const getRealIndicatorType = (item) => {
  if (!item) return 'ip';
  const realVal = getRealIndicator(item);
  if (/^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/.test(realVal)) return 'sha256';
  // Any IPv4 address (with optional port) is ALWAYS an IP, never a domain
  if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?::[0-9]+)?$/.test(realVal)) return 'ip';
  if (/[a-zA-Z]/.test(realVal)) return 'domain';
  const explicitType = String(item.indicator_type || item.ioc_type || '').toLowerCase();
  if (explicitType === 'sha256' || explicitType === 'hash') return 'sha256';
  if (explicitType === 'domain') return 'domain';
  return 'ip';
};

// Smart VirusTotal direct URL generator: Routes hashes to /gui/file/, IPs to /gui/ip-address/, domains to /gui/domain/
const getVirusTotalUrl = (detail) => {
  if (!detail || !detail.data) return 'https://www.virustotal.com';

  const rawVal = detail.type === 'match' ? getRealIndicator(detail.data) : detail.data.ioc_value;
  if (!rawVal) return 'https://www.virustotal.com';

  const val = String(rawVal).trim();
  const rawType = String(
    (detail.type === 'match' ? getRealIndicatorType(detail.data) : detail.data.ioc_type) || ''
  ).toLowerCase();

  // 1. File Hash: SHA-256 (64 hex), SHA-1 (40 hex), MD5 (32 hex)
  const isHexHash = /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/.test(val);
  if (
    rawType.includes('sha') ||
    rawType.includes('hash') ||
    rawType.includes('md5') ||
    isHexHash
  ) {
    return `https://www.virustotal.com/gui/file/${val.toLowerCase()}`;
  }

  // 2. IP Address (support IPv4 or IPv6, strip trailing port if present e.g. 1.2.3.4:443)
  const ipWithoutPort = val.replace(/:\d+$/, '');
  const isIpv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ipWithoutPort);
  const isIpv6 = ipWithoutPort.includes(':');
  if (rawType === 'ip' || isIpv4 || isIpv6) {
    return `https://www.virustotal.com/gui/ip-address/${ipWithoutPort}`;
  }

  // 3. Domain Name
  const isDomain = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(val);
  if (rawType === 'domain' || isDomain) {
    return `https://www.virustotal.com/gui/domain/${encodeURIComponent(val)}`;
  }

  // 4. Fallback search
  return `https://www.virustotal.com/gui/search/${encodeURIComponent(val)}`;
};

// Multi-Source External Threat Reputation Links
const getReputationLinks = (detail) => {
  if (!detail || !detail.data) return [];
  const rawVal = detail.type === 'match' ? getRealIndicator(detail.data) : detail.data.ioc_value;
  if (!rawVal) return [];

  const val = String(rawVal).trim();
  const rawType = String(
    (detail.type === 'match' ? getRealIndicatorType(detail.data) : detail.data.ioc_type) || ''
  ).toLowerCase();

  const isHexHash = /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/.test(val);
  const ipWithoutPort = val.replace(/:\d+$/, '');
  const isIpv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ipWithoutPort);
  const isIpv6 = ipWithoutPort.includes(':');

  const links = [];

  // VirusTotal Direct
  links.push({
    name: 'VirusTotal',
    url: getVirusTotalUrl(detail),
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.12)',
    border: 'rgba(59,130,246,0.3)',
    title: 'Inspect on VirusTotal'
  });

  if (rawType.includes('sha') || rawType.includes('hash') || isHexHash) {
    // Hash Sources
    links.push({
      name: 'MalwareBazaar',
      url: `https://bazaar.abuse.ch/sample/${encodeURIComponent(val)}/`,
      color: '#eab308',
      bg: 'rgba(234,179,8,0.12)',
      border: 'rgba(234,179,8,0.3)',
      title: 'Analyze sample on MalwareBazaar'
    });
    links.push({
      name: 'Hybrid Analysis',
      url: `https://www.hybrid-analysis.com/sample/${encodeURIComponent(val.toLowerCase())}`,
      color: '#06b6d4',
      bg: 'rgba(6,182,212,0.12)',
      border: 'rgba(6,182,212,0.3)',
      title: 'View Falcon Sandbox report on Hybrid Analysis'
    });
    links.push({
      name: 'ThreatFox',
      url: `https://threatfox.abuse.ch/browse.php?search=ioc%3A${encodeURIComponent(val)}`,
      color: '#a855f7',
      bg: 'rgba(168,85,247,0.12)',
      border: 'rgba(168,85,247,0.3)',
      title: 'Search IOC on ThreatFox'
    });
  } else if (rawType === 'ip' || isIpv4 || isIpv6) {
    // IP Sources
    links.push({
      name: 'AbuseIPDB',
      url: `https://www.abuseipdb.com/check/${encodeURIComponent(ipWithoutPort)}`,
      color: '#f97316',
      bg: 'rgba(249,115,22,0.12)',
      border: 'rgba(249,115,22,0.3)',
      title: 'Check IP abuse confidence score on AbuseIPDB'
    });
    links.push({
      name: 'Shodan',
      url: `https://www.shodan.io/host/${encodeURIComponent(ipWithoutPort)}`,
      color: '#ef4444',
      bg: 'rgba(239,68,68,0.12)',
      border: 'rgba(239,68,68,0.3)',
      title: 'View exposed open ports and services on Shodan'
    });
    links.push({
      name: 'ThreatFox',
      url: `https://threatfox.abuse.ch/browse.php?search=ioc%3A${encodeURIComponent(val)}`,
      color: '#a855f7',
      bg: 'rgba(168,85,247,0.12)',
      border: 'rgba(168,85,247,0.3)',
      title: 'Search IOC on ThreatFox'
    });
  } else {
    // Domain / URL Sources
    links.push({
      name: 'urlscan.io',
      url: `https://urlscan.io/search/#${encodeURIComponent(val)}`,
      color: '#10b981',
      bg: 'rgba(16,185,129,0.12)',
      border: 'rgba(16,185,129,0.3)',
      title: 'View website scan and DOM on urlscan.io'
    });
    links.push({
      name: 'URLhaus',
      url: `https://urlhaus.abuse.ch/browse.php?search=${encodeURIComponent(val)}`,
      color: '#eab308',
      bg: 'rgba(234,179,8,0.12)',
      border: 'rgba(234,179,8,0.3)',
      title: 'Search URLhaus malware repository'
    });
    links.push({
      name: 'ThreatFox',
      url: `https://threatfox.abuse.ch/browse.php?search=ioc%3A${encodeURIComponent(val)}`,
      color: '#a855f7',
      bg: 'rgba(168,85,247,0.12)',
      border: 'rgba(168,85,247,0.3)',
      title: 'Search IOC on ThreatFox'
    });
  }

  return links;
};

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

  // Retroactive Hunting State
  const [isRetrohunting, setIsRetrohunting] = useState(false);
  const [showRetrohuntModal, setShowRetrohuntModal] = useState(false);
  const [retrohuntResult, setRetrohuntResult] = useState(null);
  const [retrohuntRange, setRetrohuntRange] = useState('7d');

  // Whitelist / False Positive Suppression State
  const [showWhitelistModal, setShowWhitelistModal] = useState(false);
  const [whitelist, setWhitelist] = useState([]);
  const [whitelistLoading, setWhitelistLoading] = useState(false);
  const [showSuppressModal, setShowSuppressModal] = useState(false);
  const [suppressTarget, setSuppressTarget] = useState(null);
  const [suppressReason, setSuppressReason] = useState('False Positive Feed Hit');
  const [isSuppressing, setIsSuppressing] = useState(false);

  // Blast Radius & Network Pivot State
  const [showBlastRadiusModal, setShowBlastRadiusModal] = useState(false);
  const [blastRadiusTarget, setBlastRadiusTarget] = useState(null);
  const [blastRadius, setBlastRadius] = useState(null);
  const [blastRadiusLoading, setBlastRadiusLoading] = useState(false);
  const [blastEndpointSearch, setBlastEndpointSearch] = useState('');

  // Retroactive Hunt Persistent Tab State (Tab 2)
  const [retroMatches, setRetroMatches] = useState([]);
  const [retroLoading, setRetroLoading] = useState(false);
  const [retroTotal, setRetroTotal] = useState(0);
  const [retroPage, setRetroPage] = useState(1);
  const [retroTotalPages, setRetroTotalPages] = useState(1);
  const [retroSearch, setRetroSearch] = useState('');
  const [retroType, setRetroType] = useState('all');
  const [retroTimeRange, setRetroTimeRange] = useState('all');

  // Retroactive Hunt Scheduling State
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [retroSchedule, setRetroSchedule] = useState({
    enabled: true,
    frequency: 'daily',
    runTime: '08:00',
    lookbackWindow: '7d'
  });
  const [scheduleForm, setScheduleForm] = useState({
    enabled: true,
    frequency: 'daily',
    runTime: '08:00',
    lookbackWindow: '7d'
  });
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  // Fetch Persisted Retroactive Matches from Database Table
  const fetchRetroMatches = async (page = 1) => {
    try {
      setRetroLoading(true);
      const res = await axios.get('/api/threat-hunting/retrohunt-matches', {
        params: {
          page,
          limit: 20,
          search: retroSearch.trim(),
          type: retroType,
          timeRange: retroTimeRange
        }
      });
      setRetroMatches(res.data.matches || []);
      setRetroTotal(res.data.total || 0);
      setRetroPage(res.data.page || 1);
      setRetroTotalPages(res.data.totalPages || 1);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load retroactive detections');
    } finally {
      setRetroLoading(false);
    }
  };

  // Open Schedule Configuration Modal
  const handleOpenScheduleModal = () => {
    setScheduleForm({
      enabled: retroSchedule.enabled !== false,
      frequency: retroSchedule.frequency || 'daily',
      runTime: retroSchedule.runTime || '08:00',
      lookbackWindow: ['7d', '14d', '30d'].includes(retroSchedule.lookbackWindow) ? retroSchedule.lookbackWindow : '7d'
    });
    setShowScheduleModal(true);
  };

  // Save Schedule Configuration
  const handleSaveSchedule = async (e) => {
    if (e) e.preventDefault();
    try {
      setIsSavingSchedule(true);
      const res = await axios.post('/api/threat-hunting/schedule', scheduleForm);
      setRetroSchedule(res.data.schedule);
      setShowScheduleModal(false);
      toast.success('Retroactive hunting schedule saved!');
      fetchStatus();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to save schedule');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  // Retroactive Hunt Scan Handler (Scans ALL 17,492+ Indicators using Lookback)
  const handleRunRetrohunt = async (range = retroSchedule?.lookbackWindow || '7d') => {
    try {
      setIsRetrohunting(true);
      // Strictly prevent 24h
      const lookback = ['7d', '14d', '30d'].includes(range) ? range : '7d';
      const res = await axios.post('/api/threat-hunting/retrohunt', { timeRange: lookback, limit: 100000 });
      setRetrohuntResult(res.data);
      if (res.data.matches_found > 0) {
        toast.success(`Retrohunt identified ${res.data.matches_found} historical compromise events (${res.data.new_hits_found} new saved)!`);
      } else {
        toast.success(`Retrohunt clean: 0 historical matches found across all ${res.data.scanned_iocs?.toLocaleString() || '17,492'} indicators.`);
      }
      fetchRetroMatches(1);
      fetchStatus();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Retrohunt scan failed');
    } finally {
      setIsRetrohunting(false);
    }
  };

  // Dismiss / Delete Retroactive Match
  const handleDeleteRetroMatch = async (id) => {
    try {
      await axios.delete(`/api/threat-hunting/retrohunt-matches/${id}`);
      toast.success('Retroactive match dismissed');
      fetchRetroMatches(retroPage);
      fetchStatus();
    } catch (err) {
      console.error(err);
      toast.error('Failed to dismiss retroactive detection');
    }
  };

  // Load Whitelist
  const fetchWhitelist = async () => {
    try {
      setWhitelistLoading(true);
      const res = await axios.get('/api/threat-hunting/whitelist');
      setWhitelist(res.data.whitelist || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load whitelist');
    } finally {
      setWhitelistLoading(false);
    }
  };

  // Open Suppress Modal
  const handleOpenSuppressModal = (indicator, type) => {
    if (!indicator) return;
    setSuppressTarget({ indicator, type: type || 'ip' });
    setSuppressReason('False Positive Feed Hit');
    setShowSuppressModal(true);
  };

  // Add to Whitelist
  const handleAddToWhitelist = async () => {
    if (!suppressTarget || !suppressTarget.indicator) return;
    const { indicator, type } = suppressTarget;
    try {
      setIsSuppressing(true);
      await axios.post('/api/threat-hunting/whitelist', {
        ioc_type: type || 'ip',
        ioc_value: indicator,
        reason: suppressReason.trim() || 'False positive / benign infrastructure'
      });
      toast.success(`Suppressed & whitelisted: ${indicator}`);
      setShowSuppressModal(false);
      setSuppressTarget(null);
      setSuppressReason('');
      setSelectedDetail(null);
      fetchMatches();
      fetchStatus();
      if (showWhitelistModal) fetchWhitelist();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to whitelist indicator');
    } finally {
      setIsSuppressing(false);
    }
  };

  // Remove from Whitelist
  const handleRemoveFromWhitelist = async (id) => {
    try {
      await axios.delete(`/api/threat-hunting/whitelist/${id}`);
      toast.success('Indicator removed from whitelist');
      fetchWhitelist();
      fetchStatus();
      fetchMatches();
    } catch (err) {
      console.error(err);
      toast.error('Failed to remove whitelist entry');
    }
  };

  // Open Dedicated Blast Radius Modal
  const handleOpenBlastRadius = (indicator, type) => {
    if (!indicator) return;
    setBlastRadiusTarget({ indicator, type: type || 'ip' });
    setBlastEndpointSearch('');
    setShowBlastRadiusModal(true);
    handleLoadBlastRadius(indicator, type || 'ip');
  };

  // Load Blast Radius
  const handleLoadBlastRadius = async (indicator, type) => {
    try {
      setBlastRadiusLoading(true);
      const res = await axios.get('/api/threat-hunting/blast-radius', {
        params: { indicator, type }
      });
      setBlastRadius(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to compute blast radius');
    } finally {
      setBlastRadiusLoading(false);
    }
  };

  // 1. Fetch Status
  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/threat-hunting/status');
      setStatus(res.data);
      if (res.data.feeds) {
        setSelectedFeeds(res.data.feeds);
      }
      if (res.data.retrohunt_schedule) {
        setRetroSchedule(res.data.retrohunt_schedule);
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
      } else if (activeTab === 'retrohunt') {
        fetchRetroMatches(1);
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
    retroType,
    retroTimeRange,
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
        else if (activeTab === 'retrohunt') fetchRetroMatches(retroPage);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* False Positive Whitelist Manager */}
          <button
            onClick={() => {
              fetchWhitelist();
              setShowWhitelistModal(true);
            }}
            title="Manage suppressed false positive indicators"
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
            <ShieldCheck size={14} color="#22c55e" /> Whitelist
          </button>

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
        {/* Tab 1: Live Matches */}
        <button
          onClick={() => setActiveTab('matches')}
          style={{
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'matches' ? '2px solid #ef4444' : '2px solid transparent',
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
          Threat Detections (Live)
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

        {/* Tab 2: Retroactive Detections (Back-Testing) */}
        <button
          onClick={() => setActiveTab('retrohunt')}
          style={{
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'retrohunt' ? '2px solid #8b5cf6' : '2px solid transparent',
            color: activeTab === 'retrohunt' ? 'var(--text)' : 'var(--muted)',
            fontWeight: activeTab === 'retrohunt' ? 700 : 500,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontFamily: 'var(--sans)'
          }}
        >
          <RotateCcw size={15} color={activeTab === 'retrohunt' ? '#8b5cf6' : 'currentColor'} />
          Retroactive Detections (Back-Testing)
          {(retroTotal > 0 || status?.stats?.retrohunt_matches > 0) && (
            <span style={{
              padding: '1px 6px',
              borderRadius: '10px',
              background: 'rgba(139,92,246,0.15)',
              color: '#8b5cf6',
              fontSize: '11px',
              fontWeight: 800,
              fontFamily: 'var(--mono)'
            }}>
              {retroTotal || status?.stats?.retrohunt_matches}
            </span>
          )}
        </button>

        {/* Tab 3: Threat Database */}
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
          {status?.stats?.total_iocs > 0 && (
            <span style={{
              padding: '1px 6px',
              borderRadius: '10px',
              background: 'rgba(59,130,246,0.15)',
              color: '#3b82f6',
              fontSize: '11px',
              fontWeight: 800,
              fontFamily: 'var(--mono)'
            }}>
              {status.stats.total_iocs.toLocaleString()}
            </span>
          )}
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
                              {(() => {
                                const ind = getRealIndicator(item);
                                return ind && ind.length > 28 ? `${ind.slice(0, 24)}...` : ind;
                              })()}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyIndicator(getRealIndicator(item));
                              }}
                              title="Copy Indicator"
                              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '2px' }}
                            >
                              {copiedItem === getRealIndicator(item) ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                            </button>
                          </div>
                          <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                            Type: {getRealIndicatorType(item)}
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
          TAB 2: RETROACTIVE DETECTIONS (BACK-TESTING)
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'retrohunt' && (
        <div>
          {/* Top Status & KPI Banner */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.04) 100%)',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            borderRadius: '10px',
            padding: '16px 20px',
            marginBottom: '16px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(139, 92, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#8b5cf6',
                border: '1px solid rgba(139, 92, 246, 0.3)'
              }}>
                <RotateCcw size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Retroactive Threat Hunting & Back-Testing
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'rgba(139, 92, 246, 0.15)',
                    color: '#8b5cf6',
                    fontSize: '11px',
                    fontWeight: 800,
                    fontFamily: 'var(--mono)'
                  }}>
                    {status?.stats?.total_iocs?.toLocaleString() || '17,386'} INDICATORS
                  </span>
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--muted2)', margin: '4px 0 0 0' }}>
                  Detects stealth compromise events where devices communicated with C2s, domains, or malware before threat intelligence feeds indexed them.
                </p>
              </div>
            </div>

            {/* Quick Context Stats & Action Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', fontFamily: 'var(--mono)', display: 'block' }}>PERSISTED FINDINGS</span>
                <span style={{ fontSize: '18px', fontWeight: 900, color: retroTotal > 0 ? '#ef4444' : '#22c55e', fontFamily: 'var(--mono)' }}>
                  {retroTotal}
                </span>
              </div>

              <div style={{ width: '1px', height: '28px', background: 'var(--border)' }} />

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', fontFamily: 'var(--mono)', display: 'block' }}>AUTO-SCHEDULER</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: retroSchedule?.enabled && retroSchedule?.frequency !== 'disabled' ? '#22c55e' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: retroSchedule?.enabled && retroSchedule?.frequency !== 'disabled' ? '#22c55e' : 'var(--muted)', display: 'inline-block' }} />
                  {(() => {
                    if (!retroSchedule?.enabled || retroSchedule?.frequency === 'disabled') return 'Manual Only';
                    const lookback = (retroSchedule?.lookbackWindow || '7d').toUpperCase();
                    if (retroSchedule?.frequency === 'daily') return `Daily at ${retroSchedule?.runTime || '08:00'} (${lookback})`;
                    if (retroSchedule?.frequency === '2days') return `Every 2 Days at ${retroSchedule?.runTime || '08:00'} (${lookback})`;
                    if (retroSchedule?.frequency === '5days') return `Every 5 Days at ${retroSchedule?.runTime || '08:00'} (${lookback})`;
                    if (retroSchedule?.frequency === 'every_6h') return `Every 6 Hours (${lookback})`;
                    if (retroSchedule?.frequency === 'every_12h') return `Every 12 Hours (${lookback})`;
                    if (retroSchedule?.frequency === 'on_sync') return `On Feed Sync (${lookback})`;
                    return `Active (${lookback})`;
                  })()}
                </span>
              </div>

              <div style={{ width: '1px', height: '28px', background: 'var(--border)' }} />

              {/* Action Buttons in Banner */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={handleOpenScheduleModal}
                  title="Configure automated background hunting schedule & lookback window"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 14px',
                    borderRadius: '6px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#8b5cf6'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#8b5cf6' }}>schedule</span>
                  Configure Schedule
                </button>

                <button
                  onClick={() => handleRunRetrohunt(retroSchedule?.lookbackWindow || '7d')}
                  disabled={isRetrohunting}
                  title={`Run on-demand back-test scan across all indicators (${(retroSchedule?.lookbackWindow || '7d').toUpperCase()} Lookback)`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '7px 16px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: isRetrohunting ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(124, 58, 237, 0.3)',
                    transition: 'all 0.2s',
                    opacity: isRetrohunting ? 0.7 : 1
                  }}
                >
                  <RotateCcw size={13} style={{ animation: isRetrohunting ? 'spin 1.2s linear infinite' : 'none' }} />
                  {isRetrohunting ? 'Scanning Indicators...' : `⚡ Run Retrohunt Now (${(retroSchedule?.lookbackWindow || '7d').toUpperCase()})`}
                </button>
              </div>
            </div>
          </div>

          {/* Action & Filter Toolbar */}
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
                placeholder="Search retroactive detections (IP, domain, endpoint, malware)..."
                value={retroSearch}
                onChange={(e) => setRetroSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchRetroMatches(1)}
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

            {/* Filter Controls for Table */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* IOC Type Filter */}
              <select
                value={retroType}
                onChange={(e) => setRetroType(e.target.value)}
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

              {/* Table Time Filter (Strictly NO 24h) */}
              <select
                value={retroTimeRange}
                onChange={(e) => setRetroTimeRange(e.target.value)}
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
                <option value="all">All Persisted Detections</option>
                <option value="7d">Events from Past 7 Days</option>
                <option value="14d">Events from Past 14 Days</option>
                <option value="30d">Events from Past 30 Days</option>
              </select>

              <button
                onClick={() => fetchRetroMatches(1)}
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
                <Filter size={12} /> Filter
              </button>

              {(retroSearch || retroType !== 'all' || retroTimeRange !== 'all') && (
                <button
                  onClick={() => {
                    setRetroSearch('');
                    setRetroType('all');
                    setRetroTimeRange('all');
                  }}
                  title="Reset table filters"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--muted)',
                    fontSize: '12px',
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

          {/* Persistent Retrohunt Findings Table */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            overflow: 'hidden'
          }}>
            {retroLoading ? (
              <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                <div style={{ width: '28px', height: '28px', border: '3px solid rgba(139, 92, 246, 0.2)', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Querying persisted retroactive threat detections...</p>
              </div>
            ) : retroMatches.length === 0 ? (
              <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(34,197,94,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#22c55e',
                  margin: '0 auto 16px',
                  border: '1px solid rgba(34,197,94,0.25)'
                }}>
                  <ShieldCheck size={28} />
                </div>
                <h4 style={{ color: 'var(--text)', fontSize: '16px', fontWeight: 700, margin: '0 0 6px' }}>
                  Clean Historical Network Health
                </h4>
                <p style={{ color: 'var(--muted2)', fontSize: '13px', maxWidth: '520px', margin: '0 auto 20px', lineHeight: 1.5 }}>
                  Zero endpoints or branch firewalls communicated with any newly indexed C2 IPs, domains, or malware hashes across past telemetry.
                </p>
                <button
                  onClick={() => handleRunRetrohunt(retroSchedule?.lookbackWindow || '7d')}
                  disabled={isRetrohunting}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: isRetrohunting ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 8px rgba(124, 58, 237, 0.3)'
                  }}
                >
                  <RotateCcw size={13} style={{ animation: isRetrohunting ? 'spin 1.2s linear infinite' : 'none' }} />
                  {isRetrohunting ? 'Scanning Indicators...' : `⚡ Run Retrohunt Now (${(retroSchedule?.lookbackWindow || '7d').toUpperCase()})`}
                </button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                      <th style={{ width: '15%', minWidth: '130px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Historical Timestamp</th>
                      <th style={{ width: '12%', minWidth: '100px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Detection Type</th>
                      <th style={{ width: '18%', minWidth: '150px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Endpoint / Device</th>
                      <th style={{ width: '12%', minWidth: '110px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Branch / Source</th>
                      <th style={{ width: '20%', minWidth: '170px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Matched Threat Indicator</th>
                      <th style={{ width: '13%', minWidth: '120px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>Threat Context</th>
                      <th style={{ width: '10%', minWidth: '100px', padding: '10px 16px', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retroMatches.map((item, idx) => (
                      <tr
                        key={idx}
                        onClick={() => setSelectedDetail({ type: 'match', data: item })}
                        title="Click to view full retroactive threat match details"
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
                          {item.ts ? new Date(item.ts).toLocaleString() : 'Past Event'}
                        </td>

                        {/* Severity / Detection Type */}
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: 'rgba(139, 92, 246, 0.12)',
                            color: '#8b5cf6',
                            border: '1px solid rgba(139, 92, 246, 0.25)',
                            fontSize: '10px',
                            fontWeight: 800,
                            fontFamily: 'var(--mono)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <RotateCcw size={10} /> RETROACTIVE
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
                            {item.aggregator_name || 'syslog'}
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
                              {(() => {
                                const ind = getRealIndicator(item);
                                return ind && ind.length > 28 ? `${ind.slice(0, 24)}...` : ind;
                              })()}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyIndicator(getRealIndicator(item));
                              }}
                              title="Copy Indicator"
                              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '2px' }}
                            >
                              {copiedItem === getRealIndicator(item) ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                            </button>
                          </div>
                          <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                            Type: {getRealIndicatorType(item)}
                          </span>
                        </td>

                        {/* Threat Context */}
                        <td style={{ padding: '12px 16px', color: 'var(--muted2)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'rgba(239, 68, 68, 0.1)',
                              color: '#ef4444',
                              fontSize: '10px',
                              fontWeight: 700,
                              fontFamily: 'var(--mono)'
                            }}>
                              {item.malware_family || 'Malicious C2'}
                            </span>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'var(--surface2)',
                              color: 'var(--muted)',
                              fontSize: '10px',
                              fontFamily: 'var(--mono)'
                            }}>
                              {item.source_feed || 'ThreatFox'}
                            </span>
                          </div>
                        </td>

                        {/* Action Buttons */}
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                const indVal = getRealIndicator(item);
                                const indType = getRealIndicatorType(item);
                                handleOpenBlastRadius(indVal, indType);
                              }}
                              title="Investigate Blast Radius & Patient Zero"
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                background: 'rgba(37,99,235,0.1)',
                                border: '1px solid rgba(37,99,235,0.3)',
                                color: '#3b82f6',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              Blast Radius
                            </button>

                            <button
                              onClick={() => {
                                const indVal = getRealIndicator(item);
                                const indType = getRealIndicatorType(item);
                                handleOpenSuppressModal(indVal, indType);
                              }}
                              title="Add to Whitelist"
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                background: 'rgba(234,179,8,0.1)',
                                border: '1px solid rgba(234,179,8,0.3)',
                                color: '#eab308',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              Whitelist
                            </button>

                            <button
                              onClick={() => handleDeleteRetroMatch(item.id)}
                              title="Dismiss match"
                              style={{
                                padding: '4px 6px',
                                borderRadius: '4px',
                                background: 'transparent',
                                border: '1px solid var(--border)',
                                color: 'var(--muted)',
                                cursor: 'pointer'
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {retroTotalPages > 1 && (
              <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                  Showing {retroMatches.length} of {retroTotal} retroactive detections
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    disabled={retroPage <= 1}
                    onClick={() => fetchRetroMatches(retroPage - 1)}
                    style={{
                      padding: '5px 10px',
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: retroPage <= 1 ? 'var(--muted)' : 'var(--text)',
                      cursor: retroPage <= 1 ? 'not-allowed' : 'pointer',
                      fontSize: '11px',
                      fontWeight: 600
                    }}
                  >
                    Previous
                  </button>
                  <span style={{ padding: '5px 10px', color: 'var(--muted2)', fontSize: '11px', fontFamily: 'var(--mono)' }}>
                    Page {retroPage} of {retroTotalPages}
                  </span>
                  <button
                    disabled={retroPage >= retroTotalPages}
                    onClick={() => fetchRetroMatches(retroPage + 1)}
                    style={{
                      padding: '5px 10px',
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: retroPage >= retroTotalPages ? 'var(--muted)' : 'var(--text)',
                      cursor: retroPage >= retroTotalPages ? 'not-allowed' : 'pointer',
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
          TAB 3: THREAT DATABASE (FEED INDICATORS)
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
          AUTOMATED RETROHUNT SCHEDULER MODAL
          ════════════════════════════════════════════════════════════════ */}
      {showScheduleModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
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
            maxWidth: '560px',
            width: '100%',
            boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'rgba(139, 92, 246, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#8b5cf6',
                  border: '1px solid rgba(139, 92, 246, 0.3)'
                }}>
                  <RotateCcw size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.3px' }}>
                    Automated Retrohunt Scheduler
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    Background back-testing against all threat intelligence indicators
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowScheduleModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '6px' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--muted2)', marginBottom: '20px', lineHeight: '1.5' }}>
              Customize how often the platform executes retroactive hunting across past telemetry. Discovered stealth hits are permanently committed to the database.
            </p>

            <form onSubmit={handleSaveSchedule}>
              {/* Frequency Selection */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '6px', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>
                  Background Hunt Frequency
                </label>
                <select
                  value={scheduleForm.frequency}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, frequency: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '13px',
                    fontFamily: 'var(--sans)',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="daily">Daily at Specified Time (Recommended SOC Routine)</option>
                  <option value="2days">Every 2 Days at Specified Time</option>
                  <option value="5days">Every 5 Days at Specified Time</option>
                  <option value="every_6h">Every 6 Hours (Continuous Monitoring)</option>
                  <option value="every_12h">Every 12 Hours (Twice Daily)</option>
                  <option value="on_sync">On Every Threat Feed Sync (Triggered upon feed updates)</option>
                  <option value="disabled">Disabled (Manual On-Demand Scans Only)</option>
                </select>
              </div>

              {/* Specific Run Time (for Daily / 2-Day / 5-Day) */}
              {['daily', '2days', '5days'].includes(scheduleForm.frequency) && (
                <div style={{ marginBottom: '18px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '6px', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>
                    Execution Time of Day (Server Time)
                  </label>
                  <input
                    type="time"
                    value={scheduleForm.runTime || '08:00'}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, runTime: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--text)',
                      fontSize: '13px',
                      fontFamily: 'var(--mono)',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setScheduleForm(prev => ({ ...prev, runTime: '08:00' }))}
                      style={{ padding: '3px 8px', borderRadius: '4px', background: scheduleForm.runTime === '08:00' ? '#8b5cf6' : 'var(--surface2)', border: '1px solid var(--border)', color: scheduleForm.runTime === '08:00' ? '#fff' : 'var(--muted)', fontSize: '11px', cursor: 'pointer' }}
                    >
                      08:00 AM (Morning Shift)
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleForm(prev => ({ ...prev, runTime: '02:00' }))}
                      style={{ padding: '3px 8px', borderRadius: '4px', background: scheduleForm.runTime === '02:00' ? '#8b5cf6' : 'var(--surface2)', border: '1px solid var(--border)', color: scheduleForm.runTime === '02:00' ? '#fff' : 'var(--muted)', fontSize: '11px', cursor: 'pointer' }}
                    >
                      02:00 AM (Off-Peak Nightly)
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleForm(prev => ({ ...prev, runTime: '18:00' }))}
                      style={{ padding: '3px 8px', borderRadius: '4px', background: scheduleForm.runTime === '18:00' ? '#8b5cf6' : 'var(--surface2)', border: '1px solid var(--border)', color: scheduleForm.runTime === '18:00' ? '#fff' : 'var(--muted)', fontSize: '11px', cursor: 'pointer' }}
                    >
                      06:00 PM (Evening Handover)
                    </button>
                  </div>
                </div>
              )}

              {/* Lookback Telemetry Window (Strictly NO 24 Hours) */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '6px', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>
                  Lookback Telemetry Window
                </label>
                <select
                  value={['7d', '14d', '30d'].includes(scheduleForm.lookbackWindow) ? scheduleForm.lookbackWindow : '7d'}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, lookbackWindow: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '13px',
                    fontFamily: 'var(--sans)',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="7d">Past 7 Days (Standard / Recommended SOC Horizon)</option>
                  <option value="14d">Past 14 Days (Extended Audit)</option>
                  <option value="30d">Past 30 Days (Maximum Monthly Horizon)</option>
                </select>
              </div>

              {/* Informational Context Box */}
              <div style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: 'rgba(139, 92, 246, 0.08)',
                border: '1px solid rgba(139, 92, 246, 0.25)',
                marginBottom: '24px',
                display: 'flex',
                gap: '10px'
              }}>
                <Info size={16} color="#8b5cf6" style={{ flexShrink: 0, marginTop: '2px' }} />
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text)', lineHeight: 1.5 }}>
                  <strong>Why 7-Day or longer lookback?</strong> Threat intelligence feeds often take 2 to 4 days to research and index new malware C2s. Scanning at least past 7 days ensures stealth connections that occurred before feed publication are caught. All hits are saved permanently in the database with automatic deduplication.
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSchedule}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: isSavingSchedule ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(124, 58, 237, 0.3)',
                    opacity: isSavingSchedule ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {isSavingSchedule && <RotateCcw size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                  {isSavingSchedule ? 'Saving Schedule...' : 'Save Schedule Configuration'}
                </button>
              </div>
            </form>
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
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
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
      {selectedDetail && !showBlastRadiusModal && !showSuppressModal && (
        <div
          onClick={() => setSelectedDetail(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
                      {selectedDetail.type === 'match' ? getRealIndicator(selectedDetail.data) : selectedDetail.data.ioc_value}
                    </span>
                    <button
                      onClick={() => copyIndicator(selectedDetail.type === 'match' ? getRealIndicator(selectedDetail.data) : selectedDetail.data.ioc_value)}
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
                      {copiedItem === (selectedDetail.type === 'match' ? getRealIndicator(selectedDetail.data) : selectedDetail.data.ioc_value)
                        ? <Check size={16} color="#22c55e" />
                        : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* Multi-Source Threat Reputation Links & SOC Action Toolbar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* External Multi-Source Links */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {getReputationLinks(selectedDetail).map((link, idx) => (
                      <a
                        key={idx}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={link.title}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          background: link.bg,
                          border: `1px solid ${link.border}`,
                          color: link.color,
                          fontSize: '11px',
                          fontWeight: 700,
                          textDecoration: 'none',
                          transition: 'opacity 0.15s'
                        }}
                      >
                        <ExternalLink size={12} /> {link.name}
                      </a>
                    ))}
                  </div>

                  {/* SOC Analyst Investigation & Response Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '4px' }}>
                    <button
                      onClick={() => {
                        const indVal = selectedDetail.type === 'match' ? getRealIndicator(selectedDetail.data) : selectedDetail.data.ioc_value;
                        const indType = selectedDetail.type === 'match' ? getRealIndicatorType(selectedDetail.data) : selectedDetail.data.ioc_type;
                        handleOpenBlastRadius(indVal, indType);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        background: 'rgba(37,99,235,0.1)',
                        border: '1px solid rgba(37,99,235,0.3)',
                        color: '#3b82f6',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(37,99,235,0.2)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(37,99,235,0.1)'}
                    >
                      <Network size={13} /> Blast Radius & Network Pivot
                    </button>

                    <button
                      onClick={() => {
                        const indVal = selectedDetail.type === 'match' ? getRealIndicator(selectedDetail.data) : selectedDetail.data.ioc_value;
                        const indType = selectedDetail.type === 'match' ? getRealIndicatorType(selectedDetail.data) : selectedDetail.data.ioc_type;
                        handleOpenSuppressModal(indVal, indType);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        background: 'rgba(234,179,8,0.1)',
                        border: '1px solid rgba(234,179,8,0.3)',
                        color: '#eab308',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(234,179,8,0.2)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(234,179,8,0.1)'}
                    >
                      <ShieldCheck size={13} /> Suppress / Whitelist
                    </button>
                  </div>
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

                    {selectedDetail.data.dst_ip && (
                      <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)', display: 'block', marginBottom: '4px' }}>
                          {getRealIndicatorType(selectedDetail.data) === 'domain' ? 'DNS Server / Target IP' : 'Destination IP'}
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                          {selectedDetail.data.dst_ip}
                        </span>
                      </div>
                    )}

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

      {/* ════════════════════════════════════════════════════════════════
          FALSE POSITIVES WHITELIST MANAGER MODAL
          ════════════════════════════════════════════════════════════════ */}
      {showWhitelistModal && (
        <div
          onClick={() => setShowWhitelistModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '850px',
              maxHeight: '85vh',
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
              background: 'var(--surface2)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  background: 'rgba(34,197,94,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#22c55e'
                }}>
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>
                    False Positive Suppression & Whitelist
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    Benign indicators excluded from real-time threat detection across all firewalls and endpoints
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowWhitelistModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '6px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {whitelistLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                  Loading whitelisted indicators...
                </div>
              ) : whitelist.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                  <ShieldCheck size={36} color="var(--muted)" style={{ margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>No Suppressed False Positives</p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
                    You can suppress any benign IP, domain, or hash directly from its indicator details popup.
                  </p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                      <th style={{ padding: '10px 14px' }}>Type</th>
                      <th style={{ padding: '10px 14px' }}>Indicator Value</th>
                      <th style={{ padding: '10px 14px' }}>Suppression Reason</th>
                      <th style={{ padding: '10px 14px' }}>Added By</th>
                      <th style={{ padding: '10px 14px' }}>Date</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {whitelist.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: item.ioc_type === 'ip' ? 'rgba(59,130,246,0.1)' : item.ioc_type === 'domain' ? 'rgba(168,85,247,0.1)' : 'rgba(234,179,8,0.1)',
                            color: item.ioc_type === 'ip' ? '#3b82f6' : item.ioc_type === 'domain' ? '#a855f7' : '#eab308',
                            fontSize: '10px',
                            fontWeight: 800,
                            fontFamily: 'var(--mono)',
                            textTransform: 'uppercase'
                          }}>
                            {item.ioc_type}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)' }}>
                          {item.ioc_value}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--muted2)' }}>
                          {item.reason || 'False alarm'}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>
                          {item.added_by || 'admin'}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                          {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'N/A'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleRemoveFromWhitelist(item.id)}
                            title="Remove suppression rule and restore threat alerting"
                            style={{
                              padding: '5px 10px',
                              borderRadius: '4px',
                              background: 'rgba(239,68,68,0.1)',
                              border: '1px solid rgba(239,68,68,0.25)',
                              color: '#ef4444',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', background: 'var(--surface2)' }}>
              <button
                onClick={() => setShowWhitelistModal(false)}
                style={{ padding: '7px 18px', borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}



      {/* ════════════════════════════════════════════════════════════════
          DEDICATED NETWORK BLAST RADIUS & THREAT PIVOT MODAL
          ════════════════════════════════════════════════════════════════ */}
      {showBlastRadiusModal && blastRadiusTarget && (
        <div
          onClick={() => setShowBlastRadiusModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10050,
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '920px',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--surface2)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(37,99,235,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#3b82f6'
                }}>
                  <Network size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>
                    Network Blast Radius & Threat Pivot
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted2)' }}>
                      Target Indicator:
                    </span>
                    <span style={{
                      fontFamily: 'var(--mono)',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#ef4444',
                      background: 'rgba(239,68,68,0.1)',
                      padding: '1px 6px',
                      borderRadius: '4px'
                    }}>
                      {blastRadiusTarget.indicator}
                    </span>
                    <span style={{
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      fontFamily: 'var(--mono)',
                      color: 'var(--muted)',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      padding: '1px 5px',
                      borderRadius: '3px'
                    }}>
                      {blastRadiusTarget.type}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowBlastRadiusModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '6px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {blastRadiusLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '12px' }}>
                  <div style={{ width: '32px', height: '32px', border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                    Calculating network blast radius & identifying patient zero...
                  </p>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    Correlating across firewall logs and endpoint telemetry in real-time
                  </span>
                </div>
              ) : blastRadius ? (
                <>
                  {/* Stat Cards Strip */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    <div style={{ padding: '14px', background: 'var(--surface2)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)' }}>Total Connections</span>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: '#ef4444', marginTop: '2px' }}>
                        {blastRadius.total_hits?.toLocaleString() || 0}
                      </div>
                    </div>
                    <div style={{ padding: '14px', background: 'var(--surface2)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)' }}>Affected Devices</span>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: '#f97316', marginTop: '2px' }}>
                        {blastRadius.unique_endpoints_count?.toLocaleString() || 0}
                      </div>
                    </div>
                    <div style={{ padding: '14px', background: 'var(--surface2)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)' }}>First Activity</span>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginTop: '4px', fontFamily: 'var(--mono)' }}>
                        {blastRadius.patient_zero?.first_seen ? new Date(blastRadius.patient_zero.first_seen).toLocaleString() : 'N/A'}
                      </div>
                    </div>
                    <div style={{ padding: '14px', background: 'var(--surface2)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)' }}>Latest Activity</span>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginTop: '4px', fontFamily: 'var(--mono)' }}>
                        {blastRadius.last_seen ? new Date(blastRadius.last_seen).toLocaleString() : 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Patient Zero Banner */}
                  {blastRadius.patient_zero && (
                    <div style={{
                      padding: '14px 18px',
                      borderRadius: '10px',
                      background: 'rgba(249,115,22,0.08)',
                      border: '1px solid rgba(249,115,22,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '5px',
                          background: '#f97316',
                          color: '#ffffff',
                          fontSize: '11px',
                          fontWeight: 800,
                          letterSpacing: '0.4px',
                          fontFamily: 'var(--mono)'
                        }}>
                          ★ PATIENT ZERO
                        </span>
                        <div>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
                            {blastRadius.patient_zero.endpoint}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--muted2)', fontFamily: 'var(--mono)', marginLeft: '8px' }}>
                            ({blastRadius.patient_zero.src_ip})
                          </span>
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--muted2)', fontFamily: 'var(--mono)' }}>
                        Initial Breach Time: <strong style={{ color: 'var(--text)' }}>{new Date(blastRadius.patient_zero.first_seen).toLocaleString()}</strong>
                      </div>
                    </div>
                  )}

                  {/* Compromised Endpoints Table with Search Filter */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                        Compromised Network Endpoints ({blastRadius.endpoints?.length || 0})
                      </span>
                      <input
                        type="text"
                        placeholder="Filter endpoints or IP..."
                        value={blastEndpointSearch}
                        onChange={(e) => setBlastEndpointSearch(e.target.value)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          background: 'var(--surface2)',
                          border: '1px solid var(--border)',
                          fontSize: '12px',
                          color: 'var(--text)',
                          minWidth: '220px',
                          outline: 'none'
                        }}
                      />
                    </div>

                    <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                            <th style={{ padding: '10px 12px' }}>Endpoint</th>
                            <th style={{ padding: '10px 12px' }}>Internal IP</th>
                            <th style={{ padding: '10px 12px' }}>Aggregator / Branch</th>
                            <th style={{ padding: '10px 12px' }}>First Contact</th>
                            <th style={{ padding: '10px 12px' }}>Last Contact</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Hits</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(blastRadius.endpoints || [])
                            .filter(ep => {
                              if (!blastEndpointSearch.trim()) return true;
                              const s = blastEndpointSearch.toLowerCase();
                              return (ep.endpoint || '').toLowerCase().includes(s) || (ep.src_ip || '').toLowerCase().includes(s) || (ep.aggregator_name || '').toLowerCase().includes(s);
                            })
                            .map((ep, eIdx) => (
                              <tr
                                key={eIdx}
                                style={{
                                  borderBottom: '1px solid var(--border)',
                                  background: ep.is_patient_zero ? 'rgba(249,115,22,0.06)' : 'transparent'
                                }}
                              >
                                <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {ep.endpoint}
                                    {ep.is_patient_zero && (
                                      <span style={{
                                        fontSize: '9px',
                                        padding: '1px 5px',
                                        borderRadius: '3px',
                                        background: '#f97316',
                                        color: '#fff',
                                        fontWeight: 800
                                      }}>
                                        P0
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', color: 'var(--muted2)' }}>{ep.src_ip}</td>
                                <td style={{ padding: '10px 12px' }}>{ep.aggregator_name || 'Central'}</td>
                                <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', color: 'var(--muted2)' }}>{new Date(ep.first_seen).toLocaleString()}</td>
                                <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', color: 'var(--muted2)' }}>{new Date(ep.last_seen).toLocaleString()}</td>
                                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{ep.count}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>No Network Telemetry Hits</p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
                    No endpoints or branch firewalls have communicated with this indicator.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface2)' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                Target: {blastRadiusTarget.indicator}
              </span>
              <button
                onClick={() => setShowBlastRadiusModal(false)}
                style={{ padding: '7px 18px', borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          DEDICATED SUPPRESS THREAT INDICATOR MODAL (FALSE POSITIVE)
          ════════════════════════════════════════════════════════════════ */}
      {showSuppressModal && suppressTarget && (
        <div
          onClick={() => setShowSuppressModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10050,
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '520px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--surface2)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  background: 'rgba(234,179,8,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#eab308'
                }}>
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>
                    Suppress Threat Indicator
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    Add to whitelist to mute future false-positive alerts
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowSuppressModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '6px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Indicator Card */}
              <div style={{
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, fontFamily: 'var(--mono)', display: 'block', marginBottom: '2px' }}>
                    Target Indicator
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 700, color: '#ef4444' }}>
                    {suppressTarget.indicator}
                  </span>
                </div>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'rgba(59,130,246,0.1)',
                  color: '#3b82f6',
                  fontSize: '10px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  fontFamily: 'var(--mono)'
                }}>
                  {suppressTarget.type}
                </span>
              </div>

              {/* Warning Callout */}
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted2)', lineHeight: '1.5' }}>
                This will exclude this indicator from real-time threat detection and mute all future critical alerts across all firewalls and endpoints.
              </p>

              {/* Quick Reason Chips */}
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', fontFamily: 'var(--mono)', display: 'block', marginBottom: '6px' }}>
                  Quick Reason Presets:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {[
                    'False Positive Feed Hit',
                    'Authorized SaaS',
                    'Internal Infrastructure',
                    'Approved Scanner',
                    'Verified Clean CDN'
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setSuppressReason(chip)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '14px',
                        background: suppressReason === chip ? 'rgba(234,179,8,0.2)' : 'var(--surface2)',
                        border: `1px solid ${suppressReason === chip ? '#eab308' : 'var(--border)'}`,
                        color: suppressReason === chip ? '#eab308' : 'var(--muted2)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason Input */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '6px' }}>
                  Suppression Reason / Justification:
                </label>
                <input
                  type="text"
                  value={suppressReason}
                  onChange={(e) => setSuppressReason(e.target.value)}
                  placeholder="e.g. Approved corporate security scanner"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontSize: '12px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px', background: 'var(--surface2)' }}>
              <button
                onClick={() => setShowSuppressModal(false)}
                style={{ padding: '7px 16px', borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddToWhitelist}
                disabled={isSuppressing}
                style={{
                  padding: '7px 18px',
                  borderRadius: '6px',
                  background: '#eab308',
                  border: 'none',
                  color: '#000000',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: isSuppressing ? 'not-allowed' : 'pointer',
                  opacity: isSuppressing ? 0.7 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isSuppressing ? 'Saving Rule...' : 'Confirm Suppress'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
