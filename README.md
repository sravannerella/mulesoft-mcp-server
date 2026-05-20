# 🔌 Anypoint MCP Server

An MCP (Model Context Protocol) server for MuleSoft **Anypoint Platform** — lets AI assistants like Claude talk directly to your Anypoint APIs.

## 🎬 Demo

[![Anypoint MCP Server Demo](https://img.youtube.com/vi/7_GBy0tVXWA/maxresdefault.jpg)](https://youtu.be/7_GBy0tVXWA)

---

## ✨ Features

| Module | Prefix | What it does |
|---|---|---|
| 🏢 Accounts | `accounts_*` | Profile, org & environment info |
| ✏️ API Designer | `api_designer_*` | Browse & manage Design Center projects |
| 📦 Exchange | `exchange_*` | Search & inspect Exchange assets |
| 🔧 API Manager | `api_manager_*` | API instances, SLA tiers, contracts |
| 🛡️ API Policies | `api_policy_*` | Apply & manage API gateway policies |
| 📊 Metrics | `metrics_*` | Traffic, latency & error rate data |
| 📡 Monitoring | `monitoring_*` | ARM monitoring queries |
| 🚀 Runtime Manager | `runtime_*` | CloudHub 2.0 deployments, Start/Stop/Restart |
| 📬 MQ | `mq_*` | Anypoint MQ queues (sandbox by default) |
| 🔐 Secrets Manager | `secrets_*` | Secrets Manager vaults & secrets |
| 📋 Reports | `reports_*` | On-demand aggregated reports |

---

## 🚀 Quick Start

### 1. Install & build

```bash
npm install
npm run build
```

### 2. Configure credentials

Create a `.env` file (a blank template is already included):

```bash
ANYPOINT_CLIENT_ID=your-connected-app-client-id
ANYPOINT_CLIENT_SECRET=your-connected-app-client-secret
ANYPOINT_ORG_ID=your-organization-id        # optional if profile has one org
ANYPOINT_ENV_ID=your-environment-id         # default env for API/Runtime Manager tools
ANYPOINT_BASE_URL=https://anypoint.mulesoft.com   # optional, this is the default
MCP_HOST=127.0.0.1
MCP_PORT=3000
MCP_PUBLIC_BASE_URL=https://your-ngrok-host.ngrok-free.dev   # optional, for public UI links
```

> 💡 Use a **Connected App** (Client Credentials grant) from Anypoint Access Management. The server exchanges these for a Bearer token on startup and auto-renews before expiry.

### 3. Start the server

```bash
npm start
```

The server listens at:

| Endpoint | URL |
|---|---|
| 🔌 MCP (Streamable HTTP) | `http://127.0.0.1:3000/mcp` |
| ❤️ Health check | `http://127.0.0.1:3000/health` |

### 4. Connect your AI client

Add this to your MCP client config (e.g. Claude Desktop, Agentik):

```json
{
  "mcpServers": {
    "anypoint": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

---

## 🐳 Docker

```bash
# Build
docker build -t anypoint-mcp-server .

# Run with your .env file
docker run --rm --env-file .env -p 3000:3000 anypoint-mcp-server
```

---

## 🛠️ Development

```bash
# Build TypeScript
npm run build

# Open MCP Inspector (browser UI to test tools)
npm run inspector
```

---

## 🖥️ Interactive UI

Several modules render rich interactive HTML UIs inside MCP-capable clients (like Agentik):

| UI | Tool | What you see |
|---|---|---|
| 🎨 Design Center | `api_designer_list_projects` | Searchable project carousel |
| 📦 Exchange | `exchange_list_assets` | Filterable asset table |
| 🔧 API Manager | `api_manager_list_apis` | API instance table |
| 🚀 Runtime Manager | `runtime_list_deployments` | Deployment table with Start/Stop buttons |
| 📬 MQ | `mq_list_queues` | Queue list (defaults to sandbox env) |

---

## 📋 Reports

Generate on-demand aggregated reports with `reports_create`:

| Report type | Description |
|---|---|
| `runtime_flow_count` | Flow counts per deployment, grouped by environment |
| `api_manager_insecure_apis` | APIs with no policies or missing security policies |
| `metrics_api_health_summary` | Traffic, error rates & response times from Metrics API |

Reports are cached in memory for the life of the server process.

---

## 🔒 Auth & Caching

- Token is **auto-renewed** before expiry — no restarts needed
- Org ID and owner ID are discovered from `/accounts/api/profile` on startup and cached
- Pass `refresh: true` to profile/environment tools to force a cache reload
- All API requests include `Authorization`, `x-organization-id`, and `x-owner-id` headers automatically

---

## 📚 API References

- [API Designer Experience API](https://dev-portal.mulesoft.com/apis/api-designer-experience.html)
- [Exchange Experience API](https://dev-portal.mulesoft.com/apis/exchange-experience.html)
- [API Manager API](https://dev-portal.mulesoft.com/apis/api-manager.html)
- [ARM Monitoring Query API](https://dev-portal.mulesoft.com/apis/arm-monitoring-query.html)
- [AMC Application Manager API](https://dev-portal.mulesoft.com/apis/amc-application-manager.html)
- [Anypoint Accounts API](https://anypoint.mulesoft.com/accounts/api/profile)
