#!/bin/bash
# ════════════════════════════════════════════════════════════════
# IOC Hunt — Rollback Script
# ════════════════════════════════════════════════════════════════
# Usage: ./scripts/rollback.sh [commit-hash-or-tag]
#
# Without arguments: rolls back to the previous commit.
# With argument: rolls back to specified commit or tag.
# ════════════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

TARGET=${1:-"HEAD~1"}

echo ""
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  IOC Hunt — Rollback${NC}"
echo -e "${CYAN}  Target: ${TARGET}${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo ""

# Save current state
CURRENT_COMMIT=$(git rev-parse HEAD)
echo -e "${YELLOW}Current commit: ${CURRENT_COMMIT}${NC}"
echo ""

# Confirm rollback
read -p "Are you sure you want to rollback to ${TARGET}? (y/N) " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo -e "${RED}Rollback cancelled.${NC}"
  exit 0
fi

# Checkout target
echo -e "${YELLOW}[1/3] Checking out ${TARGET}...${NC}"
git checkout "${TARGET}" -- .
echo -e "${GREEN}   Code reverted${NC}"

# Rebuild and restart
echo -e "${YELLOW}[2/3] Rebuilding images...${NC}"
docker compose build

echo -e "${YELLOW}[3/3] Restarting services...${NC}"
docker compose up -d --remove-orphans
docker image prune -f

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Rollback Complete!${NC}"
echo -e "${GREEN}  Previous commit: ${CURRENT_COMMIT}${NC}"
echo -e "${GREEN}  To undo: ./scripts/rollback.sh ${CURRENT_COMMIT}${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
