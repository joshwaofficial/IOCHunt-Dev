#!/bin/bash
# ════════════════════════════════════════════════════════════════
# IOC Hunt — Self-Signed Certificate Generator
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

if [ -f "${SSL_DIR}/iochunt.crt" ] && [ -f "${SSL_DIR}/iochunt.key" ]; then
  echo -e "${YELLOW}Certificates already exist.${NC}"
  echo "Keeping existing certificates."
  exit 0
fi

echo -e "${YELLOW}Generating self-signed TLS certificate for IOC Hunt...${NC}"
openssl req -x509 \
  -newkey rsa:4096 \
  -keyout "${SSL_DIR}/iochunt.key" \
  -out "${SSL_DIR}/iochunt.crt" \
  -days 3650 \
  -nodes \
  -subj "/CN=iochunt-platform/O=DefSecOne/C=IN" \
  2>/dev/null

# Print fingerprint for agent cert pinning
FINGERPRINT=$(openssl x509 -in "${SSL_DIR}/iochunt.crt" -fingerprint -sha256 -noout | cut -d= -f2)

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Certificate Generated Successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo -e "  Certificate: ${SSL_DIR}/iochunt.crt"
echo -e "  Private Key: ${SSL_DIR}/iochunt.key"
echo -e "  Valid For:   3650 days (10 years)"
echo ""
echo -e "  SHA-256 Fingerprint:"
echo -e "  ${CYAN}${FINGERPRINT}${NC}"
echo ""
