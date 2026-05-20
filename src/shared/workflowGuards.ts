/**
 * Returns true when advanced/destructive tools are enabled via env var.
 * Use this to conditionally register tools so they don't appear in the tool
 * list at all when the flag is absent.
 */
export function advancedToolsEnabled(): boolean {
  return process.env.ANYPOINT_MCP_ADVANCED_TOOLS === "true";
}

/**
 * Throws if the ANYPOINT_MCP_ADVANCED_TOOLS env flag is not enabled.
 * Gate destructive or low-level tools behind this to prevent casual misuse.
 */
export function requireAdvancedTools(): void {
  if (!advancedToolsEnabled()) {
    throw new Error(
      "This tool is gated. Set ANYPOINT_MCP_ADVANCED_TOOLS=true to enable advanced and low-level operations.",
    );
  }
}
