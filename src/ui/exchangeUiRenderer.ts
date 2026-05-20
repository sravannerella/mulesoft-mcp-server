import { anypointBaseUrl } from "../shared/anypointClient.js";
import {
  L_COPY_ICON, L_EXTERNAL, L_PACKAGE, L_TAG,
  escAttr, escHtml, formatDate,
  warmCopyBtn, warmHtmlPage, warmIconBox, warmLinkBtn, warmStatusChip,
} from "./baseUiRenderer.js";

type ExchangeAsset = {
  groupId?: string;
  assetId?: string;
  version?: string;
  name?: string;
  type?: string;
  status?: string;
  description?: string;
  tags?: Array<{ value?: string } | string>;
  labels?: string[];
  files?: Array<{ classifier?: string; packaging?: string; externalLink?: string }>;
  icon?: string;
  [key: string]: unknown;
};

type ExchangePage = { name?: string; content?: string };

type ExchangeResource = { name?: string; url?: string; type?: string };

function str(v: unknown): string {
  return typeof v === "string" && v.length > 0 ? v : "";
}

type AssetMeta = { icon: string; bg: string; fg: string; label: string };
function typeMeta(type: string | undefined): AssetMeta {
  const t = (type ?? "").toLowerCase();
  if (t.includes("rest") || t === "http" || t === "oas")
    return { icon: "REST", bg: "#e8f3ff", fg: "#1a4db7", label: type ?? "REST API" };
  if (t.includes("soap") || t === "wsdl")
    return { icon: "SOAP", bg: "#f4ece4", fg: "#5a3e2b", label: type ?? "SOAP API" };
  if (t === "raml")
    return { icon: "RAML", bg: "#eef5eb", fg: "#1a6b3c", label: "RAML API" };
  if (t.includes("connector"))
    return { icon: "CXR", bg: "#fef6d6", fg: "#8a6a00", label: type ?? "Connector" };
  if (t === "template")
    return { icon: "TPL", bg: "#f0ece4", fg: "#5a3e2b", label: "Template" };
  if (t === "example")
    return { icon: "EX", bg: "#e8f3ff", fg: "#1a4db7", label: "Example" };
  return { icon: "PKG", bg: "#f4f0eb", fg: "#8b8b8b", label: type ?? "Asset" };
}

function typeIconBox(type: string | undefined): string {
  const m = typeMeta(type);
  return `<div style="width:40px;height:40px;border-radius:12px;background:${m.bg};color:${m.fg};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:9px;font-weight:700;letter-spacing:-0.3px">${m.icon}</div>`;
}

function tagChips(asset: ExchangeAsset): string {
  const tags: string[] = [];
  if (Array.isArray(asset.tags)) {
    for (const t of asset.tags) {
      if (typeof t === "string") tags.push(t);
      else if (t && typeof t.value === "string") tags.push(t.value);
    }
  }
  if (Array.isArray(asset.labels)) {
    for (const l of asset.labels) {
      if (typeof l === "string" && !tags.includes(l)) tags.push(l);
    }
  }
  if (tags.length === 0) return "";
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${tags.map((t) => `<span class="chip" style="background:#f4f0eb;color:#5a3e2b">${L_TAG} ${escHtml(t)}</span>`).join("")}</div>`;
}

function assetCard(asset: ExchangeAsset): string {
  const name     = str(asset.name) || str(asset.assetId) || "Unnamed";
  const type     = str(asset.type);
  const status   = str(asset.status);
  const desc     = str(asset.description);
  const groupId  = str(asset.groupId);
  const assetId  = str(asset.assetId);
  const version  = str(asset.version);
  const m        = typeMeta(type);
  const gav      = [groupId, assetId, version].filter(Boolean).join(":");
  const exchUrl  = groupId && assetId && version
    ? `${anypointBaseUrl()}/exchange/${encodeURIComponent(groupId)}/${encodeURIComponent(assetId)}/${encodeURIComponent(version)}/`
    : undefined;

  return `
<div class="card">
  <div class="card-section" style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
    ${typeIconBox(type)}
    <div style="flex:1;min-width:0">
      <div style="font-size:16px;font-weight:700;color:#171717">${escHtml(name)}</div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px">
        <span class="chip" style="background:${m.bg};color:${m.fg}">${escHtml(m.label)}</span>
        ${status ? warmStatusChip(status) : ""}
        ${version ? `<span class="label">v${escHtml(version)}</span>` : ""}
      </div>
    </div>
  </div>
  ${desc ? `
  <div class="divider"></div>
  <div class="card-section" style="font-size:13px;line-height:1.6;color:#444">${escHtml(desc.slice(0, 300))}${desc.length > 300 ? "…" : ""}</div>
  ` : ""}
  ${gav || tagChips(asset) ? `
  <div class="divider"></div>
  <div class="card-section">
    ${gav ? `<div style="margin-bottom:6px"><code style="word-break:break-all">${escHtml(gav)}</code></div>` : ""}
    ${tagChips(asset)}
  </div>` : ""}
  <div class="divider"></div>
  <div class="card-section" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    ${exchUrl ? warmLinkBtn(exchUrl, "View in Exchange") : ""}
    ${exchUrl ? warmCopyBtn(exchUrl) : ""}
  </div>
</div>`;
}

// ─── Table layout for asset list ──────────────────────────────────────────────

const L_CHEVRON_EX = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const L_SEARCH_EX  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

function assetRow(asset: ExchangeAsset, idx: number): string {
  const name     = str(asset.name) || str(asset.assetId) || "Unnamed";
  const type     = str(asset.type);
  const status   = str(asset.status);
  const desc     = str(asset.description);
  const groupId  = str(asset.groupId);
  const assetId  = str(asset.assetId);
  const version  = str(asset.version);
  const m        = typeMeta(type);
  const gav      = [groupId, assetId, version].filter(Boolean).join(":");
  const exchUrl  = groupId && assetId && version
    ? `${anypointBaseUrl()}/exchange/${encodeURIComponent(groupId)}/${encodeURIComponent(assetId)}/${encodeURIComponent(version)}/`
    : undefined;

  // Tags
  const tagList: string[] = [];
  if (Array.isArray(asset.tags)) {
    for (const t of asset.tags) {
      if (typeof t === "string") tagList.push(t);
      else if (t && typeof t.value === "string") tagList.push(t.value);
    }
  }
  if (Array.isArray(asset.labels)) {
    for (const l of asset.labels) {
      if (typeof l === "string" && !tagList.includes(l)) tagList.push(l);
    }
  }

  const rowId = `ex-${idx}`;
  const typeKey = type.toLowerCase().replace(/[^a-z0-9]/g, "-") || "pkg";

  const detailItems = [
    gav ? `<div class="ex-di"><div class="ex-dl">GAV</div><div class="ex-dv"><code>${escHtml(gav)}</code></div></div>` : "",
    desc ? `<div class="ex-di" style="grid-column:1/-1"><div class="ex-dl">Description</div><div class="ex-dv" style="font-weight:400;color:#555;line-height:1.5">${escHtml(desc.slice(0, 400))}${desc.length > 400 ? "…" : ""}</div></div>` : "",
    tagList.length > 0 ? `<div class="ex-di" style="grid-column:1/-1"><div class="ex-dl">Tags</div><div class="ex-dv" style="flex-wrap:wrap;gap:5px">${tagList.map((t) => `<span class="ex-tag">${escHtml(t)}</span>`).join("")}</div></div>` : "",
    groupId ? `<div class="ex-di"><div class="ex-dl">Group ID</div><div class="ex-dv"><code style="font-size:10px;word-break:break-all">${escHtml(groupId)}</code></div></div>` : "",
    assetId ? `<div class="ex-di"><div class="ex-dl">Asset ID</div><div class="ex-dv"><code style="font-size:10px;word-break:break-all">${escHtml(assetId)}</code></div></div>` : "",
  ].filter(Boolean).join("\n");

  return `<div class="ex-item" data-name="${escAttr(name.toLowerCase())}" data-type="${escAttr(typeKey)}">
  <div class="ex-row ex-grid" onclick="__exTog('${rowId}')">
    <div class="ex-app-col">
      <div class="ex-type-badge" style="background:${escAttr(m.bg)};color:${escAttr(m.fg)}">${escHtml(m.icon)}</div>
      <div style="min-width:0">
        <div class="ex-name" title="${escAttr(name)}">${escHtml(name)}</div>
        ${assetId && assetId !== name ? `<div class="ex-sub">${escHtml(assetId)}</div>` : ""}
      </div>
    </div>
    <div><span class="ex-chip" style="background:${escAttr(m.bg)};color:${escAttr(m.fg)}">${escHtml(m.label)}</span></div>
    <div class="ex-ver">${version ? `v${escHtml(version)}` : "—"}</div>
    <div>${status ? `<span class="ex-status ex-st-${escAttr(status.toLowerCase())}">${escHtml(status)}</span>` : `<span style="color:#bbb">—</span>`}</div>
    <div class="ex-actions" onclick="event.stopPropagation()">
      ${exchUrl ? `<button class="ex-icon-btn" onclick="window.open('${escAttr(exchUrl)}','_blank','noopener,noreferrer')" title="View in Exchange">${L_EXTERNAL}</button>` : ""}
      ${exchUrl ? `<button class="ex-icon-btn" onclick="__exCopy('${escAttr(exchUrl)}')" title="Copy Exchange URL">${L_COPY_ICON}</button>` : ""}
      <button class="ex-icon-btn ex-chv" id="cv-${rowId}" onclick="__exTog('${rowId}')" title="Expand details">${L_CHEVRON_EX}</button>
    </div>
  </div>
  <div class="ex-det" id="d-${rowId}">
    <div class="ex-det-grid">${detailItems}</div>
  </div>
</div>`;
}

export function renderExchangeAssetsHtml(data: unknown, subtitle?: string): string {
  const items: ExchangeAsset[] = Array.isArray(data)
    ? (data as ExchangeAsset[])
    : Array.isArray((data as Record<string, unknown>)?.assets)
      ? ((data as Record<string, unknown>).assets as ExchangeAsset[])
      : Array.isArray((data as Record<string, unknown>)?.items)
        ? ((data as Record<string, unknown>).items as ExchangeAsset[])
        : [];

  if (items.length === 0) {
    return warmHtmlPage("Exchange — Assets", subtitle ?? "0 assets", `<p class="empty">No Exchange assets found.</p>`);
  }

  // Collect distinct types for filter buttons
  const typeSet = new Set<string>();
  items.forEach((a) => { if (a.type) typeSet.add(a.type); });
  const types = [...typeSet].sort();

  const filterBtns = [
    `<button class="ex-fbtn active" data-t="all" onclick="__exSetType('all')">All</button>`,
    ...types.map((t) => {
      const key = t.toLowerCase().replace(/[^a-z0-9]/g, "-");
      const m = typeMeta(t);
      return `<button class="ex-fbtn" data-t="${escAttr(key)}" onclick="__exSetType('${escAttr(key)}')">${escHtml(m.label)}</button>`;
    }),
  ].join("");

  const rows = items.map((a, i) => assetRow(a, i)).join("\n");

  const sub = subtitle ?? `<span id="ex-count">${items.length} asset${items.length === 1 ? "" : "s"}</span>`;

  const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, sans-serif; background: #faf8f6; padding: 16px; color: #1a1a1a; }
  h1 { font-size: 20px; font-weight: 700; color: #D97757; margin-bottom: 2px; }
  .sub { font-size: 13px; color: #888; margin-bottom: 14px; }
  .ex-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
  .ex-search-wrap { position: relative; flex: 1; min-width: 180px; max-width: 300px; }
  .ex-search-wrap svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #aaa; pointer-events: none; }
  .ex-search { width: 100%; padding: 7px 12px 7px 32px; border: 1px solid #e0dcd8; border-radius: 10px; font-size: 13px; font-family: inherit; background: #fff; color: #1a1a1a; outline: none; }
  .ex-search:focus { border-color: #D97757; box-shadow: 0 0 0 2px rgba(217,119,87,0.15); }
  .ex-filter-btns { display: flex; gap: 5px; flex-wrap: wrap; }
  .ex-fbtn { padding: 5px 11px; border-radius: 20px; border: 1px solid #e0dcd8; background: #fff; font-size: 12px; font-weight: 500; font-family: inherit; cursor: pointer; color: #555; transition: all 0.12s; }
  .ex-fbtn:hover { border-color: #D97757; color: #D97757; }
  .ex-fbtn.active { background: #D97757; border-color: #D97757; color: #fff; }
  .ex-card { background: #fff; border-radius: 16px; border: 1px solid #e0dcd8; overflow: hidden; }
  .ex-grid { display: grid; grid-template-columns: 1fr 130px 80px 100px 110px; gap: 8px; align-items: center; padding: 10px 16px; }
  .ex-thead { background: #fdf9f7; border-bottom: 1px solid #ede9e6; }
  .ex-thead .ex-grid { padding: 8px 16px; }
  .ex-th { font-size: 11px; font-weight: 600; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; }
  .ex-item { border-bottom: 1px solid #f5f2ef; }
  .ex-item:last-child { border-bottom: none; }
  .ex-row { cursor: pointer; transition: background 0.1s; }
  .ex-row:hover { background: #fdf9f7; }
  .ex-app-col { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .ex-type-badge { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 8px; font-weight: 800; letter-spacing: -0.3px; }
  .ex-name { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ex-sub { font-size: 11px; color: #aaa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ex-chip { display: inline-flex; padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .ex-ver { font-size: 12px; color: #555; }
  .ex-status { display: inline-flex; padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; background: #f5f2ef; color: #555; }
  .ex-st-published { background: #dcfce7; color: #16a34a; }
  .ex-st-deprecated { background: #fee2e2; color: #dc2626; }
  .ex-actions { display: flex; align-items: center; gap: 5px; }
  .ex-icon-btn { width: 28px; height: 28px; border: 1px solid #e0dcd8; border-radius: 7px; background: transparent; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: #888; flex-shrink: 0; }
  .ex-icon-btn:hover { background: #FDEEE8; color: #D97757; border-color: #D97757; }
  .ex-chv { transition: transform 0.2s; }
  .ex-chv.open { transform: rotate(180deg); }
  .ex-det { display: none; padding: 14px 20px; background: #fdf9f7; border-top: 1px solid #ede9e6; }
  .ex-det.open { display: block; }
  .ex-det-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  .ex-di .ex-dl { font-size: 11px; color: #aaa; margin-bottom: 3px; }
  .ex-di .ex-dv { font-size: 13px; font-weight: 500; color: #1a1a1a; display: flex; align-items: center; gap: 5px; }
  code { font-family: 'SF Mono','Fira Code',monospace; font-size: 11px; background: #f5f2ef; padding: 2px 6px; border-radius: 5px; color: #D97757; }
  .ex-tag { padding: 2px 8px; border-radius: 10px; font-size: 11px; background: #f5f2ef; color: #555; }
  .no-results { text-align: center; padding: 28px; color: #aaa; font-size: 13px; display: none; }
  @media (max-width: 650px) {
    .ex-grid { grid-template-columns: 1fr auto; }
    .ex-grid > :nth-child(2), .ex-grid > :nth-child(3), .ex-grid > :nth-child(4) { display: none; }
  }`;

  const SCRIPT = `
<script>
var __exT='all';
function __exCopy(u){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u).catch(function(){__exFb(u)})}else{__exFb(u)}}
function __exFb(u){var el=document.createElement('textarea');el.value=u;el.style.cssText='position:fixed;top:-9999px;left:-9999px;opacity:0';document.body.appendChild(el);el.focus();el.select();try{document.execCommand('copy')}catch(e){}document.body.removeChild(el)}
function __exTog(id){
  var p=document.getElementById('d-'+id);
  var c=document.getElementById('cv-'+id);
  if(!p)return;
  var open=p.classList.contains('open');
  p.classList.toggle('open',!open);
  if(c)c.classList.toggle('open',!open);
}
function __exSetType(t){
  __exT=t;
  document.querySelectorAll('.ex-fbtn').forEach(function(b){b.classList.toggle('active',b.dataset.t===t)});
  __exFilter();
}
function __exFilter(){
  var q=(document.getElementById('ex-srch')||{}).value||'';
  q=q.toLowerCase().trim();
  var vis=0;
  document.querySelectorAll('.ex-item').forEach(function(item){
    var nm=(item.dataset.name||'').toLowerCase();
    var tp=(item.dataset.type||'').toLowerCase();
    var ms=!q||nm.includes(q);
    var mt=__exT==='all'||tp===__exT;
    var show=ms&&mt;
    item.style.display=show?'':'none';
    if(show)vis++;
  });
  var total=document.querySelectorAll('.ex-item').length;
  var cnt=document.getElementById('ex-count');
  if(cnt)cnt.textContent=(vis===total?total:vis+' of '+total)+' asset'+(total===1?'':'s');
  var nr=document.getElementById('ex-nr');
  if(nr)nr.style.display=vis===0?'block':'none';
}
</script>`;

  const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&display=swap" rel="stylesheet">`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Exchange — Assets</title>
  ${FONTS}
  <style>${CSS}</style>
</head>
<body>
  <h1>Exchange</h1>
  <p class="sub">${sub}</p>
  <div class="ex-toolbar">
    <div class="ex-search-wrap">
      ${L_SEARCH_EX}
      <input type="search" class="ex-search" id="ex-srch" placeholder="Search assets\u2026" oninput="__exFilter()">
    </div>
    <div class="ex-filter-btns">${filterBtns}</div>
  </div>
  <div class="ex-card">
    <div class="ex-thead">
      <div class="ex-grid">
        <div class="ex-th">Asset</div>
        <div class="ex-th">Type</div>
        <div class="ex-th">Version</div>
        <div class="ex-th">Status</div>
        <div class="ex-th">Actions</div>
      </div>
    </div>
    ${rows}
    <div id="ex-nr" class="no-results">No assets match your search.</div>
  </div>
  ${SCRIPT}
</body>
</html>`;
}

export function renderExchangeAssetDetailHtml(
  asset: unknown,
  pages?: ExchangePage[],
  resources?: ExchangeResource[],
): string {
  const a = asset as ExchangeAsset;
  const name    = str(a.name) || str(a.assetId) || "Asset";
  const type    = str(a.type);
  const status  = str(a.status);
  const desc    = str(a.description);
  const groupId = str(a.groupId);
  const assetId = str(a.assetId);
  const version = str(a.version);
  const m       = typeMeta(type);
  const gav     = [groupId, assetId, version].filter(Boolean).join(":");
  const exchUrl = groupId && assetId && version
    ? `${anypointBaseUrl()}/exchange/${encodeURIComponent(groupId)}/${encodeURIComponent(assetId)}/${encodeURIComponent(version)}/`
    : undefined;

  let pagesSection = "";
  if (Array.isArray(pages) && pages.length > 0) {
    const pageList = pages.map((p) =>
      `<li style="margin-bottom:4px;font-size:13px">${escHtml(p.name ?? "Page")}</li>`
    ).join("");
    pagesSection = `<div class="card">
      <div class="card-section">
        <div class="label" style="margin-bottom:8px">Documentation Pages</div>
        <ul style="padding-left:20px">${pageList}</ul>
      </div>
    </div>`;
  }

  let resourcesSection = "";
  if (Array.isArray(resources) && resources.length > 0) {
    const resList = resources.map((r) => {
      const href = str(r.url);
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f5f2ef">
        <span style="flex:1;font-size:13px">${escHtml(r.name ?? r.type ?? "Resource")}</span>
        ${href ? warmLinkBtn(href, "Open") : ""}
      </div>`;
    }).join("");
    resourcesSection = `<div class="card">
      <div class="card-section">
        <div class="label" style="margin-bottom:8px">Resources</div>
        ${resList}
      </div>
    </div>`;
  }

  const body = `
<div class="card">
  <div class="card-section" style="display:flex;align-items:flex-start;gap:12px">
    ${typeIconBox(type)}
    <div style="flex:1;min-width:0">
      <div style="font-size:18px;font-weight:700;color:#171717">${escHtml(name)}</div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px">
        <span class="chip" style="background:${m.bg};color:${m.fg}">${escHtml(m.label)}</span>
        ${status ? warmStatusChip(status) : ""}
        ${version ? `<span class="label">v${escHtml(version)}</span>` : ""}
      </div>
    </div>
  </div>
  ${desc ? `<div class="divider"></div><div class="card-section" style="font-size:13px;line-height:1.6;color:#444">${escHtml(desc)}</div>` : ""}
  ${gav ? `<div class="divider"></div><div class="card-section"><code style="word-break:break-all">${escHtml(gav)}</code>${tagChips(a)}</div>` : ""}
  <div class="divider"></div>
  <div class="card-section" style="display:flex;gap:8px;flex-wrap:wrap">
    ${exchUrl ? warmLinkBtn(exchUrl, "View in Exchange") : ""}
    ${exchUrl ? warmCopyBtn(exchUrl) : ""}
  </div>
</div>
${pagesSection}
${resourcesSection}`;

  return warmHtmlPage(`${name}`, `${m.label}${version ? ` · v${version}` : ""}`, body);
}
