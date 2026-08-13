class Machine {
  /**
   * Fetch all machines (clients)
   */
  static async getAllMachines(queryFn) {
    let query = `
      SELECT m.*, p.policy_json, p.updated_at as policy_updated_at 
      FROM machines m
      LEFT JOIN policies p ON m.name = p.machine
      ORDER BY m.last_seen DESC
    `;
    const res = await queryFn(query);
    return res.rows;
  }

  /**
   * Fetch specific machine by ID
   */
  static async getMachineById(queryFn, id) {
    let query = `
      SELECT m.*, p.policy_json, p.updated_at as policy_updated_at 
      FROM machines m
      LEFT JOIN policies p ON m.name = p.machine
      WHERE m.name = $1
    `;
    const res = await queryFn(query, [id]);
    return res.rows[0];
  }

  /**
   * Get policy for a machine
   */
  static async getPolicy(queryFn, machineId) {
    const res = await queryFn(`SELECT * FROM policies WHERE machine = $1`, [machineId]);
    return res.rows[0];
  }

  /**
   * Update or create a policy for a machine
   */
  static async updatePolicy(queryFn, machineId, policyJson) {
    const now = Math.floor(Date.now() / 1000);
    await queryFn(`
      INSERT INTO policies (machine, policy_json, updated_at) 
      VALUES ($1, $2, $3)
      ON CONFLICT(machine) DO UPDATE SET 
      policy_json = excluded.policy_json,
      updated_at = excluded.updated_at
    `, [machineId, JSON.stringify(policyJson), now]);
  }
}

module.exports = Machine;
