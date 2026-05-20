import {
  L_INBOX, L_LOCK, L_ZAP,
  escHtml, formatNumber,
  warmHtmlPage, warmIconBox,
} from "./baseUiRenderer.js";

type Queue = {
  queueId?: string;
  id?: string;
  fifo?: boolean;
  encrypted?: boolean;
  deadLetterQueueArn?: string | boolean;
  stats?: {
    messagesVisible?: number;
    messagesNotVisible?: number;
    messagesDelayed?: number;
  };
  messageGroupingEnabled?: boolean;
  defaultTtl?: number;
  defaultLockTtl?: number;
  maxDeliveries?: number;
  [key: string]: unknown;
};

function str(v: unknown): string {
  return typeof v === "string" && v.length > 0 ? v : "";
}

function formatMs(ms: number | undefined): string {
  if (ms === undefined || ms === null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60 > 0 ? `${s % 60}s` : ""}`.trim();
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60 > 0 ? `${m % 60}m` : ""}`.trim();
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24 > 0 ? `${h % 24}h` : ""}`.trim();
}

function statBox(value: number | undefined, label: string): string {
  const display = value !== undefined ? formatNumber(value) : "—";
  return `<div class="stat-box">
    <div class="stat-value">${display}</div>
    <div class="stat-label">${label}</div>
  </div>`;
}

function queueCard(q: Queue): string {
  const id        = str(q.queueId) || str(q.id) || "Unnamed Queue";
  const fifo      = Boolean(q.fifo || q.messageGroupingEnabled);
  const encrypted = Boolean(q.encrypted);
  const isDlq     = Boolean(q.deadLetterQueueArn);
  const stats     = q.stats ?? {};
  const visible   = typeof stats.messagesVisible === "number" ? stats.messagesVisible : undefined;
  const notVis    = typeof stats.messagesNotVisible === "number" ? stats.messagesNotVisible : undefined;
  const delayed   = typeof stats.messagesDelayed === "number" ? stats.messagesDelayed : undefined;

  const badges = [
    fifo      ? `<span class="chip" style="background:#e8f3ff;color:#1a4db7">${L_ZAP} FIFO</span>` : "",
    encrypted ? `<span class="chip" style="background:#f4ece4;color:#5a3e2b">${L_LOCK} Encrypted</span>` : "",
    isDlq     ? `<span class="chip" style="background:#fde8db;color:#c44a1a">DLQ</span>` : "",
  ].filter(Boolean).join("");

  const meta: string[] = [
    q.defaultTtl !== undefined ? `<div><div class="label">TTL</div><div style="font-size:13px;font-weight:500;margin-top:2px">${formatMs(q.defaultTtl as number)}</div></div>` : "",
    q.defaultLockTtl !== undefined ? `<div><div class="label">Lock TTL</div><div style="font-size:13px;font-weight:500;margin-top:2px">${formatMs(q.defaultLockTtl as number)}</div></div>` : "",
    q.maxDeliveries !== undefined ? `<div><div class="label">Max Deliveries</div><div style="font-size:13px;font-weight:500;margin-top:2px">${q.maxDeliveries}</div></div>` : "",
  ].filter(Boolean);

  return `
<div class="card">
  <div class="card-section" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    ${warmIconBox(L_INBOX, 40)}
    <div style="flex:1;min-width:0">
      <div style="font-size:15px;font-weight:700;color:#171717;word-break:break-all">${escHtml(id)}</div>
      ${badges ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${badges}</div>` : ""}
    </div>
  </div>
  ${(visible !== undefined || notVis !== undefined || delayed !== undefined) ? `
  <div class="divider"></div>
  <div class="card-section">
    <div class="stat-row">
      ${statBox(visible, "Visible")}
      ${statBox(notVis, "In-Flight")}
      ${statBox(delayed, "Delayed")}
    </div>
  </div>` : ""}
  ${meta.length > 0 ? `
  <div class="divider"></div>
  <div class="card-section" style="display:flex;gap:24px;flex-wrap:wrap">
    ${meta.join("")}
  </div>` : ""}
</div>`;
}

export function renderMqQueuesHtml(data: unknown, envLabel?: string): string {
  const items: Queue[] = Array.isArray(data)
    ? (data as Queue[])
    : Array.isArray((data as Record<string, unknown>)?.queues)
      ? ((data as Record<string, unknown>).queues as Queue[])
      : Array.isArray((data as Record<string, unknown>)?.items)
        ? ((data as Record<string, unknown>).items as Queue[])
        : [];

  if (items.length === 0) {
    return warmHtmlPage("Anypoint MQ — Queues", "0 queues", `<p class="empty">No queues found.</p>`);
  }

  const subtitle = [`${items.length} queue${items.length === 1 ? "" : "s"}`, envLabel].filter(Boolean).join(" · ");
  return warmHtmlPage("Anypoint MQ — Queues", subtitle, items.map(queueCard).join(""));
}
