const Machine = require('../models/Machine');

/**
 * Get all machines/clients
 */
async function getAllMachines(req, res) {
  try {
    const machines = await Machine.getAllMachines();
    return res.status(200).json({ data: machines });
  } catch (error) {
    console.error('[Machine Error] Failed to get machines:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get a specific machine's policy
 */
async function getMachinePolicy(req, res) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Machine ID is required' });

    const policy = await Machine.getPolicy(id);
    return res.status(200).json({ data: policy || {} });
  } catch (error) {
    console.error('[Machine Error] Failed to get machine policy:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Update a machine's policy (Admin only)
 */
async function updateMachinePolicy(req, res) {
  try {
    const { id } = req.params;
    const policyData = req.body;

    if (!id || !policyData) {
      return res.status(400).json({ error: 'Machine ID and policy data are required' });
    }

    await Machine.updatePolicy(id, policyData);
    return res.status(200).json({ message: 'Policy updated successfully' });
  } catch (error) {
    console.error('[Machine Error] Failed to update policy:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getAllMachines,
  getMachinePolicy,
  updateMachinePolicy
};
