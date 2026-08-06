-- ════════════════════════════════════════════════════════════════
-- IOC Hunt — PostgreSQL Multi-Tenant Database Initialization
-- ════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'iochunt') THEN
    CREATE ROLE iochunt WITH LOGIN PASSWORD 'iochunt_password';
  END IF;
END
$$;

-- Create unified platform database
SELECT 'CREATE DATABASE iochunt_db OWNER iochunt'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'iochunt_db')\gexec

GRANT ALL PRIVILEGES ON DATABASE iochunt_db TO iochunt;

\c iochunt_db
GRANT ALL ON SCHEMA public TO iochunt;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO iochunt;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO iochunt;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO iochunt;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TYPES TO iochunt;
