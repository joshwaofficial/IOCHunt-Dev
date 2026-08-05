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
      cachedConfig = {
        mode: row.instance_mode || envMode || MODES.UNCONFIGURED,
        deploymentMode: row.deployment_mode || envDeployment || DEPLOYMENT_MODES.ONPREM,
        companyId: envCompanyId || row.company_id || '',
        companyName: envCompanyName || row.company_name || '',
        instanceName: row.instance_name || envName,
        setupComplete: dbSetupComplete,
        source: 'database'
      };
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
