function parseAdEvent(machine, tag, msg, sev) {
  const getTactic = (attack) => {
    const tactics = {
      'Zerologon': 'Credential Access',
      'PetitPotam': 'Credential Access',
      'DCSync': 'Credential Access',
      'DCShadow': 'Defense Evasion',
      'Kerberoasting': 'Credential Access',
      'RBCD': 'Privilege Escalation',
      'PasswordSpray': 'Credential Access',
      'NTLM-Brute': 'Credential Access',
      'ShadowCred': 'Credential Access',
      'ESC1': 'Privilege Escalation',
      'ESC2': 'Privilege Escalation',
      'ESC3': 'Privilege Escalation',
      'ESC6': 'Privilege Escalation',
      'CertipyEnum': 'Discovery',
      'GoldenCert': 'Credential Access',
      'PassCert': 'Lateral Movement',
      'ExplicitCred': 'Lateral Movement',
      'NewComputer': 'Defense Evasion',
      'ASREPRoast': 'Credential Access',
      'OverpassHash': 'Lateral Movement',
      'PassTheHash': 'Lateral Movement',
      'ForgedPAC': 'Privilege Escalation',
      'KerbPolicy': 'Defense Evasion',
      'SkeletonKey': 'Defense Evasion'
    };
    return tactics[attack] || 'Unknown';
  };

  const t = (tag || '').toUpperCase();

  function isDomainContext() {
    const mu = (msg || '').toUpperCase();
    return (
      /[A-Z0-9_-]{2,}\\[A-Z0-9_-]{2,}/.test(msg) ||
      /@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(msg) ||
      mu.includes('KERBEROS') || mu.includes('LDAP') ||
      mu.includes('KRB') || mu.includes('KRBTGT') ||
      mu.includes('TGT') || mu.includes('TGS') ||
      mu.includes(' DOMAIN') || mu.includes('DOMAIN ') ||
      mu.includes('DOMAIN') || mu.includes('REPLICATION') ||
      mu.includes('NTDS') || mu.includes('LSASS') ||
      (mu.includes('EXPLICIT') && mu.includes('->') &&
        !mu.includes('LOCALHOST') && !mu.includes('127.0.0.1'))
    );
  }

  function g(re) { const r = (msg || '').match(re); return r ? r[1] : ''; }

  const m = (msg || '').toUpperCase();

  const isAdAttack = (str) => (
    str.includes('DCSYNC') || str.includes('DCSHADOW') ||
    str.includes('KERBEROAST') || str.includes('SKELETON-KEY') ||
    str.includes('GOLDEN-CERT') || str.includes('SHADOW-CRED') ||
    str.includes('ASREP-ROAST') || str.includes('OVERPASS-HASH') ||
    str.includes('PASS-THE-HASH') || str.includes('FORGED-PAC') ||
    str.includes('KERB-POLICY') || str.includes('ESC') ||
    str.includes('ADCS') || str.includes('CERTIPY') ||
    str.includes('LDAP-ENUM') || str.includes('PKINIT') ||
    str.includes('S4U') || str.includes('SPRAY') ||
    str.includes('NTLM-BRUTE') || str.includes('RBCD')
  );

  const alwaysAd = isAdAttack(t) || isAdAttack(m);

  const isCondAd = (str) => (str.includes('EXPLICIT-CRED') || str.includes('COMPUTER-ACCT'));
  const conditionalAd = isCondAd(t) || isCondAd(m);

  if (!alwaysAd && !conditionalAd) return null;
  if (conditionalAd && !alwaysAd && !isDomainContext()) return null;

  const tm = t + ' ' + m;

  if (tm.includes('DCSYNC')) {
    const actor = g(/by\s+'([^']+)'/i) || g(/by\s+(\S+)/i) || 'unknown';
    return { direction: 'ad_attack', attack_type: 'DCSync', tactic: getTactic('DCSync'), actor, target_machine: machine, protocol: 'DCSync/RPC', severity: sev, description: 'DCSync: replication rights abused — all hashes exposed' };
  }
  if (tm.includes('DCSHADOW')) {
    const actor = g(/'([^']+)'\s+modified/i) || 'unknown';
    return { direction: 'ad_attack', attack_type: 'DCShadow', tactic: getTactic('DCShadow'), actor, target_machine: machine, protocol: 'DCShadow/RPC', severity: sev, description: 'DCShadow: rogue DC registered via nTDSDSA modification' };
  }
  if (tm.includes('KERBEROAST')) {
    const actor = g(/'([^']+)'\s+made/i) || g(/from\s+'([^']+)'/i) || 'unknown';
    const cnt = g(/(\d+)\s+TGS/i) || '?';
    return { direction: 'ad_attack', attack_type: 'Kerberoasting', tactic: getTactic('Kerberoasting'), actor, target_machine: machine, protocol: 'Kerberoast/KRB5', severity: sev, description: 'Kerberoasting: ' + cnt + ' TGS requests for offline cracking' };
  }
  if (tm.includes('RBCD')) {
    const actor = g(/'([^']+)'\s+requesting/i) || 'unknown';
    return { direction: 'ad_attack', attack_type: 'RBCD', tactic: getTactic('RBCD'), actor, target_machine: machine, protocol: 'RBCD/KRB5', severity: sev, description: 'RBCD: Resource-Based Constrained Delegation abuse' };
  }
  if (tm.includes('SPRAY')) {
    const actor = g(/from\s+'([^']+)'/i) || g(/from\s+([\d.]+)/i) || 'unknown';
    const cnt2 = g(/(\d+)\s+Kerberos/i) || g(/(\d+)\s+failures/i) || '?';
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(actor);
    return { direction: 'ad_attack', attack_type: 'PasswordSpray', tactic: getTactic('PasswordSpray'), actor, remote_ip: isIp ? actor : '', target_machine: machine, protocol: 'Spray/KRB5', severity: sev, description: 'Password spray: ' + cnt2 + ' pre-auth failures from ' + actor };
  }
  if (tm.includes('NTLM-BRUTE')) {
    const actor = g(/workstation\s+'([^']+)'/i) || g(/'([^']+)'/i) || 'unknown';
    return { direction: 'ad_attack', attack_type: 'NTLM-Brute', tactic: getTactic('NTLM-Brute'), actor, target_machine: machine, protocol: 'NTLM-Brute/SMB', severity: sev, description: 'NTLM brute force from ' + actor };
  }
  if (tm.includes('SHADOW-CRED')) {
    const actor = g(/by\s+'([^']+)'/i) || g(/actor:\s*([^\s|]+)/i) || 'unknown';
    let tgt = g(/on\s+'([^']+)'/i) || '?';
    if (tgt.startsWith('CN=')) tgt = tgt.split(',')[0].replace('CN=', '');
    return { direction: 'ad_attack', attack_type: 'ShadowCred', tactic: getTactic('ShadowCred'), actor, target_machine: machine, protocol: 'ShadowCred/LDAP', severity: sev, description: 'Shadow Credentials: msDS-KeyCredentialLink written on ' + tgt };
  }
  if (tm.includes('ESC1')) {
    const actor = g(/requester='([^']+)'/i) || g(/issued to:\s*([^\s|]+)/i) || 'unknown';
    return { direction: 'ad_attack', attack_type: 'ESC1', tactic: getTactic('ESC1'), actor, target_machine: machine, protocol: 'ESC1/HTTPS', severity: sev, description: 'ESC1: certificate SAN injection by ' + actor };
  }
  if (tm.includes('ESC2')) {
    const actor = g(/requester:\s*([^\s|]+)/i) || 'unknown';
    return { direction: 'ad_attack', attack_type: 'ESC2', tactic: getTactic('ESC2'), actor, target_machine: machine, protocol: 'ESC2/HTTPS', severity: sev, description: 'ESC2: Any-Purpose template abused by ' + actor };
  }
  if (tm.includes('ESC3')) {
    const actor = g(/'([^']+)'\s+via/i) || 'unknown';
    return { direction: 'ad_attack', attack_type: 'ESC3', tactic: getTactic('ESC3'), actor, target_machine: machine, protocol: 'ESC3/HTTPS', severity: sev, description: 'ESC3: Enrollment Agent cert by ' + actor };
  }
  if (tm.includes('ESC6')) {
    const ca = g(/CA\s+'([^']+)'/i) || machine;
    return { direction: 'ad_attack', attack_type: 'ESC6', tactic: getTactic('ESC6'), actor: 'CA-MisConfig', target_machine: machine, protocol: 'ESC6/RPC', severity: sev, description: 'ESC6: CA ' + ca + ' has EDITF_ATTRIBUTESUBJECTALTNAME2' };
  }
  if (tm.includes('CERTIPY') || tm.includes('LDAP-ENUM')) {
    const actor = g(/'([^']+)'/i) || 'unknown';
    return { direction: 'ad_attack', attack_type: 'CertipyEnum', tactic: getTactic('CertipyEnum'), actor, target_machine: machine, protocol: 'Certipy/LDAP', severity: sev, description: 'Certipy enumeration — cert template/CA discovery' };
  }
  if (tm.includes('GOLDEN-CERT')) {
    const actor = g(/by\s+'([^']+)'/i) || 'unknown';
    return { direction: 'ad_attack', attack_type: 'GoldenCert', tactic: getTactic('GoldenCert'), actor, target_machine: machine, protocol: 'GoldenCert/RPC', severity: sev, description: 'Golden Certificate: CA private key backed up by ' + actor };
  }
  if (tm.includes('PKINIT')) {
    const actor = g(/'([^']+)'\s+from/i) || 'unknown';
    const src = g(/from\s+([\d.]+)/i) || '';
    return { direction: 'ad_attack', attack_type: 'PassCert', tactic: getTactic('PassCert'), actor, remote_ip: src, target_machine: machine, protocol: 'PassCert/KRB5', severity: sev, description: 'Pass-the-Cert (PKINIT): ' + actor };
  }
  if (tm.includes('EXPLICIT-CRED')) {
    const actor = g(/'([^']+)'\s+used explicit/i) || 'unknown';
    const tgt2 = g(/to\s+'([^']+)'/i) || machine;
    return { direction: 'ad_attack', attack_type: 'ExplicitCred', tactic: getTactic('ExplicitCred'), actor, target_machine: tgt2, protocol: 'ExplicitCred/KRB5', severity: sev, description: 'Explicit cred use: ' + actor + ' -> ' + tgt2 };
  }
  if (tm.includes('COMPUTER-ACCT')) {
    const actor = g(/by\s+'([^']+)'/i) || 'unknown';
    const acct = g(/'([^']+)'\s+created/i) || '?';
    return { direction: 'ad_attack', attack_type: 'NewComputer', tactic: getTactic('NewComputer'), actor, target_machine: machine, protocol: 'NewComputer/LDAP', severity: sev, description: 'New computer account ' + acct + ' by ' + actor + ' (RBCD prep)' };
  }
  if (tm.includes('ASREP-ROAST')) {
    const actor = g(/'([^']+)'\s+from/i) || g(/account[:\s]+'([^']+)'/i) || 'unknown';
    return { direction: 'ad_attack', attack_type: 'ASREPRoast', tactic: getTactic('ASREPRoast'), actor, target_machine: machine, protocol: 'ASREP/KRB5', severity: sev, description: 'AS-REP Roasting: pre-auth not required for ' + actor };
  }
  if (tm.includes('OVERPASS-HASH')) {
    const actor = g(/'([^']+)'\s+from/i) || 'unknown';
    const src2 = g(/from\s+([\d.]+)/i) || '';
    return { direction: 'ad_attack', attack_type: 'OverpassHash', tactic: getTactic('OverpassHash'), actor, remote_ip: src2, target_machine: machine, protocol: 'OverpassHash/KRB5', severity: sev, description: 'Overpass-the-Hash: RC4 TGT from workstation IP ' + src2 };
  }
  if (tm.includes('PASS-THE-HASH')) {
    const actor = g(/'([^']+)@/i) || 'unknown';
    const src3 = g(/from\s+([\d.]+)/i) || '';
    return { direction: 'ad_attack', attack_type: 'PassTheHash', tactic: getTactic('PassTheHash'), actor, remote_ip: src3, target_machine: machine, protocol: 'PTH/NTLM', severity: sev, description: 'Pass-the-Hash: NTLM logon with blank workstation from ' + src3 };
  }
  if (tm.includes('FORGED-PAC')) {
    const actor = g(/account[:\s]+'([^']+)'/i) || 'unknown';
    return { direction: 'ad_attack', attack_type: 'ForgedPAC', tactic: getTactic('ForgedPAC'), actor, target_machine: machine, protocol: 'ForgedPAC/KRB5', severity: sev, description: 'Forged PAC / privilege escalation for ' + actor };
  }
  if (tm.includes('KERB-POLICY')) {
    const actor = g(/by\s+'([^']+)'/i) || 'unknown';
    return { direction: 'ad_attack', attack_type: 'KerbPolicy', tactic: getTactic('KerbPolicy'), actor, target_machine: machine, protocol: 'KerbPolicy/AD', severity: sev, description: 'Kerberos policy modified by ' + actor + ' — golden ticket lifetime change' };
  }
  if (tm.includes('SKELETON-KEY')) {
    const src4 = g(/source[:\s]+([\d.]+)/i) || 'unknown';
    return { direction: 'ad_attack', attack_type: 'SkeletonKey', tactic: getTactic('SkeletonKey'), actor: src4, target_machine: machine, protocol: 'SkeletonKey/KRB5', severity: sev, description: 'Skeleton Key backdoor indicator: repeated 0x18 pre-auth failures from ' + src4 };
  }

  return null;
}

function parseMaliciousEvent(r) {
  const t = (r.tag || '').toUpperCase();
  const msg = r.message || '';
  let type = 'Detected';
  let source = 'Windows Defender';
  if (t.includes('SYSMON')) source = 'Sysmon';
  else if (t.includes('YARA')) source = 'Custom YARA';
  else if (t.includes('MEMORY')) source = 'Memory Scan';


  if (t.includes('DEFENDER') && t.includes('RTP-DISABLED')) type = 'AV Disabled!';
  else if (t.includes('DEFENDER') && t.includes('TAMPER')) type = 'AV Tamper';
  else if (t.includes('DEFENDER') && t.includes('DETECTED')) type = 'Malware Found';
  else if (t.includes('AUTO-BLOCKED')) type = 'Auto-Blocked';
  else if (t.includes('NET-BLOCKED') || t.includes('CONN-KILLED')) type = 'Connection Killed';
  else if (t.includes('MALWARE')) type = 'Malware';
  else if (t.includes('SUSPICIOUS')) type = 'Suspicious Tool';
  else if (t.includes('BEHAVIORAL')) type = 'Behavioral IOC';
  else if (t.includes('HIGH-RISK')) type = 'High-Risk Parent';
  else if (t.includes('UNSIGNED')) type = 'Unsigned Exe';
  else if (t.includes('NET-ADMIN-SHARE')) type = 'Admin Share';
  else if (t.includes('AFTER-HOURS')) type = 'After-Hours Login';
  else if (t.includes('FAILED-LOGON')) type = 'Brute Force';
  else if (t.includes('PERSISTENCE')) type = 'Persistence';

  const exeM = msg.match(/\b([\w.-]+\.exe)\b/i);
  const pidM = msg.match(/PID[:\s]+(\d+)/i);
  const parM = msg.match(/[Pp]arent[:\s]+([^\s|]+)/);

  return {
    ts: r.ts, machine: r.machine, type,
    process: exeM ? exeM[1] : '-',
    pid: pidM ? pidM[1] : '',
    parent: parM ? parM[1] : '',
    severity: r.severity, source, category: r.category, message: msg.slice(0, 200),
  };
}

function parseUsbEvent(r) {
  const t = (r.tag || '').toUpperCase();
  const msg = r.message || '';
  const driveM = msg.match(/Drive\s+inserted[^:]*:\s+([A-Z]:)/i) ||
    msg.match(/[Dd]rive[:\s]+([A-Z]:)/i) ||
    msg.match(/\b([A-Z]):\\/) ||
    msg.match(/\b([A-Z]):/);
  const labelM = msg.match(/[Ll]abel[:\s]*'([^']+)'/) ||
    msg.match(/'([^']+)'\s+\(/i);
  const findM = msg.match(/(\d+)\s+finding/i);
  const sizeM = msg.match(/([\d.]+\s*(?:GB|MB))/i);
  
  let action = 'Inserted';
  if (t.includes('REMOVED') || msg.toUpperCase().includes('REMOVED')) action = 'Removed';
  else if (findM && parseInt(findM[1]) > 0) action = 'Threat Found';
  else if (msg.toUpperCase().includes('AUTORUN')) action = 'Autorun!';
  
  return {
    ts: r.ts, machine: r.machine,
    drive: driveM ? driveM[1] : '-',
    label: labelM ? labelM[1] : '',
    size: sizeM ? sizeM[1] : '',
    findings: findM ? parseInt(findM[1]) : 0,
    action, severity: r.severity, message: msg.slice(0, 200),
  };
}

function guessProto(port) {
  const m = {
    3389: 'RDP', 445: 'SMB', 5985: 'WinRM', 5986: 'WinRM-S', 22: 'SSH', 23: 'Telnet',
    88: 'Kerberos', 389: 'LDAP', 636: 'LDAPS', 135: 'RPC', 139: 'SMB',
    4444: 'Meterpreter', 80: 'HTTP', 443: 'HTTPS', 8080: 'HTTP-Alt',
    21: 'FTP', 25: 'SMTP', 53: 'DNS',
  };
  return m[port] || ('TCP:' + port);
}

function parseNetworkEvent(machine, tag, msg, sev) {
  const t = (tag || '').toUpperCase();

  // AD attack takes priority
  const ad = parseAdEvent(machine, tag, msg, sev);
  if (ad) return ad;

  // Firewall block events
  const blockM = (tag + ' ' + msg).match(
    /IOCHunt-Block(?:-(Out|In))?-(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})-(\d{1,5})/i
  );
  if (blockM) {
    const bDir = (blockM[1] || '').toUpperCase();
    const bIp = blockM[2];
    const bPort = parseInt(blockM[3]);
    if (bIp === '127.0.0.1' || bIp === '::1') return null;
    if (bDir === 'OUT' || t.includes('OUTBOUND'))
      return { direction: 'outbound', remote_ip: bIp, port: bPort, protocol: guessProto(bPort), severity: sev, blocked: 1 };
    else
      return { direction: 'inbound', remote_ip: bIp, port: bPort, protocol: guessProto(bPort), severity: sev, blocked: 1 };
  }

  const isInbound =
    t.includes('NET-ADMIN-SHARE') || t.includes('NET-BLOCKED') || t.includes('CONN-KILLED') ||
    (t.includes('DETECTED') && (
      msg.includes('RDP') || msg.includes('SMB') || msg.includes('WinRM') ||
      msg.includes('[NETWORK]') || msg.toUpperCase().includes('NETWORK') ||
      /from\s+\d{1,3}\.\d/.test(msg)
    )) ||
    (t.includes('FAILED-LOGON') && (msg.includes('From:') || msg.includes('from ')));

  if (isInbound) {
    const ipM = msg.match(/[Ff]rom[:\s]+([\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}\.[\d]{1,3})/i) ||
      msg.match(/remoteip[=:\s]+([\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}\.[\d]{1,3})/i);
    if (!ipM || ipM[1] === '127.0.0.1' || ipM[1] === '::1' || ipM[1] === '-') return null;
    const portM = msg.match(/port\s+(\d+)/i) || msg.match(/:(\d{2,5})\b/);
    const protoM = msg.match(/\b(RDP|SMB|WinRM(?:-HTTPS?)?|SSH|Telnet|PsExec|HTTP|HTTPS|FTP|SMTP)\b/i);
    const port = portM ? parseInt(portM[1]) : 0;
    return {
      direction: 'inbound', remote_ip: ipM[1], port,
      protocol: protoM ? protoM[1].toUpperCase() : guessProto(port),
      severity: sev, blocked: (t.includes('BLOCKED') || t.includes('KILLED')) ? 1 : 0
    };
  }

  const isOutbound = t.includes('OUTBOUND') || msg.toUpperCase().includes('OUTBOUND') ||
    !!msg.match(/connect(?:ed|ion)?\s+to\s+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+/i);

  if (isOutbound) {
    const m2 = msg.match(/→\s*([\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}):(\d+)/) ||
      msg.match(/->\s*([\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}):(\d+)/) ||
      msg.match(/Destination[^:]*?([\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}):(\d+)/i) ||
      msg.match(/\bto\s+([\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}):(\d+)/i) ||
      msg.match(/connect(?:ed|ion)?\s+to\s+([\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}):(\d+)/i);
    if (!m2 || m2[1] === '127.0.0.1' || m2[1] === '::1') return null;
    const port2 = parseInt(m2[2]) || 0;
    const protoM2 = msg.match(/\b(RDP|SMB|WinRM(?:-HTTPS?)?|SSH|Meterpreter|Telnet|RPC|HTTP|HTTPS|FTP)\b/i);
    return {
      direction: 'outbound', remote_ip: m2[1], port: port2,
      protocol: protoM2 ? protoM2[1].toUpperCase() : guessProto(port2),
      severity: sev, blocked: t.includes('BLOCKED') ? 1 : 0
    };
  }

  return null;
}

function parseUserEvent(r) {
  const t = (r.tag || '').toUpperCase();
  const msg = r.message || '';
  let action = 'Modified';
  if (t.includes('USER-CREATED')) action = 'User Created';
  else if (t.includes('USER-DELETED')) action = 'User Deleted';
  else if (t.includes('USER-ENABLED')) action = 'User Enabled';
  else if (t.includes('USER-DISABLED')) action = 'User Disabled';
  else if (t.includes('GROUP-MEMBER')) action = 'Group Change';
  else if (t.includes('GROUP-CHANGED')) action = 'Group Modified';
  else if (t.includes('LOG-CLEARED')) action = 'Log Cleared!';
  else if (t.includes('PASSWORD-RESET')) action = 'Password Reset';
  else if (t.includes('PASSWORD-CHANGE')) action = 'Password Changed';

  const actorM = msg.match(/by\s+'([^']+)'/i) || msg.match(/\(by\s+([^)]+)\)/i) || msg.match(/Subject:\s*[\s\S]*?Account Name:\s*([^\s]+)/i) || msg.match(/by\s+(\S+)/i);
  const actor = actorM ? actorM[1].replace(/\\/g, '').slice(0, 50) : '-';
  
  const qm = msg.match(/'([^']+)'/) || msg.match(/User Account.*?:\s*([^\s|]+)/i) || msg.match(/Target Account:\s*[\s\S]*?Account Name:\s*([^\s]+)/i) || msg.match(/Member:\s*[\s\S]*?Account Name:\s*([^\s]+)/i);
  const username = qm ? qm[1].replace(/\\/g, '').slice(0, 60) : '-';
  
  const grpM = msg.match(/group\s+'([^']+)'/i) || msg.match(/Group:\s*[\s\S]*?Group Name:\s*([^\s]+)/i) || msg.match(/group\s+([^\s]+)/i);
  const group = grpM ? grpM[1].slice(0, 60) : '';
  const is_privileged = /domain admins|enterprise admins|schema admins|administrators/i.test(group || '');

  return { 
    ts: r.ts, 
    machine: r.machine, 
    action, 
    username, 
    actor, 
    group, 
    severity: r.severity, is_privileged, 
    message: msg.slice(0, 200) 
  };
}

const sanitizeStr = (s) => {
  if (typeof s !== 'string') return s;
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const sanitizeObj = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const safe = {};
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      safe[key] = sanitizeStr(obj[key]);
    } else {
      safe[key] = obj[key];
    }
  }
  return safe;
};

module.exports = {
  parseAdEvent: (...args) => sanitizeObj(parseAdEvent(...args)),
  parseMaliciousEvent: (...args) => sanitizeObj(parseMaliciousEvent(...args)),
  parseUsbEvent: (...args) => sanitizeObj(parseUsbEvent(...args)),
  parseNetworkEvent: (...args) => sanitizeObj(parseNetworkEvent(...args)),
  parseUserEvent: (...args) => sanitizeObj(parseUserEvent(...args))
};
