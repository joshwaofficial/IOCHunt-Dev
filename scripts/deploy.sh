#!/bin/bash
# ════════════════════════════════════════════════════════════════
# IOC Hunt — Unified Platform Deployment Script
# ════════════════════════════════════════════════════════════════
# Usage: ./scripts/deploy.sh
# ════════════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

VERSION=$(cat VERSION 2>/dev/null || echo "2.0.0")
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo ""
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  IOC Hunt — Unified Platform Deployment${NC}"
echo -e "${CYAN}  Version: ${VERSION}${NC}"
echo -e "${CYAN}  Time:    ${TIMESTAMP}${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo ""

# ── Step 1: Check .env exists ────────────────────────────────
echo -e "${YELLOW}[1/4] Checking configuration...${NC}"
if [ ! -f .env ]; then
  echo -e "${RED}  ✗ .env file not found!${NC}"
  echo -e "${RED}  Run: cp .env.example .env && nano .env${NC}"
  exit 1
fi
echo -e "${GREEN}   .env file found${NC}"

# Check SSL certificates exist
if [ ! -f nginx/ssl/iochunt.crt ] || [ ! -f nginx/ssl/iochunt.key ]; then
  echo -e "${YELLOW}  ⚠ SSL certificates not found — generating self-signed certs...${NC}"
  ./scripts/generate-certs.sh
fi
echo -e "${GREEN}   SSL certificates verified${NC}"
echo ""

# ── Step 2: Build images ────────────────────────────────────
echo -e "${YELLOW}[2/4] Building Unified Docker image...${NC}"
docker compose build
echo -e "${GREEN}   Images built successfully${NC}"
echo ""

# ── Step 3: Start services ──────────────────────────────────
echo -e "${YELLOW}[3/4] Starting 3-service platform (db, app, nginx)...${NC}"
docker compose up -d --remove-orphans
docker restart iochunt-nginx || true
echo -e "${GREEN}   Platform services started${NC}"
echo ""

# ── Step 4: Health Verification ─────────────────────────────
echo -e "${YELLOW}[4/4] Verifying health checks (10s)...${NC}"
sleep 10

DB_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' iochunt-db 2>/dev/null || echo "unknown")
APP_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' iochunt-app 2>/dev/null || echo "unknown")
NGINX_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' iochunt-nginx 2>/dev/null || echo "unknown")

echo ""
echo -e "${CYAN}  Service Health:${NC}"
echo -e "  PostgreSQL (db):    ${DB_HEALTH}"
echo -e "  Platform Node (app): ${APP_HEALTH}"
echo -e "  Nginx Proxy:        ${NGINX_HEALTH}"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}  Platform Web UI: https://localhost (or configured domain)${NC}"
echo -e "${GREEN}  API Endpoint:    https://localhost/api${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
