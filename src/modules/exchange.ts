import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { createUIResource } from "@mcp-ui/server";
import { z } from "zod/v4";
import { anypointRequest, encodePathSegment, organizationId } from "../shared/anypointClient.js";
import { toolResult } from "../shared/mcpResponse.js";

const EXCHANGE_ASSETS_URI = "ui://anypoint-exchange/assets" as const;
import { optionalOrgId } from "../shared/schemas.js";
import { advancedToolsEnabled, requireAdvancedTools } from "../shared/workflowGuards.js";
import { exchangeAssetUrl } from "../shared/anypointUrls.js";
import type { JsonValue } from "../shared/types.js";
import { renderExchangeAssetsHtml } from "../ui/exchangeUiRenderer.js";

// ─── Path helpers ─────────────────────────────────────────────────────────────

function assetPath(groupId: string, assetId: string, version: string): string {
  return `/exchange/api/v2/assets/${encodePathSegment(groupId)}/${encodePathSegment(assetId)}/${encodePathSegment(version)}`;
}

function applicationContractsPath(orgId: string, applicationId: string): string {
  return `/exchange/api/v2/organizations/${encodePathSegment(orgId)}/applications/${encodePathSegment(applicationId)}/contracts`;
}

// ─── Input helpers ────────────────────────────────────────────────────────────

const assetGavInput = {
  groupId: z.string().min(1).describe("Exchange asset group ID."),
  assetId: z.string().min(1).describe("Exchange asset ID."),
  version: z.string().min(1).describe("Exchange asset version."),
};

const stringId = z.union([z.string().min(1), z.number().int().nonnegative()]).transform(String);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function compactObject(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerExchangeTools(server: McpServer): void {
  // ── Discovery ──────────────────────────────────────────────────────────────

  registerAppResource(
    server,
    "Exchange Assets",
    EXCHANGE_ASSETS_URI,
    { description: "Visual table of Exchange assets with type, status, version, tags, and links." },
    async () => {
      const orgId = organizationId();
      const raw = await anypointRequest("/exchange/api/v2/assets", {
        query: { organizationId: orgId, limit: 25, offset: 0 },
      });
      const items: unknown[] = Array.isArray(raw)
        ? raw
        : isRecord(raw) && Array.isArray(raw.assets)
          ? raw.assets
          : [];
      const enriched = items.map((a) => {
        if (!isRecord(a)) return a;
        const url = exchangeAssetUrl(
          String(a.groupId ?? orgId),
          String(a.assetId ?? ""),
          String(a.version ?? ""),
        );
        return { ...a, exchangeUrl: url };
      });
      const html = renderExchangeAssetsHtml(enriched);
      const resource = createUIResource({
        uri: EXCHANGE_ASSETS_URI,
        content: { type: "rawHtml", htmlString: html },
        encoding: "text",
      });
      return { contents: [resource.resource] };
    },
  );

  registerAppTool(
    server,
    "exchange_list_assets",
    {
      title: "Exchange: List Assets",
      description:
        "List Exchange assets for an organization. Returns an interactive UI with asset type, status, version, tags, and links. Use the groupId/assetId/version from this result with exchange_get_asset.",
      inputSchema: {
        ...optionalOrgId,
        search: z.string().optional().describe("Full-text search filter."),
        type: z
          .string()
          .optional()
          .describe("Asset type filter, e.g. rest-api, connector, template."),
        limit: z.number().int().positive().max(100).default(25),
        offset: z.number().int().nonnegative().default(0),
      },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: EXCHANGE_ASSETS_URI } },
    },
    async ({ organizationId: orgOverride, search, type, limit, offset }) => {
      const orgId = organizationId(orgOverride);
      const raw = await anypointRequest("/exchange/api/v2/assets", {
        query: { organizationId: orgId, search, type, limit, offset },
      });
      const items: unknown[] = Array.isArray(raw)
        ? raw
        : isRecord(raw) && Array.isArray(raw.assets)
          ? raw.assets
          : [];
      return {
        content: [{ type: "text" as const, text: `Found ${items.length} Exchange asset(s).` }],
      };
    },
  );

  // ── Detail ─────────────────────────────────────────────────────────────────

  server.registerTool(
    "exchange_get_asset",
    {
      title: "Exchange: Get Asset",
      description:
        "Get full details for an Exchange asset version including portal pages and resources in one call. Call exchange_list_assets first to obtain groupId, assetId, and version.",
      inputSchema: {
        ...optionalOrgId,
        ...assetGavInput,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, groupId, assetId, version }) => {
      const orgId = organizationId(orgOverride);
      const path = assetPath(groupId, assetId, version);
      const query = { organizationId: orgId };

      const [asset, pages, resources] = await Promise.all([
        anypointRequest(path, { query }),
        anypointRequest(`${path}/portal/pages`, { query }).catch(() => []),
        anypointRequest(`${path}/portal/resources`, { query }).catch(() => []),
      ]);

      const url = exchangeAssetUrl(groupId, assetId, version);
      const enrichedAsset = isRecord(asset) ? { ...asset, exchangeUrl: url } : asset;
      return toolResult({ asset: enrichedAsset, pages: Array.isArray(pages) ? pages : [], resources: Array.isArray(resources) ? resources : [] });
    },
  );

  // ── Action ─────────────────────────────────────────────────────────────────

  server.registerTool(
    "exchange_create_contract",
    {
      title: "Exchange: Create Contract",
      description:
        "Request access to an Exchange API by creating an application contract. Call exchange_list_assets to find the asset and api_manager_list_apis for the API instance ID.",
      inputSchema: {
        ...optionalOrgId,
        ...assetGavInput,
        applicationId: stringId.describe("Client application ID."),
        instanceType: z.enum(["api", "api-group"]).default("api"),
        apiId: stringId.optional().describe("Managed API instance ID. Required when instanceType is api."),
        apiGroupInstanceId: stringId.optional().describe("API group instance ID. Required when instanceType is api-group."),
        environmentId: z.string().min(1).describe("Environment ID for the API instance."),
        versionGroup: z.string().optional().describe("Asset version group, e.g. v1."),
        requestedTierId: stringId.optional().describe("SLA tier ID. Omit when no SLA tier."),
        acceptedTerms: z.boolean().default(true),
      },
    },
    async ({
      organizationId: orgOverride,
      applicationId,
      instanceType,
      apiId,
      apiGroupInstanceId,
      environmentId,
      requestedTierId,
      acceptedTerms,
      groupId,
      assetId,
      version,
      versionGroup,
    }) => {
      if (instanceType === "api" && !apiId) {
        throw new Error("apiId is required when instanceType is api.");
      }
      if (instanceType === "api-group" && !apiGroupInstanceId) {
        throw new Error("apiGroupInstanceId is required when instanceType is api-group.");
      }

      const orgId = organizationId(orgOverride);
      const instanceIdentifier =
        instanceType === "api" ? { apiId } : { apiGroupInstanceId };

      return toolResult(
        await anypointRequest(applicationContractsPath(orgId, applicationId), {
          method: "POST",
          body: compactObject({
            ...instanceIdentifier,
            instanceType,
            environmentId,
            requestedTierId,
            acceptedTerms,
            organizationId: orgId,
            groupId,
            assetId,
            version,
            versionGroup,
          }) as JsonValue,
        }),
      );
    },
  );

  // ── Advanced / Gated ───────────────────────────────────────────────────────

  if (advancedToolsEnabled()) {
  server.registerTool(
    "exchange_delete_asset",
    {
      title: "Exchange: Delete Asset [Advanced]",
      description:
        "Delete a specific Exchange asset version. Requires ANYPOINT_MCP_ADVANCED_TOOLS=true.",
      inputSchema: {
        ...optionalOrgId,
        ...assetGavInput,
      },
      annotations: { destructiveHint: true },
    },
    async ({ organizationId: orgOverride, groupId, assetId, version }) => {
      requireAdvancedTools();
      return toolResult(
        await anypointRequest(assetPath(groupId, assetId, version), {
          method: "DELETE",
          query: { organizationId: organizationId(orgOverride) },
        }),
      );
    },
  );
  } // end advancedToolsEnabled
}
