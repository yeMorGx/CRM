import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isSameOriginMutation, requireUserAdmin } from "@/lib/admin-users";

export const runtime = "nodejs";

type Input = Record<string, unknown>;

function record(value: unknown): Input | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Input
    : null;
}

function text(value: unknown, maximum: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= maximum ? normalized || null : undefined;
}

function textObject(value: unknown, keys: string[], maximum: number) {
  const source = record(value);
  if (!source) return null;
  const result: Record<string, string> = {};
  for (const key of keys) {
    const field = source[key];
    if (typeof field !== "string" || field.trim().length > maximum) return null;
    result[key] = field.trim();
  }
  return result;
}

async function signSettings(admin: SupabaseClient, row: Input) {
  const partners = Array.isArray(row.partners) ? row.partners.slice(0, 2) as Input[] : [];
  while (partners.length < 2) partners.push({ name: "", role: "", signature_path: null });

  const signedPartners = await Promise.all(partners.map(async (partner) => {
    const path = typeof partner.signature_path === "string" ? partner.signature_path : null;
    const { data } = path
      ? await admin.storage.from("signatures").createSignedUrl(path, 600)
      : { data: null };
    return {
      name: typeof partner.name === "string" ? partner.name : "",
      role: typeof partner.role === "string" ? partner.role : "",
      signature_path: path,
      signature_url: data?.signedUrl ?? null,
    };
  }));
  const logoPath = typeof row.logo_path === "string" ? row.logo_path : null;
  const { data: logo } = logoPath
    ? await admin.storage.from("branding").createSignedUrl(logoPath, 600)
    : { data: null };

  return { ...row, partners: signedPartners, logo_url: logo?.signedUrl ?? null };
}

export async function GET() {
  const access = await requireUserAdmin();
  if ("error" in access) return access.error;

  const { data, error } = await access.admin.from("company_settings").select("*").eq("id", 1).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Não foi possível carregar os dados da empresa. Confira se a base da Fase 1 está aplicada." }, { status: 503 });
  }
  return NextResponse.json({ settings: await signSettings(access.admin, data) });
}

export async function PUT(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Origem da solicitação inválida." }, { status: 403 });
  const access = await requireUserAdmin();
  if ("error" in access) return access.error;

  const body = record(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const legalName = text(body.legal_name, 180);
  const cnpj = text(body.cnpj, 32);
  const address = text(body.address, 260);
  const email = text(body.email, 180);
  const whatsapp = text(body.whatsapp, 32);
  const partnerInput = Array.isArray(body.partners) ? body.partners : null;
  const partnerNames: Array<{ name: string; role: string }> = [];
  if (partnerInput?.length === 2) {
    for (const entry of partnerInput) {
      const partner = record(entry);
      if (!partner || typeof partner.name !== "string" || partner.name.trim().length > 140
        || typeof partner.role !== "string" || partner.role.trim().length > 100) {
        return NextResponse.json({ error: "Confira os nomes e cargos dos sócios." }, { status: 400 });
      }
      partnerNames.push({ name: partner.name.trim(), role: partner.role.trim() });
    }
  }
  const clauses = textObject(body.clause_defaults, ["idx", "perm", "multa", "aviso", "foro"], 160);

  if (legalName === undefined || cnpj === undefined || address === undefined || email === undefined || whatsapp === undefined
    || !partnerInput || partnerInput.length !== 2 || !clauses
    || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return NextResponse.json({ error: "Confira os campos e tente novamente." }, { status: 400 });
  }

  const { data: existing, error: readError } = await access.admin.from("company_settings")
    .select("logo_path,partners")
    .eq("id", 1)
    .maybeSingle();
  if (readError || !existing) return NextResponse.json({ error: "Não foi possível atualizar os dados da empresa." }, { status: 503 });

  const storedPartners = Array.isArray(existing.partners) ? existing.partners as Input[] : [];
  const partners = partnerNames.map((partner, index) => ({
    ...partner,
    signature_path: typeof storedPartners[index]?.signature_path === "string" ? storedPartners[index].signature_path : null,
  }));
  const { data, error } = await access.admin.rpc("crm_attributed_update",{p_table:"company_settings",p_key:"1",p_actor:access.user.id,p_values:{
    legal_name: legalName,
    cnpj,
    address,
    email,
    whatsapp,
    partners,
    clause_defaults: clauses,
  }});
  if (error) return NextResponse.json({ error: "Não foi possível salvar os dados da empresa. Tente novamente." }, { status: 500 });

  return NextResponse.json({ settings: await signSettings(access.admin, data) });
}
