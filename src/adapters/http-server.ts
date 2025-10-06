import express from "express";
import cors from "cors";
import helmet from "helmet";
import { PlaywrightMCPServer } from "../core/server.js";
import { z } from "zod";

const ToolCallSchema = z.object({
  tool: z.string(),
  arguments: z.record(z.any()).optional(),
});

class HTTPPlaywrightServer {
  private app: express.Application;
  private mcpServer: PlaywrightMCPServer;
  private port: number;
  private server: any; // eslint-disable-line @typescript-eslint/no-explicit-any
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
      // Check browser status without starting it
      await this.mcpServer.callTool("browser_status", {});
      console.log('✅ Internal health check passed - server and browser status checked');
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
      this.server.close(() => {
        console.log('✅ HTTP server closed');
      });
    }
    
    // Close browser
    try {
      console.log('🌐 Closing browser...');
      await this.mcpServer.callTool("close_browser", {});
      console.log('✅ Browser closed');
    } catch (error) {
      console.error('❌ Error closing browser:', error);
    }
    
    console.log('👋 Graceful shutdown complete');
    process.exit(0);
  }

  private setupRoutes(): void {
    // Simple ping endpoint
    this.app.get("/ping", (req, res) => {
      res.status(200).send("pong");
    });

    // Health check
    this.app.get("/health", (req, res) => {
      console.log("Health check requested");
      const memUsage = process.memoryUsage();
      res.status(200).json({ 
        status: "ok", 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          used: Math.round(memUsage.heapUsed / 1024 / 1024),
          total: Math.round(memUsage.heapTotal / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024)
        },
        version: "1.0.0",
        server: "running",
        lastActivity: new Date(this.lastActivity).toISOString(),
        isShuttingDown: this.isShuttingDown
      });
    });

    // Keep-alive endpoint
    this.app.get("/keepalive", (req, res) => {
      console.log("Keep-alive requested");
      this.lastActivity = Date.now();
      res.status(200).json({
        status: "alive",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        message: "Server is alive and responsive"
      });
    });

    // Ready check - server is ready, browser will start on-demand
    this.app.get("/ready", async (req, res) => {
      try {
        console.log("Ready check requested - server is ready for on-demand browser startup");
        res.json({ 
          status: "ready", 
          timestamp: new Date().toISOString(),
          message: "Server ready - browser will start on first tool call"
        });
      } catch (error) {
        console.error("❌ Ready check failed:", error);
        res.status(503).json({ 
          status: "not_ready", 
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        });
      }
    });

    // List available tools
    this.app.get("/tools", async (req, res) => {
      try {
        const tools = await this.mcpServer.listTools();
        res.json(tools);
      } catch (error) {
        res.status(500).json({
          error: "Failed to list tools",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Execute tool with streaming support
    this.app.post("/execute", async (req, res) => {
      try {
        const { tool, arguments: args } = ToolCallSchema.parse(req.body);

        // Set up SSE headers for streaming
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
        });

        // Send initial status
        res.write(`data: ${JSON.stringify({ type: "status", message: "Starting execution" })}\\n\\n`);

        try {
          const result = await this.mcpServer.callTool(tool, args || {});

          // Send result
          res.write(`data: ${JSON.stringify({ type: "result", data: result })}\\n\\n`);
          res.write(`data: ${JSON.stringify({ type: "complete" })}\\n\\n`);
        } catch (error) {
          res.write(`data: ${JSON.stringify({
            type: "error",
            error: "Tool execution failed",
            message: error instanceof Error ? error.message : String(error),
          })}\\n\\n`);
        }

        res.end();
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: "Invalid request body",
            details: error.errors,
          });
        } else {
          res.status(500).json({
            error: "Internal server error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    // Non-streaming execute endpoint
    this.app.post("/execute-sync", async (req, res) => {
      try {
        const { tool, arguments: args } = ToolCallSchema.parse(req.body);

        const result = await this.mcpServer.callTool(tool, args || {});

        res.json(result);
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: "Invalid request body",
            details: error.errors,
          });
        } else {
          res.status(500).json({
            error: "Tool execution failed",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    // MCP-over-HTTP endpoint for mcp-remote client
    this.app.post("/mcp", async (req, res) => {
      try {
        console.log('📨 MCP request received:', JSON.stringify(req.body, null, 2));
        
        const mcpRequest = req.body;
        
        if (!mcpRequest.method) {
          return res.status(400).json({
            jsonrpc: "2.0",
            id: mcpRequest.id || null,
            error: {
              code: -32600,
              message: "Invalid Request - missing method"
            }
          });
        }

        const mcpResponse: {
          jsonrpc: string;
          id: number | string | null;
          result?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
          error?: {
            code: number;
            message: string;
            data?: string;
          };
        } = {
          jsonrpc: "2.0",
          id: mcpRequest.id || null
        };

        try {
          switch (mcpRequest.method) {
            case "initialize": {
              mcpResponse.result = {
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
            }

            case "tools/list": {
              const tools = await this.mcpServer.listTools();
              mcpResponse.result = { tools: tools.tools };
              break;
            }

            case "tools/call": {
              const { name, arguments: args } = mcpRequest.params;
              const result = await this.mcpServer.callTool(name, args || {});
              mcpResponse.result = result;
              break;
            }

            default:
              mcpResponse.error = {
                code: -32601,
                message: `Method not found: ${mcpRequest.method}`
              };
          }
        } catch (error) {
          console.error('❌ MCP method execution error:', error);
          mcpResponse.error = {
            code: -32603,
            message: "Internal error",
            data: error instanceof Error ? error.message : String(error)
          };
        }

        console.log('📤 MCP response:', JSON.stringify(mcpResponse, null, 2));
        return res.json(mcpResponse);

      } catch (error) {
        console.error('❌ MCP endpoint error:', error);
        return res.status(500).json({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32603,
            message: "Internal error",
            data: error instanceof Error ? error.message : String(error)
          }
        });
      }
    });

    // SSE endpoint for MCP streaming (if needed)
    this.app.get("/sse", (req, res) => {
      console.log('🔄 SSE connection requested');
      
      // Set proper SSE headers with string values only
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control"
      });

      // Send initial connection event
      res.write(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`);

      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: "ping", timestamp: new Date().toISOString() })}\n\n`);
      }, 30000);

      // Handle client disconnect
      req.on('close', () => {
        console.log('🔌 SSE client disconnected');
        clearInterval(keepAlive);
      });

      req.on('end', () => {
        console.log('🔚 SSE connection ended');
        clearInterval(keepAlive);
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Starting HTTP server on port ${this.port}...`);
      console.log(`Environment: NODE_ENV=${process.env["NODE_ENV"]}, MODE=${process.env["MODE"]}`);
      console.log(`Memory limit: ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`);
      
      this.server = this.app.listen(this.port, "0.0.0.0", () => {
        console.log(`✅ Playwright MCP HTTP Server running on port ${this.port}`);
        console.log(`Health check available at: http://0.0.0.0:${this.port}/health`);
        console.log(`Keep-alive endpoint: http://0.0.0.0:${this.port}/keepalive`);
        console.log(`Ready check: http://0.0.0.0:${this.port}/ready`);
        resolve();
      });

      this.server.on('error', (error: Error) => {
        console.error('❌ Server failed to start:', error);
        reject(error);
      });

      this.server.on('close', () => {
        console.log('🔌 HTTP server connection closed');
      });

      this.server.on('connection', (socket: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        console.log('🔗 New connection established');
        socket.on('close', () => {
          console.log('🔌 Connection closed');
        });
      });

      // Add timeout for server startup
      setTimeout(() => {
        if (!this.server.listening) {
          console.log('⚠️ Server startup timeout - this may indicate issues with port binding');
        }
      }, 10000);
    });
  }
}

export { HTTPPlaywrightServer };