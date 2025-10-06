import { PlaywrightMCPServer } from "./server.js";
import { HTTPPlaywrightServer } from "../adapters/http-server.js";
import { MCPHTTPPlaywrightServer } from "./mcp-http-server.js";

export async function startServer(mode: string, port: number): Promise<void> {
  console.log(`Raw PORT env: "${process.env.PORT}"`);
  console.log('All PORT-related env vars:', Object.keys(process.env).filter(k => k.includes('PORT')));
  console.log(`Node version: ${process.version}`);
  console.log(`Platform: ${process.platform} ${process.arch}`);

  // Safety check: If we have a PORT but mode isn't http, something's wrong
  const portEnv = process.env.PORT;
  if (portEnv && mode !== "http") {
    console.warn(`⚠️ WARNING: PORT provided (${portEnv}) but mode is ${mode}. Forcing HTTP mode for Railway compatibility.`);
    const httpServer = new MCPHTTPPlaywrightServer(port);
    await httpServer.start();
    console.log(`🎉 Server successfully started in forced HTTP mode on port ${port}`);
    return;
  }

  if (mode === "http") {
    console.log("Starting Playwright MCP Server in HTTP mode...");
    try {
      const httpServer = new MCPHTTPPlaywrightServer(port);
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
    console.log("⚠️ Note: stdio mode has no HTTP endpoints - health checks will not work");
    try {
      const server = new PlaywrightMCPServer();
      await server.run();
    } catch (error) {
      console.error("❌ Failed to start stdio server:", error);
      throw error;
    }
  }
}

// CLI execution (for backward compatibility)
if (process.argv[1] && process.argv[1].endsWith('index.ts')) {
  const portEnv = process.env.PORT;
  const explicitMode = process.env.MODE;
  const mode = explicitMode || (portEnv ? "http" : "stdio");
  const port = portEnv ? Number.parseInt(portEnv, 10) : 3000;

  console.log('🔍 Mode Detection:');
  console.log(`  PORT env: "${portEnv}"`);
  console.log(`  MODE env: "${explicitMode}"`);
  console.log(`  Detected mode: "${mode}"`);

  // Validate port
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    console.error(`❌ Invalid port: ${portEnv} (parsed as ${port})`);
    process.exit(1);
  }

  startServer(mode, port).catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}