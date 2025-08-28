#!/usr/bin/env node

/**
 * MCP Client for Claude Desktop
 * This client connects to the HTTP Playwright MCP server and provides
 * MCP protocol compatibility for Claude Desktop
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// HTTP server configuration
const HTTP_SERVER_URL = process.env["PLAYWRIGHT_HTTP_URL"] || "http://localhost:3000";

// MCP Client wrapper for HTTP server
class HTTPMCPClient {
  private httpServerUrl: string;

  constructor(serverUrl: string) {
    this.httpServerUrl = serverUrl;
  }

  async callTool(name: string, args: unknown): Promise<{content: Array<{type: string; text?: string; data?: string; mimeType?: string}>}> {
    try {
      const response = await fetch(`${this.httpServerUrl}/execute-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tool: name,
          arguments: args
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as {content: Array<{type: string; text?: string; data?: string; mimeType?: string}>};
      return result;
    } catch (error) {
      throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async listTools(): Promise<{tools: Array<{name: string; description: string; inputSchema: object}>}> {
    try {
      const response = await fetch(`${this.httpServerUrl}/tools`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as {tools: Array<{name: string; description: string; inputSchema: object}>};
      return result;
    } catch (error) {
      throw new Error(`Failed to list tools: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async healthCheck(): Promise<{status: string; uptime: number; memory: any}> {
    try {
      const response = await fetch(`${this.httpServerUrl}/health`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as {status: string; uptime: number; memory: any};
      return result;
    } catch (error) {
      throw new Error(`Health check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// MCP Server implementation that proxies to HTTP server
class MCPProxyServer {
  private httpClient: HTTPMCPClient;
  private server: Server;

  constructor() {
    this.httpClient = new HTTPMCPClient(HTTP_SERVER_URL);
    this.server = new Server(
      {
        name: "playwright-mcp-proxy",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
  }

  private setupToolHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const tools = await this.httpClient.listTools();
        return tools;
      } catch (error) {
        throw new Error(`Failed to list tools: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;
        const result = await this.httpClient.callTool(name, args);
        return result;
      } catch (error) {
        throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  async run(): Promise<void> {
    console.log(`🚀 Starting MCP Proxy Server for HTTP Playwright server at ${HTTP_SERVER_URL}`);
    
    // Test HTTP server connection
    try {
      const health = await this.httpClient.healthCheck();
      console.log(`✅ HTTP server is healthy - Uptime: ${Math.round(health.uptime)}s`);
    } catch (error) {
      console.error(`❌ HTTP server connection failed: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`Make sure the HTTP server is running at ${HTTP_SERVER_URL}`);
      process.exit(1);
    }

    this.setupToolHandlers();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.log('✅ MCP Proxy Server connected and ready');
    console.log('🔗 Proxying requests to HTTP Playwright MCP server');
  }
}

// Main execution
async function main() {
  const server = new MCPProxyServer();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('🛑 Shutting down MCP Proxy Server...');
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down MCP Proxy Server...');
    process.exit(0);
  });
  
  try {
    await server.run();
  } catch (error) {
    console.error('❌ MCP Proxy Server failed:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Failed to start MCP Proxy Server:', error);
  process.exit(1);
});
