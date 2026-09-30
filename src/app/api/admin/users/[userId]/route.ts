import { NextResponse } from "next/server";

import { isBootstrapAdmin, isSameOriginMutation, listManagedUsers, requireUserAdmin } from "@/lib/admin-users";

type UserPatch = { full_name?: unknown; role?: unknown; is_allowed?: unknown };

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Origem da solicitação não autorizada." }, { status: 403 });
  const access = await requireUserAdmin();
  if ("error" in access) return access.error;
  const { userId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });

  const body = await request.json().catch(() => null) as UserPatch | null;
  if (!body || (body.full_name === undefined && body.role === undefined && body.is_allowed === undefined)) {
    return NextResponse.json({ error: "Nenhuma alteração foi informada." }, { status: 400 });
  }
  if (body.full_name !== undefined && (typeof body.full_name !== "string" || !body.full_name.trim() || body.full_name.trim().length > 100)) {
    return NextResponse.json({ error: "Informe um nome válido, com até 100 caracteres." }, { status: 400 });
  }
  if (body.role !== undefined && body.role !== "admin" && body.role !== "member") {
    return NextResponse.json({ error: "Privilégio inválido." }, { status: 400 });
  }
  if (body.is_allowed !== undefined && typeof body.is_allowed !== "boolean") {
    return NextResponse.json({ error: "Estado de acesso inválido." }, { status: 400 });
  }

  const { data: target, error: targetError } = await access.admin.auth.admin.getUserById(userId);
  if (targetError || !target.user) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  if (target.user.app_metadata?.onboarding_completed === false && body.is_allowed === true) {
    return NextResponse.json({ error: "O usuário só recebe acesso ao CRM depois de concluir o primeiro acesso." }, { status: 409 });
  }
  const currentIsAdmin = target.user.app_metadata?.crm_role === "admin" || isBootstrapAdmin(target.user.email);
  const desiredRole = isBootstrapAdmin(target.user.email) ? "admin" : (body.role as "admin" | "member" | undefined) ?? (currentIsAdmin ? "admin" : "member");
  const desiredAllowed = body.is_allowed === undefined ? undefined : body.is_allowed;
  if (desiredRole === "admin" && desiredAllowed === false) {
    return NextResponse.json({ error: "Um administrador precisa permanecer com acesso ativo." }, { status: 400 });
  }
  if (target.user.id === access.user.id && (desiredRole !== "admin" || desiredAllowed === false)) {
    return NextResponse.json({ error: "Você não pode remover seu próprio acesso administrativo." }, { status: 400 });
  }

  const { users, error: listError } = await listManagedUsers(access.admin);
  if (listError || !users) return NextResponse.json({ error: "Não foi possível conferir os privilégios atuais." }, { status: 502 });
  const currentAdmin = users.find((user) => user.id === userId);
  const willRemainAdmin = desiredRole === "admin" && desiredAllowed !== false && (currentAdmin?.is_allowed ?? false);
  const removesActiveAdmin = currentAdmin?.is_allowed && currentAdmin.role === "admin" && !willRemainAdmin;
  const activeAdminCount = users.filter((user) => user.is_allowed && user.role === "admin").length;
  if (removesActiveAdmin && activeAdminCount <= 1) {
    return NextResponse.json({ error: "O CRM precisa manter pelo menos um administrador ativo." }, { status: 409 });
  }

  const { data: oldProfile, error: profileReadError } = await access.admin.from("profiles")
    .select("id,full_name,is_allowed")
    .eq("id", userId)
    .maybeSingle();
  if (profileReadError || !oldProfile) return NextResponse.json({ error: "O perfil do usuário não foi encontrado." }, { status: 404 });

  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : oldProfile.full_name;
  const isAllowed = desiredAllowed ?? oldProfile.is_allowed;
  const { error: profileUpdateError } = await access.admin.from("profiles")
    .update({ full_name: fullName, is_allowed: isAllowed })
    .eq("id", userId);
  if (profileUpdateError) return NextResponse.json({ error: "Não foi possível salvar as informações do usuário." }, { status: 502 });

  const oldRole = target.user.app_metadata?.crm_role;
  if (!isBootstrapAdmin(target.user.email) && desiredRole !== (oldRole === "admin" ? "admin" : "member")) {
    const appMetadata = { ...target.user.app_metadata };
    if (desiredRole === "admin") appMetadata.crm_role = "admin";
    else delete appMetadata.crm_role;
    const { error: roleError } = await access.admin.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
    if (roleError) {
      await access.admin.from("profiles").update({ full_name: oldProfile.full_name, is_allowed: oldProfile.is_allowed }).eq("id", userId);
      return NextResponse.json({ error: "Não foi possível atualizar o privilégio; as demais alterações foram revertidas." }, { status: 502 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ userId: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Origem da solicitação não autorizada." }, { status: 403 });
  const access = await requireUserAdmin();
  if ("error" in access) return access.error;
  const { userId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
  if (userId === access.user.id) return NextResponse.json({ error: "Por segurança, não é possível apagar sua própria conta por aqui." }, { status: 400 });

  const { data: target, error: targetError } = await access.admin.auth.admin.getUserById(userId);
  if (targetError || !target.user) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  if (isBootstrapAdmin(target.user.email)) return NextResponse.json({ error: "A conta administradora inicial não pode ser apagada por esta tela." }, { status: 400 });

  const { users, error: listError } = await listManagedUsers(access.admin);
  if (listError || !users) return NextResponse.json({ error: "Não foi possível conferir os privilégios atuais." }, { status: 502 });
  const current = users.find((user) => user.id === userId);
  if (current?.is_allowed && current.role === "admin" && users.filter((user) => user.is_allowed && user.role === "admin").length <= 1) {
    return NextResponse.json({ error: "O CRM precisa manter pelo menos um administrador ativo." }, { status: 409 });
  }

  const { error } = await access.admin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: "Não foi possível apagar o usuário." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
