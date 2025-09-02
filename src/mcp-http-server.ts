import express from "express";
import cors from "cors";
import helmet from "helmet";
import { PlaywrightMCPServer } from "./server.js";
import { z } from "zod";

const JSONRPCRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.any().optional(),
});

const JSONRPCResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]),
  result: z.any().optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.any().optional(),
  }).optional(),
});

class MCPHTTPPlaywrightServer {
  private app: express.Application;
  private mcpServer: PlaywrightMCPServer;
  private port: number;
  private server: any;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();
  private isShuttingDown = false;

  constructor(port = 3000) {
    this.app = express();
    this.mcpServer = new PlaywrightMCPServer();
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupProcessHandlers();
    this.startKeepAlive();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Track activity for keepalive
    this.app.use((req, res, next) => {
      this.lastActivity = Date.now();
      next();
    });
  }

  private setupProcessHandlers(): void {
    // Handle graceful shutdown
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGHUP', () => this.gracefulShutdown('SIGHUP'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      this.gracefulShutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown('unhandledRejection');
    });
  }

  private startKeepAlive(): void {
    // Keep-alive heartbeat every 30 seconds
    this.keepAliveInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        console.log(`💓 Keep-alive heartbeat - Server running for ${Math.round(process.uptime())}s`);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          console.log('🧹 Garbage collection triggered');
        }
        
        // Log memory usage
        const memUsage = process.memoryUsage();
        console.log(`📊 Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB used, ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB total`);
      }
    }, 30000);

    // Health check interval every 5 minutes
    this.healthCheckInterval = setInterval(async () => {
      if (!this.isShuttingDown) {
        try {
          // Perform internal health check
          await this.performHealthCheck();
        } catch (error) {
          console.error('❌ Health check failed:', error);
        }
      }
    }, 300000); // 5 minutes
  }

  private async performHealthCheck(): Promise<void> {
    try {
      // Test browser functionality
      await this.mcpServer.callTool("get_url", {});
      console.log('✅ Internal health check passed');
    } catch (error) {
      console.error('❌ Internal health check failed:', error);
      // Don't restart here, just log the issue
    }
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      console.log('🛑 Shutdown already in progress...');
      return;
    }
    
    this.isShuttingDown = true;
    console.log(`🛑 Received ${signal}, starting graceful shutdown...`);
    
    // Clear intervals
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    // Close server
    if (this.server) {
      console.log('🔌 Closing HTTP server...');
      await new Promise<void>((resolve) => {
        this.server.close(() => {
          console.log('✅ HTTP server closed');
          resolve();
        });
      });
    }
    
    // Cleanup MCP server
    try {
      await this.mcpServer.cleanup();
    } catch (error) {
      console.error('❌ Error during MCP server cleanup:', error);
    }
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const memUsage = process.memoryUsage();
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        memory: {
          used: Math.round(memUsage.heapUsed / 1024 / 1024),
          total: Math.round(memUsage.heapTotal / 1024 / 1024),
          percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
        },
        timestamp: new Date().toISOString(),
        lastActivity: this.lastActivity,
        server: 'running'
      });
    });

    // Keepalive endpoint
    this.app.get('/keepalive', (req, res) => {
      this.lastActivity = Date.now();
      res.json({
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        status: 'alive'
      });
    });

    // MCP protocol endpoint
    this.app.post('/mcp', async (req, res) => {
      try {
        // Validate JSON-RPC request
        const request = JSONRPCRequestSchema.parse(req.body);
        
        console.log(`📨 MCP Request: ${request.method} (id: ${request.id || 'notification'})`);
        
        // Handle notifications (no id field) - these don't expect a response
        if (request.id === undefined) {
          console.log(`📤 MCP Notification: ${request.method} - no response needed`);
          res.status(200).end();
          return;
        }
        
        let result: any;
        
        switch (request.method) {
          case 'initialize':
            result = {
              protocolVersion: "2025-06-18",
              capabilities: {
                tools: {}
              },
              serverInfo: {
                name: "playwright-mcp-server",
                version: "1.0.0"
              }
            };
            break;
            
          case 'tools/list':
            result = {
              tools: [
                {
                  name: "navigate",
                  description: "Navigate to a URL with robust timeout handling",
                  inputSchema: {
                    type: "object",
                    properties: {
                      url: { type: "string", description: "URL to navigate to" },
                      waitUntil: { 
                        type: "string", 
                        enum: ["load", "domcontentloaded", "networkidle"],
                        description: "When to consider navigation successful (default: load)"
                      },
                      timeout: { type: "number", description: "Timeout in milliseconds (default: 30000)" }
                    },
                    required: ["url"]
                  }
                },
                {
                  name: "screenshot",
                  description: "Take a screenshot of the current page",
                  inputSchema: {
                    type: "object",
                    properties: {
                      fullPage: { type: "boolean", description: "Capture full page" },
                      quality: { type: "number", minimum: 0, maximum: 100, description: "Image quality" },
                      type: { type: "string", enum: ["png", "jpeg"], description: "Image format" }
                    }
                  }
                },
                {
                  name: "scrape",
                  description: "Extract text or attributes from page elements",
                  inputSchema: {
                    type: "object",
                    properties: {
                      selector: { type: "string", description: "CSS selector" },
                      attribute: { type: "string", description: "Attribute to extract" },
                      multiple: { type: "boolean", description: "Extract from multiple elements" }
                    }
                  }
                },
                {
                  name: "click",
                  description: "Click on an element",
                  inputSchema: {
                    type: "object",
                    properties: {
                      selector: { type: "string", description: "CSS selector of element to click" },
                      timeout: { type: "number", description: "Timeout in milliseconds" }
                    },
                    required: ["selector"]
                  }
                },
                {
                  name: "type",
                  description: "Type text into an element",
                  inputSchema: {
                    type: "object",
                    properties: {
                      selector: { type: "string", description: "CSS selector of input element" },
                      text: { type: "string", description: "Text to type" },
                      delay: { type: "number", description: "Delay between keystrokes in milliseconds" }
                    },
                    required: ["selector", "text"]
                  }
                },
                {
                  name: "wait_for",
                  description: "Wait for an element or condition",
                  inputSchema: {
                    type: "object",
                    properties: {
                      selector: { type: "string", description: "CSS selector to wait for" },
                      timeout: { type: "number", description: "Timeout in milliseconds" },
                      state: { 
                        type: "string", 
                        enum: ["attached", "detached", "visible", "hidden"],
                        description: "Element state to wait for"
                      }
                    }
                  }
                },
                {
                  name: "get_url",
                  description: "Get the current page URL",
                  inputSchema: {
                    type: "object",
                    properties: {}
                  }
                },
                {
                  name: "close_browser",
                  description: "Close the browser instance",
                  inputSchema: {
                    type: "object",
                    properties: {}
                  }
                },
                {
                  name: "browser_health",
                  description: "Check browser health and status",
                  inputSchema: {
                    type: "object",
                    properties: {}
                  }
                }
              ]
            };
            break;
            
          case 'tools/call':
            if (!request.params || !request.params.name) {
              throw new Error('Tool name is required');
            }
            
            const toolName = request.params.name;
            const toolArgs = request.params.arguments || {};
            
            console.log(`🔧 Executing tool: ${toolName}`, toolArgs);
            
            // Call the MCP server tool
            const toolResult = await this.mcpServer.callTool(toolName, toolArgs);
            result = toolResult;
            break;
            
          case 'resources/list':
            // Return empty resources list (we don't have any resources)
            result = {
              resources: []
            };
            break;
            
          case 'prompts/list':
            // Return empty prompts list (we don't have any prompts)
            result = {
              prompts: []
            };
            break;
            
          default:
            throw new Error(`Unknown method: ${request.method}`);
        }
        
        // Send JSON-RPC response
        const response = {
          jsonrpc: "2.0",
          id: request.id,
          result: result
        };
        
        console.log(`📤 MCP Response: ${request.method} (id: ${request.id})`);
        res.json(response);
        
      } catch (error) {
        console.error('❌ MCP Error:', error);
        
        // Send JSON-RPC error response
        const errorResponse = {
          jsonrpc: "2.0",
          id: req.body?.id || null,
          error: {
            code: -32603, // Internal error
            message: error instanceof Error ? error.message : 'Unknown error',
            data: error instanceof Error ? error.stack : error
          }
        };
        
        res.status(500).json(errorResponse);
      }
    });

    // Legacy endpoints for backward compatibility
    this.app.get('/tools', async (req, res) => {
      try {
        const result = await this.mcpServer.callTool('tools/list', {});
        res.json(result);
      } catch (error) {
        console.error('❌ Tools list error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    this.app.post('/execute-sync', async (req, res) => {
      try {
        const { tool, arguments: args } = req.body;
        if (!tool) {
          res.status(400).json({ error: 'Tool name is required' });
          return;
        }
        
        const result = await this.mcpServer.callTool(tool, args || {});
        res.json(result);
      } catch (error) {
        console.error('❌ Execute sync error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Ready check endpoint
    this.app.get('/ready', async (req, res) => {
      try {
        const startTime = Date.now();
        await this.mcpServer.callTool("get_url", {});
        const browserInitTime = Date.now() - startTime;
        
        res.json({
          status: 'ready',
          browserInitTime: browserInitTime,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('❌ Ready check error:', error);
        res.status(500).json({
          status: 'not ready',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          console.log(`🚀 MCP HTTP Server started on port ${this.port}`);
          console.log(`📡 MCP endpoint: http://localhost:${this.port}/mcp`);
          console.log(`🏥 Health check: http://localhost:${this.port}/health`);
          console.log(`🛠️ Tools list: http://localhost:${this.port}/tools`);
          resolve();
        });
        
        this.server.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            console.error(`❌ Port ${this.port} is already in use`);
          } else {
            console.error('❌ Server error:', error);
          }
          reject(error);
        });
        
      } catch (error) {
        console.error('❌ Failed to start server:', error);
        reject(error);
      }
    });
  }
}

export { MCPHTTPPlaywrightServer };
