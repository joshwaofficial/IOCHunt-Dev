/**
 * Rich simulated enterprise network & Active Directory topology dataset
 * Used to demonstrate large-scale BloodHound visualization (60+ nodes, 100+ edges)
 * Easily enabled/disabled with the "Simulation Mode" toggle.
 * Safe to delete/remove at any time without touching real backend data.
 */

export function getSimulatedTopologyData() {
  const machines = [
    // Domain Controllers & Identity
    { name: 'DC-01.DEFSECON.LOCAL', ip: '10.0.0.1', os: 'Windows Server 2022', has_threat: true, threat_count: 5 },
    { name: 'DC-02.DEFSECON.LOCAL', ip: '10.0.0.2', os: 'Windows Server 2022', has_threat: false, threat_count: 0 },
    { name: 'RODC-BRANCH-01', ip: '10.0.0.4', os: 'Windows Server 2019', has_threat: false, threat_count: 0 },
    { name: 'BACKUP-DC.DEFSECON.LOCAL', ip: '10.0.0.3', os: 'Windows Server 2019', has_threat: true, threat_count: 2 },
    { name: 'CA-ROOT-01.DEFSECON.LOCAL', ip: '10.0.0.5', os: 'Windows Server 2019', has_threat: true, threat_count: 4 },
    { name: 'CA-SUB-01.DEFSECON.LOCAL', ip: '10.0.0.6', os: 'Windows Server 2022', has_threat: false, threat_count: 0 },

    // Infrastructure & Storage
    { name: 'FS-CORP-01', ip: '10.0.1.10', os: 'Windows Server 2022', has_threat: true, threat_count: 2 },
    { name: 'FS-FINANCE-02', ip: '10.0.1.11', os: 'Windows Server 2022', has_threat: false, threat_count: 0 },
    { name: 'NAS-BACKUP-01', ip: '10.0.1.50', os: 'TrueNAS Core', has_threat: false, threat_count: 0 },
    { name: 'MAIL-EXCH-01', ip: '10.0.1.30', os: 'Windows Server 2019', has_threat: true, threat_count: 3 },

    // Databases & Data Warehouse
    { name: 'SQL-PROD-01', ip: '10.0.1.20', os: 'Windows Server 2022', has_threat: true, threat_count: 6 },
    { name: 'SQL-CLUSTER-02', ip: '10.0.1.21', os: 'Windows Server 2022', has_threat: false, threat_count: 0 },
    { name: 'POSTGRES-DW-01', ip: '10.0.2.15', os: 'Ubuntu 24.04 LTS', has_threat: false, threat_count: 0 },
    { name: 'MONGO-APP-01', ip: '10.0.2.16', os: 'Ubuntu 24.04 LTS', has_threat: false, threat_count: 0 },

    // Web & Microservices
    { name: 'WEB-FRONTEND-01', ip: '10.0.2.5', os: 'Ubuntu 24.04 LTS', has_threat: true, threat_count: 1 },
    { name: 'WEB-FRONTEND-02', ip: '10.0.2.6', os: 'Ubuntu 24.04 LTS', has_threat: false, threat_count: 0 },
    { name: 'API-GATEWAY-01', ip: '10.0.2.1', os: 'Debian 12 Bookworm', has_threat: false, threat_count: 0 },
    { name: 'PAYMENT-SRV-01', ip: '10.0.2.55', os: 'Red Hat Enterprise Linux 9', has_threat: true, threat_count: 3 },
    { name: 'AUTH-KEYCLOAK-01', ip: '10.0.2.8', os: 'Ubuntu 24.04 LTS', has_threat: false, threat_count: 0 },

    // CI/CD & DevOps
    { name: 'GITLAB-SRV-01', ip: '10.0.2.10', os: 'Ubuntu 24.04 LTS', has_threat: false, threat_count: 0 },
    { name: 'JENKINS-BUILD-01', ip: '10.0.2.11', os: 'Ubuntu 24.04 LTS', has_threat: true, threat_count: 1 },
    { name: 'K8S-MASTER-01', ip: '10.0.2.20', os: 'Ubuntu 24.04 LTS', has_threat: true, threat_count: 2 },
    { name: 'K8S-WORKER-01', ip: '10.0.2.21', os: 'Ubuntu 24.04 LTS', has_threat: false, threat_count: 0 },
    { name: 'K8S-WORKER-02', ip: '10.0.2.22', os: 'Ubuntu 24.04 LTS', has_threat: false, threat_count: 0 },
    { name: 'PROMETHEUS-MON-01', ip: '10.0.2.99', os: 'Alpine Linux', has_threat: false, threat_count: 0 },

    // Admin & Security Operations
    { name: 'JUMP-BASTION-01', ip: '10.0.3.1', os: 'Debian 12 Hardened', has_threat: false, threat_count: 0 },
    { name: 'VPN-GATEWAY-01', ip: '10.0.3.2', os: 'pfSense Enterprise', has_threat: true, threat_count: 2 },
    { name: 'ADMIN-WS-01', ip: '10.0.3.11', os: 'Windows 11 Enterprise', has_threat: false, threat_count: 0 },
    { name: 'ADMIN-WS-02', ip: '10.0.3.12', os: 'Windows 11 Enterprise', has_threat: true, threat_count: 7 },
    { name: 'SEC-OPS-01', ip: '10.0.3.5', os: 'Windows 11 Enterprise', has_threat: false, threat_count: 0 },

    // VIP & Executive
    { name: 'CEO-LAPTOP-01', ip: '10.0.5.201', os: 'macOS Sequoia', has_threat: true, threat_count: 1 },
    { name: 'CFO-MACBOOK-01', ip: '10.0.5.202', os: 'macOS Sequoia', has_threat: false, threat_count: 0 },
    { name: 'CTO-THINKPAD-01', ip: '10.0.5.203', os: 'Fedora Workstation 40', has_threat: false, threat_count: 0 },

    // Finance Department
    { name: 'FINANCE-PC-01', ip: '10.0.5.101', os: 'Windows 10 Pro', has_threat: false, threat_count: 0 },
    { name: 'FINANCE-PC-02', ip: '10.0.5.102', os: 'Windows 10 Pro', has_threat: true, threat_count: 4 },
    { name: 'FINANCE-PC-03', ip: '10.0.5.103', os: 'Windows 11 Pro', has_threat: false, threat_count: 0 },

    // HR & Sales
    { name: 'HR-DESK-01', ip: '10.0.6.11', os: 'Windows 10 Pro', has_threat: false, threat_count: 0 },
    { name: 'HR-DESK-02', ip: '10.0.6.12', os: 'Windows 11 Pro', has_threat: true, threat_count: 2 },
    { name: 'SALES-WS-01', ip: '10.0.7.31', os: 'Windows 11 Enterprise', has_threat: false, threat_count: 0 },
    { name: 'SALES-WS-02', ip: '10.0.7.32', os: 'Windows 11 Enterprise', has_threat: false, threat_count: 0 },
    { name: 'SALES-WS-03', ip: '10.0.7.33', os: 'Windows 11 Enterprise', has_threat: true, threat_count: 1 },

    // Engineering & Dev
    { name: 'DEV-BOX-01', ip: '10.0.4.11', os: 'Ubuntu 24.04 LTS', has_threat: false, threat_count: 0 },
    { name: 'DEV-BOX-02', ip: '10.0.4.12', os: 'macOS Sonoma', has_threat: false, threat_count: 0 },
    { name: 'DEV-BOX-07', ip: '10.0.4.15', os: 'macOS Sequoia', has_threat: false, threat_count: 0 },
    { name: 'ENG-CAD-01', ip: '10.0.4.50', os: 'Windows 11 Pro', has_threat: false, threat_count: 0 },

    // User's Real Observed Nodes (Integrated into the network!)
    { name: 'D3F53C0N3-PC-1', ip: '14.99.11.58', os: 'Windows 11 Enterprise', has_threat: true, threat_count: 4 },
    { name: '72.62.241.39', ip: '72.62.241.39', os: 'Linux 6.8 Debian', has_threat: false, threat_count: 0 }
  ];

  const ad_attacks = [
    {
      actor: 'APT29_Actor',
      attack_type: 'DCSync',
      target_machine: 'DC-01.DEFSECON.LOCAL',
      protocol: 'DRSUAPI',
      description: 'Replication request for domain credentials via DCSync',
      severity: 'critical',
      count: 18,
      first_seen: new Date(Date.now() - 3600000 * 6).toISOString(),
      last_seen: new Date(Date.now() - 600000).toISOString()
    },
    {
      actor: 'APT29_Actor',
      attack_type: 'DCShadow',
      target_machine: 'DC-02.DEFSECON.LOCAL',
      protocol: 'RPC-Replication',
      description: 'Rogue domain controller registered to inject backdoors',
      severity: 'critical',
      count: 7,
      first_seen: new Date(Date.now() - 3600000 * 4).toISOString(),
      last_seen: new Date(Date.now() - 900000).toISOString()
    },
    {
      actor: 'jfreeman@DEFSECON',
      attack_type: 'Kerberoasting',
      target_machine: 'SQL-PROD-01',
      protocol: 'Kerberos-TGS',
      description: 'SPN ticket request for high-privilege service account',
      severity: 'high',
      count: 14,
      first_seen: new Date(Date.now() - 3600000 * 12).toISOString(),
      last_seen: new Date(Date.now() - 1200000).toISOString()
    },
    {
      actor: 'dsmith_helpdesk',
      attack_type: 'PassTheHash',
      target_machine: 'ADMIN-WS-02',
      protocol: 'NTLM-RPC',
      description: 'NTLM hash authentication without plaintext password',
      severity: 'critical',
      count: 26,
      first_seen: new Date(Date.now() - 3600000 * 24).toISOString(),
      last_seen: new Date(Date.now() - 1800000).toISOString()
    },
    {
      actor: 'backup_svc',
      attack_type: 'ASREPRoast',
      target_machine: 'BACKUP-DC.DEFSECON.LOCAL',
      protocol: 'Kerberos-AS',
      description: 'Pre-authentication disabled account roasted for offline cracking',
      severity: 'high',
      count: 9,
      first_seen: new Date(Date.now() - 3600000 * 18).toISOString(),
      last_seen: new Date(Date.now() - 7200000).toISOString()
    },
    {
      actor: 'ShadowActor',
      attack_type: 'ShadowCred',
      target_machine: 'CA-ROOT-01.DEFSECON.LOCAL',
      protocol: 'LDAP-KeyCred',
      description: 'Injected shadow credential attribute into target machine object',
      severity: 'critical',
      count: 6,
      first_seen: new Date(Date.now() - 3600000 * 48).toISOString(),
      last_seen: new Date(Date.now() - 14400000).toISOString()
    },
    {
      actor: 'Certipy_Scanner',
      attack_type: 'ESC1',
      target_machine: 'CA-ROOT-01.DEFSECON.LOCAL',
      protocol: 'MS-WCCE',
      description: 'Misconfigured certificate template ENROLLEE_SUPPLIES_SUBJECT exploited for DA impersonation',
      severity: 'critical',
      count: 11,
      first_seen: new Date(Date.now() - 3600000 * 15).toISOString(),
      last_seen: new Date(Date.now() - 2400000).toISOString()
    },
    {
      actor: 'Certipy_Scanner',
      attack_type: 'ESC3',
      target_machine: 'CA-SUB-01.DEFSECON.LOCAL',
      protocol: 'MS-CSRA',
      description: 'Certificate Request Agent template abuse',
      severity: 'high',
      count: 4,
      first_seen: new Date(Date.now() - 3600000 * 22).toISOString(),
      last_seen: new Date(Date.now() - 3600000).toISOString()
    },
    {
      actor: 'guest_user',
      attack_type: 'PasswordSpray',
      target_machine: 'DC-02.DEFSECON.LOCAL',
      protocol: 'SMB-Auth',
      description: 'Rotated password spray across 120 active accounts',
      severity: 'high',
      count: 65,
      first_seen: new Date(Date.now() - 3600000 * 8).toISOString(),
      last_seen: new Date(Date.now() - 3600000).toISOString()
    },
    {
      actor: 'Compromised_Admin',
      attack_type: 'RBCD',
      target_machine: 'FS-CORP-01',
      protocol: 'LDAP',
      description: 'Resource-Based Constrained Delegation configuration modified',
      severity: 'critical',
      count: 5,
      first_seen: new Date(Date.now() - 3600000 * 30).toISOString(),
      last_seen: new Date(Date.now() - 10800000).toISOString()
    },
    {
      actor: 'Insider_Threat',
      attack_type: 'OverpassHash',
      target_machine: 'PAYMENT-SRV-01',
      protocol: 'Kerberos',
      description: 'Overpass-the-hash to request Kerberos TGT from NTLM hash',
      severity: 'critical',
      count: 8,
      first_seen: new Date(Date.now() - 3600000 * 16).toISOString(),
      last_seen: new Date(Date.now() - 360000).toISOString()
    },
    {
      actor: 'Mimikatz_Runner',
      attack_type: 'SkeletonKey',
      target_machine: 'DC-01.DEFSECON.LOCAL',
      protocol: 'LSASS-Injection',
      description: 'Skeleton Key master password injected into LSASS memory',
      severity: 'critical',
      count: 3,
      first_seen: new Date(Date.now() - 3600000 * 10).toISOString(),
      last_seen: new Date(Date.now() - 720000).toISOString()
    },
    {
      actor: 'External_Scanner',
      attack_type: 'NTLM-Brute',
      target_machine: 'MAIL-EXCH-01',
      protocol: 'EWS',
      description: 'Exchange Web Services brute-force spray against executive accounts',
      severity: 'high',
      count: 82,
      first_seen: new Date(Date.now() - 3600000 * 32).toISOString(),
      last_seen: new Date(Date.now() - 180000).toISOString()
    },
    {
      actor: 'APT29_Actor',
      attack_type: 'GoldenCert',
      target_machine: 'CA-ROOT-01.DEFSECON.LOCAL',
      protocol: 'PKI-Forge',
      description: 'Stolen CA private key used to forge Golden Certificate for Domain Admin',
      severity: 'critical',
      count: 2,
      first_seen: new Date(Date.now() - 3600000 * 5).toISOString(),
      last_seen: new Date(Date.now() - 120000).toISOString()
    }
  ];

  const lateral = [
    {
      source: 'ADMIN-WS-02',
      target: 'DC-01.DEFSECON.LOCAL',
      protocol: 'WinRM',
      port: '5985',
      count: 38,
      blocked: 0,
      severity: 'critical',
      description: 'Remote PowerShell session opened to Domain Controller',
      first_seen: new Date(Date.now() - 3600000 * 14).toISOString(),
      last_seen: new Date(Date.now() - 900000).toISOString()
    },
    {
      source: 'ADMIN-WS-02',
      target: 'DC-02.DEFSECON.LOCAL',
      protocol: 'WMI',
      port: '135',
      count: 22,
      blocked: 0,
      severity: 'high',
      description: 'WMI command execution across domain infrastructure',
      first_seen: new Date(Date.now() - 3600000 * 12).toISOString(),
      last_seen: new Date(Date.now() - 1100000).toISOString()
    },
    {
      source: 'D3F53C0N3-PC-1',
      target: '72.62.241.39',
      protocol: 'SSH',
      port: '22',
      count: 16,
      blocked: 0,
      severity: 'high',
      description: 'Remote administrative SSH tunnel connection',
      first_seen: new Date(Date.now() - 3600000 * 40).toISOString(),
      last_seen: new Date(Date.now() - 300000).toISOString()
    },
    {
      source: 'D3F53C0N3-PC-1',
      target: '10.90.121.226',
      protocol: 'RDP',
      port: '3389',
      count: 21,
      blocked: 0,
      severity: 'medium',
      description: 'Interactive remote desktop session',
      first_seen: new Date(Date.now() - 3600000 * 36).toISOString(),
      last_seen: new Date(Date.now() - 1500000).toISOString()
    },
    {
      source: 'FINANCE-PC-02',
      target: 'SQL-PROD-01',
      protocol: 'TDS',
      port: '1433',
      count: 94,
      blocked: 0,
      severity: 'high',
      description: 'Bulk unauthorized database queries from finance endpoint',
      first_seen: new Date(Date.now() - 3600000 * 10).toISOString(),
      last_seen: new Date(Date.now() - 180000).toISOString()
    },
    {
      source: 'FINANCE-PC-02',
      target: 'FS-FINANCE-02',
      protocol: 'SMB',
      port: '445',
      count: 45,
      blocked: 0,
      severity: 'medium',
      description: 'Finance department archival share scan',
      first_seen: new Date(Date.now() - 3600000 * 18).toISOString(),
      last_seen: new Date(Date.now() - 500000).toISOString()
    },
    {
      source: 'ADMIN-WS-02',
      target: 'FS-CORP-01',
      protocol: 'SMB',
      port: '445',
      count: 52,
      blocked: 0,
      severity: 'medium',
      description: 'C$ admin share accessed across network',
      first_seen: new Date(Date.now() - 3600000 * 20).toISOString(),
      last_seen: new Date(Date.now() - 7200000).toISOString()
    },
    {
      source: 'ADMIN-WS-02',
      target: 'CA-ROOT-01.DEFSECON.LOCAL',
      protocol: 'RPC',
      port: '135',
      count: 24,
      blocked: 0,
      severity: 'high',
      description: 'CertEnroll RPC request to certificate authority',
      first_seen: new Date(Date.now() - 3600000 * 16).toISOString(),
      last_seen: new Date(Date.now() - 2400000).toISOString()
    },
    {
      source: 'DEV-BOX-07',
      target: 'GITLAB-SRV-01',
      protocol: 'SSH',
      port: '22',
      count: 75,
      blocked: 0,
      severity: 'info',
      description: 'Git deployment pipeline synchronization',
      first_seen: new Date(Date.now() - 3600000 * 50).toISOString(),
      last_seen: new Date(Date.now() - 400000).toISOString()
    },
    {
      source: 'DEV-BOX-01',
      target: 'POSTGRES-DW-01',
      protocol: 'PostgreSQL',
      port: '5432',
      count: 130,
      blocked: 0,
      severity: 'info',
      description: 'Data warehouse reporting queries',
      first_seen: new Date(Date.now() - 3600000 * 65).toISOString(),
      last_seen: new Date(Date.now() - 150000).toISOString()
    },
    {
      source: 'DEV-BOX-02',
      target: 'MONGO-APP-01',
      protocol: 'MongoDB',
      port: '27017',
      count: 90,
      blocked: 0,
      severity: 'info',
      description: 'Microservice document store read/write',
      first_seen: new Date(Date.now() - 3600000 * 45).toISOString(),
      last_seen: new Date(Date.now() - 250000).toISOString()
    },
    {
      source: 'SEC-OPS-01',
      target: 'DC-01.DEFSECON.LOCAL',
      protocol: 'LDAPS',
      port: '636',
      count: 140,
      blocked: 0,
      severity: 'info',
      description: 'Directory auditing & SOC baseline collection',
      first_seen: new Date(Date.now() - 3600000 * 60).toISOString(),
      last_seen: new Date(Date.now() - 100000).toISOString()
    },
    {
      source: 'SALES-WS-03',
      target: 'MAIL-EXCH-01',
      protocol: 'HTTPS',
      port: '443',
      count: 180,
      blocked: 0,
      severity: 'info',
      description: 'Exchange ActiveSync mail retrieval',
      first_seen: new Date(Date.now() - 3600000 * 70).toISOString(),
      last_seen: new Date(Date.now() - 60000).toISOString()
    },
    {
      source: 'HR-DESK-02',
      target: 'DC-01.DEFSECON.LOCAL',
      protocol: 'LDAP',
      port: '389',
      count: 32,
      blocked: 0,
      severity: 'medium',
      description: 'Employee directory search',
      first_seen: new Date(Date.now() - 3600000 * 25).toISOString(),
      last_seen: new Date(Date.now() - 300000).toISOString()
    },
    {
      source: 'JUMP-BASTION-01',
      target: 'PAYMENT-SRV-01',
      protocol: 'SSH',
      port: '22',
      count: 12,
      blocked: 0,
      severity: 'medium',
      description: 'Privileged bastion administrative login',
      first_seen: new Date(Date.now() - 3600000 * 8).toISOString(),
      last_seen: new Date(Date.now() - 1200000).toISOString()
    },
    {
      source: 'JUMP-BASTION-01',
      target: 'SQL-PROD-01',
      protocol: 'RDP',
      port: '3389',
      count: 8,
      blocked: 0,
      severity: 'medium',
      description: 'DBA maintenance session',
      first_seen: new Date(Date.now() - 3600000 * 11).toISOString(),
      last_seen: new Date(Date.now() - 1800000).toISOString()
    },
    {
      source: 'JENKINS-BUILD-01',
      target: 'K8S-MASTER-01',
      protocol: 'HTTPS',
      port: '6443',
      count: 60,
      blocked: 0,
      severity: 'info',
      description: 'Automated CI/CD deployment to production cluster',
      first_seen: new Date(Date.now() - 3600000 * 30).toISOString(),
      last_seen: new Date(Date.now() - 450000).toISOString()
    },
    {
      source: '10.0.10.15',
      target: 'K8S-MASTER-01',
      protocol: 'HTTPS',
      port: '6443',
      count: 14,
      blocked: 14,
      severity: 'critical',
      description: 'BLOCKED unauthorized Kubernetes API query from rogue IP',
      first_seen: new Date(Date.now() - 3600000 * 2).toISOString(),
      last_seen: new Date(Date.now() - 500000).toISOString()
    },
    {
      source: 'WEB-FRONTEND-01',
      target: 'API-GATEWAY-01',
      protocol: 'gRPC',
      port: '50051',
      count: 450,
      blocked: 0,
      severity: 'info',
      description: 'Internal microservice RPC mesh traffic',
      first_seen: new Date(Date.now() - 3600000 * 80).toISOString(),
      last_seen: new Date(Date.now() - 20000).toISOString()
    },
    {
      source: 'API-GATEWAY-01',
      target: 'AUTH-KEYCLOAK-01',
      protocol: 'OAuth2',
      port: '8080',
      count: 320,
      blocked: 0,
      severity: 'info',
      description: 'JWT validation and token introspection',
      first_seen: new Date(Date.now() - 3600000 * 80).toISOString(),
      last_seen: new Date(Date.now() - 15000).toISOString()
    },
    {
      source: 'CEO-LAPTOP-01',
      target: 'FS-FINANCE-02',
      protocol: 'SMB',
      port: '445',
      count: 15,
      blocked: 0,
      severity: 'info',
      description: 'Quarterly financial forecast document access',
      first_seen: new Date(Date.now() - 3600000 * 12).toISOString(),
      last_seen: new Date(Date.now() - 600000).toISOString()
    }
  ];

  const inbound = [
    {
      from_ip: '185.220.101.5',
      to_machine: 'D3F53C0N3-PC-1',
      protocol: 'RDP',
      port: '3389',
      count: 42,
      blocked: 0,
      severity: 'critical',
      description: 'Inbound RDP session established from Tor exit node',
      first_seen: new Date(Date.now() - 3600000 * 8).toISOString(),
      last_seen: new Date(Date.now() - 1800000).toISOString()
    },
    {
      from_ip: '45.33.32.156',
      to_machine: 'ADMIN-WS-02',
      protocol: 'HTTPS',
      port: '8443',
      count: 98,
      blocked: 0,
      severity: 'critical',
      description: 'Inbound payload delivery beacon from known C2',
      first_seen: new Date(Date.now() - 3600000 * 22).toISOString(),
      last_seen: new Date(Date.now() - 360000).toISOString()
    },
    {
      from_ip: '194.26.29.112',
      to_machine: '72.62.241.39',
      protocol: 'SSH',
      port: '22',
      count: 215,
      blocked: 215,
      severity: 'high',
      description: 'BLOCKED brute force attack against SSH port',
      first_seen: new Date(Date.now() - 3600000 * 30).toISOString(),
      last_seen: new Date(Date.now() - 200000).toISOString()
    },
    {
      from_ip: '91.240.118.17',
      to_machine: 'MAIL-EXCH-01',
      protocol: 'SMTP',
      port: '25',
      count: 86,
      blocked: 0,
      severity: 'medium',
      description: 'Inbound phishing campaign delivery stream',
      first_seen: new Date(Date.now() - 3600000 * 15).toISOString(),
      last_seen: new Date(Date.now() - 4500000).toISOString()
    },
    {
      from_ip: '103.251.167.20',
      to_machine: 'VPN-GATEWAY-01',
      protocol: 'IPsec',
      port: '500',
      count: 140,
      blocked: 140,
      severity: 'high',
      description: 'BLOCKED aggressive IKE scan against corporate VPN gateway',
      first_seen: new Date(Date.now() - 3600000 * 28).toISOString(),
      last_seen: new Date(Date.now() - 800000).toISOString()
    },
    {
      from_ip: '198.51.100.24',
      to_machine: 'WEB-FRONTEND-01',
      protocol: 'HTTPS',
      port: '443',
      count: 320,
      blocked: 0,
      severity: 'medium',
      description: 'Public web traffic with high URL parameter entropy',
      first_seen: new Date(Date.now() - 3600000 * 10).toISOString(),
      last_seen: new Date(Date.now() - 100000).toISOString()
    },
    {
      from_ip: '10.0.20.105',
      to_machine: 'FS-CORP-01',
      protocol: 'SMB',
      port: '445',
      count: 55,
      blocked: 0,
      severity: 'info',
      description: 'Department file share synchronization',
      first_seen: new Date(Date.now() - 3600000 * 48).toISOString(),
      last_seen: new Date(Date.now() - 120000).toISOString()
    },
    {
      from_ip: '192.168.1.50',
      to_machine: 'DEV-BOX-07',
      protocol: 'HTTP',
      port: '3000',
      count: 110,
      blocked: 0,
      severity: 'info',
      description: 'Local staging container test traffic',
      first_seen: new Date(Date.now() - 3600000 * 72).toISOString(),
      last_seen: new Date(Date.now() - 80000).toISOString()
    },
    {
      from_ip: '172.16.5.99',
      to_machine: 'PROMETHEUS-MON-01',
      protocol: 'HTTP-Metrics',
      port: '9090',
      count: 560,
      blocked: 0,
      severity: 'info',
      description: 'Node exporter metrics telemetry scraping',
      first_seen: new Date(Date.now() - 3600000 * 96).toISOString(),
      last_seen: new Date(Date.now() - 10000).toISOString()
    }
  ];

  const outbound = [
    {
      from_machine: 'D3F53C0N3-PC-1',
      to_ip: '185.220.101.5',
      protocol: 'HTTPS',
      port: '443',
      count: 125,
      blocked: 0,
      severity: 'critical',
      description: 'Encrypted exfiltration beacon to external C2',
      first_seen: new Date(Date.now() - 3600000 * 7).toISOString(),
      last_seen: new Date(Date.now() - 60000).toISOString()
    },
    {
      from_machine: 'FINANCE-PC-02',
      to_ip: '198.51.100.77',
      protocol: 'FTP',
      port: '21',
      count: 24,
      blocked: 24,
      severity: 'critical',
      description: 'BLOCKED outbound cleartext FTP connection attempt',
      first_seen: new Date(Date.now() - 3600000 * 5).toISOString(),
      last_seen: new Date(Date.now() - 900000).toISOString()
    },
    {
      from_machine: 'ADMIN-WS-02',
      to_ip: '45.33.32.156',
      protocol: 'DNS-Tunnel',
      port: '53',
      count: 280,
      blocked: 0,
      severity: 'critical',
      description: 'High-frequency encoded DNS queries indicating tunneling',
      first_seen: new Date(Date.now() - 3600000 * 20).toISOString(),
      last_seen: new Date(Date.now() - 150000).toISOString()
    },
    {
      from_machine: 'GITLAB-SRV-01',
      to_ip: '140.82.121.4',
      protocol: 'HTTPS',
      port: '443',
      count: 310,
      blocked: 0,
      severity: 'info',
      description: 'GitHub upstream remote mirroring',
      first_seen: new Date(Date.now() - 3600000 * 100).toISOString(),
      last_seen: new Date(Date.now() - 30000).toISOString()
    },
    {
      from_machine: '72.62.241.39',
      to_ip: '8.8.8.8',
      protocol: 'DNS',
      port: '53',
      count: 480,
      blocked: 0,
      severity: 'info',
      description: 'Recursive DNS lookups to Google Public DNS',
      first_seen: new Date(Date.now() - 3600000 * 120).toISOString(),
      last_seen: new Date(Date.now() - 10000).toISOString()
    },
    {
      from_machine: 'HR-DESK-02',
      to_ip: '104.244.42.1',
      protocol: 'HTTPS',
      port: '443',
      count: 45,
      blocked: 0,
      severity: 'info',
      description: 'Web browsing traffic',
      first_seen: new Date(Date.now() - 3600000 * 14).toISOString(),
      last_seen: new Date(Date.now() - 400000).toISOString()
    },
    {
      from_machine: 'CEO-LAPTOP-01',
      to_ip: '17.253.144.10',
      protocol: 'HTTPS',
      port: '443',
      count: 88,
      blocked: 0,
      severity: 'info',
      description: 'Apple iCloud push notification sync',
      first_seen: new Date(Date.now() - 3600000 * 20).toISOString(),
      last_seen: new Date(Date.now() - 120000).toISOString()
    }
  ];

  return { machines, ad_attacks, lateral, inbound, outbound };
}
