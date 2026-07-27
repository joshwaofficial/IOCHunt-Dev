#!/bin/bash
# ════════════════════════════════════════════════════════════════
# IOC Hunt — Backup Script
# ════════════════════════════════════════════════════════════════
# Usage: ./scripts/backup.sh
#
# Creates:
#   - Full PostgreSQL database dump
#   - SSL certificate backup
#   - Environment configuration backup
#
# Backups stored in: postgres/backups/
# Retention: 30 days
# ════════════════════════════════════════════════════════════════

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

BACKUP_DIR="./postgres/backups"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')

echo ""
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  IOC Hunt — Backup${NC}"
echo -e "${CYAN}  Time: $(date)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo ""

mkdir -p "${BACKUP_DIR}"

# ── Database Backup ─────────────────────────────────────────
echo -e "${YELLOW}[1/3] Backing up databases...${NC}"
docker compose exec -T db pg_dumpall -U postgres \
  | gzip > "${BACKUP_DIR}/db_full_${TIMESTAMP}.sql.gz"
DB_SIZE=$(du -sh "${BACKUP_DIR}/db_full_${TIMESTAMP}.sql.gz" | cut -f1)
echo -e "${GREEN}  ✓ Database backup: ${DB_SIZE}${NC}"

# ── Certificate Backup ──────────────────────────────────────
echo -e "${YELLOW}[2/3] Backing up certificates...${NC}"
if [ -d nginx/ssl ] && [ "$(ls -A nginx/ssl/*.crt 2>/dev/null)" ]; then
  tar czf "${BACKUP_DIR}/certs_${TIMESTAMP}.tar.gz" nginx/ssl/
  echo -e "${GREEN}  ✓ Certificate backup complete${NC}"
else
  echo -e "${YELLOW}  ⚠ No certificates found — skipping${NC}"
fi

# ── Config Backup ───────────────────────────────────────────
echo -e "${YELLOW}[3/3] Backing up configuration...${NC}"
if [ -f .env ]; then
  cp .env "${BACKUP_DIR}/env_${TIMESTAMP}.bak"
  echo -e "${GREEN}  ✓ Configuration backup complete${NC}"
fi

# ── Retention: delete backups older than 30 days ─────────────
echo ""
echo -e "${YELLOW}Cleaning up old backups (30+ days)...${NC}"
find "${BACKUP_DIR}" -name "*.gz" -mtime +30 -delete 2>/dev/null || true
find "${BACKUP_DIR}" -name "*.bak" -mtime +30 -delete 2>/dev/null || true

# ── Summary ─────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Backup Complete!${NC}"
echo -e "${GREEN}  Location: ${BACKUP_DIR}/${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
ls -lh "${BACKUP_DIR}/"*${TIMESTAMP}* 2>/dev/null
echo ""
