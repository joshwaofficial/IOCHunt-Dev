# IOC Hunt — Deployment Guide

## First-Time Server Setup

### 1. Install Docker on Debian

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Start Docker
systemctl enable docker
systemctl start docker

# Verify
docker --version
docker compose version
```

### 2. Clone Repository

```bash
cd /opt
git clone https://github.com/joshwaofficial/IOCHunt-Dev.git iochunt
cd iochunt
```

### 3. Configure Environment

```bash
cp .env.example .env
nano .env
```

**Required changes:**
- `POSTGRES_PASSWORD` — Set a strong password
- `CENTRAL_ENCRYPTION_KEY` — Run `openssl rand -hex 32`
- `CENTRAL_API_KEY` — Run `openssl rand -hex 32`
- `AGGREGATOR_ENCRYPTION_KEY` — Run `openssl rand -hex 32`
- `AGGREGATOR_API_KEY` — Run `openssl rand -hex 32`

### 4. Generate SSL Certificates

```bash
./scripts/generate-certs.sh
```

Save the fingerprint — you'll need it for agent configuration.

### 5. Deploy

```bash
./scripts/deploy.sh
```

### 6. Verify

```bash
# Check all services are running
docker compose ps

# Check logs
docker compose logs -f

# Test endpoints
curl -k https://localhost:9443/api/ping
```

### 7. Access Dashboard

Open `https://72.62.241.39:9443` in your browser.

Login: `admin` / `admin`

**Change the admin password immediately.**

---

## Updating the Deployment

```bash
cd /opt/iochunt
./scripts/deploy.sh
```

This automatically:
1. Pulls latest code from GitHub
2. Builds new Docker images
3. Restarts services
4. Cleans up old images

---

## Daily Backup (Cron)

```bash
# Add to crontab
crontab -e

# Add this line (runs at 2 AM daily)
0 2 * * * cd /opt/iochunt && ./scripts/backup.sh >> /var/log/iochunt-backup.log 2>&1
```

---

## Ports

| Port | Service | Exposed? |
|---|---|---|
| 9090 | Nginx HTTP | Yes |
| 9443 | Nginx HTTPS | Yes |
| 5520/udp | Syslog | Yes |
| 4001 | Central Backend | Internal only |
| 4011 | Aggregator Backend | Internal only |
| 5432 | PostgreSQL | Internal only |

---

## Firewall Rules

```bash
# Allow new IOC Hunt ports
ufw allow 9090/tcp
ufw allow 9443/tcp
ufw allow 5520/udp
```
