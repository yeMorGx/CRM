import { NextResponse } from "next/server";

import { createAdminClient, isSameOriginMutation } from "@/lib/admin-users";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const maxAvatarSize = 5 * 1024 * 1024;
const avatarTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Origem da solicitação não autorizada." }, { status: 403 });

  const sessionClient = await createClient();
  if (!sessionClient) return NextResponse.json({ error: "A autenticação não está configurada." }, { status: 503 });
  const { data: auth, error: authError } = await sessionClient.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Seu convite expirou. Peça um novo código ao administrador." }, { status: 401 });
  if (auth.user.app_metadata?.onboarding_completed !== false) return NextResponse.json({ error: "Este onboarding já foi concluído." }, { status: 409 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "O serviço seguro de onboarding não está configurado." }, { status: 503 });
  const { data: verified, error: verifiedError } = await admin.auth.admin.getUserById(auth.user.id);
  if (verifiedError || !verified.user) return NextResponse.json({ error: "Não foi possível validar este convite." }, { status: 401 });
  if (!verified.user.email_confirmed_at) return NextResponse.json({ error: "Confirme seu e-mail pelo convite antes de continuar." }, { status: 403 });
  if (verified.user.app_metadata?.onboarding_completed !== false) return NextResponse.json({ error: "Este onboarding já foi concluído." }, { status: 409 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Não foi possível ler os dados do perfil." }, { status: 400 });
  }
  const fullName = String(form.get("full_name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const avatar = form.get("avatar");
  if (fullName.length < 2 || fullName.length > 80) return NextResponse.json({ error: "Use um nome com 2 a 80 caracteres." }, { status: 400 });
  if (password.length < 8 || password.length > 128) return NextResponse.json({ error: "A senha precisa ter entre 8 e 128 caracteres." }, { status: 400 });
  if (avatar !== null && (!(avatar instanceof File) || avatar.size <= 0 || avatar.size > maxAvatarSize || !avatarTypes.has(avatar.type))) {
    return NextResponse.json({ error: "Escolha uma foto JPG, PNG ou WebP de até 5 MB." }, { status: 400 });
  }

  const { data: profile, error: profileReadError } = await admin.from("profiles")
    .select("id,email,full_name,is_allowed,avatar_path")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profileReadError || !profile || profile.is_allowed || profile.email.toLowerCase() !== verified.user.email?.toLowerCase()) {
    return NextResponse.json({ error: "Este convite não corresponde a um perfil pendente válido." }, { status: 403 });
  }

  let avatarPath: string | null = null;
  if (avatar instanceof File) {
    const extension = avatarTypes.get(avatar.type);
    if (!extension) return NextResponse.json({ error: "Formato de foto não suportado." }, { status: 400 });
    avatarPath = `${auth.user.id}/profile-avatar/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage.from("avatars").upload(avatarPath, await avatar.arrayBuffer(), {
      contentType: avatar.type,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) {
      console.error("Onboarding avatar upload failed", uploadError.name);
      return NextResponse.json({ error: "A foto não pôde ser salva. Tente outra imagem ou continue sem foto." }, { status: 502 });
    }
  }

  const profileUpdate = await admin.from("profiles")
    .update({ full_name: fullName, is_allowed: true, ...(avatarPath ? { avatar_path: avatarPath } : {}) })
    .eq("id", auth.user.id)
    .select("id")
    .maybeSingle();
  if (profileUpdate.error || !profileUpdate.data) {
    if (avatarPath) await admin.storage.from("avatars").remove([avatarPath]);
    console.error("Onboarding profile update failed", profileUpdate.error?.code ?? "no row updated");
    return NextResponse.json({ error: "Não foi possível salvar o perfil. Confira as configurações do Supabase e tente novamente." }, { status: 502 });
  }

  const { error: accountUpdateError } = await admin.auth.admin.updateUserById(auth.user.id, {
    password,
    user_metadata: { ...verified.user.user_metadata, full_name: fullName },
    app_metadata: { ...verified.user.app_metadata, onboarding_completed: true },
  });
  if (accountUpdateError) {
    await admin.from("profiles").update({ full_name: profile.full_name, is_allowed: false, avatar_path: profile.avatar_path }).eq("id", auth.user.id);
    if (avatarPath) await admin.storage.from("avatars").remove([avatarPath]);
    console.error("Onboarding account update failed", accountUpdateError.name);
    return NextResponse.json({ error: "Não foi possível concluir a conta. Seus dados foram mantidos; tente novamente." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, message: "Perfil configurado." });
}
