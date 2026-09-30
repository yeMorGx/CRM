import { Resend } from "resend";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function formatEmailHtml(message: string) {
  return message.split(/\n{2,}/).map((paragraph) =>
    `<p style="margin:0 0 16px;line-height:1.65">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
  ).join("");
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ message: "Origem da solicitação inválida." }, { status: 403 });
  }

  const supabase = await createClient();
  if (!supabase) return Response.json({ message: "O Supabase não está configurado." }, { status: 503 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ message: "Entre novamente para enviar e-mails." }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: "Os dados do e-mail estão inválidos." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return Response.json({ message: "Os dados do e-mail estão inválidos." }, { status: 400 });
  }
  const { leadId, subject, body } = payload as Record<string, unknown>;
  if (typeof leadId !== "string" || !leadId || typeof subject !== "string" || typeof body !== "string") {
    return Response.json({ message: "Preencha o assunto e a mensagem." }, { status: 400 });
  }
  const normalizedSubject = subject.trim();
  const normalizedBody = body.trim();
  if (!normalizedSubject || normalizedSubject.length > 180 || /[\r\n]/.test(normalizedSubject)) {
    return Response.json({ message: "O assunto precisa ter até 180 caracteres." }, { status: 400 });
  }
  if (!normalizedBody || normalizedBody.length > 4000) {
    return Response.json({ message: "A mensagem precisa ter até 4.000 caracteres." }, { status: 400 });
  }

  const { data: lead, error: leadError } = await supabase.from("leads")
    .select("id,name,email")
    .eq("id", leadId)
    .maybeSingle();
  if (leadError) return Response.json({ message: "Não foi possível consultar este lead." }, { status: 500 });
  if (!lead || !lead.email) return Response.json({ message: "Cadastre um e-mail válido no lead antes de enviar." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    return Response.json({ message: "O e-mail salvo neste lead parece inválido." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return Response.json({ message: "Configure RESEND_API_KEY e RESEND_FROM_EMAIL no ambiente da Vercel." }, { status: 503 });
  }

  const { data: sent, error: sendError } = await new Resend(apiKey).emails.send({
    from,
    to: [lead.email],
    replyTo: user.email || undefined,
    subject: normalizedSubject,
    text: normalizedBody,
    html: formatEmailHtml(normalizedBody),
  });
  if (sendError || !sent) {
    console.error("Resend could not send an email", sendError?.name ?? "unknown error");
    return Response.json({ message: "O Resend não conseguiu enviar este e-mail. Confira o remetente verificado e a chave da API." }, { status: 502 });
  }

  const activityContent = `Para: ${lead.email}\nAssunto: ${normalizedSubject}\n\n${normalizedBody}`;
  const { data: activity, error: activityError } = await supabase.from("activities")
    .insert({ lead_id: lead.id, user_id: user.id, type: "email", content: activityContent })
    .select("id,type,content,created_at")
    .single();

  return Response.json({
    message: "E-mail enviado.",
    activity: activityError ? null : activity,
  });
}
