# ════════════════════════════════════════════
# IOC Hunt — Aggregator Frontend Dockerfile
# Multi-stage build: Node → Nginx
# ════════════════════════════════════════════

# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

# ────────────────────────────────────────────
# Stage 2: Serve with Nginx
# ────────────────────────────────────────────
FROM nginx:alpine AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html

# Add health check endpoint
RUN echo "OK" > /usr/share/nginx/html/health

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
