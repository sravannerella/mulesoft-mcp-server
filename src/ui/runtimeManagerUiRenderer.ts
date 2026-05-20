import { L_ACTIVITY, L_COPY_ICON, L_EXTERNAL, escAttr, escHtml, formatDate } from "./baseUiRenderer.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RmRenderOptions {
  token?: string;
  baseUrl?: string;
  orgId?: string;
  envLabel?: string;
}

type Scheduler = {
  name?: string;
  flowName?: string;
  enabled?: boolean;
  schedulingStrategy?: { type?: string; expression?: string; timeUnit?: string; frequency?: number | string };
  lastRun?: string | number;
};

type Deployment = {
  id?: string;
  name?: string;
  status?: string;
  lastModifiedDate?: string | number;
  lastUpdatedDate?: string | number;
  target?: { targetId?: string; type?: string; provider?: string };
  application?: {
    status?: string;
    desiredState?: string;
    ref?: { groupId?: string; assetId?: string; version?: string };
    configuration?: Record<string, unknown>;
  };
  schedulers?: Scheduler[];
  _environmentName?: string;
  _environmentId?: string;
  _environmentType?: string;
  [key: string]: unknown;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === "string" && v.length > 0 ? v : "";
}

function deepGet(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj;
  for (const k of keys) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function fmtCpu(raw: string): string {
  if (raw.endsWith("m")) {
    const n = parseInt(raw, 10);
    if (!isNaN(n)) return `${(n / 1000).toFixed(2).replace(/\.?0+$/, "")} vCores`;
  }
  const n = parseFloat(raw);
  return !isNaN(n) ? `${n} vCores` : raw;
}

function fmtMem(raw: string): string {
  if (raw.endsWith("Mi")) return `${raw.slice(0, -2)} MB`;
  if (raw.endsWith("Gi")) return `${raw.slice(0, -2)} GB`;
  return raw;
}

// Resolve the effective status from both deployment.status and application.status
// CloudHub 2.0: deployment.status = APPLIED|APPLYING|FAILED|STOPPED|UPDATING|DELETING
// application.status = RUNNING|STOPPED|STARTING|STOPPING
function resolveStatus(d: Deployment): { cls: string; label: string; filterKey: string } {
  const appSt = str(d.application?.status).toUpperCase();
  const depSt = str(d.status).toUpperCase();

  if (appSt === "RUNNING")   return { cls: "s-running",  label: "Running",   filterKey: "running" };
  if (appSt === "STARTING")  return { cls: "s-starting", label: "Starting",  filterKey: "deploying" };
  if (appSt === "STOPPING")  return { cls: "s-starting", label: "Stopping",  filterKey: "deploying" };
  if (appSt === "STOPPED")   return { cls: "s-stopped",  label: "Stopped",   filterKey: "stopped" };

  if (depSt === "APPLIED")   return { cls: "s-running",  label: "Running",   filterKey: "running" };
  if (depSt === "APPLYING")  return { cls: "s-starting", label: "Deploying", filterKey: "deploying" };
  if (depSt === "UPDATING")  return { cls: "s-starting", label: "Updating",  filterKey: "deploying" };
  if (depSt === "DELETING")  return { cls: "s-starting", label: "Deleting",  filterKey: "deploying" };
  if (depSt === "FAILED")    return { cls: "s-error",    label: "Failed",    filterKey: "failed" };
  if (depSt === "STOPPED")   return { cls: "s-stopped",  label: "Stopped",   filterKey: "stopped" };

  // Generic fallback
  const c = `${appSt} ${depSt}`;
  if (c.includes("RUN") || c.includes("ACTIVE"))                      return { cls: "s-running",  label: depSt || appSt || "Running",   filterKey: "running" };
  if (c.includes("STOP"))                                              return { cls: "s-stopped",  label: "Stopped",   filterKey: "stopped" };
  if (c.includes("ERR") || c.includes("FAIL"))                        return { cls: "s-error",    label: "Failed",    filterKey: "failed" };
  if (c.includes("START") || c.includes("DEPLOY") || c.includes("PROV")) return { cls: "s-starting", label: "Deploying", filterKey: "deploying" };

  const raw = (depSt || appSt || "Unknown");
  return { cls: "s-stopped", label: raw.charAt(0) + raw.slice(1).toLowerCase(), filterKey: "stopped" };
}

// Use desiredState as the primary authority for enabling Start/Stop
function canStart(desired: string, depSt: string, appSt: string): boolean {
  if (desired === "STOPPED") return true;
  if (desired === "STARTED") return false;
  // No desiredState — infer
  const c = `${depSt} ${appSt}`;
  return c.includes("STOP") || c.includes("FAIL");
}

function canStop(desired: string, depSt: string, appSt: string): boolean {
  if (desired === "STARTED") return true;
  if (desired === "STOPPED") return false;
  // No desiredState — infer
  const c = `${depSt} ${appSt}`;
  return c.includes("APPLIED") || c.includes("RUN") || c.includes("ACTIVE");
}

function envChipClass(name: string, type: string): string {
  const t = type.toLowerCase();
  const n = name.toLowerCase();
  if (t === "production" || n.includes("prod"))                           return "env-production";
  if (t === "sandbox" || n.includes("sandbox") || n.includes("sbx") || n.includes("dev")) return "env-sandbox";
  if (t === "design" || n.includes("design"))                             return "env-design";
  return "env-other";
}

function schedulersSection(schedulers: Scheduler[]): string {
  const rows = schedulers.map((s, i) => {
    const on = s.enabled !== false;
    const expr = (() => {
      const st = s.schedulingStrategy;
      if (!st) return "—";
      if (st.expression) return st.expression;
      if (st.frequency) return `every ${st.frequency} ${st.timeUnit ?? ""}`.trim();
      return st.type ?? "—";
    })();
    return `<tr>
      <td style="font-weight:500">${escHtml(s.flowName ?? s.name ?? `Scheduler ${i + 1}`)}</td>
      <td><code>${escHtml(String(expr))}</code></td>
      <td><span class="schip ${on ? "sc-on" : "sc-off"}">${on ? "On" : "Off"}</span></td>
      <td style="color:#999;font-size:11px">${s.lastRun ? formatDate(s.lastRun as string) : "—"}</td>
    </tr>`;
  }).join("");
  return `<div class="sched-section">
    <div class="sched-title">${L_ACTIVITY} Schedulers (${schedulers.length})</div>
    <table><thead><tr><th>Flow</th><th>Schedule</th><th>State</th><th>Last Run</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </div>`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const L_PLAY     = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`;
const L_STOP_SQ  = `<svg width="9"  height="9"  viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`;
const L_CHEVRON  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const L_APP_ICO  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>`;
const L_SEARCH   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

// ─── Row ──────────────────────────────────────────────────────────────────────

function deploymentRow(d: Deployment, orgId: string, idx: number): string {
  const id        = str(d.id) || `dep-${idx}`;
  const rowId     = `r-${id.replace(/[^a-zA-Z0-9]/g, "-")}`;
  const name      = str(d.name) || str(d.id) || "Untitled";
  const desired   = str(d.application?.desiredState).toUpperCase();
  const depSt     = str(d.status).toUpperCase();
  const appSt     = str(d.application?.status).toUpperCase();
  const envName   = str(d._environmentName) || "—";
  const envType   = str(d._environmentType) || "";
  const envId     = str(d._environmentId) || "";
  const version   = str(d.application?.ref?.version) || "";
  const targetId  = str(deepGet(d, "target", "targetId")) || "—";
  const targetType = str(d.target?.type) || str(d.target?.provider) || "CloudHub";

  const dSettings  = deepGet(d, "target", "deploymentSettings") as Record<string, unknown> | undefined;
  const cpuRaw     = str(deepGet(dSettings, "resources", "cpu", "limit") ?? deepGet(dSettings, "resources", "cpu", "reserved"));
  const memRaw     = str(deepGet(dSettings, "resources", "memory", "limit") ?? deepGet(dSettings, "resources", "memory", "reserved"));
  const publicUrl  = str(deepGet(dSettings, "http", "inbound", "publicUrl"));
  const replicas   = str(deepGet(d, "target", "replicas") ?? deepGet(d, "workers", "amount"));
  const workerType = str(deepGet(d, "workers", "type", "name"));
  const muleVer    = str(deepGet(d, "application", "configuration", "muleVersion", "version") ?? deepGet(dSettings, "runtime", "version"));
  const lastMod    = formatDate((d.lastModifiedDate ?? d.lastUpdatedDate) as string | undefined);

  // Runtime Manager deep link — use window.open() since target="_blank" is often blocked in iframes
  const chUrl = orgId && envId && id
    ? `${escAttr(`https://anypoint.mulesoft.com/runtime-manager/v2/cloudhub2/deployments/${orgId}/${envId}/${id}`)}`
    : `https://anypoint.mulesoft.com/runtime-manager/#/applications/${encodeURIComponent(name)}/dashboard`;

  const { cls: sCls, label: statusLabel, filterKey } = resolveStatus(d);
  const envCls   = envChipClass(envName, envType);
  const startOk  = canStart(desired, depSt, appSt);
  const stopOk   = canStop(desired, depSt, appSt);

  const detailItems = [
    publicUrl
      ? `<div class="di"><div class="dl">Runtime URL</div><div class="dv"><code>${escHtml(publicUrl)}</code>
          <button class="cb-sm" onclick="__copy('${escAttr(publicUrl)}')" title="Copy URL">${L_COPY_ICON}</button></div></div>`
      : "",
    `<div class="di"><div class="dl">Deployment Target</div><div class="dv">${escHtml(targetType)}</div></div>`,
    cpuRaw  ? `<div class="di"><div class="dl">vCores</div><div class="dv">${escHtml(fmtCpu(cpuRaw))}</div></div>` : "",
    memRaw  ? `<div class="di"><div class="dl">Memory</div><div class="dv">${escHtml(fmtMem(memRaw))}</div></div>` : "",
    replicas ? `<div class="di"><div class="dl">Workers</div><div class="dv">${escHtml(replicas)}${workerType ? ` <span style="font-weight:400;color:#999">· ${escHtml(workerType)}</span>` : ""}</div></div>` : "",
    muleVer  ? `<div class="di"><div class="dl">Mule Version</div><div class="dv">${escHtml(muleVer)}</div></div>` : "",
    `<div class="di"><div class="dl">Last Updated</div><div class="dv">${lastMod}</div></div>`,
    `<div class="di"><div class="dl">Deployment ID</div><div class="dv"><code style="font-size:10px;word-break:break-all">${escHtml(id)}</code></div></div>`,
  ].filter(Boolean).join("\n");

  const schedulers: Scheduler[] = Array.isArray(d.schedulers) ? d.schedulers : [];

  return `<div class="rm-item" data-name="${escAttr(name.toLowerCase())}" data-env="${escAttr(envName.toLowerCase())}" data-stat="${escAttr(filterKey)}">
  <div class="rm-row rm-grid" onclick="__tog('${escAttr(rowId)}')">
    <div class="app-col">
      <div class="app-ico">${L_APP_ICO}</div>
      <div style="min-width:0">
        <div class="app-name" title="${escAttr(name)}">${escHtml(name)}</div>
        ${version ? `<div class="app-ver">v${escHtml(version)}</div>` : ""}
      </div>
    </div>
    <div><span class="env-chip ${envCls}"><span class="env-dot"></span>${escHtml(envName)}</span></div>
    <div class="ps-col" title="${escAttr(targetId)}">${escHtml(targetId.length > 20 ? targetId.slice(0, 18) + "…" : targetId)}</div>
    <div><span class="status ${sCls}" id="st-${escAttr(rowId)}"><span class="dot"></span>${escHtml(statusLabel)}</span></div>
    <div class="actions" onclick="event.stopPropagation()">
      <button class="btn btn-start" id="sb-${escAttr(rowId)}"
        onclick="__act('${escAttr(id)}','${escAttr(envId)}','${escAttr(orgId)}','start')"
        title="Start this application" ${!startOk ? "disabled" : ""}>${L_PLAY} Start</button>
      <button class="btn btn-stop" id="xb-${escAttr(rowId)}"
        onclick="__act('${escAttr(id)}','${escAttr(envId)}','${escAttr(orgId)}','stop')"
        title="Stop this application" ${!stopOk ? "disabled" : ""}>${L_STOP_SQ} Stop</button>
      <button class="icon-btn" onclick="window.open('${chUrl}','_blank','noopener,noreferrer')" title="Open in Anypoint Runtime Manager">${L_EXTERNAL}</button>
      <button class="icon-btn" onclick="__copy('${chUrl}')" title="Copy link">${L_COPY_ICON}</button>
      <button class="icon-btn chv" id="cv-${escAttr(rowId)}" onclick="__tog('${escAttr(rowId)}')" title="Expand details">${L_CHEVRON}</button>
    </div>
  </div>
  <div class="rm-det" id="d-${escAttr(rowId)}">
    <div class="det-grid">${detailItems}</div>
    ${schedulers.length > 0 ? schedulersSection(schedulers) : ""}
  </div>
</div>`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function renderRuntimeManagerDeploymentsHtml(data: unknown, options: RmRenderOptions = {}): string {
  const { token = "", baseUrl = "https://anypoint.mulesoft.com", orgId = "", envLabel } = options;

  const items: Deployment[] = Array.isArray(data)
    ? (data as Deployment[])
    : Array.isArray((data as Record<string, unknown>)?.items)
      ? ((data as Record<string, unknown>).items as Deployment[])
      : [];

  const rows = items.length > 0
    ? items.map((d, i) => deploymentRow(d, orgId, i)).join("\n")
    : `<div class="empty">No deployments found.</div>`;

  const envNames = [...new Set(items.map((d) => d._environmentName ?? "").filter(Boolean))];
  const countLabel = envNames.length === 1
    ? `in ${envNames[0]}`
    : envNames.length > 1
      ? `across ${envNames.length} environments`
      : undefined;
  const subtitle = [
    `<span id="dep-count">${items.length} deployment${items.length === 1 ? "" : "s"}</span>`,
    envLabel ?? countLabel,
  ].filter(Boolean).join(" · ");

  const safeToken   = JSON.stringify(token);
  const safeBaseUrl = JSON.stringify(baseUrl);

  const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #faf8f6;
    padding: 16px;
    color: #1a1a1a;
  }
  h1 { font-size: 20px; font-weight: 700; color: #D97757; margin-bottom: 2px; }
  .sub { font-size: 13px; color: #888; margin-bottom: 14px; }

  /* Toolbar */
  .toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
  .search-wrap { position: relative; flex: 1; min-width: 180px; max-width: 320px; }
  .search-wrap svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #aaa; pointer-events: none; }
  .search-box { width: 100%; padding: 7px 12px 7px 32px; border: 1px solid #e0dcd8; border-radius: 10px; font-size: 13px; font-family: inherit; background: #fff; color: #1a1a1a; outline: none; }
  .search-box:focus { border-color: #D97757; box-shadow: 0 0 0 2px rgba(217,119,87,0.15); }
  .filter-btns { display: flex; gap: 5px; flex-wrap: wrap; }
  .fbtn { padding: 6px 12px; border-radius: 20px; border: 1px solid #e0dcd8; background: #fff; font-size: 12px; font-weight: 500; font-family: inherit; cursor: pointer; color: #555; transition: all 0.12s; }
  .fbtn:hover { border-color: #D97757; color: #D97757; }
  .fbtn.active { background: #D97757; border-color: #D97757; color: #fff; }

  /* Table card */
  .rm-card { background: #fff; border-radius: 16px; border: 1px solid #e0dcd8; overflow: hidden; }
  .rm-grid { display: grid; grid-template-columns: 1fr 130px 120px 110px 220px; gap: 8px; align-items: center; padding: 10px 16px; }
  .rm-thead { background: #fdf9f7; border-bottom: 1px solid #ede9e6; }
  .rm-thead .rm-grid { padding: 8px 16px; }
  .th { font-size: 11px; font-weight: 600; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; }

  .rm-item { border-bottom: 1px solid #f5f2ef; }
  .rm-item:last-child { border-bottom: none; }
  .rm-item[style*="none"] { display: none; }
  .rm-row { cursor: pointer; transition: background 0.1s; }
  .rm-row:hover { background: #fdf9f7; }

  /* App column */
  .app-col { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .app-ico { width: 34px; height: 34px; border-radius: 10px; background: #FDEEE8; color: #D97757; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .app-name { font-size: 14px; font-weight: 600; color: #1a1a1a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .app-ver { font-size: 11px; color: #aaa; }
  .ps-col { font-size: 12px; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Env chips */
  .env-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; }
  .env-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .env-production { background: #fee2e2; color: #dc2626; } .env-production .env-dot { background: #dc2626; }
  .env-sandbox { background: #FDEEE8; color: #D97757; } .env-sandbox .env-dot { background: #D97757; }
  .env-design { background: #dcfce7; color: #16a34a; } .env-design .env-dot { background: #16a34a; }
  .env-other { background: #f5f2ef; color: #888; } .env-other .env-dot { background: #bbb; }

  /* Status */
  .status { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .s-running  { color: #16a34a; } .s-running  .dot { background: #16a34a; }
  .s-stopped  { color: #888; }   .s-stopped  .dot { background: #bbb; }
  .s-error    { color: #dc2626; } .s-error    .dot { background: #dc2626; animation: blink 1.4s ease-in-out infinite; }
  .s-starting { color: #D97757; } .s-starting .dot { background: #D97757; animation: blink 1s ease-in-out infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.25} }

  /* Buttons */
  .actions { display: flex; align-items: center; gap: 5px; }
  .btn { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid; font-family: inherit; transition: all 0.12s; white-space: nowrap; }
  .btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .btn-start { border-color: #D97757; color: #D97757; background: #fff; }
  .btn-start:hover:not(:disabled) { background: #FDEEE8; }
  .btn-stop  { border-color: #e0dcd8; color: #555; background: #fff; }
  .btn-stop:hover:not(:disabled) { background: #f5f2ef; }
  .icon-btn { width: 28px; height: 28px; border: 1px solid #e0dcd8; border-radius: 7px; background: transparent; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: #888; flex-shrink: 0; }
  .icon-btn:hover { background: #FDEEE8; color: #D97757; border-color: #D97757; }
  .chv { transition: transform 0.2s; }
  .chv.open { transform: rotate(180deg); }

  /* Details panel */
  .rm-det { display: none; padding: 16px 20px; background: #fdf9f7; border-top: 1px solid #ede9e6; }
  .rm-det.open { display: block; }
  .det-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
  .di .dl { font-size: 11px; color: #aaa; margin-bottom: 3px; }
  .di .dv { font-size: 13px; font-weight: 500; color: #1a1a1a; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  code { font-family: 'SF Mono','Fira Code',monospace; font-size: 11px; background: #f5f2ef; padding: 2px 6px; border-radius: 5px; color: #D97757; }
  .cb-sm { width: 22px; height: 22px; border: 1px solid #e0dcd8; border-radius: 5px; background: transparent; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: #888; flex-shrink: 0; }
  .cb-sm:hover { background: #FDEEE8; color: #D97757; }

  /* Schedulers */
  .sched-section { margin-top: 14px; padding-top: 14px; border-top: 1px solid #ede9e6; }
  .sched-title { font-size: 12px; color: #aaa; margin-bottom: 8px; display: flex; align-items: center; gap: 5px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 6px 10px; color: #aaa; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1px solid #e0dcd8; }
  td { padding: 6px 10px; border-bottom: 1px solid #f5f2ef; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .schip { display: inline-flex; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
  .sc-on  { background: #d6f0e0; color: #1a6b3c; }
  .sc-off { background: #f5f2ef; color: #888; }

  .no-results { text-align: center; padding: 32px; color: #aaa; font-size: 14px; }
  .empty { text-align: center; padding: 48px; color: #aaa; font-size: 14px; }

  @media (max-width: 700px) {
    .rm-grid { grid-template-columns: 1fr auto; }
    .rm-grid > :nth-child(2), .rm-grid > :nth-child(3), .rm-grid > :nth-child(4) { display: none; }
    body { padding: 10px; }
  }`;

  const SCRIPT = `
<script>
var __T=${safeToken};var __B=${safeBaseUrl};var __F='all';
function __copy(t){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).catch(function(){__fb(t)})}else{__fb(t)}}
function __fb(t){var el=document.createElement('textarea');el.value=t;el.style.cssText='position:fixed;top:-9999px;left:-9999px;opacity:0';document.body.appendChild(el);el.focus();el.select();try{document.execCommand('copy')}catch(e){}document.body.removeChild(el)}
function __tog(rowId){
  var p=document.getElementById('d-'+rowId);
  var c=document.getElementById('cv-'+rowId);
  if(!p)return;
  var open=p.classList.contains('open');
  p.classList.toggle('open',!open);
  if(c)c.classList.toggle('open',!open);
}
function __setf(f){
  __F=f;
  document.querySelectorAll('.fbtn').forEach(function(b){b.classList.toggle('active',b.dataset.f===f)});
  __filter();
}
function __filter(){
  var q=(document.getElementById('srch')||{}).value||'';
  q=q.toLowerCase().trim();
  var visible=0;
  document.querySelectorAll('.rm-item').forEach(function(item){
    var nm=(item.dataset.name||'').toLowerCase();
    var ev=(item.dataset.env||'').toLowerCase();
    var st=(item.dataset.stat||'').toLowerCase();
    var ms=!q||nm.includes(q)||ev.includes(q);
    var mf=__F==='all'||st===__F;
    var show=ms&&mf;
    item.style.display=show?'':'none';
    if(show)visible++;
  });
  var total=document.querySelectorAll('.rm-item').length;
  var cnt=document.getElementById('dep-count');
  if(cnt)cnt.textContent=(visible===total?total:visible+' of '+total)+' deployment'+(total===1?'':'s');
  var nr=document.getElementById('no-results');
  if(nr)nr.style.display=visible===0?'':'none';
}
async function __act(depId,envId,orgId,action){
  var rId='r-'+depId.replace(/[^a-zA-Z0-9]/g,'-');
  var sBtn=document.getElementById('sb-'+rId);
  var xBtn=document.getElementById('xb-'+rId);
  var stEl=document.getElementById('st-'+rId);
  if(!sBtn||!xBtn)return;
  var isStart=action==='start';
  if(isStart&&sBtn.disabled)return;
  if(!isStart&&xBtn.disabled)return;
  sBtn.disabled=true;xBtn.disabled=true;
  var origS=sBtn.innerHTML;var origX=xBtn.innerHTML;
  if(isStart)sBtn.innerHTML='<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Starting\u2026';
  else xBtn.innerHTML='<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Stopping\u2026';
  var url=__B+'/amc/application-manager/api/v2/organizations/'+orgId+'/environments/'+envId+'/deployments/'+depId;
  try{
    var res=await fetch(url,{method:'PATCH',headers:{'Authorization':'Bearer '+__T,'Content-Type':'application/json'},body:JSON.stringify({application:{desiredState:isStart?'STARTED':'STOPPED'}})});
    sBtn.innerHTML=origS;xBtn.innerHTML=origX;
    if(res.ok){
      if(stEl){
        var dot='<span class="dot"></span>';
        stEl.innerHTML=dot+(isStart?'Starting\u2026':'Stopping\u2026');
        stEl.className='status s-starting';
      }
      sBtn.disabled=isStart;xBtn.disabled=!isStart;
    }else{
      var txt=await res.text();alert('Error '+res.status+': '+txt.substring(0,300));
      sBtn.disabled=false;xBtn.disabled=false;
    }
  }catch(e){
    sBtn.innerHTML=origS;xBtn.innerHTML=origX;sBtn.disabled=false;xBtn.disabled=false;
    alert('Network error: '+e.message);
  }
}
</script>`;

  const FONTS = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&display=swap" rel="stylesheet">`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Runtime Manager</title>
  ${FONTS}
  <style>${CSS}</style>
</head>
<body>
  <h1>Runtime Manager</h1>
  <p class="sub">${subtitle}</p>
  <div class="toolbar">
    <div class="search-wrap">
      ${L_SEARCH}
      <input type="search" class="search-box" id="srch" placeholder="Search applications or environments…" oninput="__filter()">
    </div>
    <div class="filter-btns">
      <button class="fbtn active" data-f="all"      onclick="__setf('all')">All</button>
      <button class="fbtn"        data-f="running"   onclick="__setf('running')">Running</button>
      <button class="fbtn"        data-f="stopped"   onclick="__setf('stopped')">Stopped</button>
      <button class="fbtn"        data-f="deploying" onclick="__setf('deploying')">Deploying</button>
      <button class="fbtn"        data-f="failed"    onclick="__setf('failed')">Failed</button>
    </div>
  </div>
  <div class="rm-card">
    <div class="rm-thead">
      <div class="rm-grid">
        <div class="th">Runtime &amp; App</div>
        <div class="th">Environment</div>
        <div class="th">Private Space</div>
        <div class="th">Status</div>
        <div class="th">Actions</div>
      </div>
    </div>
    ${rows}
    <div id="no-results" class="no-results" style="display:none">No deployments match your search.</div>
  </div>
  ${SCRIPT}
</body>
</html>`;
}
