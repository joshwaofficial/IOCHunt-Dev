const { sendAssignmentEmail } = require('../utils/emailHelper');
async function getIncidents(req, res) {
  try {

    const { status, priority, assigned_to, limit = 100, offset = 0 } = req.query;
    const conds = [];
    const p = [];
    
    let paramIndex = 1;
    
    if (status) { conds.push(`status=$${paramIndex++}`); p.push(status); }
    if (priority) { conds.push(`priority=$${paramIndex++}`); p.push(priority); }
    if (assigned_to) { conds.push(`assigned_to=$${paramIndex++}`); p.push(assigned_to); }
    
    if (req.session && req.session.role !== 'ADMIN' && req.session.role !== 'L3_ANALYST') {
      const username = req.session.username;
      conds.push(`(assigned_to = $${paramIndex} OR assigned_to IS NULL OR assigned_to = '' OR created_by = $${paramIndex+1} OR id IN (SELECT incident_id FROM incident_notes WHERE author = $${paramIndex+2}))`);
      p.push(username, username, username);
      paramIndex += 3;
    }
    
    const w = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const totalRes = await req.queryTenant(`SELECT COUNT(*) AS n FROM incidents ${w}`, p);
    const total = parseInt(totalRes.rows[0].n, 10);

    const rowsRes = await req.queryTenant(`
      SELECT i.*,
        (SELECT COUNT(*) FROM incident_notes WHERE incident_id=i.id) AS note_count,
        (SELECT COUNT(*) FROM incident_events WHERE incident_id=i.id) AS event_count
      FROM incidents i ${w}
      ORDER BY i.updated_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex+1}
    `, [...p, Number(limit), Number(offset)]);
    
    return res.status(200).json({ total, incidents: rowsRes.rows });
  } catch (error) {
    console.error('[Incident Error] Failed to get incidents:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getIncidentSummary(req, res) {
  try {

    const conds = [];
    const params = [];
    let paramIndex = 1;
    
    if (req.session && req.session.role !== 'ADMIN' && req.session.role !== 'L3_ANALYST') {
      const username = req.session.username;
      conds.push(`(assigned_to = $${paramIndex} OR assigned_to IS NULL OR assigned_to = '' OR created_by = $${paramIndex+1} OR id IN (SELECT incident_id FROM incident_notes WHERE author = $${paramIndex+2}))`);
      params.push(username, username, username);
      paramIndex += 3;
    }

    let whereBase = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const byStatusQ = `SELECT status, COUNT(*) AS n FROM incidents ${whereBase} GROUP BY status`;
    const byStatus = await req.queryTenant(byStatusQ, params);

    const whereNotClosed = whereBase ? `${whereBase} AND status NOT IN ('resolved','closed')` : `WHERE status NOT IN ('resolved','closed')`;
    const byPriorityQ = `SELECT priority, COUNT(*) AS n FROM incidents ${whereNotClosed} GROUP BY priority`;
    const byPriority = await req.queryTenant(byPriorityQ, params);

    const openQ = `SELECT COUNT(*) AS n FROM incidents ${whereNotClosed}`;
    const openRes = await req.queryTenant(openQ, params);

    const whereP1 = whereBase ? `${whereBase} AND priority='P1' AND status NOT IN ('resolved','closed')` : `WHERE priority='P1' AND status NOT IN ('resolved','closed')`;
    const p1OpenQ = `SELECT COUNT(*) AS n FROM incidents ${whereP1}`;
    const p1OpenRes = await req.queryTenant(p1OpenQ, params);

    const recentQ = `SELECT * FROM incidents ${whereBase} ORDER BY created_at DESC LIMIT 5`;
    const recentRes = await req.queryTenant(recentQ, params);
    
    return res.status(200).json({ 
      byStatus: byStatus.rows, 
      byPriority: byPriority.rows, 
      open: parseInt(openRes.rows[0].n, 10), 
      p1Open: parseInt(p1OpenRes.rows[0].n, 10), 
      recent: recentRes.rows 
    });
  } catch (error) {
    console.error('[Incident Error] Failed to get summary:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function createIncident(req, res) {
  try {

    const {
      title, description = '', status = 'new', priority = 'P2',
      assigned_to = null, machine = '', source_chain_id = null, event_ids = []
    } = req.body;
    
    const created_by = req.session && req.session.username ? req.session.username : 'dashboard';
    
    if (!title) {
      return res.status(400).json({ error: 'title required' });
    }

    const info = await req.queryTenant(`
      INSERT INTO incidents (title, description, status, priority, assigned_to, machine, created_by, source_chain_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [title, description, status, priority, assigned_to || null, machine, created_by, source_chain_id]);
    
    const incId = info.rows[0].id;

    if (event_ids && event_ids.length > 0) {
      const tenantPool = await req.getTenantPool();
      const client = await tenantPool.connect();
      try {
        await client.query('BEGIN');
        for (const eid of event_ids) {
          await client.query('INSERT INTO incident_events (incident_id, event_id, linked_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [incId, eid, created_by]);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    }

    await req.queryTenant('INSERT INTO incident_notes (incident_id, author, body, note_type) VALUES ($1,$2,$3,$4)',
      [incId, created_by, `Incident created with priority ${priority}.`, 'system']);

    if (assigned_to) {
      const newInc = { id: incId, title, description, priority, machine, status, assigned_to };
      await sendAssignmentEmail(newInc, assigned_to);
    }

    return res.status(201).json({ ok: true, id: incId });
  } catch (error) {
    console.error('[Incident Error] Failed to create incident:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getIncident(req, res) {
  try {

    const { id } = req.params;
    const incRes = await req.queryTenant('SELECT * FROM incidents WHERE id=$1', [id]);
    const inc = incRes.rows[0];
    if (!inc) {
      return res.status(404).json({ error: 'Not found' });
    }
    
    const notesRes = await req.queryTenant('SELECT * FROM incident_notes WHERE incident_id=$1 ORDER BY created_at ASC', [inc.id]);
    
    const eventsRes = await req.queryTenant(`
      SELECT e.id, e.machine, e.ts, e.tag, e.severity, e.category, e.message,
             ie.linked_at, ie.linked_by
      FROM incident_events ie
      JOIN events e ON e.id = ie.event_id
      WHERE ie.incident_id=$1
      ORDER BY e.ts DESC LIMIT 200
    `, [inc.id]);

    return res.status(200).json({ ...inc, notes: notesRes.rows, events: eventsRes.rows });
  } catch (error) {
    console.error('[Incident Error] Failed to get incident:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateIncident(req, res) {
  try {

    const { id } = req.params;
    const incRes = await req.queryTenant('SELECT * FROM incidents WHERE id=$1', [id]);
    const inc = incRes.rows[0];
    if (!inc) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (req.session.role !== 'ADMIN' && req.session.role !== 'L3_ANALYST' && inc.assigned_to !== req.session.username) {
      return res.status(403).json({ error: 'Forbidden: You are not assigned to this incident' });
    }

    const { title, description, status, priority, assigned_to, machine, resolution_reason, resolution_note } = req.body;
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
      if ((inc.status === 'closed' || inc.status === 'resolved') && status === 'investigating') {
        if (req.session.role !== 'ADMIN' && req.session.role !== 'L3_ANALYST') {
          return res.status(403).json({ error: 'Only L3 Analyst and Admin can reopen a closed or resolved incident.' });
        }
      }

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
      if (status === 'resolved') {
        changes.push(['resolved_at', Math.floor(Date.now() / 1000)]);
        if (resolution_reason) auditLines.push(`Reason: ${resolution_reason}. Note: ${resolution_note || 'None'}`);
      }
      if (status === 'closed') {
        changes.push(['closed_at', Math.floor(Date.now() / 1000)]);
        if (resolution_reason) auditLines.push(`Reason: ${resolution_reason}. Note: ${resolution_note || 'None'}`);
      }
    }

    if (changes.length) {
      changes.push(['updated_at', Math.floor(Date.now() / 1000)]);
      const sets = changes.map(([k], i) => `${k}=$${i+1}`).join(',');
      const vals = changes.map(([, v]) => v);
      await req.queryTenant(`UPDATE incidents SET ${sets} WHERE id=$${vals.length+1}`, [...vals, inc.id]);
    }

    if (auditLines.length) {
      await req.queryTenant('INSERT INTO incident_notes (incident_id, author, body, note_type) VALUES ($1,$2,$3,$4)',
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

    const incRes = await req.queryTenant('SELECT * FROM incidents WHERE id=$1', [id]);
    const inc = incRes.rows[0];
    if (!inc) return res.status(404).json({ error: 'Not found' });

    await req.queryTenant('INSERT INTO incident_notes (incident_id, author, body, note_type) VALUES ($1,$2,$3,$4)', [inc.id, author, body, note_type]);
    await req.queryTenant('UPDATE incidents SET updated_at=$1 WHERE id=$2', [Math.floor(Date.now() / 1000), inc.id]);

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

    const incRes = await req.queryTenant('SELECT * FROM incidents WHERE id=$1', [id]);
    const inc = incRes.rows[0];
    if (!inc) return res.status(404).json({ error: 'Not found' });

    if (req.session.role !== 'ADMIN' && req.session.role !== 'L3_ANALYST' && inc.assigned_to !== req.session.username) {
      return res.status(403).json({ error: 'Forbidden: You are not assigned to this incident' });
    }

    const tenantPool = await req.getTenantPool();
    const client = await tenantPool.connect();
    try {
      await client.query('BEGIN');
      for (const eid of event_ids) {
        await client.query('INSERT INTO incident_events (incident_id, event_id, linked_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [inc.id, eid, linked_by]);
      }
      await client.query('UPDATE incidents SET updated_at=$1 WHERE id=$2', [Math.floor(Date.now() / 1000), inc.id]);
      await client.query('COMMIT');
    } catch(err) {
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
    await req.queryTenant('DELETE FROM incidents WHERE id=$1', [id]);
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
    
    const incRes = await req.queryTenant('SELECT * FROM incidents WHERE id=$1', [id]);
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
    
    await req.queryTenant('UPDATE incidents SET assigned_to=$1, updated_at=$2 WHERE id=$3',
      [assignee, Math.floor(Date.now() / 1000), id]);

    let noteBody = `Assigned to ${assignee} by ${updated_by}`;
    if (callerRole === 'L2_ANALYST' && targetRole === 'L3_ANALYST') {
      noteBody = `Escalated to L3 - assigned to ${assignee} by ${updated_by}`;
    }

    await req.queryTenant('INSERT INTO incident_notes (incident_id, author, body, note_type) VALUES ($1,$2,$3,$4)',
      [id, updated_by, noteBody, 'system']);

    const updatedIncRes = await req.queryTenant('SELECT * FROM incidents WHERE id=$1', [id]);
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
