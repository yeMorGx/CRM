import "server-only";

import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createClient as createSessionClient } from "@/lib/supabase/server";
import { supabaseUrl } from "@/lib/supabase/config";

export type ManagedUser = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "member";
  is_allowed: boolean;
  created_at: string;
  email_confirmed_at: string | null;
  is_bootstrap_admin: boolean;
  onboarding_completed: boolean;
};

function bootstrapEmails() {
  return (process.env.CRM_BOOTSTRAP_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isBootstrapAdmin(email?: string | null) {
  return Boolean(email && bootstrapEmails().includes(email.trim().toLowerCase()));
}

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key || !supabaseUrl) return null;
  return createSupabaseAdminClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export async function requireUserAdmin() {
  const sessionClient = await createSessionClient();
  if (!sessionClient) return { error: NextResponse.json({ error: "Autenticação não configurada." }, { status: 503 }) } as const;

  const { data: auth, error: authError } = await sessionClient.auth.getUser();
  if (authError || !auth.user) return { error: NextResponse.json({ error: "Entre novamente para continuar." }, { status: 401 }) } as const;

  const { data: profile } = await sessionClient.from("profiles")
    .select("id,is_allowed")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile?.is_allowed) return { error: NextResponse.json({ error: "Sua conta não tem acesso ao CRM." }, { status: 403 }) } as const;

  const admin = createAdminClient();
  if (!admin) return { error: NextResponse.json({ error: "Configure a chave privada do Supabase no servidor para habilitar o gerenciamento." }, { status: 503 }) } as const;
  const { data: verified, error: verificationError } = await admin.auth.admin.getUserById(auth.user.id);
  if (verificationError) return { error: NextResponse.json({ error: "Não foi possível validar as permissões administrativas no servidor." }, { status: 503 }) } as const;
  if (!verified.user) return { error: NextResponse.json({ error: "Entre novamente para continuar." }, { status: 401 }) } as const;
  if (verified.user.app_metadata?.crm_role !== "admin" && !isBootstrapAdmin(verified.user.email)) {
    return { error: NextResponse.json({ error: "Você não tem permissão para gerenciar usuários." }, { status: 403 }) } as const;
  }
  return { admin, user: verified.user } as const;
}

export async function listManagedUsers(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const authUsers = [];
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { users: null, error };
    authUsers.push(...data.users);
    if (data.users.length < 1000) break;
  }

  const ids = authUsers.map((user) => user.id);
  if (!ids.length) return { users: [] as ManagedUser[], error: null };
  const { data: profiles, error: profileError } = await admin.from("profiles")
    .select("id,email,full_name,is_allowed,created_at")
    .in("id", ids);
  if (profileError) return { users: null, error: profileError };

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const users: ManagedUser[] = authUsers.map((user) => {
    const profile = profileById.get(user.id);
    const bootstrap = isBootstrapAdmin(user.email);
    const metadataName = typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "";
    return {
      id: user.id,
      email: user.email ?? profile?.email ?? "",
      full_name: profile?.full_name || metadataName || user.email?.split("@")[0] || "Usuário",
      role: bootstrap || user.app_metadata?.crm_role === "admin" ? "admin" : "member",
      is_allowed: profile?.is_allowed === true,
      created_at: profile?.created_at ?? user.created_at,
      email_confirmed_at: user.email_confirmed_at ?? null,
      is_bootstrap_admin: bootstrap,
      onboarding_completed: user.app_metadata?.onboarding_completed !== false,
    };
  });
  users.sort((first, second) => first.full_name.localeCompare(second.full_name, "pt-BR"));
  return { users, error: null };
}

export function isSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}
