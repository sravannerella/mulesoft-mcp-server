import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { anypointRequest, encodePathSegment } from "../shared/anypointClient.js";
import { MemoryCache } from "../shared/memoryCache.js";
import { toolResult } from "../shared/mcpResponse.js";
import type { AnypointModule, JsonValue } from "../shared/types.js";
import { registerEndpointResource } from "./resources.js";

const metricsModule: AnypointModule = {
  name: "metrics",
  displayName: "Anypoint Metrics API",
  resourceUri: "anypoint-metrics://endpoints",
  docsUrl: "https://dev-portal.mulesoft.com/apis/metrics.html",
  endpoints: [
    "GET /observability/api/v1/metric_types",
    "GET /observability/api/v1/metric_types/{metricName}:describe",
    "POST /observability/api/v1/metrics:search?offset={offset}&limit={limit}",
  ],
};

const metricTypesCache = new MemoryCache<unknown>();
const metricDescribeCache = new MemoryCache<unknown>();

export async function searchMetrics(query: string, offset = 0, limit = 20): Promise<unknown> {
  return anypointRequest("/observability/api/v1/metrics:search", {
    method: "POST",
    query: { offset, limit },
    body: { query },
  });
}

export function registerMetricsTools(server: McpServer): void {
  registerEndpointResource(server, metricsModule);

  server.registerTool(
    "metrics_list_types",
    {
      title: "List metric types",
      description: "List Anypoint Observability metric types. Results are cached in memory unless refresh is true.",
      inputSchema: {
        refresh: z.boolean().default(false),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ refresh }) => {
      const cached = metricTypesCache.get("metric-types");
      if (!refresh && cached) {
        return toolResult(cached.value);
      }

      const metricTypes = await anypointRequest("/observability/api/v1/metric_types");
      metricTypesCache.set("metric-types", metricTypes);
      return toolResult(metricTypes);
    },
  );

  server.registerTool(
    "metrics_describe_type",
    {
      title: "Describe metric type",
      description: "Describe attributes and measurements for an Anypoint Observability metric type.",
      inputSchema: {
        metricName: z.string().min(1),
        refresh: z.boolean().default(false),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ metricName, refresh }) => {
      const cached = metricDescribeCache.get(metricName);
      if (!refresh && cached) {
        return toolResult(cached.value);
      }

      const description = await anypointRequest(`/observability/api/v1/metric_types/${encodePathSegment(metricName)}:describe`);
      metricDescribeCache.set(metricName, description);
      return toolResult(description);
    },
  );

  server.registerTool(
    "metrics_search",
    {
      title: "Search metrics",
      description: "Run an AMQL metrics query against Anypoint Observability.",
      inputSchema: {
        query: z.string().min(1).describe("AMQL query, for example SELECT COUNT(requests) FROM \"mulesoft.api.summary\" ..."),
        offset: z.number().int().nonnegative().default(0),
        limit: z.number().int().positive().max(2000).default(20),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, offset, limit }) => toolResult(await searchMetrics(query, offset, limit) as JsonValue),
  );
}
