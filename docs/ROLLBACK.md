# IOC Hunt — Rollback Guide

## Quick Rollback

```bash
cd /opt/iochunt
./scripts/rollback.sh
```

This rolls back to the previous commit.

## Rollback to Specific Version

```bash
# Rollback to a specific commit
./scripts/rollback.sh abc123def

# Rollback to a tagged version
./scripts/rollback.sh v1.0.0
```

## Undo a Rollback

The rollback script prints the previous commit hash. Use it to undo:

```bash
./scripts/rollback.sh <previous-commit-hash>
```

## Manual Rollback

```bash
cd /opt/iochunt

# Check git log for the commit you want
git log --oneline -10

# Checkout that commit
git checkout <commit-hash> -- .

# Rebuild and restart
docker compose build
docker compose up -d
```
