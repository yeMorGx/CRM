import { NextResponse } from "next/server";

import { isSameOriginMutation, requireUserAdmin } from "@/lib/admin-users";

export const runtime = "nodejs";

function validImage(bytes: Uint8Array, type: string) {
  if (type === "image/png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Origem da solicitação inválida." }, { status: 403 });
  const access = await requireUserAdmin();
  if ("error" in access) return access.error;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const asset = form?.get("asset");
  const indexValue = form?.get("partnerIndex");
  if (!(file instanceof File) || (asset !== "signature" && asset !== "logo")) {
    return NextResponse.json({ error: "Escolha uma imagem válida." }, { status: 400 });
  }

  const signature = asset === "signature";
  const partnerIndex = indexValue === "0" ? 0 : indexValue === "1" ? 1 : null;
  const maximumSize = signature ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
  const acceptedTypes = signature ? ["image/png"] : ["image/png", "image/jpeg", "image/webp"];
  if ((signature && partnerIndex === null) || file.size < 1 || file.size > maximumSize || !acceptedTypes.includes(file.type)) {
    return NextResponse.json({ error: signature ? "Envie uma assinatura PNG de até 2 MB." : "Envie uma logo PNG, JPG ou WebP de até 5 MB." }, { status: 400 });
  }

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!validImage(header, file.type)) return NextResponse.json({ error: "O conteúdo do arquivo não corresponde a uma imagem válida." }, { status: 400 });

  const bucket = signature ? "signatures" : "branding";
  const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
  const objectPath = signature
    ? `company/partners/${partnerIndex}/${crypto.randomUUID()}.${extension}`
    : `company/logo/${crypto.randomUUID()}.${extension}`;

  // DECISÃO: arquivos privados passam por esta rota de servidor, protegida por requireUserAdmin.
  const { error: uploadError } = await access.admin.storage.from(bucket).upload(objectPath, file, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) return NextResponse.json({ error: "Não foi possível enviar a imagem. Tente novamente." }, { status: 500 });

  const { data: current, error: readError } = await access.admin.from("company_settings")
    .select("logo_path,partners")
    .eq("id", 1)
    .maybeSingle();
  if (readError || !current) {
    await access.admin.storage.from(bucket).remove([objectPath]);
    return NextResponse.json({ error: "Não foi possível atualizar os dados da empresa." }, { status: 503 });
  }

  let previousPath: string | null;
  let values: Record<string, unknown>;
  if (signature && partnerIndex !== null) {
    const partners = Array.isArray(current.partners) ? current.partners as Array<Record<string, unknown>> : [];
    while (partners.length < 2) partners.push({ name: "", role: "", signature_path: null });
    previousPath = typeof partners[partnerIndex]?.signature_path === "string" ? partners[partnerIndex].signature_path as string : null;
    partners[partnerIndex] = { ...partners[partnerIndex], signature_path: objectPath };
    values = { partners };
  } else {
    previousPath = typeof current.logo_path === "string" ? current.logo_path : null;
    values = { logo_path: objectPath };
  }

  const { error: updateError } = await access.admin.rpc("crm_attributed_update",{p_table:"company_settings",p_key:"1",p_values:values,p_actor:access.user.id});
  if (updateError) {
    await access.admin.storage.from(bucket).remove([objectPath]);
    return NextResponse.json({ error: "Não foi possível salvar a imagem. Tente novamente." }, { status: 500 });
  }
  if (previousPath && previousPath !== objectPath) await access.admin.storage.from(bucket).remove([previousPath]);

  const { data: signed } = await access.admin.storage.from(bucket).createSignedUrl(objectPath, 600);
  return NextResponse.json({ path: objectPath, url: signed?.signedUrl ?? null });
}
