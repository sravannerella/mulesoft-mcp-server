import { escHtml, htmlPage, inlineChart, statusBadge, formatDate } from "./baseUiRenderer.js";

type DataPoint = { timestamp?: string | number; value?: number; [key: string]: unknown };
type MetricSeries = { name?: string; data?: DataPoint[]; [key: string]: unknown };

function extractTimestampLabel(dp: DataPoint): string {
  const ts = dp.timestamp;
  if (!ts) return "";
  try {
    return new Date(typeof ts === "number" ? ts : ts).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

function seriesColor(index: number): { border: string; bg: string } {
  const palette = [
    { border: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
    { border: "#10b981", bg: "rgba(16,185,129,0.15)" },
    { border: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
    { border: "#ef4444", bg: "rgba(239,68,68,0.15)" },
    { border: "#8b5cf6", bg: "rgba(139,92,246,0.15)" },
    { border: "#06b6d4", bg: "rgba(6,182,212,0.15)" },
  ];
  return palette[index % palette.length];
}

function buildChartFromSeries(canvasId: string, series: MetricSeries[], chartLabel: string): string {
  if (!series.length) {
    return `<p style="color:#94a3b8;font-size:12px;padding:8px">No data points returned.</p>`;
  }

  // Use labels from the first series
  const labels = (series[0].data ?? []).map(extractTimestampLabel);
  const datasets = series.map((s, i) => {
    const color = seriesColor(i);
    const values = (s.data ?? []).map((dp) => dp.value ?? 0);
    return {
      label: s.name ?? `Series ${i + 1}`,
      data: values,
      color: color.border,
    };
  });

  return inlineChart(canvasId, "line", labels, datasets);
}

// Generic helper for monitoring query results with auto-extracted series
function extractSeries(raw: unknown): MetricSeries[] {
  if (Array.isArray(raw)) return raw as MetricSeries[];
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    for (const key of ["series", "results", "metrics", "data"]) {
      if (Array.isArray(r[key])) return r[key] as MetricSeries[];
    }
  }
  return [];
}

function metaTable(entries: Array<[string, string]>): string {
  if (!entries.length) return "";
  const rows = entries
    .filter(([, v]) => v && v !== "—")
    .map(([k, v]) => `<tr><td style="color:#64748b;font-size:11px;padding:3px 8px 3px 0">${escHtml(k)}</td><td style="font-size:12px;font-weight:500">${escHtml(v)}</td></tr>`)
    .join("");
  return rows ? `<table style="margin-bottom:12px">${rows}</table>` : "";
}

export function renderMonitoringAppOverviewHtml(
  appName: string,
  envLabel: string,
  timeRange: string,
  rawData: unknown,
): string {
  const series = extractSeries(rawData);
  const chart = buildChartFromSeries("chart-overview", series, "App Metrics");

  const meta = metaTable([
    ["Application", appName],
    ["Environment", envLabel],
    ["Time range", timeRange],
    ["Series", String(series.length)],
  ]);

  const body = `${meta}<div class="chart-container">${chart}</div>`;
  return htmlPage(
    { title: `Monitoring — ${appName}`, subtitle: `Overview · ${timeRange}`, includeChartJs: true },
    body,
  );
}

export function renderMonitoringApiAnalyticsHtml(
  apiName: string,
  envLabel: string,
  timeRange: string,
  rawData: unknown,
): string {
  const series = extractSeries(rawData);
  const chart = buildChartFromSeries("chart-api-analytics", series, "API Analytics");

  const meta = metaTable([
    ["API", apiName],
    ["Environment", envLabel],
    ["Time range", timeRange],
    ["Series", String(series.length)],
  ]);

  const body = `${meta}<div class="chart-container">${chart}</div>`;
  return htmlPage(
    { title: `API Analytics — ${apiName}`, subtitle: `${timeRange}`, includeChartJs: true },
    body,
  );
}

export function renderMetricsSearchHtml(
  query: string,
  rawData: unknown,
): string {
  const series = extractSeries(rawData);
  const chart = buildChartFromSeries("chart-metrics", series, "Metrics");

  const body = `
<div class="card" style="margin-bottom:12px">
  <div style="font-size:11px;color:#64748b">AMQL Query</div>
  <code style="font-size:11px;color:#1e293b;white-space:pre-wrap">${escHtml(query)}</code>
</div>
<div class="chart-container">${chart}</div>`;

  return htmlPage(
    { title: "Metrics Search", subtitle: `${series.length} series returned`, includeChartJs: true },
    body,
  );
}
