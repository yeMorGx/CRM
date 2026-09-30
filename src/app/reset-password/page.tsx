"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { LabelInput } from "@/components/label-input";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isCheckingLink, setIsCheckingLink] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function checkSession() {
      if (!supabase) {
        setError("A autenticação do Supabase ainda não está configurada.");
        setIsCheckingLink(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (active && data.session) setHasRecoverySession(true);
      if (active) setIsCheckingLink(false);
    }
    void checkSession();
    if (!supabase) return () => { active = false; };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && event === "PASSWORD_RECOVERY" && session) setHasRecoverySession(true);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [supabase]);

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Use uma senha com pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    if (!supabase) return;
    setIsSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsSaving(false);
    if (updateError) {
      setError("Não foi possível atualizar a senha. Solicite um novo link de recuperação.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  const description = isCheckingLink
    ? "Estamos validando o link de recuperação."
    : hasRecoverySession
      ? "Escolha uma nova senha para acessar o Prospecta."
      : "Este link expirou ou já foi usado. Solicite um novo link para continuar.";

  return <AuthShell kicker="Segurança da conta" title="Criar nova senha" description={description}>
    {isCheckingLink ? <p className="auth-reset-wait" role="status">Validando seu link...</p> : hasRecoverySession ? <form className="login-form" onSubmit={savePassword}>
      <LabelInput field="Password" id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" autoComplete="new-password" required corner={14} />
      <LabelInput field="Password" id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Digite a senha novamente" autoComplete="new-password" required corner={14} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="login-submit" type="submit" disabled={isSaving}>{isSaving ? "Salvando..." : "Salvar nova senha"}<ArrowRight size={17} /></button>
    </form> : <div className="auth-reset-success"><p>{error || description}</p><Link className="auth-text-link" href="/forgot-password">Solicitar outro link</Link></div>}
  </AuthShell>;
}
