
const { DateTime } = require('luxon');


const SENSITIVE_TOOLS = new Set([
  'mimikatz.exe', 'wce.exe', 'fgdump.exe', 'pwdump.exe', 'pwdump7.exe',
  'procdump.exe', 'procdump64.exe', 'maldump.exe', 'ntdsutil.exe', 'esentutl.exe',
  'diskshadow.exe', 'secretsdump.exe', 'lazagne.exe', 'crackmapexec.exe',
  'bloodhound.exe', 'sharphound.exe', 'adrecon.exe', 'kerbrute.exe', 'rubeus.exe',
  'seatbelt.exe', 'certify.exe', 'spoolsample.exe', 'printspoofer.exe',
  'juicypotato.exe', 'rottenpotato.exe',
]);

const HIGH_RISK_CHILDREN = new Set([
  'cmd.exe', 'powershell.exe', 'conhost.exe', 'wscript.exe', 'cscript.exe',
  'mshta.exe', 'msiexec.exe', 'regsvr32.exe', 'rundll32.exe', 'schtasks.exe',
  'sc.exe', 'net.exe', 'tasklist.exe', 'taskkill.exe', 'wmic.exe',
]);

const ENUM_TOOLS = new Set([
  'nltest.exe', 'dsquery.exe', 'dsget.exe', 'dsmod.exe', 'dnscmd.exe',
  'klist.exe', 'adfind.exe', 'ldifde.exe', 'csvde.exe', 'pktmon.exe',
]);


function detectNoise(tag, message, severity) {
  const tu = (tag || '').toUpperCase();
  const mu = (message || '').toUpperCase();

  // ─────────────────────────────────────────
  // AD Attack Early-Exit — NEVER suppress real AD attacks
  // These tags must pass through regardless of severity or
  // any generic suppressor rules below (e.g. [DOMAIN] + info).
  // Only true monitor heartbeat pings are still suppressed.
  // ─────────────────────────────────────────
  const AD_ATTACK_TAGS = [
    'DCSYNC', 'DCSHADOW', 'KERBEROAST', 'ASREP', 'RBCD',
    'CERTIPY', 'LDAP-ENUM', 'SKELETON-KEY', 'GOLDEN-CERT',
    'SHADOW-CRED', 'FORGED-PAC', 'PASS-THE-HASH', 'OVERPASS-HASH',
    'NTLM-BRUTE', 'SPRAY', 'ESC1', 'ESC2', 'ESC3', 'ESC6',
    'PKINIT', 'EXPLICIT-CRED', 'ASREP-ROAST', 'KERBEROAST-RC4',
    'KERB-POLICY', 'COMPUTER-ACCT', 'NEW-COMPUTER',
  ];
  if (AD_ATTACK_TAGS.some(t => tu.includes(t))) {
    // Only suppress true heartbeat / monitor-status pings
    if (
      mu.includes('MONITOR ACTIVE') ||
      mu.includes('MONITORING ACTIVE') ||
      mu.includes('WATCHER ACTIVE') ||
      mu.includes('HEARTBEAT') ||
      mu.includes('INTEGRATION ACTIVE')
    ) {
      return 1;
    }
    // Everything else is a real attack event — keep it
    return 0;
  }

  // ─────────────────────────────────────────
  // Watchdog Blanket Suppression
  // ─────────────────────────────────────────
  if (mu.includes('IOCHUNTWATCHDOG.EXE') || tu.includes('IOCHUNTWATCHDOG')) {
    return 1;
  }

  if (tu.includes('[CMD-EXEC]')) {
    if (mu.includes('PARENT:IOCHUNT')) {
      // Only suppress known-safe internal commands
      // Do NOT suppress broadly — parent spoof attack vector
      if (mu.includes('SCHTASKS.EXE') && mu.includes('/QUERY')) return 1;
      if (mu.includes('AUDITPOL.EXE')) return 1;
      if (mu.includes('POWERSHELL.EXE') && mu.includes('GET-AUTHENTICODE')) return 1;
      if (mu.includes('NETSH.EXE') && mu.includes('ADVFIREWALL')) return 1;
      if (mu.includes('WMIC.EXE') && mu.includes('WIN32_')) return 1;
      if (mu.includes('NET.EXE') && mu.includes('USER') &&
        !mu.includes('/ADD') && !mu.includes('/DELETE')) return 1;
      if (mu.includes('NETSTAT.EXE') && mu.includes('-P TCP')) return 1;
      if (mu.includes('TASKKILL.EXE')) return 1;
      if (mu.includes('LOGOFF.EXE')) return 1;
      if (mu.includes('SC.EXE') &&
        (mu.includes('QUERY') || mu.includes('CONFIG'))) return 1;
      // Anything else from IOC Hunt parent = flag it, could be spoofed
      return 0;
    }
  }
  // (AD attack early-exit is now handled at the top of this function)

  // Never suppress critical or high events
  if (severity === 'critical' || severity === 'high') return 0;


  if (tu.includes('DEFENDER')) {
    if (mu.includes('SETTINGS-CHANGE') &&
      !mu.includes('DISABLEREALTIMEMONITORING') &&
      !mu.includes('DISABLEBEHAVIORMONITORING') &&
      !mu.includes('DISABLEONACCESSPROTECTION') &&
      !mu.includes('DISABLEIOAVPROTECTION') &&
      !mu.includes('DISABLESCRIPTSCANNING') &&
      !mu.includes('TAMPERPROTECTION') &&
      !mu.includes('EXCLUSIONPATH') &&
      !mu.includes('EXCLUSIONPROCESS') &&
      !mu.includes('ANTIVIRUSENABLED') &&
      !mu.includes('SPYNETREPORTING'))
      return 1;

    if (mu.includes('INTEGRATION ACTIVE') || mu.includes('WATCHER ACTIVE') ||
      mu.includes('1116/1117/5007')) return 1;
    if (mu.includes('OLDVALUE:') && mu.includes('NEWVALUE:') &&
      !mu.includes('DISABLE') && !mu.includes('TAMPER') &&
      !mu.includes('EXCLUSION')) return 1;
    return 0;
  }
  // Startup noise — replace the existing startup noise check
  if (tu.includes('[STARTUP]') || tu.includes('STARTUP')) {
    // Suppress operational/heartbeat messages
    if (mu.includes('SEEDED') ||
      mu.includes('FSW ACTIVE ON') ||
      mu.includes('POLLER ACTIVE') ||
      mu.includes('CONTINUOUS POLL') ||
      mu.includes('FSW SETUP FAILED')) return 1;
    // Keep real detections
    return 0;
  }
  // Never suppress critical or high events
  if (severity === 'critical' || severity === 'high') return 0;

  // Defender — never suppress real alerts, suppress noise
  if (tu.includes('DEFENDER')) {
    if (mu.includes('[SETTINGS-CHANGE]') || mu.includes('SETTINGS-CHANGE') ||
      mu.includes('OLDVALUE:') || mu.includes('NEWVALUE:')) return 1;
    if (mu.includes('INTEGRATION ACTIVE') || mu.includes('WATCHER ACTIVE') ||
      mu.includes('1116/1117/5007')) return 1;
    if (tu.includes('[DEFENDER-SHIP]') || mu.includes('SHIPPED [DEFENDER]') ||
      mu.includes('CENTRAL SERVER')) return 1;
    return 0;
  }

  // Email status / central-server heartbeat
  if (tu.includes('[EMAIL') && !tu.includes('ALERT') && !tu.includes('FAILED')) return 1;
  if (tu.includes('[CENTRAL') && !tu.includes('ERR') && !mu.includes('FAILED')) return 1;

  // Baseline noise
  if (tu.includes('[BASELINE-DIFF]')) {
    if (mu.includes('UNSIGNED') && !mu.includes('C:\\WINDOWS') &&
      !mu.includes('SYSTEM32')) return 0;
    return 1;
  }
  if (tu.includes('[BASELINE') && !tu.includes('SUSPICIOUS') &&
    !tu.includes('-ACTION') && !tu.includes('-WARN')) return 1;

  // Learning-mode status
  if (tu.includes('[LEARNING') && !tu.includes('BLOCKED') &&
    !tu.includes('ACTIVATED')) return 1;

  // Generic info tags
  if (tu.includes('[INFO]')) return 1;
  if (tu.includes('[SVC-SKIP')) return 1;
  if (tu.includes('[LOGON-DEBUG') || tu.includes('[LOGON-POLL')) return 1;

  // Config load/save confirmations
  if (tu.includes('[CONFIG]') &&
    (mu.includes('SAVED.') || mu.includes('LOADED.'))) return 1;

  // Whitelist / blocklist load confirmations
  if ((tu.includes('[WHITELIST]') || tu.includes('[BLOCKLIST]')) &&
    (mu.includes(' LOADED') || mu.includes(' SAVED'))) return 1;

  // alert
  if (tu.includes('[AFTER-HOURS-ALERTED]')) return 1;

  // Monitor heartbeats
  if (tu.includes('[MONITOR]') && severity === 'info') return 1;

  // Audit enabled confirmations
  if (tu.includes('[AUDIT]') && mu.includes('ENABLED:')) return 1;

  // Firewall status — not errors
  if (tu.includes('[FIREWALL]') && severity === 'info' &&
    !mu.includes(' OFF') && !mu.includes('WARN')) return 1;

  // Domain / ADCS / CMD-monitor info lines
  if ((tu.includes('[DOMAIN]') || tu.includes('[ADCS]') ||
    tu.includes('[CMDMON]')) && severity === 'info') return 1;

  // IOC Hunt spawning its own child processes
  if (tu.includes('[CMD-EXEC]') &&
    (mu.includes('PARENT:IOCHUNT') || mu.includes('PARENT:IOCHUNT.EXE'))) return 1;

  if (tu.includes('[USB]') || tu.includes('[USB-REMOVED]')) {
    if (mu.includes('SEEDED') || mu.includes('EXISTING REMOVABLE') ||
      mu.includes('HISTORY')) return 1;
    if (mu.includes('REMOVED') && !mu.includes('SUSPICIOUS')) return 1;
    // Do NOT suppress real insertions — they belong in the USB tab
    return 0;
  }

  // POLICY UPDATE
  if ((tu.includes('[CENTRAL-ERR]') || tu.includes('[POLICY-POLL-ERR]')) &&
    severity === 'info') return 1;

  // POLICY UPDATE
  if ((tu.includes('[POLICY]')) &&
    severity === 'info') return 1;

  // Webcam / mic known-safe
  if ((tu.includes('[WEBCAM]') || tu.includes('[MIC]')) &&
    severity === 'info') return 1;

  // EVTX baseline info rows
  if (tu.includes('[EVTX]') && severity === 'info') return 1;

  return 0;
}

function classifySeverity(tag, message) {
  const t = (tag || '').toUpperCase();
  const m = (message || '').toUpperCase();

  // ── User-confirmed allow / whitelist decisions are always INFO ────────────
  if (t.includes('IOCHUNT-BLOCK') || m.includes('IOCHUNT-BLOCK') ||
    t.includes('IOCHUNT-ALLOW') || m.includes('IOCHUNT-ALLOW'))
    return 'info';

  // ════════════════════════════════════════════════════════════════════════════
  // CRITICAL
  // ════════════════════════════════════════════════════════════════════════════

  // 1. Windows Defender — malware detected, RTP disabled, tamper
  // 1. Windows Defender — compound tag [DEFENDER][SUBTYPE] arrives with
  //    tag=[DEFENDER] and subtype in the message body (ParseLogLine strips compound tags)
  // 1. Windows Defender — compound tags arrive with tag=[DEFENDER],
  //    subtype in message body (ParseLogLine strips compound tags)
  if (t.includes('[DEFENDER]') || t.includes('DEFENDER')) {

    // ── CRITICAL: genuine threats ──────────────────────────────────────────
    // Real-time protection disabled
    if (m.includes('[RTP-DISABLED]') || m.includes('RTP-DISABLED') ||
      (m.includes('RTP') && m.includes('DISABLED')) ||
      (m.includes('REAL-TIME') && m.includes('DISABLED')))
      return 'critical';

    // Tamper (someone turned off Defender)
    if (m.includes('[TAMPER]'))
      return 'critical';

    // Scan disabled
    if (m.includes('[SCAN-DISABLED]') || m.includes('SCAN-DISABLED'))
      return 'critical';

    // Malware DETECTED — subtype may land in tag OR message body
    if ((m.includes('[DETECTED]') || t.includes('[DETECTED]') || t.includes('DETECTED')) &&
      (m.includes("THREAT:'") || m.includes('THREAT:') || m.includes('VIRUS') || m.includes('MALWARE')))
      return 'critical';

    // Remediation failed — malware still active
    if (m.includes('[REMEDIATION-FAILED]') || m.includes('REMEDIATION-FAILED'))
      return 'critical';

    // ── HIGH: action taken on threat ──────────────────────────────────────
    // Quarantine / remove action (Defender dealt with it — high but not critical)
    if (m.includes('[ACTION]') && !m.includes('FAILED'))
      return 'high';

    // ── MEDIUM: settings changed (registry value tweaks — common false positives) ─
    if (m.includes('[SETTINGS-CHANGE]') || m.includes('SETTINGS-CHANGE') ||
      m.includes('OLDVALUE:') || m.includes('NEWVALUE:'))
      return 'medium';

    // ── LOW: successful remediation ────────────────────────────────────────
    if (m.includes('[CLEAN]') || m.includes('REMEDIATION SUCCEEDED') ||
      m.includes('CLEAN'))
      return 'low';

    // Default: anything else from Defender is medium
    return 'medium';
  }

  // 2. Credential / attack tools detected running
  if (t.includes('SENSITIVE') || t.includes('BEHAVIORAL-IOC') ||
    t.includes('SUSPICIOUS-TOOL') || t.includes('HIGH-RISK-PARENT') ||
    t.includes('MALWARE') || t.includes('AUTO-BLOCKED'))
    return 'critical';

  // Sensitive tool names anywhere in tag or message
  for (const tool of SENSITIVE_TOOLS) {
    const toolUpper = tool.toUpperCase();
    if (t.includes(toolUpper) || m.includes(toolUpper)) return 'critical';
  }

  // Mimikatz keywords in message
  if (m.includes('MIMIKATZ') || m.includes('BLOODHOUND') ||
    m.includes('SEKURLSA') || m.includes('LSADUMP'))
    return 'critical';

  // 3. High-risk LOLbin / shell child process spawned (CMD-EXEC critical tags)
  if (t.includes('[CMD-EXEC][SENSITIVE]') ||
    t.includes('[CMD-EXEC][HIGH-RISK-PARENT]'))
    return 'critical';

  // LOLbin / shell names in sensitive context (blocked or detected)
  if (t.includes('BLOCKED') || t.includes('DETECTED') || t.includes('AUTO-BLOCKED')) {
    for (const child of HIGH_RISK_CHILDREN) {
      if (m.includes(child.toUpperCase())) return 'critical';
    }
  }

  // 4. Log cleared — evidence destruction
  if (t.includes('LOG-CLEARED') || m.includes('LOG-CLEARED') ||
    m.includes('SECURITY EVENT LOG CLEARED'))
    return 'critical';

  // 5. Critical AD attacks — full domain compromise paths
  if (t.includes('DCSYNC') || t.includes('DCSHADOW') ||
    t.includes('GOLDEN-CERT') || t.includes('SHADOW-CRED') ||
    t.includes('SKELETON-KEY') || t.includes('FORGED-PAC') ||
    t.includes('KERB-POLICY'))
    return 'critical';

  // 6. AD CS escalation attacks
  if (t.includes('ESC1') || t.includes('ESC2') ||
    t.includes('ESC3') || t.includes('ESC6'))
    return 'critical';

  // 7. Kerberoasting confirmed burst (20+ TGS)
  if (t.includes('KERBEROASTING') && !t.includes('RC4'))
    return 'critical';

  // 8. Connection killed / net blocked (active threat response)
  if (t.includes('CONN-KILLED') || t.includes('NET-BLOCKED'))
    return 'critical';

  // ════════════════════════════════════════════════════════════════════════════
  // HIGH
  // ════════════════════════════════════════════════════════════════════════════

  // 9. Unsigned process / service / task / registry entry
  if (t.includes('UNSIGNED') || t.includes('UNSIGNED-UNSAFE-PATH'))
    return 'high';

  // Persistence mechanisms (startup file, new service, new task, new registry key)
  if (t.includes('PERSISTENCE'))
    return 'high';

  // Startup / service / task / registry — new item (not necessarily unsigned)
  // Only HIGH if not already critical from above
  if (t.includes('SERVICE-DETECTED') || t.includes('TASK-DETECTED') ||
    t.includes('STARTUP-DETECTED') || t.includes('REGISTRY-DETECTED'))
    return 'high';

  // 10. User account changes
  if (t.includes('USER-CREATED') || t.includes('USER-DELETED') ||
    t.includes('USER-ENABLED') || t.includes('USER-DISABLED') ||
    t.includes('GROUP-MEMBER') || t.includes('GROUP-CHANGED') ||
    t.includes('COMPUTER-ACCT') || t.includes('NEW-COMPUTER') ||
    t.includes('PASSWORD-RESET') || t.includes('PASSWORD-CHANGE'))
    return 'high';

  // Config changes that indicate user / group / privilege modification
  if (t.includes('CONFIG-CHANGE') && (
    m.includes('USER') || m.includes('GROUP') || m.includes('PRIVILEGE') ||
    m.includes('ADMIN') || m.includes('PASSWORD') || m.includes('CREATED') ||
    m.includes('DELETED') || m.includes('ENABLED') || m.includes('DISABLED')))
    return 'high';

  // 11. Failed logon / brute force / spray / NTLM brute
  if (t.includes('FAILED-LOGON') || t.includes('BRUTE') ||
    t.includes('SPRAY') || t.includes('NTLM-BRUTE'))
    return 'high';

  // 12. AD credential-theft techniques (non-critical tier)
  if (t.includes('EXPLICIT-CRED') || t.includes('PKINIT') ||
    t.includes('OVERPASS-HASH') || t.includes('PASS-THE-HASH') ||
    t.includes('ASREP-ROAST') || t.includes('RBCD') ||
    t.includes('KERBEROAST-RC4') || t.includes('CERTIPY-ENUM') ||
    t.includes('LDAP-ENUM') || t.includes('USER-ENUM'))
    return 'high';

  // 13. Admin share access (lateral movement indicator)
  if (t.includes('NET-ADMIN-SHARE'))
    return 'high';

  // 14. After-hours login (interactive session outside office hours)
  if (t.includes('AFTER-HOURS'))
    return 'high';

  // 15. USB threat found / autorun
  if (t.includes('USB') && (m.includes('THREAT') || m.includes('AUTORUN') ||
    m.includes('AUTORUN!') || m.includes('SUSPICIOUS') || m.includes('ATTACK')))
    return 'high';

  // 16. Defender — action failed (remediation unsuccessful)
  if (t.includes('[DEFENDER][ACTION]') && m.includes('FAILED'))
    return 'high';

  // 17. Certificate requests that look suspicious (ESC-adjacent)
  if (t.includes('CERT-') || t.includes('CERT-REQUEST') ||
    t.includes('CERTIPY') || t.includes('GOLDEN-CERT'))
    return 'high';

  // ════════════════════════════════════════════════════════════════════════════
  // MEDIUM
  // ════════════════════════════════════════════════════════════════════════════

  // 18. Inbound / outbound network connections (RDP, SMB, WinRM, SSH…)
  if (t.includes('NETWORK') || t.includes('NET-') ||
    t.includes('INBOUND') || t.includes('OUTBOUND') ||
    t.includes('OUTBOUND-LATERAL') || t.includes('CONN') ||
    t.includes('[DETECTED][NETWORK]'))
    return 'medium';

  // Share access (non-admin share)
  if (t.includes('SHARE') && !t.includes('NET-ADMIN-SHARE'))
    return 'medium';

  // 19. Enumeration commands (nltest, dsquery, whoami /all, etc.)
  // 19. Enumeration commands — escalate to HIGH if user/group modification
  if (t.includes('ENUM') || t.includes('[CMD-EXEC]')) {
    if (m.includes('USER CREATED') || m.includes('/ADD') ||
      m.includes('USER /ADD') || m.includes('LOCALGROUP') ||
      m.includes('NET USER') && m.includes('ADD'))
      return 'high';
    return 'medium';
  }

  for (const tool of ENUM_TOOLS) {
    if (m.includes(tool.toUpperCase())) return 'medium';
  }

  // 20. AD / ADCS category events (generic — non-critical tier above)
  if (t.includes('DOMAIN') || t.includes('ADCS') ||
    t.includes('TGS-REQUEST') || t.includes('TGT-REQUEST') ||
    t.includes('NTLM-AUTH') || t.includes('KERBEROS') ||
    t.includes('REPLICATION') || t.includes('DS-OBJECT'))
    return 'medium';

  // 21. Config changes — audit policy, GPO, firewall setting
  if (t.includes('CONFIG-CHANGE') || t.includes('AUDIT-POLICY') ||
    t.includes('REGISTRY') || t.includes('SERVICE') ||
    t.includes('TASK') || t.includes('STARTUP'))
    return 'medium';

  // 22. Webcam / mic — unknown / unsigned app
  if ((t.includes('WEBCAM') || t.includes('MIC')) && !t.includes('INFO'))
    return 'medium';

  // 23. Suspicious PowerShell / command-line execution (medium tier)
  // 23. CMD-EXEC compound tags — ParseLogLine ships only [CMD-EXEC] as the tag,
  // the second bracket ([DETECTED], [SENSITIVE] etc.) ends up in the message body.
  if (t.includes('[CMD-EXEC]') || t.includes('CMD-EXEC')) {
    const mu = m.toUpperCase();
    if (mu.includes('[SENSITIVE]') || mu.includes('SENSITIVE')) return 'critical';
    if (mu.includes('[HIGH-RISK-PARENT]') || mu.includes('HIGH-RISK')) return 'critical';
    if (mu.includes('[ENUM-BURST]') || mu.includes('ENUM-BURST')) return 'high';
    if (mu.includes('[DETECTED]') || mu.includes('[POWERSHELL]')) return 'medium';
    if (mu.includes('[ENUM]') || mu.includes('ENUM')) return 'medium';
    return 'medium';  // any CMD-EXEC event is at least medium
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LOW
  // ════════════════════════════════════════════════════════════════════════════

  // 24. Explicit user allow / whitelist decisions
  if (t.includes('ALLOWED') || t.includes('WHITELISTED') ||
    t.includes('NET-ALLOWED') || t.includes('OUTBOUND-ALLOWED'))
    return 'low';

  // 25. USB inserted clean
  if (t.includes('USB'))
    return 'low';

  // 26. Webcam / mic — known safe app (info severity for those, low here)
  if (t.includes('WEBCAM') || t.includes('MIC'))
    return 'low';

  // 27. Monitoring status
  if (t.includes('MONITOR'))
    return 'low';

  // ════════════════════════════════════════════════════════════════════════════
  // INFO  (default)
  // ════════════════════════════════════════════════════════════════════════════
  return 'info';
}

function parseCategory(tag, message) {
  const t = (tag || '').toUpperCase();
  const m = (message || '').toUpperCase();

  // CMD-EXEC subtypes — categorise by what happened
  if (t.includes('[CMD-EXEC]') || t.includes('CMD-EXEC')) {
    if (m.includes('[SENSITIVE]') || m.includes('SENSITIVE')) return 'SENSITIVE';
    if (m.includes('[HIGH-RISK-PARENT]') || m.includes('HIGH-RISK')) return 'CHILD-PROCESS';
    if (m.includes('[DETECTED]')) return 'CHILD-PROCESS';
    if (m.includes('[ENUM]') || m.includes('ENUM')) return 'ENUM';
    if (m.includes('[POWERSHELL]')) return 'PROCESSES';
    return 'PROCESSES';
  }

  if (t.includes('CMD-EXEC') || t.includes('[CMD-EXEC]')) {
    const mu = (tag || '').toUpperCase() + ' ' + '';
    // We need the message too — pass it through parseCategory
    return 'PROCESSES';  // handled below with message context
  }
  if (t.includes('PROCESS') || t.includes('BEHAVIORAL') ||
    t.includes('HIGH-RISK-PARENT'))
    return 'PROCESSES';

  if (t.includes('REGISTRY')) return 'REGISTRY';
  if (t.includes('STARTUP')) return 'STARTUP';
  if (t.includes('SERVICE')) return 'SERVICES';
  if (t.includes('TASK')) return 'TASKS';

  if (t.includes('NET') || t.includes('SHARE') || t.includes('CONN') ||
    t.includes('INBOUND') || t.includes('OUTBOUND') || t.includes('LATERAL'))
    return 'NETWORK';

  if (t.includes('CONFIG')) return 'CONFIG';
  if (t.includes('SENSITIVE')) return 'SENSITIVE';
  if (t.includes('ENUM')) return 'ENUM';

  if (t.includes('LOGON') || t.includes('AFTER-HOURS') ||
    t.includes('FAILED-LOGON') || t.includes('BRUTE'))
    return 'LOGON';

  if (t.includes('USB')) return 'USB';
  if (t.includes('WEBCAM') || t.includes('MIC')) return 'WEBCAM';

  if (t.includes('DEFENDER') || t.includes('[DEFENDER]')) return 'DEFENDER';

  // AD domain attacks
  if (t.includes('DCSYNC') || t.includes('DCSHADOW') ||
    t.includes('KERBEROAST') || t.includes('RBCD') ||
    t.includes('SPRAY') || t.includes('NTLM-BRUTE') ||
    t.includes('COMPUTER-ACCT') || t.includes('EXPLICIT-CRED') ||
    t.includes('DOMAIN') || t.includes('PASS-THE-HASH') ||
    t.includes('OVERPASS-HASH') || t.includes('ASREP') ||
    t.includes('SKELETON-KEY') || t.includes('FORGED-PAC') ||
    t.includes('KERB-POLICY') || t.includes('GOLDEN-CERT') ||
    t.includes('SHADOW-CRED'))
    return 'DOMAIN';

  // AD CS / certificate attacks
  if (t.includes('ESC') || t.includes('SHADOW-CRED') ||
    t.includes('PKINIT') || t.includes('CERTIPY') ||
    t.includes('LDAP-ENUM') || t.includes('CA-CONFIG') ||
    t.includes('CERT-') || t.includes('ADCS') ||
    t.includes('GOLDEN-CERT'))
    return 'ADCS';

  return 'OTHER';
}

function normalizeToUTC(raw, sourceTZ = 'UTC') {
  if (!raw) return raw;

  // Agent format: "2026-04-21 13:56:04 +05:30" — strip trailing whitespace first
  const trimmed = raw.trim();

  // Agent format with offset
  const withOffset = trimmed.replace(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([+-]\d{2}:\d{2})\s*$/,
    '$1T$2$3'
  );
  const dtAgent = DateTime.fromISO(withOffset, { setZone: true });
  if (dtAgent.isValid) return dtAgent.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');

  // ISO 8601 with explicit offset
  if (trimmed.includes('T') && (trimmed.includes('+') || trimmed.endsWith('Z') || trimmed.endsWith('z'))) {
    const dt = DateTime.fromISO(trimmed, { setZone: true });
    if (dt.isValid) return dt.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');
  }

  // Fortinet with embedded tz= field
  const fwMatch = trimmed.match(/date=(\d{4}-\d{2}-\d{2})\s+time=(\d{2}:\d{2}:\d{2})\s+tz="?([+-]\d{4}|UTC)"?/);
  if (fwMatch) {
    const [, date, time, tz] = fwMatch;
    const offset = tz === 'UTC' ? '+00:00' : `${tz.slice(0, 3)}:${tz.slice(3)}`;
    const dt = DateTime.fromISO(`${date}T${time}${offset}`);
    if (dt.isValid) return dt.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');
  }

  // Palo Alto CSV
  const paCSV = trimmed.match(/^[\w-]+,(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}),/);
  if (paCSV) {
    const dt = DateTime.fromFormat(paCSV[1], 'yyyy/MM/dd HH:mm:ss', { zone: sourceTZ });
    if (dt.isValid) return dt.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');
  }

  // Palo Alto standalone
  const paTs = trimmed.match(/^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})$/);
  if (paTs) {
    const dt = DateTime.fromFormat(paTs[1], 'yyyy/MM/dd HH:mm:ss', { zone: sourceTZ });
    if (dt.isValid) return dt.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');
  }

  // Plain datetime no offset — for agent use displayTimezone, for FW use sourceTZ
  const plain = DateTime.fromSQL(trimmed, { zone: sourceTZ });
  if (plain.isValid) return plain.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');

  return raw;
}

module.exports = {
  SENSITIVE_TOOLS, HIGH_RISK_CHILDREN, ENUM_TOOLS,
  detectNoise, classifySeverity, parseCategory, normalizeToUTC
};
