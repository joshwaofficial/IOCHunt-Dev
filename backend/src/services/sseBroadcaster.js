class SSEBroadcaster {
  constructor() {
    this.clients = new Set();
  }

  subscribe = (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    this.clients.add(res);

    req.on('close', () => {
      this.clients.delete(res);
    });
  }

  broadcast = (type, data) => {
    const payload = JSON.stringify({ type, data });
    for (const client of this.clients) {
      client.write(`data: ${payload}\n\n`);
    }
  }
}

module.exports = new SSEBroadcaster();
