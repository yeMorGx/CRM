import { NextResponse } from "next/server";

import { getCalendarIntegrationAccess } from "@/lib/calendar-integration-access";
import { listNotionDataSources } from "@/lib/calendar-integrations";

export const runtime = "nodejs";

export async function GET() {
  const access = await getCalendarIntegrationAccess();
  if ("error" in access && access.error) return NextResponse.json({ error: access.error.message }, { status: access.error.status });
  try {
    const sources = await listNotionDataSources(access.admin, access.user.id);
    return NextResponse.json({ sources });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível listar as bases do Notion." }, { status: 502 });
  }
}
