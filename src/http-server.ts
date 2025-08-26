import express from "express";
import cors from "cors";
import helmet from "helmet";
import { PlaywrightMCPServer } from "./server.js";
import { z } from "zod";

const ToolCallSchema = z.object({
  tool: z.string(),
  arguments: z.record(z.any()).optional(),
});

class HTTPPlaywrightServer {
  private app: express.Application;
  private mcpServer: PlaywrightMCPServer;
  private port: number;

  constructor(port = 3000) {
    this.app = express();
    this.mcpServer = new PlaywrightMCPServer();
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes(): void {
    // Health check
    this.app.get("/health", (req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // List available tools
    this.app.get("/tools", async (req, res) => {
      try {
        const tools = await this.mcpServer["server"].request(
          { method: "tools/list" },
          { method: "tools/list" }
        );
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
          const result = await this.mcpServer["server"].request(
            {
              method: "tools/call",
              params: {
                name: tool,
                arguments: args || {},
              },
            },
            {
              method: "tools/call",
              params: {
                name: tool,
                arguments: args || {},
              },
            }
          );

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

        const result = await this.mcpServer["server"].request(
          {
            method: "tools/call",
            params: {
              name: tool,
              arguments: args || {},
            },
          },
          {
            method: "tools/call",
            params: {
              name: tool,
              arguments: args || {},
            },
          }
        );

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

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, "0.0.0.0", () => {
        console.log(`Playwright MCP HTTP Server running on port ${this.port}`);
        resolve();
      });
    });
  }
}

export { HTTPPlaywrightServer };