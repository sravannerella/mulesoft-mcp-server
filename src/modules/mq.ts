import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { createUIResource } from "@mcp-ui/server";
import { z } from "zod/v4";
import { anypointRequest, encodePathSegment, environmentId, organizationId } from "../shared/anypointClient.js";
import { toolResult } from "../shared/mcpResponse.js";

const MQ_QUEUES_URI = "ui://anypoint-mq/queues" as const;
import { optionalEnvId, optionalOrgId } from "../shared/schemas.js";
import type { JsonValue } from "../shared/types.js";
import { renderMqQueuesHtml } from "../ui/mqUiRenderer.js";

// ─── Path helpers ─────────────────────────────────────────────────────────────

function mqRegionBase(orgId: string, envId: string, region: string): string {
  return `/mq/admin/api/v1/organizations/${encodePathSegment(orgId)}/environments/${encodePathSegment(envId)}/regions/${encodePathSegment(region)}`;
}

function queuesPath(orgId: string, envId: string, region: string): string {
  return `${mqRegionBase(orgId, envId, region)}/destinations/queues`;
}

function queuePath(orgId: string, envId: string, region: string, queueId: string): string {
  return `${queuesPath(orgId, envId, region)}/${encodePathSegment(queueId)}`;
}

function messagesPath(orgId: string, envId: string, region: string, queueId: string): string {
  return `${mqRegionBase(orgId, envId, region)}/bindings/${encodePathSegment(`${queueId}~http`)}`;
}

function statsPath(orgId: string, envId: string, region: string): string {
  return `/mq/stats/api/v1/organizations/${encodePathSegment(orgId)}/environments/${encodePathSegment(envId)}/regions/${encodePathSegment(region)}/queues`;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const scopeInput = {
  ...optionalOrgId,
  ...optionalEnvId,
  region: z
    .string()
    .default("us-east-1")
    .describe("MQ region, e.g. us-east-1, eu-west-1. Defaults to us-east-1."),
};

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerMqTools(server: McpServer): void {
  // ── Discovery ──────────────────────────────────────────────────────────────

  registerAppResource(
    server,
    "MQ Queues",
    MQ_QUEUES_URI,
    { description: "Visual table of Anypoint MQ queues with stats, DLQ status, and TTLs." },
    async () => {
      const orgId = organizationId();
      const envId = environmentId();
      const region = "us-east-1";
      const [queuesRaw, statsRaw] = await Promise.all([
        anypointRequest(queuesPath(orgId, envId, region), { query: { limit: 25, offset: 0 } }),
        anypointRequest(statsPath(orgId, envId, region)).catch(() => undefined),
      ]);
      const queues: unknown[] = Array.isArray(queuesRaw)
        ? queuesRaw
        : isRecord(queuesRaw) && Array.isArray(queuesRaw.queues)
          ? queuesRaw.queues
          : [];
      const statsMap = new Map<string, unknown>();
      if (Array.isArray(statsRaw)) {
        for (const s of statsRaw) {
          if (isRecord(s) && typeof s.queueId === "string") statsMap.set(s.queueId, s);
        }
      }
      const enriched = queues.map((q) => {
        if (!isRecord(q)) return q;
        const qId = String(q.queueId ?? "");
        const stats = statsMap.get(qId);
        return stats ? { ...q, stats } : q;
      });
      const html = renderMqQueuesHtml(enriched, envId);
      const resource = createUIResource({
        uri: MQ_QUEUES_URI,
        content: { type: "rawHtml", htmlString: html },
        encoding: "text",
      });
      return { contents: [resource.resource] };
    },
  );

  registerAppTool(
    server,
    "mq_list_queues",
    {
      title: "Anypoint MQ: List Queues",
      description:
        "List Anypoint MQ queues in an environment region. Returns a UI showing message counts, DLQ status, encryption, and TTLs. Use the queueId from this result with mq_send_message or mq_purge_queue.",
      inputSchema: {
        ...scopeInput,
        limit: z.number().int().positive().max(200).default(25),
        offset: z.number().int().nonnegative().default(0),
      },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: MQ_QUEUES_URI } },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, region, limit, offset }) => {
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);
      const queuesRaw = await anypointRequest(queuesPath(orgId, envId, region), { query: { limit, offset } });
      const queues: unknown[] = Array.isArray(queuesRaw)
        ? queuesRaw
        : isRecord(queuesRaw) && Array.isArray(queuesRaw.queues)
          ? queuesRaw.queues
          : [];
      return {
        content: [{ type: "text" as const, text: `Found ${queues.length} MQ queue(s) in region ${region}.` }],
      };
    },
  );

  // ── Action: Send message ───────────────────────────────────────────────────

  server.registerTool(
    "mq_send_message",
    {
      title: "Anypoint MQ: Send Message",
      description:
        "Publish a message to an Anypoint MQ queue. Call mq_list_queues first to confirm the queueId.",
      inputSchema: {
        ...scopeInput,
        queueId: z.string().min(1).describe("Queue ID from mq_list_queues."),
        messageId: z
          .string()
          .optional()
          .describe("Optional idempotent message ID. Generated by MQ if omitted."),
        body: z.string().min(1).describe("Message body (UTF-8 text or serialized JSON)."),
        properties: z
          .record(z.string(), z.string())
          .optional()
          .describe("Optional message properties (string key-value pairs)."),
        ttl: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Time-to-live in milliseconds. Overrides queue default."),
        deliveryDelay: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Delivery delay in milliseconds."),
      },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, region, queueId, messageId, body, properties, ttl, deliveryDelay }) => {
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);

      const payload: Record<string, unknown> = { body };
      if (messageId) payload.messageId = messageId;
      if (properties) payload.properties = properties;
      if (ttl !== undefined) payload.ttl = ttl;
      if (deliveryDelay !== undefined) payload.deliveryDelay = deliveryDelay;

      return toolResult(
        await anypointRequest(messagesPath(orgId, envId, region, queueId), {
          method: "POST",
          body: payload as JsonValue,
        }),
      );
    },
  );

  // ── Action: Purge queue ────────────────────────────────────────────────────

  server.registerTool(
    "mq_purge_queue",
    {
      title: "Anypoint MQ: Purge Queue",
      description:
        "Delete all messages from an Anypoint MQ queue. This is irreversible. Call mq_list_queues first to confirm the queueId and message count.",
      inputSchema: {
        ...scopeInput,
        queueId: z.string().min(1).describe("Queue ID from mq_list_queues."),
      },
      annotations: { destructiveHint: true },
    },
    async ({ organizationId: orgOverride, environmentId: envOverride, region, queueId }) => {
      const orgId = organizationId(orgOverride);
      const envId = environmentId(envOverride);
      return toolResult(
        await anypointRequest(`${queuePath(orgId, envId, region, queueId)}/messages`, {
          method: "DELETE",
        }),
      );
    },
  );
}
