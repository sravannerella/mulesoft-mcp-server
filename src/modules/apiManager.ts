import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { anypointRequest, encodePathSegment, environmentId, organizationId } from "../shared/anypointClient.js";
import { toolResult } from "../shared/mcpResponse.js";
import { asJsonValue, optionalEnvId, optionalOrgId, rawRequestInput } from "../shared/schemas.js";
import type { AnypointModule, JsonValue } from "../shared/types.js";
import { assertPathPrefix, registerEndpointResource } from "./resources.js";

const apiManagerModule: AnypointModule = {
  name: "api-manager",
  displayName: "API Manager API",
  resourceUri: "anypoint-api-manager://endpoints",
  docsUrl: "https://dev-portal.mulesoft.com/apis/api-manager.html",
  endpoints: [
    "GET /apimanager/api/v1/organizations/{organizationId}/environments/{environmentId}/apis",
    "POST /apimanager/api/v1/organizations/{organizationId}/environments/{environmentId}/apis",
    "GET /apimanager/api/v1/organizations/{organizationId}/environments/{environmentId}/apis/{apiId}",
    "GET /apimanager/api/v1/organizations/{organizationId}/environments/{environmentId}/apis/{apiId}/contracts",
  ],
};

function apiManagerBase(orgId: string, envId: string): string {
  return `/apimanager/api/v1/organizations/${encodePathSegment(orgId)}/environments/${encodePathSegment(envId)}`;
}

function apisPath(orgId: string, envId: string): string {
  return `${apiManagerBase(orgId, envId)}/apis`;
}

function apiPath(orgId: string, envId: string, apiId: string): string {
  return `${apisPath(orgId, envId)}/${encodePathSegment(apiId)}`;
}

const apiManagerScopeInput = {
  ...optionalOrgId,
  ...optionalEnvId,
};

const apiManagerApiInput = {
  ...apiManagerScopeInput,
  apiId: z.string().min(1),
};

function compactObject<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export function registerApiManagerTools(server: McpServer): void {
  registerEndpointResource(server, apiManagerModule);

  server.registerTool(
    "api_manager_list_apis",
    {
      title: "List managed APIs",
      description: "List API Manager API instances in an environment.",
      inputSchema: {
        ...apiManagerScopeInput,
        query: z.string().optional(),
        limit: z.number().int().positive().optional(),
        offset: z.number().int().nonnegative().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, query, limit, offset }) =>
      toolResult(await anypointRequest(apisPath(organizationId(orgOverride), environmentId(envOverride)), { query: { query, limit, offset } })),
  );

  server.registerTool(
    "api_manager_create_api_instance",
    {
      title: "Create managed API instance",
      description:
        "Create an API Manager API instance, including proxy/basic endpoint registrations and autodiscovery configurations.",
      inputSchema: {
        ...apiManagerScopeInput,
        groupId: z.string().min(1).describe("Exchange asset group ID."),
        assetId: z.string().min(1).describe("Exchange asset ID."),
        assetVersion: z.string().min(1).describe("Exchange asset version."),
        technology: z
          .enum(["mule4", "mule3", "flexGateway", "serviceMesh"])
          .default("mule4")
          .describe("Runtime technology for the managed API instance."),
        endpointType: z
          .enum(["raml", "rest", "rest-api", "http", "http-api", "soap", "soap-api"])
          .optional()
          .describe("Endpoint/API type. Examples: raml, rest-api, http-api, soap-api."),
        endpointUri: z.string().optional().describe("Implementation/upstream URI."),
        proxyUri: z.string().nullable().optional().describe("Proxy listener URI, for example http://0.0.0.0:8081/."),
        isCloudHub: z.boolean().nullable().optional().describe("Whether the proxy is deployed to CloudHub."),
        deploymentType: z.enum(["CH", "HY", "RTF", "MC"]).optional().describe("Deployment type when needed by the API Manager request."),
        muleVersion4OrAbove: z.boolean().nullable().optional(),
        referencesUserDomain: z.boolean().nullable().optional(),
        responseTimeout: z.number().int().positive().nullable().optional(),
        validation: z.enum(["ENABLED", "DISABLED", "NOT_APPLICABLE"]).optional(),
        providerId: z.string().nullable().optional().describe("Client provider ID. Null uses Anypoint as provider."),
        instanceLabel: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        proxyTemplateAssetVersion: z.string().optional().describe("Proxy template asset version, when deploying a proxy."),
      },
    },
    async ({
      organizationId: orgOverride,
      environmentId: envOverride,
      groupId,
      assetId,
      assetVersion,
      technology,
      endpointType,
      endpointUri,
      proxyUri,
      isCloudHub,
      deploymentType,
      muleVersion4OrAbove,
      referencesUserDomain,
      responseTimeout,
      validation,
      providerId,
      instanceLabel,
      tags,
      proxyTemplateAssetVersion,
    }) => {
      const endpoint = compactObject({
        type: endpointType,
        uri: endpointUri,
        proxyUri,
        isCloudHub,
        deploymentType,
        muleVersion4OrAbove,
        referencesUserDomain,
        responseTimeout,
        validation,
        proxyTemplate: proxyTemplateAssetVersion ? { assetVersion: proxyTemplateAssetVersion } : undefined,
      });

      const createRequest = compactObject({
        endpoint,
        technology,
        providerId,
        instanceLabel,
        tags,
        spec: {
          groupId,
          assetId,
          version: assetVersion,
        },
      });

      return toolResult(
        await anypointRequest(apisPath(organizationId(orgOverride), environmentId(envOverride)), {
          method: "POST",
          body: createRequest as JsonValue,
        }),
      );
    },
  );

  server.registerTool(
    "api_manager_get_api",
    {
      title: "Get managed API",
      description: "Get one API Manager API instance.",
      inputSchema: apiManagerApiInput,
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, apiId }) =>
      toolResult(await anypointRequest(apiPath(organizationId(orgOverride), environmentId(envOverride), apiId))),
  );

  server.registerTool(
    "api_manager_list_contracts",
    {
      title: "List API contracts",
      description: "List client contracts for an API Manager API instance.",
      inputSchema: apiManagerApiInput,
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, apiId }) =>
      toolResult(await anypointRequest(`${apiPath(organizationId(orgOverride), environmentId(envOverride), apiId)}/contracts`)),
  );

  server.registerTool(
    "api_manager_raw_request",
    {
      title: "API Manager raw request",
      description: "Call an API Manager path under /apimanager/api. Use for documented endpoints not wrapped yet.",
      inputSchema: rawRequestInput,
    },
    async ({ path, method, body }) => {
      assertPathPrefix(path, ["/apimanager/api"]);
      return toolResult(await anypointRequest(path, { method, body: asJsonValue(body) }));
    },
  );
}
