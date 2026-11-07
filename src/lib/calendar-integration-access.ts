import "server-only";

import { createAdminClient } from "@/lib/admin-users";
import { createClient } from "@/lib/supabase/server";

export async function getCalendarIntegrationAccess() {
  const session = await createClient();
  if (!session) return { error: { status: 503, message: "A autenticação do Supabase não está configurada." } } as const;
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return { error: { status: 401, message: "Entre novamente para continuar." } } as const;
  const { data: profile } = await session.from("profiles").select("is_allowed").eq("id", user.id).maybeSingle();
  if (!profile?.is_allowed) return { error: { status: 403, message: "Sua conta não tem acesso ao CRM." } } as const;
  const admin = createAdminClient();
  if (!admin) return { error: { status: 503, message: "O serviço privado de integrações não está configurado no servidor." } } as const;
  return { session, admin, user } as const;
}
