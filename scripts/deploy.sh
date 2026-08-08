#!/bin/bash
# ════════════════════════════════════════════════════════════════
# IOC Hunt — Multi-Server Deployment Script
# ════════════════════════════════════════════════════════════════

set -e

# Parse arguments
MODE=$1

if [[ "$MODE" != "central" && "$MODE" != "aggregator" ]]; then
    echo -e "\033[0;31mUsage: $0 [central|aggregator]\033[0m"
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

# Bring down existing containers
echo -e "\033[1;33m[3/4] Stopping any running containers...\033[0m"
docker compose down 2>/dev/null || true
docker compose -f docker-compose.superadmin.yml down 2>/dev/null || true
docker compose -f docker-compose.aggregator.yml down 2>/dev/null || true

echo -e "\033[1;33m[4/4] Rebuilding and starting containers for $MODE...\033[0m"

if [[ "$MODE" == "central" ]]; then
    # Start Central Server stack (Port 8082)
    export NGINX_HTTP_PORT=8080
    export NGINX_HTTPS_PORT=8082
    docker compose up -d --build

    # Start Super Admin stack (Port 8081)
    docker compose -f docker-compose.superadmin.yml up -d --build

    echo -e "\033[0;32m============================================================\033[0m"
    echo -e "\033[0;32m Central Server Deployment Complete!\033[0m"
    echo -e "\033[0;32m ➜ Super Admin UI:  https://$(hostname -I | awk '{print $1}'):8081\033[0m"
    echo -e "\033[0;32m ➜ Central UI:      https://$(hostname -I | awk '{print $1}'):8082\033[0m"
    echo -e "\033[0;32m============================================================\033[0m"
else
    # Start Aggregator stack (Port 8083)
    export NGINX_HTTP_PORT=8080
    export NGINX_HTTPS_PORT=8083
    docker compose -f docker-compose.aggregator.yml up -d --build

    echo -e "\033[0;32m============================================================\033[0m"
    echo -e "\033[0;32m Aggregator Deployment Complete!\033[0m"
    echo -e "\033[0;32m ➜ Aggregator UI:   https://$(hostname -I | awk '{print $1}'):8083\033[0m"
    echo -e "\033[0;32m============================================================\033[0m"
fi
