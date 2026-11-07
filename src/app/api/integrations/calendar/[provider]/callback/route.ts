import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getCalendarIntegrationAccess } from "@/lib/calendar-integration-access";
import { saveCalendarAuthorization, calendarAppBaseUrl, calendarRedirectUri, isCalendarProvider } from "@/lib/calendar-integrations";

export const runtime = "nodejs";

function settingsRedirect(baseUrl: string, status: "connected" | "error", provider: string) {
  const url = new URL("/", baseUrl);
  url.searchParams.set("calendarIntegration", status);
  url.searchParams.set("provider", provider);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: value } = await context.params;
  const baseUrl = calendarAppBaseUrl(request.url);
  if (!isCalendarProvider(value)) return NextResponse.redirect(new URL("/", baseUrl));
  const cookieName = `calendar_oauth_${value}`;
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(cookieName)?.value;
  const returnedState = request.nextUrl.searchParams.get("state");
  const clearCookie = (response: NextResponse) => {
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      secure: new URL(request.url).protocol === "https:",
      sameSite: "lax",
      maxAge: 0,
      path: `/api/integrations/calendar/${value}/callback`,
    });
    return response;
  };

  if (!expectedState || !returnedState || expectedState !== returnedState) {
    return clearCookie(settingsRedirect(baseUrl, "error", value));
  }
  if (request.nextUrl.searchParams.has("error")) {
    return clearCookie(settingsRedirect(baseUrl, "error", value));
  }

  const access = await getCalendarIntegrationAccess();
  if ("error" in access && access.error) return clearCookie(settingsRedirect(baseUrl, "error", value));
  const code = request.nextUrl.searchParams.get("code");
  if (!code || code.length > 4096) return clearCookie(settingsRedirect(baseUrl, "error", value));

  try {
    await saveCalendarAuthorization(access.admin, access.user.id, value, code, calendarRedirectUri(baseUrl, value));
    return clearCookie(settingsRedirect(baseUrl, "connected", value));
  } catch {
    return clearCookie(settingsRedirect(baseUrl, "error", value));
  }
}
