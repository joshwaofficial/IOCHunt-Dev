/**
 * Rich BloodHound enterprise network & Active Directory topology dataset
 * Directly replicates BloodHound CE attack paths & cluster stars (Matching Reference Image 3)
 * Every node belongs to a structured cluster (Zero orphan or overlapping nodes).
 */

export function getSimulatedTopologyData() {
  const machines = [
    // --- Cluster 1: Exchange Trusted Subsystem (Group Hub + Servers, Exactly as in Reference Image 3) ---
    { name: 'EXCHANGE TRUSTED SUBSYSTEM', ip: '10.0.1.1', entityType: 'group', memberCount: 6, has_threat: true },
    { name: 'EXCH-001.INTERNAL.LOCAL', ip: '10.0.1.101', os: 'Windows Server 2022', entityType: 'machine', has_threat: false },
    { name: 'EXCH-002.INTERNAL.LOCAL', ip: '10.0.1.102', os: 'Windows Server 2022', entityType: 'machine', has_threat: false },
    { name: 'EXCH-003.INTERNAL.LOCAL', ip: '10.0.1.103', os: 'Windows Server 2022', entityType: 'machine', has_threat: false },
    { name: 'EXCH-004.INTERNAL.LOCAL', ip: '10.0.1.104', os: 'Windows Server 2019', entityType: 'machine', has_threat: false },
    { name: 'EXCH-005.INTERNAL.LOCAL', ip: '10.0.1.105', os: 'Windows Server 2019', entityType: 'machine', has_threat: true, threat_count: 2 },
    { name: 'EXCH-006.INTERNAL.LOCAL', ip: '10.0.1.106', os: 'Windows Server 2019', entityType: 'machine', has_threat: false },

    // --- Cluster 2: Domain Admins & Tier-0 Identity Core ---
    { name: 'DOMAIN ADMINS', ip: '10.0.0.1', entityType: 'group', memberCount: 4, has_threat: true },
    { name: 'DC-01.DEFSECON.LOCAL', ip: '10.0.0.10', os: 'Windows Server 2022 DC', entityType: 'machine', has_threat: true, threat_count: 4 },
    { name: 'DC-02.DEFSECON.LOCAL', ip: '10.0.0.11', os: 'Windows Server 2022 DC', entityType: 'machine', has_threat: false },
    { name: 'BACKUP-DC.DEFSECON.LOCAL', ip: '10.0.0.12', os: 'Windows Server 2019 DC', entityType: 'machine', has_threat: false },
    { name: 'CA-ROOT-01.DEFSECON.LOCAL', ip: '10.0.0.15', os: 'Windows Server 2022 CA', entityType: 'machine', has_threat: true, threat_count: 2 },

    // --- Cluster 3: Organization Management (Group Hub + Admins) ---
    { name: 'ORGANIZATION MANAGEMENT', ip: '10.0.2.1', entityType: 'group', memberCount: 3, has_threat: false },
    { name: 'ADMIN-WS-01', ip: '10.0.2.11', os: 'Windows 11 Enterprise', entityType: 'machine', has_threat: false },
    { name: 'ADMIN-WS-02', ip: '10.0.2.12', os: 'Windows 11 Enterprise', entityType: 'machine', has_threat: true, threat_count: 3 },
    { name: 'SEC-OPS-01', ip: '10.0.2.20', os: 'Windows 11 Enterprise', entityType: 'machine', has_threat: false },

    // --- Cluster 4: Exchange Recipient Administrators ---
    { name: 'EXCHANGE RECIPIENT ADMINS', ip: '10.0.3.1', entityType: 'group', memberCount: 4, has_threat: false },
    { name: 'MAIL-GATEWAY-01', ip: '10.0.3.10', os: 'Ubuntu 24.04 LTS', entityType: 'machine', has_threat: false },
    { name: 'HR-DESK-01', ip: '10.0.3.21', os: 'Windows 10 Pro', entityType: 'machine', has_threat: false },
    { name: 'SALES-WS-01', ip: '10.0.3.31', os: 'Windows 11 Pro', entityType: 'machine', has_threat: false },

    // --- Cluster 5: Enterprise Services & Production Databases ---
    { name: 'SQL-PROD-01', ip: '10.0.4.10', os: 'Windows Server 2022 SQL', entityType: 'machine', has_threat: true, threat_count: 3 },
    { name: 'FS-CORP-01', ip: '10.0.4.20', os: 'Windows Server 2022 File', entityType: 'machine', has_threat: false },
    { name: 'K8S-MASTER-01', ip: '10.0.4.30', os: 'Ubuntu 24.04 LTS', entityType: 'machine', has_threat: false },
    { name: 'PAYMENT-SRV-01', ip: '10.0.4.40', os: 'RHEL 9 Hardened', entityType: 'machine', has_threat: true, threat_count: 1 },

    // --- User Observed / Monitored Real Hosts ---
    { name: 'D3F53C0N3-PC-1', ip: '14.99.11.58', os: 'Windows 11 Enterprise', entityType: 'machine', has_threat: true, threat_count: 2 },
    { name: '72.62.241.39', ip: '72.62.241.39', os: 'Linux 6.8 Debian', entityType: 'machine', has_threat: false }
  ];

  // AD Attacks (Cross-cluster bridges, DCSync, Kerberoasting, GenericAll matching Image 3)
  const ad_attacks = [
    // Attacker Bridge Node (OPIERCE in Image 3) executing GenericAll across groups!
    {
      actor: 'OPIERCE@INTERNAL.LOCAL',
      attack_type: 'GenericAll',
      target_machine: 'EXCHANGE TRUSTED SUBSYSTEM',
      protocol: 'ActiveDirectory-Rights',
      description: 'Full control GenericAll privilege over Exchange Trusted Subsystem',
      severity: 'critical',
      count: 1
    },
    {
      actor: 'OPIERCE@INTERNAL.LOCAL',
      attack_type: 'GenericAll',
      target_machine: 'DOMAIN ADMINS',
      protocol: 'ActiveDirectory-Rights',
      description: 'Full control GenericAll privilege over Domain Admins group',
      severity: 'critical',
      count: 1
    },
    {
      actor: 'OPIERCE@INTERNAL.LOCAL',
      attack_type: 'GenericAll',
      target_machine: 'ORGANIZATION MANAGEMENT',
      protocol: 'ActiveDirectory-Rights',
      description: 'Full control GenericAll privilege over Organization Management',
      severity: 'critical',
      count: 1
    },
    {
      actor: 'OPIERCE@INTERNAL.LOCAL',
      attack_type: 'GenericAll',
      target_machine: 'EXCHANGE RECIPIENT ADMINS',
      protocol: 'ActiveDirectory-Rights',
      description: 'Full control GenericAll privilege over Exchange Recipient Admins',
      severity: 'critical',
      count: 1
    },
    // Domain Replication / Attack vectors
    {
      actor: 'APT29_Actor',
      attack_type: 'DCSync',
      target_machine: 'DC-01.DEFSECON.LOCAL',
      protocol: 'DRSUAPI',
      description: 'Replication request for KRBTGT domain password hashes',
      severity: 'critical',
      count: 12
    },
    {
      actor: 'DA-JFREEMAN@DEFSECON',
      attack_type: 'Kerberoasting',
      target_machine: 'SQL-PROD-01',
      protocol: 'Kerberos-TGS',
      description: 'Kerberoasting SPN ticket request against MSSQL service account',
      severity: 'high',
      count: 8
    },
    {
      actor: 'Certipy_Scanner',
      attack_type: 'ESC1',
      target_machine: 'CA-ROOT-01.DEFSECON.LOCAL',
      protocol: 'MS-WCCE',
      description: 'Misconfigured certificate template ENROLLEE_SUPPLIES_SUBJECT exploited for DA impersonation',
      severity: 'critical',
      count: 6
    },
    {
      actor: 'BACKUP_SVC@DEFSECON',
      attack_type: 'ASREPRoast',
      target_machine: 'BACKUP-DC.DEFSECON.LOCAL',
      protocol: 'Kerberos-AS',
      description: 'Pre-authentication disabled account roasted for offline cracking',
      severity: 'high',
      count: 4
    }
  ];

  // Lateral relationships & MemberOf hierarchy (Matching Image 3 Radial Fans!)
  const lateral = [
    // Exchange Trusted Subsystem Star Fan (Exact Image 3 Parity)
    { source: 'EXCH-001.INTERNAL.LOCAL', target: 'EXCHANGE TRUSTED SUBSYSTEM', protocol: 'MemberOf', port: '', count: 1, severity: 'info' },
    { source: 'EXCH-002.INTERNAL.LOCAL', target: 'EXCHANGE TRUSTED SUBSYSTEM', protocol: 'MemberOf', port: '', count: 1, severity: 'info' },
    { source: 'EXCH-003.INTERNAL.LOCAL', target: 'EXCHANGE TRUSTED SUBSYSTEM', protocol: 'MemberOf', port: '', count: 1, severity: 'info' },
    { source: 'EXCH-004.INTERNAL.LOCAL', target: 'EXCHANGE TRUSTED SUBSYSTEM', protocol: 'MemberOf', port: '', count: 1, severity: 'info' },
    { source: 'EXCH-005.INTERNAL.LOCAL', target: 'EXCHANGE TRUSTED SUBSYSTEM', protocol: 'MemberOf', port: '', count: 1, severity: 'info' },
    { source: 'EXCH-006.INTERNAL.LOCAL', target: 'EXCHANGE TRUSTED SUBSYSTEM', protocol: 'MemberOf', port: '', count: 1, severity: 'info' },

    // Domain Admins Star Fan
    { source: 'DC-01.DEFSECON.LOCAL', target: 'DOMAIN ADMINS', protocol: 'MemberOf', port: '', count: 1, severity: 'info' },
    { source: 'DC-02.DEFSECON.LOCAL', target: 'DOMAIN ADMINS', protocol: 'MemberOf', port: '', count: 1, severity: 'info' },
    { source: 'BACKUP-DC.DEFSECON.LOCAL', target: 'DOMAIN ADMINS', protocol: 'MemberOf', port: '', count: 1, severity: 'info' },
    { source: 'CA-ROOT-01.DEFSECON.LOCAL', target: 'DC-01.DEFSECON.LOCAL', protocol: 'ADCS-Sync', port: '135', count: 14, severity: 'info' },
    { source: 'DC-02.DEFSECON.LOCAL', target: 'DC-01.DEFSECON.LOCAL', protocol: 'Replication', port: '389', count: 42, severity: 'info' },

    // Organization Management Star Fan
    { source: 'ADMIN-WS-01', target: 'ORGANIZATION MANAGEMENT', protocol: 'MemberOf', port: '', count: 1, severity: 'info' },
    { source: 'ADMIN-WS-02', target: 'ORGANIZATION MANAGEMENT', protocol: 'MemberOf', port: '', count: 1, severity: 'info' },
    { source: 'SEC-OPS-01', target: 'ORGANIZATION MANAGEMENT', protocol: 'MemberOf', port: '', count: 1, severity: 'info' },
    { source: 'ADMIN-WS-02', target: 'DC-01.DEFSECON.LOCAL', protocol: 'WinRM', port: '5985', count: 28, severity: 'critical' },
    { source: 'ADMIN-WS-02', target: 'FS-CORP-01', protocol: 'SMB', port: '445', count: 35, severity: 'medium' },

    // Exchange Recipient Admins Star Fan
    { source: 'MAIL-GATEWAY-01', target: 'EXCHANGE RECIPIENT ADMINS', protocol: 'MemberOf', port: '', count: 1, severity: 'info' },
    { source: 'HR-DESK-01', target: 'EXCHANGE RECIPIENT ADMINS', protocol: 'MemberOf', port: '', count: 1, severity: 'info' },
    { source: 'SALES-WS-01', target: 'EXCHANGE RECIPIENT ADMINS', protocol: 'MemberOf', port: '', count: 1, severity: 'info' },
    { source: 'MAIL-GATEWAY-01', target: 'EXCH-001.INTERNAL.LOCAL', protocol: 'SMTP', port: '25', count: 120, severity: 'info' },

    // Services Cluster Links
    { source: 'ADMIN-WS-01', target: 'SQL-PROD-01', protocol: 'TDS', port: '1433', count: 64, severity: 'high' },
    { source: 'SEC-OPS-01', target: 'K8S-MASTER-01', protocol: 'HTTPS', port: '6443', count: 30, severity: 'info' },
    { source: 'ADMIN-WS-02', target: 'PAYMENT-SRV-01', protocol: 'SSH', port: '22', count: 15, severity: 'critical' },

    // User's Real Observed Topology Integration
    { source: 'D3F53C0N3-PC-1', target: '72.62.241.39', protocol: 'SSH', port: '22', count: 18, severity: 'high' },
    { source: 'D3F53C0N3-PC-1', target: '10.90.121.226', protocol: 'RDP', port: '3389', count: 22, severity: 'medium' },
    { source: 'D3F53C0N3-PC-1', target: 'ADMIN-WS-02', protocol: 'WinRM', port: '5985', count: 9, severity: 'critical' }
  ];

  // Inbound External Connections
  const inbound = [
    {
      from_ip: '185.220.101.5',
      to_machine: 'D3F53C0N3-PC-1',
      protocol: 'RDP',
      port: '3389',
      count: 36,
      blocked: 0,
      severity: 'critical',
      description: 'Inbound RDP session established from Tor exit node'
    },
    {
      from_ip: '194.26.29.112',
      to_machine: '72.62.241.39',
      protocol: 'SSH',
      port: '22',
      count: 180,
      blocked: 180,
      severity: 'high',
      description: 'BLOCKED brute force attack against SSH port'
    },
    {
      from_ip: '45.33.32.156',
      to_machine: 'EXCH-005.INTERNAL.LOCAL',
      protocol: 'HTTPS',
      port: '443',
      count: 48,
      blocked: 0,
      severity: 'critical',
      description: 'Exploit attempt against Exchange ProxyLogon CVE-2021-26855'
    }
  ];

  // Outbound Beacons & Exfiltration
  const outbound = [
    {
      from_machine: 'D3F53C0N3-PC-1',
      to_ip: '185.220.101.5',
      protocol: 'HTTPS',
      port: '443',
      count: 95,
      blocked: 0,
      severity: 'critical',
      description: 'Encrypted exfiltration beacon to external C2'
    },
    {
      from_machine: '72.62.241.39',
      to_ip: '8.8.8.8',
      protocol: 'DNS',
      port: '53',
      count: 340,
      blocked: 0,
      severity: 'info',
      description: 'Recursive DNS lookups'
    },
    {
      from_machine: 'ADMIN-WS-02',
      to_ip: '45.33.32.156',
      protocol: 'DNS-Tunnel',
      port: '53',
      count: 190,
      blocked: 0,
      severity: 'critical',
      description: 'High-frequency encoded DNS queries indicating tunneling'
    }
  ];

  return { machines, ad_attacks, lateral, inbound, outbound };
}
