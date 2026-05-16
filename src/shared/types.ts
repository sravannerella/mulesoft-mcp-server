import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type AnypointModule = {
  name: string;
  displayName: string;
  resourceUri: string;
  docsUrl: string;
  endpoints: string[];
};

export type RegisterTools = (server: McpServer) => void;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RequestOptions = {
  method?: HttpMethod;
  body?: JsonValue;
  accept?: string;
  query?: Record<string, string | number | boolean | undefined>;
};
