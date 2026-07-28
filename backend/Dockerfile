# ════════════════════════════════════════════
# IOC Hunt — Central Backend Dockerfile
# Production Node.js image
# ════════════════════════════════════════════

FROM node:20-alpine

WORKDIR /app

# Copy package files first (Docker layer caching)
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy source code
COPY . .

# Health check — hits the /api/ping endpoint
HEALTHCHECK --interval=30s --timeout=5s --retries=5 --start-period=15s \
  CMD wget -qO- http://127.0.0.1:${CENTRAL_PORT:-4001}/api/ping || exit 1

EXPOSE 4001

# Docker is the process manager — no PM2
CMD ["node", "src/server.js"]
