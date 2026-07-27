# IOC Hunt — Backup & Restore Guide

## Automated Backup

### What Gets Backed Up

| Item | Location | Frequency |
|---|---|---|
| PostgreSQL (all databases) | `postgres/backups/db_*.sql.gz` | Daily |
| SSL Certificates | `postgres/backups/certs_*.tar.gz` | Daily |
| Environment Config | `postgres/backups/env_*.bak` | Daily |

### Setup Daily Cron

```bash
crontab -e

# Add: Run backup at 2 AM daily
0 2 * * * cd /opt/iochunt && ./scripts/backup.sh >> /var/log/iochunt-backup.log 2>&1
```

### Manual Backup

```bash
cd /opt/iochunt
./scripts/backup.sh
```

---

## Restore

### List Available Backups

```bash
ls -lh postgres/backups/
```

### Restore Database

```bash
./scripts/restore.sh postgres/backups/db_full_20260727_140000.sql.gz
```

### Restore Certificates

```bash
cd /opt/iochunt
tar xzf postgres/backups/certs_20260727_140000.tar.gz
docker compose restart nginx
```

### Restore Environment

```bash
cp postgres/backups/env_20260727_140000.bak .env
docker compose up -d
```

---

## Retention

Backups older than 30 days are automatically deleted by the backup script.

To change retention, edit `scripts/backup.sh` and modify the `-mtime +30` value.

---

## Disaster Recovery

If the entire server is lost:

1. Provision a new Debian server
2. Install Docker
3. Clone the repo: `git clone https://github.com/joshwaofficial/IOCHunt-Dev.git /opt/iochunt`
4. Copy backup files to `postgres/backups/`
5. Configure `.env`
6. Run `./scripts/deploy.sh`
7. Run `./scripts/restore.sh <latest-backup-file>`
8. Verify: `docker compose ps`
