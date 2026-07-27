const db = require('../config/db');

class Machine {
  /**
   * Fetch all machines (clients)
   */
  static async getAllMachines() {
    const res = await db.query(`
      SELECT m.*, p.policy_json, p.updated_at as policy_updated_at 
      FROM machines m
      LEFT JOIN policies p ON m.id = p.machine
      ORDER BY m.last_seen DESC
    `);
    return res.rows;
  }

  /**
   * Fetch specific machine by ID
   */
  static async getMachineById(id) {
    const res = await db.query(`
      SELECT m.*, p.policy_json, p.updated_at as policy_updated_at 
      FROM machines m
      LEFT JOIN policies p ON m.id = p.machine
      WHERE m.id = $1
    `, [id]);
    return res.rows[0];
  }

  /**
   * Get policy for a machine
   */
  static async getPolicy(machineId) {
    const res = await db.query(`SELECT * FROM policies WHERE machine = $1`, [machineId]);
    return res.rows[0];
  }

  /**
   * Update or create a policy for a machine
   */
  static async updatePolicy(machineId, policyJson) {
    const now = Math.floor(Date.now() / 1000);
    await db.query(`
      INSERT INTO policies (machine, policy_json, updated_at) 
      VALUES ($1, $2, $3)
      ON CONFLICT(machine) DO UPDATE SET 
        policy_json = excluded.policy_json,
        updated_at = excluded.updated_at
    `, [machineId, JSON.stringify(policyJson), now]);
  }
}

module.exports = Machine;
