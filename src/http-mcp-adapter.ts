#!/usr/bin/env node

/**
 * HTTP MCP Adapter for Claude Desktop
 * This creates a proper MCP server that translates MCP protocol calls
 * to HTTP requests to the Playwright HTTP server
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// HTTP server configuration
const HTTP_SERVER_URL = process.env["PLAYWRIGHT_HTTP_URL"] || "http://localhost:3000";

class HTTPMCPAdapter {
  private server: Server;
  private httpServerUrl: string;

  constructor() {
    this.httpServerUrl = HTTP_SERVER_URL;
    this.server = new Server(
      {
        name: "playwright-http-adapter",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
  }

  private async makeHttpRequest(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: any): Promise<any> {
    const url = `${this.httpServerUrl}${endpoint}`;
    
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        console.log('🔍 Listing tools from HTTP server...');
        const result = await this.makeHttpRequest('/tools') as {tools: Array<{name: string; description: string; inputSchema: object}>};
        console.log(`✅ Retrieved ${result.tools?.length || 0} tools`);
        return result;
      } catch (error) {
        console.error('❌ Failed to list tools:', error);
        throw new Error(`Failed to list tools: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;
        console.log(`🛠️ Executing tool: ${name}`);
        
        const result = await this.makeHttpRequest('/execute-sync', 'POST', {
          tool: name,
          arguments: args
        }) as {content: Array<{type: string; text?: string; data?: string; mimeType?: string}>};
        
        console.log(`✅ Tool ${name} executed successfully`);
        return result;
      } catch (error) {
        console.error(`❌ Tool execution failed:`, error);
        throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  async run(): Promise<void> {
    console.log(`🚀 Starting HTTP MCP Adapter for Playwright server at ${this.httpServerUrl}`);
    
    // Test HTTP server connection
    try {
      console.log('🔍 Testing HTTP server connection...');
      const health = await this.makeHttpRequest('/health') as {status: string; uptime: number};
      console.log(`✅ HTTP server is healthy - Status: ${health.status}, Uptime: ${Math.round(health.uptime)}s`);
    } catch (error) {
      console.error(`❌ HTTP server connection failed: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`Make sure the HTTP server is running at ${this.httpServerUrl}`);
      console.error('Start it with: PORT=3000 MODE=http npm start');
      process.exit(1);
    }

    this.setupHandlers();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.log('✅ HTTP MCP Adapter connected and ready');
    console.log('🔗 Translating MCP calls to HTTP requests');
  }
}

// Main execution
async function main() {
  const adapter = new HTTPMCPAdapter();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('🛑 Shutting down HTTP MCP Adapter...');
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down HTTP MCP Adapter...');
    process.exit(0);
  });
  
  try {
    await adapter.run();
  } catch (error) {
    console.error('❌ HTTP MCP Adapter failed:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Failed to start HTTP MCP Adapter:', error);
  process.exit(1);
});
