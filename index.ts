#!/usr/bin/env node

/**
 * Playwright MCP Server - Main Entry Point
 * 
 * This is the main entry point for the Playwright MCP Server.
 * It determines the operating mode and starts the appropriate server.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the core server
import { startServer } from './src/core/index.js';

// Determine operating mode
const mode = process.env.MODE || 'stdio';
const port = parseInt(process.env.PORT || '3000', 10);

console.log('🔍 Mode Detection:');
console.log(`  PORT env: "${process.env.PORT}"`);
console.log(`  MODE env: "${process.env.MODE}"`);
console.log(`  Detected mode: "${mode}"`);

console.log('🚀 Starting Playwright MCP Server...');
console.log(`Mode: ${mode}, Port: ${port}`);

// Start the appropriate server
startServer(mode, port).catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
