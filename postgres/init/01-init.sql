-- ════════════════════════════════════════════════════════════
-- IOC Hunt — PostgreSQL Initialization
-- ════════════════════════════════════════════════════════════
-- This script runs automatically on first boot of the
-- PostgreSQL container. It creates the required databases
-- and the application user.
-- ════════════════════════════════════════════════════════════

-- Create the application user (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'iochunt') THEN
    CREATE ROLE iochunt WITH LOGIN PASSWORD 'CHANGE_ME';
  END IF;
END
$$;

-- Create databases
SELECT 'CREATE DATABASE iochunt_central OWNER iochunt'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'iochunt_central')\gexec

SELECT 'CREATE DATABASE iochunt_aggregator OWNER iochunt'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'iochunt_aggregator')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE iochunt_central TO iochunt;
GRANT ALL PRIVILEGES ON DATABASE iochunt_aggregator TO iochunt;

-- Connect to iochunt_central and grant schema access
\c iochunt_central
GRANT ALL ON SCHEMA public TO iochunt;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO iochunt;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO iochunt;

-- Connect to iochunt_aggregator and grant schema access
\c iochunt_aggregator
GRANT ALL ON SCHEMA public TO iochunt;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO iochunt;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO iochunt;
