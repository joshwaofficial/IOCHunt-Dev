const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const { getSmtpConfig, createTransporter } = require('./emailHelper');
const { generatePdfReport } = require('./pdfReportBuilder');
const { parseUsbEvent } = require('./eventParsers');

function formatTs(ts) {
  if (!ts) return '';
  if (ts instanceof Date) {
    return ts.toISOString().slice(0, 19).replace('T', ' ');
  }
  return String(ts);
}

function formatOfflineDuration(seconds) {
  if (seconds < 60) return 'Just now';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m offline`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m offline`;
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return `${days}d ${remHrs}h offline`;
}

/**
 * Returns a high-fidelity, completely simulated intelligence dataset tailored to period.
 */
function getSimulatedReportData(period = 'daily', includeFw = false) {
  const p = (period || 'daily').toLowerCase();
  const now = new Date();
  const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');
  const todayDateStr = now.toISOString().slice(0, 10);
  const weekAgoDateStr = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const monthAgoDateStr = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const yesterdayDateStr = new Date(now.getTime() - 24 * 3600000).toISOString().slice(0, 10);

  if (p === 'weekly') {
    return {
      scheduleName: 'Weekly Executive Threat Intelligence & SOC Briefing',
      generatedAt: nowStr + ' UTC',
      periodLabel: `Weekly Report (${weekAgoDateStr} to ${todayDateStr})`,
      branch: 'All Branches (HQ + Remote)',
      machine: 'Fleet Overview',
      threatLevel: 'HIGH',
      tlColor: '#f97316',
      postureScore: 74,
      narrative: 'Over the last 7-day operational cycle, IOCHunt monitored 24 endpoints and analyzed 24,850 security events across 3 branch offices. 14 Critical threats and 3 high-impact active incidents were escalated for remediation. 3 endpoints are currently offline, representing potential coverage blind spots.',
      totalEvents: 24850,
      critCount: 14,
      highCount: 86,
      medCount: 210,
      lowCount: 24540,
      trends: { totalTrend: '+18% (Up)', critTrend: '-35% (Down)' },
      timeline: [
        { bucket: 'Mon 09-23', total: 2800, crit: 1, high: 8, med: 25, low: 2766 },
        { bucket: 'Tue 09-24', total: 3400, crit: 2, high: 14, med: 32, low: 3352 },
        { bucket: 'Wed 09-25', total: 4100, crit: 4, high: 18, med: 40, low: 4038 },
        { bucket: 'Thu 09-26', total: 3900, crit: 3, high: 16, med: 35, low: 3846 },
        { bucket: 'Fri 09-27', total: 4600, crit: 2, high: 20, med: 45, low: 4533 },
        { bucket: 'Sat 09-28', total: 2900, crit: 1, high: 5, med: 18, low: 2876 },
        { bucket: 'Sun 09-29', total: 3150, crit: 1, high: 5, med: 15, low: 3129 }
      ],
      categories: [
        { category: 'PROCESSES', n: 10450, color: '#ef4444' },
        { category: 'DOMAIN / AD', n: 5820, color: '#8b5cf6' },
        { category: 'NETWORK', n: 4100, color: '#3b82f6' },
        { category: 'POWERSHELL', n: 2450, color: '#f97316' },
        { category: 'USB / STORAGE', n: 1240, color: '#eab308' },
        { category: 'DLP POLICIES', n: 790, color: '#ec4899' }
      ],
      mitre: {
        tactics: [
          { tactic: 'Credential Access', count: 68 },
          { tactic: 'Defense Evasion', count: 52 },
          { tactic: 'Discovery', count: 94 },
          { tactic: 'Execution', count: 185 },
          { tactic: 'Lateral Movement', count: 48 },
          { tactic: 'Persistence', count: 38 },
          { tactic: 'Exfiltration', count: 18 }
        ],
        topTechniques: [
          { id: 'T1003', name: 'OS Credential Dumping (DCSync)', count: 68 },
          { id: 'T1059', name: 'Command & Scripting (PowerShell)', count: 185 },
          { id: 'T1021', name: 'Remote Services (SMB / RDP)', count: 48 },
          { id: 'T1053', name: 'Scheduled Task / System Job', count: 38 },
          { id: 'T1052', name: 'Exfiltration Over USB Storage', count: 18 }
        ]
      },
      adAudit: {
        dcsync: 6,
        kerberoast: 18,
        spray: 12,
        goldenCert: 3,
        totalAd: 5820,
        topUsers: [
          { user: 'svc_backup', count: 88, role: 'SYSTEM SERVICE', risk: 'SYSTEM SERVICE' },
          { user: 'administrator', count: 64, role: 'LOCAL ADMIN', risk: 'LOCAL ADMIN' },
          { user: 'j.smith', count: 32, role: 'STANDARD USER', risk: 'STANDARD USER' },
          { user: 'm.chen', count: 19, role: 'STANDARD USER', risk: 'STANDARD USER' },
          { user: 'd.ross', count: 14, role: 'STANDARD USER', risk: 'STANDARD USER' }
        ]
      },
      firewall: includeFw ? {
        enabled: true,
        total: 84500,
        blocked: 21400,
        allowed: 63100,
        topPorts: [
          { label: 'Port 3389 (RDP)', count: 8450 },
          { label: 'Port 445 (SMB)', count: 6120 },
          { label: 'Port 22 (SSH)', count: 3200 },
          { label: 'Port 80 (HTTP)', count: 1840 },
          { label: 'Port 53 (DNS)', count: 950 }
        ],
        topSourceIps: [
          { ip: '192.168.1.105 (GIRI)', count: 7850 },
          { ip: '10.0.0.12 (DEFSECONE)', count: 5420 },
          { ip: '192.168.1.50 (LOQ)', count: 3890 },
          { ip: '10.0.0.24 (JOSHWA)', count: 2150 }
        ]
      } : { enabled: false, total: 0, blocked: 0, allowed: 0, topPorts: [], topSourceIps: [] },
      usbDlp: {
        usbCount: 28,
        dlpCount: 14,
        recentList: [
          { ts: '09-29 14:12', machine: 'FIN-WS-09', label: 'SanDisk Ultra', drive: 'E:', action: 'Inserted', severity: 'medium' },
          { ts: '09-28 11:45', machine: 'HR-LAP-04', label: 'Kingston DataTraveler', drive: 'F:', action: 'Threat Found', severity: 'critical' },
          { ts: '09-27 16:30', machine: 'DEV-SRV-02', label: 'Samsung T7 SSD', drive: 'D:', action: 'Inserted', severity: 'low' },
          { ts: '09-26 10:15', machine: 'CEO-LAPTOP', label: 'Crucial X6', drive: 'G:', action: 'Threat Found', severity: 'critical' }
        ]
      },
      fleetDistribution: {
        osList: [
          { os: 'Windows 11 Pro', count: 14, color: '#3b82f6' },
          { os: 'Windows 10 Enterprise', count: 6, color: '#8b5cf6' },
          { os: 'Windows Server 2022', count: 3, color: '#10b981' },
          { os: 'Ubuntu Linux 22.04', count: 1, color: '#f59e0b' }
        ],
        branchList: [
          { branch: 'Chennai HQ', count: 16 },
          { branch: 'Bangalore Branch', count: 8 }
        ]
      },
      fleet: {
        total: 24,
        active: 21,
        inactive: 3,
        staleList: [
          { name: 'MKT-LAP-12', os: 'Windows 10', offlineStr: '6d 18h offline', risk: 'HIGH RISK' },
          { name: 'BACKUP-SRV-01', os: 'Windows Server', offlineStr: '4d 08h offline', risk: 'HIGH RISK' },
          { name: 'FIN-WS-03', os: 'Windows 11', offlineStr: '2d 14h offline', risk: 'MODERATE' }
        ]
      },
      topMachines: [
        { machine: 'DC-SRV-01', ip: '192.168.1.10', os: 'Windows Server 2022', user: 'SYSTEM', crit_count: 6, high_count: 18, total_events: 5420, top_tag: 'DCSYNC', risk: 'CRITICAL RISK' },
        { machine: 'DEV-WS-09', ip: '192.168.1.45', os: 'Windows 11 Pro', user: 'dev_user', crit_count: 4, high_count: 22, total_events: 3120, top_tag: 'MIMIKATZ', risk: 'HIGH RISK' },
        { machine: 'HR-LAP-04', ip: '192.168.2.14', os: 'Windows 10', user: 'hr_lead', crit_count: 2, high_count: 6, total_events: 940, top_tag: 'USB', risk: 'HIGH RISK' }
      ],
      incidents: {
        total: 12,
        open: 3,
        resolved: 9,
        avgResolutionMin: 42,
        topCriticalCards: [
          {
            id: '#INC-104',
            title: 'DCSync Active Directory Replication Rights Abuse',
            priority: 'P1',
            status: 'INVESTIGATING',
            machine: 'DC-SRV-01',
            assigned_to: 'Tier 3 SOC Lead',
            created_at: '2026-09-28 14:15',
            evidence: 'powershell.exe "lsadump::dcsync /domain:corp.local /user:krbtgt" - PID 4812',
            linked_count: 14
          },
          {
            id: '#INC-101',
            title: 'Cobalt Strike Beacon HTTP Post C2 Detection',
            priority: 'P2',
            status: 'INVESTIGATING',
            machine: 'FIN-WS-09',
            assigned_to: 'Tier 2 Analyst',
            created_at: '2026-09-27 09:30',
            evidence: 'HTTPS POST beaconing observed to external threat IP 194.26.29.112:443',
            linked_count: 8
          },
          {
            id: '#INC-94',
            title: 'Kerberoasting High-Volume Ticket Request Anomaly',
            priority: 'P2',
            status: 'RESOLVED',
            machine: 'DC-SRV-02',
            assigned_to: 'Auto-Remediation',
            created_at: '2026-09-25 18:40',
            evidence: '38 Kerberos TGS-REQ service ticket requests within 90 seconds from host 10.0.4.88',
            linked_count: 5
          }
        ],
        register: [
          { id: '#INC-89', date: '09-26 11:20', priority: 'P3', machine: 'HR-LAP-04', title: 'Unauthorized USB Storage Blocked', status: 'RESOLVED' },
          { id: '#INC-86', date: '09-25 14:05', priority: 'P3', machine: 'DEV-SRV-02', title: 'Port Scan Sweep on Subnet 10.0.2.0/24', status: 'RESOLVED' },
          { id: '#INC-83', date: '09-24 16:50', priority: 'P3', machine: 'FIN-WS-03', title: 'Failed NTLM Brute Force Attempt', status: 'RESOLVED' }
        ]
      },
      recommendations: [
        'Immediate Threat Mitigation: Triage DCSync replication alert on DC-SRV-01 and enforce krbtgt account password rotation.',
        'Active Directory Hardening: Revoke Replicating Directory Changes permissions from non-DC service accounts.',
        'Perimeter Defense: Block malicious C2 IP 194.26.29.112 across all perimeter gateway firewalls.',
        'Endpoint Blind Spot Resolution: Bring MKT-LAP-12 (6d offline) and BACKUP-SRV-01 back online to restore continuous sensor telemetry.'
      ]
    };
  }

  if (p === 'monthly') {
    const timeline = [
      { bucket: 'Week 1', total: 22100, crit: 15, high: 78, med: 210, low: 21797 },
      { bucket: 'Week 2', total: 24500, crit: 12, high: 82, med: 195, low: 24211 },
      { bucket: 'Week 3', total: 23800, crit: 14, high: 75, med: 220, low: 23491 },
      { bucket: 'Week 4', total: 23810, crit: 11, high: 75, med: 215, low: 23509 }
    ];

    const categories = [
      { category: 'PROCESSES', n: 4210, color: '#ef4444' },
      { category: 'ENUM', n: 2420, color: '#f97316' },
      { category: 'LOGON', n: 1890, color: '#8b5cf6' },
      { category: 'NETWORK', n: 1430, color: '#3b82f6' },
      { category: 'CONFIG', n: 810, color: '#eab308' },
      { category: 'DEFENDER', n: 460, color: '#06b6d4' },
      { category: 'USB', n: 309, color: '#ec4899' }
    ];

    const sevMap = { critical: 52, high: 310, medium: 840, low: 2890, info: 7437 };

    return {
          scheduleName: 'Monthly Executive Threat Analytics & SOC Audit Dossier',
          generatedAt: nowStr + ' UTC',
          periodLabel: `Monthly Report (${monthAgoDateStr} to ${todayDateStr})`,
          branch: 'All Production Branches',
          machine: 'Enterprise Fleet (4 Endpoints)',
          threatLevel: (sevMap.critical > 0 || sevMap.high > 100) ? 'HIGH' : 'NORMAL',
          tlColor: '#f97316',
          postureScore: 78,
          narrative: `Across the 30-day enterprise auditing period, IOCHunt monitored 4 endpoints (GIRI, DEFSECONE-PC01, LOQ, JOSHWA) and processed ${(ev.total || 11529).toLocaleString()} real security events. ${(sevMap.critical || 1575).toLocaleString()} Critical threats and ${(sevMap.high || 124).toLocaleString()} High alerts were investigated. Fleet availability maintained a 100% continuous heartbeat baseline.`,
          totalEvents: ev.total || 11529,
          critCount: sevMap.critical || 1575,
          highCount: sevMap.high || 124,
          medCount: sevMap.medium || 2828,
          lowCount: (sevMap.low || 1104) + (sevMap.info || 5898),
          trends: { totalTrend: '+14% (Normal)', critTrend: '-8% (Baseline)' },
          timeline,
          categories,
          mitre: {
            tactics: [
              { tactic: 'Execution', count: 3251 },
              { tactic: 'Exfiltration', count: 1096 },
              { tactic: 'Discovery', count: 978 },
              { tactic: 'Defense Evasion', count: 420 },
              { tactic: 'Credential Access', count: 338 },
              { tactic: 'Persistence', count: 211 }
            ]
          },
          topDetections: [
            { name: 'Suspicious Command & Script Execution', tag: 'CMD-EXEC', count: 2010, sev: 'HIGH' },
            { name: 'Data Loss Prevention (DLP) Violation', tag: 'DLP', count: 1017, sev: 'MED' },
            { name: 'Behavioral File Activity (Append/Read)', tag: 'BEHAVIOR', count: 886, sev: 'MED' },
            { name: 'Account & Host Discovery Enumeration', tag: 'ENUM', count: 428, sev: 'LOW' },
            { name: 'Security Agent Tamper Detection', tag: 'TAMPER', count: 402, sev: 'CRIT' }
          ],
          adAudit: {
            dcsync: 0,
            kerberoast: 0,
            spray: 12,
            goldenCert: 0,
            totalAd: 338,
            topUsers: [
              { user: 'GIRI\\admin', count: 278, risk: 'LOCAL ADMIN' },
              { user: 'DEFSECONE-PC01\\system', count: 184, risk: 'SYSTEM SERVICE' },
              { user: 'LOQ\\user', count: 45, risk: 'STANDARD USER' },
              { user: 'JOSHWA\\dev', count: 12, risk: 'STANDARD USER' }
            ]
          },
          firewall: includeFw ? {
            enabled: true,
            total: 32,
            blocked: 8,
            allowed: 24,
            topPorts: [
              { label: 'Port 445 (SMB)', count: 14 },
              { label: 'Port 3389 (RDP)', count: 9 },
              { label: 'Port 5985 (WinRM)', count: 5 },
              { label: 'Port 443 (HTTPS)', count: 3 },
              { label: 'Port 80 (HTTP)', count: 1 }
            ],
            topSourceIps: [
              { ip: '192.168.1.105 (GIRI)', count: 14 },
              { ip: '10.0.0.12 (DEFSECONE)', count: 10 },
              { ip: '192.168.1.50 (LOQ)', count: 5 },
              { ip: '10.0.0.24 (JOSHWA)', count: 3 }
            ]
          } : { enabled: false, total: 0, blocked: 0, allowed: 0, topPorts: [], topSourceIps: [] },
          usbDlp: {
            usbCount: 79,
            dlpCount: 1017,
            recentList: [
              { ts: '09-28 23:59', machine: 'DEFSECONE-PC01', label: 'DLP Directory Access Alert', drive: 'D:', action: 'Folder Not Found', severity: 'medium' },
              { ts: '09-28 21:51', machine: 'DEFSECONE-PC01', label: 'Suspicious Tool cmd.exe', drive: 'C:', action: 'svchost Spawn', severity: 'critical' },
              { ts: '09-28 21:47', machine: 'DEFSECONE-PC01', label: 'Suspicious Tool rundll32', drive: 'C:', action: 'svchost Spawn', severity: 'critical' },
              { ts: '09-27 16:30', machine: 'GIRI', label: 'Mass Storage Device', drive: 'E:', action: 'USB Monitored', severity: 'low' }
            ]
          },
          fleetDistribution: {
            osList: [
              { os: 'Windows 11 Pro', count: 2, color: '#3b82f6' },
              { os: 'Windows 10 Enterprise', count: 1, color: '#8b5cf6' },
              { os: 'Ubuntu Linux 22.04', count: 1, color: '#f59e0b' }
            ],
            branchList: [
              { branch: 'Production Fleet', count: 4 }
            ]
          },
          fleet: {
            total: 4,
            active: 4,
            inactive: 0,
            staleList: []
          },
          topMachines: [
            { machine: 'DEFSECONE-PC01', ip: '106.51.233.42', os: 'Windows 11 Pro', user: 'system', crit_count: 264, high_count: 113, total_events: 3561, top_tag: 'CMD-EXEC', risk: 'CRITICAL RISK' },
            { machine: 'GIRI', ip: '192.168.1.105', os: 'Windows 10 Enterprise', user: 'admin', crit_count: 14, high_count: 18, total_events: 2480, top_tag: 'TAMPER', risk: 'HIGH RISK' },
            { machine: 'LOQ', ip: '192.168.1.50', os: 'Windows 11 Pro', user: 'user', crit_count: 0, high_count: 2, total_events: 1240, top_tag: 'BEHAVIOR', risk: 'LOW RISK' },
            { machine: 'JOSHWA', ip: '10.0.0.24', os: 'Ubuntu Linux 22.04', user: 'dev', crit_count: 0, high_count: 0, total_events: 4248, top_tag: 'LOGON', risk: 'NORMAL' }
          ],
          incidents: {
            total: 6,
            open: 2,
            resolved: 4,
            avgResolutionMin: 22,
            topCriticalCards: [
              {
                id: '#INC-101',
                title: 'Suspicious Tool Execution: cmd.exe Spawned by svchost',
                priority: 'P1',
                status: 'INVESTIGATING',
                machine: 'DEFSECONE-PC01',
                assigned_to: 'Tier 2 Analyst',
                created_at: '2026-09-28 23:51',
                evidence: 'cmd.exe|PID:12268|Parent:svchost.exe|Signed:True|Level:Silent',
                linked_count: 14
              },
              {
                id: '#INC-102',
                title: 'Suspicious Tool Execution: rundll32.exe Spawned by svchost',
                priority: 'P1',
                status: 'INVESTIGATING',
                machine: 'DEFSECONE-PC01',
                assigned_to: 'SOC Lead',
                created_at: '2026-09-28 21:47',
                evidence: 'rundll32.exe|PID:20132|Parent:svchost.exe|Signed:True|Level:Silent',
                linked_count: 11
              },
              {
                id: '#INC-103',
                title: 'High-Volume DLP Directory Missing Trigger (1,017 Events)',
                priority: 'P2',
                status: 'RESOLVED',
                machine: 'DEFSECONE-PC01',
                assigned_to: 'IT Compliance',
                created_at: '2026-09-28 16:27',
                evidence: 'Continuous folder access check: D:\\IOCHunt-Monitor\\def-monitor\\testing',
                linked_count: 1017
              },
              {
                id: '#INC-104',
                title: 'Endpoint Agent Tamper Interception Anomaly',
                priority: 'P1',
                status: 'RESOLVED',
                machine: 'GIRI',
                assigned_to: 'Security Admin',
                created_at: '2026-09-26 14:00',
                evidence: '402 repeated agent hook unregister & tamper signals intercepted',
                linked_count: 402
              }
            ],
            register: [
              { id: '#INC-100', date: '09-27 10:15', priority: 'P3', machine: 'LOQ', title: 'Command Execution Burst Observed', status: 'RESOLVED' },
              { id: '#INC-99', date: '09-26 18:20', priority: 'P3', machine: 'GIRI', title: 'File Append Behavioral Trigger', status: 'RESOLVED' },
              { id: '#INC-98', date: '09-25 12:40', priority: 'P3', machine: 'DEFSECONE-PC01', title: 'USB Mass Storage Device Connected', status: 'RESOLVED' },
              { id: '#INC-97', date: '09-24 08:30', priority: 'P3', machine: 'JOSHWA', title: 'After-Hours Logon Audit Event', status: 'RESOLVED' }
            ]
          },
          recommendations: [
            'Forensic Process Triage: Inspect anomalous svchost child processes (cmd.exe PID 12268, rundll32.exe PID 20132) on endpoint DEFSECONE-PC01.',
            'DLP Policy Alignment: Reconfigure missing folder path D:\\IOCHunt-Monitor\\def-monitor\\testing on DEFSECONE-PC01 to suppress false-positive alarms.',
            'Agent Tamper Security: Review 402 intercepted tamper events on machine GIRI and verify Tamper Protection integrity.',
            'Command Execution Review: Audit command-line execution volume (2,010 events) across GIRI, LOQ, and DEFSECONE-PC01.'
          ]
      };
  }

  // Default: Daily (24 Hours)
  return {
    scheduleName: 'Daily Executive Threat Analytics & SOC Briefing',
    generatedAt: nowStr + ' UTC',
    periodLabel: `1 Day Report (${yesterdayDateStr} to ${todayDateStr})`,
    branch: 'Chennai HQ',
    machine: 'All Endpoints',
    threatLevel: 'HIGH',
    tlColor: '#f97316',
    postureScore: 82,
    narrative: 'During this reporting window (Last 24 Hours), IOCHunt monitored 24 endpoints and analyzed 3,420 security events across 3 network branches. 4 Critical alerts and 2 active incidents were identified requiring immediate SOC investigation. 2 endpoint(s) are currently inactive, presenting potential monitoring blind spots.',
    totalEvents: 3420,
    critCount: 4,
    highCount: 18,
    medCount: 45,
    lowCount: 3353,
    trends: { totalTrend: '+14% (Up)', critTrend: '-50% (Down)' },
    timeline: [
      { bucket: '14:00', total: 110, crit: 0, high: 2, med: 5, low: 103 },
      { bucket: '16:00', total: 145, crit: 0, high: 4, med: 8, low: 133 },
      { bucket: '18:00', total: 220, crit: 1, high: 6, med: 14, low: 199 },
      { bucket: '20:00', total: 85, crit: 0, high: 1, med: 3, low: 81 },
      { bucket: '22:00', total: 70, crit: 0, high: 0, med: 2, low: 68 },
      { bucket: '00:00', total: 60, crit: 0, high: 1, med: 2, low: 57 },
      { bucket: '02:00', total: 340, crit: 2, high: 8, med: 15, low: 315 },
      { bucket: '04:00', total: 260, crit: 1, high: 5, med: 10, low: 244 },
      { bucket: '06:00', total: 95, crit: 0, high: 2, med: 4, low: 89 },
      { bucket: '08:00', total: 460, crit: 0, high: 12, med: 22, low: 426 },
      { bucket: '10:00', total: 890, crit: 0, high: 18, med: 35, low: 837 },
      { bucket: '12:00', total: 685, crit: 0, high: 10, med: 25, low: 650 }
    ],
    categories: [
      { category: 'PROCESSES', n: 1450, color: '#ef4444' },
      { category: 'DOMAIN / AD', n: 820, color: '#8b5cf6' },
      { category: 'NETWORK', n: 540, color: '#3b82f6' },
      { category: 'POWERSHELL', n: 320, color: '#f97316' },
      { category: 'USB / STORAGE', n: 180, color: '#eab308' },
      { category: 'DLP POLICIES', n: 110, color: '#ec4899' }
    ],
    mitre: {
      tactics: [
        { tactic: 'Credential Access', count: 18 },
        { tactic: 'Defense Evasion', count: 14 },
        { tactic: 'Discovery', count: 28 },
        { tactic: 'Execution', count: 42 },
        { tactic: 'Lateral Movement', count: 9 },
        { tactic: 'Persistence', count: 12 },
        { tactic: 'Exfiltration', count: 5 }
      ],
      topTechniques: [
        { id: 'T1003', name: 'OS Credential Dumping (DCSync)', count: 18 },
        { id: 'T1059', name: 'Command & Scripting (PowerShell)', count: 42 },
        { id: 'T1021', name: 'Remote Services (SMB / RDP)', count: 9 },
        { id: 'T1053', name: 'Scheduled Task / System Job', count: 12 },
        { id: 'T1052', name: 'Exfiltration Over USB Storage', count: 5 }
      ]
    },
    adAudit: {
      dcsync: 2,
      kerberoast: 5,
      spray: 3,
      goldenCert: 1,
      totalAd: 820,
      topUsers: [
        { user: 'svc_backup', count: 24, role: 'SYSTEM SERVICE', risk: 'SYSTEM SERVICE' },
        { user: 'administrator', count: 18, role: 'LOCAL ADMIN', risk: 'LOCAL ADMIN' },
        { user: 'j.smith', count: 7, role: 'STANDARD USER', risk: 'STANDARD USER' }
      ]
    },
    firewall: includeFw ? {
      enabled: true,
      total: 12450,
      blocked: 3120,
      allowed: 9330,
      topPorts: [
        { label: 'Port 3389 (RDP)', count: 1420 },
        { label: 'Port 445 (SMB)', count: 980 },
        { label: 'Port 22 (SSH)', count: 450 },
        { label: 'Port 80 (HTTP)', count: 180 },
        { label: 'Port 53 (DNS)', count: 90 }
      ],
      topSourceIps: [
        { ip: '192.168.1.105 (GIRI)', count: 1240 },
        { ip: '10.0.0.12 (DEFSECONE)', count: 890 },
        { ip: '192.168.1.50 (LOQ)', count: 540 },
        { ip: '10.0.0.24 (JOSHWA)', count: 310 }
      ]
    } : { enabled: false, total: 0, blocked: 0, allowed: 0, topPorts: [], topSourceIps: [] },
    usbDlp: {
      usbCount: 6,
      dlpCount: 2,
      recentList: [
        { ts: '09-29 14:12', machine: 'FIN-WS-09', label: 'SanDisk Ultra', drive: 'E:', action: 'Inserted', severity: 'medium' },
        { ts: '09-29 11:45', machine: 'HR-LAP-04', label: 'Kingston DataTraveler', drive: 'F:', action: 'Threat Found', severity: 'critical' },
        { ts: '09-29 09:20', machine: 'DEV-SRV-02', label: 'Samsung T7 SSD', drive: 'D:', action: 'Inserted', severity: 'low' }
      ]
    },
    fleetDistribution: {
      osList: [
        { os: 'Windows 11 Pro', count: 14, color: '#3b82f6' },
        { os: 'Windows 10 Enterprise', count: 6, color: '#8b5cf6' },
        { os: 'Windows Server 2022', count: 3, color: '#10b981' },
        { os: 'Ubuntu Linux 22.04', count: 1, color: '#f59e0b' }
      ],
      branchList: [
        { branch: 'Chennai HQ', count: 16 },
        { branch: 'Bangalore Branch', count: 8 }
      ]
    },
    fleet: {
      total: 24,
      active: 22,
      inactive: 2,
      staleList: [
        { name: 'MKT-LAP-12', os: 'Windows 10', offlineStr: '4d 12h offline', risk: 'HIGH RISK' },
        { name: 'BACKUP-SRV-01', os: 'Windows Server', offlineStr: '1d 08h offline', risk: 'MODERATE' }
      ]
    },
    incidents: {
      total: 3,
      open: 1,
      resolved: 2,
      avgResolutionMin: 34,
      topCriticalCards: [
        {
          id: '#INC-104',
          title: 'DCSync Active Directory Replication Rights Abuse',
          priority: 'P1',
          status: 'INVESTIGATING',
          machine: 'DC-SRV-01',
          assigned_to: 'Tier 3 SOC Lead',
          created_at: '2026-09-29 02:14',
          evidence: 'powershell.exe "lsadump::dcsync /domain:corp.local /user:krbtgt" - PID 4812',
          linked_count: 8
        },
        {
          id: '#INC-101',
          title: 'Cobalt Strike Beacon HTTP Post Detection',
          priority: 'P2',
          status: 'RESOLVED',
          machine: 'FIN-WS-09',
          assigned_to: 'Automated Quarantine',
          created_at: '2026-09-29 04:30',
          evidence: 'C2 beaconing observed to malicious external IP 194.26.29.112:443',
          linked_count: 3
        }
      ],
      register: [
        { id: '#INC-98', date: '09-28 18:22', priority: 'P3', machine: 'HR-LAP-04', title: 'Unauthorized USB Storage Blocked', status: 'RESOLVED' }
      ]
    },
    recommendations: [
      'Immediate Threat Mitigation: Triage DCSync replication alert on DC-SRV-01 and rotate Kerberos krbtgt account password.',
      'Active Directory Hardening: Audit replication permissions (DS-Replication-Get-Changes-All) on domain controllers.',
      'Perimeter Defense: Ensure firewall drop rules are actively enforced on inbound port 3389 and 445.',
      'Fleet Sensor Coverage: Reconnect MKT-LAP-12 (4d 12h offline) to eliminate monitoring blind spots.'
    ]
  };
}

/**
 * Builds all report data and compiles the Executive Intelligence PDF buffer.
 * Reusable for both automated schedule dispatch and live instant preview download.
 */
async function buildReportDataAndPdf(options, queryFn = null) {
  const period = (options.period || '').toLowerCase();
  const now = new Date();

  // If simulation is explicitly requested, generate rich period-specific simulation dataset
  if (options.simulated) {
    const reportData = getSimulatedReportData(period, Boolean(options.include_fw));
    if (options.name) reportData.scheduleName = options.name;
    const pdfBuffer = await generatePdfReport(reportData);
    return {
      pdfBuffer,
      reportData,
      now,
      nowStr: reportData.generatedAt,
      durLabel: reportData.periodLabel,
      threatLevel: reportData.threatLevel,
      tlColor: reportData.tlColor,
      postureScore: reportData.postureScore,
      narrative: reportData.narrative,
      totalEvents: reportData.totalEvents,
      critCount: reportData.critCount,
      highCount: reportData.highCount,
      medCount: reportData.medCount,
      lowCount: reportData.lowCount,
      totalTrend: reportData.trends?.totalTrend || 'Baseline',
      critTrend: reportData.trends?.critTrend || 'Baseline',
      categories: reportData.categories,
      topMachines: reportData.topMachines || [],
      topThreats: reportData.topThreats || [],
      staleList: reportData.fleet?.staleList || [],
      incidents: reportData.incidents,
      firewall: reportData.firewall,
      recommendations: reportData.recommendations
    };
  }

  const q = queryFn || db.query.bind(db);
  const includeFw = options.include_fw !== undefined
    ? (Number(options.include_fw) === 1 || options.include_fw === true || options.include_fw === '1' || options.include_fw === 'true')
    : false;
  const to = now.toISOString().slice(0, 19).replace('T', ' ');
  let from;
  let durLabel = '1 Day Report';

  const cronExpr = (options.cron_expr || '').trim();

  if (period === 'weekly' || cronExpr.endsWith('* * 1') || cronExpr.endsWith('1') || cronExpr.includes('* * 1')) {
    from = new Date(now.getTime() - 7 * 24 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
    const fromDateStr = from.slice(0, 10);
    const toDateStr = to.slice(0, 10);
    durLabel = `Weekly Report (${fromDateStr} to ${toDateStr})`;
  } else if (period === 'monthly' || cronExpr.includes(' 1 * *') || cronExpr.startsWith('0 8 1 * *')) {
    from = new Date(now.getTime() - 30 * 24 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
    const fromDateStr = from.slice(0, 10);
    const toDateStr = to.slice(0, 10);
    durLabel = `Monthly Report (${fromDateStr} to ${toDateStr})`;
  } else if (period === 'daily' || cronExpr.startsWith('0 8 * * *') || cronExpr.startsWith('0 08 * * *') || cronExpr.match(/^0 \d+ \* \* \*$/)) {
    from = new Date(now.getTime() - 24 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
    const fromDateStr = from.slice(0, 10);
    const toDateStr = to.slice(0, 10);
    durLabel = `1 Day Report (${fromDateStr} to ${toDateStr})`;
  } else if (options.last_run) {
    const lastRunMs = Number(options.last_run) * 1000;
    from = new Date(lastRunMs).toISOString().slice(0, 19).replace('T', ' ');
    const fromDateStr = from.slice(0, 10);
    const toDateStr = to.slice(0, 10);
    durLabel = fromDateStr === toDateStr ? `1 Day Report (${toDateStr})` : `Report (${fromDateStr} to ${toDateStr})`;
  } else {
    const hours = Number(options.duration) || 24;
    from = new Date(now.getTime() - hours * 3600000).toISOString().slice(0, 19).replace('T', ' ');
    const fromDateStr = from.slice(0, 10);
    const toDateStr = to.slice(0, 10);
    if (hours === 24) {
      durLabel = `1 Day Report (${fromDateStr} to ${toDateStr})`;
    } else if (hours === 168) {
      durLabel = `Weekly Report (${fromDateStr} to ${toDateStr})`;
    } else if (hours === 720) {
      durLabel = `Monthly Report (${fromDateStr} to ${toDateStr})`;
    } else if (hours === 72) {
      durLabel = `3 Days Report (${fromDateStr} to ${toDateStr})`;
    } else if (hours === 1) {
      durLabel = `1 Hour Report (${fromDateStr} to ${toDateStr})`;
    } else if (hours === 4) {
      durLabel = `4 Hours Report (${fromDateStr} to ${toDateStr})`;
    } else {
      const days = Math.round(hours / 24);
      durLabel = days > 1 ? `${days} Days Report (${fromDateStr} to ${toDateStr})` : `1 Day Report (${fromDateStr} to ${toDateStr})`;
    }
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  const windowMs = toDate.getTime() - fromDate.getTime();
  const prevFromDate = new Date(fromDate.getTime() - windowMs);
  const prevFrom = prevFromDate.toISOString().slice(0, 19).replace('T', ' ');
  const prevTo = from;

  const fromEpoch = Math.floor(fromDate.getTime() / 1000);
  const toEpoch = Math.floor(toDate.getTime() / 1000);

  // ── Build Base WHERE Clauses ────────────────────────────────────────────────
  const baseNoiseFilter = "is_noise = false AND message NOT ILIKE '%iochuntwatchdog%' AND tag NOT ILIKE '%iochuntwatchdog%' AND message NOT ILIKE '%net1.exe%' AND message NOT ILIKE '%system32\\\\net1%'";

  const evConds = ['ts >= $1', 'ts <= $2', baseNoiseFilter];
  const evParams = [from, to];
  let pIdx = 3;

  if (options.aggregator) {
    const aggrs = options.aggregator.split(',').map(s => s.trim()).filter(Boolean);
    if (aggrs.length > 0) {
      const inClause = aggrs.map((_, i) => `$${pIdx + i}`).join(',');
      evConds.push(`aggregator_name IN (${inClause})`);
      aggrs.forEach(a => evParams.push(a));
      pIdx += aggrs.length;
    }
  }
  if (options.machine) {
    evConds.push(`(machine = $${pIdx} OR label = $${pIdx})`);
    evParams.push(options.machine);
    pIdx++;
  }
  if (options.severity) {
    evConds.push(`LOWER(severity) = $${pIdx}`);
    evParams.push(options.severity.toLowerCase());
    pIdx++;
  }
  if (options.category) {
    evConds.push(`(category ILIKE $${pIdx} OR tag ILIKE $${pIdx})`);
    evParams.push(`%${options.category}%`);
    pIdx++;
  }
  const evWhere = 'WHERE ' + evConds.join(' AND ');

  // Previous period WHERE clause for trends
  const prevEvConds = ['ts >= $1', 'ts < $2', baseNoiseFilter];
  const prevEvParams = [prevFrom, prevTo];
  let prevIdx = 3;
  if (options.aggregator) {
    const aggrs = options.aggregator.split(',').map(s => s.trim()).filter(Boolean);
    if (aggrs.length > 0) {
      const inClause = aggrs.map((_, i) => `$${prevIdx + i}`).join(',');
      prevEvConds.push(`aggregator_name IN (${inClause})`);
      aggrs.forEach(a => prevEvParams.push(a));
      prevIdx += aggrs.length;
    }
  }
  if (options.machine) {
    prevEvConds.push(`(machine = $${prevIdx} OR label = $${prevIdx})`);
    prevEvParams.push(options.machine);
    prevIdx++;
  }
  if (options.severity) {
    prevEvConds.push(`LOWER(severity) = $${prevIdx}`);
    prevEvParams.push(options.severity.toLowerCase());
    prevIdx++;
  }
  if (options.category) {
    prevEvConds.push(`(category ILIKE $${prevIdx} OR tag ILIKE $${prevIdx})`);
    prevEvParams.push(`%${options.category}%`);
    prevIdx++;
  }
  const prevEvWhere = 'WHERE ' + prevEvConds.join(' AND ');

  // ── Query Current Telemetry & Severity Counts ───────────────────────────────
  const totalEventsRes = await q(`SELECT COUNT(*) AS n FROM events ${evWhere}`, evParams);
  const totalEvents = parseInt(totalEventsRes.rows[0]?.n || 0, 10);

  const bySeverityRes = await q(
    `SELECT LOWER(severity) as severity, COUNT(*) AS n FROM events ${evWhere}
     GROUP BY LOWER(severity)`, evParams
  );
  const sevMap = {};
  (bySeverityRes.rows || []).forEach(r => { sevMap[r.severity] = parseInt(r.n, 10); });
  const critCount = sevMap.critical || 0;
  const highCount = sevMap.high || 0;
  const medCount = sevMap.medium || 0;
  const lowCount = (sevMap.low || 0) + (sevMap.info || 0);

  // ── Query Previous Period Telemetry for Trend Percentages ──────────────────
  let totalTrend = 'Baseline';
  let critTrend = 'Baseline';
  try {
    const prevRes = await q(
      `SELECT COUNT(*) as n, COUNT(*) FILTER (WHERE LOWER(severity) = 'critical') as crit_n FROM events ${prevEvWhere}`,
      prevEvParams
    );
    const prevTotal = parseInt(prevRes.rows[0]?.n || 0, 10);
    const prevCrit = parseInt(prevRes.rows[0]?.crit_n || 0, 10);

    if (prevTotal > 0) {
      const diff = Math.round(((totalEvents - prevTotal) / prevTotal) * 100);
      totalTrend = diff > 0 ? `+${diff}% (Up)` : diff < 0 ? `${diff}% (Down)` : '0% (Stable)';
    } else {
      totalTrend = totalEvents > 0 ? `+${totalEvents} New` : '0 Baseline';
    }

    if (prevCrit > 0) {
      const diff = Math.round(((critCount - prevCrit) / prevCrit) * 100);
      critTrend = diff > 0 ? `+${diff}% (Up)` : diff < 0 ? `${diff}% (Down)` : '0% (Stable)';
    } else {
      critTrend = critCount > 0 ? `+${critCount} New` : 'Zero Crit';
    }
  } catch (trendErr) {
    console.warn('[REPORT BUILDER] Trend calculation error:', trendErr.message);
  }

  // ── Query Multi-Severity Stacked Timeline ──────────────────────────────────
  let timeline = [];
  try {
    if (windowMs <= 48 * 3600000) {
      const tlRes = await q(
        `SELECT 
           TO_CHAR(DATE_TRUNC('hour', ts), 'HH24:00') as bucket,
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE LOWER(severity) = 'critical') as crit,
           COUNT(*) FILTER (WHERE LOWER(severity) = 'high') as high,
           COUNT(*) FILTER (WHERE LOWER(severity) = 'medium') as med,
           COUNT(*) FILTER (WHERE LOWER(severity) IN ('low', 'info')) as low
         FROM events ${evWhere}
         GROUP BY DATE_TRUNC('hour', ts)
         ORDER BY DATE_TRUNC('hour', ts) ASC`,
        evParams
      );
      timeline = (tlRes.rows || []).map(r => ({
        bucket: r.bucket,
        total: parseInt(r.total || 0, 10),
        crit: parseInt(r.crit || 0, 10),
        high: parseInt(r.high || 0, 10),
        med: parseInt(r.med || 0, 10),
        low: parseInt(r.low || 0, 10)
      }));
    } else {
      const tlRes = await q(
        `SELECT 
           TO_CHAR(DATE_TRUNC('day', ts), 'MM-DD') as bucket,
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE LOWER(severity) = 'critical') as crit,
           COUNT(*) FILTER (WHERE LOWER(severity) = 'high') as high,
           COUNT(*) FILTER (WHERE LOWER(severity) = 'medium') as med,
           COUNT(*) FILTER (WHERE LOWER(severity) IN ('low', 'info')) as low
         FROM events ${evWhere}
         GROUP BY DATE_TRUNC('day', ts)
         ORDER BY DATE_TRUNC('day', ts) ASC`,
        evParams
      );
      timeline = (tlRes.rows || []).map(r => ({
        bucket: r.bucket,
        total: parseInt(r.total || 0, 10),
        crit: parseInt(r.crit || 0, 10),
        high: parseInt(r.high || 0, 10),
        med: parseInt(r.med || 0, 10),
        low: parseInt(r.low || 0, 10)
      }));
    }
  } catch (tlErr) {
    console.warn('[REPORT BUILDER] Timeline query error:', tlErr.message);
  }

  if (timeline.length === 0) {
    timeline = [{ bucket: 'Period', total: totalEvents, crit: critCount, high: highCount, med: medCount, low: lowCount }];
  }

  // ── Query Categories ────────────────────────────────────────────────────────
  const byCategoryRes = await q(
    `SELECT category, COUNT(*) AS n FROM events ${evWhere}
     AND category IS NOT NULL AND category != ''
     GROUP BY category ORDER BY n DESC LIMIT 8`,
    evParams
  );
  const catColors = {
    PROCESSES: '#ef4444',
    DOMAIN: '#8b5cf6',
    ADCS: '#06b6d4',
    NETWORK: '#3b82f6',
    POWERSHELL: '#f97316',
    PERSISTENCE: '#a855f7',
    USB: '#eab308',
    DLP: '#ec4899',
    LOGON: '#10b981',
    SYSTEM: '#64748b'
  };

  const categories = (byCategoryRes.rows || []).map(r => {
    const count = parseInt(r.n, 10);
    const catName = String(r.category || 'OTHER').toUpperCase();
    return {
      category: catName,
      n: count,
      color: catColors[catName] || '#3b82f6'
    };
  });

  // ── Query Machines Fleet & Inactivity ───────────────────────────────────────
  const isSingleMachine = Boolean(options.machine);
  let fleet;
  let allMachines = [];
  const machinesMap = new Map();

  if (isSingleMachine) {
    const machRes = await q(
      `SELECT 
         id, name, label, ip, os, "user", last_seen, aggregator_name, event_count,
         EXTRACT(EPOCH FROM (NOW() - last_seen)) as offline_seconds
       FROM machines
       WHERE name = $1 OR label = $1 OR id::text = $1
       LIMIT 1`,
      [options.machine]
    );
    const targetMachine = machRes.rows[0] || {
      name: options.machine,
      label: options.machine,
      ip: '-',
      os: 'Windows',
      user: 'system',
      last_seen: new Date(),
      offline_seconds: 0,
      aggregator_name: options.aggregator || 'Direct'
    };
    allMachines = [targetMachine];
    machinesMap.set(targetMachine.name, targetMachine);
    machinesMap.set(targetMachine.id, targetMachine);

    const isOnline = (Number(targetMachine.offline_seconds) || 0) <= 1800;
    const totalFleet = 1;
    const activeFleet = isOnline ? 1 : 0;
    const inactiveFleet = isOnline ? 0 : 1;

    const staleList = isOnline ? [] : [{
      name: targetMachine.name || options.machine,
      ip: targetMachine.ip || '-',
      os: targetMachine.os || 'Windows',
      last_seen: formatTs(targetMachine.last_seen).slice(0, 16),
      offlineStr: formatOfflineDuration(Number(targetMachine.offline_seconds) || 0),
      risk: 'OFFLINE'
    }];

    fleet = {
      total: totalFleet,
      active: activeFleet,
      inactive: inactiveFleet,
      staleList,
      isSingleMachine: true,
      machineInfo: {
        name: targetMachine.name || options.machine,
        label: targetMachine.label || targetMachine.name || options.machine,
        ip: targetMachine.ip || '-',
        os: targetMachine.os || 'Windows',
        user: targetMachine.user || 'system',
        aggregator_name: targetMachine.aggregator_name || 'Direct',
        isOnline,
        lastSeenStr: formatTs(targetMachine.last_seen).slice(0, 16),
        offlineStr: formatOfflineDuration(Number(targetMachine.offline_seconds) || 0)
      }
    };
  } else {
    let machQuery = `
      SELECT 
        id, name, label, ip, os, "user", last_seen, aggregator_name, event_count,
        EXTRACT(EPOCH FROM (NOW() - last_seen)) as offline_seconds
      FROM machines
    `;
    const machParams = [];
    if (options.aggregator) {
      const aggrs = options.aggregator.split(',').map(s => s.trim()).filter(Boolean);
      if (aggrs.length > 0) {
        const inClause = aggrs.map((_, i) => `$${i + 1}`).join(',');
        machQuery += ` WHERE aggregator_name IN (${inClause})`;
        aggrs.forEach(a => machParams.push(a));
      }
    }
    machQuery += ' ORDER BY last_seen ASC';

    const machinesRes = await q(machQuery, machParams);
    allMachines = machinesRes.rows || [];
    allMachines.forEach(m => {
      machinesMap.set(m.name, m);
      machinesMap.set(m.id, m);
    });

    const totalFleet = allMachines.length;
    const activeFleet = allMachines.filter(m => (Number(m.offline_seconds) || 0) <= 1800).length;
    const inactiveFleet = totalFleet - activeFleet;

    const staleList = allMachines
      .filter(m => (Number(m.offline_seconds) || 0) > 1800)
      .sort((a, b) => (Number(b.offline_seconds) || 0) - (Number(a.offline_seconds) || 0))
      .slice(0, 6)
      .map(m => {
        const secs = Number(m.offline_seconds) || 0;
        const days = secs / 86400;
        const risk = days >= 7 ? 'HIGH RISK' : days >= 2 ? 'MODERATE' : 'LOW RISK';
        return {
          name: m.name || m.id,
          ip: m.ip || '-',
          os: m.os || 'Windows',
          last_seen: formatTs(m.last_seen).slice(0, 16),
          offlineStr: formatOfflineDuration(secs),
          risk
        };
      });

    fleet = {
      total: totalFleet,
      active: activeFleet,
      inactive: inactiveFleet,
      staleList,
      isSingleMachine: false
    };
  }

  const totalFleet = fleet.total;
  const staleList = fleet.staleList;

  // ── Query Top Targeted Endpoints ──────────────────────────────────────────
  let topMachines = [];
  if (isSingleMachine) {
    const tInfo = fleet.machineInfo;
    let topTag = 'General Activity';
    try {
      const tagRes = await q(
        `SELECT tag, COUNT(*) as count FROM events ${evWhere} AND tag IS NOT NULL AND tag != '' GROUP BY tag ORDER BY count DESC LIMIT 1`,
        evParams
      );
      topTag = tagRes.rows[0]?.tag || 'General Activity';
    } catch (_) { }

    topMachines = [{
      machine: tInfo.name,
      ip: tInfo.ip,
      os: tInfo.os,
      user: tInfo.user,
      crit_count: critCount,
      high_count: highCount,
      total_events: totalEvents,
      top_tag: topTag
    }];
  } else {
    const topMachinesRes = await q(
      `SELECT 
         machine,
         COUNT(*) as total_events,
         COUNT(*) FILTER (WHERE LOWER(severity) = 'critical') as crit_count,
         COUNT(*) FILTER (WHERE LOWER(severity) = 'high') as high_count
       FROM events ${evWhere}
       GROUP BY machine
       ORDER BY crit_count DESC, high_count DESC, total_events DESC
       LIMIT 5`,
      evParams
    );

    for (const row of (topMachinesRes.rows || [])) {
      const mMeta = machinesMap.get(row.machine) || {};
      const tagRes = await q(
        `SELECT tag, COUNT(*) as count FROM events ${evWhere} AND machine = $${pIdx} AND tag IS NOT NULL AND tag != '' GROUP BY tag ORDER BY count DESC LIMIT 1`,
        [...evParams, row.machine]
      );
      const topTag = tagRes.rows[0]?.tag || 'General Activity';

      topMachines.push({
        machine: row.machine,
        ip: mMeta.ip || '-',
        os: mMeta.os || '-',
        user: mMeta.user || 'system',
        crit_count: parseInt(row.crit_count || 0, 10),
        high_count: parseInt(row.high_count || 0, 10),
        total_events: parseInt(row.total_events || 0, 10),
        top_tag: topTag
      });
    }
  }

  // ── Query Top Threat Signatures ─────────────────────────────────────────────
  const topThreatsRes = await q(
    `SELECT 
       tag,
       category,
       LOWER(severity) as severity,
       COUNT(*) as count
     FROM events ${evWhere} AND tag IS NOT NULL AND tag != ''
     GROUP BY tag, category, LOWER(severity)
     ORDER BY 
       CASE LOWER(severity)
         WHEN 'critical' THEN 0
         WHEN 'high' THEN 1
         WHEN 'medium' THEN 2
         ELSE 3
       END,
       count DESC
     LIMIT 8`,
    evParams
  );
  const topThreats = (topThreatsRes.rows || []).map(r => ({
    tag: r.tag,
    category: r.category || 'SYSTEM',
    severity: r.severity || 'low',
    count: parseInt(r.count || 0, 10)
  }));

  // ── Query Incidents Briefing & Ranked Forensic Case Cards ───────────────────
  let incidentsData = { total: 0, open: 0, resolved: 0, avgResolutionMin: 0, topCriticalCards: [], register: [] };
  try {
    const incConds = ['i.created_at >= $1', 'i.created_at <= $2'];
    const incParams = [fromEpoch, toEpoch];
    let incIdx = 3;

    if (options.machine) {
      incConds.push(`(
        i.machine = $${incIdx} 
        OR i.machine = (SELECT label FROM machines WHERE name = $${incIdx} LIMIT 1)
        OR EXISTS (
          SELECT 1 FROM incident_events ie 
          JOIN events e ON ie.event_id = e.id 
          WHERE ie.incident_id = i.id AND (e.machine = $${incIdx} OR e.label = $${incIdx})
        )
      )`);
      incParams.push(options.machine);
      incIdx++;
    }

    if (options.aggregator) {
      const aggrs = options.aggregator.split(',').map(s => s.trim()).filter(Boolean);
      if (aggrs.length > 0) {
        const inClause = aggrs.map((_, i) => `$${incIdx + i}`).join(',');
        incConds.push(`(
          i.machine IN (SELECT name FROM machines WHERE aggregator_name IN (${inClause}))
          OR i.machine IN (SELECT label FROM machines WHERE aggregator_name IN (${inClause}))
          OR EXISTS (
            SELECT 1 FROM incident_events ie 
            JOIN events e ON ie.event_id = e.id 
            WHERE ie.incident_id = i.id AND e.aggregator_name IN (${inClause})
          )
        )`);
        aggrs.forEach(a => incParams.push(a));
        incIdx += aggrs.length;
      }
    }

    if (options.severity) {
      const sevLower = options.severity.toLowerCase();
      if (sevLower === 'critical') {
        incConds.push(`i.priority = 'P1'`);
      } else if (sevLower === 'high') {
        incConds.push(`i.priority IN ('P1', 'P2')`);
      } else if (sevLower === 'medium') {
        incConds.push(`i.priority IN ('P1', 'P2', 'P3')`);
      }
    }

    const incWhere = 'WHERE ' + incConds.join(' AND ');

    // 1. Get total stats & resolution metrics
    const allIncRes = await q(
      `SELECT i.id, i.title, i.description, i.status, i.priority, i.assigned_to, i.machine, i.created_at, i.resolved_at
       FROM incidents i
       ${incWhere}
       ORDER BY i.created_at DESC`,
      incParams
    );
    const incRows = allIncRes.rows || [];
    const totalInc = incRows.length;
    const openInc = incRows.filter(i => ['new', 'investigating', 'contained', 'assigned', 'open'].includes((i.status || '').toLowerCase())).length;
    const resolvedInc = incRows.filter(i => ['resolved', 'closed'].includes((i.status || '').toLowerCase())).length;

    const resolvedWithTimes = incRows.filter(i => i.resolved_at && Number(i.resolved_at) > Number(i.created_at));
    let avgMin = 0;
    if (resolvedWithTimes.length > 0) {
      const sumSec = resolvedWithTimes.reduce((acc, i) => acc + (Number(i.resolved_at) - Number(i.created_at)), 0);
      avgMin = Math.round(sumSec / resolvedWithTimes.length / 60);
    }

    // 2. Query Ranked Top 3-5 Critical Incidents using 4-tier formula
    const rankedRes = await q(
      `SELECT 
         i.*,
         COUNT(ie.event_id) AS linked_evidence_count
       FROM incidents i
       LEFT JOIN incident_events ie ON i.id = ie.incident_id
       ${incWhere}
       GROUP BY i.id
       ORDER BY 
         CASE 
           WHEN i.priority = 'P1' THEN 1
           WHEN i.priority = 'P2' THEN 2
           WHEN i.priority = 'P3' THEN 3
           ELSE 4
         END ASC,
         CASE 
           WHEN LOWER(i.status) NOT IN ('resolved', 'closed') THEN 1 
           ELSE 2 
         END ASC,
         COUNT(ie.event_id) DESC,
         i.created_at DESC
       LIMIT 5`,
      incParams
    );

    const topCards = [];
    const topCardIds = new Set();
    for (const r of (rankedRes.rows || [])) {
      topCardIds.add(r.id);
      let evidenceMsg = '';
      try {
        const evRes = await q(
          `SELECT e.message, e.tag, e.ts, e.data
           FROM events e
           JOIN incident_events ie ON e.id = ie.event_id
           WHERE ie.incident_id = $1
           ORDER BY e.ts DESC LIMIT 1`,
          [r.id]
        );
        evidenceMsg = evRes.rows[0]?.message || r.description || 'Forensic investigation triggered by automated correlation rule.';
      } catch (_) {
        evidenceMsg = r.description || 'Telemetry anomaly verified by SOC sensor.';
      }

      topCards.push({
        id: `#INC-${r.id}`,
        title: r.title || 'Threat Incident Investigation',
        priority: r.priority || 'P2',
        status: (r.status || 'NEW').toUpperCase(),
        machine: r.machine || '-',
        assigned_to: r.assigned_to || 'SOC Queue',
        created_at: formatTs(r.created_at ? new Date(Number(r.created_at) * 1000) : new Date()).slice(0, 16),
        evidence: evidenceMsg.slice(0, 180),
        linked_count: parseInt(r.linked_evidence_count || 0, 10)
      });
    }

    // Remaining incidents go to compact register table (capped at 6)
    const remainingList = incRows
      .filter(i => !topCardIds.has(i.id))
      .slice(0, 6)
      .map(i => ({
        id: `#INC-${i.id}`,
        date: formatTs(i.created_at ? new Date(Number(i.created_at) * 1000) : new Date()).slice(5, 16),
        priority: i.priority || 'P2',
        machine: i.machine || '-',
        title: (i.title || 'General Incident').slice(0, 42),
        status: (i.status || 'NEW').toUpperCase()
      }));

    incidentsData = {
      total: totalInc,
      open: openInc,
      resolved: resolvedInc,
      avgResolutionMin: avgMin,
      topCriticalCards: topCards,
      register: remainingList
    };
  } catch (incErr) {
    console.warn('[REPORT BUILDER] Incidents query error:', incErr.message);
  }

  // ── Query MITRE ATT&CK Framework Mapping ──────────────────────────────────
  let mitre = {
    tactics: [
      { tactic: 'Credential Access', count: 0 },
      { tactic: 'Defense Evasion', count: 0 },
      { tactic: 'Discovery', count: 0 },
      { tactic: 'Execution', count: 0 },
      { tactic: 'Lateral Movement', count: 0 },
      { tactic: 'Persistence', count: 0 },
      { tactic: 'Exfiltration', count: 0 }
    ],
    topTechniques: []
  };

  try {
    const mitreRes = await q(
      `SELECT 
         CASE 
           WHEN tag ILIKE '%DCSYNC%' OR tag ILIKE '%KERB%' OR tag ILIKE '%MIMIKATZ%' OR tag ILIKE '%LSASS%' OR tag ILIKE '%SPRAY%' OR tag ILIKE '%NTLM%' OR tag ILIKE '%HASH%' OR tag ILIKE '%CRED%' THEN 'Credential Access'
           WHEN tag ILIKE '%INJECT%' OR tag ILIKE '%CLEAR%' OR tag ILIKE '%DEFENDER%' OR tag ILIKE '%MASQUERAD%' OR tag ILIKE '%BYPASS%' THEN 'Defense Evasion'
           WHEN tag ILIKE '%ENUM%' OR tag ILIKE '%SCAN%' OR tag ILIKE '%WHOAMI%' OR tag ILIKE '%RECON%' OR tag ILIKE '%NET-VIEW%' THEN 'Discovery'
           WHEN tag ILIKE '%POWERSHELL%' OR tag ILIKE '%CMD%' OR tag ILIKE '%WMI%' OR tag ILIKE '%SCRIPT%' OR category = 'PROCESSES' THEN 'Execution'
           WHEN tag ILIKE '%PSEXEC%' OR tag ILIKE '%SMB%' OR tag ILIKE '%WINRM%' OR tag ILIKE '%RDP%' OR tag ILIKE '%LATERAL%' THEN 'Lateral Movement'
           WHEN tag ILIKE '%STARTUP%' OR tag ILIKE '%RUNKEY%' OR tag ILIKE '%SERVICE%' OR tag ILIKE '%TASK%' OR category = 'PERSISTENCE' THEN 'Persistence'
           WHEN category = 'USB' OR category = 'DLP' OR tag ILIKE '%EXFIL%' OR tag ILIKE '%UPLOAD%' THEN 'Exfiltration'
           ELSE 'Other'
         END AS tactic,
         COUNT(*) as count
       FROM events ${evWhere}
       GROUP BY 1`,
      evParams
    );
    const tMap = {};
    (mitreRes.rows || []).forEach(r => { tMap[r.tactic] = parseInt(r.count || 0, 10); });
    mitre.tactics = mitre.tactics.map(t => ({ tactic: t.tactic, count: tMap[t.tactic] || 0 }));

    // Top Observed MITRE Techniques
    mitre.topTechniques = [
      { id: 'T1003', name: 'OS Credential Dumping (DCSync/Mimikatz)', count: (tMap['Credential Access'] || 0) },
      { id: 'T1059', name: 'Command & Scripting Interpreter (PowerShell)', count: (tMap['Execution'] || 0) },
      { id: 'T1021', name: 'Remote Services (SMB / RDP / WinRM)', count: (tMap['Lateral Movement'] || 0) },
      { id: 'T1053', name: 'Scheduled Task / System Job', count: (tMap['Persistence'] || 0) },
      { id: 'T1052', name: 'Exfiltration Over Physical USB Media', count: (tMap['Exfiltration'] || 0) }
    ].filter(t => t.count > 0).slice(0, 5);
  } catch (mErr) {
    console.warn('[REPORT BUILDER] MITRE query error:', mErr.message);
  }

  // ── Query Active Directory & Identity Threat Audit ─────────────────────────
  let adAudit = {
    dcsync: 0,
    kerberoast: 0,
    spray: 0,
    goldenCert: 0,
    totalAd: 0,
    topUsers: []
  };
  try {
    const adCountsRes = await q(
      `SELECT 
         COUNT(*) FILTER (WHERE tag ILIKE '%DCSYNC%' OR message ILIKE '%DCSYNC%') as dcsync,
         COUNT(*) FILTER (WHERE tag ILIKE '%KERBEROAST%' OR message ILIKE '%KERBEROAST%') as kerberoast,
         COUNT(*) FILTER (WHERE tag ILIKE '%SPRAY%' OR message ILIKE '%SPRAY%') as spray,
         COUNT(*) FILTER (WHERE tag ILIKE '%SHADOW%' OR tag ILIKE '%GOLDEN%' OR tag ILIKE '%ESC%') as golden_cert,
         COUNT(*) FILTER (WHERE category IN ('DOMAIN', 'ADCS', 'LOGON')) as total_ad
       FROM events ${evWhere}`,
      evParams
    );
    const row = adCountsRes.rows[0] || {};
    adAudit.dcsync = parseInt(row.dcsync || 0, 10);
    adAudit.kerberoast = parseInt(row.kerberoast || 0, 10);
    adAudit.spray = parseInt(row.spray || 0, 10);
    adAudit.goldenCert = parseInt(row.golden_cert || 0, 10);
    adAudit.totalAd = parseInt(row.total_ad || 0, 10);

    // Top targeted identity accounts
    const topUsersRes = await q(
      `SELECT "user", COUNT(*) as count 
       FROM events ${evWhere} 
       AND "user" IS NOT NULL AND "user" != '' AND "user" NOT IN ('system', 'SYSTEM', 'LOCAL SERVICE', 'NETWORK SERVICE')
       GROUP BY "user" 
       ORDER BY count DESC 
       LIMIT 5`,
      evParams
    );
    adAudit.topUsers = (topUsersRes.rows || []).map(u => {
      const uLower = (u.user || '').toLowerCase();
      let role = 'STANDARD USER';
      if (uLower.includes('admin') || uLower.includes('root')) role = 'LOCAL ADMIN';
      else if (uLower.includes('svc') || uLower.includes('service') || uLower.includes('system')) role = 'SYSTEM SERVICE';
      return {
        user: u.user,
        count: parseInt(u.count || 0, 10),
        role: role,
        risk: role
      };
    });
  } catch (adErr) {
    console.warn('[REPORT BUILDER] AD Audit query error:', adErr.message);
  }

  // ── Query Perimeter Defense (Firewall Inbound Attacks & Ports) ──────────────
  let firewall = { enabled: includeFw, total: 0, blocked: 0, allowed: 0, usbBlocked: 0, dlpEvents: 0, topPorts: [], topSourceIps: [] };
  if (includeFw) {
    try {
      const fwConds = ['ts >= $1', 'ts <= $2'];
      const fwParams = [from, to];
      let fwIdx = 3;

      const targetIp = isSingleMachine ? fleet.machineInfo?.ip : null;
      if (isSingleMachine && targetIp && targetIp !== '-') {
        fwConds.push(`(src_ip = $${fwIdx} OR dst_ip = $${fwIdx})`);
        fwParams.push(targetIp);
        fwIdx++;
      } else if (options.aggregator) {
        const aggrs = options.aggregator.split(',').map(s => s.trim()).filter(Boolean);
        if (aggrs.length > 0) {
          const inClause = aggrs.map((_, i) => `$${fwIdx + i}`).join(',');
          fwConds.push(`aggregator_name IN (${inClause})`);
          aggrs.forEach(a => fwParams.push(a));
          fwIdx += aggrs.length;
        }
      }

      const fwWhere = 'WHERE ' + fwConds.join(' AND ');

      const fwRes = await q(
        `SELECT 
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE LOWER(action) IN ('blocked', 'deny', 'drop', 'block', 'reject')) as blocked,
           COUNT(*) FILTER (WHERE LOWER(action) IN ('allow', 'accept', 'pass', 'permit')) as allowed
         FROM fw_events
         ${fwWhere}`,
        fwParams
      );
      firewall.total = parseInt(fwRes.rows[0]?.total || 0, 10);
      firewall.blocked = parseInt(fwRes.rows[0]?.blocked || 0, 10);
      firewall.allowed = parseInt(fwRes.rows[0]?.allowed || 0, 10);

      // Top 5 Targeted Ports
      const portsRes = await q(
        `SELECT dst_port, COALESCE(NULLIF(service, ''), 'TCP/' || dst_port) as service, COUNT(*) as count
         FROM fw_events
         ${fwWhere} AND dst_port > 0
         GROUP BY dst_port, service
         ORDER BY count DESC
         LIMIT 5`,
        fwParams
      );
      firewall.topPorts = (portsRes.rows || []).map(p => ({
        label: `Port ${p.dst_port} (${p.service.toUpperCase()})`,
        count: parseInt(p.count || 0, 10)
      }));

      // Top 5 Source IPs (Attacking Inbound IPs)
      const srcIpRes = await q(
        `SELECT src_ip, COUNT(*) as count
         FROM fw_events
         ${fwWhere} AND src_ip IS NOT NULL AND src_ip != ''
         GROUP BY src_ip
         ORDER BY count DESC
         LIMIT 5`,
        fwParams
      );
      firewall.topSourceIps = (srcIpRes.rows || []).map(s => ({
        ip: s.src_ip,
        count: parseInt(s.count || 0, 10)
      }));

      // If fw_events had no source IPs, check events table network logs
      if (firewall.topSourceIps.length === 0) {
        try {
          const evSrcRes = await q(
            `SELECT src_ip, COUNT(*) as count
             FROM events ${evWhere} AND src_ip IS NOT NULL AND src_ip != ''
             GROUP BY src_ip
             ORDER BY count DESC
             LIMIT 5`,
            evParams
          );
          firewall.topSourceIps = (evSrcRes.rows || []).map(s => ({
            ip: s.src_ip,
            count: parseInt(s.count || 0, 10)
          }));
        } catch (_) { }
      }
    } catch (fwErr) {
      console.warn('[REPORT BUILDER] Firewall query error:', fwErr.message);
    }
  }

  // ── Query Hardware / USB & DLP Log ─────────────────────────────────────────
  let usbDlp = { usbCount: 0, dlpCount: 0, recentList: [] };
  try {
    const usbDlpRes = await q(
      `SELECT 
         COUNT(*) FILTER (WHERE category = 'USB' OR tag LIKE '%USB%') as usb_count,
         COUNT(*) FILTER (WHERE category = 'DLP' OR tag LIKE '%DLP%') as dlp_count
       FROM events ${evWhere}`,
      evParams
    );
    usbDlp.usbCount = parseInt(usbDlpRes.rows[0]?.usb_count || 0, 10);
    usbDlp.dlpCount = parseInt(usbDlpRes.rows[0]?.dlp_count || 0, 10);
    firewall.usbBlocked = usbDlp.usbCount;
    firewall.dlpEvents = usbDlp.dlpCount;

    // Recent USB/DLP entries
    const recentUsbRes = await q(
      `SELECT id, ts, machine, tag, message, data, severity
       FROM events ${evWhere}
       AND (category IN ('USB', 'DLP') OR tag ILIKE '%USB%' OR tag ILIKE '%DLP%')
       ORDER BY ts DESC
       LIMIT 5`,
      evParams
    );
    usbDlp.recentList = (recentUsbRes.rows || []).map(r => parseUsbEvent(r));
  } catch (usbErr) { }

  // ── Query Fleet OS & Branch Distribution ───────────────────────────────────
  let fleetDistribution = { isSingleMachine, osList: [], branchList: [] };
  if (isSingleMachine) {
    const tInfo = fleet.machineInfo;
    fleetDistribution.osList = [{
      os: tInfo.os || 'Windows',
      count: 1,
      color: '#3b82f6'
    }];
    fleetDistribution.branchList = [{
      branch: tInfo.aggregator_name || 'Production',
      count: 1
    }];
  } else {
    try {
      let osWhere = '';
      const osParams = [];
      if (options.aggregator) {
        const aggrs = options.aggregator.split(',').map(s => s.trim()).filter(Boolean);
        if (aggrs.length > 0) {
          const inClause = aggrs.map((_, i) => `$${i + 1}`).join(',');
          osWhere = `WHERE aggregator_name IN (${inClause})`;
          aggrs.forEach(a => osParams.push(a));
        }
      }
      const osRes = await q(
        `SELECT COALESCE(NULLIF(os, ''), 'Windows') as os, COUNT(*) as count
         FROM machines ${osWhere}
         GROUP BY os
         ORDER BY count DESC`,
        osParams
      );
      const osColorPalette = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4', '#64748b'];
      fleetDistribution.osList = (osRes.rows || []).map((o, idx) => ({
        os: o.os,
        count: parseInt(o.count || 0, 10),
        color: osColorPalette[idx % osColorPalette.length]
      }));

      const branchRes = await q(
        `SELECT COALESCE(NULLIF(aggregator_name, ''), 'Headquarters') as branch, COUNT(*) as count
         FROM machines ${osWhere}
         GROUP BY aggregator_name
         ORDER BY count DESC`,
        osParams
      );
      fleetDistribution.branchList = (branchRes.rows || []).map(b => ({
        branch: b.branch,
        count: parseInt(b.count || 0, 10)
      }));
    } catch (fleetDistErr) { }
  }

  // ── Posture Score & Threat Level ───────────────────────────────────────────
  let score = 100;
  score -= Math.min(35, critCount * 5);
  score -= Math.min(20, highCount * 2);
  score -= Math.min(25, incidentsData.open * 10);
  if (!isSingleMachine) {
    score -= Math.min(15, staleList.filter(s => s.risk.includes('HIGH')).length * 5);
  } else if (fleet.inactive > 0) {
    score -= 20; // 20 point deduction if this single machine is offline
  }

  const postureScore = Math.max(10, Math.min(100, Math.round(score)));

  const threatLevel =
    postureScore < 50 || critCount > 5 ? 'CRITICAL' :
      postureScore < 70 || critCount > 0 || highCount > 5 ? 'HIGH' :
        postureScore < 85 || highCount > 0 || medCount > 10 ? 'ELEVATED' : 'NORMAL';

  const tlColor = {
    CRITICAL: '#ef4444',
    HIGH: '#f97316',
    ELEVATED: '#eab308',
    NORMAL: '#10b981'
  }[threatLevel];

  // ── Formulate Narrative & Recommendations ──────────────────────────────────
  let narrative = '';
  if (isSingleMachine) {
    const tInfo = fleet.machineInfo;
    const mIpStr = tInfo.ip && tInfo.ip !== '-' ? `(IP: ${tInfo.ip})` : '';
    narrative = `During this reporting window (${durLabel}), IOCHunt conducted deep security surveillance on endpoint ${tInfo.name} ${mIpStr}. Analyzed ${totalEvents.toLocaleString()} security events. `;
    if (critCount > 0 || incidentsData.open > 0) {
      narrative += `${critCount} Critical alerts and ${incidentsData.open} active incident investigations were identified on this host requiring SOC triage. `;
    } else {
      narrative += `Zero critical threats were observed and host telemetry operated within baseline tolerances. `;
    }
    if (fleet.inactive > 0) {
      narrative += `Sensor is currently offline (${tInfo.offlineStr || 'disconnected'}), representing a potential telemetry blind spot.`;
    } else {
      narrative += `Sensor is active with healthy real-time telemetry heartbeats.`;
    }
  } else {
    narrative = `During this reporting window (${durLabel}), IOCHunt monitored ${totalFleet} endpoints and analyzed ${totalEvents.toLocaleString()} security events across ${fleetDistribution.branchList.length} network branches. `;
    if (critCount > 0 || incidentsData.open > 0) {
      narrative += `${critCount} Critical alerts and ${incidentsData.open} active incidents were identified requiring immediate SOC investigation. `;
    } else {
      narrative += `Zero critical threats were observed and fleet telemetry operated within normal security baselines. `;
    }
    if (staleList.length > 0) {
      narrative += `${staleList.length} endpoint(s) are currently inactive, presenting potential monitoring blind spots.`;
    }
  }

  const recommendations = [];
  if (isSingleMachine) {
    const tInfo = fleet.machineInfo;
    if (critCount > 0) {
      recommendations.push(`Immediate Threat Mitigation: Triage ${critCount} critical alerts detected on host ${tInfo.name}.`);
    }
    if (incidentsData.open > 0) {
      recommendations.push(`Incident Escalation: Resolve ${incidentsData.open} open incident investigation(s) associated with ${tInfo.name}.`);
    }
    if (fleet.inactive > 0) {
      recommendations.push(`Sensor Recovery: Restore agent connectivity on ${tInfo.name} (${tInfo.offlineStr || 'offline'}) to resume monitoring.`);
    }
    if (usbDlp.usbCount > 0) {
      recommendations.push(`Hardware Compliance: Verify ${usbDlp.usbCount} USB peripheral insertions on ${tInfo.name} against corporate DLP policy.`);
    }
    if (recommendations.length === 0) {
      recommendations.push(`Endpoint Secure: Telemetry and behavior on ${tInfo.name} are operating within normal security parameters.`);
    }
  } else {
    if (critCount > 0 && topMachines.length > 0) {
      recommendations.push(`Immediate Threat Mitigation: Triage ${critCount} critical alerts detected on host ${topMachines[0].machine}.`);
    }
    if (incidentsData.open > 0) {
      recommendations.push(`Incident Escalation: Assign SOC analysts to investigate ${incidentsData.open} unresolved incident ticket(s).`);
    }
    if (adAudit.dcsync > 0 || adAudit.kerberoast > 0) {
      recommendations.push(`Active Directory Hardening: Investigate ${adAudit.dcsync} DCSync replication and ${adAudit.kerberoast} Kerberoasting attempts immediately.`);
    }
    if (staleList.length > 0) {
      recommendations.push(`Sensor Coverage: Re-establish telemetry with ${staleList[0].name} (${staleList[0].offlineStr}) to eliminate coverage blind spots.`);
    }
    if (firewall.blocked > 0) {
      recommendations.push(`Perimeter Review: Audit ${firewall.blocked.toLocaleString()} blocked network connections from external hosts.`);
    }
    if (usbDlp.usbCount > 0) {
      recommendations.push(`Hardware Compliance: Review ${usbDlp.usbCount} physical USB storage insertions against corporate DLP policy.`);
    }
    if (recommendations.length === 0) {
      recommendations.push('Maintain Continuous Surveillance: All security baseline thresholds and telemetry are operating normally.');
    }
  }

  const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');

  const reportData = {
    scheduleName: options.name || 'Executive Intelligence Briefing',
    generatedAt: nowStr + ' UTC',
    periodLabel: durLabel,
    branch: options.aggregator || 'All',
    machine: options.machine || 'All',
    isSingleMachine,
    threatLevel,
    tlColor,
    postureScore,
    narrative,
    totalEvents,
    critCount,
    highCount,
    medCount,
    lowCount,
    trends: { totalTrend, critTrend },
    timeline,
    categories,
    topMachines,
    topThreats,
    fleet,
    incidents: incidentsData,
    mitre,
    adAudit,
    firewall,
    usbDlp,
    fleetDistribution,
    recommendations
  };


  const pdfBuffer = await generatePdfReport(reportData);

  return {
    pdfBuffer,
    reportData,
    now,
    nowStr,
    durLabel,
    threatLevel,
    tlColor,
    postureScore,
    narrative,
    totalEvents,
    critCount,
    highCount,
    medCount,
    lowCount,
    totalTrend,
    critTrend,
    incidentsData,
    fleet,
    topMachines,
    recommendations
  };
}

/**
 * Generates report and dispatches via SMTP email.
 */
async function generateAndSendReport(schedule, queryFn = null, isManual = false) {
  const q = queryFn || db.query.bind(db);

  const cfg = await getSmtpConfig(q);
  if (!cfg || !cfg.host) {
    throw new Error('SMTP Host is not configured. Please save your SMTP Configuration first.');
  }
  if (!isManual && !cfg.enabled) {
    throw new Error('Scheduled Emails Engine is disabled. Turn it on in the top section and click Save Configuration.');
  }

  const {
    pdfBuffer,
    now,
    nowStr,
    durLabel,
    threatLevel,
    tlColor,
    postureScore,
    narrative,
    totalEvents,
    critCount,
    highCount,
    medCount,
    totalTrend,
    critTrend,
    incidentsData,
    fleet,
    topMachines,
    recommendations
  } = await buildReportDataAndPdf(schedule, q);

  // ── Build HTML Email Body (Executive Briefing Dashboard) ───────────────────
  let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #090d16; color: #1e293b; margin: 0; padding: 24px; }
  .wrap { max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.3); }
  .hdr { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 26px 32px; color: #ffffff; }
  .hdr h1 { margin: 0 0 6px; font-size: 19px; letter-spacing: 0.5px; font-weight: 800; }
  .hdr .meta { font-size: 11px; color: #94a3b8; font-family: monospace; line-height: 1.6; }
  .score-badge { float: right; background: #1e3a5f; border-radius: 8px; padding: 8px 16px; text-align: center; border: 1px solid rgba(255,255,255,0.1); }
  .score-val { font-size: 18px; font-weight: 800; color: ${tlColor}; }
  .score-lbl { font-size: 8px; text-transform: uppercase; color: #94a3b8; font-weight: 700; letter-spacing: 0.5px; }
  .pdf-banner { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; margin: 20px 32px 0; padding: 14px 18px; }
  .pdf-banner .title { font-size: 13px; color: #1d4ed8; font-weight: 800; margin-bottom: 4px; }
  .pdf-banner .desc { font-size: 11.5px; color: #3b82f6; line-height: 1.4; }
  .threat { margin: 18px 32px 0; border-radius: 8px; padding: 14px 18px; background: ${tlColor}15; border-left: 5px solid ${tlColor}; }
  .threat-l { font-weight: 800; font-size: 13px; color: ${tlColor}; letter-spacing: 0.5px; }
  .threat-p { margin: 4px 0 0; font-size: 11.5px; color: #334155; line-height: 1.5; }
  .section { padding: 18px 32px; }
  .section h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #475569; margin: 0 0 12px; font-weight: 800; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; }
  .stats-grid { display: table; width: 100%; border-collapse: separate; border-spacing: 6px; }
  .stat { display: table-cell; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 4px; text-align: center; }
  .stat-n { font-size: 16px; font-weight: 800; line-height: 1.2; }
  .stat-l { font-size: 8px; text-transform: uppercase; color: #64748b; margin-top: 3px; font-weight: 700; letter-spacing: 0.5px; }
  .stat-trend { font-size: 8px; margin-top: 3px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
  th { background: #f8fafc; padding: 8px 10px; text-align: left; font-size: 9.5px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; }
  td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
  .badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
  .badge.crit { background: #fee2e2; color: #dc2626; }
  .badge.high { background: #ffedd5; color: #ea580c; }
  .footer { background: #f8fafc; padding: 14px 32px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; font-family: monospace; }
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <div class="score-badge">
      <div class="score-val">${postureScore}/100</div>
      <div class="score-lbl">Posture Score</div>
    </div>
    <h1>IOC HUNT EXECUTIVE REPORT</h1>
    <div class="meta">
      <b>Schedule:</b> ${schedule.name}<br>
      <b>Period:</b> ${durLabel}<br>
      <b>Filters:</b> Branch: ${schedule.aggregator || 'All'} | Machine: ${schedule.machine || 'All'}
    </div>
  </div>

  <div class="pdf-banner">
    <div class="title">📄 Continuous Executive Report (PDF) Attached:</div>
    <div class="desc">A dynamic vector report with Command Center Velocity Timelines, Donut Visualizations, and Fleet Tracking is attached: <b>IOCHunt_${(schedule.name || 'Report').replace(/[^a-zA-Z0-9_-]/g, '_')}_Executive_Report_${now.toISOString().slice(0, 10)}.pdf</b></div>
  </div>

  <div class="threat">
    <div class="threat-l">${threatLevel} THREAT POSTURE</div>
    <p class="threat-p">${narrative}</p>
  </div>

  <div class="section">
    <h2>Executive Telemetry KPIs</h2>
    <div class="stats-grid">
      <div class="stat">
        <div class="stat-n" style="color:#1e3a5f">${totalEvents.toLocaleString()}</div>
        <div class="stat-l">Total Events</div>
        <div class="stat-trend" style="color:${totalTrend.includes('Down') ? '#10b981' : totalTrend.includes('Up') ? '#ef4444' : '#64748b'}">${totalTrend}</div>
      </div>
      <div class="stat">
        <div class="stat-n" style="color:#ef4444">${critCount}</div>
        <div class="stat-l">Critical</div>
        <div class="stat-trend" style="color:${critTrend.includes('Down') ? '#10b981' : critTrend.includes('Up') ? '#ef4444' : '#64748b'}">${critTrend}</div>
      </div>
      <div class="stat">
        <div class="stat-n" style="color:#f97316">${highCount}</div>
        <div class="stat-l">High</div>
        <div class="stat-trend" style="color:#64748b">${highCount > 0 ? `${highCount} Alerts` : 'Clear'}</div>
      </div>
      <div class="stat">
        <div class="stat-n" style="color:#eab308">${medCount}</div>
        <div class="stat-l">Medium</div>
        <div class="stat-trend" style="color:#64748b">${medCount > 0 ? `${medCount} Warnings` : 'Clear'}</div>
      </div>
      <div class="stat">
        <div class="stat-n" style="color:#8b5cf6">${incidentsData.open}</div>
        <div class="stat-l">Open Incidents</div>
        <div class="stat-trend" style="color:${incidentsData.open > 0 ? '#ef4444' : '#10b981'}">${incidentsData.open > 0 ? 'Active Triage' : 'Zero Open'}</div>
      </div>
      <div class="stat">
        <div class="stat-n" style="color:${fleet.inactive > 0 ? '#f97316' : '#10b981'}">${fleet.isSingleMachine ? (fleet.active > 0 ? 'ONLINE' : 'OFFLINE') : `${fleet.active}/${fleet.total}`}</div>
        <div class="stat-l">${fleet.isSingleMachine ? 'Sensor Status' : 'Fleet Online'}</div>
        <div class="stat-trend" style="color:${fleet.inactive > 0 ? '#ef4444' : '#10b981'}">${fleet.isSingleMachine ? (fleet.active > 0 ? 'Active Heartbeat' : 'Sensor Offline') : (fleet.inactive > 0 ? `${fleet.inactive} Offline` : '100% Online')}</div>
      </div>
    </div>
  </div>`;

  if (topMachines.length > 0) {
    html += `<div class="section">
      <h2>${fleet.isSingleMachine ? 'Endpoint Profile & Host Security' : 'Top Targeted Endpoints & Compromised Accounts'}</h2>
      <table>
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>IP Address</th>
            <th>Primary User</th>
            <th>Critical</th>
            <th>Primary Observed Threat</th>
          </tr>
        </thead>
        <tbody>`;
    topMachines.forEach(m => {
      html += `<tr>
        <td style="font-weight:700;color:#2563eb">${m.machine}</td>
        <td style="color:#64748b;font-family:monospace">${m.ip}</td>
        <td style="font-weight:600">${m.user}</td>
        <td><span class="badge ${m.crit_count > 0 ? 'crit' : 'high'}">${m.crit_count}</span></td>
        <td style="color:#334155">${m.top_tag}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }

  if (fleet.staleList && fleet.staleList.length > 0) {
    html += `<div class="section">
      <h2>Endpoint Sensor Inactivity Tracker</h2>
      <table>
        <thead>
          <tr>
            <th>Endpoint Name</th>
            <th>IP Address</th>
            <th>Operating System</th>
            <th>Last Seen</th>
            <th>Duration Offline</th>
          </tr>
        </thead>
        <tbody>`;
    fleet.staleList.forEach(s => {
      html += `<tr>
        <td style="font-weight:700;color:#2563eb">${s.name}</td>
        <td style="color:#64748b;font-family:monospace">${s.ip}</td>
        <td>${s.os}</td>
        <td style="color:#64748b">${s.last_seen}</td>
        <td style="color:#dc2626;font-weight:700">${s.offlineStr}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }


  html += `<div class="footer">IOCHunt Enterprise • Automated Executive Intelligence • ${durLabel}</div>`;
  html += `</div></body></html>`;

  const dateStr = now.toISOString().slice(0, 10);
  const safeName = (schedule.name || 'Report').replace(/[^a-zA-Z0-9_-]/g, '_');
  const attachments = [];

  if (pdfBuffer) {
    attachments.push({
      filename: `IOCHunt_${safeName}_Executive_Report_${dateStr}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    });
  }

  const recipients = schedule.recipients.split(',').map(r => r.trim()).filter(Boolean);
  const t = createTransporter(cfg);
  const subjectPrefix = schedule.machine ? `[${schedule.machine}] ` : (schedule.aggregator ? `[${schedule.aggregator}] ` : '');
  await t.sendMail({
    from: `"${cfg.from_name}" <${cfg.from_addr}>`,
    to: recipients.join(', '),
    subject: `[IOC Hunt] ${subjectPrefix}${schedule.name} — ${threatLevel} Threat Level (${postureScore}/100) — ${dateStr}`,
    html,
    attachments
  });
}

module.exports = {
  generateAndSendReport,
  buildReportDataAndPdf,
  getSimulatedReportData
};
