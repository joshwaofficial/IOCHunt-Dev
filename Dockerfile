# ════════════════════════════════════════════════════════════════
# IOC Hunt — Unified Platform Multi-Stage Dockerfile
# Builds the unified React Frontend + Node.js Backend
# ════════════════════════════════════════════════════════════════

# ── Stage 1: Build Frontend ─────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci || npm install

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production Platform Node Server ────────────────────
FROM node:20-alpine
WORKDIR /app

# Install openssl and curl for TLS cert generation and healthchecks
RUN apk add --no-cache openssl curl

# Install backend dependencies
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev || npm install --omit=dev

# Copy backend source code
COPY backend/ /app/backend/

# Copy built frontend assets from stage 1
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expose standard application ports
# 4001: HTTP API / Frontend
# 5514: Syslog UDP listener (when running in aggregator mode)
EXPOSE 4001 5514/udp

HEALTHCHECK --interval=20s --timeout=5s --retries=3 --start-period=15s \
  CMD curl -k -f https://127.0.0.1:${PORT:-4001}/health || curl -f http://127.0.0.1:${PORT:-4001}/health || exit 1

WORKDIR /app/backend
CMD ["node", "src/server.js"]
