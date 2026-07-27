const crypto = require('crypto');
const db = require('../config/db');

// Helper to hash
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');

const generateCode = async (req, res) => {
  try {
    const { aggregator_name } = req.body;
    if (!aggregator_name) return res.status(400).json({ error: 'aggregator_name required' });

    // Generate pairing code (short, human-readable)
    const pairingCode = 'PAIR-' + crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g).join('-');
    
    // Generate actual API key (long)
    const apiKey = 'agg_' + crypto.randomBytes(32).toString('hex');
    
    // Expires in 24h
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    const query = `
      INSERT INTO aggregators (name, api_key_hash, pairing_code_hash, pairing_expires, status)
      VALUES ($1, $2, $3, $4, 'pending')
      ON CONFLICT (name) DO UPDATE SET 
        api_key_hash = EXCLUDED.api_key_hash,
        pairing_code_hash = EXCLUDED.pairing_code_hash,
        pairing_expires = EXCLUDED.pairing_expires,
        status = 'pending'
    `;
    
    await db.query(query, [
      aggregator_name,
      hash(apiKey),
      hash(pairingCode),
      expires
    ]);

    // Return the pairing code to the UI (but not the API key)
    res.json({
      success: true,
      aggregator_name,
      pairing_code: pairingCode,
      expires_at: expires
    });
  } catch (error) {
    console.error('[Generate Code Error]', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const pair = async (req, res) => {
  try {
    const { pairing_code } = req.body;
    if (!pairing_code) return res.status(400).json({ error: 'pairing_code required' });

    const codeHash = hash(pairing_code);

    const result = await db.query(
      'SELECT * FROM aggregators WHERE pairing_code_hash = $1 AND status = $2',
      [codeHash, 'pending']
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired pairing code' });
    }

    const aggregator = result.rows[0];

    // Check expiration
    if (new Date() > new Date(aggregator.pairing_expires)) {
      return res.status(400).json({ error: 'Pairing code expired' });
    }

    // Since we only stored the hash of the api key in DB, we need to generate a new one, store its hash, and return it.
    // Wait, in my design (from user prompt):
    // "Central Server generates API key, stores hash, but NEVER shows to anyone"
    // So the central server MUST give the API key during the /pair call!
    // But if we generated the API key in generateCode and only stored the hash, we don't know the plain API key now!
    // Correct approach: We generate the REAL API key inside /pair, OR we generate it here and save the plain one in memory/redis temporarily?
    // Actually, in the user's flow:
    // 1. Generate code (UI gets PAIR-xxx).
    // 2. /pair receives PAIR-xxx, validates, then generates API key, hashes it, saves in DB, and returns it to Aggregator.
    // Let's do that instead to avoid storing plaintext API key.
    
    const apiKey = 'agg_' + crypto.randomBytes(32).toString('hex');

    await db.query(`
      UPDATE aggregators 
      SET status = 'active', 
          api_key_hash = $1, 
          pairing_code_hash = NULL 
      WHERE id = $2
    `, [hash(apiKey), aggregator.id]);

    res.json({
      status: 'paired',
      api_key: apiKey,
      aggregator_name: aggregator.name
    });
  } catch (error) {
    console.error('[Pairing Error]', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAggregators = async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, status, last_sync, agent_count FROM aggregators ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteAggregator = async (req, res) => {
  try {
    await db.query('DELETE FROM aggregators WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  generateCode,
  pair,
  getAggregators,
  deleteAggregator
};
