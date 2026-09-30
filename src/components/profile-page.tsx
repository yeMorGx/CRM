"use client";

import { ArrowRight, Camera, Check, LoaderCircle, LogOut, Mail, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import AnimatedGradient from "@/components/animated-gradient";
import { createClient } from "@/lib/supabase/client";

export type Profile = {
  id: string;
  full_name: string;
  avatar_color: string;
  avatar_path: string | null;
  avatar_storage_ready: boolean;
  avatar_url?: string | null;
  created_at: string;
};

const avatarColors = ["#8ee343", "#d9e8cc", "#93b8ff", "#e5a86f", "#b8a1f5", "#e98c9b", "#d86b42"];
const avatarBucket = "avatars";
const avatarMaxSize = 5 * 1024 * 1024;
const avatarMimeTypes = ["image/jpeg", "image/png", "image/webp"];
function profileGradientConfig(color: string) {
  const { r, g, b } = parseHexColor(color);
  const darkColor = toHex(r * 0.24, g * 0.24, b * 0.24);
  const deepColor = toHex(r * 0.1, g * 0.1, b * 0.1);
  return {
  preset: "custom",
  color1: deepColor,
  color2: color,
  color3: darkColor,
  rotation: -36,
  proportion: 39,
  scale: 0.42,
  speed: 12,
  distortion: 5,
  swirl: 48,
  swirlIterations: 10,
  softness: 88,
  offset: -160,
  shape: "Checks",
  shapeSize: 25,
  } as const;
}

function parseHexColor(hex: string) {
  const value = hex.replace(/^#/, "");
  const normalized = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  const safeHex = /^[\da-f]{6}$/i.test(normalized) ? normalized : "8ee343";
  return {
    r: Number.parseInt(safeHex.slice(0, 2), 16),
    g: Number.parseInt(safeHex.slice(2, 4), 16),
    b: Number.parseInt(safeHex.slice(4, 6), 16),
  };
}

function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

export function ProfilePage({ profile, email, onSaved, onSignOut }: {
  profile: Profile | null;
  email?: string;
  onSaved: (profile: Profile) => void;
  onSignOut: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState(profile?.full_name ?? "");
  const [avatarColor, setAvatarColor] = useState(profile?.avatar_color ?? avatarColors[0]);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const avatarDialog = useRef<HTMLDialogElement>(null);
  const colorOptions = profile?.avatar_color && !avatarColors.includes(profile.avatar_color)
    ? [profile.avatar_color, ...avatarColors]
    : avatarColors;
  const normalizedName = name.trim().replace(/\s+/g, " ");
  const hasChanges = Boolean(profile && (normalizedName !== profile.full_name || avatarColor !== profile.avatar_color));
  const joinedOn = profile?.created_at && !Number.isNaN(new Date(profile.created_at).getTime())
    ? new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(profile.created_at))
    : null;

  useEffect(() => {
    const dialog = avatarDialog.current;
    if (!dialog) return;
    if (avatarModalOpen && !dialog.open) dialog.showModal();
    if (!avatarModalOpen && dialog.open) dialog.close();
  }, [avatarModalOpen]);

  async function openAvatarModal() {
    setError("");
    setMessage("");
    setAvatarModalOpen(true);
    if (!profile?.avatar_path || !supabase || !profile.avatar_storage_ready) return;
    const { data, error: signedUrlError } = await supabase.storage.from(avatarBucket).createSignedUrl(profile.avatar_path, 60 * 60);
    if (!signedUrlError && data?.signedUrl) onSaved({ ...profile, avatar_url: data.signedUrl });
  }

  async function reloadProfile() {
    if (!supabase) return;
    setReloading(true);
    setError("");
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      setError("Sua sessão expirou. Entre novamente para ver o perfil.");
      setReloading(false);
      return;
    }
    const canLoadAvatar = profile?.avatar_storage_ready ?? false;
    const profileQuery = canLoadAvatar
      ? await supabase.from("profiles").select("id,full_name,avatar_color,avatar_path,created_at").eq("id", auth.user.id).maybeSingle()
      : await supabase.from("profiles").select("id,full_name,avatar_color,created_at").eq("id", auth.user.id).maybeSingle();
    const profileFallback = profileQuery.error && canLoadAvatar
      ? await supabase.from("profiles").select("id,full_name,avatar_color,created_at").eq("id", auth.user.id).maybeSingle()
      : null;
    const rawProfile = profileQuery.error ? profileFallback?.data : profileQuery.data;
    const avatarStorageReady = canLoadAvatar && !profileQuery.error;
    const data = rawProfile
      ? { ...rawProfile, avatar_path: avatarStorageReady ? (rawProfile as unknown as { avatar_path: string | null }).avatar_path : null, avatar_storage_ready: avatarStorageReady } as Profile
      : null;
    const profileError = profileQuery.error && !profileFallback?.data ? profileQuery.error : null;
    if (profileError || !data) {
      setError("Não foi possível carregar seu perfil. Tente novamente ou confira seu acesso.");
    } else {
      const { data: signedAvatar } = data.avatar_path
        ? await supabase.storage.from(avatarBucket).createSignedUrl(data.avatar_path, 60 * 60)
        : { data: null };
      const updatedProfile = { ...data, avatar_url: signedAvatar?.signedUrl ?? null } as Profile;
      onSaved(updatedProfile);
      setName(data.full_name);
      setAvatarColor(data.avatar_color);
    }
    setReloading(false);
  }

  async function changeAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    setError("");
    setMessage("");
    if (!file || !profile || !supabase) return;
    if (!profile.avatar_storage_ready) {
      setError("O armazenamento de fotos ainda não está configurado neste projeto.");
      return;
    }
    if (!avatarMimeTypes.includes(file.type)) {
      setError("Escolha uma imagem JPG, PNG ou WebP.");
      return;
    }
    if (file.size > avatarMaxSize) {
      setError("A imagem precisa ter no máximo 5 MB.");
      return;
    }

    setUploadingAvatar(true);
    let uploadedPath: string | null = null;
    let profileUpdated = false;
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user || auth.user.id !== profile.id) {
        setError("Sua sessão não corresponde a este perfil. Entre novamente e tente outra vez.");
        return;
      }

      const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
      uploadedPath = `${auth.user.id}/profile-avatar/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from(avatarBucket).upload(uploadedPath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) {
        setError("Não foi possível enviar a imagem. Confira o bucket de avatares e tente novamente.");
        return;
      }

      const { data, error: updateError } = await supabase.from("profiles")
        .update({ avatar_path: uploadedPath })
        .eq("id", auth.user.id)
        .select("id,full_name,avatar_color,avatar_path,created_at")
        .single();
      if (updateError || !data) {
        await supabase.storage.from(avatarBucket).remove([uploadedPath]);
        uploadedPath = null;
        setError("A imagem foi enviada, mas não foi possível salvá-la no perfil. Confira a permissão de avatar.");
        return;
      }
      profileUpdated = true;

      const [{ data: signedAvatar }, cleanup] = await Promise.all([
        supabase.storage.from(avatarBucket).createSignedUrl(uploadedPath, 60 * 60),
        profile.avatar_path
          ? supabase.storage.from(avatarBucket).remove([profile.avatar_path])
          : Promise.resolve({ error: null }),
      ]);
      onSaved({ ...data, avatar_url: signedAvatar?.signedUrl ?? null } as Profile);
      setMessage(cleanup.error ? "Foto atualizada. A imagem anterior não pôde ser removida." : "Foto de perfil atualizada.");
    } catch {
      if (uploadedPath && !profileUpdated) {
        await supabase.storage.from(avatarBucket).remove([uploadedPath]);
      }
      setError("Ocorreu um erro ao atualizar a foto. Tente novamente.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!profile || !supabase) return;
    if (normalizedName.length < 2 || normalizedName.length > 80) {
      setError("Use um nome com 2 a 80 caracteres.");
      return;
    }
    setSaving(true);
    const profileUpdate = supabase.from("profiles")
      .update({ full_name: normalizedName, avatar_color: avatarColor })
      .eq("id", profile.id);
    const updateResult = profile.avatar_storage_ready
      ? await profileUpdate.select("id,full_name,avatar_color,avatar_path,created_at").single()
      : await profileUpdate.select("id,full_name,avatar_color,created_at").single();
    const data = updateResult.data as unknown as Profile | null;
    const updateError = updateResult.error;
    setSaving(false);
    if (updateError || !data) {
      setError("Não foi possível salvar. Tente novamente; se persistir, confira a permissão de edição do perfil.");
      return;
    }
    onSaved({
      ...data,
      avatar_path: profile.avatar_storage_ready ? data.avatar_path : profile.avatar_path,
      avatar_storage_ready: profile.avatar_storage_ready,
      avatar_url: profile.avatar_url,
    } as Profile);
    setName(data.full_name);
    setAvatarColor(data.avatar_color);
    setMessage("Perfil atualizado com sucesso.");
  }

  return <div className="profile-page">
    <header className="profile-heading">
      <div><h1>Meu perfil</h1><p>Seu espaço para manter os dados da conta em dia.</p></div>
      <span className="profile-heading-mark"><UserRound size={21} strokeWidth={1.6} /></span>
    </header>

    {!profile ? <section className="profile-unavailable" role="status">
      <UserRound size={24} />
      <h2>Perfil indisponível</h2>
      <p>Não encontramos o cadastro associado à sua sessão. Seu acesso ao CRM não foi alterado.</p>
      {error && <p className="profile-feedback profile-feedback-error" role="alert">{error}</p>}
      <button className="secondary-button" type="button" onClick={reloadProfile} disabled={reloading}><RefreshCw size={16} />{reloading ? "Verificando..." : "Tentar novamente"}</button>
    </section> : <div className="profile-layout">
      <div className="profile-main">
        <section className="profile-identity" aria-label="Identidade da conta">
          <div className="profile-identity-animation" aria-hidden="true"><AnimatedGradient config={profileGradientConfig(avatarColor)} style={{ zIndex: 0 }} /></div>
          <div className="profile-identity-avatar-control">
            <button className="profile-identity-avatar profile-identity-avatar-trigger" type="button" style={{ backgroundColor: avatarColor }} onClick={() => { void openAvatarModal(); }} aria-label={profile.avatar_path ? "Ver ou trocar foto de perfil" : "Adicionar foto de perfil"} aria-haspopup="dialog">
              {profile.avatar_url ? <Image src={profile.avatar_url} alt="" width={74} height={74} unoptimized /> : initials(normalizedName || profile.full_name)}
              <span className="profile-identity-avatar-hover"><Camera size={18} /><span>Alterar</span></span>
            </button>
            <input
              ref={avatarInput}
              className="profile-avatar-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Selecionar foto de perfil"
              onChange={(event) => { void changeAvatar(event); }}
            />
          </div>
          <div className="profile-identity-copy">
            <h2>{profile.full_name}</h2><p>{email || "E-mail não disponível"}</p>
          </div>
          <span className="profile-identity-status"><span /> Conta ativa</span>
        </section>

        <form className="profile-form" onSubmit={saveProfile}>
          <div className="profile-section-heading"><div><h2>Informações pessoais</h2><p>O nome e a cor do avatar aparecem no seu perfil.</p></div></div>
          <div className="profile-fields">
            <label className="profile-field"><span>Nome completo</span><input name="full_name" autoComplete="name" value={name} onChange={(event) => { setName(event.target.value); setMessage(""); }} maxLength={80} required placeholder="Seu nome" /></label>
            <label className="profile-field"><span>E-mail de acesso</span><div className="profile-readonly-field"><Mail size={17} /><input type="email" value={email ?? ""} readOnly aria-describedby="profile-email-hint" /></div><small id="profile-email-hint">Para alterar o e-mail de acesso, entre em contato com o administrador.</small></label>
          </div>
          <fieldset className="profile-avatar-field"><legend>Cor do avatar</legend><p>Escolha como você aparece no CRM.</p><div className="profile-color-options">{colorOptions.map((color, index) => <button key={color} type="button" className={`profile-color-option ${avatarColor === color ? "profile-color-selected" : ""}`} style={{ backgroundColor: color }} title={`Cor ${index + 1}`} aria-label={`Cor do avatar ${index + 1}`} aria-pressed={avatarColor === color} onClick={() => { setAvatarColor(color); setMessage(""); }}>{avatarColor === color && <Check size={17} strokeWidth={2.5} />}</button>)}</div></fieldset>
          {error && <p className="profile-feedback profile-feedback-error" role="alert">{error}</p>}
          {message && <p className="profile-feedback profile-feedback-success" role="status"><Check size={15} />{message}</p>}
          <div className="profile-form-footer"><span>Alterações visíveis após salvar.</span><button className="primary-button" type="submit" disabled={saving || !hasChanges}>{saving ? "Salvando..." : "Salvar alterações"}<ArrowRight size={16} /></button></div>
        </form>
      </div>

      <aside className="profile-side" aria-label="Detalhes da conta">
        <section className="profile-side-section"><div className="profile-side-icon"><ShieldCheck size={20} strokeWidth={1.7} /></div><h2>Sua conta</h2><p>O acesso ao Prospecta está vinculado a este e-mail.</p><dl><div><dt>E-mail</dt><dd>{email || "Não disponível"}</dd></div>{joinedOn && <div><dt>Perfil criado em</dt><dd>{joinedOn}</dd></div>}</dl></section>
        <section className="profile-side-section profile-session"><h2>Sessão</h2><p>Ao sair, será necessário entrar novamente para acessar seus dados.</p><button className="profile-signout" type="button" onClick={onSignOut}><LogOut size={17} /> Sair da conta <ArrowRight size={16} /></button></section>
      </aside>
    </div>}

    <dialog
      ref={avatarDialog}
      className="profile-avatar-dialog"
      aria-label="Trocar foto de perfil"
      onClose={() => setAvatarModalOpen(false)}
      onClick={(event) => { if (event.target === avatarDialog.current) setAvatarModalOpen(false); }}
    >
      <section className="profile-avatar-modal" aria-busy={uploadingAvatar}>
        <div className="profile-avatar-modal-image" style={{ backgroundColor: profile?.avatar_color ?? avatarColor }}>
          {profile?.avatar_url
            ? <Image src={profile.avatar_url} alt={`Foto atual de ${profile.full_name}`} fill sizes="(max-width: 760px) 92vw, 520px" unoptimized />
            : <span>{initials(name || profile?.full_name || "")}</span>}
        </div>
        <div className="profile-avatar-modal-panel">
          <div className="profile-avatar-modal-content">
            {error && <p className="profile-avatar-modal-feedback is-error" role="alert">{error}</p>}
            {message && <p className="profile-avatar-modal-feedback" role="status">{message}</p>}
            {profile?.avatar_storage_ready ? <>
              <button className="profile-avatar-modal-change" type="button" onClick={() => avatarInput.current?.click()} disabled={uploadingAvatar || !supabase} aria-busy={uploadingAvatar}>
                {uploadingAvatar && <LoaderCircle size={18} className="profile-avatar-spinner" />}
                {uploadingAvatar ? "Enviando foto…" : "Trocar Foto"}
              </button>
              <span className="profile-avatar-modal-hint">JPG, PNG ou WebP · até 5 MB</span>
            </> : <p className="profile-avatar-modal-feedback is-error" role="status">O armazenamento de fotos ainda não está configurado neste projeto.</p>}
          </div>
        </div>
      </section>
    </dialog>
  </div>;
}
