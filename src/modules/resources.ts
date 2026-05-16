import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { anypointBaseUrl } from "../shared/anypointClient.js";
import type { AnypointModule } from "../shared/types.js";

export function registerEndpointResource(server: McpServer, module: AnypointModule): void {
  server.registerResource(
    `${module.name}-endpoints`,
    module.resourceUri,
    {
      title: `${module.displayName} endpoints`,
      description: `Endpoint map for ${module.displayName}.`,
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              module: module.name,
              displayName: module.displayName,
              baseUrl: anypointBaseUrl(),
              docsUrl: module.docsUrl,
              requiredHeaders: ["Authorization: Bearer <token>", "x-organization-id", "x-owner-id"],
              endpoints: module.endpoints,
            },
            null,
            2,
          ),
        },
      ],
    }),
  );
}

export function assertPathPrefix(path: string, allowedPrefixes: string[]): void {
  if (!allowedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`))) {
    throw new Error(`Path must start with one of: ${allowedPrefixes.join(", ")}`);
  }
}
