# Anypoint MCP Server — Implementation Reference

## Overview

The Anypoint MCP Server exposes Anypoint Platform operations as MCP tools with a **workflow-first, UI-rich** design. Tools are organized into **3-phase workflows**: Discovery → Detail → Action. Rich HTML UIs are returned via `uiResult()` (MCP Embedded Resources with `mimeType: text/html`).

---

## Configuration

| Environment Variable | Default | Purpose |
|---|---|---|
| `ANYPOINT_CLIENT_ID` | _(required)_ | Client credentials OAuth2 client ID |
| `ANYPOINT_CLIENT_SECRET` | _(required)_ | Client credentials OAuth2 client secret |
| `ANYPOINT_ORG_ID` | _(auto-detected)_ | Override default organization ID |
| `ANYPOINT_ENV_ID` | _(auto-detected)_ | Override default environment ID |
| `ANYPOINT_BASE_URL` | `https://anypoint.mulesoft.com` | Override Anypoint Platform base URL |
| `PORT` / `MCP_PORT` | `3000` | HTTP server port |
| `HOST` / `MCP_HOST` | `127.0.0.1` | HTTP server bind address |
| `ANYPOINT_MCP_ADVANCED_TOOLS` | _(not set)_ | Set to `"true"` to enable gated destructive/low-level tools |

---

## Architecture

```
src/
  index.ts                  # Express server, POST /mcp, GET /ui/* routes
  modules/
    index.ts                # Registers all modules into McpServer
    accounts.ts             # Anypoint profile + environments
    apiDesigner.ts          # Design Center projects + files
    apiManager.ts           # API Manager instances + policies (merged)
    exchange.ts             # Exchange assets + contracts
    metrics.ts              # AMQL metric types + search
    monitoring.ts           # Monitoring/analytics charts
    mq.ts                   # Anypoint MQ queues
    reports.ts              # On-the-fly reports
    runtimeManager.ts       # CloudHub 2 / Runtime Fabric deployments
    secretsManager.ts       # Secrets Manager secret groups
    resources.ts            # MCP Resource registration helpers
  shared/
    anypointClient.ts       # HTTP client, OAuth2, org/env resolution
    anypointUrls.ts         # Deep link URL builders for Anypoint UI
    mcpResponse.ts          # toolResult(), uiResult() helpers
    memoryCache.ts          # In-process TTL cache
    schemas.ts              # Shared Zod schemas (orgId, envId, rawRequest)
    types.ts                # Shared TypeScript types
    workflowGuards.ts       # requireAdvancedTools() guard
  ui/
    baseUiRenderer.ts       # HTML primitives: htmlPage(), inlineChart(), etc.
    apiManagerUiRenderer.ts # API Manager HTML card renderer
    designCenterUiRenderer.ts # Design Center project carousel
    exchangeUiRenderer.ts   # Exchange asset cards + detail view
    monitoringUiRenderer.ts # Monitoring/analytics Chart.js renderer
    mqUiRenderer.ts         # MQ queue card renderer
    runtimeManagerUiRenderer.ts # Runtime Manager deployment cards
```

---

## Guard Annotations

Every tool has one or more of the following MCP annotations:

| Annotation | Meaning |
|---|---|
| `readOnlyHint: true` | Tool only reads data, never mutates |
| `destructiveHint: true` | Tool may delete or overwrite data irreversibly |
| `openWorldHint: false` | Tool is scoped to a closed set of Anypoint APIs |

Tools that require `ANYPOINT_MCP_ADVANCED_TOOLS=true` throw an error with a clear message if the env var is absent. These are low-level or high-risk operations gated from default use.

---

## Modules

### accounts

**Purpose**: Anypoint profile and environments.

| Tool | Type | Workflow Step | API |
|---|---|---|---|
| `accounts_get_profile` | readOnly | Discovery | `GET /accounts/api/profile` |
| `accounts_list_environments` | readOnly | Discovery | `GET /accounts/api/organizations/{orgId}/environments` |

**Workflow**: `accounts_list_environments` → copy `environmentId` → pass to tools in other modules.

---

### apiDesigner (Design Center)

**Purpose**: Manage API design projects and files in Design Center.

| Tool | Type | Workflow Step | API |
|---|---|---|---|
| `design_center_list_projects` | readOnly | Discovery → HTML UI | `GET /designcenter/api-designer/projects` |
| `design_center_get_project` | readOnly | Detail | `GET /designcenter/api-designer/projects/{projectId}` + branches + files |
| `design_center_read_file` | readOnly | Detail | `GET /designcenter/api-designer/projects/{projectId}/branches/{branchName}/files/{filePath}` |
| `design_center_edit_file` | mutation | Action | acquireLock → save → releaseLock |
| `design_center_publish_to_exchange` | mutation | Action | `POST /designcenter/api-designer/projects/{projectId}/branches/{branchName}/publish/exchange` |

**Workflow**:
1. `design_center_list_projects` → get project ID from UI
2. `design_center_get_project` → get branch name and file list
3. `design_center_read_file` → read current file content
4. `design_center_edit_file` → ATOMIC: acquireLock → save → releaseLock (finally ensures unlock even on error)

---

### apiManager (merged with API Policies)

**Purpose**: API Manager instances with enriched policy and contract data.

| Tool | Type | Annotations | Workflow Step | API |
|---|---|---|---|---|
| `api_manager_list_apis` | readOnly | readOnly | Discovery → HTML UI | `GET /apimanager/api/v1/organizations/{orgId}/environments/{envId}/apis` + parallel policies + contracts per API |
| `api_manager_apply_policy` | mutation | — | Action | `POST /apimanager/api/v1/organizations/{orgId}/environments/{envId}/apis/{apiId}/policies` |
| `api_manager_update_policy` | mutation | — | Action | `PATCH /apimanager/api/v1/.../policies/{policyId}` |
| `api_manager_remove_policy` | mutation | destructive | Action | `DELETE /apimanager/api/v1/.../policies/{policyId}` |
| `api_manager_apply_outbound_policy` | mutation | — | Action | `POST /xapi/v1/organizations/{orgId}/environments/{envId}/apis/{apiId}/outbound-policies` |
| `api_manager_create_api_instance` | mutation | **gated** | Advanced | `POST /apimanager/api/v1/.../apis` |
| `api_manager_list_policy_templates` | readOnly | **gated** | Advanced | `GET /apimanager/api/v1/organizations/{orgId}/exchange-policy-templates` |

**Workflow**:
1. `api_manager_list_apis` → HTML cards showing policy badges + contract count per API
2. `api_manager_apply_policy` → use `apiId` from step 1

**Enrichment**: `enrichApiInstances()` fetches policies and contracts in parallel for each API instance before rendering.

---

### exchange

**Purpose**: Browse Exchange assets and manage contracts.

| Tool | Type | Annotations | Workflow Step | API |
|---|---|---|---|---|
| `exchange_list_assets` | readOnly | readOnly | Discovery → HTML UI | `GET /exchange/api/v2/assets` |
| `exchange_get_asset` | readOnly | readOnly | Detail → HTML UI | `GET /exchange/api/v2/assets/{groupId}/{assetId}/{version}` + pages + resources |
| `exchange_create_contract` | mutation | — | Action | `POST /exchange/api/v1/organizations/{orgId}/applications/{applicationId}/contracts` |
| `exchange_delete_asset` | mutation | **gated** + destructive | Advanced | `DELETE /exchange/api/v2/assets/{groupId}/{assetId}/{version}` |

**Workflow**: `exchange_list_assets` → `exchange_get_asset` → `exchange_create_contract`.

---

### runtimeManager

**Purpose**: Manage CloudHub 2.0 and Runtime Fabric deployments.

| Tool | Type | Annotations | Workflow Step | API |
|---|---|---|---|---|
| `runtime_list_deployments` | readOnly | readOnly | Discovery → HTML UI | `GET /amc/application-manager/api/v2/organizations/{orgId}/environments/{envId}/deployments` |
| `runtime_get_deployment` | readOnly | readOnly | Detail | `GET .../deployments/{deploymentId}` |
| `runtime_get_logs` | readOnly | readOnly | Detail | `GET .../deployments/{deploymentId}/logs` |
| `runtime_start_application` | mutation | — | Action | `POST .../deployments/{deploymentId}/start` |
| `runtime_stop_application` | mutation | — | Action | `POST .../deployments/{deploymentId}/stop` |
| `runtime_restart_application` | mutation | — | Action | `POST .../deployments/{deploymentId}/restart` |
| `runtime_set_scheduler_state` | mutation | — | Action | `PATCH .../deployments/{deploymentId}/schedulers/{schedulerName}` |
| `runtime_create_deployment` | mutation | **gated** | Advanced | `POST .../deployments` |
| `runtime_update_deployment` | mutation | **gated** | Advanced | `PATCH .../deployments/{deploymentId}` |

**Workflow**: `runtime_list_deployments` → `runtime_get_deployment` → lifecycle tools.

---

### monitoring

**Purpose**: Application and API performance metrics with Chart.js visualizations.

| Tool | Type | Annotations | Workflow Step | API |
|---|---|---|---|---|
| `monitoring_get_app_overview` | readOnly | readOnly | Discovery → Chart UI | `POST /monitoring/api/query` |
| `monitoring_get_api_analytics` | readOnly | readOnly | Discovery → Chart UI | `POST /monitoring/api/visualizer/api-analytics/query` |
| `monitoring_raw_request` | readOnly | **gated** | Advanced | configurable endpoint |

**Charts**: CPU, memory, message throughput, error rate rendered as Chart.js line charts inside HTML iframes.

---

### metrics

**Purpose**: AMQL metric queries against Anypoint Observability.

| Tool | Type | Annotations | Workflow Step | API |
|---|---|---|---|---|
| `metrics_list_types` | readOnly | readOnly | Discovery | `GET /observability/api/v1/metric_types` |
| `metrics_search` | readOnly | readOnly | Detail → Chart UI | `POST /observability/api/v1/metrics:search` |

**Workflow**: `metrics_list_types` → copy metric name → `metrics_search` with time range + filters.

---

### reports

**Purpose**: On-the-fly cross-module reports (no caching, no IDs, single call).

| Tool | Type | Report Types | APIs used |
|---|---|---|---|
| `reports_generate` | readOnly | `runtime_flow_count`, `api_manager_insecure_apis`, `metrics_api_health_summary` | Runtime Manager + API Manager + Observability |

**Report types**:
- `runtime_flow_count` — flow count per deployment, billable application count
- `api_manager_insecure_apis` — APIs with no policies or only disabled policies
- `metrics_api_health_summary` — AMQL traffic volume, p99 latency, policy violations per API

---

### mq (Anypoint MQ)

**Purpose**: Browse queues and send/purge messages.

| Tool | Type | Annotations | Workflow Step | API |
|---|---|---|---|---|
| `mq_list_queues` | readOnly | readOnly | Discovery → HTML UI | `GET /mq/admin/api/v1/.../queues` + `GET /mq/stats/api/v1/.../queues` |
| `mq_send_message` | mutation | — | Action | `POST /mq/admin/api/v1/.../bindings/{queueId}/messages` |
| `mq_purge_queue` | mutation | destructive | Action | `DELETE /mq/admin/api/v1/.../queues/{queueId}/messages` |

**Enrichment**: `mq_list_queues` fetches queue stats (visible/in-flight message counts) in parallel, merges by `queueId` before rendering.

**Queue card UI shows**: name, FIFO/encrypted/DLQ badges, visible count, in-flight count, TTL (human-readable), lock TTL, max deliveries.

---

### secretsManager

**Purpose**: Browse secret groups and manage secrets. **Security contract: no tool ever returns secret values.**

| Tool | Type | Annotations | Workflow Step | API |
|---|---|---|---|---|
| `secrets_list_stores` | readOnly | readOnly | Discovery | `GET /secrets-manager/api/v1/organizations/{orgId}/environments/{envId}/secretGroups` |
| `secrets_list_secrets` | readOnly | readOnly | Detail | `GET /secrets-manager/api/v1/.../secretGroups/{secretGroupId}/{secretType}` |
| `secrets_upsert_secret` | mutation | — | Action | `POST/PUT /secrets-manager/api/v1/.../secretGroups/{secretGroupId}/{secretType}` |

**Security**: `scrubValues()` strips these keys from all responses: `value`, `secret`, `password`, `token`, `privateKey`, `private_key`, `keyStore`, `certificate`, `keyContent`, `key`, `data`, `content`, `passphrase`, `credentials`. Scrubbing is recursive and applies to both arrays and objects.

**Workflow**: `secrets_list_stores` → `secrets_list_secrets` → `secrets_upsert_secret`.

---

## HTTP UI Routes

These routes serve standalone HTML pages for embedding in dashboards or iframes:

| Route | Description |
|---|---|
| `GET /health` | Health check |
| `POST /mcp` | MCP Streamable HTTP endpoint |
| `GET /ui/api-designer/projects` | Design Center projects carousel |
| `GET /ui/runtime-manager/deployments` | Runtime Manager deployment cards |
| `GET /ui/api-manager/apis` | API Manager API instance cards |
| `GET /ui/exchange/assets` | Exchange asset cards |

---

## Shared Utilities

### `uiResult(html, summary?)` — `mcpResponse.ts`
Returns an MCP tool result with two content items:
1. A `text` item with the summary string (defaults to "UI rendered.")
2. An `resource` item with `mimeType: text/html` and the full HTML string

### `htmlPage(options, body)` — `baseUiRenderer.ts`
Wraps body HTML in a full HTML document with Tailwind CDN and optionally Chart.js CDN.
- `options.title` — page title
- `options.subtitle` — optional subtitle
- `options.includeChartJs` — set true to include Chart.js CDN

### `inlineChart(canvasId, type, labels, datasets)` — `baseUiRenderer.ts`
Generates a `<canvas>` element + inline `<script>` to initialize a Chart.js chart.
- `datasets`: `{ label: string; data: number[]; color: string }[]`

### `requireAdvancedTools()` — `workflowGuards.ts`
Throws `McpError` with `InvalidRequest` code if `ANYPOINT_MCP_ADVANCED_TOOLS !== "true"`. Call at the top of any gated tool handler.

### `anypointRequest(path, options?)` — `anypointClient.ts`
Authenticated HTTP request to Anypoint Platform. Handles OAuth2 token refresh automatically. Accepts `query` params as an object.

---

## Anti-Patterns Avoided

- **No tool sprawl**: Lock/unlock tools merged into `design_center_edit_file`; `apiPolicies.ts` merged into `apiManager.ts`; `exchange_list_asset_pages` / `exchange_list_asset_resources` merged into `exchange_get_asset`.
- **No blind mutations**: All mutation tools require an explicit ID from a prior discovery step.
- **No raw JSON dumps**: List tools return HTML UIs; raw output gated behind `ANYPOINT_MCP_ADVANCED_TOOLS`.
- **No secret echoing**: `secretsManager.ts` enforces `scrubValues()` on all responses.
- **No report caching**: `reports_generate` computes fresh every call; no cache IDs or TTLs.
