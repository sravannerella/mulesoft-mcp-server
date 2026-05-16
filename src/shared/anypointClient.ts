import type { RequestOptions } from "./types.js";
import { MemoryCache } from "./memoryCache.js";

const DEFAULT_BASE_URL = "https://anypoint.mulesoft.com";
const TOKEN_REFRESH_BUFFER_MS = 60_000;

type TokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
};

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

export type AccountContext = {
  organizationId: string;
  ownerId: string;
  profile: unknown;
};

let cachedToken: CachedToken | undefined;
let refreshPromise: Promise<CachedToken> | undefined;
const accountContextCache = new MemoryCache<AccountContext>();

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name];
}

export function anypointBaseUrl(): string {
  return (process.env.ANYPOINT_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function organizationId(override?: string): string {
  return override ?? optionalEnv("ANYPOINT_ORG_ID") ?? getAccountContext().organizationId;
}

export function environmentId(override?: string): string {
  return override ?? requiredEnv("ANYPOINT_ENV_ID");
}

function tokenUrl(): string {
  return `${anypointBaseUrl()}/accounts/api/v2/oauth2/token`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function nestedStringField(record: Record<string, unknown>, parentKey: string, keys: string[]): string | undefined {
  const nested = record[parentKey];
  return isRecord(nested) ? stringField(nested, keys) : undefined;
}

function firstOrganizationId(record: Record<string, unknown>): string | undefined {
  const direct =
    stringField(record, ["organizationId", "orgId"]) ??
    nestedStringField(record, "organization", ["id", "organizationId", "orgId"]) ??
    nestedStringField(record, "org", ["id", "organizationId", "orgId"]);

  if (direct) {
    return direct;
  }

  const organizationLists = ["memberOfOrganizations", "organizations", "businessGroups"];
  for (const listKey of organizationLists) {
    const value = record[listKey];
    if (!Array.isArray(value)) {
      continue;
    }

    for (const item of value) {
      if (!isRecord(item)) {
        continue;
      }

      const id = stringField(item, ["id", "organizationId", "orgId"]);
      if (id) {
        return id;
      }
    }
  }

  return undefined;
}

export async function requestProfile(): Promise<unknown> {
  const response = await fetch(`${anypointBaseUrl()}/accounts/api/profile`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      accept: "application/json",
    },
  });

  const rawText = await response.text();
  if (!response.ok) {
    const details = rawText ? `: ${rawText}` : "";
    throw new Error(`Unable to retrieve Anypoint profile (${response.status} ${response.statusText})${details}`);
  }

  return JSON.parse(rawText);
}

function accountContextFromProfile(profile: unknown): AccountContext {
  if (!isRecord(profile)) {
    throw new Error("Unable to read Anypoint profile: response was not an object");
  }

  const ownerId = stringField(profile, ["id", "userId", "ownerId"]);
  const profileOrgId = firstOrganizationId(profile);
  const orgId = optionalEnv("ANYPOINT_ORG_ID") ?? profileOrgId;

  if (!ownerId) {
    throw new Error("Unable to read Anypoint profile: no user id was found");
  }

  if (!orgId) {
    throw new Error("Unable to read Anypoint profile: no organization id was found");
  }

  return {
    organizationId: orgId,
    ownerId,
    profile,
  };
}

async function requestAccessToken(): Promise<CachedToken> {
  const response = await fetch(tokenUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      client_id: requiredEnv("ANYPOINT_CLIENT_ID"),
      client_secret: requiredEnv("ANYPOINT_CLIENT_SECRET"),
      grant_type: "client_credentials",
    }),
  });

  const rawText = await response.text();
  if (!response.ok) {
    const details = rawText ? `: ${rawText}` : "";
    throw new Error(`Unable to retrieve Anypoint access token (${response.status} ${response.statusText})${details}`);
  }

  const tokenResponse = JSON.parse(rawText) as TokenResponse;
  if (typeof tokenResponse.access_token !== "string" || tokenResponse.access_token.length === 0) {
    throw new Error("Unable to retrieve Anypoint access token: response did not include access_token");
  }

  const expiresInSeconds = typeof tokenResponse.expires_in === "number" ? tokenResponse.expires_in : 3600;
  return {
    accessToken: tokenResponse.access_token,
    expiresAtMs: Date.now() + expiresInSeconds * 1000,
  };
}

export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && Date.now() < cachedToken.expiresAtMs - TOKEN_REFRESH_BUFFER_MS) {
    return cachedToken.accessToken;
  }

  refreshPromise ??= requestAccessToken().finally(() => {
    refreshPromise = undefined;
  });

  cachedToken = await refreshPromise;
  return cachedToken.accessToken;
}

export async function initializeAnypointAuth(): Promise<void> {
  await getAccessToken(true);
  const cachedAccountContext = accountContextCache.set("profile", accountContextFromProfile(await requestProfile())).value;
  console.error(
    `Anypoint authentication succeeded: access token retrieved for org ${cachedAccountContext.organizationId}.`,
  );
}

export function getAccountContext(): AccountContext {
  const cachedAccountContext = accountContextCache.get("profile")?.value;
  if (!cachedAccountContext) {
    throw new Error("Anypoint account context is not initialized");
  }

  return cachedAccountContext;
}

export async function cachedProfile(refresh = false): Promise<unknown> {
  if (refresh) {
    accountContextCache.set("profile", accountContextFromProfile(await requestProfile()));
  }

  return getAccountContext().profile;
}

export async function authHeaders(accept = "application/json"): Promise<Record<string, string>> {
  const accountContext = getAccountContext();

  return {
    Authorization: `Bearer ${await getAccessToken()}`,
    "x-organization-id": accountContext.organizationId,
    "x-owner-id": accountContext.ownerId,
    Accept: accept,
  };
}

export function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

export function withQuery(path: string, query?: RequestOptions["query"]): string {
  if (!query) {
    return path;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }

  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export async function anypointRequest(path: string, options: RequestOptions = {}): Promise<unknown> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = await authHeaders(options.accept);
  const init: RequestInit = { method, headers };

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${anypointBaseUrl()}${withQuery(path, options.query)}`, init);
  const contentType = response.headers.get("content-type") ?? "";
  const rawText = await response.text();

  if (!response.ok) {
    const details = rawText ? `: ${rawText}` : "";
    throw new Error(`Anypoint request failed (${response.status} ${response.statusText})${details}`);
  }

  if (response.status === 204 || rawText.length === 0) {
    return { status: response.status };
  }

  if (contentType.includes("application/json")) {
    return JSON.parse(rawText);
  }

  return rawText;
}
