const db = require('../config/db');
const axios = require('axios');
const https = require('https');
const { sendAssignmentEmail } = require('../utils/emailHelper');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function getCentralSettings() {
  const settingsRes = await db.query('SELECT central_server_url, central_api_key FROM settings LIMIT 1');
  if (settingsRes.rows.length === 0) return null;
  return settingsRes.rows[0];
}

async function getIncidents(req, res) {
  try {
    const settings = await getCentralSettings();
    if (!settings || !settings.central_server_url) return res.json({ total: 0, incidents: [] });

    const q = new URLSearchParams(req.query).toString();
    const url = `${settings.central_server_url}/api/ingest/incidents?${q}`;
    
    const centralRes = await axios.get(url, {
      headers: { 'x-aggregator-key': settings.central_api_key },
      httpsAgent
    });

    return res.status(200).json(centralRes.data);
  } catch (error) {
    console.error('[Incident Error] Proxy get incidents failed:', error.message);
    return res.status(500).json({ error: 'Failed to fetch from central server' });
  }
}

async function getIncidentSummary(req, res) {
  try {
    const settings = await getCentralSettings();
    if (!settings || !settings.central_server_url) {
      return res.json({ byStatus: [], byPriority: [], open: 0, p1Open: 0, recent: [] });
    }

    const url = `${settings.central_server_url}/api/ingest/incidents/summary`;
    
    const centralRes = await axios.get(url, {
      headers: { 'x-aggregator-key': settings.central_api_key },
      httpsAgent
    });

    return res.status(200).json(centralRes.data);
  } catch (error) {
    console.error('[Incident Error] Proxy get summary failed:', error.message);
    return res.status(500).json({ error: 'Failed to fetch from central server' });
  }
}

async function createIncident(req, res) {
  return res.status(403).json({ error: 'Aggregator dashboard is view-only.' });
}

async function getIncident(req, res) {
  try {
    const settings = await getCentralSettings();
    if (!settings || !settings.central_server_url) return res.status(404).json({ error: 'Not found' });

    const { id } = req.params;
    const url = `${settings.central_server_url}/api/ingest/incidents/${id}`;
    
    const centralRes = await axios.get(url, {
      headers: { 'x-aggregator-key': settings.central_api_key },
      httpsAgent
    });

    return res.status(200).json(centralRes.data);
  } catch (error) {
    console.error('[Incident Error] Proxy get incident failed:', error.message);
    return res.status(error.response?.status || 500).json({ error: 'Failed to fetch from central server' });
  }
}

async function updateIncident(req, res) {
  try {
    const { id } = req.params;
    const incRes = await db.query('SELECT * FROM incidents WHERE id=$1', [id]);
    const inc = incRes.rows[0];
    if (!inc) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (req.session.role !== 'ADMIN' && req.session.role !== 'L3_ANALYST' && inc.assigned_to !== req.session.username) {
      return res.status(403).json({ error: 'Forbidden: You are not assigned to this incident' });
    }

    const { title, description, status, priority, assigned_to, machine } = req.body;
    const updated_by = req.session && req.session.username ? req.session.username : 'dashboard';
    const changes = [];
    const auditLines = [];

    if (title !== undefined && title !== inc.title) { changes.push(['title', title]); auditLines.push(`Title changed.`); }
    if (description !== undefined && description !== inc.description) { changes.push(['description', description]); }
    if (priority !== undefined && priority !== inc.priority) { changes.push(['priority', priority]); auditLines.push(`Priority changed to ${priority}.`); }
    if (machine !== undefined && machine !== inc.machine) { changes.push(['machine', machine]); }
    if (assigned_to !== undefined && assigned_to !== inc.assigned_to) {
      changes.push(['assigned_to', assigned_to]);
      auditLines.push(assigned_to ? `Assigned to ${assigned_to}.` : `Assignment cleared.`);
      if (assigned_to) {
        const updatedInc = { ...inc, assigned_to, title: title || inc.title, description: description || inc.description, priority: priority || inc.priority, machine: machine || inc.machine };
        await sendAssignmentEmail(updatedInc, assigned_to);
      }
    }

    if (status !== undefined && status !== inc.status) {
      const validTransitions = {
        new: ['investigating', 'closed'],
        investigating: ['contained', 'resolved', 'closed'],
        contained: ['investigating', 'resolved', 'closed'],
        resolved: ['closed', 'investigating'],
        closed: ['investigating'],
      };
      if (!validTransitions[inc.status]?.includes(status)) {
        return res.status(400).json({ error: `Invalid transition: ${inc.status} → ${status}` });
      }
      changes.push(['status', status]);
      auditLines.push(`Status changed to ${status.toUpperCase()}.`);
      if (status === 'resolved') changes.push(['resolved_at', Math.floor(Date.now() / 1000)]);
      if (status === 'closed') changes.push(['closed_at', Math.floor(Date.now() / 1000)]);
    }

    if (changes.length) {
      changes.push(['updated_at', Math.floor(Date.now() / 1000)]);
      const sets = changes.map(([k], i) => `${k}=$${i + 1}`).join(',');
      const vals = changes.map(([, v]) => v);
      await db.query(`UPDATE incidents SET ${sets} WHERE id=$${vals.length + 1}`, [...vals, inc.id]);
    }

    if (auditLines.length) {
      await db.query('INSERT INTO incident_notes (incident_id, author, body, note_type) VALUES ($1,$2,$3,$4)',
        [inc.id, updated_by, auditLines.join(' '), 'system']);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Incident Error] Failed to update incident:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function addNote(req, res) {
  try {
    const { id } = req.params;
    const { body, note_type = 'comment' } = req.body;
    const author = req.session && req.session.username ? req.session.username : 'dashboard';
    if (!body) return res.status(400).json({ error: 'body required' });

    const incRes = await db.query('SELECT * FROM incidents WHERE id=$1', [id]);
    const inc = incRes.rows[0];
    if (!inc) return res.status(404).json({ error: 'Not found' });

    if (req.session.role !== 'ADMIN' && req.session.role !== 'L3_ANALYST' && inc.assigned_to !== req.session.username) {
      return res.status(403).json({ error: 'Forbidden: You are not assigned to this incident' });
    }

    await db.query('INSERT INTO incident_notes (incident_id, author, body, note_type) VALUES ($1,$2,$3,$4)', [inc.id, author, body, note_type]);
    await db.query('UPDATE incidents SET updated_at=$1 WHERE id=$2', [Math.floor(Date.now() / 1000), inc.id]);

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('[Incident Error] Failed to add note:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function linkEvents(req, res) {
  try {
    const { id } = req.params;
    const { event_ids = [] } = req.body;
    const linked_by = req.session && req.session.username ? req.session.username : 'dashboard';
    if (!event_ids.length) return res.status(400).json({ error: 'event_ids required' });

    const incRes = await db.query('SELECT * FROM incidents WHERE id=$1', [id]);
    const inc = incRes.rows[0];
    if (!inc) return res.status(404).json({ error: 'Not found' });

    if (req.session.role !== 'ADMIN' && req.session.role !== 'L3_ANALYST' && inc.assigned_to !== req.session.username) {
      return res.status(403).json({ error: 'Forbidden: You are not assigned to this incident' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (const eid of event_ids) {
        await client.query('INSERT INTO incident_events (incident_id, event_id, linked_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [inc.id, eid, linked_by]);
      }
      await client.query('UPDATE incidents SET updated_at=$1 WHERE id=$2', [Math.floor(Date.now() / 1000), inc.id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return res.status(200).json({ ok: true, linked: event_ids.length });
  } catch (error) {
    console.error('[Incident Error] Failed to link events:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteIncident(req, res) {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM incidents WHERE id=$1', [id]);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Incident Error] Failed to delete incident:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function assignIncident(req, res) {
  try {
    const { id } = req.params;
    const { assignee } = req.body;

    const incRes = await db.query('SELECT * FROM incidents WHERE id=$1', [id]);
    const inc = incRes.rows[0];
    if (!inc) return res.status(404).json({ error: 'Not found' });

    const User = require('../models/User');
    const targetUser = await User.findByUsername(assignee);
    if (!targetUser) return res.status(404).json({ error: 'Target user not found' });

    const callerRole = req.session.role;
    const targetRole = targetUser.role;

    let allowed = false;
    if (callerRole === 'ADMIN') allowed = true;
    else if (callerRole === 'L3_ANALYST' && ['L2_ANALYST', 'L3_ANALYST'].includes(targetRole)) allowed = true;
    else if (callerRole === 'L2_ANALYST' && ['L2_ANALYST', 'L3_ANALYST'].includes(targetRole)) allowed = true;
    else if (callerRole === 'L1_ANALYST' && targetRole === 'L2_ANALYST') allowed = true;

    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: Assignment not allowed' });
    }

    const updated_by = req.session.username;

    await db.query('UPDATE incidents SET assigned_to=$1, updated_at=$2 WHERE id=$3',
      [assignee, Math.floor(Date.now() / 1000), id]);

    let noteBody = `Assigned to ${assignee} by ${updated_by}`;
    if (callerRole === 'L2_ANALYST' && targetRole === 'L3_ANALYST') {
      noteBody = `Escalated to L3 - assigned to ${assignee} by ${updated_by}`;
    }

    await db.query('INSERT INTO incident_notes (incident_id, author, body, note_type) VALUES ($1,$2,$3,$4)',
      [id, updated_by, noteBody, 'system']);

    const updatedIncRes = await db.query('SELECT * FROM incidents WHERE id=$1', [id]);
    const updatedInc = updatedIncRes.rows[0];
    const { sendAssignmentEmail } = require('../utils/emailHelper');
    await sendAssignmentEmail(updatedInc, assignee);

    return res.status(200).json({ ok: true, incident: updatedInc });
  } catch (error) {
    console.error('[Incident Error] Failed to assign incident:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getIncidents,
  getIncidentSummary,
  createIncident,
  getIncident,
  updateIncident,
  addNote,
  linkEvents,
  deleteIncident,
  assignIncident
};
