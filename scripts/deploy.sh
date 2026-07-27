#!/bin/bash
# ════════════════════════════════════════════════════════════════
# IOC Hunt — Deployment Script
# ════════════════════════════════════════════════════════════════
# Usage: ./scripts/deploy.sh
#
# This script:
#   1. Pulls latest code from GitHub
#   2. Builds Docker images
#   3. Starts/restarts all services
#   4. Cleans up old images
#   5. Shows deployment status
# ════════════════════════════════════════════════════════════════

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

VERSION=$(cat VERSION 2>/dev/null || echo "unknown")
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo ""
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  IOC Hunt — Deployment${NC}"
echo -e "${CYAN}  Version: ${VERSION}${NC}"
echo -e "${CYAN}  Time:    ${TIMESTAMP}${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo ""

# ── Step 1: Pull latest code ─────────────────────────────────
echo -e "${YELLOW}[1/5] Pulling latest code from GitHub...${NC}"
git pull origin main 2>&1 || git pull origin master 2>&1 || echo -e "${RED}  ⚠ Git pull failed — continuing with local code${NC}"
echo ""

# ── Step 2: Check .env exists ────────────────────────────────
echo -e "${YELLOW}[2/5] Checking configuration...${NC}"
if [ ! -f .env ]; then
  echo -e "${RED}  ✗ .env file not found!${NC}"
  echo -e "${RED}  Run: cp .env.example .env && nano .env${NC}"
  exit 1
fi
echo -e "${GREEN}  ✓ .env file found${NC}"

# Check SSL certificates exist
if [ ! -f nginx/ssl/central.crt ] || [ ! -f nginx/ssl/central.key ]; then
  echo -e "${YELLOW}  ⚠ SSL certificates not found — generating self-signed certs...${NC}"
  ./scripts/generate-certs.sh
fi
echo -e "${GREEN}  ✓ SSL certificates found${NC}"
echo ""

# ── Step 3: Build images ────────────────────────────────────
echo -e "${YELLOW}[3/5] Building Docker images...${NC}"
docker compose build
echo -e "${GREEN}  ✓ Images built successfully${NC}"
echo ""

# ── Step 4: Start services ──────────────────────────────────
echo -e "${YELLOW}[4/5] Starting services...${NC}"
docker compose up -d --remove-orphans
echo -e "${GREEN}  ✓ Services started${NC}"
echo ""

# ── Step 5: Cleanup ─────────────────────────────────────────
echo -e "${YELLOW}[5/5] Cleaning up old images...${NC}"
docker image prune -f
echo ""

# ── Status ──────────────────────────────────────────────────
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  Deployment Status${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo ""
docker compose ps
echo ""

# Wait for health checks
echo -e "${YELLOW}Waiting for health checks (15s)...${NC}"
sleep 15

# Check health
CENTRAL_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' iochunt-central-backend 2>/dev/null || echo "unknown")
AGG_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' iochunt-aggregator-backend 2>/dev/null || echo "unknown")
DB_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' iochunt-db 2>/dev/null || echo "unknown")
NGINX_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' iochunt-nginx 2>/dev/null || echo "unknown")

echo ""
echo -e "${CYAN}  Service Health:${NC}"
echo -e "  PostgreSQL:         ${DB_HEALTH}"
echo -e "  Central Backend:    ${CENTRAL_HEALTH}"
echo -e "  Aggregator Backend: ${AGG_HEALTH}"
echo -e "  Nginx:              ${NGINX_HEALTH}"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}  Dashboard: https://72.62.241.39:9443${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
