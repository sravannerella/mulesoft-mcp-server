import { anypointBaseUrl } from "../shared/anypointClient.js";
import {
  L_LINK, L_SHIELD,
  escAttr, escHtml,
  warmCopyBtn, warmHtmlPage, warmIconBox, warmLinkBtn, warmStatusChip,
} from "./baseUiRenderer.js";

type Policy = {
  id?: number | string;
  policyTemplateId?: string;
  name?: string;
  disabled?: boolean;
  enabled?: boolean;
  configuration?: Record<string, unknown>;
};

type Contract = {
  id?: number | string;
  applicationName?: string;
  application?: { name?: string };
  status?: string;
  tier?: { name?: string };
};

type Api = {
  id?: number | string;
  assetId?: string;
  name?: string;
  productVersion?: string;
  assetVersion?: string;
  status?: string;
  technology?: string;
  endpointUri?: string;
  isPublic?: boolean;
  groupId?: string;
  policies?: Policy[];
  contracts?: Contract[];
  _environmentName?: string;
  _environmentId?: string;
  [key: string]: unknown;
};

function str(v: unknown): string {
  return typeof v === "string" && v.length > 0 ? v : "";
}

function techChip(tech: string | undefined): string {
  if (!tech) return "";
  const lower = tech.toLowerCase();
  const colors: Record<string, [string, string]> = {
    "mule4": ["#e8f3ff", "#1a4db7"],
    "mule3": ["#e8f3ff", "#1a4db7"],
    "flexgateway": ["#f4ece4", "#5a3e2b"],
    "servicemesh": ["#f0ece4", "#5a3e2b"],
  };
  const [bg, fg] = colors[lower] ?? ["#f4f0eb", "#8b8b8b"];
  return `<span class="chip" style="background:${bg};color:${fg}">${escHtml(tech)}</span>`;
}

function policyBadge(p: Policy): string {
  const name = str(p.name) || str(p.policyTemplateId) || `Policy ${p.id ?? ""}`;
  const isOff = p.disabled === true || p.enabled === false;
  return `<span class="chip" style="background:${isOff ? "#f4f0eb" : "#eef5ff"};color:${isOff ? "#8b8b8b" : "#1a4db7"};${isOff ? "text-decoration:line-through;opacity:0.7" : ""}">${L_SHIELD} ${escHtml(name)}</span>`;
}

function contractRow(c: Contract): string {
  const appName = str(c.applicationName) || str(c.application?.name) || String(c.id ?? "—");
  const status = str(c.status) || "unknown";
  const tier = str(c.tier?.name);
  const s = status.toLowerCase();
  const bg = s === "approved" ? "#d6f0e0" : s === "revoked" ? "#fde8db" : s === "pending" ? "#fef6d6" : "#f4f0eb";
  const fg = s === "approved" ? "#1a6b3c" : s === "revoked" ? "#c44a1a" : s === "pending" ? "#8a6a00" : "#8b8b8b";
  return `<tr>
    <td style="font-weight:500">${escHtml(appName)}</td>
    <td><span class="chip" style="background:${bg};color:${fg}">${escHtml(status)}</span></td>
    <td class="label">${tier ? escHtml(tier) : "—"}</td>
  </tr>`;
}

function apiCard(api: Api): string {
  const assetId  = str(api.assetId) || str(api.name) || String(api.id ?? "API");
  const version  = str(api.productVersion) || str(api.assetVersion);
  const status   = str(api.status);
  const tech     = str(api.technology);
  const endpoint = str(api.endpointUri);
  const policies: Policy[] = Array.isArray(api.policies) ? api.policies : [];
  const contracts: Contract[] = Array.isArray(api.contracts) ? api.contracts : [];
  const exchUrl = api.groupId && api.assetId && (api.productVersion ?? api.assetVersion)
    ? `${anypointBaseUrl()}/exchange/${encodeURIComponent(api.groupId as string)}/${encodeURIComponent(api.assetId as string)}/${encodeURIComponent((api.productVersion ?? api.assetVersion) as string)}/`
    : undefined;

  return `
<div class="card">
  <div class="card-section" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    ${warmIconBox(L_SHIELD, 40)}
    <div style="flex:1;min-width:0">
      <div style="font-size:16px;font-weight:700;color:#171717;word-break:break-all">${escHtml(assetId)}</div>
      <div class="label" style="margin-top:2px">${version ? `v${escHtml(version)}` : ""}</div>
    </div>
    ${warmStatusChip(status)}
    ${techChip(tech)}
  </div>
  ${endpoint ? `
  <div class="divider"></div>
  <div class="card-section" style="display:flex;align-items:center;gap:8px">
    <span style="color:#5a3e2b;flex-shrink:0">${L_LINK}</span>
    <code style="flex:1;word-break:break-all;font-size:11px">${escHtml(endpoint)}</code>
    ${warmCopyBtn(endpoint)}
  </div>` : ""}
  ${policies.length > 0 ? `
  <div class="divider"></div>
  <div class="card-section">
    <div class="label" style="margin-bottom:8px">Policies (${policies.length})</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">${policies.map(policyBadge).join("")}</div>
  </div>` : ""}
  ${contracts.length > 0 ? `
  <div class="divider"></div>
  <div class="card-section">
    <details>
      <summary style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#171717">
        Contracts <span class="chip" style="background:#f4ece4;color:#5a3e2b">${contracts.length}</span>
        <span class="label" style="margin-left:auto;font-size:11px">click to expand</span>
      </summary>
      <div style="margin-top:10px">
        <table>
          <thead><tr><th>Application</th><th>Status</th><th>Tier</th></tr></thead>
          <tbody>${contracts.map(contractRow).join("")}</tbody>
        </table>
      </div>
    </details>
  </div>` : ""}
  <div class="divider"></div>
  <div class="card-section" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    ${exchUrl ? warmLinkBtn(exchUrl, "View in Exchange") : ""}
  </div>
</div>`;
}

export function renderApiManagerApisHtml(data: unknown, envLabel?: string): string {
  const items: Api[] = Array.isArray(data)
    ? (data as Api[])
    : Array.isArray((data as Record<string, unknown>)?.assets)
      ? ((data as Record<string, unknown>).assets as Api[])
      : Array.isArray((data as Record<string, unknown>)?.items)
        ? ((data as Record<string, unknown>).items as Api[])
        : [];

  if (items.length === 0) {
    return warmHtmlPage("API Manager — Instances", "0 API instances", `<p class="empty">No API instances found.</p>`);
  }

  const envNames = [...new Set(items.map((d) => d._environmentName ?? ""))];
  const hasMultipleEnvs = envNames.filter(Boolean).length > 1;

  let body: string;
  if (hasMultipleEnvs) {
    const groups = new Map<string, Api[]>();
    for (const d of items) {
      const key = d._environmentName ?? "(Unknown)";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }
    body = [...groups.entries()].map(([envName, apis]) =>
      `<div class="env-group">
        <div class="env-group-header">${envName}<span class="env-group-count">${apis.length} API${apis.length !== 1 ? "s" : ""}</span></div>
        ${apis.map(apiCard).join("")}
      </div>`
    ).join("");
  } else {
    body = items.map(apiCard).join("");
  }

  const singleEnv = !hasMultipleEnvs && items[0]?._environmentName;
  const subtitle = [`${items.length} API instance${items.length === 1 ? "" : "s"}`, envLabel ?? (singleEnv ? `in ${singleEnv}` : undefined)].filter(Boolean).join(" · ");

  return warmHtmlPage("API Manager — Instances", subtitle, body);
}
