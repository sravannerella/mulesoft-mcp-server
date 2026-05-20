#!/usr/bin/env node

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import type { Request, Response } from "express";
import { registerModules } from "./modules/index.js";
import { anypointRequest, environmentId, initializeAnypointAuth, organizationId } from "./shared/anypointClient.js";
import { renderDesignCenterProjectsUI } from "./ui/designCenterUiRenderer.js";
import { renderApiManagerApisHtml } from "./ui/apiManagerUiRenderer.js";
import { renderExchangeAssetsHtml } from "./ui/exchangeUiRenderer.js";
import { renderRuntimeManagerDeploymentsHtml } from "./ui/runtimeManagerUiRenderer.js";

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
      const raw = await anypointRequest("/designcenter/api-designer/projects");
      res.type("html").send(renderDesignCenterProjectsUI(raw));
    } catch (error) {
      console.error("Error rendering API Designer projects UI:", error);
      res.status(500).send("Unable to render API Designer projects UI.");
    }
  });

  app.get("/ui/runtime-manager/deployments", async (_req: Request, res: Response) => {
    try {
      const orgId = organizationId();
      const envId = environmentId();
      const raw = await anypointRequest(
        `/amc/application-manager/api/v2/organizations/${encodeURIComponent(orgId)}/environments/${encodeURIComponent(envId)}/deployments`,
      );
      const items: unknown[] = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as Record<string, unknown>)?.items)
          ? (raw as Record<string, unknown>).items as unknown[]
          : [];
      res.type("html").send(renderRuntimeManagerDeploymentsHtml(items));
    } catch (error) {
      console.error("Error rendering Runtime Manager deployments UI:", error);
      res.status(500).send("Unable to render Runtime Manager deployments UI.");
    }
  });

  app.get("/ui/api-manager/apis", async (_req: Request, res: Response) => {
    try {
      const orgId = organizationId();
      const envId = environmentId();
      const raw = await anypointRequest(
        `/apimanager/api/v1/organizations/${encodeURIComponent(orgId)}/environments/${encodeURIComponent(envId)}/apis`,
      );
      const items: unknown[] = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as Record<string, unknown>)?.assets)
          ? (raw as Record<string, unknown>).assets as unknown[]
          : [];
      res.type("html").send(renderApiManagerApisHtml(items));
    } catch (error) {
      console.error("Error rendering API Manager APIs UI:", error);
      res.status(500).send("Unable to render API Manager APIs UI.");
    }
  });

  app.get("/ui/exchange/assets", async (_req: Request, res: Response) => {
    try {
      const orgId = organizationId();
      const raw = await anypointRequest("/exchange/api/v2/assets", {
        query: { organizationId: orgId, limit: 25 },
      });
      res.type("html").send(renderExchangeAssetsHtml(raw));
    } catch (error) {
      console.error("Error rendering Exchange assets UI:", error);
      res.status(500).send("Unable to render Exchange assets UI.");
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
