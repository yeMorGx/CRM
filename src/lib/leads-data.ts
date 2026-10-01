import type { SupabaseClient } from "@supabase/supabase-js";

import type { Lead } from "@/lib/crm-types";

export async function fetchLeads(supabase: SupabaseClient): Promise<Lead[]> {
  const { data, error } = await supabase.from("leads").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Lead[];
}
