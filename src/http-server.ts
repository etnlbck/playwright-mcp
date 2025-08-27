import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { PlaywrightMCPServer } from "./server.js";
import { z } from "zod";

const ToolCallSchema = z.object({
  tool: z.string(),
  arguments: z.record(z.any()).optional(),
});

class HTTPPlaywrightServer {
  private app: express.Application;
  private server: any;
  private wss: WebSocketServer | null = null;
  private mcpServer: PlaywrightMCPServer;
  private port: number;

  constructor(port = 3000) {
    this.app = express();
    this.server = createServer(this.app);
    this.mcpServer = new PlaywrightMCPServer();
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes(): void {
    // Root endpoint with connection info
    this.app.get("/", (req, res) => {
      res.status(200).json({
        name: "Playwright MCP Server",
        version: "1.0.0",
        description: "Model Context Protocol server for Playwright automation",
        endpoints: {
          health: "/health",
          ping: "/ping", 
          tools: "/tools",
          mcp_http: "/mcp",
          websocket: "/ws"
        },
        connections: {
          "HTTP POST": `${req.protocol}://${req.get('host')}/mcp`,
          "WebSocket": `ws://${req.get('host')}/ws`
        },
        usage: {
          "n8n MCP Client": "Use WebSocket: ws://your-domain/ws",
          "HTTP Client": "POST to /mcp with JSON-RPC 2.0 format"
        }
      });
    });

    // Simple ping endpoint
    this.app.get("/ping", (req, res) => {
      res.status(200).send("pong");
    });

    // Health check
    this.app.get("/health", (req, res) => {
      console.log("Health check requested");
      
      // Add headers to ensure proper response
      res.set({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Connection': 'close'
      });
      
      res.status(200).json({ 
        status: "ok", 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: "1.0.0",
        server: "running",
        port: this.port
      });
    });

    // Ready check - ensures browser is initialized
    this.app.get("/ready", async (req, res) => {
      try {
        console.log("Ready check requested - initializing browser...");
        const startTime = Date.now();
        await this.mcpServer.callTool("get_url", {});
        const initTime = Date.now() - startTime;
        console.log(`✅ Browser ready check completed in ${initTime}ms`);
        res.json({ 
          status: "ready", 
          timestamp: new Date().toISOString(),
          browserInitTime: initTime
        });
      } catch (error) {
        console.error("❌ Browser ready check failed:", error);
        res.status(503).json({ 
          status: "not_ready", 
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        });
      }
    });

    // MCP-compatible endpoint for n8n
    this.app.post("/mcp", async (req, res) => {
      try {
        console.log("MCP request received:", req.body);
        
        const { method, params } = req.body;
        
        if (method === "tools/list") {
          const tools = await this.mcpServer.listTools();
          res.json({
            jsonrpc: "2.0",
            id: req.body.id || 1,
            result: tools
          });
        } else if (method === "tools/call") {
          const { name, arguments: args } = params;
          const result = await this.mcpServer.callTool(name, args);
          res.json({
            jsonrpc: "2.0", 
            id: req.body.id || 1,
            result: result
          });
        } else {
          res.status(400).json({
            jsonrpc: "2.0",
            id: req.body.id || 1,
            error: {
              code: -32601,
              message: "Method not found"
            }
          });
        }
      } catch (error) {
        console.error("MCP request error:", error);
        res.status(500).json({
          jsonrpc: "2.0",
          id: req.body.id || 1,
          error: {
            code: -32603,
            message: "Internal error",
            data: error instanceof Error ? error.message : String(error)
          }
        });
      }
    });

    // List available tools (REST endpoint)
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
  }

  private setupWebSocket(): void {
    this.wss = new WebSocketServer({ server: this.server, path: '/ws' });
    
    this.wss.on('connection', (ws) => {
      console.log('🔌 WebSocket client connected');
      
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('📨 WebSocket message received:', message);
          
          const { method, params, id } = message;
          
          if (method === 'tools/list') {
            const tools = await this.mcpServer.listTools();
            ws.send(JSON.stringify({
              jsonrpc: "2.0",
              id: id || 1,
              result: tools
            }));
          } else if (method === 'tools/call') {
            const { name, arguments: args } = params;
            const result = await this.mcpServer.callTool(name, args);
            ws.send(JSON.stringify({
              jsonrpc: "2.0",
              id: id || 1,
              result: result
            }));
          } else {
            ws.send(JSON.stringify({
              jsonrpc: "2.0",
              id: id || 1,
              error: {
                code: -32601,
                message: "Method not found"
              }
            }));
          }
        } catch (error) {
          console.error('❌ WebSocket message error:', error);
          ws.send(JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            error: {
              code: -32603,
              message: "Internal error",
              data: error instanceof Error ? error.message : String(error)
            }
          }));
        }
      });
      
      ws.on('close', () => {
        console.log('🔌 WebSocket client disconnected');
      });
      
      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
      });
    });
    
    console.log('🔌 WebSocket server setup on /ws path');
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Starting HTTP server on port ${this.port}...`);
      console.log(`Environment: NODE_ENV=${process.env["NODE_ENV"]}, MODE=${process.env["MODE"]}`);
      console.log(`Memory limit: ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`);
      
      this.server.listen(this.port, "0.0.0.0", () => {
        const addr = this.server.address();
        console.log(`✅ Playwright MCP HTTP Server running on port ${this.port}`);
        console.log(`Server address:`, addr);
        console.log(`Health check available at: http://0.0.0.0:${this.port}/health`);
        console.log(`WebSocket available at: ws://0.0.0.0:${this.port}/ws`);
        console.log(`External health check should work at: http://localhost:${this.port}/health`);
        resolve();
      });

      this.server.on('error', (error: Error) => {
        console.error('❌ Server failed to start:', error);
        reject(error);
      });

      // Add timeout for server startup
      setTimeout(() => {
        console.log('⚠️ Server startup timeout - this may indicate issues with port binding');
      }, 10000);
    });
  }
}

export { HTTPPlaywrightServer };