# IOC Hunt — Version Upgrade Guide

## Versioning

IOC Hunt uses semantic versioning: `MAJOR.MINOR.PATCH`

| Version | Meaning |
|---|---|
| 1.0.0 → 1.0.1 | Bug fix — safe to upgrade |
| 1.0.0 → 1.1.0 | New feature — safe to upgrade |
| 1.0.0 → 2.0.0 | Breaking change — read release notes |

## Upgrade Procedure

### 1. Backup First

```bash
cd /opt/iochunt
./scripts/backup.sh
```

### 2. Update VERSION File

Edit `VERSION` in the repo with the new version number before pushing.

### 3. Deploy

```bash
./scripts/deploy.sh
```

### 4. Verify

```bash
docker compose ps
curl -k https://localhost:9443/api/ping
```

## If Something Goes Wrong

```bash
./scripts/rollback.sh
```

## Database Migrations

If a new version requires schema changes, they are handled automatically by the `initDB()` function using `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN IF NOT EXISTS`. No manual SQL is needed.

For breaking schema changes, migration scripts will be provided in the release notes.
