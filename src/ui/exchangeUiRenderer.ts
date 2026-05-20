import { anypointBaseUrl } from "../shared/anypointClient.js";
import {
  L_PACKAGE, L_TAG,
  escAttr, escHtml,
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

  const sub = subtitle ?? `${items.length} asset${items.length === 1 ? "" : "s"}`;
  return warmHtmlPage("Exchange — Assets", sub, items.map(assetCard).join(""));
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
