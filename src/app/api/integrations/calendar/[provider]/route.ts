import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getCalendarIntegrationAccess } from "@/lib/calendar-integration-access";
import {
  calendarAppBaseUrl,
  calendarRedirectUri,
  createCalendarAuthorizationUrl,
  isCalendarProvider,
  missingCalendarProviderEnvironment,
} from "@/lib/calendar-integrations";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: value } = await context.params;
  if (!isCalendarProvider(value)) return NextResponse.json({ error: "Este calendário não é compatível." }, { status: 404 });
  const access = await getCalendarIntegrationAccess();
  if ("error" in access && access.error) return NextResponse.json({ error: access.error.message }, { status: access.error.status });

  const missing = missingCalendarProviderEnvironment(value);
  if (missing.length) return NextResponse.json({ error: `O servidor precisa configurar: ${missing.join(", ")}.` }, { status: 503 });

  const state = randomBytes(32).toString("base64url");
  const baseUrl = calendarAppBaseUrl(request.url);
  const redirectUri = calendarRedirectUri(baseUrl, value);
  const authorizationUrl = await createCalendarAuthorizationUrl(value, redirectUri, state);
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(`calendar_oauth_${value}`, state, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    maxAge: 600,
    path: `/api/integrations/calendar/${value}/callback`,
  });
  return response;
}
