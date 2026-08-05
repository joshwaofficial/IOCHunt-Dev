const { getAggregatorPool } = require('../config/aggregatorDbManager');
const db = require('../config/db');

function getDb(aggregator) {
  if (aggregator && aggregator !== 'All Aggregators' && aggregator !== 'All Branches' && aggregator !== 'default' && aggregator !== 'direct') {
    try {
      return getAggregatorPool(aggregator);
    } catch(e) {
      return db.pool;
    }
  }
  return db.pool;
}

class Machine {
  /**
   * Fetch all machines (clients)
   */
  static async getAllMachines(aggregator = '') {
    let query = `
      SELECT m.*, p.policy_json, p.updated_at as policy_updated_at 
      FROM machines m
      LEFT JOIN policies p ON m.name = p.machine
    `;
    const params = [];
    if (aggregator && aggregator !== 'All Aggregators' && aggregator !== 'all' && aggregator !== '') {
      query += ' WHERE m.aggregator_name = $1';
      params.push(aggregator);
    }
    query += ' ORDER BY m.last_seen DESC';
    const pool = getDb(aggregator);
    const res = await pool.query(query, params);
    return res.rows;
  }

  /**
   * Fetch specific machine by ID
   */
  static async getMachineById(id, aggregator = '') {
    let query = `
      SELECT m.*, p.policy_json, p.updated_at as policy_updated_at 
      FROM machines m
      LEFT JOIN policies p ON m.name = p.machine
      WHERE m.name = $1
    `;
    const params = [id];
    if (aggregator && aggregator !== 'All Aggregators' && aggregator !== 'all' && aggregator !== '') {
      query += ' AND m.aggregator_name = $2';
      params.push(aggregator);
    }
    const pool = getDb(aggregator);
    const res = await pool.query(query, params);
    return res.rows[0];
  }

  /**
   * Get policy for a machine
   */
  static async getPolicy(machineId, aggregator = '') {
    const pool = getDb(aggregator);
    const res = await pool.query(`SELECT * FROM policies WHERE machine = $1`, [machineId]);
    return res.rows[0];
  }

  /**
   * Update or create a policy for a machine
   */
  static async updatePolicy(machineId, policyJson, aggregator = '') {
    const now = Math.floor(Date.now() / 1000);
    const pool = getDb(aggregator);
    await pool.query(`
      INSERT INTO policies (machine, policy_json, updated_at) 
      VALUES ($1, $2, $3)
      ON CONFLICT(machine) DO UPDATE SET 
      policy_json = excluded.policy_json,
      updated_at = excluded.updated_at
    `, [machineId, JSON.stringify(policyJson), now]);
  }
}

module.exports = Machine;
