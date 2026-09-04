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

# Copy Super Admin backend dependencies
COPY super-admin/package*.json ./super-admin/
WORKDIR /app/super-admin
RUN npm install

# Copy backend dependencies first so Docker permanently caches this layer
COPY backend/package*.json /app/backend/
WORKDIR /app/backend
RUN npm install

# Copy the rest of the application files
WORKDIR /app
COPY . /app/

# Copy built frontend assets from stage 1
COPY --from=frontend-builder /app/frontend/dist /app/super-admin/frontend/dist

EXPOSE 4001

WORKDIR /app/super-admin/backend
CMD ["node", "server.js"]
