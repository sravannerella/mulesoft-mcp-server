import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { escAttr, escHtml, L_BUILDING, L_COPY_ICON, L_FINGERPRINT, L_FLASK, L_GLOBE, L_ROCKET, L_USER, warmCopyBtn, warmIconBox } from "./baseUiRenderer.js";

// ---------------------------------------------------------------------------
// MuleyUp avatar — base64 so it works in MCP iframes
// ---------------------------------------------------------------------------
const _dir = dirname(fileURLToPath(import.meta.url));
function _loadAsset(filename: string, mimeType: string): string {
  for (const p of [
    resolve(_dir, "assets", filename),
    resolve(_dir, "../../src/ui/assets", filename),
  ]) {
    try { return `data:${mimeType};base64,${readFileSync(p).toString("base64")}`; }
    catch { /* try next */ }
  }
  return "";
}
const MULEY_SRC       = _loadAsset("MuleyUp.png",              "image/png");
const ILLUSTRATION_SRC = _loadAsset("profile-illustration.svg", "image/svg+xml");

// Lucide icons imported from baseUiRenderer
// (L_BUILDING, L_FINGERPRINT, L_USER, L_ROCKET, L_FLASK, L_GLOBE, L_COPY_ICON)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AnypointProfile {
  id?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  organization?: { id?: string; name?: string; domain?: string };
  [key: string]: unknown;
}
interface AnypointEnvironment {
  id?: string;
  name?: string;
  type?: string;
  isProduction?: boolean;
  [key: string]: unknown;
}
interface AnypointEnvironmentsResponse {
  data?: AnypointEnvironment[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function truncateId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}\u2026${id.slice(-4)}`;
}

function iconBox(svg: string): string {
  return warmIconBox(svg, 40);
}

function infoCell(icon: string, label: string, value: string, copyVal?: string): string {
  const display = value === "\u2014" ? "\u2014" : escHtml(truncateId(value));
  const btn = copyVal
    ? warmCopyBtn(copyVal)
    : "";
  return `
<div style="display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #e5e2dd;border-radius:16px;background:#fff">
  ${iconBox(icon)}
  <div style="flex:1;min-width:0">
    <div class="label" style="margin-bottom:3px">${escHtml(label)}</div>
    <div style="font-size:13px;font-weight:600;font-family:monospace;color:#171717;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${display}</div>
  </div>
  ${btn}
</div>`;
}

function envChip(icon: string, name: string, bg: string): string {
  return `<span style="display:inline-flex;align-items:center;gap:8px;background:${bg};padding:9px 16px;border-radius:18px;font-size:13px;font-weight:500;color:#171717">${icon} ${escHtml(name)}</span>`;
}

function envIcon(type: string, isProd: boolean): string {
  if (isProd) return L_GLOBE;
  if (type === "sandbox") return L_FLASK;
  return L_ROCKET;
}

function envBg(type: string, isProd: boolean): string {
  if (isProd) return "#fef3c7";
  if (type === "sandbox") return "#efe7fb";
  return "#eef2e6";
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------
export function renderAccountsContextHtml(profile: unknown, environments: unknown): string {
  const p = (profile ?? {}) as AnypointProfile;
  const envRaw = environments as AnypointEnvironmentsResponse;
  const envList: AnypointEnvironment[] = Array.isArray(envRaw)
    ? (envRaw as AnypointEnvironment[])
    : (envRaw?.data ?? []);

  const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ") || p.username || "\u2014";
  const userId = p.id ?? "\u2014";
  const orgId = p.organization?.id ?? "\u2014";
  const orgName = p.organization?.name ?? "\u2014";
  const orgDomain = p.organization?.domain;
  const initial = fullName.charAt(0).toUpperCase();

  const avatar = MULEY_SRC
    ? `<img src="${MULEY_SRC}" style="width:100%;height:100%;object-fit:cover" />`
    : `<span style="font-size:24px;font-weight:800;color:#6b4226">${escHtml(initial)}</span>`;

  const envChipsHtml = envList
    .slice(0, 4)
    .map((env) => {
      const type = (env.type ?? "").toLowerCase();
      const isProd = env.isProduction ?? false;
      return envChip(envIcon(type, isProd), env.name ?? env.type ?? "Environment", envBg(type, isProd));
    })
    .join("");

  const footerSection = envList.length > 0 ? `
    <div style="padding:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span class="label" style="font-size:14px;font-weight:600">Available Environments:</span>
      ${envChipsHtml}
    </div>` : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Anypoint Context</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f2efea;
      padding: 16px;
    }
    .label {
      font-family: 'Google Sans', Georgia, serif;
      font-size: 12px;
      font-weight: 400;
      color: #8b8b8b;
    }
    .card {
      background: #fff;
      border-radius: 24px;
      border: 1px solid #e5e2dd;
      max-width: 100%;
      overflow: hidden;
    }
    .divider { height: 1px; background: #ebebeb; }
    .copy-btn {
      width: 32px; height: 32px;
      border: 1px solid #e5e2dd; border-radius: 10px;
      background: transparent; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: #737373; flex-shrink: 0;
    }
    .copy-btn:hover { background: #f5f2ef; }
    .copy-btn:active { background: #ebe7e2; }
  </style>
</head>
<body>
  <div class="card">

    <!-- Org header -->
    <div style="padding:18px 20px;display:flex;align-items:center;gap:12px">
      ${iconBox(L_BUILDING)}
      <div style="font-size:14px;font-weight:600;color:#171717">
        ${escHtml(orgName)}
        ${orgDomain ? `<span class="label" style="margin-left:6px">(${escHtml(orgDomain)})</span>` : ""}
      </div>
    </div>

    <div class="divider"></div>

    <!-- Profile section -->
    <div style="padding:24px 20px;display:flex;justify-content:space-between;align-items:center;gap:16px">
      <div style="display:flex;align-items:center;gap:16px;min-width:0">
        <div style="width:60px;height:60px;border-radius:999px;background:#f4ece4;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center">
          ${avatar}
        </div>
        <div style="min-width:0">
          <div style="font-size:22px;font-weight:700;color:#171717;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(fullName)}</div>
          <div class="label" style="margin-top:4px">${escHtml(p.email ?? "\u2014")}</div>
        </div>
      </div>
      ${ILLUSTRATION_SRC ? `<img src="${ILLUSTRATION_SRC}" style="width:110px;height:auto;flex-shrink:0" />` : ""}
    </div>

    <div class="divider"></div>

    <!-- Info bar: User ID · Org ID · Username -->
    <div style="padding:16px 20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px">
      ${infoCell(L_FINGERPRINT, "User ID",         userId,         userId !== "\u2014" ? userId : undefined)}
      ${infoCell(L_BUILDING,    "Organization ID", orgId,          orgId  !== "\u2014" ? orgId  : undefined)}
      ${infoCell(L_USER,        "Username",        p.username ?? "\u2014")}
    </div>

    ${envList.length ? `<div class="divider"></div>${footerSection}` : ""}

  </div>

  <script>
    function __copy(t) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).catch(function() { __fb(t); });
      } else { __fb(t); }
    }
    function __fb(t) {
      var el = document.createElement('textarea');
      el.value = t;
      el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
      document.body.appendChild(el);
      el.focus(); el.select();
      try { document.execCommand('copy'); } catch(e) {}
      document.body.removeChild(el);
    }
  </script>
</body>
</html>`;

  return html;
}
