import { redirect } from "next/navigation";

import { CrmDashboard } from "@/components/crm-dashboard";
import { ConfigurationRequired } from "@/components/configuration-required";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function Home({ searchParams }: { searchParams: Promise<{ calendarIntegration?: string | string[]; provider?: string | string[]; view?: string }> }) {
  const query = await searchParams;
  const integrationStatus = Array.isArray(query.calendarIntegration) ? query.calendarIntegration[0] : query.calendarIntegration;
  const integrationProvider = Array.isArray(query.provider) ? query.provider[0] : query.provider;
  const integrationReturn = integrationStatus === "connected"
    ? { status: "connected" as const, provider: integrationProvider }
    : integrationStatus === "error"
      ? { status: "error" as const, provider: integrationProvider }
      : null;
  if (!isSupabaseConfigured) return <ConfigurationRequired />;

  const supabase = await createClient();
  const { data } = await supabase!.auth.getUser();
  if (!data.user) redirect("/login");
  if (data.user.app_metadata?.onboarding_completed === false) redirect("/onboarding");
  const currentUserEmail = data.user.email ?? undefined;
  const profileWithAvatar = await supabase!.from("profiles")
    .select("id,full_name,avatar_color,avatar_path,created_at")
    .eq("id", data.user.id)
    .maybeSingle();
  const avatarStorageReady = !profileWithAvatar.error;
  const profileFallback = profileWithAvatar.error
    ? await supabase!.from("profiles").select("id,full_name,avatar_color,created_at").eq("id", data.user.id).maybeSingle()
    : null;
  const rawProfile = profileWithAvatar.error ? profileFallback?.data : profileWithAvatar.data;
  const profile = rawProfile
    ? { ...rawProfile, avatar_path: avatarStorageReady ? (rawProfile as unknown as { avatar_path: string | null }).avatar_path : null, avatar_storage_ready: avatarStorageReady } as import("@/components/profile-page").Profile
    : null;

  const { data: signedAvatar } = profile?.avatar_path
    ? await supabase!.storage.from("avatars").createSignedUrl(profile.avatar_path, 60 * 60)
    : { data: null };

  const bootstrapAdmins = (process.env.CRM_BOOTSTRAP_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = Boolean(profile) && (
    data.user.app_metadata?.crm_role === "admin"
    || Boolean(data.user.email && bootstrapAdmins.includes(data.user.email.toLowerCase()))
  );
  const requestedAdminView = query.view === "plans" || query.view === "company";
  if (requestedAdminView && !isAdmin) redirect("/");

  const initialView = query.view === "analytics" ? "analytics" : query.view === "documents" ? "documents"
    : query.view === "canvas" ? "canvas"
      : query.view === "plans" ? "plans"
        : query.view === "company" ? "company"
          : integrationReturn ? "settings" : undefined;
  return <CrmDashboard userEmail={currentUserEmail} profile={profile ? { ...profile, avatar_url: signedAvatar?.signedUrl ?? null } : null} isAdmin={isAdmin} initialView={initialView} integrationReturn={integrationReturn} />;
}
