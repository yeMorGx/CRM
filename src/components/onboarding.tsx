"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Camera, Check, Eye, EyeOff, LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { Signature } from "@/components/signature";
import { createClient } from "@/lib/supabase/client";

const avatarMimeTypes = ["image/jpeg", "image/png", "image/webp"];
const avatarLimit = 5 * 1024 * 1024;

export function Onboarding({ email, emailVerified: initiallyEmailVerified }: { email: string; emailVerified: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [emailVerified, setEmailVerified] = useState(initiallyEmailVerified);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState<"setup" | "welcome">("setup");
  const [leaving, setLeaving] = useState(false);
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    if (emailVerified || !supabase) return;
    let active = true;
    const checkEmail = async () => {
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (active && !authError && data.user?.email_confirmed_at) setEmailVerified(true);
      } catch {
        // Keep waiting; the user can retry from the visible verification action.
      }
    };
    void checkEmail();
    const interval = window.setInterval(() => void checkEmail(), 8000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [emailVerified, supabase]);

  useEffect(() => {
    if (phase !== "welcome") return;
    const fadeTimer = window.setTimeout(() => setLeaving(true), 2650);
    const routeTimer = window.setTimeout(() => {
      router.replace("/");
      router.refresh();
    }, 3350);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(routeTimer);
    };
  }, [phase, router]);

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    setError("");
    if (!file) return;
    if (!avatarMimeTypes.includes(file.type)) {
      setError("Escolha uma imagem JPG, PNG ou WebP.");
      return;
    }
    if (file.size > avatarLimit) {
      setError("A imagem precisa ter no máximo 5 MB.");
      return;
    }
    setAvatar(file);
    setPreview(URL.createObjectURL(file));
  }

  async function checkEmailNow() {
    if (!supabase) {
      setError("Não foi possível verificar seu e-mail agora. Atualize a página e tente novamente.");
      return;
    }
    setCheckingEmail(true);
    setError("");
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user?.email_confirmed_at) {
        setError("A confirmação ainda não apareceu. Abra o link do convite e tente novamente.");
        return;
      }
      setEmailVerified(true);
    } catch {
      setError("A confirmação ainda não apareceu. Abra o link do convite e tente novamente.");
    } finally {
      setCheckingEmail(false);
    }
  }

  function continueFromName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedFullName = `${normalizedFirstName} ${normalizedLastName}`.trim();
    if (!normalizedFirstName || !normalizedLastName || normalizedFullName.length < 2 || normalizedFullName.length > 80) {
      setError("Preencha nome e sobrenome. O nome completo pode ter até 80 caracteres.");
      return;
    }
    setFirstName(normalizedFirstName);
    setLastName(normalizedLastName);
    setError("");
    setStep(2);
  }

  function continueFromPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setError("Use uma senha com pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setError("");
    setStep(3);
  }

  async function finish(includeAvatar = true) {
    setError("");
    if (!supabase) {
      setError("A autenticação não está configurada. Avise o administrador do Prospecta.");
      return;
    }
    setSaving(true);
    const body = new FormData();
    body.set("full_name", fullName);
    body.set("password", password);
    if (includeAvatar && avatar) body.set("avatar", avatar);
    try {
      const response = await fetch("/api/onboarding/complete", { method: "POST", body });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível concluir sua conta.");
      await supabase.auth.refreshSession();
      setPhase("welcome");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir sua conta. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  if (phase === "welcome") {
    return <main className={`onboarding-screen onboarding-welcome-screen ${leaving ? "is-leaving" : ""}`} aria-live="polite">
      <div className="onboarding-welcome-copy"><span>Olá,</span><Signature text={firstName.trim() || fullName} color="#6fff00" fontSize={25} duration={1.45} delay={0.15} className="onboarding-signature" /></div>
    </main>;
  }

  return <main className="onboarding-screen">
    <section className="onboarding-card" aria-label="Configuração inicial do Prospecta">
      <AnimatePresence mode="wait" initial={false}>
        <motion.section key={`${step}-${emailVerified}`} className="onboarding-step" initial={{ opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.24, ease: "easeOut" }}>
          {step === 0 && <div className="onboarding-email-step" aria-live="polite">
            {emailVerified ? <>
              <div className="onboarding-step-heading onboarding-email-heading"><h1>Obrigado, seu <span>E-mail</span> foi verificado.</h1></div>
              <div className="onboarding-status-pill is-verified"><Check size={17} strokeWidth={2.4} />Verificado!</div>
              <p className="onboarding-email-address">{email}</p>
              <div className="onboarding-actions"><button className="onboarding-primary" type="button" onClick={() => { setError(""); setStep(1); }}>Próximo</button></div>
            </> : <>
              <div className="onboarding-step-heading onboarding-email-heading"><h1>Por favor, verifique seu <span>E-mail</span>.</h1></div>
              <div className="onboarding-status-pill is-waiting"><LoaderCircle size={17} className="invite-spinner" />Aguardando...</div>
              <p className="onboarding-email-address">Enviamos a confirmação para <strong>{email}</strong>.</p>
              <button className="onboarding-check-link" type="button" onClick={() => void checkEmailNow()} disabled={checkingEmail}>{checkingEmail ? "Verificando…" : "Já confirmei meu e-mail"}</button>
              {error && <p className="onboarding-error" role="alert">{error}</p>}
            </>}
          </div>}

          {step === 1 && <form onSubmit={continueFromName}>
            <div className="onboarding-step-heading"><h1>Como vamos te chamar?</h1></div>
            <div className="onboarding-fields">
              <label className="onboarding-sr-only" htmlFor="onboarding-first-name">Nome</label>
              <input id="onboarding-first-name" className="onboarding-input" autoComplete="given-name" value={firstName} onChange={(event) => { setFirstName(event.target.value); setError(""); }} maxLength={80} placeholder="Nome" required />
              <label className="onboarding-sr-only" htmlFor="onboarding-last-name">Sobrenome</label>
              <input id="onboarding-last-name" className="onboarding-input" autoComplete="family-name" value={lastName} onChange={(event) => { setLastName(event.target.value); setError(""); }} maxLength={80} placeholder="Sobrenome" required />
            </div>
            {error && <p className="onboarding-error" role="alert">{error}</p>}
            <div className="onboarding-actions"><button className="onboarding-primary" type="submit">Próximo</button></div>
          </form>}

          {step === 2 && <form onSubmit={continueFromPassword}>
            <div className="onboarding-step-heading"><h1>Coloque uma senha <em>segura</em></h1></div>
            <div className="onboarding-fields">
              <div className="onboarding-password-field">
                <label className="onboarding-sr-only" htmlFor="onboarding-password">Senha</label>
                <input id="onboarding-password" className="onboarding-input" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} minLength={8} maxLength={128} placeholder="Senha" required />
                <button className="onboarding-password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button>
              </div>
              <div className="onboarding-password-field">
                <label className="onboarding-sr-only" htmlFor="onboarding-confirm-password">Confirme sua senha</label>
                <input id="onboarding-confirm-password" className="onboarding-input" type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError(""); }} minLength={8} maxLength={128} placeholder="Confirme sua senha" required />
              </div>
            </div>
            {error && <p className="onboarding-error" role="alert">{error}</p>}
            <div className="onboarding-actions"><button className="onboarding-primary" type="submit">Próximo</button></div>
          </form>}

          {step === 3 && <div className="onboarding-photo-step">
            <div className="onboarding-step-heading"><h1>Coloque sua <em>melhor</em> foto!</h1></div>
            <button className={`onboarding-photo-picker ${preview ? "has-photo" : ""}`} type="button" onClick={() => avatarInput.current?.click()} aria-label={avatar ? "Trocar foto de perfil" : "Escolher foto de perfil"}>
              {preview ? <Image src={preview} alt={`Prévia da foto de ${firstName}`} fill sizes="(max-width: 640px) 64vw, 321px" unoptimized /> : <Camera size={34} strokeWidth={1.35} />}
              <span className="onboarding-photo-hover"><Camera size={17} />{avatar ? "Trocar foto" : "Escolher foto"}</span>
            </button>
            <input ref={avatarInput} className="onboarding-sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAvatar} aria-label="Selecionar foto de perfil" />
            {avatar && <div className="onboarding-photo-filename"><span>{avatar.name}</span><button type="button" onClick={() => { setAvatar(null); setPreview(""); setError(""); }} aria-label="Remover foto selecionada"><X size={15} /></button></div>}
            {error && <p className="onboarding-error" role="alert">{error}</p>}
            <div className="onboarding-actions onboarding-photo-actions">
              <button className="onboarding-primary" type="button" onClick={() => { void finish(); }} disabled={saving}>{saving ? <><LoaderCircle size={18} className="invite-spinner" />Salvando…</> : "Próximo"}</button>
              <button className="onboarding-primary" type="button" onClick={() => { void finish(false); }} disabled={saving}>Agora não.</button>
            </div>
          </div>}
        </motion.section>
      </AnimatePresence>
    </section>
    <Image className="onboarding-logo" src="/prospecta-logo.svg" alt="Prospecta" width={125} height={51} priority />
  </main>;
}
