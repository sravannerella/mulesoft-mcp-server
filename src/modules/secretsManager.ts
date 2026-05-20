import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { anypointRequest, encodePathSegment, environmentId, organizationId } from "../shared/anypointClient.js";
import { toolResult } from "../shared/mcpResponse.js";
import { optionalEnvId, optionalOrgId } from "../shared/schemas.js";
import type { JsonValue } from "../shared/types.js";

// ──────────────────────────────────────────────────────────────────────────────
// SECURITY CONTRACT: No tool in this module ever returns a secret value.
// All responses include only metadata (name, type, expiry, status, etc.).
// ──────────────────────────────────────────────────────────────────────────────

// ─── Path helpers ─────────────────────────────────────────────────────────────

function secretsBase(orgId: string, envId: string): string {
  return `/secrets-manager/api/v1/organizations/${encodePathSegment(orgId)}/environments/${encodePathSegment(envId)}`;
}

function storesPath(orgId: string, envId: string): string {
  return `${secretsBase(orgId, envId)}/secretGroups`;
}

function storePath(orgId: string, envId: string, storeId: string): string {
  return `${storesPath(orgId, envId)}/${encodePathSegment(storeId)}`;
}

function secretsPath(orgId: string, envId: string, storeId: string, secretType: string): string {
  return `${storePath(orgId, envId, storeId)}/${encodePathSegment(secretType)}`;
}

function secretPath(orgId: string, envId: string, storeId: string, secretType: string, secretId: string): string {
  return `${secretsPath(orgId, envId, storeId, secretType)}/${encodePathSegment(secretId)}`;
}

// ─── Scrub helper: strip any field that looks like a secret value ─────────────

const SENSITIVE_KEYS = new Set([
  "value",
  "secret",
  "password",
  "token",
  "privateKey",
  "private_key",
  "keyStore",
  "key_store",
  "certificate",
  "keyContent",
  "key",
  "data",
  "content",
  "passphrase",
  "credentials",
]);

function scrubValues(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(scrubValues);
  if (obj === null || typeof obj !== "object") return obj;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    result[k] = SENSITIVE_KEYS.has(k) ? "[REDACTED — never exposed by MCP]" : scrubValues(v);
  }
  return result;
}

// ─── Input schemas ────────────────────────────────────────────────────────────

const scopeInput = {
  ...optionalOrgId,
  ...optionalEnvId,
};

const storeInput = {
  ...scopeInput,
  storeId: z.string().min(1).describe("Secret group (store) ID from secrets_list_stores."),
};

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerSecretsManagerTools(server: McpServer): void {
  // ── Discovery: List stores ─────────────────────────────────────────────────

  server.registerTool(
    "secrets_list_stores",
    {
      title: "Secrets Manager: List Secret Groups",
      description:
        "List Secrets Manager secret groups (stores) in an environment. Returns metadata only — no secret values are ever returned. Use the storeId from this result with secrets_list_secrets.",
      inputSchema: scopeInput,
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride }) => {
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);
      const raw = await anypointRequest(storesPath(orgId, envId));
      return toolResult(scrubValues(raw));
    },
  );

  // ── Discovery: List secrets metadata ──────────────────────────────────────

  server.registerTool(
    "secrets_list_secrets",
    {
      title: "Secrets Manager: List Secrets",
      description:
        "List secrets in a secret group. Returns name, type, and expiry metadata ONLY — secret values are NEVER returned or exposed. Call secrets_list_stores first to obtain the storeId.",
      inputSchema: {
        ...storeInput,
        secretType: z
          .enum([
            "certificates",
            "keystores",
            "truststores",
            "crlDistributors",
            "credentials",
            "symmetricKeys",
          ])
          .default("credentials")
          .describe("Secret type to list."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, storeId, secretType }) => {
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);
      const raw = await anypointRequest(secretsPath(orgId, envId, storeId, secretType));
      // Always scrub before returning — belt-and-suspenders guarantee
      return toolResult(scrubValues(raw));
    },
  );

  // ── Action: Create or update secret ───────────────────────────────────────

  server.registerTool(
    "secrets_upsert_secret",
    {
      title: "Secrets Manager: Create or Update Secret",
      description:
        "Create or update a secret in a Secrets Manager secret group. The secret value is accepted as input but is NEVER echoed back in the response. Call secrets_list_stores to find the storeId.",
      inputSchema: {
        ...storeInput,
        secretType: z
          .enum([
            "certificates",
            "keystores",
            "truststores",
            "crlDistributors",
            "credentials",
            "symmetricKeys",
          ])
          .describe("Secret type."),
        secretId: z
          .string()
          .optional()
          .describe("Secret ID to update. Omit to create a new secret."),
        name: z.string().min(1).describe("Secret name."),
        expiration: z
          .string()
          .optional()
          .describe("ISO 8601 expiration date, e.g. 2026-01-01T00:00:00Z."),
        secretData: z
          .record(z.string(), z.unknown())
          .describe("Secret-type-specific fields per the Secrets Manager API schema (e.g. { password, username } for credentials)."),
      },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, storeId, secretType, secretId, name, expiration, secretData }) => {
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);

      const body: Record<string, unknown> = { name, ...secretData };
      if (expiration) body.expiration = expiration;

      let raw: unknown;
      if (secretId) {
        raw = await anypointRequest(secretPath(orgId, envId, storeId, secretType, secretId), {
          method: "PUT",
          body: body as JsonValue,
        });
      } else {
        raw = await anypointRequest(secretsPath(orgId, envId, storeId, secretType), {
          method: "POST",
          body: body as JsonValue,
        });
      }

      // Scrub response — never echo secret values back
      return toolResult(scrubValues(raw));
    },
  );
}
