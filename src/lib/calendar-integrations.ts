import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CalendarProvider = "google" | "microsoft" | "notion";
export type CalendarEventRecord = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  notes: string | null;
  created_by: string | null;
};

type ProviderConfig = {
  clientId: string;
  clientSecret: string;
  tenant?: string;
};

type OAuthTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  workspace_name?: string;
  workspace_id?: string;
  owner?: { user?: { email?: string; name?: string } };
};

type IntegrationRow = {
  id: string;
  user_id: string;
  provider: CalendarProvider;
  account_label: string | null;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  expires_at: string | null;
  scopes: string[];
  sync_enabled: boolean;
  config: Record<string, unknown>;
};

type SyncRow = {
  event_id: string;
  user_id: string;
  provider: CalendarProvider;
  external_event_id: string | null;
  state: "pending" | "synced" | "error" | "delete_pending";
  payload: Record<string, unknown>;
};

const notionVersion = "2026-03-11";
const providerNames: Record<CalendarProvider, string> = {
  google: "Google Calendar",
  microsoft: "Outlook Calendar",
  notion: "Notion",
};

export function isCalendarProvider(value: string): value is CalendarProvider {
  return value === "google" || value === "microsoft" || value === "notion";
}

export function calendarProviderName(provider: CalendarProvider) {
  return providerNames[provider];
}

export function calendarProviderConfig(provider: CalendarProvider): ProviderConfig | null {
  const vars = provider === "google"
    ? ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET"] as const
    : provider === "microsoft"
      ? ["MICROSOFT_CALENDAR_CLIENT_ID", "MICROSOFT_CALENDAR_CLIENT_SECRET"] as const
      : ["NOTION_CALENDAR_CLIENT_ID", "NOTION_CALENDAR_CLIENT_SECRET"] as const;
  const clientId = process.env[vars[0]]?.trim();
  const clientSecret = process.env[vars[1]]?.trim();
  if (!clientId || !clientSecret || !getEncryptionKey()) return null;
  return {
    clientId,
    clientSecret,
    ...(provider === "microsoft" ? { tenant: process.env.MICROSOFT_CALENDAR_TENANT_ID?.trim() || "common" } : {}),
  };
}

export function missingCalendarProviderEnvironment(provider: CalendarProvider) {
  const names = provider === "google"
    ? ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET"]
    : provider === "microsoft"
      ? ["MICROSOFT_CALENDAR_CLIENT_ID", "MICROSOFT_CALENDAR_CLIENT_SECRET"]
      : ["NOTION_CALENDAR_CLIENT_ID", "NOTION_CALENDAR_CLIENT_SECRET"];
  return [...names.filter((name) => !process.env[name]?.trim()), ...(!getEncryptionKey() ? ["OAUTH_TOKEN_ENCRYPTION_KEY"] : [])];
}

export function calendarAppBaseUrl(requestUrl: string) {
  if (process.env.VERCEL_ENV === "preview") return new URL(requestUrl).origin;
  const configured = process.env.APP_BASE_URL?.trim()
    || (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return (configured || new URL(requestUrl).origin).replace(/\/$/, "");
}

export function calendarRedirectUri(baseUrl: string, provider: CalendarProvider) {
  return `${baseUrl}/api/integrations/calendar/${provider}/callback`;
}

function getEncryptionKey() {
  const value = process.env.OAUTH_TOKEN_ENCRYPTION_KEY?.trim();
  if (!value) return null;
  const decoded = /^[a-f\d]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  return decoded.length === 32 ? decoded : null;
}

function encrypt(value: string) {
  const key = getEncryptionKey();
  if (!key) throw new Error("Token encryption is not configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function decrypt(value: string) {
  const key = getEncryptionKey();
  const [version, ivText, tagText, encryptedText] = value.split(".");
  if (!key || version !== "v1" || !ivText || !tagText || !encryptedText) throw new Error("Stored integration credentials are unavailable.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

function tokenExpiry(tokens: OAuthTokens) {
  return typeof tokens.expires_in === "number" ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;
}

function scopesFrom(tokens: OAuthTokens, provider: CalendarProvider) {
  return (tokens.scope ?? (provider === "google"
    ? "openid email profile https://www.googleapis.com/auth/calendar.events"
    : provider === "microsoft"
      ? "openid profile email offline_access User.Read Calendars.ReadWrite"
      : "insert_content update_content")).split(/[\s,]+/).filter(Boolean);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

async function exchangeCode(provider: CalendarProvider, code: string, redirectUri: string) {
  const config = calendarProviderConfig(provider);
  if (!config) throw new Error("OAuth is not configured.");
  let response: Response;
  if (provider === "google") {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  } else if (provider === "microsoft") {
    response = await fetch(`https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", scope: "openid profile email offline_access User.Read Calendars.ReadWrite" }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  } else {
    response = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/json",
        "Notion-Version": notionVersion,
      },
      body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  }
  const data = await readJson(response) as OAuthTokens;
  if (!response.ok || typeof data.access_token !== "string") throw new Error("Calendar authorization could not be completed.");
  return data;
}

async function fetchAccountLabel(provider: CalendarProvider, accessToken: string, tokens: OAuthTokens) {
  try {
    if (provider === "google") {
      const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
      const data = await readJson(response);
      return typeof data.email === "string" ? data.email : null;
    }
    if (provider === "microsoft") {
      const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
      const data = await readJson(response);
      return typeof data.mail === "string" ? data.mail : typeof data.userPrincipalName === "string" ? data.userPrincipalName : typeof data.displayName === "string" ? data.displayName : null;
    }
    const owner = tokens.owner?.user;
    return owner?.email || tokens.workspace_name || null;
  } catch {
    return provider === "notion" ? tokens.workspace_name ?? null : null;
  }
}

export async function createCalendarAuthorizationUrl(provider: CalendarProvider, redirectUri: string, state: string) {
  const config = calendarProviderConfig(provider);
  if (!config) throw new Error("OAuth is not configured.");
  const base = provider === "google"
    ? "https://accounts.google.com/o/oauth2/v2/auth"
    : provider === "microsoft"
      ? `https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/authorize`
      : "https://api.notion.com/v1/oauth/authorize";
  const url = new URL(base);
  if (provider === "google") {
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile https://www.googleapis.com/auth/calendar.events", access_type: "offline", prompt: "consent", state }).toString();
  } else if (provider === "microsoft") {
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri, response_type: "code", response_mode: "query", scope: "openid profile email offline_access User.Read Calendars.ReadWrite", prompt: "select_account", state }).toString();
  } else {
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri, response_type: "code", owner: "user", state }).toString();
  }
  return url.toString();
}

export async function saveCalendarAuthorization(
  admin: SupabaseClient,
  userId: string,
  provider: CalendarProvider,
  code: string,
  redirectUri: string,
) {
  const tokens = await exchangeCode(provider, code, redirectUri);
  const accountLabel = await fetchAccountLabel(provider, tokens.access_token, tokens);
  const { data: previous } = await admin.from("calendar_integrations").select("sync_enabled,config").eq("user_id", userId).eq("provider", provider).maybeSingle();
  const previousConfig = previous?.config && typeof previous.config === "object" ? previous.config : {};
  const nextConfig = provider === "notion"
    ? typeof previousConfig.dataSourceId === "string" && previousConfig.dataSourceId
      ? previousConfig
      : { dataSourceId: "", titleProperty: "Name", dateProperty: "Date" }
    : {};
  const { error } = await admin.from("calendar_integrations").upsert({
    user_id: userId,
    provider,
    account_label: accountLabel,
    access_token_ciphertext: encrypt(tokens.access_token),
    refresh_token_ciphertext: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
    expires_at: tokenExpiry(tokens),
    scopes: scopesFrom(tokens, provider),
    sync_enabled: typeof previous?.sync_enabled === "boolean" ? previous.sync_enabled : provider !== "notion",
    config: nextConfig,
    last_error: null,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,provider" });
  if (error) throw new Error("Calendar connection could not be saved.");
}

async function getFreshAccessToken(admin: SupabaseClient, integration: IntegrationRow) {
  const currentToken = decrypt(integration.access_token_ciphertext);
  if (!integration.expires_at || Date.parse(integration.expires_at) - Date.now() > 90000) return currentToken;
  if (!integration.refresh_token_ciphertext) return currentToken;
  const config = calendarProviderConfig(integration.provider);
  if (!config) throw new Error("Provider OAuth is not configured.");
  const refreshToken = decrypt(integration.refresh_token_ciphertext);
  let response: Response;
  if (integration.provider === "google") {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  } else if (integration.provider === "microsoft") {
    response = await fetch(`https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token", scope: "openid profile email offline_access User.Read Calendars.ReadWrite" }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  } else {
    response = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`, "Content-Type": "application/json", "Notion-Version": notionVersion },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  }
  const refreshed = await readJson(response) as OAuthTokens;
  if (!response.ok || typeof refreshed.access_token !== "string") throw new Error("Provider authorization expired. Reconnect this calendar.");
  const { error } = await admin.from("calendar_integrations").update({
    access_token_ciphertext: encrypt(refreshed.access_token),
    refresh_token_ciphertext: refreshed.refresh_token ? encrypt(refreshed.refresh_token) : integration.refresh_token_ciphertext,
    expires_at: tokenExpiry(refreshed),
    updated_at: new Date().toISOString(),
  }).eq("id", integration.id);
  if (error) throw new Error("Refreshed calendar credentials could not be stored.");
  return refreshed.access_token;
}

function dateInTimeZone(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateTimeInTimeZone(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}

function googleEventBody(event: CalendarEventRecord, timezone: string) {
  const body: Record<string, unknown> = { summary: event.title, description: event.notes ?? undefined };
  if (event.all_day) {
    body.start = { date: dateInTimeZone(event.start_at, timezone) };
    body.end = { date: dateInTimeZone(event.end_at, timezone) };
  } else {
    body.start = { dateTime: event.start_at, timeZone: timezone };
    body.end = { dateTime: event.end_at, timeZone: timezone };
  }
  return body;
}

function microsoftEventBody(event: CalendarEventRecord, timezone: string) {
  return {
    subject: event.title,
    body: event.notes ? { contentType: "text", content: event.notes } : undefined,
    start: { dateTime: event.all_day ? `${dateInTimeZone(event.start_at, timezone)}T00:00:00` : dateTimeInTimeZone(event.start_at, timezone), timeZone: timezone },
    end: { dateTime: event.all_day ? `${dateInTimeZone(event.end_at, timezone)}T00:00:00` : dateTimeInTimeZone(event.end_at, timezone), timeZone: timezone },
    isAllDay: event.all_day,
  };
}

async function providerFetch(provider: CalendarProvider, accessToken: string, url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (provider === "notion") {
    headers.set("Notion-Version", notionVersion);
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(15000) });
  const data = response.status === 204 ? {} : await readJson(response);
  if (!response.ok) throw new Error(`${provider}:${response.status}`);
  return data;
}

function notionProperties(event: CalendarEventRecord, integration: IntegrationRow, timezone: string) {
  const config = integration.config ?? {};
  const titleProperty = typeof config.titleProperty === "string" ? config.titleProperty : "Name";
  const dateProperty = typeof config.dateProperty === "string" ? config.dateProperty : "Date";
  const date = event.all_day
    ? { start: dateInTimeZone(event.start_at, timezone), end: dateInTimeZone(event.end_at, timezone) }
    : { start: event.start_at, end: event.end_at };
  return {
    [titleProperty]: { title: [{ text: { content: event.title } }] },
    [dateProperty]: { date },
  };
}

async function writeProviderEvent(provider: CalendarProvider, accessToken: string, integration: IntegrationRow, event: CalendarEventRecord, externalId: string | null, timezone: string) {
  if (provider === "google") {
    const path = `https://www.googleapis.com/calendar/v3/calendars/primary/events${externalId ? `/${encodeURIComponent(externalId)}` : ""}`;
    const response = await providerFetch(provider, accessToken, path, { method: externalId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(googleEventBody(event, timezone)) });
    if (typeof response.id !== "string") throw new Error("google:missing_id");
    return response.id;
  }
  if (provider === "microsoft") {
    const path = `https://graph.microsoft.com/v1.0/me/events${externalId ? `/${encodeURIComponent(externalId)}` : ""}`;
    const response = await providerFetch(provider, accessToken, path, { method: externalId ? "PATCH" : "POST", headers: { "Content-Type": "application/json", ...(externalId ? {} : { Prefer: 'IdType="ImmutableId"' }) }, body: JSON.stringify({ ...microsoftEventBody(event, timezone), ...(externalId ? {} : { transactionId: event.id }) }) });
    if (externalId) return externalId;
    if (typeof response.id !== "string") throw new Error("microsoft:missing_id");
    return response.id;
  }
  const dataSourceId = integration.config?.dataSourceId;
  if (typeof dataSourceId !== "string" || !dataSourceId) throw new Error("notion:not_configured");
  const path = externalId ? `https://api.notion.com/v1/pages/${encodeURIComponent(externalId)}` : "https://api.notion.com/v1/pages";
  const body = {
    ...(externalId ? {} : { parent: { data_source_id: dataSourceId } }),
    properties: notionProperties(event, integration, timezone),
    ...(externalId || !event.notes ? {} : { children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: event.notes.slice(0, 2000) } }] } }] }),
  };
  const response = await providerFetch(provider, accessToken, path, { method: externalId ? "PATCH" : "POST", body: JSON.stringify(body) });
  if (typeof response.id !== "string") throw new Error("notion:missing_id");
  return response.id;
}

async function deleteProviderEvent(provider: CalendarProvider, accessToken: string, externalId: string) {
  const url = provider === "google"
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(externalId)}`
    : provider === "microsoft"
      ? `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(externalId)}`
      : `https://api.notion.com/v1/pages/${encodeURIComponent(externalId)}`;
  try {
    if (provider === "notion") await providerFetch(provider, accessToken, url, { method: "PATCH", body: JSON.stringify({ in_trash: true }) });
    else await providerFetch(provider, accessToken, url, { method: "DELETE" });
  } catch (error) {
    if (error instanceof Error && /:(404|410)$/.test(error.message)) return;
    throw error;
  }
}

function friendlySyncError(provider: CalendarProvider, error: unknown) {
  if (error instanceof Error && error.message === "notion:not_configured") return "Escolha uma base e as propriedades de título e data do Notion.";
  if (error instanceof Error && error.message.includes("Reconnect this calendar")) return "A autorização expirou. Reconecte este calendário.";
  return `Não foi possível sincronizar com ${providerNames[provider]}. Confira o acesso e tente novamente.`;
}

async function saveSyncState(admin: SupabaseClient, row: SyncRow, state: SyncRow["state"], externalEventId: string | null, errorMessage: string | null) {
  await admin.from("calendar_event_syncs").upsert({
    event_id: row.event_id,
    user_id: row.user_id,
    provider: row.provider,
    external_event_id: externalEventId,
    state,
    payload: row.payload,
    last_error: errorMessage,
    updated_at: new Date().toISOString(),
  }, { onConflict: "event_id,user_id,provider" });
  await admin.from("calendar_integrations").update({ last_error: errorMessage, updated_at: new Date().toISOString() })
    .eq("user_id", row.user_id).eq("provider", row.provider);
}

async function syncOneEvent(admin: SupabaseClient, userId: string, provider: CalendarProvider, event: CalendarEventRecord, timezone: string) {
  const { data: integration } = await admin.from("calendar_integrations").select("*").eq("user_id", userId).eq("provider", provider).maybeSingle() as { data: IntegrationRow | null };
  if (!integration || !integration.sync_enabled) return null;
  const { data: currentSync } = await admin.from("calendar_event_syncs").select("*").eq("event_id", event.id).eq("user_id", userId).eq("provider", provider).maybeSingle() as { data: SyncRow | null };
  const payload = { ...event, timezone };
  const row: SyncRow = { event_id: event.id, user_id: userId, provider, external_event_id: currentSync?.external_event_id ?? null, state: "pending", payload };
  await admin.from("calendar_event_syncs").upsert({ ...row, last_error: null, updated_at: new Date().toISOString() }, { onConflict: "event_id,user_id,provider" });
  try {
    const accessToken = await getFreshAccessToken(admin, integration);
    const externalId = await writeProviderEvent(provider, accessToken, integration, event, row.external_event_id, timezone);
    await saveSyncState(admin, { ...row, external_event_id: externalId }, "synced", externalId, null);
    return null;
  } catch (error) {
    const message = friendlySyncError(provider, error);
    await saveSyncState(admin, row, "error", row.external_event_id, message);
    return message;
  }
}

export async function syncCalendarEvent(admin: SupabaseClient, event: CalendarEventRecord, actorUserId: string, timezone: string) {
  const { data: mappings } = await admin.from("calendar_event_syncs").select("user_id,provider").eq("event_id", event.id) as { data: Array<{ user_id: string; provider: CalendarProvider }> | null };
  const targetUsers = [...new Set([event.created_by ?? actorUserId, ...(mappings ?? []).map((item) => item.user_id)])];
  const { data: integrations } = await admin.from("calendar_integrations").select("user_id,provider").in("user_id", targetUsers).eq("sync_enabled", true) as { data: Array<{ user_id: string; provider: CalendarProvider }> | null };
  const targets = integrations ?? [];
  const errors = (await Promise.all(targets.map((target) => syncOneEvent(admin, target.user_id, target.provider, event, timezone)))).filter((value): value is string => Boolean(value));
  return errors;
}

export async function deleteCalendarEventSyncs(admin: SupabaseClient, event: CalendarEventRecord) {
  const { data: mappings } = await admin.from("calendar_event_syncs").select("*").eq("event_id", event.id) as { data: SyncRow[] | null };
  const errors: string[] = [];
  for (const mapping of mappings ?? []) {
    const { data: integration } = await admin.from("calendar_integrations").select("*").eq("user_id", mapping.user_id).eq("provider", mapping.provider).maybeSingle() as { data: IntegrationRow | null };
    if (!integration || !mapping.external_event_id) {
      const message = `Reconecte ${providerNames[mapping.provider]} para excluir o compromisso sincronizado.`;
      await saveSyncState(admin, { ...mapping, payload: { ...event, timezone: mapping.payload.timezone ?? "America/Sao_Paulo" } }, "delete_pending", mapping.external_event_id, message);
      errors.push(message);
      continue;
    }
    try {
      const accessToken = await getFreshAccessToken(admin, integration);
      await deleteProviderEvent(mapping.provider, accessToken, mapping.external_event_id);
      await admin.from("calendar_event_syncs").delete().eq("event_id", mapping.event_id).eq("user_id", mapping.user_id).eq("provider", mapping.provider);
      await admin.from("calendar_integrations").update({ last_error: null, updated_at: new Date().toISOString() }).eq("user_id", mapping.user_id).eq("provider", mapping.provider);
    } catch {
      const message = friendlySyncError(mapping.provider, new Error("delete failed"));
      await saveSyncState(admin, { ...mapping, payload: { ...event, timezone: mapping.payload.timezone ?? "America/Sao_Paulo" } }, "delete_pending", mapping.external_event_id, message);
      errors.push(message);
    }
  }
  return errors;
}

export async function retryCalendarEventSyncs(admin: SupabaseClient, userId: string) {
  const { data: pending } = await admin.from("calendar_event_syncs").select("*").eq("user_id", userId).in("state", ["pending", "error", "delete_pending"]) as { data: SyncRow[] | null };
  const errors: string[] = [];
  for (const row of pending ?? []) {
    const { data: integration } = await admin.from("calendar_integrations").select("*").eq("user_id", userId).eq("provider", row.provider).maybeSingle() as { data: IntegrationRow | null };
    if (!integration) continue;
    try {
      const accessToken = await getFreshAccessToken(admin, integration);
      if (row.state === "delete_pending") {
        if (row.external_event_id) await deleteProviderEvent(row.provider, accessToken, row.external_event_id);
        await admin.from("calendar_event_syncs").delete().eq("event_id", row.event_id).eq("user_id", row.user_id).eq("provider", row.provider);
        continue;
      }
      const { data: event } = await admin.from("calendar_events").select("*").eq("id", row.event_id).maybeSingle() as { data: CalendarEventRecord | null };
      if (!event) {
        if (row.external_event_id) await deleteProviderEvent(row.provider, accessToken, row.external_event_id);
        await admin.from("calendar_event_syncs").delete().eq("event_id", row.event_id).eq("user_id", row.user_id).eq("provider", row.provider);
        continue;
      }
      const timezone = typeof row.payload.timezone === "string" ? row.payload.timezone : "America/Sao_Paulo";
      const externalId = await writeProviderEvent(row.provider, accessToken, integration, event, row.external_event_id, timezone);
      await saveSyncState(admin, { ...row, external_event_id: externalId }, "synced", externalId, null);
    } catch (error) {
      const message = friendlySyncError(row.provider, error);
      await saveSyncState(admin, row, row.state === "delete_pending" ? "delete_pending" : "error", row.external_event_id, message);
      errors.push(message);
    }
  }
  return { retried: pending?.length ?? 0, errors };
}

export async function notionDataSourceProperties(admin: SupabaseClient, userId: string, requestedDataSourceId?: string) {
  const { data: integration } = await admin.from("calendar_integrations").select("*").eq("user_id", userId).eq("provider", "notion").maybeSingle() as { data: IntegrationRow | null };
  if (!integration) throw new Error("Connecte o Notion antes de escolher uma base.");
  const accessToken = await getFreshAccessToken(admin, integration);
  const dataSourceId = requestedDataSourceId || (typeof integration.config?.dataSourceId === "string" ? integration.config.dataSourceId : "");
  if (!dataSourceId) throw new Error("Informe o ID da fonte de dados do Notion.");
  const data = await providerFetch("notion", accessToken, `https://api.notion.com/v1/data_sources/${encodeURIComponent(dataSourceId)}`);
  const properties = data.properties;
  if (!properties || typeof properties !== "object") throw new Error("Não foi possível ler as propriedades desta fonte do Notion.");
  return properties as Record<string, { type?: string }>;
}

export async function listNotionDataSources(admin: SupabaseClient, userId: string) {
  const { data: integration } = await admin.from("calendar_integrations").select("*").eq("user_id", userId).eq("provider", "notion").maybeSingle() as { data: IntegrationRow | null };
  if (!integration) throw new Error("Conecte o Notion antes de escolher uma base.");
  const accessToken = await getFreshAccessToken(admin, integration);
  const response = await providerFetch("notion", accessToken, "https://api.notion.com/v1/search", {
    method: "POST",
    body: JSON.stringify({ filter: { property: "object", value: "data_source" }, page_size: 100 }),
  });
  const results = Array.isArray(response.results) ? response.results as Array<Record<string, unknown>> : [];
  return results.flatMap((source) => {
    if (typeof source.id !== "string" || !source.properties || typeof source.properties !== "object") return [];
    const properties = source.properties as Record<string, { type?: string }>;
    const titleProperties = Object.keys(properties).filter((name) => properties[name]?.type === "title");
    const dateProperties = Object.keys(properties).filter((name) => properties[name]?.type === "date");
    if (!titleProperties.length || !dateProperties.length) return [];
    const titleParts = Array.isArray(source.title) ? source.title as Array<{ plain_text?: string; text?: { content?: string } }> : [];
    const name = titleParts.map((part) => part.plain_text ?? part.text?.content ?? "").join("").trim() || "Base sem título";
    return [{ id: source.id, name, titleProperties, dateProperties }];
  });
}

export async function updateNotionCalendarConfig(admin: SupabaseClient, userId: string, dataSourceId: string, titleProperty: string, dateProperty: string) {
  const properties = await notionDataSourceProperties(admin, userId, dataSourceId);
  if (properties[titleProperty]?.type !== "title") throw new Error("A propriedade de título precisa ser do tipo Título.");
  if (properties[dateProperty]?.type !== "date") throw new Error("A propriedade de data precisa ser do tipo Data.");
  const { error } = await admin.from("calendar_integrations").update({
    config: { dataSourceId, titleProperty, dateProperty },
    sync_enabled: true,
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("provider", "notion");
  if (error) throw new Error("As configurações do Notion não puderam ser salvas.");
}
