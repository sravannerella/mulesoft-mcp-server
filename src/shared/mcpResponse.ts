export function toolResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Returns an embedded HTML UIResource as the tool result.
 * Uses mimeType "text/html;profile=mcp-app" as required by @mcp-ui/server
 * for MCP clients that support UIResource rendering (iframe srcDoc).
 */
export function uiResult(htmlString: string, summary?: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: summary ?? "Rendered interactive UI.",
      },
      {
        type: "resource" as const,
        resource: {
          uri: `ui://inline/${Date.now()}`,
          mimeType: "text/html;profile=mcp-app",
          text: htmlString,
        },
      },
    ],
  };
}
