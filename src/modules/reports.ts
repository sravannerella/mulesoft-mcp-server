import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { anypointRequest, encodePathSegment, organizationId } from "../shared/anypointClient.js";
import { toolResult } from "../shared/mcpResponse.js";
import { optionalOrgId } from "../shared/schemas.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type EnvironmentSummary = {
  id: string;
  name: string;
  type?: string;
};

// ─── Utility helpers ──────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numericStringValue(value: unknown): number | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return numberValue(value);
}

function collectionItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  for (const key of ["items", "data", "environments", "apis", "deployments", "applications", "assets"]) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function getPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function quoteAmql(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function metricRows(value: unknown): Record<string, unknown>[] {
  return collectionItems(value).filter(isRecord);
}

function metricValue(row: Record<string, unknown>, candidates: string[]): unknown {
  for (const candidate of candidates) {
    if (candidate in row) return row[candidate];
  }
  const lowered = candidates.map((c) => c.toLowerCase());
  for (const [key, v] of Object.entries(row)) {
    if (lowered.includes(key.toLowerCase())) return v;
  }
  return undefined;
}

function parseDurationMs(duration: string): number {
  const match = duration.match(/^(\d+)(m|h|d)$/);
  if (!match) throw new Error("duration must use m, h, or d units, e.g. 30m, 1h, 7d");
  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return amount * multiplier;
}

function timestampRange(params: { duration?: string; startTimestamp?: string; endTimestamp?: string }) {
  const end = params.endTimestamp ? Date.parse(params.endTimestamp) : Date.now();
  if (!Number.isFinite(end)) throw new Error(`Invalid endTimestamp: ${params.endTimestamp}`);
  const start = params.startTimestamp
    ? Date.parse(params.startTimestamp)
    : end - parseDurationMs(params.duration ?? "1h");
  if (!Number.isFinite(start)) throw new Error(`Invalid startTimestamp: ${params.startTimestamp}`);
  return { start, end };
}

// ─── API path helpers ─────────────────────────────────────────────────────────

function environmentsPath(orgId: string): string {
  return `/accounts/api/organizations/${encodePathSegment(orgId)}/environments`;
}

function deploymentsPath(orgId: string, envId: string): string {
  return `/amc/application-manager/api/v2/organizations/${encodePathSegment(orgId)}/environments/${encodePathSegment(envId)}/deployments`;
}

function deploymentPath(orgId: string, envId: string, deploymentId: string): string {
  return `${deploymentsPath(orgId, envId)}/${encodePathSegment(deploymentId)}`;
}

function apisPath(orgId: string, envId: string): string {
  return `/apimanager/api/v1/organizations/${encodePathSegment(orgId)}/environments/${encodePathSegment(envId)}/apis`;
}

function policiesPath(orgId: string, envId: string, apiId: string): string {
  return `${apisPath(orgId, envId)}/${encodePathSegment(apiId)}/policies`;
}

// ─── Shared fetch helpers ─────────────────────────────────────────────────────

function environmentSummary(value: unknown): EnvironmentSummary | undefined {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.id) ?? stringValue(value.environmentId);
  if (!id) return undefined;
  return { id, name: stringValue(value.name) ?? id, type: stringValue(value.type) };
}

async function listEnvironments(orgId: string, environmentIds?: string[]): Promise<EnvironmentSummary[]> {
  const environments = collectionItems(await anypointRequest(environmentsPath(orgId)))
    .map(environmentSummary)
    .filter((e): e is EnvironmentSummary => e !== undefined);
  if (!environmentIds || environmentIds.length === 0) return environments;
  const requested = new Set(environmentIds);
  return environments.filter((e) => requested.has(e.id));
}

async function listDeployments(orgId: string, envId: string): Promise<unknown[]> {
  return collectionItems(
    await anypointRequest(deploymentsPath(orgId, envId), { query: { limit: 200, offset: 0 } }),
  );
}

async function listManagedApis(orgId: string, envId: string): Promise<unknown[]> {
  return collectionItems(
    await anypointRequest(apisPath(orgId, envId), { query: { limit: 200, offset: 0 } }),
  );
}

// ─── Runtime flow count ───────────────────────────────────────────────────────

function deploymentId(value: unknown): string | undefined {
  return stringValue(getPath(value, ["id"])) ?? stringValue(getPath(value, ["deploymentId"]));
}

function deploymentName(value: unknown): string {
  return (
    stringValue(getPath(value, ["name"])) ??
    stringValue(getPath(value, ["application", "name"])) ??
    deploymentId(value) ??
    "unknown"
  );
}

function replicaCount(value: unknown): number {
  return (
    numberValue(getPath(value, ["target", "replicas"])) ??
    numberValue(getPath(value, ["replicas"])) ??
    numberValue(getPath(value, ["workers", "amount"])) ??
    numberValue(getPath(value, ["deploymentSettings", "workers"])) ??
    1
  );
}

function flowCount(value: unknown): number | undefined {
  const direct =
    numberValue(getPath(value, ["flowCount"])) ??
    numberValue(getPath(value, ["flowsCount"])) ??
    numberValue(getPath(value, ["application", "flowCount"])) ??
    numberValue(getPath(value, ["application", "flowsCount"])) ??
    numberValue(getPath(value, ["runtime", "flowCount"]));
  if (direct !== undefined) return direct;
  const flows = getPath(value, ["flows"]) ?? getPath(value, ["application", "flows"]);
  return Array.isArray(flows) ? flows.length : undefined;
}

async function createRuntimeFlowCountReport(params: {
  organizationId?: string;
  environmentIds?: string[];
  fetchDeploymentDetails: boolean;
}) {
  const orgId = organizationId(params.organizationId);
  const environments = await listEnvironments(orgId, params.environmentIds);
  const environmentResults = [];
  let knownTotalFlowCount = 0;
  let knownTotalBillableFlowCount = 0;
  let unknownAppCount = 0;

  for (const environment of environments) {
    const deployments = await listDeployments(orgId, environment.id);
    const apps = [];
    let envKnownFlowCount = 0;
    let envKnownBillableFlowCount = 0;
    let envUnknownAppCount = 0;

    for (const deployment of deployments) {
      const id = deploymentId(deployment);
      const detail =
        params.fetchDeploymentDetails && id
          ? await anypointRequest(deploymentPath(orgId, environment.id, id))
          : deployment;

      const appFlowCount = flowCount(detail);
      const replicas = replicaCount(detail);
      const billableFlowCount = appFlowCount === undefined ? undefined : appFlowCount * replicas;

      if (appFlowCount === undefined) {
        envUnknownAppCount += 1;
      } else {
        envKnownFlowCount += appFlowCount;
        envKnownBillableFlowCount += billableFlowCount ?? appFlowCount;
      }

      apps.push({
        deploymentId: id,
        name: deploymentName(detail),
        status:
          stringValue(getPath(detail, ["status"])) ??
          stringValue(getPath(detail, ["application", "status"])),
        replicas,
        flowCount: appFlowCount ?? "unknown",
        billableFlowCount: billableFlowCount ?? "unknown",
      });
    }

    knownTotalFlowCount += envKnownFlowCount;
    knownTotalBillableFlowCount += envKnownBillableFlowCount;
    unknownAppCount += envUnknownAppCount;

    environmentResults.push({
      environment,
      appCount: deployments.length,
      knownFlowCount: envKnownFlowCount,
      knownBillableFlowCount: envKnownBillableFlowCount,
      unknownAppCount: envUnknownAppCount,
      apps,
    });
  }

  return {
    organizationId: orgId,
    knownTotalFlowCount,
    knownTotalBillableFlowCount,
    unknownAppCount,
    environments: environmentResults,
    notes: [
      "Runtime Manager deployments do not always expose flow counts. Apps without an exposed flow count are marked unknown.",
      "Billable flow count is calculated as flowCount * replicas/workers when both values are available.",
    ],
  };
}

// ─── Insecure APIs ────────────────────────────────────────────────────────────

function apiId(value: unknown): string | undefined {
  return stringValue(getPath(value, ["id"])) ?? stringValue(getPath(value, ["apiId"]));
}

function apiName(value: unknown): string {
  return (
    stringValue(getPath(value, ["name"])) ??
    stringValue(getPath(value, ["assetId"])) ??
    apiId(value) ??
    "unknown"
  );
}

function policyName(value: unknown): string {
  return (
    stringValue(getPath(value, ["policyTemplateId"])) ??
    stringValue(getPath(value, ["templateId"])) ??
    stringValue(getPath(value, ["name"])) ??
    "unknown"
  );
}

async function createInsecureApisReport(params: {
  organizationId?: string;
  environmentIds?: string[];
  requiredPolicyNames?: string[];
}) {
  const orgId = organizationId(params.organizationId);
  const environments = await listEnvironments(orgId, params.environmentIds);
  const requiredPolicyNames = params.requiredPolicyNames ?? [];
  const environmentResults = [];

  for (const environment of environments) {
    const apis = await listManagedApis(orgId, environment.id);
    const insecureApis = [];

    for (const api of apis) {
      const id = apiId(api);
      if (!id) continue;
      const policies = collectionItems(
        await anypointRequest(policiesPath(orgId, environment.id, id)),
      );
      const policyNames = policies.map(policyName);
      const missingRequiredPolicies = requiredPolicyNames.filter((r) => !policyNames.includes(r));
      if (policies.length === 0 || missingRequiredPolicies.length > 0) {
        insecureApis.push({
          apiId: id,
          name: apiName(api),
          policyCount: policies.length,
          policies: policyNames,
          missingRequiredPolicies,
          reason: policies.length === 0 ? "no policies configured" : "missing required policies",
        });
      }
    }

    environmentResults.push({
      environment,
      apiCount: apis.length,
      insecureApiCount: insecureApis.length,
      insecureApis,
    });
  }

  return { organizationId: orgId, requiredPolicyNames, environments: environmentResults };
}

// ─── Metrics API health summary ───────────────────────────────────────────────

function apiSummaryWhere(orgId: string, envId: string, start: number, end: number): string {
  return `"sub_org.id" = ${quoteAmql(orgId)} AND "env.id" = ${quoteAmql(envId)} AND timestamp BETWEEN ${start} AND ${end}`;
}

function apiSummaryQuery(
  select: string,
  orgId: string,
  envId: string,
  start: number,
  end: number,
  groupBy?: string[],
): string {
  const groupClause = groupBy && groupBy.length > 0 ? ` GROUP BY ${groupBy.join(", ")}` : "";
  return `SELECT ${select} FROM "mulesoft.api.summary" WHERE ${apiSummaryWhere(orgId, envId, start, end)}${groupClause}`;
}

function topMetricRows(
  rows: Record<string, unknown>[],
  dimension: string,
): Array<{ value: string; count: number }> {
  return rows
    .map((row) => ({
      value: stringValue(metricValue(row, [dimension])) ?? "unknown",
      count:
        numericStringValue(metricValue(row, ["COUNT(requests)", "count(requests)", "requests"])) ??
        0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

async function runMetricsQuery(query: string, limit = 2000): Promise<Record<string, unknown>[]> {
  return metricRows(
    await anypointRequest("/observability/api/v1/metrics:search", {
      method: "POST",
      query: { offset: 0, limit },
      body: { query },
    }),
  );
}

function incrementMetricRecord(
  records: Map<string, Record<string, unknown>>,
  apiInstanceId: string,
  patch: Record<string, unknown>,
): void {
  const existing = records.get(apiInstanceId) ?? {
    apiInstanceId,
    totalRequests: 0,
    statusCodeGroups: {},
    policyViolations: {},
    topPaths: [],
    topClientIds: [],
  };
  records.set(apiInstanceId, { ...existing, ...patch });
}

async function createMetricsApiHealthSummaryReport(params: {
  organizationId?: string;
  environmentIds?: string[];
  apiInstanceIds?: string[];
  duration?: string;
  startTimestamp?: string;
  endTimestamp?: string;
  includeTopPaths?: boolean;
  includeTopClientIds?: boolean;
}) {
  const orgId = organizationId(params.organizationId);
  const environments = await listEnvironments(orgId, params.environmentIds);
  const { start, end } = timestampRange(params);
  const allowedApiIds = params.apiInstanceIds ? new Set(params.apiInstanceIds) : undefined;
  const environmentResults = [];
  const queryErrors = [];

  for (const environment of environments) {
    const apiRecords = new Map<string, Record<string, unknown>>();
    try {
      // Status code groups
      const statusRows = await runMetricsQuery(
        apiSummaryQuery(
          `COUNT(requests), "api.instance.id", "http.status_code_group"`,
          orgId,
          environment.id,
          start,
          end,
          [`"api.instance.id"`, `"http.status_code_group"`],
        ),
      );
      for (const row of statusRows) {
        const instanceId = stringValue(metricValue(row, ["api.instance.id"])) ?? "unknown";
        if (allowedApiIds && !allowedApiIds.has(instanceId)) continue;
        const statusGroup = stringValue(metricValue(row, ["http.status_code_group"])) ?? "unknown";
        const count =
          numericStringValue(metricValue(row, ["COUNT(requests)", "count(requests)", "requests"])) ?? 0;
        const existing = apiRecords.get(instanceId);
        const statusCodeGroups = {
          ...(isRecord(existing?.statusCodeGroups) ? existing.statusCodeGroups : {}),
          [statusGroup]: count,
        };
        const currentTotal = numericStringValue(existing?.totalRequests) ?? 0;
        incrementMetricRecord(apiRecords, instanceId, {
          totalRequests: currentTotal + count,
          statusCodeGroups,
        });
      }

      // Latency
      const latencyRows = await runMetricsQuery(
        apiSummaryQuery(
          `AVG("response_time"), PERCENTILE("response_time", 0.95), PERCENTILE("response_time", 0.99), "api.instance.id"`,
          orgId,
          environment.id,
          start,
          end,
          [`"api.instance.id"`],
        ),
      );
      for (const row of latencyRows) {
        const instanceId = stringValue(metricValue(row, ["api.instance.id"])) ?? "unknown";
        if (allowedApiIds && !allowedApiIds.has(instanceId)) continue;
        incrementMetricRecord(apiRecords, instanceId, {
          averageResponseTime: numericStringValue(
            metricValue(row, [`AVG(response_time)`, `AVG("response_time")`]),
          ),
          p95ResponseTime: numericStringValue(
            metricValue(row, [
              `PERCENTILE(response_time,0.95)`,
              `PERCENTILE("response_time",0.95)`,
            ]),
          ),
          p99ResponseTime: numericStringValue(
            metricValue(row, [
              `PERCENTILE(response_time,0.99)`,
              `PERCENTILE("response_time",0.99)`,
            ]),
          ),
        });
      }

      // Policy violations
      const violationRows = await runMetricsQuery(
        apiSummaryQuery(
          `COUNT(requests), "api.instance.id", "policy.violation.status"`,
          orgId,
          environment.id,
          start,
          end,
          [`"api.instance.id"`, `"policy.violation.status"`],
        ),
      );
      for (const row of violationRows) {
        const instanceId = stringValue(metricValue(row, ["api.instance.id"])) ?? "unknown";
        const violationStatus = stringValue(metricValue(row, ["policy.violation.status"]));
        if (!violationStatus || (allowedApiIds && !allowedApiIds.has(instanceId))) continue;
        const count =
          numericStringValue(metricValue(row, ["COUNT(requests)", "count(requests)", "requests"])) ?? 0;
        const existing = apiRecords.get(instanceId);
        const policyViolations = {
          ...(isRecord(existing?.policyViolations) ? existing.policyViolations : {}),
          [violationStatus]: count,
        };
        incrementMetricRecord(apiRecords, instanceId, { policyViolations });
      }

      // Top paths (optional)
      if (params.includeTopPaths) {
        const pathRows = await runMetricsQuery(
          apiSummaryQuery(
            `COUNT(requests), "api.instance.id", "endpoint.operation"`,
            orgId,
            environment.id,
            start,
            end,
            [`"api.instance.id"`, `"endpoint.operation"`],
          ),
        );
        for (const instanceId of new Set(
          pathRows.map((r) => stringValue(metricValue(r, ["api.instance.id"])) ?? "unknown"),
        )) {
          if (allowedApiIds && !allowedApiIds.has(instanceId)) continue;
          incrementMetricRecord(apiRecords, instanceId, {
            topPaths: topMetricRows(
              pathRows.filter(
                (r) =>
                  (stringValue(metricValue(r, ["api.instance.id"])) ?? "unknown") === instanceId,
              ),
              "endpoint.operation",
            ),
          });
        }
      }

      // Top client IDs (optional)
      if (params.includeTopClientIds) {
        const clientRows = await runMetricsQuery(
          apiSummaryQuery(
            `COUNT(requests), "api.instance.id", "client.id"`,
            orgId,
            environment.id,
            start,
            end,
            [`"api.instance.id"`, `"client.id"`],
          ),
        );
        for (const instanceId of new Set(
          clientRows.map((r) => stringValue(metricValue(r, ["api.instance.id"])) ?? "unknown"),
        )) {
          if (allowedApiIds && !allowedApiIds.has(instanceId)) continue;
          incrementMetricRecord(apiRecords, instanceId, {
            topClientIds: topMetricRows(
              clientRows.filter(
                (r) =>
                  (stringValue(metricValue(r, ["api.instance.id"])) ?? "unknown") === instanceId,
              ),
              "client.id",
            ),
          });
        }
      }
    } catch (error) {
      queryErrors.push({
        environment,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const apis = [...apiRecords.values()].sort(
      (a, b) =>
        (numericStringValue(b.totalRequests) ?? 0) - (numericStringValue(a.totalRequests) ?? 0),
    );

    environmentResults.push({
      environment,
      apiCount: apis.length,
      totalRequests: apis.reduce(
        (sum, api) => sum + (numericStringValue(api.totalRequests) ?? 0),
        0,
      ),
      apis,
    });
  }

  return {
    organizationId: orgId,
    window: {
      startTimestamp: new Date(start).toISOString(),
      endTimestamp: new Date(end).toISOString(),
      duration: params.duration ?? "1h",
    },
    environments: environmentResults,
    queryErrors,
  };
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerReportsTools(server: McpServer): void {
  server.registerTool(
    "reports_generate",
    {
      title: "Reports: Generate Report",
      description: `Generate an Anypoint operational report on demand (no caching). Three report types are available:
• **runtime_flow_count** — Counts Mule flows per deployment across environments. Helps estimate billable flow usage.
• **api_manager_insecure_apis** — Finds API Manager instances with no policies or missing required security policies.
• **metrics_api_health_summary** — Summarizes API traffic, status codes, response time, and policy violations from the Metrics API.`,
      inputSchema: {
        reportType: z.enum([
          "runtime_flow_count",
          "api_manager_insecure_apis",
          "metrics_api_health_summary",
        ]).describe("The report to generate."),
        ...optionalOrgId,
        environmentIds: z
          .array(z.string().min(1))
          .optional()
          .describe("Limit to specific environment IDs. Omit to include all environments."),
        // runtime_flow_count options
        fetchDeploymentDetails: z
          .boolean()
          .default(true)
          .describe("Fetch individual deployment details for more accurate flow counts. Applies to runtime_flow_count."),
        // api_manager_insecure_apis options
        requiredPolicyNames: z
          .array(z.string().min(1))
          .optional()
          .describe("Policy template IDs that every API must have. Applies to api_manager_insecure_apis."),
        // metrics_api_health_summary options
        apiInstanceIds: z
          .array(z.string().min(1))
          .optional()
          .describe("Limit to specific API instance IDs. Applies to metrics_api_health_summary."),
        duration: z
          .string()
          .default("1h")
          .describe("Lookback window, e.g. 30m, 6h, 7d. Applies to metrics_api_health_summary."),
        startTimestamp: z
          .string()
          .optional()
          .describe("ISO 8601 start time. Overrides duration. Applies to metrics_api_health_summary."),
        endTimestamp: z
          .string()
          .optional()
          .describe("ISO 8601 end time. Defaults to now. Applies to metrics_api_health_summary."),
        includeTopPaths: z
          .boolean()
          .default(false)
          .describe("Include top request paths per API. Applies to metrics_api_health_summary."),
        includeTopClientIds: z
          .boolean()
          .default(false)
          .describe("Include top client IDs per API. Applies to metrics_api_health_summary."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      reportType,
      organizationId: orgOverride,
      environmentIds,
      fetchDeploymentDetails,
      requiredPolicyNames,
      apiInstanceIds,
      duration,
      startTimestamp,
      endTimestamp,
      includeTopPaths,
      includeTopClientIds,
    }) => {
      const result =
        reportType === "runtime_flow_count"
          ? await createRuntimeFlowCountReport({
              organizationId: orgOverride,
              environmentIds,
              fetchDeploymentDetails,
            })
          : reportType === "api_manager_insecure_apis"
            ? await createInsecureApisReport({
                organizationId: orgOverride,
                environmentIds,
                requiredPolicyNames,
              })
            : await createMetricsApiHealthSummaryReport({
                organizationId: orgOverride,
                environmentIds,
                apiInstanceIds,
                duration,
                startTimestamp,
                endTimestamp,
                includeTopPaths,
                includeTopClientIds,
              });

      return toolResult(result);
    },
  );
}
