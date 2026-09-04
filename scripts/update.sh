#!/bin/bash
# ════════════════════════════════════════════════════════════════
# IOC Hunt — Zero-Downtime Rolling Update Script
# ════════════════════════════════════════════════════════════════
# This script updates application code and restarts ONLY the 
# application containers without stopping PostgreSQL, Redis, 
# or Nginx.
#
# Benefits:
#   ✔ Zero database downtime (PostgreSQL stays online 100%)
#   ✔ No Redis stream drops or agent disconnects
#   ✔ Builds new code in the background while old container runs
#   ✔ Instant (~1-2 second) hot-swap of the app container
#
# Usage:
#   ./scripts/update.sh           # Auto-detects and updates running stack
#   ./scripts/update.sh central   # Updates only Central Server App
#   ./scripts/update.sh superadmin# Updates only Super Admin UI
#   ./scripts/update.sh aggregator# Updates only Branch Aggregator
#   ./scripts/update.sh all       # Updates all active services
# ════════════════════════════════════════════════════════════════

set -e

TARGET=${1:-"auto"}

# Colors
CYAN="\033[0;36m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo -e "${CYAN}============================================================${RESET}"
echo -e "${CYAN} IOC Hunt — Rolling Update (Zero Downtime)${RESET}"
echo -e "${CYAN}============================================================${RESET}"

# 1. Pull latest code from GitHub
echo -e "${YELLOW}[1/3] Pulling latest updates from Git...${RESET}"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
    echo -e "      Branch: ${CURRENT_BRANCH}"
    git pull origin "$CURRENT_BRANCH" || echo -e "${YELLOW}Warning: Git pull had conflicts or was skipped. Using local files.${RESET}"
else
    echo -e "      Not a git repo or offline. Proceeding with current code."
fi

# 2. Function to rolling-update Central Server App
update_central() {
    echo -e "${YELLOW}[2/3] Building and updating Central Server Application...${RESET}"
    echo -e "      (PostgreSQL & Redis will NOT be interrupted)"
    docker compose -p central up -d --build --no-deps app
    echo -e "${GREEN}✔ Central Server App updated and restarted successfully!${RESET}"
}

# 3. Function to rolling-update Super Admin
update_superadmin() {
    echo -e "${YELLOW}[2/3] Building and updating Super Admin...${RESET}"
    export HOST_PWD="${HOST_PWD:-$PWD}"
    docker compose -p superadmin -f docker-compose.superadmin.yml up -d --build --no-deps super-admin
    echo -e "${GREEN}✔ Super Admin updated and restarted successfully!${RESET}"
}

# 4. Function to rolling-update Aggregator App
update_aggregator() {
    echo -e "${YELLOW}[2/3] Building and updating Branch Aggregator...${RESET}"
    echo -e "      (PostgreSQL & Redis will NOT be interrupted)"
    docker compose -p aggregator -f docker-compose.aggregator.yml up -d --build --no-deps app
    echo -e "${GREEN}✔ Branch Aggregator updated and restarted successfully!${RESET}"
}

# Execute based on target
case "$TARGET" in
    central)
        update_central
        ;;
    superadmin)
        update_superadmin
        ;;
    aggregator)
        update_aggregator
        ;;
    all)
        echo -e "${YELLOW}Updating all stacks...${RESET}"
        update_central
        update_superadmin
        update_aggregator
        ;;
    auto)
        echo -e "${YELLOW}[2/3] Auto-detecting active containers to update...${RESET}"
        FOUND=0
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "iochunt-app-"; then
            update_central
            FOUND=1
        fi
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "iochunt-super-admin"; then
            update_superadmin
            FOUND=1
        fi
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "iochunt-app-aggregator"; then
            update_aggregator
            FOUND=1
        fi
        if [ $FOUND -eq 0 ]; then
            echo -e "${YELLOW}No specific running container detected. Updating Central Server App...${RESET}"
            update_central
        fi
        ;;
    *)
        echo -e "${RED}Unknown target: $TARGET${RESET}"
        echo -e "Usage: $0 [central|superadmin|aggregator|all|auto]"
        exit 1
        ;;
esac

echo -e "${CYAN}============================================================${RESET}"
echo -e "${GREEN}✔ Rolling update complete with zero database downtime!${RESET}"
echo -e "${CYAN}============================================================${RESET}"
