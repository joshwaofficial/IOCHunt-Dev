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

    const heartbeat = setInterval(() => {
      res.write(`event: heartbeat\ndata: {}\n\n`);
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(res);
    });
  }

  broadcast = (type, data) => {
    const payload = JSON.stringify(data);
    for (const client of this.clients) {
      try {
        client.write(`event: ${type}\ndata: ${payload}\n\n`);
      } catch (_) {}
    }
  }
}

module.exports = new SSEBroadcaster();
