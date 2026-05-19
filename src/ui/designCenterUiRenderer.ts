import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { anypointBaseUrl, organizationId } from "../shared/anypointClient.js";

type CreatedBy =
  | string
  | { firstName?: string; lastName?: string; userName?: string; name?: string }
  | null
  | undefined;

type DesignCenterProject = {
  id?: string;
  name?: string;
  classifier?: string;
  type?: string;
  organizationId?: string;
  createdBy?: CreatedBy;
  createdDate?: string | number;
  updatedDate?: string | number;
  lastUpdatedDate?: string | number;
  [key: string]: unknown;
};

const currentDir = dirname(fileURLToPath(import.meta.url));

function loadMuleyIcon(): string {
  for (const path of [resolve(currentDir, "assets/MuleyUp.png"), resolve(currentDir, "../../src/ui/assets/MuleyUp.png")]) {
    try {
      return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
    } catch {
      // Try the next path. The first works after build, the second works from source.
    }
  }

  return "";
}

const MULEY_ICON_SRC = loadMuleyIcon();

function resolveCreatedBy(createdBy: CreatedBy): string {
  if (!createdBy) return "—";
  if (typeof createdBy === "string") return createdBy;
  const full = [createdBy.firstName, createdBy.lastName].filter(Boolean).join(" ");
  return full || createdBy.userName || createdBy.name || "—";
}

function formatDate(value: string | number | undefined): string {
  if (!value) return "—";
  try {
    const date = typeof value === "number" ? new Date(value) : new Date(value);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return String(value);
  }
}

function classifierLabel(classifier: string | undefined): string {
  if (!classifier) return "API";
  const map: Record<string, string> = {
    raml: "RAML",
    "raml-fragment": "RAML Fragment",
    oas: "OAS",
    "oas-fragment": "OAS Fragment",
    asyncapi: "AsyncAPI",
    grpc: "gRPC",
  };
  return map[classifier.toLowerCase()] ?? classifier.toUpperCase();
}

function openUrl(project: DesignCenterProject): string {
  const baseUrl = anypointBaseUrl();
  const orgId = project.organizationId ?? organizationId();
  const projectId = project.id ?? "";
  return `${baseUrl}/designcenter/api-designer/#/projects/${projectId}?organizationId=${orgId}`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

const SHARED_STYLES = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Google Sans', 'EB Garamond', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body {
      background: #faf8f3;
      color: #242424;
      padding: 16px;
      overflow-x: hidden;
    }
    .dc-shell {
      width: 100%;
      margin: 0;
    }
    .carousel-wrapper {
      position: relative;
      width: 100%;
    }
    .carousel-track-outer {
      overflow-x: auto;
      overflow-y: hidden;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
      scrollbar-color: #cfcfca transparent;
      padding-bottom: 10px;
    }
    .carousel-track {
      display: flex;
      gap: 14px;
      padding: 0 2px 4px;
      width: max-content;
    }
    .dc-card {
      flex: 0 0 226px;
      height: 160px;
      background: #fff;
      border: 1px solid rgba(255,255,255,0.9);
      border-radius: 18px;
      overflow: hidden;
      color: inherit;
      text-decoration: none;
      box-shadow: 0 10px 22px rgba(32,32,32,0.08);
      display: flex;
      flex-direction: column;
      transition: transform 0.18s ease, box-shadow 0.18s ease;
    }
    .dc-card:hover,
    .dc-card:focus-visible {
      transform: translateY(-2px);
      box-shadow: 0 14px 28px rgba(32,32,32,0.12);
      outline: none;
    }
    .dc-card-visual {
      height: 46px;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px 0;
    }
    .dc-card-icon {
      width: 32px;
      height: 32px;
      border-radius: 11px;
      background: #ffffff;
      object-fit: contain;
      padding: 3px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.12);
    }
    .dc-badge {
      color: #65645d;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .dc-card-body {
      padding: 7px 18px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
    }
    .dc-kicker {
      color: #56554f;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.2;
    }
    .dc-card-title {
      color: #242424;
      font-size: 18px;
      line-height: 1.12;
      font-weight: 800;
      min-height: 40px;
      overflow-wrap: anywhere;
    }
    .dc-card-meta {
      display: flex;
      align-items: center;
      font-family: 'EB Garamond', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      gap: 7px;
      color: #8a8984;
      font-size: 13px;
      font-weight: 700;
      margin-top: auto;
      white-space: nowrap;
    }
    .dc-dot {
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: #b5b4ae;
      flex: 0 0 auto;
    }
    .dc-empty {
      background: #fff;
      border-radius: 16px;
      padding: 20px;
      color: #65645d;
      font-size: 13px;
    }
    @media (max-width: 520px) {
      body { padding: 12px; }
      .dc-card { flex-basis: 206px; height: 154px; }
      .dc-card-title { font-size: 17px; }
      .dc-card-meta { font-size: 12px; }
    }
  </style>
`;

const MCP_UI_READY_SCRIPT = `
  <script>
    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'ui-lifecycle-iframe-render-data') {
        window.__mcpUiRenderData = event.data.payload && event.data.payload.renderData;
      }
    });
    window.parent.postMessage({ type: 'ui-lifecycle-iframe-ready' }, '*');
  </script>
`;

function buildCard(project: DesignCenterProject): string {
  const title = project.name ?? "Untitled Project";
  const badge = classifierLabel(project.classifier ?? project.type);
  const created = formatDate(project.createdDate);
  const updated = formatDate(project.updatedDate ?? project.lastUpdatedDate);
  const url = openUrl(project);
  return `
    <a class="dc-card" href="${escAttr(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escAttr(title)} in Design Center">
      <div class="dc-card-visual">
        ${MULEY_ICON_SRC ? `<img class="dc-card-icon" src="${MULEY_ICON_SRC}" alt="">` : `<span class="dc-card-icon"></span>`}
        <span class="dc-badge">${escHtml(badge)}</span>
      </div>
      <div class="dc-card-body">
        <div class="dc-kicker">Design Center</div>
        <div class="dc-card-title">${escHtml(title)}</div>
        <div class="dc-card-meta">
          <span>${escHtml(created)}</span>
        </div>
      </div>
    </a>`;
}

function renderCarousel(projects: DesignCenterProject[]): string {
  const cards = projects.map(buildCard).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">${SHARED_STYLES}</head>
<body>
  <main class="dc-shell">
    <div class="carousel-wrapper">
      <div class="carousel-track-outer">
        <div class="carousel-track" id="track">${cards}</div>
      </div>
    </div>
  </main>
  ${MCP_UI_READY_SCRIPT}
</body>
</html>`;
}

function normalizeProjects(data: unknown): DesignCenterProject[] {
  if (Array.isArray(data)) return data as DesignCenterProject[];
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["projects", "items", "data", "results"]) {
      if (Array.isArray(record[key])) return record[key] as DesignCenterProject[];
    }
  }
  return [];
}

/** Render Design Center projects as a compact carousel. */
export function renderDesignCenterProjectsUI(data: unknown): string {
  const projects = normalizeProjects(data);
  if (projects.length === 0) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">${SHARED_STYLES}</head><body>
      <main class="dc-shell">
        <div class="dc-empty">No projects found.</div>
      </main>
      ${MCP_UI_READY_SCRIPT}
    </body></html>`;
  }
  return renderCarousel(projects);
}
