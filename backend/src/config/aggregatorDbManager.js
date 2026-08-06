// ════════════════════════════════════════════════════════════════
// IOC Hunt — Aggregator Separate Database Connection Manager
// ════════════════════════════════════════════════════════════════
// Manages distinct PostgreSQL databases for each branch aggregator.
// Supports dynamic database creation, table provisioning, and pool caching.
// ════════════════════════════════════════════════════════════════

const { Pool } = require('pg');
const { getTableSchemaSQL } = require('./db');

// Cache active connection pools per aggregator name
const aggregatorPools = new Map();

/**
 * Derives database configuration from base environment or custom overrides
 */
function getDbConnectionConfig(databaseName) {
  let dbUrlHost = 'localhost';
  let dbUrlPort = 5433;
  let dbUrlUser = 'postgres';
  let dbUrlPassword = 'iochunt_password';

  if (process.env.DATABASE_URL) {
    try {
      const parsedUrl = new URL(process.env.DATABASE_URL);
      dbUrlHost = parsedUrl.hostname || dbUrlHost;
      dbUrlPort = parseInt(parsedUrl.port, 10) || dbUrlPort;
      dbUrlUser = decodeURIComponent(parsedUrl.username) || dbUrlUser;
      dbUrlPassword = decodeURIComponent(parsedUrl.password) || dbUrlPassword;
    } catch (e) {
      // Ignore URL parse errors
    }
  }

  const host = process.env.AGG_DB_HOST || process.env.DB_HOST || dbUrlHost;
  const port = parseInt(process.env.AGG_DB_PORT || process.env.POSTGRES_PORT || process.env.DB_PORT || dbUrlPort, 10);
  const user = process.env.AGG_DB_USER || process.env.POSTGRES_USER || process.env.DB_USER || dbUrlUser;
  const password = process.env.AGG_DB_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || dbUrlPassword;

  return {
    host,
    port,
    user,
    password,
    database: databaseName,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  };
}

/**
 * Creates a brand-new PostgreSQL database on the database server for an aggregator
 */
async function createAggregatorDatabase(aggregatorName) {
  const safeName = aggregatorName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  const dbName = `iochunt_agg_${safeName}`;

  // Connect to the default maintenance database 'postgres' to execute CREATE DATABASE
  const adminPool = new Pool(getDbConnectionConfig('postgres'));
  const client = await adminPool.connect();

  try {
    const checkDb = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (checkDb.rows.length === 0) {
      console.log(`[AggregatorDB] Provisioning new PostgreSQL database: ${dbName}...`);
      await client.query(`CREATE DATABASE ${dbName};`);
      console.log(`[AggregatorDB] Database ${dbName} created successfully.`);
    } else {
      console.log(`[AggregatorDB] Database ${dbName} already exists.`);
    }
  } finally {
    client.release();
    await adminPool.end();
  }

  // Initialize schema/tables in the new database
  const newDbPool = new Pool(getDbConnectionConfig(dbName));
  const newClient = await newDbPool.connect();
  try {
    await newClient.query(getTableSchemaSQL());
    await newClient.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS aggregator_name VARCHAR(255) DEFAULT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change INTEGER DEFAULT 1;
    `);
    // Mark instance mode in the newly created database as 'aggregator'
    await newClient.query(`
      UPDATE instance_config 
      SET instance_mode = 'aggregator', instance_name = $1, setup_complete = TRUE 
      WHERE id = 1
    `, [`Aggregator Node (${aggregatorName})`]);
    console.log(`[AggregatorDB] Security tables initialized in ${dbName}.`);
  } finally {
    newClient.release();
    await newDbPool.end();
  }

  return {
    databaseName: dbName,
    host: getDbConnectionConfig(dbName).host,
    port: getDbConnectionConfig(dbName).port,
    user: getDbConnectionConfig(dbName).user
  };
}

/**
 * Returns a cached connection pool for a specific aggregator database
 */
function getAggregatorPool(aggregatorName) {
  const safeName = aggregatorName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  const dbName = `iochunt_agg_${safeName}`;

  if (aggregatorPools.has(safeName)) {
    return aggregatorPools.get(safeName);
  }

  const rawPool = new Pool(getDbConnectionConfig(dbName));
  rawPool.on('error', (err) => {
    if (err.code !== '3D000') {
      console.error(`[AggregatorDB:${dbName}] Idle client error:`, err.message);
    }
  });

  const poolProxy = new Proxy(rawPool, {
    get(target, prop, receiver) {
      if (prop === 'query') {
        return async function(...args) {
          try {
            return await target.query(...args);
          } catch (err) {
            if (err.code === '3D000') {
              // Database does not exist - remove from cache and fallback to central db.pool
              aggregatorPools.delete(safeName);
              const mainDb = require('./db');
              return await mainDb.pool.query(...args);
            }
            throw err;
          }
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });

  aggregatorPools.set(safeName, poolProxy);
  return poolProxy;
}

/**
 * Execute a query against a specific aggregator's separate database
 */
async function queryAggregator(aggregatorName, text, params = []) {
  const pool = getAggregatorPool(aggregatorName);
  return pool.query(text, params);
}

/**
 * Closes and removes an aggregator's cached connection pool
 */
async function closeAggregatorPool(aggregatorName) {
  const safeName = aggregatorName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  if (aggregatorPools.has(safeName)) {
    const pool = aggregatorPools.get(safeName);
    aggregatorPools.delete(safeName);
    await pool.end();
  }
}
/**
 * List all databases currently provisioned in PostgreSQL
 */
async function listDatabases() {
  const adminPool = new Pool(getDbConnectionConfig('postgres'));
  const client = await adminPool.connect();
  try {
    const res = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
    return res.rows.map(r => r.datname);
  } finally {
    client.release();
    await adminPool.end();
  }
}

/**
 * Resolves the appropriate database pool for a request:
 * - If request has an aggregator context (e.g. AGGREGATOR_ADMIN session, tenant query, or aggregator instance mode): routes to dedicated aggregator database (iochunt_agg_<name>)
 * - Otherwise: routes to Central Server database (iochunt_db)
 */
function getDbForRequest(req) {
  const aggName = req?.session?.aggregator_name 
    || req?.user?.aggregator_name 
    || (process.env.INSTANCE_MODE === 'aggregator' ? (process.env.AGGREGATOR_NAME || process.env.TENANT_ID) : null);

  if (aggName && aggName !== 'default' && aggName !== 'direct') {
    return getAggregatorPool(aggName);
  }
  return require('./db').pool;
}

async function queryContext(req, text, params = []) {
  const pool = getDbForRequest(req);
  return pool.query(text, params);
}

module.exports = {
  createAggregatorDatabase,
  getAggregatorPool,
  queryAggregator,
  closeAggregatorPool,
  listDatabases,
  getDbConnectionConfig,
  getDbForRequest,
  queryContext
};
