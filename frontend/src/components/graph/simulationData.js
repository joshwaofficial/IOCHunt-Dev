/**
 * In-Memory Cybersecurity Network & AD Simulation Generator
 * Generates 100 interconnected nodes across all project entity types:
 * - Domain Controllers / Root CAs (dc)
 * - Administrative & Security Groups (group)
 * - Organizational Units (ou)
 * - Production Servers & Databases (server)
 * - Workstations & Laptops (machine)
 * - User Accounts & Identities (user)
 * - External Threat Actors (actor)
 * - External WAN IPs (ip_external)
 * - Private Subnet Gateways (ip_private)
 *
 * Connected by realistic Inbound, Outbound, Lateral Movement, and AD Attack edges.
 */

export function generateSimulationData() {
  const machines = [
    // 1. Domain Controllers & High-Value CAs (4)
    { name: 'DC01.DEFSEC.CORP', ip: '10.0.1.10', entityType: 'dc', is_dc: true, os: 'Windows Server 2022 Datacenter' },
    { name: 'DC02-BACKUP.DEFSEC.CORP', ip: '10.0.1.11', entityType: 'dc', is_dc: true, os: 'Windows Server 2022' },
    { name: 'ROOTCA-01.DEFSEC.CORP', ip: '10.0.1.15', entityType: 'dc', is_dc: true, os: 'Windows Server 2019' },
    { name: 'KRBTGT@DEFSEC.CORP', ip: '10.0.1.10', entityType: 'dc', is_dc: true, os: 'Active Directory KDC' },

    // 2. Administrative & Security Groups (10)
    { name: 'DOMAIN ADMINS@DEFSEC.CORP', entityType: 'group', raw: { memberCount: 3, admincount: 1 } },
    { name: 'ENTERPRISE ADMINS@DEFSEC.CORP', entityType: 'group', raw: { memberCount: 2, admincount: 1 } },
    { name: 'SCHEMA ADMINS@DEFSEC.CORP', entityType: 'group', raw: { memberCount: 2, admincount: 1 } },
    { name: 'SERVER OPERATORS@DEFSEC.CORP', entityType: 'group', raw: { memberCount: 5, admincount: 1 } },
    { name: 'TIER 1 ADMINS@DEFSEC.CORP', entityType: 'group', raw: { memberCount: 6, admincount: 1 } },
    { name: 'HELP DESK OPERATORS@DEFSEC.CORP', entityType: 'group', raw: { memberCount: 8, admincount: 0 } },
    { name: 'FINANCE AUDITORS@DEFSEC.CORP', entityType: 'group', raw: { memberCount: 7, admincount: 0 } },
    { name: 'DEVELOPERS GROUP@DEFSEC.CORP', entityType: 'group', raw: { memberCount: 14, admincount: 0 } },
    { name: 'REMOTE DESKTOP USERS@DEFSEC.CORP', entityType: 'group', raw: { memberCount: 18, admincount: 0 } },
    { name: 'AUTHENTICATED USERS@DEFSEC.CORP', entityType: 'group', raw: { memberCount: 42, admincount: 0 } },

    // 3. Organizational Units (4)
    { name: 'OU=Domain Controllers,DC=defsec,DC=corp', entityType: 'ou' },
    { name: 'OU=Tier 0 High Value,DC=defsec,DC=corp', entityType: 'ou' },
    { name: 'OU=Tier 1 Infrastructure,DC=defsec,DC=corp', entityType: 'ou' },
    { name: 'OU=Corporate Workstations,DC=defsec,DC=corp', entityType: 'ou' },

    // 4. Production Servers & Databases (16)
    { name: 'SQL-PROD-CLUSTER', ip: '10.0.2.20', entityType: 'server', os: 'MS SQL Server 2022' },
    { name: 'SQL-REPLICA-01', ip: '10.0.2.21', entityType: 'server', os: 'MS SQL Server 2022' },
    { name: 'WEB-NGINX-FRONTEND-01', ip: '10.0.2.30', entityType: 'server', os: 'Ubuntu 24.04 LTS' },
    { name: 'WEB-NGINX-FRONTEND-02', ip: '10.0.2.31', entityType: 'server', os: 'Ubuntu 24.04 LTS' },
    { name: 'API-GATEWAY-PROD', ip: '10.0.2.35', entityType: 'server', os: 'Debian 12 / Kong' },
    { name: 'K8S-CONTROL-PLANE-01', ip: '10.0.2.40', entityType: 'server', os: 'Linux Kubernetes 1.28' },
    { name: 'K8S-WORKER-NODE-01', ip: '10.0.2.41', entityType: 'server', os: 'Linux Kubernetes 1.28' },
    { name: 'K8S-WORKER-NODE-02', ip: '10.0.2.42', entityType: 'server', os: 'Linux Kubernetes 1.28' },
    { name: 'EXCHANGE-MAIL-01', ip: '10.0.2.50', entityType: 'server', os: 'Exchange Server 2019' },
    { name: 'FILESERVER-DFS-01', ip: '10.0.2.60', entityType: 'server', os: 'Windows Server 2022' },
    { name: 'BACKUP-VEEAM-SRV', ip: '10.0.2.70', entityType: 'server', os: 'Windows Server 2019' },
    { name: 'SIEM-LOG-COLLECTOR', ip: '10.0.2.80', entityType: 'server', os: 'Ubuntu Linux 22.04' },
    { name: 'GITLAB-INTERNAL-SRV', ip: '10.0.2.90', entityType: 'server', os: 'Debian 12' },
    { name: 'RADIUS-VPN-AUTH-01', ip: '10.0.2.100', entityType: 'server', os: 'FreeRADIUS / Linux' },
    { name: 'DNS-INTERNAL-RESOLVER', ip: '10.0.2.110', entityType: 'server', os: 'Bind9 / Linux' },
    { name: 'PROXY-SQUID-EGRESS', ip: '10.0.2.120', entityType: 'server', os: 'Squid Proxy' },

    // 5. Workstations & Laptops (25)
    { name: 'WS-JOSHWA-DEV', ip: '10.0.4.10', entityType: 'machine', os: 'macOS Sonoma' },
    { name: 'WS-GIRI-SEC', ip: '10.0.4.11', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-LOQ-RESEARCH', ip: '10.0.4.12', entityType: 'machine', os: 'Kali Linux 2024' },
    { name: 'WS-GEORSHAN-QA', ip: '10.0.4.13', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-ADMIN-MGMT', ip: '10.0.4.14', entityType: 'machine', os: 'Windows 11 Enterprise' },
    { name: 'WS-FINANCE-01', ip: '10.0.4.21', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-FINANCE-02', ip: '10.0.4.22', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-FINANCE-03', ip: '10.0.4.23', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-FINANCE-04', ip: '10.0.4.24', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-FINANCE-05', ip: '10.0.4.25', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-SALES-01', ip: '10.0.4.31', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-SALES-02', ip: '10.0.4.32', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-SALES-03', ip: '10.0.4.33', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-SALES-04', ip: '10.0.4.34', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-ENG-01', ip: '10.0.4.41', entityType: 'machine', os: 'Ubuntu Desktop 24.04' },
    { name: 'WS-ENG-02', ip: '10.0.4.42', entityType: 'machine', os: 'Ubuntu Desktop 24.04' },
    { name: 'WS-ENG-03', ip: '10.0.4.43', entityType: 'machine', os: 'Ubuntu Desktop 24.04' },
    { name: 'WS-ENG-04', ip: '10.0.4.44', entityType: 'machine', os: 'Ubuntu Desktop 24.04' },
    { name: 'WS-ENG-05', ip: '10.0.4.45', entityType: 'machine', os: 'Ubuntu Desktop 24.04' },
    { name: 'WS-ENG-06', ip: '10.0.4.46', entityType: 'machine', os: 'macOS Sonoma' },
    { name: 'WS-HR-01', ip: '10.0.4.51', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-HR-02', ip: '10.0.4.52', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-EXEC-CEO', ip: '10.0.4.61', entityType: 'machine', os: 'macOS Sequoia' },
    { name: 'WS-EXEC-CFO', ip: '10.0.4.62', entityType: 'machine', os: 'Windows 11 Enterprise' },
    { name: 'WS-RECEPTION-01', ip: '10.0.4.70', entityType: 'machine', os: 'Windows 10 IoT' },

    // 6. User Identities & Service Accounts (22)
    { name: 'admin.joshwa@defsec.corp', entityType: 'user', raw: { admincount: 1, title: 'Lead Enterprise Architect' } },
    { name: 'sec_analyst_giri@defsec.corp', entityType: 'user', raw: { admincount: 1, title: 'Senior Security Analyst' } },
    { name: 'researcher_loq@defsec.corp', entityType: 'user', raw: { admincount: 0, title: 'Security Researcher' } },
    { name: 'qa_georshan@defsec.corp', entityType: 'user', raw: { admincount: 0, title: 'QA Engineer' } },
    { name: 'svc_backup_agent@defsec.corp', entityType: 'user', raw: { admincount: 1, title: 'Veeam Service Account' } },
    { name: 'svc_sql_runner@defsec.corp', entityType: 'user', raw: { admincount: 1, title: 'SQL Server Account' } },
    { name: 'svc_nginx_deploy@defsec.corp', entityType: 'user', raw: { admincount: 0, title: 'CI/CD Deployer' } },
    { name: 'svc_gitlab_runner@defsec.corp', entityType: 'user', raw: { admincount: 0, title: 'GitLab Runner Agent' } },
    { name: 'finance_lead@defsec.corp', entityType: 'user', raw: { admincount: 0, title: 'Finance Director' } },
    { name: 'finance_auditor1@defsec.corp', entityType: 'user', raw: { admincount: 0, title: 'Internal Auditor' } },
    { name: 'dev_lead@defsec.corp', entityType: 'user', raw: { admincount: 0, title: 'Staff Software Engineer' } },
    { name: 'dev_frontend@defsec.corp', entityType: 'user', raw: { admincount: 0, title: 'UI/UX Developer' } },
    { name: 'dev_backend@defsec.corp', entityType: 'user', raw: { admincount: 0, title: 'Core Backend Engineer' } },
    { name: 'sales_director@defsec.corp', entityType: 'user', raw: { admincount: 0, title: 'Sales VP' } },
    { name: 'hr_manager@defsec.corp', entityType: 'user', raw: { admincount: 0, title: 'HR Director' } },
    { name: 'ceo_executive@defsec.corp', entityType: 'user', raw: { admincount: 0, title: 'Chief Executive Officer' } },
    { name: 'cfo_executive@defsec.corp', entityType: 'user', raw: { admincount: 0, title: 'Chief Financial Officer' } },
    { name: 'ciso_security@defsec.corp', entityType: 'user', raw: { admincount: 1, title: 'Chief Information Security Officer' } },
    { name: 'helpdesk_operator1@defsec.corp', entityType: 'user', raw: { admincount: 0, title: 'IT Support Specialist' } },
    { name: 'helpdesk_operator2@defsec.corp', entityType: 'user', raw: { admincount: 0, title: 'IT Support Technician' } },
    { name: 'intern_developer@defsec.corp', entityType: 'user', raw: { admincount: 0, title: 'Software Engineering Intern' } },
    { name: 'guest_vendor_access@defsec.corp', entityType: 'user', raw: { admincount: 0, title: 'Contractor Account' } },

    // 7. Threat Actors & Adversaries (5)
    { name: 'APT29_CozyBear_Actor', entityType: 'actor', raw: { threatLevel: 'State-Sponsored', origin: 'External' } },
    { name: 'FIN7_Threat_Actor', entityType: 'actor', raw: { threatLevel: 'Organized Cybercrime', origin: 'External' } },
    { name: 'Adversary_Scanner_01', entityType: 'actor', raw: { threatLevel: 'Automated Recon', origin: 'External' } },
    { name: 'CobaltStrike_Agent', entityType: 'actor', raw: { threatLevel: 'Post-Exploitation C2', origin: 'In-Memory' } },
    { name: 'Compromised_Guest_Entity', entityType: 'actor', raw: { threatLevel: 'Lateral Hijacker', origin: 'Internal' } },

    // 8. External WAN IPs (8)
    { name: '185.220.101.5', entityType: 'ip_external', raw: { geo: 'Tor Exit Node / Frankfurt', ip: '185.220.101.5' } },
    { name: '45.33.32.156', entityType: 'ip_external', raw: { geo: 'Linode VPS / Dallas', ip: '45.33.32.156' } },
    { name: '198.51.100.42', entityType: 'ip_external', raw: { geo: 'Suspicious C2 Server', ip: '198.51.100.42' } },
    { name: '187.124.149.140', entityType: 'ip_external', raw: { geo: 'Bruteforce Scanner / Sao Paulo', ip: '187.124.149.140' } },
    { name: '203.0.113.19', entityType: 'ip_external', raw: { geo: 'External Reconnaissance IP', ip: '203.0.113.19' } },
    { name: '104.244.42.1', entityType: 'ip_external', raw: { geo: 'External Proxy Endpoint', ip: '104.244.42.1' } },
    { name: '52.95.120.34', entityType: 'ip_external', raw: { geo: 'AWS S3 Cloud Storage', ip: '52.95.120.34' } },
    { name: '13.107.4.52', entityType: 'ip_external', raw: { geo: 'Microsoft 365 Cloud Endpoint', ip: '13.107.4.52' } },

    // 9. Private Subnet Gateways & VLANs (6)
    { name: '10.90.122.129', entityType: 'ip_private', raw: { desc: 'DMZ Ingress Gateway', ip: '10.90.122.129' } },
    { name: '10.0.1.1', entityType: 'ip_private', raw: { desc: 'Core Domain Controller VLAN Gateway', ip: '10.0.1.1' } },
    { name: '10.0.2.1', entityType: 'ip_private', raw: { desc: 'Server Farm VLAN Gateway', ip: '10.0.2.1' } },
    { name: '10.0.4.1', entityType: 'ip_private', raw: { desc: 'Corporate Endpoints VLAN Gateway', ip: '10.0.4.1' } },
    { name: '192.168.100.254', entityType: 'ip_private', raw: { desc: 'Isolated OT/SCADA Gateway', ip: '192.168.100.254' } },
    { name: '172.16.50.1', entityType: 'ip_private', raw: { desc: 'Branch Office VPN Concentrator', ip: '172.16.50.1' } }
  ];

  // Inbound Connections (External WAN -> Web / Gateways / Monitored Hosts)
  const inbound = [
    { from_ip: '185.220.101.5', to_machine: 'WEB-NGINX-FRONTEND-01', protocol: 'HTTPS', port: '443', count: 182, blocked: 0, severity: 'warning', description: 'High volume HTTPS probe from Tor exit node' },
    { from_ip: '185.220.101.5', to_machine: 'API-GATEWAY-PROD', protocol: 'HTTPS', port: '443', count: 74, blocked: 0, severity: 'warning', description: 'API endpoint enumeration' },
    { from_ip: '45.33.32.156', to_machine: 'RADIUS-VPN-AUTH-01', protocol: 'RADIUS', port: '1812', count: 340, blocked: 340, severity: 'critical', description: 'Bruteforce password spray blocked by firewall' },
    { from_ip: '187.124.149.140', to_machine: 'WS-GIRI-SEC', protocol: 'SSH', port: '22', count: 29, blocked: 0, severity: 'critical', description: 'Anomalous external SSH connection to workstation' },
    { from_ip: '187.124.149.140', to_machine: 'WEB-NGINX-FRONTEND-02', protocol: 'HTTP', port: '80', count: 520, blocked: 520, severity: 'warning', description: 'Automated vulnerability scanner blocked' },
    { from_ip: '198.51.100.42', to_machine: 'WS-ENG-01', protocol: 'WinRM-S', port: '5986', count: 15, blocked: 0, severity: 'critical', description: 'Inbound remote management session from known C2' },
    { from_ip: '203.0.113.19', to_machine: '10.90.122.129', protocol: 'HTTPS', port: '443', count: 88, blocked: 0, severity: 'info', description: 'Inbound DMZ gateway reverse proxy traffic' },
    { from_ip: '104.244.42.1', to_machine: 'API-GATEWAY-PROD', protocol: 'HTTPS', port: '443', count: 64, blocked: 0, severity: 'info', description: 'External mobile client API traffic' },
    { from_ip: '185.220.101.5', to_machine: 'EXCHANGE-MAIL-01', protocol: 'HTTPS', port: '443', count: 95, blocked: 0, severity: 'warning', description: 'OWA login attempts' },
    { from_ip: '45.33.32.156', to_machine: 'WS-RECEPTION-01', protocol: 'RDP', port: '3389', count: 42, blocked: 42, severity: 'critical', description: 'External RDP bruteforce blocked' }
  ];

  // Outbound Connections (Internal Hosts -> External WAN IPs)
  const outbound = [
    { from_machine: 'WS-ENG-01', to_ip: '198.51.100.42', protocol: 'HTTPS', port: '443', count: 412, blocked: 0, severity: 'critical', description: 'Beaconing C2 traffic detected on port 443' },
    { from_machine: 'WS-FINANCE-01', to_ip: '52.95.120.34', protocol: 'HTTPS', port: '443', count: 85, blocked: 0, severity: 'info', description: 'Authorized AWS financial reporting sync' },
    { from_machine: 'PROXY-SQUID-EGRESS', to_ip: '13.107.4.52', protocol: 'HTTPS', port: '443', count: 1420, blocked: 0, severity: 'info', description: 'Enterprise Microsoft 365 Cloud communications' },
    { from_machine: 'WS-LOQ-RESEARCH', to_ip: '104.244.42.1', protocol: 'SSH', port: '22', count: 32, blocked: 0, severity: 'info', description: 'Outbound security research telemetry' },
    { from_machine: 'DNS-INTERNAL-RESOLVER', to_ip: '52.95.120.34', protocol: 'DNS', port: '53', count: 980, blocked: 0, severity: 'info', description: 'Internal DNS resolution forwarders' },
    { from_machine: 'WS-SALES-01', to_ip: '13.107.4.52', protocol: 'HTTPS', port: '443', count: 210, blocked: 0, severity: 'info', description: 'SharePoint online document access' },
    { from_machine: 'WS-HR-01', to_ip: '52.95.120.34', protocol: 'HTTPS', port: '443', count: 65, blocked: 0, severity: 'info', description: 'Workday cloud sync' },
    { from_machine: 'GITLAB-INTERNAL-SRV', to_ip: '52.95.120.34', protocol: 'HTTPS', port: '443', count: 145, blocked: 0, severity: 'info', description: 'Remote cloud backup artifact upload' }
  ];

  // Lateral Movement & Active Directory Relationships
  const lateral = [
    // AD Group Memberships (MemberOf)
    { source: 'admin.joshwa@defsec.corp', target: 'DOMAIN ADMINS@DEFSEC.CORP', protocol: 'MemberOf', count: 1, severity: 'info', description: 'Domain Admins high privilege membership' },
    { source: 'sec_analyst_giri@defsec.corp', target: 'TIER 1 ADMINS@DEFSEC.CORP', protocol: 'MemberOf', count: 1, severity: 'info', description: 'Tier 1 Infrastructure management' },
    { source: 'DOMAIN ADMINS@DEFSEC.CORP', target: 'ENTERPRISE ADMINS@DEFSEC.CORP', protocol: 'MemberOf', count: 1, severity: 'critical', description: 'Nested privilege escalation path' },
    { source: 'ENTERPRISE ADMINS@DEFSEC.CORP', target: 'SCHEMA ADMINS@DEFSEC.CORP', protocol: 'MemberOf', count: 1, severity: 'critical', description: 'Forest-wide full schema modification control' },
    { source: 'svc_backup_agent@defsec.corp', target: 'SERVER OPERATORS@DEFSEC.CORP', protocol: 'MemberOf', count: 1, severity: 'warning', description: 'Backup agent elevated privileges' },
    { source: 'helpdesk_operator1@defsec.corp', target: 'HELP DESK OPERATORS@DEFSEC.CORP', protocol: 'MemberOf', count: 1, severity: 'info', description: 'Help Desk team membership' },
    { source: 'helpdesk_operator2@defsec.corp', target: 'HELP DESK OPERATORS@DEFSEC.CORP', protocol: 'MemberOf', count: 1, severity: 'info', description: 'Help Desk team membership' },
    { source: 'finance_lead@defsec.corp', target: 'FINANCE AUDITORS@DEFSEC.CORP', protocol: 'MemberOf', count: 1, severity: 'info', description: 'Corporate finance group' },
    { source: 'finance_auditor1@defsec.corp', target: 'FINANCE AUDITORS@DEFSEC.CORP', protocol: 'MemberOf', count: 1, severity: 'info', description: 'Corporate finance group' },
    { source: 'dev_lead@defsec.corp', target: 'DEVELOPERS GROUP@DEFSEC.CORP', protocol: 'MemberOf', count: 1, severity: 'info', description: 'Engineering team' },
    { source: 'dev_frontend@defsec.corp', target: 'DEVELOPERS GROUP@DEFSEC.CORP', protocol: 'MemberOf', count: 1, severity: 'info', description: 'Engineering team' },
    { source: 'dev_backend@defsec.corp', target: 'DEVELOPERS GROUP@DEFSEC.CORP', protocol: 'MemberOf', count: 1, severity: 'info', description: 'Engineering team' },
    { source: 'intern_developer@defsec.corp', target: 'DEVELOPERS GROUP@DEFSEC.CORP', protocol: 'MemberOf', count: 1, severity: 'info', description: 'Engineering intern' },
    { source: 'guest_vendor_access@defsec.corp', target: 'REMOTE DESKTOP USERS@DEFSEC.CORP', protocol: 'MemberOf', count: 1, severity: 'warning', description: 'Third party contractor remote desktop rights' },

    // OU Containment (ContainedIn)
    { source: 'DC01.DEFSEC.CORP', target: 'OU=Domain Controllers,DC=defsec,DC=corp', protocol: 'ContainedIn', count: 1, severity: 'info' },
    { source: 'DC02-BACKUP.DEFSEC.CORP', target: 'OU=Domain Controllers,DC=defsec,DC=corp', protocol: 'ContainedIn', count: 1, severity: 'info' },
    { source: 'ROOTCA-01.DEFSEC.CORP', target: 'OU=Tier 0 High Value,DC=defsec,DC=corp', protocol: 'ContainedIn', count: 1, severity: 'info' },
    { source: 'SQL-PROD-CLUSTER', target: 'OU=Tier 1 Infrastructure,DC=defsec,DC=corp', protocol: 'ContainedIn', count: 1, severity: 'info' },
    { source: 'EXCHANGE-MAIL-01', target: 'OU=Tier 1 Infrastructure,DC=defsec,DC=corp', protocol: 'ContainedIn', count: 1, severity: 'info' },
    { source: 'WS-JOSHWA-DEV', target: 'OU=Corporate Workstations,DC=defsec,DC=corp', protocol: 'ContainedIn', count: 1, severity: 'info' },
    { source: 'WS-GIRI-SEC', target: 'OU=Corporate Workstations,DC=defsec,DC=corp', protocol: 'ContainedIn', count: 1, severity: 'info' },
    { source: 'WS-LOQ-RESEARCH', target: 'OU=Corporate Workstations,DC=defsec,DC=corp', protocol: 'ContainedIn', count: 1, severity: 'info' },
    { source: 'WS-GEORSHAN-QA', target: 'OU=Corporate Workstations,DC=defsec,DC=corp', protocol: 'ContainedIn', count: 1, severity: 'info' },

    // Internal Sessions & Admin Rights (AdminTo / HasSession)
    { source: 'DOMAIN ADMINS@DEFSEC.CORP', target: 'DC01.DEFSEC.CORP', protocol: 'AdminTo', count: 8, severity: 'critical', description: 'Direct domain administrative authority' },
    { source: 'DOMAIN ADMINS@DEFSEC.CORP', target: 'DC02-BACKUP.DEFSEC.CORP', protocol: 'AdminTo', count: 6, severity: 'critical', description: 'Direct domain administrative authority' },
    { source: 'TIER 1 ADMINS@DEFSEC.CORP', target: 'WS-ADMIN-MGMT', protocol: 'AdminTo', count: 12, severity: 'warning', description: 'Local administrator rights over management jumpbox' },
    { source: 'TIER 1 ADMINS@DEFSEC.CORP', target: 'SQL-PROD-CLUSTER', protocol: 'AdminTo', count: 4, severity: 'warning', description: 'Database cluster admin rights' },
    { source: 'admin.joshwa@defsec.corp', target: 'WS-JOSHWA-DEV', protocol: 'HasSession', count: 5, severity: 'info', description: 'Active interactive user logon session' },
    { source: 'sec_analyst_giri@defsec.corp', target: 'WS-GIRI-SEC', protocol: 'HasSession', count: 4, severity: 'info', description: 'Active logon session' },
    { source: 'researcher_loq@defsec.corp', target: 'WS-LOQ-RESEARCH', protocol: 'HasSession', count: 3, severity: 'info', description: 'Active logon session' },
    { source: 'qa_georshan@defsec.corp', target: 'WS-GEORSHAN-QA', protocol: 'HasSession', count: 3, severity: 'info', description: 'Active logon session' },

    // Internal Network Protocols (SMB, RPC, SSH, WinRM, K8s, DB)
    { source: 'WS-JOSHWA-DEV', target: 'SQL-PROD-CLUSTER', protocol: 'SMB', port: '445', count: 124, severity: 'info', description: 'Internal database share access' },
    { source: 'WS-GIRI-SEC', target: 'SIEM-LOG-COLLECTOR', protocol: 'SSH', port: '22', count: 88, severity: 'info', description: 'Secure SIEM administrator console' },
    { source: 'WS-LOQ-RESEARCH', target: 'K8S-CONTROL-PLANE-01', protocol: 'HTTPS', port: '6443', count: 165, severity: 'info', description: 'Kubernetes kubectl cluster API' },
    { source: 'K8S-CONTROL-PLANE-01', target: 'K8S-WORKER-NODE-01', protocol: 'RPC', port: '10250', count: 430, severity: 'info', description: 'Kubelet node heartbeat and pod scheduling' },
    { source: 'K8S-CONTROL-PLANE-01', target: 'K8S-WORKER-NODE-02', protocol: 'RPC', port: '10250', count: 410, severity: 'info', description: 'Kubelet node heartbeat and pod scheduling' },
    { source: 'SQL-PROD-CLUSTER', target: 'SQL-REPLICA-01', protocol: 'TDS', port: '1433', count: 920, severity: 'info', description: 'AlwaysOn high-availability replica sync' },
    { source: 'WEB-NGINX-FRONTEND-01', target: 'API-GATEWAY-PROD', protocol: 'HTTP', port: '8000', count: 650, severity: 'info', description: 'Microservices reverse proxy upstream' },
    { source: 'WEB-NGINX-FRONTEND-02', target: 'API-GATEWAY-PROD', protocol: 'HTTP', port: '8000', count: 610, severity: 'info', description: 'Microservices reverse proxy upstream' },
    { source: 'API-GATEWAY-PROD', target: 'SQL-PROD-CLUSTER', protocol: 'TDS', port: '1433', count: 780, severity: 'info', description: 'Transactional database queries' },
    { source: 'BACKUP-VEEAM-SRV', target: 'FILESERVER-DFS-01', protocol: 'SMB', port: '445', count: 540, severity: 'info', description: 'Scheduled nightly corporate fileshare backup' },
    { source: 'WS-FINANCE-01', target: 'FILESERVER-DFS-01', protocol: 'SMB', port: '445', count: 48, severity: 'info', description: 'Shared financial department drive' },
    { source: 'WS-FINANCE-02', target: 'FILESERVER-DFS-01', protocol: 'SMB', port: '445', count: 36, severity: 'info', description: 'Shared financial department drive' },
    { source: 'WS-SALES-01', target: 'FILESERVER-DFS-01', protocol: 'SMB', port: '445', count: 22, severity: 'info', description: 'Sales proposals share' },
    { source: 'WS-ENG-01', target: 'GITLAB-INTERNAL-SRV', protocol: 'SSH', port: '22', count: 94, severity: 'info', description: 'Git push/pull code commit activity' },
    { source: 'WS-ENG-02', target: 'GITLAB-INTERNAL-SRV', protocol: 'SSH', port: '22', count: 82, severity: 'info', description: 'Git push/pull code commit activity' },
    { source: 'WS-EXEC-CEO', target: 'EXCHANGE-MAIL-01', protocol: 'HTTPS', port: '443', count: 110, severity: 'info', description: 'Executive Outlook sync' },
    { source: 'WS-EXEC-CFO', target: 'EXCHANGE-MAIL-01', protocol: 'HTTPS', port: '443', count: 95, severity: 'info', description: 'Executive Outlook sync' },
    { source: '10.90.122.129', target: 'WEB-NGINX-FRONTEND-01', protocol: 'TCP', port: '443', count: 840, severity: 'info', description: 'DMZ Core Router to Web Tier' },
    { source: '10.0.1.1', target: 'DC01.DEFSEC.CORP', protocol: 'TCP', port: '389', count: 1200, severity: 'info', description: 'VLAN Gateway to Domain Controller' },
    { source: '10.0.2.1', target: 'SQL-PROD-CLUSTER', protocol: 'TCP', port: '1433', count: 1100, severity: 'info', description: 'Server VLAN Routing' },
    { source: '10.0.4.1', target: 'WS-JOSHWA-DEV', protocol: 'TCP', port: '445', count: 450, severity: 'info', description: 'Workstation VLAN Routing' },
    { source: '192.168.100.254', target: 'SIEM-LOG-COLLECTOR', protocol: 'Syslog', port: '514', count: 320, severity: 'info', description: 'Isolated OT telemetry collection' },
    { source: '172.16.50.1', target: 'RADIUS-VPN-AUTH-01', protocol: 'IPsec', port: '500', count: 680, severity: 'info', description: 'Branch Office Site-to-Site VPN Tunnel' },
    { source: 'WS-ADMIN-MGMT', target: 'DC01.DEFSEC.CORP', protocol: 'WinRM-S', port: '5986', count: 44, severity: 'warning', description: 'Privileged jumpbox to DC remote PowerShell' }
  ];

  // Active Directory Attacks & Exploit Paths
  const adAttacks = [
    { actor: 'APT29_CozyBear_Actor', target_machine: 'WS-ENG-01', attack_type: 'PasswordSpray', count: 65, severity: 'critical', description: 'APT29 initial access password spray against developer endpoint' },
    { actor: 'admin.joshwa@defsec.corp', target_machine: 'DC01.DEFSEC.CORP', attack_type: 'DCSync', count: 14, severity: 'critical', description: 'Replication of domain credential hashes via DSGetNCChanges' },
    { actor: 'admin.joshwa@defsec.corp', target_machine: 'DC02-BACKUP.DEFSEC.CORP', attack_type: 'DCSync', count: 8, severity: 'critical', description: 'DCSync against backup domain controller' },
    { actor: 'CobaltStrike_Agent', target_machine: 'SQL-PROD-CLUSTER', attack_type: 'Kerberoasting', count: 28, severity: 'critical', description: 'Requesting SPN tickets for offline hash cracking' },
    { actor: 'CobaltStrike_Agent', target_machine: 'EXCHANGE-MAIL-01', attack_type: 'Kerberoasting', count: 19, severity: 'critical', description: 'Exchange Service SPN kerberoast attempt' },
    { actor: 'Compromised_Guest_Entity', target_machine: 'ROOTCA-01.DEFSEC.CORP', attack_type: 'ESC1', count: 12, severity: 'critical', description: 'ADCS certificate template exploitation for domain privilege escalation' },
    { actor: 'Compromised_Guest_Entity', target_machine: 'ROOTCA-01.DEFSEC.CORP', attack_type: 'CertipyEnum', count: 35, severity: 'warning', description: 'Automated certificate authority enumeration' },
    { actor: 'FIN7_Threat_Actor', target_machine: 'WS-FINANCE-01', attack_type: 'OverpassHash', count: 16, severity: 'critical', description: 'NTLM hash injected into Kerberos ticket cache' },
    { actor: 'FIN7_Threat_Actor', target_machine: 'WS-FINANCE-02', attack_type: 'PassTheHash', count: 22, severity: 'critical', description: 'Lateral movement via NTLM hash passing' },
    { actor: 'Adversary_Scanner_01', target_machine: 'DC02-BACKUP.DEFSEC.CORP', attack_type: 'ASREPRoast', count: 45, severity: 'warning', description: 'AS-REP roasting targeting accounts with Kerberos pre-auth disabled' },
    { actor: 'CobaltStrike_Agent', target_machine: 'WS-ADMIN-MGMT', attack_type: 'ExplicitCred', count: 9, severity: 'critical', description: 'Explicit credential usage to pivot to privileged jumpbox' },
    { actor: 'APT29_CozyBear_Actor', target_machine: 'DC01.DEFSEC.CORP', attack_type: 'ShadowCred', count: 6, severity: 'critical', description: 'Injection of KeyCredentialLink for persistent domain access' },
    { actor: 'CobaltStrike_Agent', target_machine: 'KRBTGT@DEFSEC.CORP', attack_type: 'ForgedPAC', count: 4, severity: 'critical', description: 'PAC forgery attempt against KRBTGT account' }
  ];

  return {
    machines,
    inbound,
    outbound,
    lateral,
    ad_attacks: adAttacks
  };
}
