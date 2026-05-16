import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { anypointRequest, cachedProfile, encodePathSegment, organizationId } from "../shared/anypointClient.js";
import { MemoryCache } from "../shared/memoryCache.js";
import { toolResult } from "../shared/mcpResponse.js";
import { optionalOrgId } from "../shared/schemas.js";
import type { AnypointModule } from "../shared/types.js";
import { registerEndpointResource } from "./resources.js";

const accountsModule: AnypointModule = {
  name: "accounts",
  displayName: "Anypoint Accounts API",
  resourceUri: "anypoint-accounts://endpoints",
  docsUrl: "https://anypoint.mulesoft.com/accounts/api/profile",
  endpoints: [
    "GET /accounts/api/profile",
    "GET /accounts/api/organizations/{organizationId}/environments",
    "GET /accounts/api/organizations/{organizationId}/environments/{environmentId}",
  ],
};

const environmentsByOrgCache = new MemoryCache<unknown>();
const environmentByOrgAndIdCache = new MemoryCache<unknown>();

function environmentsPath(orgId: string): string {
  return `/accounts/api/organizations/${encodePathSegment(orgId)}/environments`;
}

function environmentPath(orgId: string, envId: string): string {
  return `${environmentsPath(orgId)}/${encodePathSegment(envId)}`;
}

function environmentCacheKey(orgId: string, envId: string): string {
  return `${orgId}:${envId}`;
}

export function registerAccountsTools(server: McpServer): void {
  registerEndpointResource(server, accountsModule);

  server.registerTool(
    "accounts_get_profile",
    {
      title: "Get Anypoint profile",
      description: "Return the cached Anypoint profile. Set refresh to true to reload it from Anypoint.",
      inputSchema: {
        refresh: z.boolean().default(false).describe("Fetch from Anypoint even when cached."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ refresh }) => toolResult(await cachedProfile(refresh)),
  );

  server.registerTool(
    "accounts_list_environments",
    {
      title: "List Anypoint environments",
      description: "Retrieve and cache environments for an Anypoint organization.",
      inputSchema: {
        ...optionalOrgId,
        refresh: z.boolean().default(false).describe("Fetch from Anypoint even when cached."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, refresh }) => {
      const orgId = organizationId(orgOverride);
      const cached = environmentsByOrgCache.get(orgId);
      if (!refresh && cached) {
        return toolResult(cached.value);
      }

      const environments = await anypointRequest(environmentsPath(orgId));
      environmentsByOrgCache.set(orgId, environments);
      return toolResult(environments);
    },
  );

  server.registerTool(
    "accounts_get_environment",
    {
      title: "Get Anypoint environment",
      description: "Retrieve and cache one Anypoint environment by ID.",
      inputSchema: {
        ...optionalOrgId,
        environmentId: z.string().min(1),
        refresh: z.boolean().default(false).describe("Fetch from Anypoint even when cached."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, environmentId, refresh }) => {
      const orgId = organizationId(orgOverride);
      const cacheKey = environmentCacheKey(orgId, environmentId);
      const cached = environmentByOrgAndIdCache.get(cacheKey);

      if (!refresh && cached) {
        return toolResult(cached.value);
      }

      const environment = await anypointRequest(environmentPath(orgId, environmentId));
      environmentByOrgAndIdCache.set(cacheKey, environment);
      return toolResult(environment);
    },
  );
}
