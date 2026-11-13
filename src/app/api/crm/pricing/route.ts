import { NextResponse } from "next/server";
import { requireCrm } from "@/lib/crm-server";

export async function GET() {
  const access = await requireCrm();
  if ("error" in access) return access.error;
  const [plans, addons] = await Promise.all([
    access.admin.from("plans").select("*").eq("active", true).order("sort"),
    access.admin.from("plan_addons").select("*").eq("active", true).order("name"),
  ]);
  if (plans.error || addons.error) {
    return NextResponse.json({ error: "Não foi possível carregar planos e extras." }, { status: 503 });
  }
  return NextResponse.json(
    { plans: plans.data, addons: addons.data },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
