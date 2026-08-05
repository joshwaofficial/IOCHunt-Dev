// ════════════════════════════════════════════════════════════════
// IOC Hunt — Database Context & Query Router Middleware
// ════════════════════════════════════════════════════════════════
// Attaches database context and aggregator query helpers to requests
// ════════════════════════════════════════════════════════════════

const db = require('../config/db');
const aggregatorDbManager = require('../config/aggregatorDbManager');
const { isCentralServer } = require('../config/appMode');

/**
 * Attaches convenient query execution helpers to the express request object
 */
function databaseContext(req, res, next) {
  // Standard query executing on the main/local database
  req.queryDb = (text, params = []) => {
    return db.query(text, params);
  };

  // Helper for Central Server to query a specific branch aggregator's separate database
  req.queryAggregator = (aggregatorName, text, params = []) => {
    if (!isCentralServer()) {
      throw new Error('Direct aggregator database querying is only permitted in Central Server mode');
    }
    return aggregatorDbManager.queryAggregator(aggregatorName, text, params);
  };

  // If request is from an authenticated aggregator
  if (req.aggregator && req.aggregator.name) {
    req.aggregatorName = req.aggregator.name;
  }

  next();
}

module.exports = {
  databaseContext,
  tenantContext: databaseContext // Alias for backwards compatibility
};
