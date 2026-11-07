import { NextResponse } from "next/server";

import { isSameOriginMutation, requireUserAdmin } from "@/lib/admin-users";
import { monthlyBreakdownFields, planLimitFields } from "@/lib/plans-types";

export const runtime = "nodejs";

type Input = Record<string, unknown>;

function record(value: unknown): Input | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Input
    : null;
}

function shortText(value: unknown, maximum: number, allowBlank = false) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= maximum && (allowBlank || normalized.length > 0) ? normalized : null;
}

function nonnegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function cleanPlan(body: Input) {
  const id = shortText(body.id, 60);
  const name = shortText(body.name, 80);
  const tagline = body.tagline === null ? null : shortText(body.tagline, 180, true);
  const onRequest = body.on_request;
  const setupIsFrom = body.setup_is_from;
  const active = body.active;
  const setupPrice = body.setup_price;
  const features = body.features;
  const rawLimits = record(body.limits);
  const rawBreakdown = record(body.monthly_breakdown);

  if (!id || !/^[a-z0-9-]+$/.test(id) || !name || tagline === undefined
    || typeof onRequest !== "boolean" || typeof setupIsFrom !== "boolean"
    || typeof active !== "boolean" || !rawLimits || !rawBreakdown
    || !Array.isArray(features) || features.length > 12) return null;

  const cleanFeatures: string[] = [];
  for (const feature of features) {
    const value = shortText(feature, 240);
    if (!value) return null;
    cleanFeatures.push(value);
  }

  const limits: Record<string, string> = {};
  for (const [key] of planLimitFields) {
    const value = rawLimits[key];
    if ((typeof value !== "string" && typeof value !== "number") || String(value).trim().length > 80) return null;
    limits[key] = String(value).trim();
  }

  const monthlyBreakdown: Record<string, number> = {};
  for (const [key] of monthlyBreakdownFields) {
    const value = nonnegativeNumber(rawBreakdown[key]);
    if (value === null) return null;
    monthlyBreakdown[key] = value;
  }

  if (onRequest) {
    return {
      id,
      name,
      tagline: tagline || null,
      on_request: true,
      setup_price: null,
      monthly_price: null,
      setup_is_from: setupIsFrom,
      features: cleanFeatures,
      limits,
      monthly_breakdown: monthlyBreakdown,
      active,
    };
  }

  const setup = nonnegativeNumber(setupPrice);
  if (setup === null) return null;
  const monthly = Object.values(monthlyBreakdown).reduce((total, value) => total + value, 0);
  return {
    id,
    name,
    tagline: tagline || null,
    on_request: false,
    setup_price: setup,
    monthly_price: monthly,
    setup_is_from: setupIsFrom,
    features: cleanFeatures,
    limits,
    monthly_breakdown: monthlyBreakdown,
    active,
  };
}

function cleanAddon(body: Input) {
  const id = shortText(body.id, 60);
  const name = shortText(body.name, 100);
  const description = body.description === null ? null : shortText(body.description, 220, true);
  const kind = body.kind;
  const price = nonnegativeNumber(body.price);
  const unit = body.unit === null ? null : shortText(body.unit, 80, true);
  const appliesTo = body.applies_to;
  const active = body.active;
  const validPlans = new Set(["starter", "pro", "platinum", "enterprise"]);

  if (!id || !/^[a-z0-9-]+$/.test(id) || !name || description === undefined
    || (kind !== "once" && kind !== "monthly") || price === null || unit === undefined
    || !Array.isArray(appliesTo) || appliesTo.length > validPlans.size
    || !appliesTo.every((planId) => typeof planId === "string" && validPlans.has(planId))
    || typeof active !== "boolean") return null;

  return {
    id,
    name,
    description: description || null,
    kind,
    price,
    unit: unit || null,
    applies_to: [...new Set(appliesTo as string[])],
    active,
  };
}

export async function GET() {
  const access = await requireUserAdmin();
  if ("error" in access) return access.error;

  const [plans, addons] = await Promise.all([
    access.admin.from("plans").select("*").order("sort", { ascending: true }),
    access.admin.from("plan_addons").select("*").order("name", { ascending: true }),
  ]);
  if (plans.error || addons.error) {
    return NextResponse.json({ error: "Não foi possível carregar os planos. Confira se a base da Fase 1 está aplicada." }, { status: 503 });
  }
  return NextResponse.json({ plans: plans.data ?? [], addons: addons.data ?? [] });
}

export async function PATCH(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Origem da solicitação inválida." }, { status: 403 });
  const access = await requireUserAdmin();
  if ("error" in access) return access.error;

  const body = record(await request.json().catch(() => null));
  if (!body || (body.entity !== "plan" && body.entity !== "addon")) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const payload = body.entity === "plan" ? cleanPlan(body) : cleanAddon(body);
  if (!payload) return NextResponse.json({ error: "Confira os campos e tente novamente." }, { status: 400 });

  const table = body.entity === "plan" ? "plans" : "plan_addons";
  const { id, ...values } = payload;
  const { data, error } = await access.admin.rpc("crm_attributed_update",{p_table:table,p_key:id,p_values:values,p_actor:access.user.id});
  if (error) return NextResponse.json({ error: "Não foi possível salvar. Tente novamente." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Este item não existe mais. Atualize a página." }, { status: 404 });

  return NextResponse.json({ item: data });
}
