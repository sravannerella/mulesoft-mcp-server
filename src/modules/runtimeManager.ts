import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { anypointRequest, encodePathSegment, environmentId, organizationId } from "../shared/anypointClient.js";
import { toolResult } from "../shared/mcpResponse.js";
import { asJsonValue, optionalEnvId, optionalOrgId, rawRequestInput } from "../shared/schemas.js";
import type { AnypointModule, JsonValue } from "../shared/types.js";
import { assertPathPrefix, registerEndpointResource } from "./resources.js";

const runtimeModule: AnypointModule = {
  name: "runtime-manager",
  displayName: "AMC Application Manager API",
  resourceUri: "anypoint-runtime-manager://endpoints",
  docsUrl: "https://dev-portal.mulesoft.com/apis/amc-application-manager.html",
  endpoints: [
    "GET /amc/application-manager/api/v2/organizations/{organizationId}/environments/{environmentId}/deployments",
    "POST /amc/application-manager/api/v2/organizations/{organizationId}/environments/{environmentId}/deployments",
    "GET /amc/application-manager/api/v2/organizations/{organizationId}/environments/{environmentId}/deployments/{deploymentId}",
    "PATCH /amc/application-manager/api/v2/organizations/{organizationId}/environments/{environmentId}/deployments/{deploymentId}",
    "DELETE /amc/application-manager/api/v2/organizations/{organizationId}/environments/{environmentId}/deployments/{deploymentId}",
    "PATCH /amc/application-manager/api/v2/organizations/{organizationId}/environments/{environmentId}/deployments/{deploymentId} { application.desiredState: STARTED }",
    "PATCH /amc/application-manager/api/v2/organizations/{organizationId}/environments/{environmentId}/deployments/{deploymentId} { application.desiredState: STOPPED }",
    "GET /amc/application-manager/api/v2/organizations/{organizationId}/environments/{environmentId}/deployments/{deploymentId}/specs",
    "GET /amc/application-manager/api/v2/organizations/{organizationId}/environments/{environmentId}/deployments/{deploymentId}/specs/{specId}/logs",
  ],
};

function runtimeBase(orgId: string, envId: string): string {
  return `/amc/application-manager/api/v2/organizations/${encodePathSegment(orgId)}/environments/${encodePathSegment(envId)}`;
}

function deploymentsPath(orgId: string, envId: string): string {
  return `${runtimeBase(orgId, envId)}/deployments`;
}

function deploymentPath(orgId: string, envId: string, deploymentId: string): string {
  return `${deploymentsPath(orgId, envId)}/${encodePathSegment(deploymentId)}`;
}

function deploymentSpecsPath(orgId: string, envId: string, deploymentId: string): string {
  return `${deploymentPath(orgId, envId, deploymentId)}/specs`;
}

function deploymentLogsPath(orgId: string, envId: string, deploymentId: string, specId: string): string {
  return `${deploymentSpecsPath(orgId, envId, deploymentId)}/${encodePathSegment(specId)}/logs`;
}

const runtimeScopeInput = {
  ...optionalOrgId,
  ...optionalEnvId,
};

const deploymentInput = {
  ...runtimeScopeInput,
  deploymentId: z.string().min(1),
};

const runtimeLogsInput = {
  ...deploymentInput,
  specId: z.string().min(1).optional().describe("Deployment spec ID. When omitted, the first deployment spec is used."),
  size: z.number().int().positive().max(500).default(100),
  offset: z.number().int().nonnegative().default(0),
  descending: z.boolean().default(true),
  startTime: z.string().min(1).optional(),
  endTime: z.string().min(1).optional(),
};

function candidateSpecId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const id = record.id ?? record.version ?? record.specId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function firstSpecId(specsResponse: unknown): string {
  let specs: unknown[] | undefined;

  if (Array.isArray(specsResponse)) {
    specs = specsResponse;
  } else if (typeof specsResponse === "object" && specsResponse !== null) {
    const items = (specsResponse as Record<string, unknown>).items;
    if (Array.isArray(items)) {
      specs = items;
    }
  }

  if (!specs) {
    throw new Error("Unable to resolve Runtime Manager deployment spec: specs response was not a list");
  }

  for (const spec of specs) {
    const id = candidateSpecId(spec);
    if (id) {
      return id;
    }
  }

  throw new Error("Unable to resolve Runtime Manager deployment spec: no spec id was found");
}

async function fetchRuntimeLogs(
  orgOverride: string | undefined,
  envOverride: string | undefined,
  deploymentId: string,
  specOverride: string | undefined,
  query: {
    size: number;
    offset: number;
    descending: boolean;
    startTime?: string;
    endTime?: string;
  },
) {
  const orgId = organizationId(orgOverride);
  const envId = environmentId(envOverride);
  const specId = specOverride ?? firstSpecId(await anypointRequest(deploymentSpecsPath(orgId, envId, deploymentId)));

  return toolResult({
    deploymentId,
    specId,
    logs: await anypointRequest(deploymentLogsPath(orgId, envId, deploymentId, specId), {
      query,
    }),
  });
}

async function runDeploymentAction(
  action: "start" | "stop" | "restart",
  orgOverride: string | undefined,
  envOverride: string | undefined,
  deploymentId: string,
) {
  const orgId = organizationId(orgOverride);
  const envId = environmentId(envOverride);
  const path = deploymentPath(orgId, envId, deploymentId);
  const patchDesiredState = (desiredState: "STARTED" | "STOPPED") =>
    anypointRequest(path, {
      method: "PATCH",
      body: {
        application: {
          desiredState,
        },
      },
    });

  if (action === "restart") {
    const stopResult = await patchDesiredState("STOPPED");
    const startResult = await patchDesiredState("STARTED");
    return toolResult({
      stopResult,
      startResult,
    });
  }

  return toolResult(
    await patchDesiredState(action === "start" ? "STARTED" : "STOPPED"),
  );
}

async function patchDeployment(
  orgOverride: string | undefined,
  envOverride: string | undefined,
  deploymentId: string,
  body: JsonValue,
) {
  return toolResult(
    await anypointRequest(deploymentPath(organizationId(orgOverride), environmentId(envOverride), deploymentId), {
      method: "PATCH",
      body,
    }),
  );
}

export function registerRuntimeManagerTools(server: McpServer): void {
  registerEndpointResource(server, runtimeModule);

  server.registerTool(
    "runtime_list_deployments",
    {
      title: "List runtime deployments",
      description: "List Runtime Manager application deployments in an environment.",
      inputSchema: {
        ...runtimeScopeInput,
        targetId: z.string().optional(),
        limit: z.number().int().positive().optional(),
        offset: z.number().int().nonnegative().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, targetId, limit, offset }) =>
      toolResult(await anypointRequest(deploymentsPath(organizationId(orgOverride), environmentId(envOverride)), { query: { targetId, limit, offset } })),
  );

  server.registerTool(
    "runtime_get_deployment",
    {
      title: "Get runtime deployment",
      description: "Get details for one Runtime Manager application deployment.",
      inputSchema: deploymentInput,
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId }) =>
      toolResult(await anypointRequest(deploymentPath(organizationId(orgOverride), environmentId(envOverride), deploymentId))),
  );

  server.registerTool(
    "runtime_create_deployment",
    {
      title: "Create runtime deployment",
      description: "Create a Runtime Manager application deployment. The body follows the AMC Application Manager API schema.",
      inputSchema: {
        ...runtimeScopeInput,
        body: z.record(z.string(), z.unknown()),
      },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, body }) =>
      toolResult(await anypointRequest(deploymentsPath(organizationId(orgOverride), environmentId(envOverride)), { method: "POST", body: body as JsonValue })),
  );

  server.registerTool(
    "runtime_update_deployment",
    {
      title: "Update runtime deployment",
      description: "Patch a Runtime Manager application deployment. The body follows the AMC Application Manager API schema.",
      inputSchema: {
        ...deploymentInput,
        body: z.record(z.string(), z.unknown()),
      },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId, body }) =>
      patchDeployment(orgOverride, envOverride, deploymentId, body as JsonValue),
  );

  server.registerTool(
    "runtime_start_application",
    {
      title: "Start Runtime Manager application",
      description: "Start an application deployment in Runtime Manager.",
      inputSchema: deploymentInput,
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId }) =>
      runDeploymentAction("start", orgOverride, envOverride, deploymentId),
  );

  server.registerTool(
    "runtime_stop_application",
    {
      title: "Stop Runtime Manager application",
      description: "Stop an application deployment in Runtime Manager.",
      inputSchema: deploymentInput,
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId }) =>
      runDeploymentAction("stop", orgOverride, envOverride, deploymentId),
  );

  server.registerTool(
    "runtime_restart_application",
    {
      title: "Restart Runtime Manager application",
      description: "Restart an application deployment in Runtime Manager.",
      inputSchema: deploymentInput,
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId }) =>
      runDeploymentAction("restart", orgOverride, envOverride, deploymentId),
  );

  server.registerTool(
    "runtime_start_deployment",
    {
      title: "Start runtime deployment",
      description: "Backward-compatible alias for runtime_start_application.",
      inputSchema: deploymentInput,
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId }) =>
      runDeploymentAction("start", orgOverride, envOverride, deploymentId),
  );

  server.registerTool(
    "runtime_stop_deployment",
    {
      title: "Stop runtime deployment",
      description: "Backward-compatible alias for runtime_stop_application.",
      inputSchema: deploymentInput,
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId }) =>
      runDeploymentAction("stop", orgOverride, envOverride, deploymentId),
  );

  server.registerTool(
    "runtime_restart_deployment",
    {
      title: "Restart runtime deployment",
      description: "Backward-compatible alias for runtime_restart_application.",
      inputSchema: deploymentInput,
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId }) =>
      runDeploymentAction("restart", orgOverride, envOverride, deploymentId),
  );

  server.registerTool(
    "runtime_delete_deployment",
    {
      title: "Delete runtime deployment",
      description: "Delete a Runtime Manager application deployment.",
      inputSchema: deploymentInput,
      annotations: { destructiveHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId }) =>
      toolResult(await anypointRequest(deploymentPath(organizationId(orgOverride), environmentId(envOverride), deploymentId), { method: "DELETE" })),
  );

  server.registerTool(
    "runtime_watch_logs",
    {
      title: "Watch runtime logs",
      description: "Fetch recent Runtime Manager logs for a deployment spec. This is a bounded log read, not a long-running stream.",
      inputSchema: runtimeLogsInput,
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId, specId, size, offset, descending, startTime, endTime }) =>
      fetchRuntimeLogs(orgOverride, envOverride, deploymentId, specId, { size, offset, descending, startTime, endTime }),
  );

  server.registerTool(
    "watch_runtime_logs",
    {
      title: "Watch runtime logs",
      description: "Backward-compatible alias for runtime_watch_logs.",
      inputSchema: runtimeLogsInput,
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId, specId, size, offset, descending, startTime, endTime }) =>
      fetchRuntimeLogs(orgOverride, envOverride, deploymentId, specId, { size, offset, descending, startTime, endTime }),
  );

  server.registerTool(
    "runtime_raw_request",
    {
      title: "Runtime Manager raw request",
      description: "Call an AMC Application Manager path under /amc/application-manager/api. Use for documented endpoints not wrapped yet.",
      inputSchema: rawRequestInput,
    },
    async ({ path, method, body }) => {
      assertPathPrefix(path, ["/amc/application-manager/api"]);
      return toolResult(await anypointRequest(path, { method, body: asJsonValue(body) }));
    },
  );
}
