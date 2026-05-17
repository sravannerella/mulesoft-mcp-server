# Anypoint MCP Server

TypeScript MCP server for MuleSoft Anypoint Platform APIs.

The server uses MCP Streamable HTTP at `/mcp` and reads Anypoint credentials from `.env` or environment variables. On startup, it exchanges `ANYPOINT_CLIENT_ID` and `ANYPOINT_CLIENT_SECRET` for an access token, calls `/accounts/api/profile`, and caches the discovered organization ID and owner ID in memory. If token or profile retrieval fails, the server exits before accepting MCP requests.

Every outgoing API request includes:

- `Authorization: Bearer <token>`
- `x-organization-id: <cached org-id>`
- `x-owner-id: <cached owner-id>`

## Modules

- Anypoint Accounts API: `src/modules/accounts.ts`
- API Designer Experience API: `src/modules/apiDesigner.ts`
- Exchange Experience API: `src/modules/exchange.ts`
- API Manager API: `src/modules/apiManager.ts`
- API Manager Policies: `src/modules/apiPolicies.ts`
- Anypoint Metrics API: `src/modules/metrics.ts`
- ARM Monitoring Query API: `src/modules/monitoring.ts`
- AMC Application Manager API: `src/modules/runtimeManager.ts`
- Reports: `src/modules/reports.ts`

Shared auth, request, response, and schema helpers live under `src/shared`.

The token is cached and renewed automatically before it expires. Profile and environment details are cached in memory. The profile and environment tools accept `refresh: true` when you want to reload from Anypoint.

## Configuration

Set these variables in your MCP client config:

```bash
ANYPOINT_CLIENT_ID=your-connected-app-client-id
ANYPOINT_CLIENT_SECRET=your-connected-app-client-secret
ANYPOINT_ORG_ID=your-organization-id
ANYPOINT_ENV_ID=your-environment-id
ANYPOINT_BASE_URL=https://anypoint.mulesoft.com
MCP_HOST=127.0.0.1
MCP_PORT=3000
MCP_PUBLIC_BASE_URL=https://your-ngrok-host.ngrok-free.dev
```

`ANYPOINT_ORG_ID` is optional when `/accounts/api/profile` contains a usable organization ID. Keep it set when the profile belongs to multiple organizations and you want to pin one. `ANYPOINT_ENV_ID` is required for API Manager and Runtime Manager tools unless you pass `environmentId` to the tool. `ANYPOINT_BASE_URL` is optional and defaults to `https://anypoint.mulesoft.com`. `MCP_PUBLIC_BASE_URL` is optional; when set, tools can return normal HTTPS links for browser-rendered UI pages exposed through ngrok. Host header validation is disabled so the server can be exposed through tunnels such as ngrok without maintaining an allowlist.

A local `.env` file is included with empty placeholders. It is ignored by git.

## Tool Naming

Tools are grouped by prefix:

- `api_designer_*`
- `accounts_*`
- `exchange_*`
- `api_manager_*`
- `api_policy_*`
- `metrics_*`
- `monitoring_*`
- `runtime_*`
- `reports_*`

Runtime application lifecycle tools are exposed as `runtime_start_application`, `runtime_stop_application`, and `runtime_restart_application`.
Backward-compatible deployment aliases are also available: `runtime_start_deployment`, `runtime_stop_deployment`, and `runtime_restart_deployment`.
These lifecycle tools use the documented Runtime Manager deployment `PATCH` operation with `application.desiredState` set to `STARTED` or `STOPPED`.

Each module also exposes an endpoint map resource:

- `anypoint-api-designer://endpoints`
- `anypoint-accounts://endpoints`
- `anypoint-exchange://endpoints`
- `anypoint-api-manager://endpoints`
- `anypoint-api-policies://endpoints`
- `anypoint-metrics://endpoints`
- `anypoint-monitoring://endpoints`
- `anypoint-runtime-manager://endpoints`
- `anypoint-reports://definitions`

The new modules include common wrappers plus constrained `*_raw_request` tools for documented endpoints that are not wrapped yet. Raw requests are limited to that module's Anypoint API path prefix.

Reports are created with `reports_create` and cached in memory for the life of the server process. Current report types:

- `runtime_flow_count`: aggregates known Runtime Manager deployment flow counts by environment. Apps whose deployment details do not expose a flow count are reported as `unknown`.
- `api_manager_insecure_apis`: flags API Manager instances with no policies or missing caller-provided required policies.
- `metrics_api_health_summary`: summarizes API traffic, status groups, response time, and policy violations from Anypoint Metrics API.

Metrics search results are not cached because they are time-windowed. Metric type and metric description metadata are cached in memory. The Metrics API currently rejects `metrics:search` limits above `2000`, so `metrics_search` caps `limit` at `2000`.

## Development

```bash
npm install
npm run build
```

Run locally:

```bash
npm run start
```

The Streamable HTTP endpoint is:

```text
http://127.0.0.1:3000/mcp
```

The health endpoint is:

```text
http://127.0.0.1:3000/health
```

The API Designer projects UI is also available as a browser-rendered page:

```text
http://127.0.0.1:3000/ui/api-designer/projects
```

When `MCP_PUBLIC_BASE_URL` is set, `api_designer_list_projects` includes the public HTTPS UI URL in its tool result. The same tool is registered with the MCP-UI/MCP Apps pattern from `@mcp-ui/server` and `@modelcontextprotocol/ext-apps`: `registerAppTool` advertises `_meta.ui.resourceUri` and the legacy `_meta["ui/resourceUri"]` key, both pointing to `ui://anypoint-api-designer/projects`, while `registerAppResource` serves a `createUIResource` HTML resource with MIME type `text/html;profile=mcp-app`. Apps-capable hosts such as Agentik should fetch that resource with `resources/read` and render it.

Inspect with MCP Inspector:

```bash
npm run inspector
```

## Docker

Build the image:

```bash
docker build -t anypoint-mcp-server .
```

Run with your local `.env`:

```bash
docker run --rm --env-file .env -p 3000:3000 anypoint-mcp-server
```

## Client Example

```json
{
  "mcpServers": {
    "anypoint": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

## API Sources

- API Designer Experience API: https://dev-portal.mulesoft.com/apis/api-designer-experience.html
- Anypoint Accounts API profile: https://anypoint.mulesoft.com/accounts/api/profile
- Exchange Experience API: https://dev-portal.mulesoft.com/apis/exchange-experience.html
- API Manager API: https://dev-portal.mulesoft.com/apis/api-manager.html
- ARM Monitoring Query API: https://dev-portal.mulesoft.com/apis/arm-monitoring-query.html
- AMC Application Manager API: https://dev-portal.mulesoft.com/apis/amc-application-manager.html
