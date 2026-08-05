// ════════════════════════════════════════════════════════════════
// IOC Hunt — Network IP & Host Utilities
// ════════════════════════════════════════════════════════════════

const os = require('os');

function getNetworkIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && net.address !== '127.0.0.1') {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

function getHostIp() {
  const ips = getNetworkIps();
  return ips.length > 0 ? ips[0] : '127.0.0.1';
}

function getNetworkUrl(port = 4001, isHttps = true) {
  const protocol = isHttps ? 'https' : 'http';
  return `${protocol}://${getHostIp()}:${port}`;
}

module.exports = {
  getNetworkIps,
  getHostIp,
  getNetworkUrl
};
