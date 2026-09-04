#!/bin/bash
# ════════════════════════════════════════════════════════════════
# IOC Hunt — Multi-Server Deployment Script
# ════════════════════════════════════════════════════════════════

set -e

# Parse arguments
MODE=$1

if [[ "$MODE" != "central" && "$MODE" != "aggregator" && "$MODE" != "all" ]]; then
    echo -e "\033[0;31mUsage: $0 [central|aggregator|all]\033[0m"
    exit 1
fi

echo -e "\033[0;36m============================================================\033[0m"
echo -e "\033[0;36m Starting deployment for: $MODE\033[0m"
echo -e "\033[0;36m============================================================\033[0m"

# Ensure .env exists
if [ ! -f .env ]; then
  echo -e "\033[1;33m[1/4] .env file not found! Copying from .env.example...\033[0m"
  cp .env.example .env
fi

# Ensure Nginx SSL directory exists
SSL_DIR="./nginx/ssl"
mkdir -p $SSL_DIR

# Generate self-signed certificates if they don't exist
if [[ ! -f "$SSL_DIR/iochunt.crt" || ! -f "$SSL_DIR/iochunt.key" ]]; then
    echo -e "\033[1;33m[2/4] Generating self-signed TLS certificates for Nginx proxy...\033[0m"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$SSL_DIR/iochunt.key" \
        -out "$SSL_DIR/iochunt.crt" \
        -subj "/C=US/ST=State/L=City/O=IOCHunt/CN=localhost"
    echo -e "\033[0;32m[CertManager] Certificates generated.\033[0m"
else
    echo -e "\033[0;32m[2/4] TLS certificates already exist. Skipping generation.\033[0m"
fi

# Check for clean mode
CLEAN_MODE=$2

if [[ "$CLEAN_MODE" == "--clean" || "$CLEAN_MODE" == "--force" ]]; then
    # Bring down existing containers only if requested
    echo -e "\033[1;33m[3/4] Clean mode requested. Stopping and removing containers...\033[0m"
    docker compose -p central down 2>/dev/null || true
    docker compose -p superadmin -f docker-compose.superadmin.yml down 2>/dev/null || true
    docker compose -p aggregator -f docker-compose.aggregator.yml down 2>/dev/null || true
    docker compose down 2>/dev/null || true
    docker rm -f $(docker ps -aq --filter "name=iochunt-") 2>/dev/null || true
else
    echo -e "\033[0;32m[3/4] Rolling mode: Keeping databases & Redis online without interruption...\033[0m"
fi

echo -e "\033[1;33m[4/4] Building and updating containers for $MODE...\033[0m"

if [[ "$MODE" == "all" ]]; then
    echo -e "\033[1;33m[4.1/4] Updating Central base stack (Postgres & Redis stay online)...\033[0m"
    docker compose -p central up -d --build

    echo -e "\033[1;33m[4.2/4] Updating Super Admin stack...\033[0m"
    export HOST_PWD=$PWD
    docker compose -p superadmin -f docker-compose.superadmin.yml up -d --build

    echo -e "\033[1;33m[4.3/4] Updating Aggregator stack...\033[0m"
    docker compose -p aggregator -f docker-compose.aggregator.yml up -d --build

    echo -e "\033[0;32m============================================================\033[0m"
    echo -e "\033[0;32m All Containers Updated Successfully with Zero DB Downtime!\033[0m"
    echo -e "\033[0;32m ➜ Central App:     https://$(hostname -I | awk '{print $1}'):8082\033[0m"
    echo -e "\033[0;32m ➜ Super Admin UI:  https://$(hostname -I | awk '{print $1}'):8083\033[0m"
    echo -e "\033[0;32m ➜ Aggregator UI:   https://$(hostname -I | awk '{print $1}'):8084\033[0m"
    echo -e "\033[0;32m============================================================\033[0m"
elif [[ "$MODE" == "central" ]]; then
    echo -e "\033[1;33m[4.1/4] Updating Central Server stack (Postgres & Redis stay online)...\033[0m"
    docker compose -p central up -d --build

    echo -e "\033[1;33m[4.2/4] Updating Super Admin stack (Port 8083)...\033[0m"
    export HOST_PWD=$PWD
    docker compose -p superadmin -f docker-compose.superadmin.yml up -d --build

    echo -e "\033[0;32m============================================================\033[0m"
    echo -e "\033[0;32m Central Server Deployment Complete!\033[0m"
    echo -e "\033[0;32m ➜ Central App:     https://$(hostname -I | awk '{print $1}'):8082\033[0m"
    echo -e "\033[0;32m ➜ Super Admin UI:  https://$(hostname -I | awk '{print $1}'):8083\033[0m"
    echo -e "\033[0;32m============================================================\033[0m"
else
    # Start Aggregator stack (Port 8084)
    docker compose -p aggregator -f docker-compose.aggregator.yml up -d --build

    echo -e "\033[0;32m============================================================\033[0m"
    echo -e "\033[0;32m Aggregator Deployment Complete!\033[0m"
    echo -e "\033[0;32m ➜ Aggregator UI:   https://$(hostname -I | awk '{print $1}'):8084\033[0m"
    echo -e "\033[0;32m============================================================\033[0m"
fi
