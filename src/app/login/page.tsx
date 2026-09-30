"use client";

import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { LabelInput } from "@/components/label-input";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!supabase) {
      setError("O login ainda não está configurado. Adicione as variáveis do Supabase na Vercel.");
      return;
    }

    setIsLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("E-mail ou senha inválidos. Use um dos usuários autorizados.");
      setIsLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return <AuthShell kicker="Acesso privado" title="Entrar no Prospecta" description="Continue acompanhando seus leads e decisões comerciais.">
    <form className="login-form" onSubmit={handleSubmit}>
      <LabelInput field="Email" id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" autoComplete="email" required corner={14} />
      <LabelInput field="Password" id="password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" autoComplete="current-password" required corner={14} trailing={<button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>} />
      <div className="auth-form-link-row"><Link className="auth-text-link" href="/forgot-password">Esqueci minha senha</Link></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="login-submit" type="submit" disabled={isLoading}>{isLoading ? "Entrando..." : "Entrar"}<ArrowRight size={17} /></button>
    </form>
  </AuthShell>;
}
