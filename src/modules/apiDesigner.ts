import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { createUIResource } from "@mcp-ui/server";
import { z } from "zod/v4";
import { anypointRequest, encodePathSegment, organizationId } from "../shared/anypointClient.js";
import { toolResult } from "../shared/mcpResponse.js";
import type { JsonValue } from "../shared/types.js";
import { renderDesignCenterProjectsUI } from "../ui/designCenterUiRenderer.js";

const PROJECTS_URI = "ui://anypoint-api-designer/projects" as const;

// ─── Path helpers ─────────────────────────────────────────────────────────────

function projectPath(projectId?: string): string {
  const suffix = projectId ? `/${encodePathSegment(projectId)}` : "";
  return `/designcenter/api-designer/projects${suffix}`;
}

function branchPath(projectId: string, branch: string): string {
  return `${projectPath(projectId)}/branches/${encodePathSegment(branch)}`;
}

// ─── Input schemas ────────────────────────────────────────────────────────────

const branchInput = {
  projectId: z.string().min(1).describe("API Designer project ID. Obtain from design_center_list_projects."),
  branch: z.string().min(1).default("master").describe("Branch name. Defaults to master."),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeProjects(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (isRecord(data)) {
    for (const key of ["projects", "items", "data", "results"]) {
      if (Array.isArray(data[key])) return data[key] as unknown[];
    }
  }
  return [];
}

function projectsSummary(projects: unknown[]): string {
  const names = projects.map((p) =>
    isRecord(p) ? String(p.name ?? p.id ?? "Untitled") : "Untitled",
  );
  return `Found ${projects.length} project(s): ${names.join(", ")}.`;
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerApiDesignerTools(server: McpServer): void {
  // ── Discovery ──────────────────────────────────────────────────────────────

  registerAppResource(
    server,
    "Design Center Projects",
    PROJECTS_URI,
    { description: "Visual card carousel of all API Designer projects." },
    async () => {
      const data = await anypointRequest(projectPath());
      const projects = normalizeProjects(data);
      const html = renderDesignCenterProjectsUI(projects);
      const resource = createUIResource({
        uri: PROJECTS_URI,
        content: { type: "rawHtml", htmlString: html },
        encoding: "text",
      });
      return { contents: [resource.resource] };
    },
  );

  registerAppTool(
    server,
    "design_center_list_projects",
    {
      title: "Design Center: List Projects",
      description:
        "List all API Designer projects accessible to the configured user. Returns a visual card carousel. Use the projectId from this result with other design_center_* tools.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: PROJECTS_URI } },
    },
    async () => {
      const data = await anypointRequest(projectPath());
      const projects = normalizeProjects(data);
      return {
        content: [{ type: "text" as const, text: projectsSummary(projects) }],
      };
    },
  );

  // ── Detail ─────────────────────────────────────────────────────────────────

  server.registerTool(
    "design_center_get_project",
    {
      title: "Design Center: Get Project Details",
      description:
        "Get a single API Designer project including its branches and the file tree of the specified branch in one call. Call design_center_list_projects first to obtain the projectId.",
      inputSchema: {
        projectId: z.string().min(1).describe("Project ID from design_center_list_projects."),
        branch: z.string().min(1).default("master").describe("Branch to inspect."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ projectId, branch }) => {
      const [project, branches, files] = await Promise.all([
        anypointRequest(projectPath(projectId)),
        anypointRequest(`${projectPath(projectId)}/branches`),
        anypointRequest(`${branchPath(projectId, branch)}/files`),
      ]);
      return toolResult({ project, branches, files });
    },
  );

  server.registerTool(
    "design_center_read_file",
    {
      title: "Design Center: Read File",
      description:
        "Read the content of a file from a Design Center project branch. Call design_center_get_project first to browse the file tree.",
      inputSchema: {
        ...branchInput,
        path: z.string().min(1).describe("File path inside the branch, e.g. api.raml."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ projectId, branch, path }) => {
      const content = await anypointRequest(
        `${branchPath(projectId, branch)}/files/${encodePathSegment(path)}`,
        { accept: "*/*" },
      );
      return toolResult(content);
    },
  );

  // ── Actions ────────────────────────────────────────────────────────────────

  server.registerTool(
    "design_center_edit_file",
    {
      title: "Design Center: Edit File",
      description:
        "Atomically edit one or more files in a Design Center project branch (acquires lock → saves files → releases lock). On error the lock is always released. Call design_center_get_project first to confirm the file tree.",
      inputSchema: {
        ...branchInput,
        files: z
          .array(
            z.object({
              path: z.string().min(1).describe("File path inside the branch, e.g. api.raml."),
              type: z.enum(["FILE", "FOLDER"]).default("FILE"),
              content: z.string().optional().describe("File content (UTF-8)."),
              title: z.string().optional(),
            }),
          )
          .min(1)
          .describe("Files to create or update."),
      },
    },
    async ({ projectId, branch, files }) => {
      const lockPath = `${branchPath(projectId, branch)}/acquireLock`;
      const savePath = `${branchPath(projectId, branch)}/save`;
      const unlockPath = `${branchPath(projectId, branch)}/releaseLock`;

      // 1. Acquire lock
      await anypointRequest(lockPath, { method: "POST", body: {} });

      // 2. Save files — release lock even if this throws
      let saveResult: unknown;
      try {
        saveResult = await anypointRequest(savePath, {
          method: "POST",
          body: files as JsonValue,
        });
      } finally {
        // 3. Release lock (best-effort; ignore errors here)
        await anypointRequest(unlockPath, { method: "POST", body: {} }).catch(() => undefined);
      }

      return toolResult(saveResult);
    },
  );

  server.registerTool(
    "design_center_publish_to_exchange",
    {
      title: "Design Center: Publish to Exchange",
      description:
        "Publish an API Designer project branch to Anypoint Exchange. Call design_center_get_project first to confirm the project and branch.",
      inputSchema: {
        ...branchInput,
        name: z.string().min(1).describe("Exchange asset display name."),
        apiVersion: z.string().min(1).describe("API version string, e.g. v1."),
        version: z.string().min(1).describe("Asset version, e.g. 1.0.0."),
        main: z.string().min(1).describe("Main API file inside the branch, e.g. api.raml."),
        assetId: z.string().min(1).describe("Exchange asset ID."),
        groupId: z
          .string()
          .optional()
          .describe("Exchange group ID. Defaults to the configured organization ID."),
        classifier: z
          .enum(["raml", "raml-fragment", "oas", "asyncapi"])
          .default("raml")
          .describe("Asset classifier."),
        tags: z.array(z.string()).optional().describe("Exchange tags to apply."),
      },
    },
    async ({ projectId, branch, groupId, ...rest }) => {
      const resolvedGroupId = groupId ?? organizationId();
      return toolResult(
        await anypointRequest(`${branchPath(projectId, branch)}/publish/exchange`, {
          method: "POST",
          body: { groupId: resolvedGroupId, ...rest } as JsonValue,
        }),
      );
    },
  );
}
