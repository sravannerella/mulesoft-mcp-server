import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { createUIResource } from "@mcp-ui/server";
import { z } from "zod/v4";
import { anypointRequest, encodePathSegment, environmentId, organizationId } from "../shared/anypointClient.js";
import { toolResult } from "../shared/mcpResponse.js";

const API_MANAGER_APIS_URI = "ui://anypoint-api-manager/apis" as const;
import { optionalEnvId, optionalOrgId } from "../shared/schemas.js";
import { advancedToolsEnabled, requireAdvancedTools } from "../shared/workflowGuards.js";
import { exchangeAssetUrl } from "../shared/anypointUrls.js";
import type { JsonValue } from "../shared/types.js";
import { renderApiManagerApisHtml } from "../ui/apiManagerUiRenderer.js";

// ─── Path helpers ─────────────────────────────────────────────────────────────

function apisBase(orgId: string, envId: string): string {
  return `/apimanager/api/v1/organizations/${encodePathSegment(orgId)}/environments/${encodePathSegment(envId)}/apis`;
}

function apiPath(orgId: string, envId: string, apiId: string): string {
  return `${apisBase(orgId, envId)}/${encodePathSegment(apiId)}`;
}

function policiesPath(orgId: string, envId: string, apiId: string): string {
  return `${apiPath(orgId, envId, apiId)}/policies`;
}

function policyPath(orgId: string, envId: string, apiId: string, policyId: string): string {
  return `${policiesPath(orgId, envId, apiId)}/${encodePathSegment(policyId)}`;
}

function contractsPath(orgId: string, envId: string, apiId: string): string {
  return `${apiPath(orgId, envId, apiId)}/contracts`;
}

function outboundPoliciesPath(orgId: string, envId: string, apiId: string): string {
  return `/apimanager/xapi/v1/organizations/${encodePathSegment(orgId)}/environments/${encodePathSegment(envId)}/apis/${encodePathSegment(apiId)}/policies/outbound-policies`;
}

function policyTemplatesPath(orgId: string): string {
  return `/apimanager/api/v1/organizations/${encodePathSegment(orgId)}/policy-templates`;
}

// ─── Scope input ──────────────────────────────────────────────────────────────

const scopeInput = {
  ...optionalOrgId,
  ...optionalEnvId,
};

const apiScopeInput = {
  ...scopeInput,
  apiId: z.string().min(1).describe("API Manager API instance ID. Obtain from api_manager_list_apis."),
};

const policyAssetInput = {
  policyTemplateId: z.string().optional().describe("Classic policy template ID, e.g. client-id-enforcement."),
  groupId: z.string().optional().describe("Policy asset group ID."),
  assetId: z.string().optional().describe("Policy asset ID."),
  assetVersion: z.string().optional().describe("Policy asset version."),
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function compactObject<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}

function policyAssetPayload(input: {
  policyTemplateId?: string;
  groupId?: string;
  assetId?: string;
  assetVersion?: string;
}) {
  const hasAssetGav = input.groupId || input.assetId || input.assetVersion;
  if (!input.policyTemplateId && !hasAssetGav) {
    throw new Error("Provide policyTemplateId or all three of: groupId, assetId, assetVersion.");
  }
  if (hasAssetGav && (!input.groupId || !input.assetId || !input.assetVersion)) {
    throw new Error("When using asset GAV, groupId, assetId, and assetVersion are all required.");
  }
  return compactObject({
    policyTemplateId: input.policyTemplateId,
    groupId: input.groupId,
    assetId: input.assetId,
    assetVersion: input.assetVersion,
  });
}

// ─── Enrichment: fetch policies + contracts and attach ────────────────────────

async function enrichApiInstances(
  orgId: string,
  envId: string,
  apis: unknown[],
): Promise<unknown[]> {
  return Promise.all(
    apis.map(async (api) => {
      if (!isRecord(api)) return api;
      const apiId = String(api.id ?? "");
      if (!apiId) return api;

      const [policiesRaw, contractsRaw] = await Promise.all([
        anypointRequest(policiesPath(orgId, envId, apiId)).catch(() => []),
        anypointRequest(contractsPath(orgId, envId, apiId)).catch(() => []),
      ]);

      const policies = Array.isArray(policiesRaw)
        ? policiesRaw
        : isRecord(policiesRaw) && Array.isArray(policiesRaw.policies)
          ? policiesRaw.policies
          : [];

      const contracts = Array.isArray(contractsRaw)
        ? contractsRaw
        : isRecord(contractsRaw) && Array.isArray(contractsRaw.contracts)
          ? contractsRaw.contracts
          : [];

      // Build Exchange deep link from asset GAV
      const groupId = String(api.groupId ?? api.organizationId ?? orgId);
      const assetId = String(api.assetId ?? "");
      const version = String(api.productVersion ?? api.assetVersion ?? "");
      const exchUrl = assetId && version ? exchangeAssetUrl(groupId, assetId, version) : undefined;

      return { ...api, policies, contracts, exchangeUrl: exchUrl };
    }),
  );
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerApiManagerTools(server: McpServer): void {
  // ── Discovery ──────────────────────────────────────────────────────────────

  registerAppResource(
    server,
    "API Manager APIs",
    API_MANAGER_APIS_URI,
    { description: "Visual table of API Manager API instances with policies, contracts, and Exchange links." },
    async () => {
      const orgId = organizationId();
      const envId = environmentId();
      const raw = await anypointRequest(apisBase(orgId, envId), { query: { limit: 25, offset: 0 } });
      const items: unknown[] = Array.isArray(raw)
        ? raw
        : isRecord(raw) && Array.isArray(raw.assets)
          ? raw.assets
          : [];
      const enriched = await enrichApiInstances(orgId, envId, items);
      const html = renderApiManagerApisHtml(enriched);
      const resource = createUIResource({
        uri: API_MANAGER_APIS_URI,
        content: { type: "rawHtml", htmlString: html },
        encoding: "text",
      });
      return { contents: [resource.resource] };
    },
  );

  registerAppTool(
    server,
    "api_manager_list_apis",
    {
      title: "API Manager: List API Instances",
      description:
        "List API Manager API instances in an environment. Returns an interactive UI showing each API's applied policies, contract count, endpoint URL, status, and Exchange link — all in one view. Use the apiId from this result with policy action tools.",
      inputSchema: {
        ...scopeInput,
        query: z.string().optional().describe("Search filter."),
        limit: z.number().int().positive().max(100).default(25),
        offset: z.number().int().nonnegative().default(0),
      },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: API_MANAGER_APIS_URI } },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, query, limit, offset }) => {
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);
      const raw = await anypointRequest(apisBase(orgId, envId), {
        query: { query, limit, offset },
      });
      const items: unknown[] = Array.isArray(raw)
        ? raw
        : isRecord(raw) && Array.isArray(raw.assets)
          ? raw.assets
          : [];
      const enriched = await enrichApiInstances(orgId, envId, items);
      return {
        content: [{ type: "text" as const, text: `Found ${enriched.length} API instance(s).` }],
      };
    },
  );

  // ── Policy Actions ─────────────────────────────────────────────────────────

  server.registerTool(
    "api_manager_apply_policy",
    {
      title: "API Manager: Apply Policy",
      description:
        "Apply a policy to an API Manager API instance. Call api_manager_list_apis first to obtain the apiId.",
      inputSchema: {
        ...apiScopeInput,
        ...policyAssetInput,
        configurationData: z.record(z.string(), z.unknown()).optional().describe("Policy configuration key-value pairs."),
        pointcutData: z.record(z.string(), z.unknown()).nullable().optional(),
        order: z.number().int().optional(),
        disabled: z.boolean().optional(),
      },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, apiId, policyTemplateId, groupId, assetId, assetVersion, configurationData, pointcutData, order, disabled }) => {
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);
      const body = compactObject({
        ...policyAssetPayload({ policyTemplateId, groupId, assetId, assetVersion }),
        configurationData,
        pointcutData,
        order,
        disabled,
      });
      return toolResult(
        await anypointRequest(policiesPath(orgId, envId, apiId), { method: "POST", body: body as JsonValue }),
      );
    },
  );

  server.registerTool(
    "api_manager_update_policy",
    {
      title: "API Manager: Update Policy",
      description:
        "Update the configuration of an applied policy on an API Manager API instance. Call api_manager_list_apis first to obtain apiId and policyId.",
      inputSchema: {
        ...apiScopeInput,
        policyId: z.string().min(1).describe("Policy ID. Visible in the api_manager_list_apis response."),
        ...policyAssetInput,
        configurationData: z.record(z.string(), z.unknown()).optional(),
        pointcutData: z.record(z.string(), z.unknown()).nullable().optional(),
        order: z.number().int().optional(),
        disabled: z.boolean().optional(),
      },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, apiId, policyId, policyTemplateId, groupId, assetId, assetVersion, configurationData, pointcutData, order, disabled }) => {
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);
      const body = compactObject({
        ...policyAssetPayload({ policyTemplateId, groupId, assetId, assetVersion }),
        configurationData,
        pointcutData,
        order,
        disabled,
      });
      return toolResult(
        await anypointRequest(policyPath(orgId, envId, apiId, policyId), { method: "PATCH", body: body as JsonValue }),
      );
    },
  );

  server.registerTool(
    "api_manager_remove_policy",
    {
      title: "API Manager: Remove Policy",
      description:
        "Remove a policy from an API Manager API instance. Call api_manager_list_apis first to obtain apiId and policyId.",
      inputSchema: {
        ...apiScopeInput,
        policyId: z.string().min(1).describe("Policy ID to remove. Visible in the api_manager_list_apis response."),
      },
      annotations: { destructiveHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, apiId, policyId }) => {
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);
      return toolResult(
        await anypointRequest(policyPath(orgId, envId, apiId, policyId), { method: "DELETE" }),
      );
    },
  );

  server.registerTool(
    "api_manager_apply_outbound_policy",
    {
      title: "API Manager: Apply Outbound Policy",
      description:
        "Apply an outbound policy to an API Manager API instance. Call api_manager_list_apis first to obtain the apiId.",
      inputSchema: {
        ...apiScopeInput,
        body: z.record(z.string(), z.unknown()).describe("Outbound policy request body per API Manager xAPI schema."),
      },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, apiId, body }) => {
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);
      return toolResult(
        await anypointRequest(outboundPoliciesPath(orgId, envId, apiId), {
          method: "POST",
          body: body as JsonValue,
        }),
      );
    },
  );

  // ── Advanced / Gated ───────────────────────────────────────────────────────

  if (advancedToolsEnabled()) {
  server.registerTool(
    "api_manager_create_api_instance",
    {
      title: "API Manager: Create API Instance [Advanced]",
      description:
        "Create an API Manager API instance. Requires ANYPOINT_MCP_ADVANCED_TOOLS=true.",
      inputSchema: {
        ...scopeInput,
        groupId: z.string().min(1),
        assetId: z.string().min(1),
        assetVersion: z.string().min(1),
        technology: z.enum(["mule4", "mule3", "flexGateway", "serviceMesh"]).default("mule4"),
        endpointUri: z.string().optional(),
        proxyUri: z.string().nullable().optional(),
        isCloudHub: z.boolean().nullable().optional(),
        deploymentType: z.enum(["CH", "HY", "RTF", "MC"]).optional(),
        instanceLabel: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, groupId, assetId, assetVersion, technology, endpointUri, proxyUri, isCloudHub, deploymentType, instanceLabel, tags }) => {
      requireAdvancedTools();
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);
      const body = compactObject({
        spec: { groupId, assetId, version: assetVersion },
        technology,
        instanceLabel,
        tags,
        endpoint: compactObject({ uri: endpointUri, proxyUri, isCloudHub, deploymentType }),
      });
      return toolResult(
        await anypointRequest(apisBase(orgId, envId), { method: "POST", body: body as JsonValue }),
      );
    },
  );

  server.registerTool(
    "api_manager_list_policy_templates",
    {
      title: "API Manager: List Policy Templates [Advanced]",
      description:
        "List available policy templates for an organization. Requires ANYPOINT_MCP_ADVANCED_TOOLS=true. Use this to find valid policyTemplateId values for api_manager_apply_policy.",
      inputSchema: {
        ...optionalOrgId,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride }) => {
      requireAdvancedTools();
      return toolResult(
        await anypointRequest(policyTemplatesPath(organizationId(orgOverride))),
      );
    },
  );
  } // end advancedToolsEnabled
}
