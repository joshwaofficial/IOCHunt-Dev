/**
 * In-Memory Firewall Network Topology Simulation Generator
 * Generates 100 interconnected nodes across all firewall enterprise zones:
 * - External WAN IPs & Threat Actors (ip_external / actor)
 * - Edge Firewalls & DMZ Gateways (firewall / server)
 * - Internal Server Farm & Infrastructure (server / dc)
 * - Corporate Endpoints & Workstations (machine)
 * - Branch Office Subnets (ip_private)
 * - Industrial / OT Subnets (ip_private)
 *
 * Connected by realistic Inbound, Outbound, and Internal Lateral firewall connection flows
 * with authentic actions (Accept, Deny, Drop, Close, RST), ports, services, and hit counts.
 */

export function generateFirewallSimulationData() {
  const machines = [
    // 1. Edge Firewalls, Security Appliances & DMZ Gateways (8)
    { name: 'PA-5250-EDGE-FW-01', ip: '10.90.122.1', entityType: 'firewall', os: 'PAN-OS 11.1' },
    { name: 'PA-5250-EDGE-FW-02', ip: '10.90.122.2', entityType: 'firewall', os: 'PAN-OS 11.1' },
    { name: 'FTG-600E-BRANCH-FW', ip: '172.16.50.1', entityType: 'firewall', os: 'FortiOS 7.4' },
    { name: 'DMZ-INGRESS-GATEWAY', ip: '10.90.122.129', entityType: 'server', os: 'F5 BIG-IP LTM' },
    { name: 'WEB-NGINX-PROXY-01', ip: '10.90.122.30', entityType: 'server', os: 'Ubuntu Linux 24.04' },
    { name: 'WEB-NGINX-PROXY-02', ip: '10.90.122.31', entityType: 'server', os: 'Ubuntu Linux 24.04' },
    { name: 'MAIL-EXCHANGE-EDGE', ip: '10.90.122.50', entityType: 'server', os: 'Exchange Server Edge' },
    { name: 'VPN-CONCENTRATOR-01', ip: '10.90.122.100', entityType: 'server', os: 'Cisco AnyConnect ASA' },

    // 2. Core Domain Controllers & High-Value Infrastructure (4)
    { name: 'DC01-PRIMARY-KDC', ip: '10.0.1.10', entityType: 'dc', os: 'Windows Server 2022' },
    { name: 'DC02-REPLICA-KDC', ip: '10.0.1.11', entityType: 'dc', os: 'Windows Server 2022' },
    { name: 'ROOTCA-ENTERPRISE', ip: '10.0.1.15', entityType: 'dc', os: 'Windows Server 2019 PKI' },
    { name: 'RADIUS-MFA-SERVER', ip: '10.0.1.20', entityType: 'server', os: 'FreeRADIUS / Linux' },

    // 3. Internal Application Servers, Databases & Storage (18)
    { name: 'SQL-PROD-PRIMARY', ip: '10.0.2.20', entityType: 'server', os: 'MS SQL Server 2022' },
    { name: 'SQL-PROD-REPLICA', ip: '10.0.2.21', entityType: 'server', os: 'MS SQL Server 2022' },
    { name: 'API-BACKEND-SRV-01', ip: '10.0.2.35', entityType: 'server', os: 'Debian 12 / Node.js' },
    { name: 'API-BACKEND-SRV-02', ip: '10.0.2.36', entityType: 'server', os: 'Debian 12 / Node.js' },
    { name: 'K8S-MASTER-CLUSTER', ip: '10.0.2.40', entityType: 'server', os: 'Kubernetes v1.29' },
    { name: 'K8S-WORKER-NODE-A', ip: '10.0.2.41', entityType: 'server', os: 'Ubuntu 24.04 LTS' },
    { name: 'K8S-WORKER-NODE-B', ip: '10.0.2.42', entityType: 'server', os: 'Ubuntu 24.04 LTS' },
    { name: 'FILESERVER-SMB-01', ip: '10.0.2.60', entityType: 'server', os: 'Windows Server 2022' },
    { name: 'FILESERVER-SMB-02', ip: '10.0.2.61', entityType: 'server', os: 'Windows Server 2022' },
    { name: 'BACKUP-VEEAM-STORAGE', ip: '10.0.2.70', entityType: 'server', os: 'Windows Server 2019' },
    { name: 'SIEM-LOG-AGGREGATOR', ip: '10.0.2.80', entityType: 'server', os: 'Enterprise SIEM' },
    { name: 'GITLAB-CODE-SRV', ip: '10.0.2.90', entityType: 'server', os: 'Debian 12' },
    { name: 'DNS-RESOLVER-INTERNAL', ip: '10.0.2.110', entityType: 'server', os: 'BIND 9.18' },
    { name: 'PROMETHEUS-METRICS', ip: '10.0.2.115', entityType: 'server', os: 'Prometheus Server' },
    { name: 'PROXY-SQUID-EGRESS', ip: '10.0.2.120', entityType: 'server', os: 'Squid Proxy 6.0' },
    { name: 'VAULT-CREDENTIALS', ip: '10.0.2.130', entityType: 'server', os: 'HashiCorp Vault' },
    { name: 'JUMPBOX-BASTION-01', ip: '10.0.2.150', entityType: 'server', os: 'Hardened Alpine Linux' },
    { name: 'DHCP-IPAM-SERVER', ip: '10.0.2.160', entityType: 'server', os: 'ISC DHCP Server' },

    // 4. Corporate Workstations & Endpoints (25)
    { name: 'WS-JOSHWA-DEV', ip: '10.0.4.10', entityType: 'machine', os: 'macOS Sonoma' },
    { name: 'WS-GIRI-SEC-OPS', ip: '10.0.4.11', entityType: 'machine', os: 'Windows 11 Enterprise' },
    { name: 'WS-LOQ-RESEARCH', ip: '10.0.4.12', entityType: 'machine', os: 'Kali Linux 2024.2' },
    { name: 'WS-GEORSHAN-QA', ip: '10.0.4.13', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-ADMIN-MGMT', ip: '10.0.4.14', entityType: 'machine', os: 'Windows 11 Enterprise' },
    { name: 'WS-FINANCE-SR-01', ip: '10.0.4.20', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-FINANCE-SR-02', ip: '10.0.4.21', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-FINANCE-AUDIT', ip: '10.0.4.22', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-SALES-LEAD-01', ip: '10.0.4.30', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-SALES-AGENT-02', ip: '10.0.4.31', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-SALES-AGENT-03', ip: '10.0.4.32', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-ENGINEER-FRONTEND', ip: '10.0.4.40', entityType: 'machine', os: 'macOS Sonoma' },
    { name: 'WS-ENGINEER-BACKEND', ip: '10.0.4.41', entityType: 'machine', os: 'Ubuntu Desktop 24.04' },
    { name: 'WS-ENGINEER-DEVOPS', ip: '10.0.4.42', entityType: 'machine', os: 'Ubuntu Desktop 24.04' },
    { name: 'WS-ENGINEER-CLOUD', ip: '10.0.4.43', entityType: 'machine', os: 'macOS Sonoma' },
    { name: 'WS-HR-DIRECTOR', ip: '10.0.4.50', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-HR-RECRUITER', ip: '10.0.4.51', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-EXEC-CEO-LAPTOP', ip: '10.0.4.60', entityType: 'machine', os: 'macOS Sequoia' },
    { name: 'WS-EXEC-CFO-LAPTOP', ip: '10.0.4.61', entityType: 'machine', os: 'Windows 11 Enterprise' },
    { name: 'WS-EXEC-CTO-LAPTOP', ip: '10.0.4.62', entityType: 'machine', os: 'macOS Sequoia' },
    { name: 'WS-LEGAL-COUNSEL', ip: '10.0.4.65', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'WS-RECEPTION-DESK', ip: '10.0.4.70', entityType: 'machine', os: 'Windows 10 IoT Enterprise' },
    { name: 'WS-KIOSK-LOBBY', ip: '10.0.4.71', entityType: 'machine', os: 'Windows 10 IoT' },
    { name: 'WS-SECURITY-NOC-01', ip: '10.0.4.80', entityType: 'machine', os: 'Windows 11 Enterprise' },
    { name: 'WS-SECURITY-NOC-02', ip: '10.0.4.81', entityType: 'machine', os: 'Windows 11 Enterprise' },

    // 5. Branch Office Endpoints & VPN Clients (15)
    { name: 'BRANCH-SRV-DFS', ip: '172.16.50.10', entityType: 'server', os: 'Windows Server 2022' },
    { name: 'BRANCH-DNS-CACHE', ip: '172.16.50.11', entityType: 'server', os: 'Debian 12' },
    { name: 'BRANCH-PRINT-SRV', ip: '172.16.50.12', entityType: 'server', os: 'Ubuntu Server' },
    { name: 'BRANCH-POS-TERM-01', ip: '172.16.50.20', entityType: 'machine', os: 'Windows Embedded POS' },
    { name: 'BRANCH-POS-TERM-02', ip: '172.16.50.21', entityType: 'machine', os: 'Windows Embedded POS' },
    { name: 'BRANCH-POS-TERM-03', ip: '172.16.50.22', entityType: 'machine', os: 'Windows Embedded POS' },
    { name: 'BRANCH-WS-MGR', ip: '172.16.50.30', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'BRANCH-WS-STAFF1', ip: '172.16.50.31', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'BRANCH-WS-STAFF2', ip: '172.16.50.32', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'BRANCH-WS-STAFF3', ip: '172.16.50.33', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'VPN-REMOTE-DEV-01', ip: '172.16.100.15', entityType: 'machine', os: 'macOS Sonoma' },
    { name: 'VPN-REMOTE-DEV-02', ip: '172.16.100.16', entityType: 'machine', os: 'Ubuntu Desktop' },
    { name: 'VPN-REMOTE-SALES', ip: '172.16.100.25', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'VPN-REMOTE-FINANCE', ip: '172.16.100.35', entityType: 'machine', os: 'Windows 11 Pro' },
    { name: 'VPN-REMOTE-EXEC', ip: '172.16.100.45', entityType: 'machine', os: 'macOS Sequoia' },

    // 6. Industrial OT & SCADA Network Subnet (8)
    { name: 'OT-SCADA-GATEWAY', ip: '192.168.100.254', entityType: 'firewall', os: 'Siemens RuggedCom' },
    { name: 'PLC-LINE1-ASSEMBLY', ip: '192.168.100.10', entityType: 'server', os: 'Allen-Bradley PLC' },
    { name: 'PLC-LINE2-ROBOTICS', ip: '192.168.100.11', entityType: 'server', os: 'Siemens S7-1500' },
    { name: 'PLC-LINE3-PACKAGING', ip: '192.168.100.12', entityType: 'server', os: 'Schneider Modicon' },
    { name: 'SCADA-HMI-OPERATOR1', ip: '192.168.100.20', entityType: 'machine', os: 'Windows 10 LTSC' },
    { name: 'SCADA-HMI-OPERATOR2', ip: '192.168.100.21', entityType: 'machine', os: 'Windows 10 LTSC' },
    { name: 'HISTORIAN-PROD-DB', ip: '192.168.100.30', entityType: 'server', os: 'GE Digital Historian' },
    { name: 'OT-SAFETY-CONTROLLER', ip: '192.168.100.50', entityType: 'server', os: 'Triconex Safety PLC' },

    // 7. External Threat Actors & Internet WAN Endpoints (22)
    { name: '185.220.101.5', entityType: 'actor', os: 'Tor Exit Node / Germany' },
    { name: '45.33.32.156', entityType: 'actor', os: 'Linode Recon Scanner' },
    { name: '198.51.100.42', entityType: 'actor', os: 'Suspected CobaltStrike C2' },
    { name: '187.124.149.140', entityType: 'actor', os: 'Bruteforce Scanner / Brazil' },
    { name: '203.0.113.19', entityType: 'actor', os: 'Automated Port Scanner' },
    { name: '91.240.118.172', entityType: 'actor', os: 'Known Bulletproof VPS' },
    { name: '194.26.29.112', entityType: 'actor', os: 'Mirai Botnet Scanner' },
    { name: '104.244.42.1', entityType: 'ip_external', os: 'Twitter CDN Proxy' },
    { name: '8.8.8.8', entityType: 'ip_external', os: 'Google Public DNS' },
    { name: '1.1.1.1', entityType: 'ip_external', os: 'Cloudflare Anycast DNS' },
    { name: '52.95.120.34', entityType: 'ip_external', os: 'AWS S3 US-East-1' },
    { name: '13.107.4.52', entityType: 'ip_external', os: 'Microsoft 365 Cloud' },
    { name: '140.82.121.4', entityType: 'ip_external', os: 'GitHub Enterprise Cloud' },
    { name: '151.101.65.140', entityType: 'ip_external', os: 'Fastly Global CDN' },
    { name: '17.253.144.10', entityType: 'ip_external', os: 'Apple Push Notification' },
    { name: '162.159.130.233', entityType: 'ip_external', os: 'NTP Pool Public Server' },
    { name: '54.239.28.85', entityType: 'ip_external', os: 'Amazon CloudFront' },
    { name: '34.120.180.20', entityType: 'ip_external', os: 'Google Cloud Platform' },
    { name: '20.190.159.0', entityType: 'ip_external', os: 'Azure Entra ID Auth' },
    { name: '199.232.41.140', entityType: 'ip_external', os: 'Ubuntu Package Mirror' },
    { name: '195.201.201.32', entityType: 'actor', os: 'Hetzner Scanner IP' },
    { name: '45.142.214.22', entityType: 'actor', os: 'Shodan Reconnaissance Scanner' }
  ];

  // Inbound Connections (External WAN -> DMZ / Firewalls / Public Services)
  const inbound = [
    {
      from_ip: '185.220.101.5',
      to_machine: 'WEB-NGINX-PROXY-01',
      protocol: 'https',
      port: 443,
      action: 'accept',
      count: 420,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: https (185.220.101.5 → WEB-NGINX-PROXY-01:443)'
    },
    {
      from_ip: '185.220.101.5',
      to_machine: 'MAIL-EXCHANGE-EDGE',
      protocol: 'https',
      port: 443,
      action: 'accept',
      count: 95,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: https (185.220.101.5 → MAIL-EXCHANGE-EDGE:443)'
    },
    {
      from_ip: '45.33.32.156',
      to_machine: 'PA-5250-EDGE-FW-01',
      protocol: 'ssh',
      port: 22,
      action: 'deny',
      count: 850,
      blocked: 850,
      severity: 'critical',
      color: '#ef4444',
      description: 'Firewall DENY: ssh brute-force blocked on edge interface'
    },
    {
      from_ip: '45.33.32.156',
      to_machine: 'VPN-CONCENTRATOR-01',
      protocol: 'ipsec',
      port: 500,
      action: 'drop',
      count: 310,
      blocked: 310,
      severity: 'high',
      color: '#ef4444',
      description: 'Firewall DROP: invalid IKE handshake payload'
    },
    {
      from_ip: '187.124.149.140',
      to_machine: 'DMZ-INGRESS-GATEWAY',
      protocol: 'http',
      port: 80,
      action: 'deny',
      count: 620,
      blocked: 620,
      severity: 'high',
      color: '#ef4444',
      description: 'Firewall DENY: HTTP web crawler blocked by security rule'
    },
    {
      from_ip: '198.51.100.42',
      to_machine: 'PA-5250-EDGE-FW-02',
      protocol: 'rdp',
      port: 3389,
      action: 'drop',
      count: 140,
      blocked: 140,
      severity: 'critical',
      color: '#ef4444',
      description: 'Firewall DROP: unauthorized external RDP scan'
    },
    {
      from_ip: '203.0.113.19',
      to_machine: 'PA-5250-EDGE-FW-01',
      protocol: 'telnet',
      port: 23,
      action: 'drop',
      count: 75,
      blocked: 75,
      severity: 'high',
      color: '#ef4444',
      description: 'Firewall DROP: legacy cleartext port probe'
    },
    {
      from_ip: '91.240.118.172',
      to_machine: 'DMZ-INGRESS-GATEWAY',
      protocol: 'https',
      port: 443,
      action: 'deny',
      count: 230,
      blocked: 230,
      severity: 'high',
      color: '#ef4444',
      description: 'Firewall DENY: vulnerability exploit attempt on TLS'
    },
    {
      from_ip: '194.26.29.112',
      to_machine: 'PA-5250-EDGE-FW-01',
      protocol: 'snmp',
      port: 161,
      action: 'drop',
      count: 410,
      blocked: 410,
      severity: 'high',
      color: '#ef4444',
      description: 'Firewall DROP: public SNMP community string probe'
    },
    {
      from_ip: '45.142.214.22',
      to_machine: 'WEB-NGINX-PROXY-02',
      protocol: 'https',
      port: 443,
      action: 'accept',
      count: 120,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: Shodan SSL cert audit crawl'
    },
    {
      from_ip: '104.244.42.1',
      to_machine: 'WEB-NGINX-PROXY-01',
      protocol: 'https',
      port: 443,
      action: 'accept',
      count: 380,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: inbound social webhook callbacks'
    },
    {
      from_ip: '195.201.201.32',
      to_machine: 'PA-5250-EDGE-FW-02',
      protocol: 'smb',
      port: 445,
      action: 'drop',
      count: 512,
      blocked: 512,
      severity: 'critical',
      color: '#ef4444',
      description: 'Firewall DROP: external WAN SMB exploit probe'
    }
  ];

  // Outbound Connections (Internal Hosts -> Internet Services & Cloud APIs)
  const outbound = [
    {
      from_machine: 'DNS-RESOLVER-INTERNAL',
      to_ip: '8.8.8.8',
      protocol: 'dns',
      port: 53,
      action: 'accept',
      count: 2450,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: external recursive DNS queries'
    },
    {
      from_machine: 'DNS-RESOLVER-INTERNAL',
      to_ip: '1.1.1.1',
      protocol: 'dns',
      port: 53,
      action: 'accept',
      count: 1980,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: external recursive DNS queries'
    },
    {
      from_machine: 'BACKUP-VEEAM-STORAGE',
      to_ip: '52.95.120.34',
      protocol: 'https',
      port: 443,
      action: 'accept',
      count: 620,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: offsite cloud immutable backup sync'
    },
    {
      from_machine: 'WS-EXEC-CEO-LAPTOP',
      to_ip: '13.107.4.52',
      protocol: 'https',
      port: 443,
      action: 'accept',
      count: 890,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: Microsoft 365 cloud traffic'
    },
    {
      from_machine: 'WS-JOSHWA-DEV',
      to_ip: '140.82.121.4',
      protocol: 'https',
      port: 443,
      action: 'accept',
      count: 340,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: git push / pull to GitHub'
    },
    {
      from_machine: 'WS-GIRI-SEC-OPS',
      to_ip: '151.101.65.140',
      protocol: 'https',
      port: 443,
      action: 'accept',
      count: 215,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: threat intelligence feed synchronization'
    },
    {
      from_machine: 'WS-LOQ-RESEARCH',
      to_ip: '198.51.100.42',
      protocol: 'https',
      port: 443,
      action: 'drop',
      count: 42,
      blocked: 42,
      severity: 'critical',
      color: '#ef4444',
      description: 'Firewall DROP: C2 beacon blocked by threat prevention signature'
    },
    {
      from_machine: 'WS-RECEPTION-DESK',
      to_ip: '185.220.101.5',
      protocol: 'tcp',
      port: 9001,
      action: 'deny',
      count: 18,
      blocked: 18,
      severity: 'critical',
      color: '#ef4444',
      description: 'Firewall DENY: outbound Tor connection blocked by security profile'
    },
    {
      from_machine: 'PROXY-SQUID-EGRESS',
      to_ip: '54.239.28.85',
      protocol: 'https',
      port: 443,
      action: 'accept',
      count: 1400,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: corporate outbound web proxy'
    },
    {
      from_machine: 'K8S-MASTER-CLUSTER',
      to_ip: '34.120.180.20',
      protocol: 'https',
      port: 443,
      action: 'accept',
      count: 850,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: cloud telemetry and container registry'
    },
    {
      from_machine: 'DC01-PRIMARY-KDC',
      to_ip: '20.190.159.0',
      protocol: 'https',
      port: 443,
      action: 'accept',
      count: 410,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: Entra ID Connect hybrid password hash sync'
    },
    {
      from_machine: 'DHCP-IPAM-SERVER',
      to_ip: '162.159.130.233',
      protocol: 'ntp',
      port: 123,
      action: 'accept',
      count: 90,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: network time sync'
    },
    {
      from_machine: 'GITLAB-CODE-SRV',
      to_ip: '199.232.41.140',
      protocol: 'http',
      port: 80,
      action: 'accept',
      count: 84,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: security package updates mirror'
    }
  ];

  // Lateral / Internal Connections (Workstations, Servers, DMZ, OT Subnets)
  const lateral = [
    {
      source: 'WEB-NGINX-PROXY-01',
      target: 'API-BACKEND-SRV-01',
      protocol: 'http',
      port: 8080,
      action: 'accept',
      count: 1840,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: reverse proxy forwarding to app server'
    },
    {
      source: 'WEB-NGINX-PROXY-02',
      target: 'API-BACKEND-SRV-02',
      protocol: 'http',
      port: 8080,
      action: 'accept',
      count: 1420,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: reverse proxy forwarding to app server'
    },
    {
      source: 'API-BACKEND-SRV-01',
      target: 'SQL-PROD-PRIMARY',
      protocol: 'ms-sql',
      port: 1433,
      action: 'accept',
      count: 3620,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: backend transactional database queries'
    },
    {
      source: 'API-BACKEND-SRV-02',
      target: 'SQL-PROD-PRIMARY',
      protocol: 'ms-sql',
      port: 1433,
      action: 'accept',
      count: 2890,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: backend transactional database queries'
    },
    {
      source: 'SQL-PROD-PRIMARY',
      target: 'SQL-PROD-REPLICA',
      protocol: 'ms-sql-alwayson',
      port: 5022,
      action: 'accept',
      count: 980,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: database high-availability mirroring'
    },
    {
      source: 'WS-JOSHWA-DEV',
      target: 'GITLAB-CODE-SRV',
      protocol: 'ssh',
      port: 22,
      action: 'accept',
      count: 145,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: internal developer git SSH access'
    },
    {
      source: 'WS-GIRI-SEC-OPS',
      target: 'SIEM-LOG-AGGREGATOR',
      protocol: 'https',
      port: 443,
      action: 'accept',
      count: 420,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: security operations dashboard'
    },
    {
      source: 'WS-ADMIN-MGMT',
      target: 'JUMPBOX-BASTION-01',
      protocol: 'ssh',
      port: 22,
      action: 'accept',
      count: 88,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: administrator bastion jump access'
    },
    {
      source: 'JUMPBOX-BASTION-01',
      target: 'DC01-PRIMARY-KDC',
      protocol: 'rdp',
      port: 3389,
      action: 'accept',
      count: 32,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: bastion RDP to primary domain controller'
    },
    {
      source: 'WS-FINANCE-SR-01',
      target: 'FILESERVER-SMB-01',
      protocol: 'smb',
      port: 445,
      action: 'accept',
      count: 410,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: department network file share access'
    },
    {
      source: 'WS-FINANCE-SR-02',
      target: 'FILESERVER-SMB-01',
      protocol: 'smb',
      port: 445,
      action: 'accept',
      count: 320,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: department network file share access'
    },
    {
      source: 'WS-SALES-LEAD-01',
      target: 'FILESERVER-SMB-02',
      protocol: 'smb',
      port: 445,
      action: 'accept',
      count: 240,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: sales document repository'
    },
    {
      source: 'WS-HR-DIRECTOR',
      target: 'DC01-PRIMARY-KDC',
      protocol: 'kerberos',
      port: 88,
      action: 'accept',
      count: 180,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: user logon authentication'
    },
    {
      source: 'WS-LOQ-RESEARCH',
      target: 'SQL-PROD-PRIMARY',
      protocol: 'ms-sql',
      port: 1433,
      action: 'deny',
      count: 65,
      blocked: 65,
      severity: 'critical',
      color: '#ef4444',
      description: 'Firewall DENY: unauthorized direct database access blocked by segmentation'
    },
    {
      source: 'WS-RECEPTION-DESK',
      target: 'DC01-PRIMARY-KDC',
      protocol: 'smb',
      port: 445,
      action: 'deny',
      count: 38,
      blocked: 38,
      severity: 'high',
      color: '#ef4444',
      description: 'Firewall DENY: unauthorized SMB session from front desk VLAN'
    },
    {
      source: 'FTG-600E-BRANCH-FW',
      target: 'PA-5250-EDGE-FW-01',
      protocol: 'ipsec',
      port: 4500,
      action: 'accept',
      count: 1650,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: site-to-site IPsec VPN tunnel'
    },
    {
      source: 'BRANCH-POS-TERM-01',
      target: 'BRANCH-SRV-DFS',
      protocol: 'https',
      port: 8443,
      action: 'accept',
      count: 420,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: POS terminal transaction batching'
    },
    {
      source: 'BRANCH-POS-TERM-02',
      target: 'BRANCH-SRV-DFS',
      protocol: 'https',
      port: 8443,
      action: 'accept',
      count: 380,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: POS terminal transaction batching'
    },
    {
      source: 'BRANCH-POS-TERM-01',
      target: 'DC01-PRIMARY-KDC',
      protocol: 'smb',
      port: 445,
      action: 'drop',
      count: 52,
      blocked: 52,
      severity: 'critical',
      color: '#ef4444',
      description: 'Firewall DROP: POS isolation policy violation to Core DC'
    },
    {
      source: 'SCADA-HMI-OPERATOR1',
      target: 'PLC-LINE1-ASSEMBLY',
      protocol: 'modbus',
      port: 502,
      action: 'accept',
      count: 940,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: industrial control system telemetry'
    },
    {
      source: 'SCADA-HMI-OPERATOR2',
      target: 'PLC-LINE2-ROBOTICS',
      protocol: 'profinet',
      port: 34964,
      action: 'accept',
      count: 820,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: robotics PLC status polling'
    },
    {
      source: 'HISTORIAN-PROD-DB',
      target: 'SIEM-LOG-AGGREGATOR',
      protocol: 'syslog',
      port: 514,
      action: 'accept',
      count: 510,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: industrial plant audit log forwarding'
    },
    {
      source: 'WS-ENGINEER-DEVOPS',
      target: 'OT-SCADA-GATEWAY',
      protocol: 'ssh',
      port: 22,
      action: 'deny',
      count: 14,
      blocked: 14,
      severity: 'critical',
      color: '#ef4444',
      description: 'Firewall DENY: corporate network barred from OT DMZ'
    },
    {
      source: 'VPN-REMOTE-DEV-01',
      target: 'K8S-MASTER-CLUSTER',
      protocol: 'https',
      port: 6443,
      action: 'accept',
      count: 280,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: remote dev kubectl API administration'
    },
    {
      source: 'VPN-REMOTE-SALES',
      target: 'FILESERVER-SMB-02',
      protocol: 'smb',
      port: 445,
      action: 'accept',
      count: 190,
      blocked: 0,
      severity: 'info',
      color: '#22c55e',
      description: 'Firewall ACCEPT: remote sales SMB document access'
    },
    {
      source: 'WS-KIOSK-LOBBY',
      target: 'FILESERVER-SMB-01',
      protocol: 'smb',
      port: 445,
      action: 'drop',
      count: 89,
      blocked: 89,
      severity: 'critical',
      color: '#ef4444',
      description: 'Firewall DROP: guest lobby kiosk barred from internal shares'
    }
  ];

  return {
    machines,
    inbound,
    outbound,
    lateral,
    ad_attacks: []
  };
}
