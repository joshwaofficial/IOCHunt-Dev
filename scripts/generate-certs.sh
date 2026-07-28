#!/bin/bash
# ════════════════════════════════════════════════════════════════
# IOC Hunt — Self-Signed Certificate Generator
# ════════════════════════════════════════════════════════════════
# Usage: ./scripts/generate-certs.sh
#
# Generates self-signed certificates for TLS termination at Nginx.
# ════════════════════════════════════════════════════════════════

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SSL_DIR="./nginx/ssl"

echo ""
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  IOC Hunt — Certificate Generator${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo ""

mkdir -p "${SSL_DIR}"

if [ -f "${SSL_DIR}/central.crt" ] && [ -f "${SSL_DIR}/central.key" ] && [ -f "${SSL_DIR}/iochunt.crt" ] && [ -f "${SSL_DIR}/iochunt.key" ]; then
  echo -e "${YELLOW}Certificates already exist.${NC}"
  read -p "Regenerate? (y/N) " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Keeping existing certificates."
    exit 0
  fi
fi

echo -e "${YELLOW}Generating self-signed certificate for Central Server...${NC}"
openssl req -x509 \
  -newkey rsa:4096 \
  -keyout "${SSL_DIR}/central.key" \
  -out "${SSL_DIR}/central.crt" \
  -days 3650 \
  -nodes \
  -subj "/CN=iochunt-central/O=DefSecOne/C=IN" \
  2>/dev/null

echo -e "${YELLOW}Generating self-signed certificate for Aggregator...${NC}"
openssl req -x509 \
  -newkey rsa:4096 \
  -keyout "${SSL_DIR}/iochunt.key" \
  -out "${SSL_DIR}/iochunt.crt" \
  -days 3650 \
  -nodes \
  -subj "/CN=iochunt-aggregator/O=DefSecOne/C=IN" \
  2>/dev/null

# Print fingerprint for agent cert pinning
FINGERPRINT=$(openssl x509 -in "${SSL_DIR}/iochunt.crt" -fingerprint -sha256 -noout | cut -d= -f2)

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Certificate Generated!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo -e "  Certificate: ${SSL_DIR}/central.crt"
echo -e "  Private Key: ${SSL_DIR}/central.key"
echo -e "  Valid For:   3650 days (10 years)"
echo ""
echo -e "  SHA-256 Fingerprint:"
echo -e "  ${CYAN}${FINGERPRINT}${NC}"
echo ""
echo -e "  Paste this fingerprint into the Windows Agent"
echo -e "  configuration for certificate pinning."
echo ""
