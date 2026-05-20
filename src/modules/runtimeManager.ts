import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { createUIResource } from "@mcp-ui/server";
import { z } from "zod/v4";
import { anypointBaseUrl, anypointRequest, encodePathSegment, environmentId, getAccessToken, organizationId } from "../shared/anypointClient.js";
import { toolResult } from "../shared/mcpResponse.js";

const RUNTIME_DEPLOYMENTS_URI = "ui://anypoint-runtime-manager/deployments" as const;
import { optionalEnvId, optionalOrgId } from "../shared/schemas.js";
import { advancedToolsEnabled, requireAdvancedTools } from "../shared/workflowGuards.js";
import type { JsonValue } from "../shared/types.js";
import { renderRuntimeManagerDeploymentsHtml } from "../ui/runtimeManagerUiRenderer.js";

// ─── Path helpers ─────────────────────────────────────────────────────────────

function deploymentsBase(orgId: string, envId: string): string {
  return `/amc/application-manager/api/v2/organizations/${encodePathSegment(orgId)}/environments/${encodePathSegment(envId)}/deployments`;
}

function deploymentPath(orgId: string, envId: string, id: string): string {
  return `${deploymentsBase(orgId, envId)}/${encodePathSegment(id)}`;
}

function specsPath(orgId: string, envId: string, id: string): string {
  return `${deploymentPath(orgId, envId, id)}/specs`;
}

function logsPath(orgId: string, envId: string, id: string, specId: string): string {
  return `${specsPath(orgId, envId, id)}/${encodePathSegment(specId)}/logs`;
}

function schedulersPath(orgId: string, envId: string, id: string): string {
  return `${deploymentPath(orgId, envId, id)}/schedulers`;
}

function environmentsPath(orgId: string): string {
  return `/accounts/api/organizations/${encodePathSegment(orgId)}/environments`;
}

// ─── Scope input ──────────────────────────────────────────────────────────────

const scopeInput = {
  ...optionalOrgId,
  ...optionalEnvId,
};

// Input for the list tool: env can be specified by ID, by name, or omitted (→ all envs)
const listScopeInput = {
  ...optionalOrgId,
  environmentId: z.string().optional().describe(
    "Specific environment ID. When omitted, deployments from all environments are fetched.",
  ),
  environmentName: z.string().optional().describe(
    "Environment name (case-insensitive). Resolved to an ID automatically. Ignored when environmentId is provided.",
  ),
};

const deploymentInput = {
  ...scopeInput,
  deploymentId: z.string().min(1).describe("Runtime Manager deployment ID. Obtain from runtime_list_deployments."),
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

interface EnvironmentInfo {
  id: string;
  name: string;
  type: string;
}

async function fetchEnvironments(orgId: string): Promise<EnvironmentInfo[]> {
  const raw = await anypointRequest(environmentsPath(orgId));
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.data)
      ? raw.data
      : [];
  return (list as unknown[])
    .filter(isRecord)
    .map((e) => ({
      id: String(e["id"] ?? ""),
      name: String(e["name"] ?? e["id"] ?? ""),
      type: String(e["type"] ?? ""),
    }))
    .filter((e) => e.id.length > 0);
}

async function fetchDeploymentsForEnv(
  orgId: string,
  envId: string,
  envName: string,
  envType: string,
  opts: { targetId?: string; limit: number; offset: number; includeSchedulers: boolean },
): Promise<unknown[]> {
  try {
    const raw = await anypointRequest(deploymentsBase(orgId, envId), {
      query: { targetId: opts.targetId, limit: opts.limit, offset: opts.offset },
    });
    const items: unknown[] = Array.isArray(raw)
      ? raw
      : isRecord(raw) && Array.isArray(raw.items)
        ? raw.items
        : [];
    const enriched = opts.includeSchedulers
      ? await enrichWithSchedulers(orgId, envId, items)
      : items;
    // Tag each deployment with environment info for grouping in the UI
    return enriched.map((d) =>
      isRecord(d) ? { ...d, _environmentId: envId, _environmentName: envName, _environmentType: envType } : d,
    );
  } catch {
    return [];
  }
}

function firstSpecId(specsResponse: unknown): string {
  const list = Array.isArray(specsResponse)
    ? specsResponse
    : isRecord(specsResponse) && Array.isArray(specsResponse.items)
      ? specsResponse.items
      : [];

  for (const spec of list) {
    if (!isRecord(spec)) continue;
    const id = spec.id ?? spec.version ?? spec.specId;
    if (typeof id === "string" && id.length > 0) return id;
  }
  throw new Error("No spec ID found in deployment specs response.");
}

async function patchDesiredState(
  orgId: string,
  envId: string,
  id: string,
  desiredState: "STARTED" | "STOPPED",
): Promise<unknown> {
  return anypointRequest(deploymentPath(orgId, envId, id), {
    method: "PATCH",
    body: { application: { desiredState } },
  });
}

async function enrichWithSchedulers(
  orgId: string,
  envId: string,
  deployments: unknown[],
): Promise<unknown[]> {
  return Promise.all(
    deployments.map(async (d) => {
      if (!isRecord(d)) return d;
      const depId = typeof d.id === "string" ? d.id : undefined;
      if (!depId) return { ...d, schedulers: [] };
      try {
        const raw = await anypointRequest(schedulersPath(orgId, envId, depId));
        const schedulers = Array.isArray(raw)
          ? raw
          : isRecord(raw) && Array.isArray(raw.data)
            ? raw.data
            : [];
        return { ...d, schedulers };
      } catch {
        return { ...d, schedulers: [] };
      }
    }),
  );
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerRuntimeManagerTools(server: McpServer): void {
  // ── Discovery ──────────────────────────────────────────────────────────────────────────────────

  registerAppResource(
    server,
    "Runtime Manager Deployments",
    RUNTIME_DEPLOYMENTS_URI,
    { description: "Visual status dashboard of Runtime Manager application deployments across all environments." },
    async () => {
      const orgId = organizationId();
      const envs = await fetchEnvironments(orgId);
      const perEnvResults = await Promise.all(
        envs.map((env) =>
          fetchDeploymentsForEnv(orgId, env.id, env.name, env.type, {
            limit: 50,
            offset: 0,
            includeSchedulers: true,
          }),
        ),
      );
      const allDeployments = perEnvResults.flat();
      const html = renderRuntimeManagerDeploymentsHtml(allDeployments, {
        token: await getAccessToken(),
        baseUrl: anypointBaseUrl(),
        orgId,
      });
      const resource = createUIResource({
        uri: RUNTIME_DEPLOYMENTS_URI,
        content: { type: "rawHtml", htmlString: html },
        encoding: "text",
      });
      return { contents: [resource.resource] };
    },
  );

  registerAppTool(
    server,
    "runtime_list_deployments",
    {
      title: "Runtime Manager: List Deployments",
      description:
        "List Runtime Manager application deployments. " +
        "When neither environmentId nor environmentName is provided, deployments from ALL environments are fetched in parallel and combined. " +
        "Provide environmentName (e.g. \"Production\") to scope to one environment by name, or environmentId for an exact match. " +
        "Returns an interactive UI with status badges, CloudHub URLs, Exchange links, and scheduler details. " +
        "Use deploymentId values from this result with action tools.",
      inputSchema: {
        ...listScopeInput,
        targetId: z.string().optional().describe("Filter by target ID (CloudHub 2.0 or RTF target)."),
        limit: z.number().int().positive().max(200).default(50),
        offset: z.number().int().nonnegative().default(0),
        includeSchedulers: z.boolean().default(true).describe("Fetch scheduler details per deployment (one extra API call per deployment)."),
      },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: RUNTIME_DEPLOYMENTS_URI } },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, environmentName, targetId, limit, offset, includeSchedulers }) => {
      const orgId = organizationId(orgOverride);
      const opts = { targetId, limit, offset, includeSchedulers };

      // ── Workflow step 1: explicit environmentId provided ──────────────────
      if (envOverride) {
        const deployments = await fetchDeploymentsForEnv(orgId, envOverride, envOverride, "", opts);
        return {
          content: [{
            type: "text" as const,
            text: `Found ${deployments.length} deployment(s) in environment ${envOverride}.`,
          }],
        };
      }

      // ── Workflow step 2: environmentName provided — resolve to ID ─────────
      if (environmentName) {
        const envs = await fetchEnvironments(orgId);
        const matched = envs.find(
          (e) => e.name.toLowerCase() === environmentName.toLowerCase(),
        );
        if (!matched) {
          const available = envs.map((e) => `"${e.name}"`).join(", ");
          return {
            content: [{
              type: "text" as const,
              text: `No environment found matching "${environmentName}". Available environments: ${available || "(none found)"}`,
            }],
            isError: true,
          };
        }
        const deployments = await fetchDeploymentsForEnv(orgId, matched.id, matched.name, matched.type, opts);
        return {
          content: [{
            type: "text" as const,
            text: `Found ${deployments.length} deployment(s) in environment "${matched.name}" (${matched.id}).`,
          }],
        };
      }

      // ── Workflow step 3: no env specified — fetch from all environments ───
      const envs = await fetchEnvironments(orgId);
      const perEnvResults = await Promise.all(
        envs.map((env) => fetchDeploymentsForEnv(orgId, env.id, env.name, env.type, opts)),
      );
      const allDeployments = perEnvResults.flat();
      const perEnvSummary = envs
        .map((env, i) => `${env.name} (${perEnvResults[i]!.length})`)
        .join(", ");
      return {
        content: [{
          type: "text" as const,
          text:
            `Found ${allDeployments.length} deployment(s) across ${envs.length} environment(s): ${perEnvSummary || "(no environments)"}`,
        }],
      };
    },
  );

  // ── Detail ─────────────────────────────────────────────────────────────────

  server.registerTool(
    "runtime_get_deployment",
    {
      title: "Runtime Manager: Get Deployment Config",
      description:
        "Get full configuration for one Runtime Manager deployment — properties, environment variables, specs, and target config. Call runtime_list_deployments first to obtain the deploymentId.",
      inputSchema: deploymentInput,
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId }) => {
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);
      const [detail, specs] = await Promise.all([
        anypointRequest(deploymentPath(orgId, envId, deploymentId)),
        anypointRequest(specsPath(orgId, envId, deploymentId)).catch(() => null),
      ]);
      return toolResult({ deployment: detail, specs });
    },
  );

  server.registerTool(
    "runtime_get_logs",
    {
      title: "Runtime Manager: Get Application Logs",
      description:
        "Fetch logs for a Runtime Manager deployment. Call runtime_list_deployments first to obtain the deploymentId.",
      inputSchema: {
        ...deploymentInput,
        specId: z.string().optional().describe("Deployment spec ID. Auto-resolved from the first spec when omitted."),
        size: z.number().int().positive().max(500).default(100),
        offset: z.number().int().nonnegative().default(0),
        descending: z.boolean().default(true),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId, specId, size, offset, descending, startTime, endTime }) => {
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);
      const resolvedSpecId =
        specId ?? firstSpecId(await anypointRequest(specsPath(orgId, envId, deploymentId)));
      const logs = await anypointRequest(logsPath(orgId, envId, deploymentId, resolvedSpecId), {
        query: { size, offset, descending, startTime, endTime },
      });
      return toolResult({ deploymentId, specId: resolvedSpecId, logs });
    },
  );

  // ── Actions ────────────────────────────────────────────────────────────────

  server.registerTool(
    "runtime_start_application",
    {
      title: "Runtime Manager: Start Application",
      description:
        "Start a stopped Runtime Manager application. Call runtime_list_deployments first to obtain the deploymentId.",
      inputSchema: deploymentInput,
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId }) =>
      toolResult(await patchDesiredState(organizationId(orgOverride), environmentId(envOverride), deploymentId, "STARTED")),
  );

  server.registerTool(
    "runtime_stop_application",
    {
      title: "Runtime Manager: Stop Application",
      description:
        "Stop a running Runtime Manager application. Call runtime_list_deployments first to obtain the deploymentId.",
      inputSchema: deploymentInput,
      annotations: { destructiveHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId }) =>
      toolResult(await patchDesiredState(organizationId(orgOverride), environmentId(envOverride), deploymentId, "STOPPED")),
  );

  server.registerTool(
    "runtime_restart_application",
    {
      title: "Runtime Manager: Restart Application",
      description:
        "Restart a Runtime Manager application (stop then start). Call runtime_list_deployments first to obtain the deploymentId.",
      inputSchema: deploymentInput,
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId }) => {
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);
      const stop = await patchDesiredState(orgId, envId, deploymentId, "STOPPED");
      const start = await patchDesiredState(orgId, envId, deploymentId, "STARTED");
      return toolResult({ stop, start });
    },
  );

  server.registerTool(
    "runtime_set_scheduler_state",
    {
      title: "Runtime Manager: Enable/Disable Scheduler",
      description:
        "Enable or disable a specific scheduler on a Runtime Manager application. Scheduler names are visible in the runtime_list_deployments UI. Call runtime_list_deployments first to obtain the deploymentId and scheduler name.",
      inputSchema: {
        ...deploymentInput,
        schedulerName: z.string().min(1).describe("Scheduler flow name as shown in runtime_list_deployments."),
        enabled: z.boolean().describe("true to enable, false to disable the scheduler."),
      },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId, schedulerName, enabled }) => {
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);
      const result = await anypointRequest(
        `${schedulersPath(orgId, envId, deploymentId)}/${encodePathSegment(schedulerName)}`,
        { method: "PATCH", body: { enabled } },
      );
      return toolResult(result);
    },
  );

  // ── Advanced / Gated ───────────────────────────────────────────────────────

  if (advancedToolsEnabled()) {
  server.registerTool(
    "runtime_create_deployment",
    {
      title: "Runtime Manager: Create Deployment [Advanced]",
      description:
        "Create a new Runtime Manager deployment. Requires ANYPOINT_MCP_ADVANCED_TOOLS=true. Body follows the AMC Application Manager API v2 schema.",
      inputSchema: {
        ...scopeInput,
        body: z.record(z.string(), z.unknown()).describe("Full deployment request body."),
      },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, body }) => {
      requireAdvancedTools();
      return toolResult(
        await anypointRequest(deploymentsBase(organizationId(orgOverride), environmentId(envOverride)), {
          method: "POST",
          body: body as JsonValue,
        }),
      );
    },
  );

  server.registerTool(
    "runtime_update_deployment",
    {
      title: "Runtime Manager: Update Deployment [Advanced]",
      description:
        "Patch a Runtime Manager deployment configuration. Requires ANYPOINT_MCP_ADVANCED_TOOLS=true.",
      inputSchema: {
        ...deploymentInput,
        body: z.record(z.string(), z.unknown()).describe("Partial deployment update body per AMC API PATCH schema."),
      },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, deploymentId, body }) => {
      requireAdvancedTools();
      return toolResult(
        await anypointRequest(
          deploymentPath(organizationId(orgOverride), environmentId(envOverride), deploymentId),
          { method: "PATCH", body: body as JsonValue },
        ),
      );
    },
  );
  } // end advancedToolsEnabled
}
