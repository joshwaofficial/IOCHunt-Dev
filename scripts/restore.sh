#!/bin/bash
# ════════════════════════════════════════════════════════════════
# IOC Hunt — Restore Script
# ════════════════════════════════════════════════════════════════
# Usage: ./scripts/restore.sh <backup-file.sql.gz>
#
# Example:
#   ./scripts/restore.sh postgres/backups/db_full_20260727_140000.sql.gz
# ════════════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

BACKUP_FILE=${1:-""}

if [ -z "$BACKUP_FILE" ]; then
  echo -e "${RED}Usage: ./scripts/restore.sh <backup-file.sql.gz>${NC}"
  echo ""
  echo "Available backups:"
  ls -lh postgres/backups/db_*.sql.gz 2>/dev/null || echo "  No backups found."
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo -e "${RED}Error: Backup file not found: ${BACKUP_FILE}${NC}"
  exit 1
fi

echo ""
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  IOC Hunt — Restore${NC}"
echo -e "${CYAN}  File: ${BACKUP_FILE}${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo ""

echo -e "${RED}⚠ WARNING: This will OVERWRITE all current data!${NC}"
read -p "Are you sure? (y/N) " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo -e "${YELLOW}Restore cancelled.${NC}"
  exit 0
fi

# Stop application services (keep DB running)
echo -e "${YELLOW}[1/4] Stopping application services...${NC}"
docker compose stop central-backend aggregator-backend nginx
echo -e "${GREEN}  ✓ Services stopped${NC}"

# Restore database
echo -e "${YELLOW}[2/4] Restoring database...${NC}"
gunzip -c "${BACKUP_FILE}" | docker compose exec -T db psql -U postgres
echo -e "${GREEN}  ✓ Database restored${NC}"

# Restart all services
echo -e "${YELLOW}[3/4] Restarting all services...${NC}"
docker compose up -d
echo -e "${GREEN}  ✓ Services restarted${NC}"

# Health check
echo -e "${YELLOW}[4/4] Waiting for health checks (15s)...${NC}"
sleep 15

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Restore Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
docker compose ps
echo ""
