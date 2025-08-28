#!/usr/bin/env node

/**
 * Simple keepalive script to ping the server and prevent it from going idle
 * Usage: node keepalive.js [port] [interval_ms]
 */

const port = process.argv[2] || process.env.PORT || 3000;
const interval = Number.parseInt(process.argv[3] || "300000", 10); // 5 minutes default

console.log(`💓 Starting keepalive for server on port ${port} (interval: ${interval}ms)`);

async function pingServer() {
  try {
    const response = await fetch(`http://localhost:${port}/keepalive`);
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Keepalive successful - ${data.timestamp} (uptime: ${Math.round(data.uptime)}s)`);
    } else {
      console.error(`❌ Keepalive failed - HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`❌ Keepalive error:`, error.message);
  }
}

// Initial ping
pingServer();

// Set up interval
setInterval(pingServer, interval);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Keepalive stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Keepalive stopped');
  process.exit(0);
});
