import { createClient } from "@/lib/supabase/server";
import { getFirstContactTemplate } from "@/lib/whatsapp-first-contact";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return Response.json({ message: "O Supabase não está configurado." }, { status: 503 });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ message: "Entre novamente para consultar a integração." }, { status: 401 });

  const sendReady = Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    /^v\d+\.\d+$/.test(process.env.WHATSAPP_API_VERSION ?? "") &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const receiveReady = Boolean(
    process.env.WHATSAPP_APP_SECRET &&
    process.env.WHATSAPP_VERIFY_TOKEN &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const firstContactTemplate = getFirstContactTemplate();

  return Response.json({
    sendReady,
    receiveReady,
    firstContactReady: sendReady && Boolean(firstContactTemplate),
    firstContactPreview: sendReady ? firstContactTemplate?.preview ?? null : null,
    callbackUrl: new URL("/api/whatsapp/webhook", request.url).toString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
