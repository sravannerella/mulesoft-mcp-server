import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAccountsTools } from "./accounts.js";
import { registerApiDesignerTools } from "./apiDesigner.js";
import { registerApiManagerTools } from "./apiManager.js";
import { registerExchangeTools } from "./exchange.js";
import { registerMetricsTools } from "./metrics.js";
import { registerMonitoringTools } from "./monitoring.js";
import { registerMqTools } from "./mq.js";
import { registerReportsTools } from "./reports.js";
import { registerRuntimeManagerTools } from "./runtimeManager.js";
import { registerSecretsManagerTools } from "./secretsManager.js";

export function registerModules(server: McpServer): void {
  registerAccountsTools(server);
  registerApiDesignerTools(server);
  registerExchangeTools(server);
  registerApiManagerTools(server);
  registerMetricsTools(server);
  registerMonitoringTools(server);
  registerMqTools(server);
  registerRuntimeManagerTools(server);
  registerReportsTools(server);
  registerSecretsManagerTools(server);
}
