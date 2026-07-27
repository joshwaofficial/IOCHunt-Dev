const db = require('../config/db');

class Incident {
  static async getAll() {
    const res = await db.query(`
      SELECT * FROM incidents 
      ORDER BY updated_at DESC
    `);
    return res.rows;
  }

  static async getById(id) {
    const incidentRes = await db.query(`SELECT * FROM incidents WHERE id = $1`, [id]);
    const incident = incidentRes.rows[0];
    if (!incident) return null;

    const notesRes = await db.query(`SELECT * FROM incident_notes WHERE incident_id = $1 ORDER BY created_at ASC`, [id]);
    incident.notes = notesRes.rows;

    const eventsRes = await db.query(`
      SELECT e.*, ie.linked_at, ie.linked_by 
      FROM incident_events ie
      JOIN events e ON ie.event_id = e.id
      WHERE ie.incident_id = $1
    `, [id]);
    incident.events = eventsRes.rows;

    return incident;
  }

  static async create(data, username) {
    const now = Math.floor(Date.now() / 1000);
    const result = await db.query(`
      INSERT INTO incidents (title, description, status, priority, assigned_to, machine, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
    `, [
      data.title, 
      data.description || '', 
      data.status || 'new', 
      data.priority || 'P2', 
      data.assigned_to || null, 
      data.machine || '', 
      username, 
      now, 
      now
    ]);
    return result.rows[0].id;
  }

  static async update(id, data) {
    const now = Math.floor(Date.now() / 1000);
    
    let query = `UPDATE incidents SET updated_at = $1`;
    const params = [now];
    let pIdx = 2;

    const fields = ['title', 'description', 'status', 'priority', 'assigned_to', 'machine'];
    for (const field of fields) {
      if (data[field] !== undefined) {
        query += `, ${field} = $${pIdx++}`;
        params.push(data[field]);
      }
    }

    if (data.status === 'resolved' && data.status !== undefined) {
      query += `, resolved_at = $${pIdx++}`;
      params.push(now);
    }

    if (data.status === 'closed' && data.status !== undefined) {
      query += `, closed_at = $${pIdx++}`;
      params.push(now);
    }

    query += ` WHERE id = $${pIdx}`;
    params.push(id);

    await db.query(query, params);
  }

  static async delete(id) {
    await db.query(`DELETE FROM incidents WHERE id = $1`, [id]);
  }

  static async addNote(incidentId, author, body, noteType = 'comment') {
    await db.query(`
      INSERT INTO incident_notes (incident_id, author, body, note_type)
      VALUES ($1, $2, $3, $4)
    `, [incidentId, author, body, noteType]);
    
    // Update incident updated_at
    const now = Math.floor(Date.now() / 1000);
    await db.query(`UPDATE incidents SET updated_at = $1 WHERE id = $2`, [now, incidentId]);
  }
}

module.exports = Incident;
