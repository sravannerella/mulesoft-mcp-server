#!/usr/bin/env node

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import type { Request, Response } from "express";
import { renderApiDesignerProjectsHtml } from "./modules/apiDesigner.js";
import { registerModules } from "./modules/index.js";
import { initializeAnypointAuth } from "./shared/anypointClient.js";

function createServer(): McpServer {
  const server = new McpServer({
    name: "anypoint-mcp-server",
    version: "0.6.5",
  });

  registerModules(server);
  return server;
}

function httpPort(): number {
  const value = process.env.PORT ?? process.env.MCP_PORT ?? "3000";
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT/MCP_PORT value: ${value}`);
  }

  return port;
}

function httpHost(): string {
  return process.env.HOST ?? process.env.MCP_HOST ?? "127.0.0.1";
}

async function main() {
  await initializeAnypointAuth();

  const host = httpHost();
  const port = httpPort();
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.get("/ui/api-designer/projects", async (_req: Request, res: Response) => {
    try {
      res.type("html").send(await renderApiDesignerProjectsHtml());
    } catch (error) {
      console.error("Error rendering API Designer projects UI:", error);
      res.status(500).send("Unable to render API Designer projects UI.");
    }
  });

  app.get("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. Use POST /mcp for Streamable HTTP.",
      },
      id: null,
    });
  });

  app.delete("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
  });

  const httpServer = app.listen(port, host, () => {
    console.error(`Anypoint MCP Streamable HTTP server listening at http://${host}:${port}/mcp`);
  });

  process.on("SIGINT", () => {
    httpServer.close(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    httpServer.close(() => process.exit(0));
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
