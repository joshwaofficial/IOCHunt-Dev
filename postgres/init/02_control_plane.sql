-- ════════════════════════════════════════════════════════════════
-- IOC Hunt — Control Plane Schema (SaaS Multi-Tenant)
-- ════════════════════════════════════════════════════════════════
-- This schema lives in the CONTROL PLANE database (iochunt_control).
-- It is the single source of truth for all tenant metadata,
-- syslog port mappings, and audit logging.
-- ════════════════════════════════════════════════════════════════

-- ── Tenants Registry ────────────────────────────────────────────
-- Every company managed by the Super Admin gets a row here.
-- db_password_encrypted is AES-256-CBC encrypted, NOT plaintext.
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) UNIQUE NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    db_name VARCHAR(255) NOT NULL,
    db_user VARCHAR(255) NOT NULL,
    db_password_encrypted TEXT NOT NULL,
    db_host VARCHAR(255) DEFAULT 'db',
    db_port INTEGER DEFAULT 5432,
    syslog_port INTEGER,
    api_key_hash VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active',
    tier VARCHAR(50) DEFAULT 'standard',
    max_eps INTEGER DEFAULT 5000,
    central_url VARCHAR(255) DEFAULT '',
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
);

-- ── Syslog Port Mapping ─────────────────────────────────────────
-- Configurable mapping from UDP/TCP port to tenant.
-- The syslog receiver reads this table on startup.
CREATE TABLE IF NOT EXISTS syslog_port_map (
    port INTEGER PRIMARY KEY,
    tenant_id VARCHAR(64) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    protocol VARCHAR(10) DEFAULT 'udp',
    enabled BOOLEAN DEFAULT TRUE,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
);

-- ── Super Admin Users ───────────────────────────────────────────
-- (Moved from super-admin/backend/server.js inline SQL)
CREATE TABLE IF NOT EXISTS super_admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    force_password_change INTEGER DEFAULT 1,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
);

-- ── Super Admin Sessions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS super_sessions (
    token VARCHAR(128) PRIMARY KEY,
    admin_id INTEGER REFERENCES super_admins(id) ON DELETE CASCADE,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
    expires_at BIGINT NOT NULL
);

-- ── Unified Sessions (for tenant user logins) ──────────────────
-- All user sessions are stored centrally with a tenant_id reference.
CREATE TABLE IF NOT EXISTS sessions (
    token VARCHAR(128) PRIMARY KEY,
    user_id INTEGER NOT NULL,
    username VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    aggregator_name VARCHAR(255) DEFAULT NULL,
    display_name VARCHAR(255) DEFAULT NULL,
    force_password_change INTEGER DEFAULT 0,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
    expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ── MFA Pending (for tenant user MFA verification) ─────────────
CREATE TABLE IF NOT EXISTS mfa_pending (
    token VARCHAR(128) PRIMARY KEY,
    user_id INTEGER NOT NULL,
    username VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    expires_at BIGINT NOT NULL
);

-- ── Immutable Audit Log ─────────────────────────────────────────
-- Records security-sensitive actions across all tenants.
-- This table should be append-only in production (no UPDATE/DELETE by app role).
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64),
    user_id INTEGER,
    username VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(255),
    detail TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    result VARCHAR(20) DEFAULT 'SUCCESS',
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- ── Provisioning Role ───────────────────────────────────────────
-- Create a dedicated provisioning role that can create databases/roles
-- but is NOT the superuser. The Node.js API uses this for tenant creation.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'iochunt_provisioner') THEN
        CREATE ROLE iochunt_provisioner WITH LOGIN PASSWORD 'provision_change_me' CREATEDB CREATEROLE;
    END IF;
END
$$;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO iochunt_provisioner;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO iochunt_provisioner;
