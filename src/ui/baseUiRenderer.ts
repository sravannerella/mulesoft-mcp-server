export type StatusBadgeState =
  | "started"
  | "stopped"
  | "deploying"
  | "failed"
  | "partial"
  | "applying"
  | "active"
  | "inactive"
  | "unknown";

const STATUS_COLORS: Record<StatusBadgeState, { bg: string; fg: string; label: string }> = {
  started:   { bg: "#d1fae5", fg: "#065f46", label: "Started" },
  stopped:   { bg: "#fee2e2", fg: "#991b1b", label: "Stopped" },
  deploying: { bg: "#fef3c7", fg: "#92400e", label: "Deploying" },
  failed:    { bg: "#fee2e2", fg: "#7f1d1d", label: "Failed" },
  partial:   { bg: "#fef3c7", fg: "#78350f", label: "Partial" },
  applying:  { bg: "#dbeafe", fg: "#1e40af", label: "Applying" },
  active:    { bg: "#d1fae5", fg: "#065f46", label: "Active" },
  inactive:  { bg: "#f3f4f6", fg: "#374151", label: "Inactive" },
  unknown:   { bg: "#f3f4f6", fg: "#374151", label: "Unknown" },
};

export function normalizeStatus(raw: string | undefined): StatusBadgeState {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("start") || s === "running" || s === "applied") return "started";
  if (s.includes("stop") || s === "stopped") return "stopped";
  if (s.includes("deploy") || s.includes("provisioning") || s.includes("applying")) return "deploying";
  if (s.includes("fail") || s.includes("error")) return "failed";
  if (s.includes("partial")) return "partial";
  if (s === "active" || s === "enabled") return "active";
  if (s === "inactive" || s === "disabled") return "inactive";
  return "unknown";
}

export function statusBadge(raw: string | undefined): string {
  const key = normalizeStatus(raw);
  const { bg, fg, label } = STATUS_COLORS[key];
  return `<span class="badge" style="background:${bg};color:${fg}">${escHtml(raw ?? label)}</span>`;
}

export function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escAttr(str: string): string {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function formatDate(value: string | number | undefined): string {
  if (!value) return "—";
  try {
    const d = typeof value === "number" ? new Date(value) : new Date(value);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return String(value);
  }
}

export function linkButton(href: string, label: string, title = ""): string {
  return `<a class="btn-link" href="${escAttr(href)}" target="_blank" rel="noopener noreferrer" title="${escAttr(title || label)}">${escHtml(label)}</a>`;
}

export function copyButton(value: string, label = "Copy URL"): string {
  return `<button class="btn-copy" onclick="navigator.clipboard.writeText('${escAttr(value)}').catch(()=>{})" title="Copy to clipboard">${escHtml(label)}</button>`;
}

export function formatNumber(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString();
}

export function envGroupHeader(name: string, count: number, type?: string): string {
  const typeChip = type
    ? ` <span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:9999px;background:${type.toLowerCase() === "production" ? "#fef3c7" : "#dbeafe"};color:${type.toLowerCase() === "production" ? "#92400e" : "#1e40af"}">${escHtml(type)}</span>`
    : "";
  return `<div class="env-group-header">🌐 ${escHtml(name)}${typeChip}<span class="env-count">${count} deployment${count !== 1 ? "s" : ""}</span></div>`;
}

const BASE_STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    font-size: 13px;
    background: #f8fafc;
    color: #1e293b;
    padding: 16px;
  }
  h1 { font-size: 18px; font-weight: 600; margin-bottom: 4px; color: #0f172a; }
  h2 { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #334155; }
  .subtitle { font-size: 12px; color: #64748b; margin-bottom: 16px; }
  .card {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 10px;
    transition: box-shadow 0.15s;
  }
  .card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
  .card-title { font-weight: 600; font-size: 14px; flex: 1; min-width: 0; word-break: break-all; }
  .card-meta { font-size: 11px; color: #64748b; display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 8px; }
  .card-meta span { display: flex; align-items: center; gap: 4px; }
  .card-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
  }
  .badge-outline {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
    border: 1px solid #cbd5e1;
    color: #475569;
    background: transparent;
    white-space: nowrap;
  }
  .btn-link {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 6px;
    background: #f1f5f9;
    color: #0f172a;
    font-size: 11px;
    font-weight: 500;
    text-decoration: none;
    border: 1px solid #e2e8f0;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.1s;
  }
  .btn-link:hover { background: #e2e8f0; }
  .btn-copy {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 6px;
    background: #f1f5f9;
    color: #0f172a;
    font-size: 11px;
    font-weight: 500;
    border: 1px solid #e2e8f0;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.1s;
  }
  .btn-copy:hover { background: #e2e8f0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
  .tag { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
  .icon { display: inline-block; font-size: 13px; }
  .empty { color: #94a3b8; font-style: italic; padding: 24px; text-align: center; }
  .section { margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 6px 10px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; font-weight: 600; color: #475569; }
  td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .chart-container { position: relative; height: 200px; margin-bottom: 16px; }
  /* Environment grouping */
  .env-group { margin-bottom: 24px; }
  .env-group-header {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 12px 5px 10px;
    background: #f1f5f9;
    border-left: 3px solid #6366f1;
    border-radius: 0 6px 6px 0;
    margin-bottom: 10px;
    font-size: 12px; font-weight: 600; color: #334155;
  }
  .env-group-header .env-count { font-weight: 400; color: #94a3b8; margin-left: auto; }
  /* Stat row */
  .stat-row { display: flex; flex-wrap: wrap; gap: 10px; margin: 8px 0; }
  .stat-box {
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 8px 14px; min-width: 72px; text-align: center; flex: 1;
  }
  .stat-value { font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.2; }
  .stat-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
  /* Code inline */
  code { font-family: 'SF Mono', 'Fira Mono', 'Consolas', monospace; font-size: 11px; background: #f1f5f9; padding: 1px 5px; border-radius: 4px; }
`;


const CHARTJS_CDN = "https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js";

export type PageOptions = {
  title: string;
  subtitle?: string;
  includeChartJs?: boolean;
};

export function htmlPage(options: PageOptions, body: string): string {
  const { title, subtitle, includeChartJs = false } = options;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  <style>${BASE_STYLES}</style>
  ${includeChartJs ? `<script src="${CHARTJS_CDN}"></script>` : ""}
</head>
<body>
  <h1>${escHtml(title)}</h1>
  ${subtitle ? `<p class="subtitle">${escHtml(subtitle)}</p>` : ""}
  ${body}
</body>
</html>`;
}

export function inlineChart(
  canvasId: string,
  type: "line" | "bar",
  labels: string[],
  datasets: { label: string; data: number[]; color: string }[],
): string {
  const datasetsJson = JSON.stringify(
    datasets.map((d) => ({
      label: d.label,
      data: d.data,
      borderColor: d.color,
      backgroundColor: d.color + "22",
      tension: 0.3,
      fill: type === "line",
      pointRadius: 2,
    })),
  );
  const labelsJson = JSON.stringify(labels);
  return `
<div class="chart-container">
  <canvas id="${escAttr(canvasId)}"></canvas>
</div>
<script>
(function() {
  var ctx = document.getElementById(${JSON.stringify(canvasId)}).getContext('2d');
  new Chart(ctx, {
    type: ${JSON.stringify(type)},
    data: { labels: ${labelsJson}, datasets: ${datasetsJson} },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
      scales: {
        x: { ticks: { font: { size: 10 }, maxTicksLimit: 8 } },
        y: { beginAtZero: true, ticks: { font: { size: 10 } } }
      }
    }
  });
})();
</script>`;
}

// =============================================================================
// Warm Design System — shared across all list-view renderers
// =============================================================================

// Lucide icon factory (stroke-based, currentColor)
const _ico = (paths: string, w = 18, h = 18): string =>
  `<svg width="${w}" height="${h}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const L_BUILDING    = _ico(`<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>`);
export const L_FINGERPRINT = _ico(`<path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/>`);
export const L_USER        = _ico(`<circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/>`);
export const L_CLOCK       = _ico(`<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`);
export const L_PACKAGE     = _ico(`<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>`);
export const L_SERVER      = _ico(`<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>`);
export const L_SHIELD      = _ico(`<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>`);
export const L_LINK        = _ico(`<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`, 16, 16);
export const L_EXTERNAL    = _ico(`<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>`, 14, 14);
export const L_TAG         = _ico(`<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>`, 15, 15);
export const L_INBOX       = _ico(`<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>`);
export const L_LOCK        = _ico(`<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`, 16, 16);
export const L_ZAP         = _ico(`<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>`, 15, 15);
export const L_ACTIVITY    = _ico(`<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>`, 15, 15);
export const L_ROCKET      = _ico(`<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>`, 15, 15);
export const L_FLASK       = _ico(`<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>`, 15, 15);
export const L_GLOBE       = _ico(`<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>`, 15, 15);
export const L_COPY_ICON   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

// ---------------------------------------------------------------------------
// Shared CSS for warm design system
// ---------------------------------------------------------------------------
const WARM_FONTS_HTML = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&display=swap" rel="stylesheet">`;

const WARM_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f2efea; padding: 16px; color: #171717;
  }
  h1 { font-size: 20px; font-weight: 700; color: #171717; margin-bottom: 4px; }
  .page-subtitle {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 14px; color: #8b8b8b; margin-bottom: 16px;
  }
  .label { font-family: 'EB Garamond', Georgia, serif; font-size: 12px; font-weight: 400; color: #8b8b8b; }
  .card { background: #fff; border-radius: 20px; border: 1px solid #e5e2dd; overflow: hidden; margin-bottom: 12px; }
  .card-section { padding: 14px 18px; }
  .divider { height: 1px; background: #ebebeb; }
  .icon-box {
    width: 36px; height: 36px; border-radius: 10px; background: #f4ece4; color: #5a3e2b;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .copy-btn {
    width: 30px; height: 30px; border: 1px solid #e5e2dd; border-radius: 8px;
    background: transparent; cursor: pointer; color: #737373; flex-shrink: 0;
    display: inline-flex; align-items: center; justify-content: center; padding: 0;
  }
  .copy-btn:hover { background: #f5f2ef; }
  .link-btn {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 7px 14px; border-radius: 14px; border: 1px solid #e5e2dd;
    background: #fff; color: #171717; font-size: 12px; font-weight: 500;
    text-decoration: none; white-space: nowrap;
  }
  .link-btn:hover { background: #f5f2ef; }
  .chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px; border-radius: 12px;
    font-size: 11px; font-weight: 500; color: #171717;
  }
  .stat-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .stat-box {
    flex: 1; min-width: 80px; text-align: center;
    background: #f9f7f5; border: 1px solid #e5e2dd; border-radius: 14px; padding: 14px 10px;
  }
  .stat-value { font-size: 24px; font-weight: 700; color: #171717; line-height: 1; }
  .stat-label { font-family: 'EB Garamond', Georgia, serif; font-size: 12px; color: #8b8b8b; margin-top: 6px; }
  .env-group { margin-bottom: 16px; }
  .env-group-header {
    display: flex; align-items: center; gap: 8px; padding: 8px 14px; margin-bottom: 10px;
    background: #f9f7f5; border-left: 3px solid #c4b5a0; border-radius: 0 14px 14px 0;
    font-size: 13px; font-weight: 600; color: #5a3e2b;
  }
  .env-group-count { font-weight: 400; color: #8b8b8b; margin-left: auto; font-family: 'EB Garamond', Georgia, serif; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th {
    font-family: 'EB Garamond', Georgia, serif; text-align: left;
    padding: 8px 12px; color: #8b8b8b; font-weight: 600; font-size: 12px;
    border-bottom: 1px solid #ebebeb;
  }
  td { padding: 8px 12px; border-bottom: 1px solid #f5f2ef; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  code {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 11px; background: #f4ece4; padding: 2px 6px; border-radius: 6px; color: #5a3e2b;
  }
  .empty { font-family: 'EB Garamond', Georgia, serif; color: #8b8b8b; text-align: center; padding: 48px 20px; font-size: 16px; }
  details > summary { cursor: pointer; list-style: none; }
  details > summary::-webkit-details-marker { display: none; }
  @media (max-width: 480px) {
    body { padding: 10px; }
    .card-section { padding: 12px 14px; }
    h1 { font-size: 17px; }
  }
`;

const WARM_COPY_SCRIPT = `
<script>
  function __copy(t){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).catch(function(){__fb(t)})}else{__fb(t)}}
  function __fb(t){var el=document.createElement('textarea');el.value=t;el.style.cssText='position:fixed;top:-9999px;left:-9999px;opacity:0';document.body.appendChild(el);el.focus();el.select();try{document.execCommand('copy')}catch(e){}document.body.removeChild(el)}
</script>`;

// ---------------------------------------------------------------------------
// Warm page wrapper
// ---------------------------------------------------------------------------
export function warmHtmlPage(title: string, subtitle: string | undefined, body: string): string {
  const header = subtitle
    ? `<h1>${escHtml(title)}</h1><p class="page-subtitle">${escHtml(subtitle)}</p>`
    : `<h1>${escHtml(title)}</h1>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${escHtml(title)}</title>
  ${WARM_FONTS_HTML}
  <style>${WARM_CSS}</style>
</head>
<body>
  ${header}
  ${body}
  ${WARM_COPY_SCRIPT}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Warm UI component helpers
// ---------------------------------------------------------------------------
export function warmIconBox(svg: string, size = 36): string {
  const r = Math.round(size * 0.28);
  return `<div class="icon-box" style="width:${size}px;height:${size}px;border-radius:${r}px">${svg}</div>`;
}

export function warmCopyBtn(value: string): string {
  return `<button class="copy-btn" onclick="__copy('${escAttr(value)}')" title="Copy">${L_COPY_ICON}</button>`;
}

export function warmLinkBtn(href: string, label: string): string {
  return `<a class="link-btn" href="${escAttr(href)}" target="_blank" rel="noopener noreferrer">${escHtml(label)} ${L_EXTERNAL}</a>`;
}

export function warmStatusChip(raw: string | undefined): string {
  const s = (raw ?? "").toLowerCase();
  let bg: string, fg: string;
  if (s.includes("start") || s === "running" || s === "active" || s === "applied" || s === "enabled") {
    bg = "#d6f0e0"; fg = "#1a6b3c";
  } else if (s.includes("stop") || s === "stopped" || s === "inactive" || s === "disabled") {
    bg = "#f4ece4"; fg = "#7a5a3a";
  } else if (s.includes("fail") || s.includes("error")) {
    bg = "#fde8db"; fg = "#c44a1a";
  } else if (s.includes("deploy") || s.includes("applying") || s.includes("provisioning")) {
    bg = "#fef6d6"; fg = "#8a6a00";
  } else {
    bg = "#f4f0eb"; fg = "#8b8b8b";
  }
  return `<span class="chip" style="background:${bg};color:${fg}">${escHtml(raw ?? "unknown")}</span>`;
}

export function warmEnvGroupHeader(name: string, count: number, type?: string): string {
  const typeChip = type
    ? ` <span class="chip" style="background:${type.toLowerCase() === "production" ? "#fef3c7" : "#efe7fb"};color:${type.toLowerCase() === "production" ? "#8a6a00" : "#5b21b6"};font-size:10px">${escHtml(type)}</span>`
    : "";
  return `<div class="env-group-header">${L_GLOBE} ${escHtml(name)}${typeChip}<span class="env-group-count">${count} deployment${count !== 1 ? "s" : ""}</span></div>`;
}
