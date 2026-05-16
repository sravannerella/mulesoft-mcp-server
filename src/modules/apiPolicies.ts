import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { anypointRequest, encodePathSegment, environmentId, organizationId } from "../shared/anypointClient.js";
import { toolResult } from "../shared/mcpResponse.js";
import { asJsonValue, optionalEnvId, optionalOrgId } from "../shared/schemas.js";
import type { AnypointModule, JsonValue } from "../shared/types.js";
import { registerEndpointResource } from "./resources.js";

const apiPoliciesModule: AnypointModule = {
  name: "api-policies",
  displayName: "API Manager Policies",
  resourceUri: "anypoint-api-policies://endpoints",
  docsUrl: "https://dev-portal.mulesoft.com/apis/api-manager.html",
  endpoints: [
    "GET /apimanager/api/v1/organizations/{organizationId}/policy-templates",
    "GET /apimanager/api/v1/organizations/{organizationId}/environments/{environmentId}/apis/{apiId}/policies",
    "POST /apimanager/api/v1/organizations/{organizationId}/environments/{environmentId}/apis/{apiId}/policies",
    "PATCH /apimanager/api/v1/organizations/{organizationId}/environments/{environmentId}/apis/{apiId}/policies/{policyId}",
    "DELETE /apimanager/api/v1/organizations/{organizationId}/environments/{environmentId}/apis/{apiId}/policies/{policyId}",
    "POST /apimanager/xapi/v1/organizations/{organizationId}/environments/{environmentId}/apis/{apiId}/policies/outbound-policies",
  ],
};

function basePath(orgId: string, envId: string): string {
  return `/apimanager/api/v1/organizations/${encodePathSegment(orgId)}/environments/${encodePathSegment(envId)}`;
}

function xapiBasePath(orgId: string, envId: string): string {
  return `/apimanager/xapi/v1/organizations/${encodePathSegment(orgId)}/environments/${encodePathSegment(envId)}`;
}

function apiPath(orgId: string, envId: string, apiId: string): string {
  return `${basePath(orgId, envId)}/apis/${encodePathSegment(apiId)}`;
}

function xapiApiPath(orgId: string, envId: string, apiId: string): string {
  return `${xapiBasePath(orgId, envId)}/apis/${encodePathSegment(apiId)}`;
}

function policiesPath(orgId: string, envId: string, apiId: string): string {
  return `${apiPath(orgId, envId, apiId)}/policies`;
}

function policyPath(orgId: string, envId: string, apiId: string, policyId: string): string {
  return `${policiesPath(orgId, envId, apiId)}/${encodePathSegment(policyId)}`;
}

const apiPolicyScopeInput = {
  ...optionalOrgId,
  ...optionalEnvId,
  apiId: z.string().min(1).describe("API Manager API instance ID."),
};

const policyAssetInput = {
  policyTemplateId: z.string().min(1).optional().describe("Classic policy template ID, for example client-id-enforcement."),
  groupId: z.string().min(1).optional().describe("Policy asset group ID for newer policy asset payloads."),
  assetId: z.string().min(1).optional().describe("Policy asset ID, for example client-id-enforcement."),
  assetVersion: z.string().min(1).optional().describe("Policy asset version."),
};

function resolveScope(orgOverride: string | undefined, envOverride: string | undefined) {
  return {
    orgId: organizationId(orgOverride),
    envId: environmentId(envOverride),
  };
}

function policyAssetPayload(input: {
  policyTemplateId?: string;
  groupId?: string;
  assetId?: string;
  assetVersion?: string;
}) {
  const hasAssetGav = input.groupId || input.assetId || input.assetVersion;
  if (!input.policyTemplateId && !hasAssetGav) {
    throw new Error("Provide policyTemplateId or groupId, assetId, and assetVersion.");
  }

  if (hasAssetGav && (!input.groupId || !input.assetId || !input.assetVersion)) {
    throw new Error("Policy asset payload requires groupId, assetId, and assetVersion together.");
  }

  return {
    ...(input.policyTemplateId ? { policyTemplateId: input.policyTemplateId } : {}),
    ...(input.groupId ? { groupId: input.groupId, assetId: input.assetId, assetVersion: input.assetVersion } : {}),
  };
}

function createPolicyBody(input: {
  policyTemplateId?: string;
  groupId?: string;
  assetId?: string;
  assetVersion?: string;
  configurationData?: Record<string, unknown>;
  pointcutData?: Record<string, unknown> | null;
  order?: number;
  disabled?: boolean;
}) {
  return {
    ...policyAssetPayload(input),
    configurationData: input.configurationData ?? {},
    pointcutData: input.pointcutData ?? null,
    ...(input.order === undefined ? {} : { order: input.order }),
    ...(input.disabled === undefined ? {} : { disabled: input.disabled }),
  } as JsonValue;
}

export function registerApiPolicyTools(server: McpServer): void {
  registerEndpointResource(server, apiPoliciesModule);

  server.registerTool(
    "api_policy_list_templates",
    {
      title: "List API policy templates",
      description: "List available API Manager policy templates for an organization.",
      inputSchema: {
        ...optionalOrgId,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride }) =>
      toolResult(await anypointRequest(`/apimanager/api/v1/organizations/${encodePathSegment(organizationId(orgOverride))}/policy-templates`)),
  );

  server.registerTool(
    "api_policy_list",
    {
      title: "List API policies",
      description: "List policies applied to an API Manager API instance.",
      inputSchema: apiPolicyScopeInput,
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, apiId }) => {
      const { orgId, envId } = resolveScope(orgOverride, envOverride);
      return toolResult(await anypointRequest(policiesPath(orgId, envId, apiId)));
    },
  );

  server.registerTool(
    "api_policy_apply",
    {
      title: "Apply API policy",
      description: "Apply an inbound API-level policy to an API Manager API instance.",
      inputSchema: {
        ...apiPolicyScopeInput,
        ...policyAssetInput,
        configurationData: z.record(z.string(), z.unknown()).default({}),
        pointcutData: z.record(z.string(), z.unknown()).nullable().default(null),
        order: z.number().int().positive().optional(),
        disabled: z.boolean().optional(),
      },
    },
    async ({
      organizationId: orgOverride,
      environmentId: envOverride,
      apiId,
      policyTemplateId,
      groupId,
      assetId,
      assetVersion,
      configurationData,
      pointcutData,
      order,
      disabled,
    }) => {
      const { orgId, envId } = resolveScope(orgOverride, envOverride);
      return toolResult(
        await anypointRequest(policiesPath(orgId, envId, apiId), {
          method: "POST",
          body: createPolicyBody({
            policyTemplateId,
            groupId,
            assetId,
            assetVersion,
            configurationData,
            pointcutData,
            order,
            disabled,
          }),
        }),
      );
    },
  );

  server.registerTool(
    "api_policy_update",
    {
      title: "Update API policy",
      description: "Update an applied API-level policy configuration.",
      inputSchema: {
        ...apiPolicyScopeInput,
        policyId: z.string().min(1),
        configurationData: z.record(z.string(), z.unknown()).optional(),
        pointcutData: z.record(z.string(), z.unknown()).nullable().optional(),
        order: z.number().int().positive().optional(),
        disabled: z.boolean().optional(),
      },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, apiId, policyId, configurationData, pointcutData, order, disabled }) => {
      const { orgId, envId } = resolveScope(orgOverride, envOverride);
      return toolResult(
        await anypointRequest(policyPath(orgId, envId, apiId, policyId), {
          method: "PATCH",
          body: asJsonValue({
            ...(configurationData === undefined ? {} : { configurationData }),
            ...(pointcutData === undefined ? {} : { pointcutData }),
            ...(order === undefined ? {} : { order }),
            ...(disabled === undefined ? {} : { disabled }),
          }),
        }),
      );
    },
  );

  server.registerTool(
    "api_policy_delete",
    {
      title: "Delete API policy",
      description: "Remove an applied API-level policy from an API Manager API instance.",
      inputSchema: {
        ...apiPolicyScopeInput,
        policyId: z.string().min(1),
      },
      annotations: { destructiveHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, apiId, policyId }) => {
      const { orgId, envId } = resolveScope(orgOverride, envOverride);
      return toolResult(await anypointRequest(policyPath(orgId, envId, apiId, policyId), { method: "DELETE" }));
    },
  );

  server.registerTool(
    "api_policy_apply_outbound",
    {
      title: "Apply outbound API policy",
      description: "Apply an outbound policy to one or more upstreams for an API Manager API instance.",
      inputSchema: {
        ...apiPolicyScopeInput,
        groupId: z.string().min(1),
        assetId: z.string().min(1),
        assetVersion: z.string().min(1),
        upstreamIds: z.array(z.string().min(1)).min(1),
        configurationData: z.record(z.string(), z.unknown()).default({}),
        order: z.number().int().positive().optional(),
      },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, apiId, groupId, assetId, assetVersion, upstreamIds, configurationData, order }) => {
      const { orgId, envId } = resolveScope(orgOverride, envOverride);
      return toolResult(
        await anypointRequest(`${xapiApiPath(orgId, envId, apiId)}/policies/outbound-policies`, {
          method: "POST",
          body: asJsonValue({
            groupId,
            assetId,
            assetVersion,
            upstreamIds,
            configurationData,
            ...(order === undefined ? {} : { order }),
          }),
        }),
      );
    },
  );
}
