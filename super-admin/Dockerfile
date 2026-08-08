# ── Stage 1: Build Frontend ─────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY super-admin/frontend/package*.json ./
RUN npm ci || npm install

COPY super-admin/frontend/ ./
RUN npm run build

# ── Stage 2: Super Admin Backend ────────────────────────────────
FROM node:20-alpine

# Install Docker CLI so the Node app can run docker commands on the host
RUN apk add --no-cache docker-cli docker-cli-compose

WORKDIR /app

# Copy Super Admin backend dependencies
COPY super-admin/package*.json ./super-admin/
WORKDIR /app/super-admin
RUN npm install

# We need the entire repository because provision_tenant.js expects to run docker compose
# from the root folder where the main docker-compose.yml lives.
WORKDIR /app
COPY . /app/

# Copy built frontend assets from stage 1
COPY --from=frontend-builder /app/frontend/dist /app/super-admin/frontend/dist

EXPOSE 4001

WORKDIR /app/super-admin/backend
CMD ["node", "server.js"]
