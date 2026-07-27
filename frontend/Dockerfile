# ════════════════════════════════════════════
# IOC Hunt — Central Frontend Dockerfile
# Multi-stage build: Node → Nginx
# ════════════════════════════════════════════

# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (Docker layer caching)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build production bundle
RUN npm run build

# ────────────────────────────────────────────
# Stage 2: Serve with Nginx
# ────────────────────────────────────────────
FROM nginx:alpine AS runtime

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Add health check endpoint
RUN echo "OK" > /usr/share/nginx/html/health

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
