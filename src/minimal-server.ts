#!/usr/bin/env node

import express from "express";

const app = express();
const port = Number.parseInt(process.env["PORT"] || "3000", 10);

console.log(`🚀 Starting minimal test server...`);
console.log(`Port: ${port}`);
console.log(`Node version: ${process.version}`);
console.log(`Platform: ${process.platform} ${process.arch}`);
console.log(`Environment: NODE_ENV=${process.env["NODE_ENV"]}, MODE=${process.env["MODE"]}`);

app.get("/health", (req, res) => {
  console.log("Health check requested");
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: "1.0.0-minimal"
  });
});

app.get("/ping", (req, res) => {
  res.status(200).send("pong");
});

app.get("/", (req, res) => {
  res.status(200).json({
    message: "Minimal Playwright MCP Server",
    version: "1.0.0-minimal",
    endpoints: ["/health", "/ping"]
  });
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`✅ Minimal server running on port ${port}`);
  console.log(`Health check: http://0.0.0.0:${port}/health`);
});

server.on('error', (error) => {
  console.error('❌ Server failed to start:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

