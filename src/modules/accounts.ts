import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { createUIResource } from "@mcp-ui/server";
import { z } from "zod/v4";
import { anypointRequest, cachedProfile, encodePathSegment, organizationId } from "../shared/anypointClient.js";
import { MemoryCache } from "../shared/memoryCache.js";
import type { AnypointModule } from "../shared/types.js";
import { renderAccountsContextHtml } from "../ui/accountsUiRenderer.js";
import { registerEndpointResource } from "./resources.js";

const accountsModule: AnypointModule = {
  name: "accounts",
  displayName: "Anypoint Accounts API",
  resourceUri: "anypoint-accounts://endpoints",
  docsUrl: "https://anypoint.mulesoft.com/accounts/api/profile",
  endpoints: [
    "GET /accounts/api/profile",
    "GET /accounts/api/organizations/{organizationId}/environments",
  ],
};

const ACCOUNTS_CONTEXT_URI = "ui://anypoint/accounts-context" as const;

const environmentsByOrgCache = new MemoryCache<unknown>();

function environmentsPath(orgId: string): string {
  return `/accounts/api/organizations/${encodePathSegment(orgId)}/environments`;
}

async function fetchContextHtml(): Promise<string> {
  const profile = await cachedProfile(false);
  const orgId = organizationId();
  const cached = environmentsByOrgCache.get(orgId);
  const environments = cached
    ? cached.value
    : await anypointRequest(environmentsPath(orgId)).then((data) => {
        environmentsByOrgCache.set(orgId, data);
        return data;
      });
  return renderAccountsContextHtml(profile, environments);
}

export function registerAccountsTools(server: McpServer): void {
  registerEndpointResource(server, accountsModule);

  registerAppResource(
    server,
    "Anypoint Context",
    ACCOUNTS_CONTEXT_URI,
    { description: "Visual view of Anypoint user profile and environments." },
    async () => {
      const html = await fetchContextHtml();
      const resource = createUIResource({
        uri: ACCOUNTS_CONTEXT_URI,
        content: { type: "rawHtml", htmlString: html },
        encoding: "text",
      });
      return { contents: [resource.resource] };
    },
  );

  registerAppTool(
    server,
    "accounts_context",
    {
      title: "Get Anypoint context (profile + environments)",
      description:
        "Returns the current Anypoint user profile and the list of environments for the organization. " +
        "Use the returned organizationId and environment IDs with other tools. " +
        "Set refresh to true to bypass the in-process cache.",
      inputSchema: {
        refresh: z.boolean().default(false).describe("Fetch from Anypoint even when cached."),
      },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: ACCOUNTS_CONTEXT_URI } },
    },
    async ({ refresh }) => {
      const profile = await cachedProfile(refresh);
      const orgId = organizationId();
      const cached = environmentsByOrgCache.get(orgId);
      let environments: unknown;
      if (!refresh && cached) {
        environments = cached.value;
      } else {
        environments = await anypointRequest(environmentsPath(orgId));
        environmentsByOrgCache.set(orgId, environments);
      }

      const envList = Array.isArray(environments)
        ? environments
        : Array.isArray((environments as Record<string, unknown>)?.data)
          ? ((environments as Record<string, unknown>).data as unknown[])
          : [];

      const p = profile as Record<string, unknown>;
      const org = p?.organization as Record<string, unknown> | undefined;
      return {
        content: [
          {
            type: "text" as const,
            text:
              `User: ${String(p?.username ?? p?.email ?? "—")} | ` +
              `Org: ${String(org?.name ?? "—")} (${orgId}) | ` +
              `Environments: ${envList.length}`,
          },
        ],
      };
    },
  );
}
