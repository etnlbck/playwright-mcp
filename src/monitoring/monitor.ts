#!/usr/bin/env node

import { HTTPPlaywrightServer } from "../adapters/http-server.js";

class ServerMonitor {
  private server: HTTPPlaywrightServer;
  private port: number;
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(port = 3000) {
    this.port = port;
    this.server = new HTTPPlaywrightServer(port);
  }

  async start(): Promise<void> {
    console.log('🚀 Starting server with monitoring...');
    
    try {
      await this.server.start();
      this.isRunning = true;
      
      // Start monitoring
      this.startMonitoring();
      
      console.log('✅ Server started successfully with monitoring');
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      throw error;
    }
  }

  private startMonitoring(): void {
    // Check server health every 2 minutes
    this.checkInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        const response = await fetch(`http://localhost:${this.port}/health`);
        if (response.ok) {
          const health: any = await response.json();
          console.log(`💓 Health check passed - Uptime: ${Math.round(health.uptime)}s, Memory: ${health.memory.used}MB`);
        } else {
          console.error('❌ Health check failed:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('❌ Health check error:', error);
      }
    }, 120000); // 2 minutes

    // Send keep-alive requests every 5 minutes
    setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        const response = await fetch(`http://localhost:${this.port}/keepalive`);
        if (response.ok) {
          console.log('💓 Keep-alive request sent');
        }
      } catch (error) {
        console.error('❌ Keep-alive request failed:', error);
      }
    }, 300000); // 5 minutes
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping server monitor...');
    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    console.log('✅ Server monitor stopped');
  }
}

// Main execution
async function main() {
  const port = Number.parseInt(process.env["PORT"] || "3000", 10);
  const monitor = new ServerMonitor(port);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('🛑 Received SIGINT, shutting down...');
    await monitor.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down...');
    await monitor.stop();
    process.exit(0);
  });
  
  try {
    await monitor.start();
  } catch (error) {
    console.error('❌ Failed to start monitor:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Monitor failed:', error);
  process.exit(1);
});
