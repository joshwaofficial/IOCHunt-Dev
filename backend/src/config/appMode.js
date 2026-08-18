// ════════════════════════════════════════════════════════════════
// IOC Hunt — Application Mode & Instance Configuration
// ════════════════════════════════════════════════════════════════
// Manages:
// 1. Instance mode: 'central_server' | 'aggregator' | 'unconfigured'
// 2. Deployment mode: 'onprem' | 'cloud'
// 3. Company & Instance naming metadata
// ════════════════════════════════════════════════════════════════

let cachedConfig = null;

const MODES = {
  CENTRAL: 'central_server',
  AGGREGATOR: 'aggregator',
  UNCONFIGURED: 'unconfigured'
};

const DEPLOYMENT_MODES = {
  ONPREM: 'onprem',
  CLOUD: 'cloud'
};

function normalizeMode(modeStr) {
  if (!modeStr) return null;
  const m = modeStr.toString().trim().toLowerCase();
  if (m === 'central' || m === 'central_server' || m === 'cs') return MODES.CENTRAL;
  if (m === 'aggregator' || m === 'agg' || m === 'branch') return MODES.AGGREGATOR;
  return null;
}

/**
 * Initializes and loads the instance configuration from database or env.
 * Env variables take priority over database settings.
 */
async function loadInstanceConfig(db) {
  const envMode = normalizeMode(process.env.INSTANCE_MODE || process.env.APP_MODE);
  const envDeployment = (process.env.DEPLOYMENT_MODE || 'onprem').toLowerCase();
  const envName = process.env.INSTANCE_NAME || (envMode === MODES.CENTRAL ? 'IOC Hunt Central Command Hub' : 'Branch Aggregator');
  const envCompanyId = process.env.COMPANY_ID || '';
  const envCompanyName = process.env.COMPANY_NAME || '';

  try {
    const res = await db.query('SELECT * FROM instance_config WHERE id = 1 LIMIT 1');
    const userRes = await db.query('SELECT COUNT(*) as count FROM users');
    const hasUsers = parseInt(userRes.rows[0]?.count || '0', 10) > 0;

    if (res.rows.length > 0) {
      const row = res.rows[0];
      const dbSetupComplete = (row.setup_complete === true || row.setup_complete === 1) && hasUsers;
      
      // Environment variables should always override stale database state for instances running via docker-compose with hardcoded roles
      const resolvedMode = envMode || row.instance_mode || MODES.UNCONFIGURED;
      
      cachedConfig = {
        mode: resolvedMode,
        deploymentMode: envDeployment || row.deployment_mode || DEPLOYMENT_MODES.ONPREM,
        companyId: envCompanyId || row.company_id || '',
        companyName: envCompanyName || row.company_name || '',
        instanceName: envName || row.instance_name,
        setupComplete: dbSetupComplete || !!envMode,
        source: envMode ? 'environment_override' : 'database'
      };
      
      // If the DB has stale data, update it async
      if (row.instance_mode !== resolvedMode) {
        db.query('UPDATE instance_config SET instance_mode = $1 WHERE id = 1', [resolvedMode]).catch(() => {});
      }
      
      return cachedConfig;
    }
  } catch (err) {
    // If DB is not ready yet, fallback
  }

  if (envMode) {
    cachedConfig = {
      mode: envMode,
      deploymentMode: envDeployment,
      companyId: envCompanyId,
      companyName: envCompanyName,
      instanceName: envName,
      setupComplete: true,
      source: 'environment'
    };
  } else {
    cachedConfig = {
      mode: MODES.UNCONFIGURED,
      deploymentMode: envDeployment,
      companyId: envCompanyId,
      companyName: envCompanyName,
      instanceName: 'IOC Hunt Security Platform',
      setupComplete: false,
      source: 'unconfigured'
    };
  }

  return cachedConfig;
}

function getConfig() {
  if (!cachedConfig) {
    const envMode = normalizeMode(process.env.INSTANCE_MODE || process.env.APP_MODE);
    const envDeployment = (process.env.DEPLOYMENT_MODE || 'onprem').toLowerCase();
    const envName = process.env.INSTANCE_NAME || (envMode === MODES.CENTRAL ? 'IOC Hunt Central Command Hub' : 'Branch Aggregator');
    return {
      mode: envMode || MODES.UNCONFIGURED,
      deploymentMode: envDeployment,
      companyId: process.env.COMPANY_ID || '',
      companyName: process.env.COMPANY_NAME || '',
      instanceName: envName,
      setupComplete: !!envMode,
      source: envMode ? 'environment' : 'unconfigured'
    };
  }
  return cachedConfig;
}

function setConfig(newConfig) {
  cachedConfig = {
    ...cachedConfig,
    ...newConfig,
    mode: normalizeMode(newConfig.mode) || newConfig.mode
  };
}

module.exports = {
  MODES,
  DEPLOYMENT_MODES,
  loadInstanceConfig,
  getConfig,
  setConfig,
  normalizeMode,
  isAggregator: () => (getConfig().mode === MODES.AGGREGATOR),
  isCentralServer: () => (getConfig().mode === MODES.CENTRAL),
  isConfigured: () => (getConfig().setupComplete && getConfig().mode !== MODES.UNCONFIGURED),
  isCloud: () => (getConfig().deploymentMode === DEPLOYMENT_MODES.CLOUD),
  isOnPrem: () => (getConfig().deploymentMode === DEPLOYMENT_MODES.ONPREM)
};
