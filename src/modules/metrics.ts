import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { anypointRequest } from "../shared/anypointClient.js";
import { toolResult } from "../shared/mcpResponse.js";
import type { JsonValue } from "../shared/types.js";

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerMetricsTools(server: McpServer): void {
  // ── Discovery ──────────────────────────────────────────────────────────────

  server.registerTool(
    "metrics_list_types",
    {
      title: "Metrics: List Metric Types",
      description:
        "List all Anypoint Observability metric types with names and available attributes inline. Use the returned metric names to compose AMQL queries for metrics_search.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const types = await anypointRequest("/observability/api/v1/metric_types");
      return toolResult(types);
    },
  );

  // ── Search / Query ─────────────────────────────────────────────────────────

  server.registerTool(
    "metrics_search",
    {
      title: "Metrics: Search (AMQL)",
      description:
        "Run an AMQL metrics query against Anypoint Observability. Returns a Chart.js visualization of the time series data alongside raw results. Call metrics_list_types first to discover valid metric names.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            'AMQL query, for example: SELECT COUNT(requests) FROM "mulesoft.api.summary" WHERE organizationId = \'<id>\' LAST 60 MINUTES',
          ),
        offset: z.number().int().nonnegative().default(0),
        limit: z.number().int().positive().max(2000).default(50),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, offset, limit }) => {
      const raw = await anypointRequest("/observability/api/v1/metrics:search", {
        method: "POST",
        query: { offset, limit },
        body: { query } as JsonValue,
      });
      return toolResult(raw);
    },
  );
}
