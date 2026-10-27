"use client";

import { ArrowRight, KeyRound, LoaderCircle, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { LabelInput } from "@/components/label-input";
import { createClient } from "@/lib/supabase/client";

export function AcceptInvite({ initialEmail = "" }: { initialEmail?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!supabase) {
      setError("O acesso ainda não está configurado. Avise o administrador do Prospecta.");
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.replace(/\s/g, "");
    if (!normalizedEmail || !/^\d{6,12}$/.test(normalizedCode)) {
      setError("Confira o e-mail e informe o código recebido do administrador.");
      return;
    }

    setSubmitting(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedCode,
      type: "invite",
    });
    if (verifyError) {
      setError("Esse código não é válido ou já expirou. Peça um novo ao administrador e tente novamente.");
      setSubmitting(false);
      return;
    }
    router.replace("/onboarding");
    router.refresh();
  }

  return <AuthShell kicker="Convite do Prospecta" title="Aceitar convite" description="Informe o código do convite para confirmar seu e-mail e configurar sua conta.">
    <form className="login-form accept-invite-form" onSubmit={accept}>
      {email ? <p className="invite-code-hint"><Mail size={14} />Convite enviado para <strong>{email}</strong></p> : <LabelInput field="Email" id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" autoComplete="email" required corner={14} />}
      <label className="invite-code-field" htmlFor="invite-code"><span>Código de convite</span><input id="invite-code" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="Digite o código" maxLength={12} required /></label>
      <p className="invite-code-hint"><KeyRound size={14} />O código é de uso único. Depois da validação, confirme o e-mail para continuar.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="login-submit" type="submit" disabled={submitting}>{submitting ? <><LoaderCircle size={16} className="invite-spinner" />Validando código…</> : <>Continuar<ArrowRight size={17} /></>}</button>
    </form>
  </AuthShell>;
}
