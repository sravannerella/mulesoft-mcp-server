import { anypointBaseUrl } from "./anypointClient.js";

function base(): string {
  return anypointBaseUrl();
}

export function designCenterProjectUrl(organizationId: string, projectId: string): string {
  return `${base()}/designcenter/api-designer/#/projects/${projectId}?organizationId=${organizationId}`;
}

export function exchangeAssetUrl(groupId: string, assetId: string, version: string): string {
  return `${base()}/exchange/${encodeURIComponent(groupId)}/${encodeURIComponent(assetId)}/${encodeURIComponent(version)}/`;
}

export function apiManagerApiUrl(organizationId: string, environmentId: string, apiId: string): string {
  return `${base()}/apimanager/api/${encodeURIComponent(organizationId)}/environments/${encodeURIComponent(environmentId)}/apis/${encodeURIComponent(apiId)}`;
}

export function runtimeManagerAppUrl(organizationId: string, environmentId: string, appName: string): string {
  return `${base()}/runtime-manager/#/applications/${encodeURIComponent(appName)}/dashboard?environmentId=${environmentId}&organizationId=${organizationId}`;
}

export function monitoringAppUrl(organizationId: string, environmentId: string, appName: string): string {
  return `${base()}/monitoring/#/apps/${encodeURIComponent(appName)}/overview?environmentId=${environmentId}&organizationId=${organizationId}`;
}

export function mqUrl(organizationId: string, environmentId: string): string {
  return `${base()}/mq/#/queues?organizationId=${organizationId}&environmentId=${environmentId}`;
}
