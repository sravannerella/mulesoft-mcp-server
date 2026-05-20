import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { anypointRequest, environmentId, organizationId } from "../shared/anypointClient.js";
import { toolResult } from "../shared/mcpResponse.js";
import { advancedToolsEnabled, requireAdvancedTools } from "../shared/workflowGuards.js";
import { optionalEnvId, optionalOrgId } from "../shared/schemas.js";
import type { JsonValue } from "../shared/types.js";

// ─── Common time range ────────────────────────────────────────────────────────

const timeRangeInput = {
  timeRange: z
    .enum(["5m", "15m", "1h", "3h", "6h", "12h", "24h", "7d", "30d"])
    .default("1h")
    .describe("Monitoring time window."),
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Build a runtime-manager-style monitoring body for an application. */
function buildAppMonitoringBody(
  orgId: string,
  envId: string,
  appName: string,
  timeRange: string,
): JsonValue {
  return {
    start: `now-${timeRange}`,
    end: "now",
    step: "1m",
    params: {
      organizationId: orgId,
      environmentId: envId,
      resourceName: appName,
    },
    metrics: ["cpu_usage", "memory_usage", "message_count", "error_count"],
  } as unknown as JsonValue;
}

/** Build an API analytics query body. */
function buildApiAnalyticsBody(
  orgId: string,
  envId: string,
  apiId: string,
  timeRange: string,
): JsonValue {
  return {
    start: `now-${timeRange}`,
    end: "now",
    step: "1m",
    params: {
      organizationId: orgId,
      environmentId: envId,
      apiId,
    },
    metrics: ["request_count", "response_time_average", "error_count"],
  } as unknown as JsonValue;
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerMonitoringTools(server: McpServer): void {
  // ── App Overview ───────────────────────────────────────────────────────────

  server.registerTool(
    "monitoring_get_app_overview",
    {
      title: "Monitoring: Application Overview",
      description:
        "Get monitoring metrics for a deployed application — CPU, memory, message count, and error count over a time window. Use runtime_list_deployments to find the appName.",
      inputSchema: {
        ...optionalOrgId,
        ...optionalEnvId,
        appName: z.string().min(1).describe("Application name as shown in Runtime Manager."),
        ...timeRangeInput,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, appName, timeRange }) => {
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);
      const body = buildAppMonitoringBody(orgId, envId, appName, timeRange);
      const raw = await anypointRequest("/monitoring/api/query", { method: "POST", body });
      return toolResult(raw);
    },
  );

  // ── API Analytics ──────────────────────────────────────────────────────────

  server.registerTool(
    "monitoring_get_api_analytics",
    {
      title: "Monitoring: API Analytics",
      description:
        "Get analytics metrics for an API Manager API instance — request count, response time, and error count over a time window. Use api_manager_list_apis to find the apiId.",
      inputSchema: {
        ...optionalOrgId,
        ...optionalEnvId,
        apiId: z.string().min(1).describe("API Manager API instance ID from api_manager_list_apis."),
        apiName: z.string().optional().describe("Human-readable API name for display."),
        ...timeRangeInput,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, apiId, timeRange }) => {
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);
      const body = buildApiAnalyticsBody(orgId, envId, apiId, timeRange);
      const raw = await anypointRequest("/monitoring/api/visualizer/api-analytics/query", {
        method: "POST",
        body,
      });
      return toolResult(raw);
    },
  );

  // ── Advanced / Gated ───────────────────────────────────────────────────────

  if (advancedToolsEnabled()) {
    server.registerTool(
      "monitoring_raw_request",
      {
        title: "Monitoring: Raw Query [Advanced]",
        description:
          "Execute a raw Anypoint Monitoring API POST body. Requires ANYPOINT_MCP_ADVANCED_TOOLS=true. Use only for monitoring query shapes not covered by monitoring_get_app_overview or monitoring_get_api_analytics.",
        inputSchema: {
          endpoint: z
            .enum([
              "/monitoring/api/query",
              "/monitoring/api/visualizer/api-analytics/query",
              "/monitoring/api/visualizer/events/query",
            ])
            .default("/monitoring/api/query")
            .describe("Monitoring API endpoint to POST to."),
          body: z
            .record(z.string(), z.unknown())
            .describe("Monitoring query request body per ARM Monitoring Query API docs."),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ endpoint, body }) => {
        requireAdvancedTools();
        return toolResult(
          await anypointRequest(endpoint, { method: "POST", body: body as JsonValue }),
        );
      },
    );
  } // end advancedToolsEnabled
}
