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
  'mshta.exe', 'msiexec.exe', 'regsvr32.exe', 'rundll32.exe',
  'sc.exe', 'net.exe', 'tasklist.exe', 'taskkill.exe', 'wmic.exe',
]);

const ENUM_TOOLS = new Set([
  'nltest.exe', 'dsquery.exe', 'dsget.exe', 'dsmod.exe', 'dnscmd.exe',
  'klist.exe', 'adfind.exe', 'ldifde.exe', 'csvde.exe', 'pktmon.exe',
]);

function detectNoise(tag, message, severity) {
  const tu = (tag || '').toUpperCase();
  const mu = (message || '').toUpperCase();

  const AD_ATTACK_TAGS = [
    'DCSYNC', 'DCSHADOW', 'KERBEROAST', 'ASREP', 'RBCD',
    'CERTIPY', 'LDAP-ENUM', 'SKELETON-KEY', 'GOLDEN-CERT',
    'SHADOW-CRED', 'FORGED-PAC', 'PASS-THE-HASH', 'OVERPASS-HASH',
    'NTLM-BRUTE', 'SPRAY', 'ESC1', 'ESC2', 'ESC3', 'ESC6',
    'PKINIT', 'EXPLICIT-CRED', 'ASREP-ROAST', 'KERBEROAST-RC4',
    'KERB-POLICY', 'COMPUTER-ACCT', 'NEW-COMPUTER',
  ];
  if (AD_ATTACK_TAGS.some(t => tu.includes(t))) {
    if (
      mu.includes('MONITOR ACTIVE') ||
      mu.includes('MONITORING ACTIVE') ||
      mu.includes('WATCHER ACTIVE') ||
      mu.includes('HEARTBEAT') ||
      mu.includes('INTEGRATION ACTIVE')
    ) {
      return 1;
    }
    return 0;
  }

  if (mu.includes('IOCHUNTWATCHDOG.EXE') || tu.includes('IOCHUNTWATCHDOG')) {
    return 1;
  }

  if (tu.includes('[CMD-EXEC]')) {
    if (mu.includes('PARENT:IOCHUNT')) {
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
      return 0;
    }
  }

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

  if (tu.includes('[STARTUP]') || tu.includes('STARTUP')) {
    if (mu.includes('SEEDED') ||
      mu.includes('FSW ACTIVE ON') ||
      mu.includes('POLLER ACTIVE') ||
      mu.includes('CONTINUOUS POLL') ||
      mu.includes('FSW SETUP FAILED')) return 1;
    return 0;
  }

  if (tu.includes('[EMAIL') && !tu.includes('ALERT') && !tu.includes('FAILED')) return 1;
  if (tu.includes('[CENTRAL') && !tu.includes('ERR') && !mu.includes('FAILED')) return 1;

  if (tu.includes('[BASELINE-DIFF]')) {
    if (mu.includes('UNSIGNED') && !mu.includes('C:\\WINDOWS') &&
      !mu.includes('SYSTEM32')) return 0;
    return 1;
  }
  if (tu.includes('[BASELINE') && !tu.includes('SUSPICIOUS') &&
    !tu.includes('-ACTION') && !tu.includes('-WARN')) return 1;

  if (tu.includes('[LEARNING') && !tu.includes('BLOCKED') &&
    !tu.includes('ACTIVATED')) return 1;

  if (tu.includes('[INFO]')) return 1;
  if (tu.includes('[SVC-SKIP')) return 1;
  if (tu.includes('[LOGON-DEBUG') || tu.includes('[LOGON-POLL') || mu.startsWith('[LOGON] USER:') || mu.startsWith('[LOGON]')) return 1;

  if (tu.includes('[CONFIG]') &&
    (mu.includes('SAVED.') || mu.includes('LOADED.'))) return 1;

  if ((tu.includes('[WHITELIST]') || tu.includes('[BLOCKLIST]')) &&
    (mu.includes(' LOADED') || mu.includes(' SAVED'))) return 1;

  if (tu.includes('[AFTER-HOURS-ALERTED]')) return 1;
  if (tu.includes('[MONITOR]') && severity === 'info') return 1;
  if (tu.includes('[AUDIT]') && mu.includes('ENABLED:')) return 1;
  if (tu.includes('[FIREWALL]') && severity === 'info' &&
    !mu.includes(' OFF') && !mu.includes('WARN')) return 1;
  if ((tu.includes('[DOMAIN]') || tu.includes('[ADCS]') ||
    tu.includes('[CMDMON]')) && severity === 'info') return 1;

  if (tu.includes('[CMD-EXEC]') &&
    (mu.includes('PARENT:IOCHUNT') || mu.includes('PARENT:IOCHUNT.EXE'))) return 1;

  if (tu.includes('[USB]') || tu.includes('[USB-REMOVED]')) {
    if (mu.includes('SEEDED') || mu.includes('EXISTING REMOVABLE') ||
      mu.includes('HISTORY')) return 1;
    if (mu.includes('REMOVED') && !mu.includes('SUSPICIOUS')) return 1;
    return 0;
  }

  if ((tu.includes('[CENTRAL-ERR]') || tu.includes('[POLICY-POLL-ERR]')) &&
    severity === 'info') return 1;

  if (tu.includes('[POLICY]') && severity === 'info') return 1;
  if ((tu.includes('[WEBCAM]') || tu.includes('[MIC]')) && severity === 'info') return 1;
  if (tu.includes('[EVTX]') && severity === 'info') return 1;

  return 0;
}

function classifySeverity(tag, message) {
  const t = (tag || '').toUpperCase();
  const m = (message || '').toUpperCase();

  if (t.includes('IOCHUNT-BLOCK') || m.includes('IOCHUNT-BLOCK') ||
    t.includes('IOCHUNT-ALLOW') || m.includes('IOCHUNT-ALLOW'))
    return 'info';

  if (m.includes('SCHTASKS.EXE')) {
    return 'medium';
  }

  if (t.includes('[DEFENDER]') || t.includes('DEFENDER')) {
    if (m.includes('[RTP-DISABLED]') || m.includes('RTP-DISABLED') ||
      (m.includes('RTP') && m.includes('DISABLED')) ||
      (m.includes('REAL-TIME') && m.includes('DISABLED')))
      return 'critical';

    if (m.includes('[TAMPER]'))
      return 'critical';

    if (m.includes('[SCAN-DISABLED]') || m.includes('SCAN-DISABLED'))
      return 'critical';

    if ((m.includes('[DETECTED]') || t.includes('[DETECTED]') || t.includes('DETECTED')) &&
      (m.includes("THREAT:'") || m.includes('THREAT:') || m.includes('VIRUS') || m.includes('MALWARE')))
      return 'critical';

    if (m.includes('[REMEDIATION-FAILED]') || m.includes('REMEDIATION-FAILED'))
      return 'critical';

    if (m.includes('[ACTION]') && !m.includes('FAILED'))
      return 'high';

    if (m.includes('[SETTINGS-CHANGE]') || m.includes('SETTINGS-CHANGE') ||
      m.includes('OLDVALUE:') || m.includes('NEWVALUE:'))
      return 'medium';

    if (m.includes('[CLEAN]') || m.includes('REMEDIATION SUCCEEDED') ||
      m.includes('CLEAN'))
      return 'low';

    return 'medium';
  }

  if (t.includes('SENSITIVE') || t.includes('BEHAVIORAL-IOC') ||
    t.includes('SUSPICIOUS-TOOL') || t.includes('HIGH-RISK-PARENT') ||
    t.includes('MALWARE') || t.includes('AUTO-BLOCKED'))
    return 'critical';

  for (const tool of SENSITIVE_TOOLS) {
    const toolUpper = tool.toUpperCase();
    if (t.includes(toolUpper) || m.includes(toolUpper)) return 'critical';
  }

  if (m.includes('MIMIKATZ') || m.includes('BLOODHOUND') ||
    m.includes('SEKURLSA') || m.includes('LSADUMP'))
    return 'critical';

  if (t.includes('[CMD-EXEC][SENSITIVE]') ||
    t.includes('[CMD-EXEC][HIGH-RISK-PARENT]'))
    return 'critical';

  if (t.includes('BLOCKED') || t.includes('DETECTED') || t.includes('AUTO-BLOCKED')) {
    for (const child of HIGH_RISK_CHILDREN) {
      if (m.includes(child.toUpperCase())) return 'critical';
    }
  }

  if (t.includes('LOG-CLEARED') || m.includes('LOG-CLEARED') ||
    m.includes('SECURITY EVENT LOG CLEARED'))
    return 'critical';

  if (t.includes('DCSYNC') || t.includes('DCSHADOW') ||
    t.includes('GOLDEN-CERT') || t.includes('SHADOW-CRED') ||
    t.includes('SKELETON-KEY') || t.includes('FORGED-PAC') ||
    t.includes('KERB-POLICY'))
    return 'critical';

  if (t.includes('ESC1') || t.includes('ESC2') ||
    t.includes('ESC3') || t.includes('ESC6'))
    return 'critical';

  if (t.includes('KERBEROASTING') && !t.includes('RC4'))
    return 'critical';

  if (t.includes('CONN-KILLED') || t.includes('NET-BLOCKED'))
    return 'critical';

  if (t.includes('UNSIGNED') || t.includes('UNSIGNED-UNSAFE-PATH'))
    return 'high';

  if (t.includes('PERSISTENCE'))
    return 'high';

  if (t.includes('SERVICE-DETECTED') || t.includes('TASK-DETECTED') ||
    t.includes('STARTUP-DETECTED') || t.includes('REGISTRY-DETECTED'))
    return 'high';

  if (t.includes('USER-CREATED') || t.includes('USER-DELETED') ||
    t.includes('USER-ENABLED') || t.includes('USER-DISABLED') ||
    t.includes('GROUP-MEMBER') || t.includes('GROUP-CHANGED') ||
    t.includes('COMPUTER-ACCT') || t.includes('NEW-COMPUTER') ||
    t.includes('PASSWORD-RESET') || t.includes('PASSWORD-CHANGE'))
    return 'high';

  if (t.includes('CONFIG-CHANGE') && (
    m.includes('USER') || m.includes('GROUP') || m.includes('PRIVILEGE') ||
    m.includes('ADMIN') || m.includes('PASSWORD') || m.includes('CREATED') ||
    m.includes('DELETED') || m.includes('ENABLED') || m.includes('DISABLED')))
    return 'high';

  if (t.includes('FAILED-LOGON') || t.includes('BRUTE') ||
    t.includes('SPRAY') || t.includes('NTLM-BRUTE'))
    return 'high';

  if (t.includes('EXPLICIT-CRED') || t.includes('PKINIT') ||
    t.includes('OVERPASS-HASH') || t.includes('PASS-THE-HASH') ||
    t.includes('ASREP-ROAST') || t.includes('RBCD') ||
    t.includes('KERBEROAST-RC4') || t.includes('CERTIPY-ENUM') ||
    t.includes('LDAP-ENUM') || t.includes('USER-ENUM'))
    return 'high';

  if (t.includes('NET-ADMIN-SHARE'))
    return 'high';

  if (t.includes('AFTER-HOURS'))
    return 'high';

  if (t.includes('USB') && (m.includes('THREAT') || m.includes('AUTORUN') ||
    m.includes('AUTORUN!') || m.includes('SUSPICIOUS') || m.includes('ATTACK')))
    return 'high';

  if (t.includes('[DEFENDER][ACTION]') && m.includes('FAILED'))
    return 'high';

  if (t.includes('CERT-') || t.includes('CERT-REQUEST') ||
    t.includes('CERTIPY') || t.includes('GOLDEN-CERT'))
    return 'high';

  if (t.includes('NETWORK') || t.includes('NET-') ||
    t.includes('INBOUND') || t.includes('OUTBOUND') ||
    t.includes('OUTBOUND-LATERAL') || t.includes('CONN') ||
    t.includes('[DETECTED][NETWORK]'))
    return 'medium';

  if (t.includes('SHARE') && !t.includes('NET-ADMIN-SHARE'))
    return 'medium';

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

  if (t.includes('DOMAIN') || t.includes('ADCS') ||
    t.includes('TGS-REQUEST') || t.includes('TGT-REQUEST') ||
    t.includes('NTLM-AUTH') || t.includes('KERBEROS') ||
    t.includes('REPLICATION') || t.includes('DS-OBJECT'))
    return 'medium';

  if (t.includes('CONFIG-CHANGE') || t.includes('AUDIT-POLICY') ||
    t.includes('REGISTRY') || t.includes('SERVICE') ||
    t.includes('TASK') || t.includes('STARTUP'))
    return 'medium';

  if ((t.includes('WEBCAM') || t.includes('MIC')) && !t.includes('INFO'))
    return 'medium';

  if (t.includes('[CMD-EXEC]') || t.includes('CMD-EXEC')) {
    const mu = m.toUpperCase();
    if (mu.includes('[SENSITIVE]') || mu.includes('SENSITIVE')) return 'critical';
    if (mu.includes('[HIGH-RISK-PARENT]') || mu.includes('HIGH-RISK')) return 'critical';
    if (mu.includes('[ENUM-BURST]') || mu.includes('ENUM-BURST')) return 'high';
    if (mu.includes('[DETECTED]') || mu.includes('[POWERSHELL]')) return 'medium';
    if (mu.includes('[ENUM]') || mu.includes('ENUM')) return 'medium';
    return 'medium';
  }

  if (t.includes('ALLOWED') || t.includes('WHITELISTED') ||
    t.includes('NET-ALLOWED') || t.includes('OUTBOUND-ALLOWED'))
    return 'low';

  if (t.includes('USB'))
    return 'low';

  if (t.includes('WEBCAM') || t.includes('MIC'))
    return 'low';

  if (t.includes('MONITOR'))
    return 'low';

  return 'info';
}

function parseCategory(tag, message) {
  const t = (tag || '').toUpperCase();
  const m = (message || '').toUpperCase();

  if (t.includes('[CMD-EXEC]') || t.includes('CMD-EXEC')) {
    if (m.includes('[SENSITIVE]') || m.includes('SENSITIVE')) return 'SENSITIVE';
    if (m.includes('[HIGH-RISK-PARENT]') || m.includes('HIGH-RISK')) return 'CHILD-PROCESS';
    if (m.includes('[DETECTED]')) return 'CHILD-PROCESS';
    if (m.includes('[ENUM]') || m.includes('ENUM')) return 'ENUM';
    if (m.includes('[POWERSHELL]')) return 'PROCESSES';
    return 'PROCESSES';
  }

  if (t.includes('CMD-EXEC') || t.includes('[CMD-EXEC]')) {
    return 'PROCESSES';
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

  if (t.includes('ESC') || t.includes('SHADOW-CRED') ||
    t.includes('PKINIT') || t.includes('CERTIPY') ||
    t.includes('LDAP-ENUM') || t.includes('CA-CONFIG') ||
    t.includes('CERT-') || t.includes('ADCS') ||
    t.includes('GOLDEN-CERT'))
    return 'ADCS';

  return 'OTHER';
}

function normalizeToUTC(raw, sourceTZ = 'local') {
  if (!raw) return raw;

  const trimmed = raw.trim();

  const withOffset = trimmed.replace(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([+-]\d{2}:\d{2})\s*$/,
    '$1T$2$3'
  );
  const dtAgent = DateTime.fromISO(withOffset, { setZone: true });
  if (dtAgent.isValid) return dtAgent.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');

  if (trimmed.includes('T') && (trimmed.includes('+') || trimmed.endsWith('Z') || trimmed.endsWith('z'))) {
    const dt = DateTime.fromISO(trimmed, { setZone: true });
    if (dt.isValid) return dt.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');
  }

  const fwMatch = trimmed.match(/date=(\d{4}-\d{2}-\d{2})\s+time=(\d{2}:\d{2}:\d{2})\s+tz="?([+-]\d{4}|UTC)"?/);
  if (fwMatch) {
    const [, date, time, tz] = fwMatch;
    const offset = tz === 'UTC' ? '+00:00' : `${tz.slice(0, 3)}:${tz.slice(3)}`;
    const dt = DateTime.fromISO(`${date}T${time}${offset}`);
    if (dt.isValid) return dt.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');
  }

  const paCSV = trimmed.match(/^[\w-]+,(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}),/);
  if (paCSV) {
    const dt = DateTime.fromFormat(paCSV[1], 'yyyy/MM/dd HH:mm:ss', { zone: sourceTZ });
    if (dt.isValid) return dt.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');
  }

  const paTs = trimmed.match(/^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})$/);
  if (paTs) {
    const dt = DateTime.fromFormat(paTs[1], 'yyyy/MM/dd HH:mm:ss', { zone: sourceTZ });
    if (dt.isValid) return dt.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');
  }

  const plain = DateTime.fromSQL(trimmed, { zone: sourceTZ });
  if (plain.isValid) return plain.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');

  return raw;
}

module.exports = {
  SENSITIVE_TOOLS, HIGH_RISK_CHILDREN, ENUM_TOOLS,
  detectNoise, classifySeverity, parseCategory, normalizeToUTC
};
