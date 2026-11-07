import { NextResponse } from "next/server";

import { isSameOriginMutation } from "@/lib/admin-users";
import { getCalendarIntegrationAccess } from "@/lib/calendar-integration-access";
import {
  calendarAppBaseUrl,
  calendarProviderName,
  calendarRedirectUri,
  isCalendarProvider,
  missingCalendarProviderEnvironment,
  retryCalendarEventSyncs,
  updateNotionCalendarConfig,
} from "@/lib/calendar-integrations";

export const runtime = "nodejs";

const providers = ["google", "microsoft", "notion"] as const;

export async function GET(request: Request) {
  const access = await getCalendarIntegrationAccess();
  if ("error" in access && access.error) return NextResponse.json({ error: access.error.message }, { status: access.error.status });

  const [{ data: integrations, error: integrationError }, { data: syncs, error: syncError }] = await Promise.all([
    access.admin.from("calendar_integrations").select("provider,account_label,sync_enabled,config,last_error,updated_at").eq("user_id", access.user.id),
    access.admin.from("calendar_event_syncs").select("provider,state,last_error,updated_at").eq("user_id", access.user.id).neq("state", "synced"),
  ]);
  if (integrationError || syncError) {
    return NextResponse.json({ error: "A migração de integrações de calendário ainda não foi aplicada.", migrationRequired: true }, { status: 503 });
  }

  const baseUrl = calendarAppBaseUrl(request.url);
  const connections = new Map((integrations ?? []).map((item) => [item.provider, item]));
  const pendingSyncs = syncs ?? [];
  return NextResponse.json({
    providers: providers.map((provider) => {
      const connection = connections.get(provider);
      return {
        provider,
        name: calendarProviderName(provider),
        ready: missingCalendarProviderEnvironment(provider).length === 0,
        missingEnvironment: missingCalendarProviderEnvironment(provider),
        callbackUrl: calendarRedirectUri(baseUrl, provider),
        connected: Boolean(connection),
        accountLabel: connection?.account_label ?? null,
        syncEnabled: connection?.sync_enabled ?? false,
        config: provider === "notion" ? connection?.config ?? {} : {},
        lastError: connection?.last_error ?? null,
        pendingCount: pendingSyncs.filter((item) => item.provider === provider).length,
        pendingError: pendingSyncs.find((item) => item.provider === provider)?.last_error ?? null,
      };
    }),
  });
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Origem da solicitação não autorizada." }, { status: 403 });
  const access = await getCalendarIntegrationAccess();
  if ("error" in access && access.error) return NextResponse.json({ error: access.error.message }, { status: access.error.status });
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || typeof payload.action !== "string") return NextResponse.json({ error: "Ação de integração inválida." }, { status: 400 });

  if (payload.action === "retry") {
    const result = await retryCalendarEventSyncs(access.admin, access.user.id);
    return NextResponse.json({ ok: true, ...result });
  }

  const providerValue = typeof payload.provider === "string" ? payload.provider : "";
  if (!isCalendarProvider(providerValue)) return NextResponse.json({ error: "Calendário inválido." }, { status: 400 });
  const provider = providerValue;

  if (payload.action === "disconnect") {
    const { error: syncError } = await access.admin.from("calendar_event_syncs").delete().eq("user_id", access.user.id).eq("provider", provider);
    if (syncError) return NextResponse.json({ error: "Não foi possível limpar o estado de sincronização." }, { status: 503 });
    const { error } = await access.admin.from("calendar_integrations").delete().eq("user_id", access.user.id).eq("provider", provider);
    if (error) return NextResponse.json({ error: "Não foi possível desconectar o calendário." }, { status: 503 });
    return NextResponse.json({ ok: true });
  }

  if (payload.action === "toggle" && typeof payload.enabled === "boolean") {
    const { data: connection } = await access.admin.from("calendar_integrations").select("config").eq("user_id", access.user.id).eq("provider", provider).maybeSingle();
    if (!connection) return NextResponse.json({ error: "Conecte este calendário antes de ativar a sincronização." }, { status: 404 });
    if (provider === "notion" && payload.enabled && (!connection.config || typeof connection.config.dataSourceId !== "string" || !connection.config.dataSourceId)) {
      return NextResponse.json({ error: "Configure a fonte de dados do Notion antes de ativar a sincronização." }, { status: 400 });
    }
    const { error } = await access.admin.from("calendar_integrations").update({ sync_enabled: payload.enabled, last_error: null, updated_at: new Date().toISOString() }).eq("user_id", access.user.id).eq("provider", provider);
    if (error) return NextResponse.json({ error: "Não foi possível atualizar a sincronização." }, { status: 503 });
    return NextResponse.json({ ok: true });
  }

  if (payload.action === "configure-notion" && provider === "notion") {
    const dataSourceId = typeof payload.dataSourceId === "string" ? payload.dataSourceId.trim() : "";
    const titleProperty = typeof payload.titleProperty === "string" ? payload.titleProperty.trim() : "";
    const dateProperty = typeof payload.dateProperty === "string" ? payload.dateProperty.trim() : "";
    if (!dataSourceId || dataSourceId.length > 100 || !titleProperty || titleProperty.length > 100 || !dateProperty || dateProperty.length > 100 || titleProperty === dateProperty) {
      return NextResponse.json({ error: "Informe o ID da fonte e duas propriedades diferentes de título e data." }, { status: 400 });
    }
    try {
      await updateNotionCalendarConfig(access.admin, access.user.id, dataSourceId, titleProperty, dateProperty);
      return NextResponse.json({ ok: true });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível configurar a base do Notion." }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "Ação de integração inválida." }, { status: 400 });
}
