import { redirect } from "next/navigation";

import { Onboarding } from "@/components/onboarding";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?setup=required");

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/accept-invite");
  if (user.app_metadata?.onboarding_completed !== false) redirect("/");

  return <Onboarding email={user.email ?? ""} emailVerified={Boolean(user.email_confirmed_at)} />;
}
