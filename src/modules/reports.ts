import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { anypointRequest, encodePathSegment, organizationId } from "../shared/anypointClient.js";
import { MemoryCache } from "../shared/memoryCache.js";
import { toolResult } from "../shared/mcpResponse.js";
import { optionalOrgId } from "../shared/schemas.js";
import type { AnypointModule } from "../shared/types.js";
import { searchMetrics } from "./metrics.js";
import { registerEndpointResource } from "./resources.js";

type ReportType = "runtime_flow_count" | "api_manager_insecure_apis" | "metrics_api_health_summary";

type Report = {
  id: string;
  type: ReportType;
  createdAt: string;
  parameters: Record<string, unknown>;
  result: unknown;
};

type EnvironmentSummary = {
  id: string;
  name: string;
  type?: string;
};

const reportsModule: AnypointModule = {
  name: "reports",
  displayName: "Anypoint Reports",
  resourceUri: "anypoint-reports://definitions",
  docsUrl: "local://reports",
  endpoints: [
    "POST reports_create { reportType: runtime_flow_count }",
    "POST reports_create { reportType: api_manager_insecure_apis }",
    "POST reports_create { reportType: metrics_api_health_summary }",
  ],
};

const reportCache = new MemoryCache<Report>();

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
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  for (const key of ["items", "data", "environments", "apis", "deployments", "applications"]) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function getPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }

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
    if (candidate in row) {
      return row[candidate];
    }
  }

  const lowered = candidates.map((candidate) => candidate.toLowerCase());
  for (const [key, value] of Object.entries(row)) {
    if (lowered.includes(key.toLowerCase())) {
      return value;
    }
  }

  return undefined;
}

function parseDurationMs(duration: string): number {
  const match = duration.match(/^(\d+)(m|h|d)$/);
  if (!match) {
    throw new Error("duration must use m, h, or d units, for example 30m, 1h, or 7d");
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return amount * multiplier;
}

function timestampRange(params: { duration?: string; startTimestamp?: string; endTimestamp?: string }) {
  const end = params.endTimestamp ? Date.parse(params.endTimestamp) : Date.now();
  if (!Number.isFinite(end)) {
    throw new Error(`Invalid endTimestamp: ${params.endTimestamp}`);
  }

  const start = params.startTimestamp ? Date.parse(params.startTimestamp) : end - parseDurationMs(params.duration ?? "1h");
  if (!Number.isFinite(start)) {
    throw new Error(`Invalid startTimestamp: ${params.startTimestamp}`);
  }

  return { start, end };
}

function reportId(type: ReportType): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${type}-${Date.now()}-${suffix}`;
}

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

function environmentSummary(value: unknown): EnvironmentSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = stringValue(value.id) ?? stringValue(value.environmentId);
  if (!id) {
    return undefined;
  }

  return {
    id,
    name: stringValue(value.name) ?? id,
    type: stringValue(value.type),
  };
}

async function listEnvironments(orgId: string, environmentIds?: string[]): Promise<EnvironmentSummary[]> {
  const environments = collectionItems(await anypointRequest(environmentsPath(orgId)))
    .map(environmentSummary)
    .filter((environment): environment is EnvironmentSummary => environment !== undefined);

  if (!environmentIds || environmentIds.length === 0) {
    return environments;
  }

  const requested = new Set(environmentIds);
  return environments.filter((environment) => requested.has(environment.id));
}

async function listDeployments(orgId: string, envId: string): Promise<unknown[]> {
  const firstPage = await anypointRequest(deploymentsPath(orgId, envId), { query: { limit: 200, offset: 0 } });
  return collectionItems(firstPage);
}

async function listManagedApis(orgId: string, envId: string): Promise<unknown[]> {
  const firstPage = await anypointRequest(apisPath(orgId, envId), { query: { limit: 200, offset: 0 } });
  return collectionItems(firstPage);
}

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

  if (direct !== undefined) {
    return direct;
  }

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
    let environmentKnownFlowCount = 0;
    let environmentKnownBillableFlowCount = 0;
    let environmentUnknownAppCount = 0;

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
        environmentUnknownAppCount += 1;
      } else {
        environmentKnownFlowCount += appFlowCount;
        environmentKnownBillableFlowCount += billableFlowCount ?? appFlowCount;
      }

      apps.push({
        deploymentId: id,
        name: deploymentName(detail),
        status: stringValue(getPath(detail, ["status"])) ?? stringValue(getPath(detail, ["application", "status"])),
        replicas,
        flowCount: appFlowCount ?? "unknown",
        billableFlowCount: billableFlowCount ?? "unknown",
      });
    }

    knownTotalFlowCount += environmentKnownFlowCount;
    knownTotalBillableFlowCount += environmentKnownBillableFlowCount;
    unknownAppCount += environmentUnknownAppCount;

    environmentResults.push({
      environment,
      appCount: deployments.length,
      knownFlowCount: environmentKnownFlowCount,
      knownBillableFlowCount: environmentKnownBillableFlowCount,
      unknownAppCount: environmentUnknownAppCount,
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

function apiId(value: unknown): string | undefined {
  return stringValue(getPath(value, ["id"])) ?? stringValue(getPath(value, ["apiId"]));
}

function apiName(value: unknown): string {
  return stringValue(getPath(value, ["name"])) ?? stringValue(getPath(value, ["assetId"])) ?? apiId(value) ?? "unknown";
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
      if (!id) {
        continue;
      }

      const policies = collectionItems(await anypointRequest(policiesPath(orgId, environment.id, id)));
      const policyNames = policies.map(policyName);
      const missingRequiredPolicies = requiredPolicyNames.filter((required) => !policyNames.includes(required));

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

  return {
    organizationId: orgId,
    requiredPolicyNames,
    environments: environmentResults,
  };
}

function apiSummaryWhere(orgId: string, envId: string, start: number, end: number): string {
  return `"sub_org.id" = ${quoteAmql(orgId)} AND "env.id" = ${quoteAmql(envId)} AND timestamp BETWEEN ${start} AND ${end}`;
}

function apiSummaryQuery(select: string, orgId: string, envId: string, start: number, end: number, groupBy?: string[]): string {
  const groupClause = groupBy && groupBy.length > 0 ? ` GROUP BY ${groupBy.join(", ")}` : "";
  return `SELECT ${select} FROM "mulesoft.api.summary" WHERE ${apiSummaryWhere(orgId, envId, start, end)}${groupClause}`;
}

function incrementMetricRecord(
  records: Map<string, Record<string, unknown>>,
  apiInstanceId: string,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const existing = records.get(apiInstanceId) ?? {
    apiInstanceId,
    totalRequests: 0,
    statusCodeGroups: {},
    policyViolations: {},
    topPaths: [],
    topClientIds: [],
  };

  const next = { ...existing, ...patch };
  records.set(apiInstanceId, next);
  return next;
}

function topMetricRows(rows: Record<string, unknown>[], dimension: string): Array<{ value: string; count: number }> {
  return rows
    .map((row) => ({
      value: stringValue(metricValue(row, [dimension])) ?? "unknown",
      count: numericStringValue(metricValue(row, ["COUNT(requests)", "count(requests)", "requests"])) ?? 0,
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 10);
}

async function runMetricsQuery(query: string, limit = 2000): Promise<Record<string, unknown>[]> {
  return metricRows(await searchMetrics(query, 0, limit));
}

async function createMetricsApiHealthSummaryReport(params: {
  organizationId?: string;
  environmentIds?: string[];
  apiInstanceIds?: string[];
  duration?: string;
  startTimestamp?: string;
  endTimestamp?: string;
  timeseries?: string;
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
        const apiInstanceId = stringValue(metricValue(row, ["api.instance.id"])) ?? "unknown";
        if (allowedApiIds && !allowedApiIds.has(apiInstanceId)) {
          continue;
        }

        const statusGroup = stringValue(metricValue(row, ["http.status_code_group"])) ?? "unknown";
        const count = numericStringValue(metricValue(row, ["COUNT(requests)", "count(requests)", "requests"])) ?? 0;
        const existing = apiRecords.get(apiInstanceId);
        const statusCodeGroups = {
          ...(isRecord(existing?.statusCodeGroups) ? existing.statusCodeGroups : {}),
          [statusGroup]: count,
        };
        const currentTotal = numericStringValue(existing?.totalRequests) ?? 0;
        incrementMetricRecord(apiRecords, apiInstanceId, {
          totalRequests: currentTotal + count,
          statusCodeGroups,
        });
      }

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
        const apiInstanceId = stringValue(metricValue(row, ["api.instance.id"])) ?? "unknown";
        if (allowedApiIds && !allowedApiIds.has(apiInstanceId)) {
          continue;
        }

        incrementMetricRecord(apiRecords, apiInstanceId, {
          averageResponseTime: numericStringValue(metricValue(row, [`AVG(response_time)`, `AVG("response_time")`])),
          p95ResponseTime: numericStringValue(metricValue(row, [`PERCENTILE(response_time,0.95)`, `PERCENTILE("response_time",0.95)`])),
          p99ResponseTime: numericStringValue(metricValue(row, [`PERCENTILE(response_time,0.99)`, `PERCENTILE("response_time",0.99)`])),
        });
      }

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
        const apiInstanceId = stringValue(metricValue(row, ["api.instance.id"])) ?? "unknown";
        const violationStatus = stringValue(metricValue(row, ["policy.violation.status"]));
        if (!violationStatus || (allowedApiIds && !allowedApiIds.has(apiInstanceId))) {
          continue;
        }

        const count = numericStringValue(metricValue(row, ["COUNT(requests)", "count(requests)", "requests"])) ?? 0;
        const existing = apiRecords.get(apiInstanceId);
        const policyViolations = {
          ...(isRecord(existing?.policyViolations) ? existing.policyViolations : {}),
          [violationStatus]: count,
        };
        incrementMetricRecord(apiRecords, apiInstanceId, { policyViolations });
      }

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

        for (const apiInstanceId of new Set(pathRows.map((row) => stringValue(metricValue(row, ["api.instance.id"])) ?? "unknown"))) {
          if (allowedApiIds && !allowedApiIds.has(apiInstanceId)) {
            continue;
          }

          incrementMetricRecord(apiRecords, apiInstanceId, {
            topPaths: topMetricRows(
              pathRows.filter((row) => (stringValue(metricValue(row, ["api.instance.id"])) ?? "unknown") === apiInstanceId),
              "endpoint.operation",
            ),
          });
        }
      }

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

        for (const apiInstanceId of new Set(clientRows.map((row) => stringValue(metricValue(row, ["api.instance.id"])) ?? "unknown"))) {
          if (allowedApiIds && !allowedApiIds.has(apiInstanceId)) {
            continue;
          }

          incrementMetricRecord(apiRecords, apiInstanceId, {
            topClientIds: topMetricRows(
              clientRows.filter((row) => (stringValue(metricValue(row, ["api.instance.id"])) ?? "unknown") === apiInstanceId),
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
      (left, right) => (numericStringValue(right.totalRequests) ?? 0) - (numericStringValue(left.totalRequests) ?? 0),
    );

    environmentResults.push({
      environment,
      apiCount: apis.length,
      totalRequests: apis.reduce((sum, api) => sum + (numericStringValue(api.totalRequests) ?? 0), 0),
      apis,
    });
  }

  return {
    organizationId: orgId,
    window: {
      startTimestamp: new Date(start).toISOString(),
      endTimestamp: new Date(end).toISOString(),
      duration: params.duration ?? "1h",
      timeseries: params.timeseries ?? "PT5M",
    },
    environments: environmentResults,
    queryErrors,
    notes: [
      "Metrics results are aggregate time-series data and are not cached by this server.",
      "Metrics can lag behind real time and should be used for ad hoc summaries, not continuous export.",
    ],
  };
}

export function registerReportsTools(server: McpServer): void {
  registerEndpointResource(server, reportsModule);

  server.registerTool(
    "reports_list_definitions",
    {
      title: "List report definitions",
      description: "List available Anypoint report types.",
      annotations: { readOnlyHint: true },
    },
    async () =>
      toolResult({
        reports: [
          {
            reportType: "runtime_flow_count",
            description: "Counts known Mule flows for Runtime Manager deployments by environment.",
          },
          {
            reportType: "api_manager_insecure_apis",
            description: "Flags API Manager instances with no policies or missing required policies.",
          },
          {
            reportType: "metrics_api_health_summary",
            description: "Summarizes API traffic, status groups, response time, and policy violations from Metrics API.",
          },
        ],
      }),
  );

  server.registerTool(
    "reports_create",
    {
      title: "Create Anypoint report",
      description: "Create and cache a report for reusable checks such as runtime flow count or insecure APIs.",
      inputSchema: {
        reportType: z.enum(["runtime_flow_count", "api_manager_insecure_apis", "metrics_api_health_summary"]),
        ...optionalOrgId,
        environmentIds: z.array(z.string().min(1)).optional(),
        apiInstanceIds: z.array(z.string().min(1)).optional().describe("Only applies to metrics_api_health_summary."),
        duration: z.string().default("1h").describe("Only applies to metrics_api_health_summary. Examples: 30m, 1h, 7d."),
        startTimestamp: z.string().optional().describe("Only applies to metrics_api_health_summary."),
        endTimestamp: z.string().optional().describe("Only applies to metrics_api_health_summary."),
        timeseries: z.string().default("PT5M").describe("Only applies to metrics_api_health_summary."),
        includeTopPaths: z.boolean().default(false).describe("Only applies to metrics_api_health_summary."),
        includeTopClientIds: z.boolean().default(false).describe("Only applies to metrics_api_health_summary."),
        fetchDeploymentDetails: z.boolean().default(true).describe("Only applies to runtime_flow_count."),
        requiredPolicyNames: z.array(z.string().min(1)).optional().describe("Only applies to api_manager_insecure_apis."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      reportType,
      organizationId: orgOverride,
      environmentIds,
      apiInstanceIds,
      duration,
      startTimestamp,
      endTimestamp,
      timeseries,
      includeTopPaths,
      includeTopClientIds,
      fetchDeploymentDetails,
      requiredPolicyNames,
    }) => {
      const parameters = {
        organizationId: orgOverride,
        environmentIds,
        apiInstanceIds,
        duration,
        startTimestamp,
        endTimestamp,
        timeseries,
        includeTopPaths,
        includeTopClientIds,
        fetchDeploymentDetails,
        requiredPolicyNames,
      };

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
              timeseries,
              includeTopPaths,
              includeTopClientIds,
            });

      const report: Report = {
        id: reportId(reportType),
        type: reportType,
        createdAt: new Date().toISOString(),
        parameters,
        result,
      };

      reportCache.set(report.id, report);
      return toolResult(report);
    },
  );

  server.registerTool(
    "reports_get",
    {
      title: "Get cached report",
      description: "Return a report created earlier in this server process.",
      inputSchema: {
        reportId: z.string().min(1),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ reportId }) => {
      const report = reportCache.get(reportId)?.value;
      if (!report) {
        throw new Error(`Report not found: ${reportId}`);
      }

      return toolResult(report);
    },
  );
}
