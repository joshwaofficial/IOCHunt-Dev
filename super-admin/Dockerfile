# ── Stage 1: Build Frontend ─────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY super-admin/frontend/package*.json ./
RUN npm ci || npm install

COPY super-admin/frontend/ ./
RUN npm run build

# ── Stage 2: Super Admin Backend ────────────────────────────────
FROM node:20-alpine

# Install Docker CLI and OpenSSL for TLS certificate generation
RUN apk add --no-cache docker-cli docker-cli-compose openssl

WORKDIR /app

# Copy Super Admin backend dependencies (only 5 packages: fast install in seconds)
COPY super-admin/package*.json ./super-admin/
WORKDIR /app/super-admin
RUN npm install

# Copy application files
WORKDIR /app
COPY . /app/

# Link node_modules so any imported backend helpers share the installed modules instantly
RUN mkdir -p /app/backend && ln -sf /app/super-admin/node_modules /app/backend/node_modules

# Copy built frontend assets from stage 1
COPY --from=frontend-builder /app/frontend/dist /app/super-admin/frontend/dist

ENV NODE_PATH=/app/super-admin/node_modules
EXPOSE 4001

WORKDIR /app/super-admin/backend
CMD ["node", "server.js"]
