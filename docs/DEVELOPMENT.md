# IOC Hunt — Development Guide

## Local Development Setup

### Prerequisites
- Node.js 20+
- Docker Desktop (for PostgreSQL)
- Git

### 1. Clone & Install

```bash
git clone https://github.com/joshwaofficial/IOCHunt-Dev.git
cd IOCHunt-Dev

# Start only the database
docker compose up db -d

# Install dependencies
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
cd aggregator/backend && npm install && cd ../..
cd aggregator/frontend && npm install && cd ../..
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env — change DATABASE_URL to use localhost instead of db
```

### 3. Run

```bash
# Terminal 1: Central Backend
cd backend && npm run dev

# Terminal 2: Central Frontend
cd frontend && npm run dev

# Terminal 3: Aggregator Backend (optional)
cd aggregator/backend && npm run dev

# Terminal 4: Aggregator Frontend (optional)
cd aggregator/frontend && npm run dev
```

### 4. Access
- Central Frontend: `https://localhost:5173`
- Aggregator Frontend: `https://localhost:5174`

---

## Git Workflow

```bash
# Make changes
git add .
git commit -m "feat: add new dashboard widget"
git push origin main

# Deploy to server
ssh root@72.62.241.39
cd /opt/iochunt
./scripts/deploy.sh
```

---

## Adding New API Routes

1. Create controller in `backend/src/controllers/`
2. Create route in `backend/src/routes/`
3. Register route in `backend/src/server.js`
4. Test locally with `npm run dev`
5. Push and deploy

---

## Adding New Aggregator Instances

To run multiple aggregators, create separate `.env` files and compose profiles. Example for 3 aggregators:

```bash
# In docker-compose.yml, duplicate the aggregator-backend service:
# aggregator-backend-2, aggregator-backend-3
# Each with its own AGGREGATOR_NAME and DATABASE_URL
```
