CREATE TABLE IF NOT EXISTS fw_sources (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    log_path TEXT UNIQUE NOT NULL,
    enabled INTEGER DEFAULT 1,
    created BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
    last_read BIGINT DEFAULT 0,
    last_size BIGINT DEFAULT 0,
    lines_ingested BIGINT DEFAULT 0,
    source_timezone TEXT DEFAULT 'UTC'
);

CREATE TABLE IF NOT EXISTS email_schedules (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    recipients TEXT NOT NULL DEFAULT '',
    cron_expr TEXT NOT NULL DEFAULT '0 8 * * 1',
    duration INTEGER DEFAULT 24,
    machine TEXT DEFAULT '',
    severity TEXT DEFAULT '',
    category TEXT DEFAULT '',
    include_fw INTEGER DEFAULT 1,
    enabled INTEGER DEFAULT 1,
    last_run BIGINT,
    last_status TEXT DEFAULT '',
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    email TEXT DEFAULT '',
    force_password_change INTEGER DEFAULT 0,
    mfa_secret TEXT,
    mfa_enabled INTEGER DEFAULT 0,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
    last_login BIGINT
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER,
    username TEXT,
    role TEXT,
    created_at BIGINT,
    expires_at BIGINT
);

CREATE TABLE IF NOT EXISTS smtp_config (
    id INTEGER PRIMARY KEY,
    host TEXT DEFAULT '',
    port INTEGER DEFAULT 587,
    secure INTEGER DEFAULT 0,
    username TEXT DEFAULT '',
    password TEXT DEFAULT '',
    from_addr TEXT DEFAULT '',
    from_name TEXT DEFAULT 'IOC Hunt',
    enabled INTEGER DEFAULT 0
);

INSERT INTO smtp_config(id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
