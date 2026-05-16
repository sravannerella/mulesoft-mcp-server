import { z } from "zod/v4";
import type { JsonValue } from "./types.js";

export const optionalOrgId = {
  organizationId: z.string().min(1).optional().describe("Defaults to discovered profile organization ID or ANYPOINT_ORG_ID."),
};

export const optionalEnvId = {
  environmentId: z.string().min(1).optional().describe("Defaults to ANYPOINT_ENV_ID."),
};

export const rawRequestInput = {
  path: z.string().min(1).startsWith("/"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  body: z.record(z.string(), z.unknown()).optional(),
};

export function asJsonValue(value: unknown): JsonValue | undefined {
  return value === undefined ? undefined : (value as JsonValue);
}
