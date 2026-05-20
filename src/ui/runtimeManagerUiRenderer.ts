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

// ─── Small helpers ────────────────────────────────────────────────────────────

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
  if (!isNaN(n)) return `${n} vCores`;
  return raw;
}

function fmtMem(raw: string): string {
  if (raw.endsWith("Mi")) return `${raw.slice(0, -2)} MB`;
  if (raw.endsWith("Gi")) return `${raw.slice(0, -2)} GB`;
  return raw;
}

function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "running" || s === "started" || s === "active") return "s-running";
  if (s === "stopped" || s === "idle") return "s-stopped";
  if (s.includes("error") || s.includes("fail")) return "s-error";
  if (s.includes("start") || s.includes("deploy") || s.includes("apply") || s.includes("provision")) return "s-starting";
  return "s-stopped";
}

function envChipClass(name: string, type: string): string {
  const t = type.toLowerCase();
  const n = name.toLowerCase();
  if (t === "production" || n.includes("prod")) return "env-production";
  if (t === "sandbox" || n.includes("sandbox") || n.includes("sbx") || n.includes("dev")) return "env-sandbox";
  if (t === "design" || n.includes("design")) return "env-design";
  return "env-other";
}

function canStart(status: string, desired: string): boolean {
  const s = status.toLowerCase();
  return s.includes("stop") || s.includes("error") || s.includes("fail");
}

function canStop(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes("run") || s === "started" || s === "active";
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
      <td style="color:#8b8b8b;font-size:11px">${s.lastRun ? formatDate(s.lastRun as string) : "—"}</td>
    </tr>`;
  }).join("");
  return `<div class="sched-section">
    <div class="sched-title">${L_ACTIVITY} Schedulers (${schedulers.length})</div>
    <table><thead><tr><th>Flow</th><th>Schedule</th><th>State</th><th>Last Run</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </div>`;
}

// ─── Row renderer ─────────────────────────────────────────────────────────────

const L_PLAY      = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`;
const L_STOP_SQ   = `<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`;
const L_CHEVRON   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const L_SERVER_ICO = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>`;

function deploymentRow(d: Deployment, orgId: string, idx: number): string {
  const id       = str(d.id) || `dep-${idx}`;
  const rowId    = `r-${id.replace(/[^a-zA-Z0-9]/g, "-")}`;
  const name     = str(d.name) || str(d.id) || "Untitled";
  const status   = str(d.status) || str(d.application?.status) || "unknown";
  const desired  = str(d.application?.desiredState) || "";
  const envName  = str(d._environmentName) || "—";
  const envType  = str(d._environmentType) || "";
  const envId    = str(d._environmentId) || "";
  const version  = str(d.application?.ref?.version) || "";
  const targetId = str(deepGet(d, "target", "targetId")) || "—";
  const targetType = str(d.target?.type) || str(d.target?.provider) || "CloudHub";

  // Deep deployment settings (CloudHub 2.0 shape)
  const dSettings = deepGet(d, "target", "deploymentSettings") as Record<string, unknown> | undefined;
  const cpuRaw  = str(deepGet(dSettings, "resources", "cpu", "limit") ?? deepGet(dSettings, "resources", "cpu", "reserved"));
  const memRaw  = str(deepGet(dSettings, "resources", "memory", "limit") ?? deepGet(dSettings, "resources", "memory", "reserved"));
  const publicUrl = str(deepGet(dSettings, "http", "inbound", "publicUrl"));
  const replicas  = str(deepGet(d, "target", "replicas") ?? deepGet(d, "workers", "amount"));
  const workerType = str(deepGet(d, "workers", "type", "name"));
  const muleVer = str(deepGet(d, "application", "configuration", "muleVersion", "version") ?? deepGet(dSettings, "runtime", "version"));
  const lastMod = formatDate((d.lastModifiedDate ?? d.lastUpdatedDate) as string | undefined);
  const chUrl   = `https://anypoint.mulesoft.com/runtime-manager/#/applications/${encodeURIComponent(name)}/dashboard`;

  const sCls   = statusClass(status);
  const envCls = envChipClass(envName, envType);
  const startOk = canStart(status, desired);
  const stopOk  = canStop(status);

  // Status display text: capitalise first letter
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

  // Details grid items
  const detailItems = [
    publicUrl
      ? `<div class="di"><div class="dl">Runtime URL</div><div class="dv"><code>${escHtml(publicUrl)}</code>
          <button class="cb-sm" onclick="__copy('${escAttr(publicUrl)}')" title="Copy URL">${L_COPY_ICON}</button></div></div>`
      : "",
    `<div class="di"><div class="dl">Deployment Target</div><div class="dv">${escHtml(targetType)}</div></div>`,
    cpuRaw  ? `<div class="di"><div class="dl">vCores</div><div class="dv">${escHtml(fmtCpu(cpuRaw))}</div></div>` : "",
    memRaw  ? `<div class="di"><div class="dl">Memory</div><div class="dv">${escHtml(fmtMem(memRaw))}</div></div>` : "",
    replicas ? `<div class="di"><div class="dl">Workers</div><div class="dv">${escHtml(replicas)}${workerType ? ` <span style="font-weight:400;color:#8b8b8b">· ${escHtml(workerType)}</span>` : ""}</div></div>` : "",
    muleVer ? `<div class="di"><div class="dl">Mule Version</div><div class="dv">${escHtml(muleVer)}</div></div>` : "",
    `<div class="di"><div class="dl">Last Updated</div><div class="dv">${lastMod}</div></div>`,
    `<div class="di"><div class="dl">Deployment ID</div><div class="dv"><code style="font-size:10px;word-break:break-all">${escHtml(id)}</code></div></div>`,
  ].filter(Boolean).join("\n");

  const schedulers: Scheduler[] = Array.isArray(d.schedulers) ? d.schedulers : [];

  return `<div class="rm-item">
  <div class="rm-row rm-grid" onclick="__tog('${escAttr(rowId)}')">
    <div class="app-col">
      <div class="app-ico">${L_SERVER_ICO}</div>
      <div style="min-width:0">
        <div class="app-name" title="${escAttr(name)}">${escHtml(name)}</div>
        ${version ? `<div class="app-ver">v${escHtml(version)}</div>` : ""}
      </div>
    </div>
    <div><span class="env-chip ${envCls}"><span class="env-dot"></span>${escHtml(envName)}</span></div>
    <div class="ps-col" title="${escAttr(targetId)}">${escHtml(targetId.length > 20 ? targetId.slice(0, 18) + "…" : targetId)}</div>
    <div><span class="status ${sCls}" id="st-${escAttr(rowId)}"><span class="dot"></span>${escHtml(statusLabel)}</span></div>
    <div class="actions" onclick="event.stopPropagation()">
      <button class="btn" id="sb-${escAttr(rowId)}"
        onclick="__act('${escAttr(id)}','${escAttr(envId)}','${escAttr(orgId)}','start')"
        title="Start this application" ${!startOk ? "disabled" : ""}>${L_PLAY} Start</button>
      <button class="btn btn-stop" id="xb-${escAttr(rowId)}"
        onclick="__act('${escAttr(id)}','${escAttr(envId)}','${escAttr(orgId)}','stop')"
        title="Stop this application" ${!stopOk ? "disabled" : ""}>${L_STOP_SQ} Stop</button>
      <a href="${escAttr(chUrl)}" target="_blank" rel="noopener noreferrer"
        class="icon-btn" title="Open in Anypoint Runtime Manager">${L_EXTERNAL}</a>
      <button class="icon-btn" onclick="__copy('${escAttr(chUrl)}')" title="Copy dashboard URL">${L_COPY_ICON}</button>
      <button class="icon-btn chv" id="cv-${escAttr(rowId)}" onclick="__tog('${escAttr(rowId)}')" title="Expand deployment details">${L_CHEVRON}</button>
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
  const subtitle = [
    `${items.length} deployment${items.length === 1 ? "" : "s"}`,
    envLabel ?? (envNames.length === 1 ? `in ${envNames[0]}` : envNames.length > 1 ? `across ${envNames.length} environments` : undefined),
  ].filter(Boolean).join(" · ");

  const FONTS = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&display=swap" rel="stylesheet">`;

  const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, sans-serif; background: #f2efea; padding: 16px; color: #171717; }
  h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .sub { font-family: 'EB Garamond', serif; font-size: 14px; color: #8b8b8b; margin-bottom: 16px; }
  .rm-card { background: #fff; border-radius: 20px; border: 1px solid #e5e2dd; overflow: hidden; }

  /* Grid columns: App | Env | PrivateSpace | Status | Actions */
  .rm-grid { display: grid; grid-template-columns: 1fr 134px 120px 106px 215px; gap: 8px; align-items: center; padding: 10px 16px; }
  .rm-thead { background: #f9f7f5; border-bottom: 1px solid #ebebeb; }
  .rm-thead .rm-grid { padding: 7px 16px; }
  .th { font-family: 'EB Garamond', serif; font-size: 11px; font-weight: 700; color: #8b8b8b; text-transform: uppercase; letter-spacing: 0.5px; }

  .rm-item { border-bottom: 1px solid #f5f2ef; }
  .rm-item:last-child { border-bottom: none; }
  .rm-row { cursor: pointer; transition: background 0.1s; }
  .rm-row:hover { background: #faf9f7; }

  /* App column */
  .app-col { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .app-ico { width: 36px; height: 36px; border-radius: 10px; background: #ede9fe; color: #7c3aed; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .app-name { font-size: 14px; font-weight: 600; color: #171717; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .app-ver { font-size: 11px; color: #8b8b8b; font-family: 'EB Garamond', serif; }
  .ps-col { font-size: 12px; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Environment chips */
  .env-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; }
  .env-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .env-production { background: #fee2e2; color: #dc2626; } .env-production .env-dot { background: #dc2626; }
  .env-sandbox { background: #ede9fe; color: #7c3aed; } .env-sandbox .env-dot { background: #7c3aed; }
  .env-design { background: #dcfce7; color: #16a34a; } .env-design .env-dot { background: #16a34a; }
  .env-other { background: #f4f0eb; color: #6b7280; } .env-other .env-dot { background: #9ca3af; }

  /* Status */
  .status { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .s-running { color: #16a34a; } .s-running .dot { background: #16a34a; }
  .s-stopped { color: #6b7280; } .s-stopped .dot { background: #9ca3af; }
  .s-error { color: #dc2626; } .s-error .dot { background: #dc2626; animation: blink 1.4s ease-in-out infinite; }
  .s-starting { color: #d97706; } .s-starting .dot { background: #f59e0b; animation: blink 1s ease-in-out infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

  /* Action buttons */
  .actions { display: flex; align-items: center; gap: 5px; }
  .btn { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid #d4d4d4; background: #fff; color: #374151; font-family: inherit; transition: background 0.1s; white-space: nowrap; }
  .btn:hover:not(:disabled) { background: #f5f5f5; }
  .btn:disabled { opacity: 0.38; cursor: not-allowed; }
  .btn-stop { border-color: #fca5a5; color: #dc2626; }
  .btn-stop:hover:not(:disabled) { background: #fef2f2; }
  .icon-btn { width: 28px; height: 28px; border: 1px solid #e5e2dd; border-radius: 7px; background: transparent; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: #6b7280; text-decoration: none; flex-shrink: 0; }
  .icon-btn:hover { background: #f5f2ef; color: #374151; }
  .chv { transition: transform 0.2s; }
  .chv.open { transform: rotate(180deg); }

  /* Details panel */
  .rm-det { display: none; padding: 16px 20px; background: #f9f7f5; border-top: 1px solid #ebebeb; }
  .rm-det.open { display: block; }
  .det-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
  .di .dl { font-family: 'EB Garamond', serif; font-size: 11px; color: #8b8b8b; margin-bottom: 3px; display: flex; align-items: center; gap: 4px; }
  .di .dv { font-size: 13px; font-weight: 500; color: #171717; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  code { font-family: 'SF Mono','Fira Code',monospace; font-size: 11px; background: #f4ece4; padding: 2px 6px; border-radius: 6px; color: #5a3e2b; }
  .cb-sm { width: 22px; height: 22px; border: 1px solid #e5e2dd; border-radius: 5px; background: transparent; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: #737373; flex-shrink: 0; }
  .cb-sm:hover { background: #e8e2dc; }

  /* Scheduler table inside details */
  .sched-section { margin-top: 14px; padding-top: 14px; border-top: 1px solid #ebebeb; }
  .sched-title { font-family: 'EB Garamond', serif; font-size: 12px; color: #8b8b8b; margin-bottom: 8px; display: flex; align-items: center; gap: 5px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { font-family: 'EB Garamond', serif; text-align: left; padding: 6px 10px; color: #8b8b8b; font-weight: 600; font-size: 11px; border-bottom: 1px solid #e5e2dd; }
  td { padding: 6px 10px; border-bottom: 1px solid #f5f2ef; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .schip { display: inline-flex; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
  .sc-on { background: #d6f0e0; color: #1a6b3c; }
  .sc-off { background: #f4ece4; color: #7a5a3a; }

  .empty { text-align: center; padding: 48px; font-family: 'EB Garamond', serif; color: #8b8b8b; font-size: 16px; }

  @media (max-width: 640px) {
    .rm-grid { grid-template-columns: 1fr auto; }
    .rm-grid > :nth-child(2), .rm-grid > :nth-child(3), .rm-grid > :nth-child(4) { display: none; }
    body { padding: 8px; }
  }`;

  // Safely embed token for JS — JWT contains only safe chars but use JSON.stringify for safety
  const safeToken   = JSON.stringify(token);
  const safeBaseUrl = JSON.stringify(baseUrl);

  const SCRIPT = `
<script>
var __T=${safeToken};var __B=${safeBaseUrl};
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
  if(isStart)sBtn.textContent='Starting\u2026';else xBtn.textContent='Stopping\u2026';
  var url=__B+'/amc/application-manager/api/v2/organizations/'+orgId+'/environments/'+envId+'/deployments/'+depId;
  try{
    var res=await fetch(url,{method:'PATCH',headers:{'Authorization':'Bearer '+__T,'Content-Type':'application/json'},body:JSON.stringify({application:{desiredState:isStart?'STARTED':'STOPPED'}})});
    sBtn.innerHTML=origS;xBtn.innerHTML=origX;
    if(res.ok){
      if(stEl){stEl.innerHTML='<span class="dot"></span>'+(isStart?'Starting\u2026':'Stopping\u2026');stEl.className='status '+(isStart?'s-starting':'s-stopped');}
      sBtn.disabled=isStart;xBtn.disabled=!isStart;
    }else{
      var t=await res.text();alert('Error '+res.status+': '+t.substring(0,300));
      sBtn.disabled=false;xBtn.disabled=false;
    }
  }catch(e){
    sBtn.innerHTML=origS;xBtn.innerHTML=origX;sBtn.disabled=false;xBtn.disabled=false;
    alert('Network error: '+e.message);
  }
}
</script>`;

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
  <p class="sub">${escHtml(subtitle)}</p>
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
  </div>
  ${SCRIPT}
</body>
</html>`;
}
