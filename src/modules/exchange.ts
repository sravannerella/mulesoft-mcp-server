import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { anypointRequest, encodePathSegment, organizationId } from "../shared/anypointClient.js";
import { toolResult } from "../shared/mcpResponse.js";
import { asJsonValue, optionalOrgId, rawRequestInput } from "../shared/schemas.js";
import type { AnypointModule, JsonValue } from "../shared/types.js";
import { assertPathPrefix, registerEndpointResource } from "./resources.js";

const exchangeModule: AnypointModule = {
  name: "exchange",
  displayName: "Exchange Experience API",
  resourceUri: "anypoint-exchange://endpoints",
  docsUrl: "https://dev-portal.mulesoft.com/apis/exchange-experience.html",
  endpoints: [
    "GET /exchange/api/v2/assets?organizationId={organizationId}",
    "POST /exchange/api/v2/organizations/{organizationId}/assets/{groupId}/{assetId}/{version}",
    "GET /exchange/api/v2/assets/{groupId}/{assetId}/{version}",
    "PATCH /exchange/api/v2/assets/{groupId}/{assetId}/{version}",
    "DELETE /exchange/api/v2/assets/{groupId}/{assetId}/{version}",
    "POST /exchange/api/v2/organizations/{organizationId}/applications/{applicationId}/contracts",
    "GET /exchange/api/v2/assets/{groupId}/{assetId}/{version}/portal/pages",
    "GET /exchange/api/v2/assets/{groupId}/{assetId}/{version}/portal/resources",
  ],
};

function assetsPath(): string {
  return "/exchange/api/v2/assets";
}

function assetPath(groupId: string, assetId: string, version: string): string {
  return `${assetsPath()}/${encodePathSegment(groupId)}/${encodePathSegment(assetId)}/${encodePathSegment(version)}`;
}

const assetInput = {
  ...optionalOrgId,
  groupId: z.string().min(1),
  assetId: z.string().min(1),
  version: z.string().min(1),
};

const stringId = z.union([z.string().min(1), z.number().int().nonnegative()]).transform(String);

function applicationsPath(orgId: string): string {
  return `/exchange/api/v2/organizations/${encodePathSegment(orgId)}/applications`;
}

function applicationContractsPath(orgId: string, applicationId: string): string {
  return `${applicationsPath(orgId)}/${encodePathSegment(applicationId)}/contracts`;
}

function compactObject<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export function registerExchangeTools(server: McpServer): void {
  registerEndpointResource(server, exchangeModule);

  server.registerTool(
    "exchange_list_assets",
    {
      title: "List Exchange assets",
      description: "List Exchange assets for an organization.",
      inputSchema: {
        ...optionalOrgId,
        search: z.string().optional(),
        type: z.string().optional(),
        limit: z.number().int().positive().optional(),
        offset: z.number().int().nonnegative().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, search, type, limit, offset }) =>
      toolResult(await anypointRequest(assetsPath(), { query: { organizationId: organizationId(orgOverride), search, type, limit, offset } })),
  );

  server.registerTool(
    "exchange_get_asset",
    {
      title: "Get Exchange asset",
      description: "Get metadata for a specific Exchange asset version.",
      inputSchema: assetInput,
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, groupId, assetId, version }) =>
      toolResult(await anypointRequest(assetPath(groupId, assetId, version), { query: { organizationId: organizationId(orgOverride) } })),
  );

  server.registerTool(
    "exchange_list_asset_pages",
    {
      title: "List Exchange asset pages",
      description: "List portal pages for a specific Exchange asset version.",
      inputSchema: assetInput,
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, groupId, assetId, version }) =>
      toolResult(await anypointRequest(`${assetPath(groupId, assetId, version)}/portal/pages`, { query: { organizationId: organizationId(orgOverride) } })),
  );

  server.registerTool(
    "exchange_list_asset_resources",
    {
      title: "List Exchange asset resources",
      description: "List portal resources for a specific Exchange asset version.",
      inputSchema: assetInput,
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, groupId, assetId, version }) =>
      toolResult(await anypointRequest(`${assetPath(groupId, assetId, version)}/portal/resources`, { query: { organizationId: organizationId(orgOverride) } })),
  );

  server.registerTool(
    "exchange_delete_asset",
    {
      title: "Delete Exchange asset",
      description: "Delete a specific Exchange asset version.",
      inputSchema: assetInput,
      annotations: { destructiveHint: true },
    },
    async ({ organizationId: orgOverride, groupId, assetId, version }) =>
      toolResult(await anypointRequest(assetPath(groupId, assetId, version), { method: "DELETE", query: { organizationId: organizationId(orgOverride) } })),
  );

  server.registerTool(
    "exchange_request_access",
    {
      title: "Request Exchange API access",
      description: "Create an application contract for a REST API or API group asset. Use apiId for REST APIs and apiGroupInstanceId for API groups.",
      inputSchema: {
        ...assetInput,
        applicationId: stringId.describe("Client application ID."),
        instanceType: z.enum(["api", "api-group"]).default("api"),
        apiId: stringId.optional().describe("Managed REST API instance ID. Required when instanceType is api."),
        apiGroupInstanceId: stringId.optional().describe("Managed API group instance ID. Required when instanceType is api-group."),
        environmentId: z.string().min(1).describe("Environment ID for the selected managed instance."),
        versionGroup: z.string().min(1).optional().describe("Asset version group, for example v1."),
        requestedTierId: stringId.optional().describe("SLA tier ID. Omit when the instance has no SLA tier."),
        acceptedTerms: z.boolean().default(true),
      },
    },
    async ({
      organizationId: orgOverride,
      applicationId,
      instanceType,
      apiId,
      apiGroupInstanceId,
      environmentId,
      requestedTierId,
      acceptedTerms,
      groupId,
      assetId,
      version,
      versionGroup,
    }) => {
      if (instanceType === "api" && !apiId) {
        throw new Error("apiId is required when instanceType is api.");
      }

      if (instanceType === "api-group" && !apiGroupInstanceId) {
        throw new Error("apiGroupInstanceId is required when instanceType is api-group.");
      }

      const orgId = organizationId(orgOverride);
      const instanceIdentifier =
        instanceType === "api"
          ? { apiId }
          : { apiGroupInstanceId };

      return toolResult(
        await anypointRequest(applicationContractsPath(orgId, applicationId), {
          method: "POST",
          body: compactObject({
            ...instanceIdentifier,
            instanceType,
            environmentId,
            requestedTierId,
            acceptedTerms,
            organizationId: orgId,
            groupId,
            assetId,
            version,
            versionGroup,
          }) as JsonValue,
        }),
      );
    },
  );

  server.registerTool(
    "exchange_raw_request",
    {
      title: "Exchange raw request",
      description: "Call an Exchange API path under /exchange/api. Use for documented endpoints not wrapped yet.",
      inputSchema: rawRequestInput,
    },
    async ({ path, method, body }) => {
      assertPathPrefix(path, ["/exchange/api"]);
      return toolResult(await anypointRequest(path, { method, body: asJsonValue(body) }));
    },
  );
}
