# IOC Hunt — Unified Cybersecurity Platform

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)]()
[![Docker](https://img.shields.io/badge/docker-ready-brightgreen.svg)]()
[![Multi-Tenant](https://img.shields.io/badge/multi--tenant-ready-purple.svg)]()
[![License](https://img.shields.io/badge/license-proprietary-red.svg)]()

> Enterprise SOC platform for real-time threat detection, automated incident response, syslog aggregation, and multi-tenant cyber security monitoring.

---

## 🏗️ Architecture

```
                      ┌───────────────────────────────────────────────┐
                      │              Windows Endpoints                │
                      │               (agent/iochunt.py)              │
                      └──────────────────────┬────────────────────────┘
                                             │ HTTPS /api/logs
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Unified Docker Stack (3 Services)                      │
│                                                                                 │
│  Nginx Reverse Proxy (:80 / :443 TLS)                                           │
│    └── Routes all web traffic & terminates SSL certificates                     │
│                                                                                 │
│  Unified Platform Container (:4001 HTTP, :5514 Syslog UDP)                      │
│    ├── Mode: Central Management Server OR Branch Aggregator                     │
│    ├── React Single Page Application (Dashboard & Setup Wizard)                 │
│    ├── Direct Agent Ingestion Engine & Syslog Receiver                          │
│    └── Dynamic Multi-Tenant PostgreSQL Schema Isolation                         │
│                                                                                 │
│  PostgreSQL 16 Multi-Tenant Database (iochunt_db)                               │
│    ├── public schema: tenants, users, sessions, instance_config                 │
│    └── tenant_<id> schemas: events, machines, incidents, firewall_rules        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Configure Environment
```bash
cp .env.example .env
nano .env  # Set your secrets and instance mode
```

### 2. Generate TLS Certificates
```bash
./scripts/generate-certs.sh
```

### 3. Deploy Stack
```bash
./scripts/deploy.sh
```

### 4. Access Platform
Open your browser at `https://localhost` (or your domain/IP). If this is a fresh deployment, you will automatically be guided through the **First-Time Setup Wizard**.

---

## 📂 Project Structure

```
iochunt/
├── backend/            # Unified Node.js Platform Backend & Aggregator Modules
├── frontend/           # Unified React SPA Dashboard & Setup Wizard
├── agent/              # Endpoint Agent (Python)
├── nginx/              # Reverse Proxy & SSL Configuration
├── postgres/           # Database Initialization Scripts
├── scripts/            # Deployment, Backup, and Simulation Tools
├── docs/               # Architecture and Operations Documentation
├── docker-compose.yml  # 3-Service Production Orchestration
├── Dockerfile          # Multi-Stage Production Build
├── .env.example        # Environment Variable Template
└── VERSION             # Current Version
```

---

## 🛠️ Operations & Management

| Task | Command |
|---|---|
| Deploy / Update | `./scripts/deploy.sh` |
| View Live Logs | `docker compose logs -f` |
| Backup Database | `./scripts/backup.sh` |
| Restore Database | `./scripts/restore.sh <backup-file>` |
| Rollback Version | `./scripts/rollback.sh` |
| Send Mock Attacks | `node scripts/mock_logs.js` |
| Stop Platform | `docker compose down` |

---

## 🛡️ License

Proprietary — DefSecOne © 2026
