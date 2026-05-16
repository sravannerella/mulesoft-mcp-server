import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { anypointRequest } from "../shared/anypointClient.js";
import { toolResult } from "../shared/mcpResponse.js";
import { asJsonValue, rawRequestInput } from "../shared/schemas.js";
import type { AnypointModule, JsonValue } from "../shared/types.js";
import { assertPathPrefix, registerEndpointResource } from "./resources.js";

const monitoringModule: AnypointModule = {
  name: "monitoring",
  displayName: "ARM Monitoring Query API",
  resourceUri: "anypoint-monitoring://endpoints",
  docsUrl: "https://dev-portal.mulesoft.com/apis/arm-monitoring-query.html",
  endpoints: [
    "POST /monitoring/api/query",
    "POST /monitoring/api/visualizer/api-analytics/query",
    "POST /monitoring/api/visualizer/events/query",
  ],
};

export function registerMonitoringTools(server: McpServer): void {
  registerEndpointResource(server, monitoringModule);

  server.registerTool(
    "monitoring_query",
    {
      title: "Run monitoring query",
      description: "Run an Anypoint Monitoring query payload.",
      inputSchema: {
        body: z.record(z.string(), z.unknown()).describe("Monitoring query request body from the ARM Monitoring Query API docs."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ body }) => toolResult(await anypointRequest("/monitoring/api/query", { method: "POST", body: body as JsonValue })),
  );

  server.registerTool(
    "monitoring_raw_request",
    {
      title: "Monitoring raw request",
      description: "Call a Monitoring API path under /monitoring/api. Use for documented endpoints not wrapped yet.",
      inputSchema: rawRequestInput,
      annotations: { readOnlyHint: true },
    },
    async ({ path, method, body }) => {
      assertPathPrefix(path, ["/monitoring/api"]);
      return toolResult(await anypointRequest(path, { method, body: asJsonValue(body) }));
    },
  );
}
