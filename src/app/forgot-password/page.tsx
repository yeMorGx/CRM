"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { LabelInput } from "@/components/label-input";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSent(false);
    if (!supabase) {
      setError("A autenticação do Supabase ainda não está configurada.");
      return;
    }
    setIsSending(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    });
    setIsSending(false);
    if (resetError) {
      setError("Não foi possível solicitar a recuperação agora. Tente novamente em alguns minutos.");
      return;
    }
    setSent(true);
  }

  return <AuthShell kicker="Recuperar acesso" title="Redefinir senha" description="Informe o e-mail da sua conta para receber um link seguro de recuperação.">
    {sent ? <div className="auth-reset-success" role="status"><strong>Confira sua caixa de entrada</strong><p>Se houver uma conta autorizada com esse endereço, enviaremos as instruções para redefinir a senha.</p><Link className="auth-text-link" href="/login">Voltar para o login</Link></div> : <form className="login-form" onSubmit={requestReset}>
      <LabelInput field="Email" id="recovery-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" autoComplete="email" required corner={14} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="login-submit" type="submit" disabled={isSending}>{isSending ? "Enviando..." : "Enviar link de recuperação"}<ArrowRight size={17} /></button>
      <div className="auth-form-link-row"><Link className="auth-text-link" href="/login">Voltar para o login</Link></div>
    </form>}
  </AuthShell>;
}
