#!/usr/bin/env node

import { PlaywrightMCPServer } from "./server.js";
import { HTTPPlaywrightServer } from "./http-server.js";

const mode = process.env["MODE"] || "stdio";
const port = Number.parseInt(process.env["PORT"] || "3000", 10);

async function main() {
  if (mode === "http") {
    console.log("Starting Playwright MCP Server in HTTP mode...");
    const httpServer = new HTTPPlaywrightServer(port);
    await httpServer.start();
  } else {
    console.log("Starting Playwright MCP Server in stdio mode...");
    const server = new PlaywrightMCPServer();
    await server.run();
  }
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});