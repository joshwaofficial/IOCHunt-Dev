# IOC Hunt — Cyber Security Platform

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)]()
[![Docker](https://img.shields.io/badge/docker-ready-brightgreen.svg)]()
[![License](https://img.shields.io/badge/license-proprietary-red.svg)]()

> Enterprise-grade SOC platform for real-time threat detection, incident response, and security monitoring.

---

## Architecture

```
Windows Endpoints (500+)
    │
    │ HTTPS (API Key Auth)
    ▼
┌────────────────────────────────────────────┐
│           Docker Compose Stack             │
│                                            │
│  Nginx (:9090/:9443)                       │
│    ├── Central Dashboard (React)           │
│    ├── Aggregator Dashboard (React)        │
│    ├── /api/ → Central Backend (:4001)     │
│    └── /aggregator/api/ → Agg Backend      │
│                                            │
│  Central Backend (Node.js)                 │
│    └── PostgreSQL (iochunt_central)        │
│                                            │
│  Aggregator Backend (Node.js)              │
│    └── PostgreSQL (iochunt_aggregator)     │
│                                            │
└────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Docker Engine 24+
- Docker Compose v2+
- Git

### First Deployment

```bash
# 1. Clone the repository
git clone https://github.com/joshwaofficial/IOCHunt-Dev.git
cd IOCHunt-Dev

# 2. Create environment file
cp .env.example .env
nano .env  # Fill in your values

# 3. Generate SSL certificates
./scripts/generate-certs.sh

# 4. Deploy
./scripts/deploy.sh
```

### Access

| Service | URL |
|---|---|
| Central Dashboard | `https://72.62.241.39:9443` |
| Aggregator Dashboard | `https://72.62.241.39:9443/aggregator` |
| Default Login | `admin` / `admin` |

---

## Deployment Workflow

```
Developer (Mac/VS Code)
    │
    │ git push
    ▼
GitHub (joshwaofficial/IOCHunt-Dev)
    │
    │ SSH into server
    ▼
Server (72.62.241.39)
    │
    │ cd /opt/iochunt && ./scripts/deploy.sh
    ▼
Everything updated automatically
```

No CI/CD. No Jenkins. No GitHub Actions. Just Git + Docker + SSH.

---

## Project Structure

```
iochunt/
├── frontend/           # Central Dashboard (React + Vite)
├── backend/            # Central Backend (Node.js + Express)
├── aggregator/
│   ├── backend/        # Aggregator Backend (Node.js)
│   └── frontend/       # Aggregator Dashboard (React)
├── agent/              # Windows Agent (Python)
├── nginx/              # Reverse Proxy Config
├── postgres/           # Database Init Scripts
├── scripts/            # Deployment & Operations
├── docs/               # Documentation
├── docker-compose.yml  # Service Orchestration
├── .env.example        # Environment Template
└── VERSION             # Current Version
```

---

## Operations

| Task | Command |
|---|---|
| Deploy | `./scripts/deploy.sh` |
| View logs | `docker compose logs -f` |
| Backup | `./scripts/backup.sh` |
| Restore | `./scripts/restore.sh <file>` |
| Rollback | `./scripts/rollback.sh` |
| Restart | `docker compose restart` |
| Stop | `docker compose down` |
| Status | `docker compose ps` |

---

## Documentation

- [Deployment Guide](docs/DEPLOYMENT.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [Backup & Restore](docs/BACKUP.md)
- [Rollback Guide](docs/ROLLBACK.md)
- [Version Upgrade](docs/UPGRADE.md)

---

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | React 19, Vite 8, TailwindCSS |
| Backend | Node.js 20, Express 5 |
| Database | PostgreSQL 16 |
| Web Server | Nginx (Alpine) |
| Containers | Docker, Docker Compose |
| Agent | Python (Windows) |

---

## License

Proprietary — DefSecOne © 2026
