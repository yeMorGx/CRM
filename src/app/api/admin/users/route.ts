import { NextResponse } from "next/server";
import { Resend } from "resend";

import { isSameOriginMutation, listManagedUsers, requireUserAdmin } from "@/lib/admin-users";

export async function GET() {
  const access = await requireUserAdmin();
  if ("error" in access) return access.error;
  const { users, error } = await listManagedUsers(access.admin);
  if (error || !users) return NextResponse.json({ error: "Não foi possível listar os usuários." }, { status: 502 });
  return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Origem da solicitação não autorizada." }, { status: 403 });
  const access = await requireUserAdmin();
  if ("error" in access) return access.error;

  const body = await request.json().catch(() => null) as { email?: unknown; method?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const method = body?.method === "code" ? "code" : body?.method === "email" ? "email" : null;
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !method) {
    return NextResponse.json({ error: "Informe um e-mail válido e escolha como enviar o convite." }, { status: 400 });
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  const resendFrom = process.env.RESEND_FROM_EMAIL?.trim();
  if (method === "email" && (!resendKey || !resendFrom)) {
    return NextResponse.json({ error: "O envio por e-mail precisa de um remetente de domínio verificado no Resend (RESEND_FROM_EMAIL). Enquanto isso, escolha gerar um código para compartilhar." }, { status: 503 });
  }

  const { data: invitation, error: inviteError } = await access.admin.auth.admin.generateLink({
    type: "invite",
    email,
  });
  if (inviteError || !invitation.user) {
    const alreadyExists = /already|exists|registered/i.test(inviteError?.message ?? "");
    return NextResponse.json({
      error: alreadyExists
        ? "Este e-mail já tem uma conta no Prospecta. Confira a lista de usuários antes de criar outro convite."
        : "Não foi possível preparar o convite. Confira o e-mail e tente novamente.",
    }, { status: alreadyExists ? 409 : 502 });
  }

  const newUser = invitation.user;
  const { error: metadataError } = await access.admin.auth.admin.updateUserById(newUser.id, {
    app_metadata: { ...newUser.app_metadata, onboarding_completed: false },
  });
  if (metadataError) {
    await access.admin.auth.admin.deleteUser(newUser.id);
    return NextResponse.json({ error: "Não foi possível preparar a conta para o primeiro acesso." }, { status: 502 });
  }

  const { error: profileError } = await access.admin.from("profiles").upsert({
    id: newUser.id,
    email,
    full_name: "Aguardando primeiro acesso",
    is_allowed: false,
  }, { onConflict: "id" });
  if (profileError) {
    await access.admin.auth.admin.deleteUser(newUser.id);
    return NextResponse.json({ error: "Não foi possível preparar o perfil do convite. Tente novamente." }, { status: 502 });
  }

  if (method === "code") {
    const inviteUrl = new URL("/accept-invite", new URL(request.url).origin).toString();
    return NextResponse.json({ ok: true, method, email, invite_code: invitation.properties.email_otp, invite_url: inviteUrl, message: "Código de convite criado. Compartilhe-o diretamente com a pessoa." }, { status: 201 });
  }

  const inviteLink = new URL("/auth/confirm?next=%2Fonboarding", new URL(request.url).origin);
  inviteLink.searchParams.set("token_hash", invitation.properties.hashed_token);
  inviteLink.searchParams.set("type", "invite");
  const { data: sent, error: sendError } = await new Resend(resendKey!).emails.send({
    from: resendFrom!,
    to: [email],
    subject: "Seu convite para o Prospecta",
    text: `Você foi convidado para acessar o Prospecta. Abra este link para confirmar seu e-mail e configurar sua conta: ${inviteLink.toString()}`,
    html: `<div style="margin:0;background:#0a0b0b;padding:40px 20px;color:#f0f2ed;font-family:Arial,sans-serif"><div style="max-width:520px;margin:0 auto;padding:32px;border:1px solid #2c302b;border-radius:18px;background:#151616"><p style="margin:0 0 22px;color:#a8b09f;font-size:12px;letter-spacing:.14em;text-transform:uppercase">Prospecta</p><h1 style="margin:0 0 12px;font-size:25px;font-weight:600">Você foi convidado</h1><p style="margin:0 0 26px;color:#b8beb5;font-size:14px;line-height:1.65">Confirme seu e-mail e configure seu acesso ao CRM para começar.</p><a href="${inviteLink.toString()}" style="display:inline-block;padding:13px 19px;border-radius:9px;background:#8ee343;color:#12160f;font-size:13px;font-weight:700;text-decoration:none">Aceitar convite</a><p style="margin:25px 0 0;color:#858c82;font-size:11px;line-height:1.6">Se você não esperava este convite, pode ignorar esta mensagem.</p></div></div>`,
  });
  if (sendError || !sent) {
    console.error("Resend invitation email failed", sendError?.name ?? "unknown error");
    const { error: cleanupError } = await access.admin.auth.admin.deleteUser(newUser.id);
    if (cleanupError) console.error("Could not remove unsent pending invitation", cleanupError.name);
    return NextResponse.json({ error: "O Resend não conseguiu entregar o convite. Confira o domínio verificado e o remetente configurado; a conta temporária foi removida quando possível." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, method, message: "Convite enviado por e-mail." }, { status: 201 });
}
