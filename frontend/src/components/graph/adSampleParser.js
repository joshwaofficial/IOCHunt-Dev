/**
 * BloodHound AD Sample Data Parser
 * Reads raw, un-modified BloodHound collector JSON files from /ad_sampledata/
 * and extracts standard nodes and edges for BloodHoundNodeDiagram.
 */

let cachedManifest = null;
let cachedSidMap = null;

export async function getADSampleManifest() {
  if (cachedManifest) return cachedManifest;
  try {
    const res = await fetch('/ad_sampledata/manifest.json');
    if (!res.ok) throw new Error('Failed to load manifest');
    cachedManifest = await res.json();
    return cachedManifest;
  } catch (err) {
    console.warn('[ADSample] Error loading manifest:', err);
    return [];
  }
}

export async function getADSidMap() {
  if (cachedSidMap) return cachedSidMap;
  try {
    const res = await fetch('/ad_sampledata/sidMap.json');
    if (!res.ok) throw new Error('Failed to load sidMap');
    cachedSidMap = await res.json();
    return cachedSidMap;
  } catch (err) {
    console.warn('[ADSample] Error loading sidMap:', err);
    return {};
  }
}

function resolveSidName(id, sidMap) {
  if (!id) return 'UNKNOWN';
  if (sidMap[id]) return sidMap[id];
  const stripped = id.replace(/^[A-Z0-9.-]+-(S-1-)/i, '$1');
  if (sidMap[stripped]) return sidMap[stripped];
  return id;
}

/**
 * Parses raw BloodHound collector JSON without modifying original data.
 */
export async function loadADSampleFile(filename, sidMap) {
  const sMap = sidMap || (await getADSidMap());
  const res = await fetch(`/ad_sampledata/${filename}`);
  if (!res.ok) throw new Error(`Failed to load ${filename}`);
  const json = await res.json();
  const data = json.data || [];

  const machines = [];
  const lateral = [];
  const adAttacks = [];
  const seenNodes = new Map();

  function ensureNode(name, defaultType = 'machine', raw = {}) {
    if (!name) return null;
    const cleanName = resolveSidName(name, sMap);
    if (!seenNodes.has(cleanName)) {
      const uName = cleanName.toUpperCase();
      const isGroup = defaultType === 'group' || uName.includes('ADMINS') || uName.includes('OPERATORS') || uName.includes('USERS') || uName.includes('COMPUTERS') || uName.includes('CONTAINERS');
      const isUser = defaultType === 'user' || cleanName.includes('@');
      const isCritical = raw.admincount || raw.has_threat || ['KRBTGT', 'ADMINISTRATOR'].some(k => uName.includes(k));

      const nodeObj = {
        name: cleanName,
        entityType: isGroup ? 'group' : (isUser ? 'user' : defaultType),
        memberCount: raw.memberCount || 0,
        has_threat: isCritical,
        threat_count: isCritical ? 2 : 0,
        raw
      };
      seenNodes.set(cleanName, nodeObj);
      machines.push(nodeObj);
    }
    return cleanName;
  }

  const isGroups = filename.includes('groups');
  const isUsers = filename.includes('users');
  const isComputers = filename.includes('computers');
  const isDomains = filename.includes('domains');

  // Limit processing to first 75 objects to keep graph responsive & crystal-clear
  const sampleSlice = data.slice(0, 75);

  sampleSlice.forEach(item => {
    const p = item.Properties || {};
    const name = p.name || item.ObjectIdentifier;
    if (!name) return;

    let eType = isGroups ? 'group' : (isUsers ? 'user' : (isComputers ? 'machine' : (isDomains ? 'group' : 'group')));
    ensureNode(name, eType, {
      ...p,
      memberCount: item.Members ? item.Members.length : 0,
      has_threat: p.admincount || p.dontreqpreauth || p.hasspn
    });

    // 1. Group Memberships
    if (item.Members) {
      item.Members.slice(0, 12).forEach(m => {
        const mType = m.ObjectType ? m.ObjectType.toLowerCase() : 'user';
        const mName = ensureNode(m.ObjectIdentifier, mType);
        if (mName) {
          lateral.push({
            source: mName,
            target: name,
            protocol: 'MemberOf',
            port: '',
            count: 1,
            severity: 'info'
          });
        }
      });
    }

    // 2. Active Directory ACEs / Permissions
    if (item.Aces) {
      item.Aces.slice(0, 15).forEach(a => {
        if (!a.IsInherited && a.RightName && !['GenericRead', 'ReadControl'].includes(a.RightName)) {
          const aType = a.PrincipalType ? a.PrincipalType.toLowerCase() : 'user';
          const aName = ensureNode(a.PrincipalSID, aType);
          if (aName) {
            const isCrit = ['GenericAll', 'WriteDacl', 'WriteOwner', 'Owns', 'AllExtendedRights'].includes(a.RightName);
            if (isCrit) {
              adAttacks.push({
                actor: aName,
                attack_type: a.RightName,
                target_machine: name,
                protocol: 'ActiveDirectory-Rights',
                severity: 'critical',
                count: 1
              });
            } else {
              lateral.push({
                source: aName,
                target: name,
                protocol: a.RightName,
                port: '',
                count: 1,
                severity: 'high'
              });
            }
          }
        }
      });
    }

    // 3. User / Privileged Sessions
    if (item.PrivilegedSessions && item.PrivilegedSessions.Results) {
      item.PrivilegedSessions.Results.slice(0, 8).forEach(s => {
        const uName = ensureNode(s.UserSID, 'user');
        if (uName) {
          adAttacks.push({
            actor: uName,
            attack_type: 'PrivilegedSession',
            target_machine: name,
            protocol: 'Interactive-Logon',
            severity: 'high',
            count: 1
          });
        }
      });
    }

    // 4. Registry Sessions
    if (item.RegistrySessions && item.RegistrySessions.Results) {
      item.RegistrySessions.Results.slice(0, 8).forEach(s => {
        const uName = ensureNode(s.UserSID, 'user');
        if (uName) {
          adAttacks.push({
            actor: uName,
            attack_type: 'RegistrySession',
            target_machine: name,
            protocol: 'ActiveDirectory-Session',
            severity: 'high',
            count: 1
          });
        }
      });
    }

    // 5. Container / OU nesting (ContainedBy)
    if (item.ContainedBy && item.ContainedBy.ObjectIdentifier) {
      const parentName = ensureNode(item.ContainedBy.ObjectIdentifier, 'group');
      if (parentName) {
        lateral.push({
          source: name,
          target: parentName,
          protocol: 'ContainedIn',
          port: '',
          count: 1,
          severity: 'info'
        });
      }
    }
  });

  // Consolidate parallel edges between identical (source, target) endpoints so text badges don't stack
  const consolidatedAttacks = [];
  const seenAttacks = new Map();
  adAttacks.forEach(a => {
    const key = `${a.actor}->${a.target_machine}`;
    if (!seenAttacks.has(key)) {
      const entry = { ...a, rights: [a.attack_type] };
      seenAttacks.set(key, entry);
      consolidatedAttacks.push(entry);
    } else {
      const entry = seenAttacks.get(key);
      if (!entry.rights.includes(a.attack_type)) {
        entry.rights.push(a.attack_type);
        entry.count = entry.rights.length;
        entry.attack_type = `${entry.rights[0]} (+${entry.rights.length - 1})`;
        entry.description = `AD Rights: ${entry.rights.join(', ')}`;
      }
    }
  });

  const consolidatedLateral = [];
  const seenLateral = new Map();
  lateral.forEach(l => {
    const key = `${l.source}->${l.target}`;
    if (!seenLateral.has(key)) {
      const entry = { ...l, rights: [l.protocol] };
      seenLateral.set(key, entry);
      consolidatedLateral.push(entry);
    } else {
      const entry = seenLateral.get(key);
      if (!entry.rights.includes(l.protocol)) {
        entry.rights.push(l.protocol);
        entry.count = entry.rights.length;
        entry.protocol = `${entry.rights[0]} (+${entry.rights.length - 1})`;
        entry.description = `Relations: ${entry.rights.join(', ')}`;
      }
    }
  });

  return {
    machines,
    lateral: consolidatedLateral,
    ad_attacks: consolidatedAttacks,
    inbound: [],
    outbound: [],
    meta: {
      filename,
      totalObjects: data.length,
      displayedNodes: machines.length,
      displayedEdges: consolidatedLateral.length + consolidatedAttacks.length
    }
  };
}
