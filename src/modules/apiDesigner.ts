import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { anypointRequest, encodePathSegment } from "../shared/anypointClient.js";
import { toolResult } from "../shared/mcpResponse.js";
import type { AnypointModule } from "../shared/types.js";
import { registerEndpointResource } from "./resources.js";

type SaveFile = {
  path: string;
  type: "FILE" | "FOLDER";
  content?: string;
  title?: string;
};

const apiDesignerModule: AnypointModule = {
  name: "api-designer",
  displayName: "API Designer Experience API",
  resourceUri: "anypoint-api-designer://endpoints",
  docsUrl: "https://dev-portal.mulesoft.com/apis/api-designer-experience.html",
  endpoints: [
    "GET /designcenter/api-designer/projects",
    "POST /designcenter/api-designer/projects",
    "GET /designcenter/api-designer/projects/{projectId}",
    "DELETE /designcenter/api-designer/projects/{projectId}",
    "GET /designcenter/api-designer/projects/{projectId}/branches",
    "POST /designcenter/api-designer/projects/{projectId}/branches",
    "GET /designcenter/api-designer/projects/{projectId}/branches/{branch}/files",
    "GET /designcenter/api-designer/projects/{projectId}/branches/{branch}/files/{filePath}",
    "POST /designcenter/api-designer/projects/{projectId}/branches/{branch}/acquireLock",
    "POST /designcenter/api-designer/projects/{projectId}/branches/{branch}/status",
    "POST /designcenter/api-designer/projects/{projectId}/branches/{branch}/releaseLock",
    "POST /designcenter/api-designer/projects/{projectId}/branches/{branch}/save",
    "POST /designcenter/api-designer/projects/{projectId}/branches/{branch}/files/{filePath}/move",
    "DELETE /designcenter/api-designer/projects/{projectId}/branches/{branch}/files/{filePath}",
    "POST /designcenter/api-designer/projects/{projectId}/branches/{branch}/publish/exchange",
  ],
};

function projectPath(projectId = ""): string {
  const suffix = projectId ? `/${encodePathSegment(projectId)}` : "";
  return `/designcenter/api-designer/projects${suffix}`;
}

function branchPath(projectId: string, branch = ""): string {
  const suffix = branch ? `/${encodePathSegment(branch)}` : "";
  return `${projectPath(projectId)}/branches${suffix}`;
}

const branchInput = {
  projectId: z.string().min(1).describe("Anypoint API Designer project ID."),
  branch: z.string().min(1).default("master").describe("Branch name. Defaults to master."),
};

const filePathInput = {
  ...branchInput,
  path: z.string().min(1).describe("File or folder path inside the branch, for example api.raml."),
};

export function registerApiDesignerTools(server: McpServer): void {
  registerEndpointResource(server, apiDesignerModule);

  server.registerTool(
    "api_designer_list_projects",
    {
      title: "List API Designer projects",
      description: "List API Designer projects the configured user can access.",
      annotations: { readOnlyHint: true },
    },
    async () => toolResult(await anypointRequest(projectPath())),
  );

  server.registerTool(
    "api_designer_create_project",
    {
      title: "Create API Designer project",
      description: "Create an API specification or RAML fragment project.",
      inputSchema: {
        name: z.string().min(1),
        classifier: z.enum(["raml", "raml-fragment"]).default("raml"),
        subType: z.string().optional().describe("Fragment subtype, such as trait or data-type."),
      },
    },
    async ({ name, classifier, subType }) =>
      toolResult(await anypointRequest(projectPath(), { method: "POST", body: { name, classifier, ...(subType ? { subType } : {}) } })),
  );

  server.registerTool(
    "api_designer_get_project",
    {
      title: "Get API Designer project",
      description: "Get details for one API Designer project.",
      inputSchema: { projectId: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ projectId }) => toolResult(await anypointRequest(projectPath(projectId))),
  );

  server.registerTool(
    "api_designer_delete_project",
    {
      title: "Delete API Designer project",
      description: "Delete an API Designer project.",
      inputSchema: { projectId: z.string().min(1) },
      annotations: { destructiveHint: true },
    },
    async ({ projectId }) => toolResult(await anypointRequest(projectPath(projectId), { method: "DELETE" })),
  );

  server.registerTool(
    "api_designer_list_branches",
    {
      title: "List API Designer branches",
      description: "List branches in an API Designer project.",
      inputSchema: { projectId: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ projectId }) => toolResult(await anypointRequest(branchPath(projectId))),
  );

  server.registerTool(
    "api_designer_create_branch",
    {
      title: "Create API Designer branch",
      description: "Create a branch. If commitId is omitted, Anypoint branches from master.",
      inputSchema: {
        projectId: z.string().min(1),
        name: z.string().min(1),
        commitId: z.string().optional(),
      },
    },
    async ({ projectId, name, commitId }) =>
      toolResult(await anypointRequest(branchPath(projectId), { method: "POST", body: { name, ...(commitId ? { commitId } : {}) } })),
  );

  server.registerTool(
    "api_designer_list_files",
    {
      title: "List API Designer files",
      description: "List files and folders in a project branch.",
      inputSchema: branchInput,
      annotations: { readOnlyHint: true },
    },
    async ({ projectId, branch }) => toolResult(await anypointRequest(`${branchPath(projectId, branch)}/files`)),
  );

  server.registerTool(
    "api_designer_read_file",
    {
      title: "Read API Designer file",
      description: "Read a file from a project branch.",
      inputSchema: filePathInput,
      annotations: { readOnlyHint: true },
    },
    async ({ projectId, branch, path }) =>
      toolResult(await anypointRequest(`${branchPath(projectId, branch)}/files/${encodePathSegment(path)}`, { accept: "*/*" })),
  );

  server.registerTool(
    "api_designer_acquire_lock",
    {
      title: "Acquire API Designer lock",
      description: "Acquire the write lock for a branch before file changes.",
      inputSchema: branchInput,
    },
    async ({ projectId, branch }) => toolResult(await anypointRequest(`${branchPath(projectId, branch)}/acquireLock`, { method: "POST", body: {} })),
  );

  server.registerTool(
    "api_designer_branch_status",
    {
      title: "API Designer branch status",
      description: "Read branch write-lock status and keep the lock alive.",
      inputSchema: branchInput,
    },
    async ({ projectId, branch }) => toolResult(await anypointRequest(`${branchPath(projectId, branch)}/status`, { method: "POST", body: {} })),
  );

  server.registerTool(
    "api_designer_release_lock",
    {
      title: "Release API Designer lock",
      description: "Release the write lock for a branch.",
      inputSchema: branchInput,
    },
    async ({ projectId, branch }) => toolResult(await anypointRequest(`${branchPath(projectId, branch)}/releaseLock`, { method: "POST", body: {} })),
  );

  server.registerTool(
    "api_designer_save_files",
    {
      title: "Save API Designer files",
      description: "Create or update one or more files in a branch. Acquire the branch lock first.",
      inputSchema: {
        ...branchInput,
        files: z.array(
          z.object({
            path: z.string().min(1),
            type: z.enum(["FILE", "FOLDER"]).default("FILE"),
            content: z.string().optional(),
            title: z.string().optional(),
          }),
        ).min(1),
      },
    },
    async ({ projectId, branch, files }) =>
      toolResult(await anypointRequest(`${branchPath(projectId, branch)}/save`, { method: "POST", body: files as SaveFile[] })),
  );

  server.registerTool(
    "api_designer_move_file",
    {
      title: "Move API Designer file",
      description: "Move or rename a file or folder in a branch.",
      inputSchema: {
        ...filePathInput,
        newPath: z.string().min(1).describe("Destination path inside the branch."),
      },
    },
    async ({ projectId, branch, path, newPath }) =>
      toolResult(await anypointRequest(`${branchPath(projectId, branch)}/files/${encodePathSegment(path)}/move`, { method: "POST", body: { path: newPath } })),
  );

  server.registerTool(
    "api_designer_delete_file",
    {
      title: "Delete API Designer file",
      description: "Delete a file or folder in a branch.",
      inputSchema: filePathInput,
      annotations: { destructiveHint: true },
    },
    async ({ projectId, branch, path }) =>
      toolResult(await anypointRequest(`${branchPath(projectId, branch)}/files/${encodePathSegment(path)}`, { method: "DELETE" })),
  );

  server.registerTool(
    "api_designer_publish_exchange",
    {
      title: "Publish API Designer project to Exchange",
      description: "Publish a branch to Anypoint Exchange.",
      inputSchema: {
        ...branchInput,
        name: z.string().min(1),
        apiVersion: z.string().min(1),
        version: z.string().min(1),
        main: z.string().min(1).describe("Main API file, for example api.raml."),
        assetId: z.string().min(1),
        groupId: z.string().min(1),
        classifier: z.enum(["raml", "raml-fragment"]).default("raml"),
      },
    },
    async ({ projectId, branch, ...publishRequest }) =>
      toolResult(await anypointRequest(`${branchPath(projectId, branch)}/publish/exchange`, { method: "POST", body: publishRequest })),
  );
}
