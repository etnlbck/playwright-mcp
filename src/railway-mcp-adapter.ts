#!/usr/bin/env node

/**
 * Railway MCP Adapter for Playwright
 * This runs both the HTTP server and MCP adapter on Railway
 * for remote access via n8n or Claude Desktop
 */

import { HTTPPlaywrightServer } from "./http-server.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Configuration
const HTTP_PORT = Number.parseInt(process.env["PORT"] || "3000", 10);
const HTTP_SERVER_URL = `http://localhost:${HTTP_PORT}`;

class RailwayMCPAdapter {
  private httpServer: HTTPPlaywrightServer;
  private mcpServer: Server;
  private isHttpServerStarted = false;

  constructor() {
    // Initialize HTTP server
    this.httpServer = new HTTPPlaywrightServer(HTTP_PORT);
    
    // Initialize MCP server
    this.mcpServer = new Server(
      {
        name: "playwright-railway-mcp",
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
    const url = `${HTTP_SERVER_URL}${endpoint}`;
    
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

  private setupMCPHandlers(): void {
    // List tools handler
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
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
    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
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

  async startHttpServer(): Promise<void> {
    if (this.isHttpServerStarted) return;
    
    console.log(`🚀 Starting HTTP server on port ${HTTP_PORT}...`);
    await this.httpServer.start();
    this.isHttpServerStarted = true;
    console.log(`✅ HTTP server started on port ${HTTP_PORT}`);
  }

  async startMCPAdapter(): Promise<void> {
    console.log(`🔗 Starting MCP adapter for HTTP server at ${HTTP_SERVER_URL}`);
    
    // Wait for HTTP server to be ready
    let retries = 0;
    const maxRetries = 10;
    
    while (retries < maxRetries) {
      try {
        console.log(`🔍 Testing HTTP server connection (attempt ${retries + 1}/${maxRetries})...`);
        const health = await this.makeHttpRequest('/health') as {status: string; uptime: number};
        console.log(`✅ HTTP server is healthy - Status: ${health.status}, Uptime: ${Math.round(health.uptime)}s`);
        break;
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          console.error(`❌ HTTP server connection failed after ${maxRetries} attempts`);
          throw error;
        }
        console.log(`⏳ Waiting 2 seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    this.setupMCPHandlers();

    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
    
    console.log('✅ Railway MCP Adapter connected and ready');
    console.log('🌐 HTTP server available for n8n and other HTTP clients');
    console.log('🔗 MCP server available for Claude Desktop');
  }

  async run(): Promise<void> {
    console.log('🚀 Starting Railway MCP Adapter...');
    console.log(`📊 Environment: NODE_ENV=${process.env["NODE_ENV"]}, MODE=${process.env["MODE"]}`);
    console.log(`🌐 HTTP Port: ${HTTP_PORT}`);
    
    // Start HTTP server first
    await this.startHttpServer();
    
    // Start MCP adapter
    await this.startMCPAdapter();
    
    console.log('🎉 Railway MCP Adapter fully operational!');
    console.log(`📡 HTTP endpoints available at: http://0.0.0.0:${HTTP_PORT}`);
    console.log('🤖 MCP server ready for Claude Desktop connections');
  }
}

// Main execution
async function main() {
  const adapter = new RailwayMCPAdapter();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('🛑 Shutting down Railway MCP Adapter...');
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down Railway MCP Adapter...');
    process.exit(0);
  });
  
  try {
    await adapter.run();
  } catch (error) {
    console.error('❌ Railway MCP Adapter failed:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Failed to start Railway MCP Adapter:', error);
  process.exit(1);
});





