# IOC Hunt — Development Guide

## Local Development Setup

### Prerequisites
- Node.js 20+
- PostgreSQL 16 (or Docker Desktop)
- Git

### 1. Clone & Install

```bash
git clone https://github.com/joshwaofficial/IOCHunt-Dev.git
cd IOCHunt-Dev

# Start only the database container (optional)
docker compose up db -d

# Install backend & frontend dependencies
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env for local development:
# Set DATABASE_URL=postgres://postgres:iochunt_password@localhost:5432/iochunt_db
```

### 3. Run Locally

```bash
# Terminal 1: Backend Server (Port 4001)
cd backend && npm run dev

# Terminal 2: Frontend Dev Server (Port 5173 / 8080)
cd frontend && npm run dev
```

### 4. Running as Aggregator vs Central Server Locally

To test in **Aggregator** mode:
```bash
INSTANCE_MODE=aggregator PORT=4001 npm run dev
```

To test in **Central Server** mode:
```bash
INSTANCE_MODE=central_server PORT=4001 npm run dev
```

---

## Testing Mock Attack Simulations

To stream mock threat events into your local or remote platform:

```bash
# Stream 100 mock events across 5 machines:
SERVER_URL=http://localhost:4001 node scripts/mock_logs.js
```
