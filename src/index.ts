#!/usr/bin/env node

import { PlaywrightMCPServer } from "./server.js";
import { HTTPPlaywrightServer } from "./http-server.js";

const mode = process.env["MODE"] || "stdio";
const portEnv = process.env["PORT"];
const port = portEnv ? Number.parseInt(portEnv, 10) : 3000;

// Validate port
if (isNaN(port) || port < 1 || port > 65535) {
  console.error(`❌ Invalid port: ${portEnv} (parsed as ${port})`);
  process.exit(1);
}

async function main() {
  console.log(`🚀 Starting Playwright MCP Server...`);
  console.log(`Mode: ${mode}, Port: ${port}`);
  console.log(`Raw PORT env: "${process.env["PORT"]}"`);
  console.log(`All PORT-related env vars:`, Object.keys(process.env).filter(k => k.includes('PORT')));
  console.log(`Node version: ${process.version}`);
  console.log(`Platform: ${process.platform} ${process.arch}`);

  if (mode === "http") {
    console.log("Starting Playwright MCP Server in HTTP mode...");
    try {
      const httpServer = new HTTPPlaywrightServer(port);
      await httpServer.start();
      console.log(`🎉 Server successfully started and listening on port ${port}`);
      
      // Give Railway a moment to detect the server is ready
      console.log("⏳ Waiting 2 seconds for Railway to detect server...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log("✅ Server is ready for health checks");
    } catch (error) {
      console.error("❌ Failed to start HTTP server:", error);
      throw error;
    }
  } else {
    console.log("Starting Playwright MCP Server in stdio mode...");
    try {
      const server = new PlaywrightMCPServer();
      await server.run();
    } catch (error) {
      console.error("❌ Failed to start stdio server:", error);
      throw error;
    }
  }
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});