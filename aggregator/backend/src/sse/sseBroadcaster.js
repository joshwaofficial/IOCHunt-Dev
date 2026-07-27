const clients = new Set();

/**
 * Endpoint handler for SSE connections
 */
function subscribe(req, res) {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Add this client to the pool
  clients.add(res);

  // Send an initial heartbeat to establish connection
  res.write('event: heartbeat\n');
  res.write('data: {"status":"connected"}\n\n');

  // Handle client disconnect
  req.on('close', () => {
    clients.delete(res);
  });
}

/**
 * Broadcasts an event to all connected SSE clients
 * @param {string} eventType - The type of event (e.g., 'new_alert', 'fw_event')
 * @param {Object} data - The payload to send
 */
function broadcast(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

/**
 * Periodically send heartbeats to keep connections alive
 */
setInterval(() => {
  for (const client of clients) {
    client.write('event: heartbeat\ndata: {"ping":"pong"}\n\n');
  }
}, 30000);

module.exports = {
  subscribe,
  broadcast
};
