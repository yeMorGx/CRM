"use client";

import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import Image from "next/image";

export function AuthShell({
  kicker,
  title,
  description,
  children,
}: {
  kicker: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return <main className="login-page">
    <section className="login-card" aria-label={title}>
      <div className="login-visual">
        <video className="login-visual-video" autoPlay muted loop playsInline preload="metadata" poster="/login-hero.png" aria-label="Animação abstrata do Prospecta">
          <source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_031045_0e1165dd-ab48-46e3-ad3d-5fe77f217647.mp4" type="video/mp4" />
        </video>
        <div className="login-visual-shade" />
        <div className="login-visual-brand"><Image className="login-brand-logo" src="/prospecta-logo.svg" alt="" aria-hidden="true" width={42} height={17} /><span>Prospecta</span></div>
        <div className="login-visual-copy"><p>Clareza para cada próxima conversa.</p><span>Seu pipeline, em um só lugar.</span></div>
      </div>
      <div className="login-panel">
        <div className="login-panel-intro"><p className="login-kicker">{kicker}</p><h1>{title}</h1><p>{description}</p></div>
        {children}
        <div className="login-footer"><LockKeyhole size={14} /><span>Acesso restrito a usuários autorizados.</span></div>
        <p className="login-legal">Ao continuar, você concorda com os termos de uso e a política de privacidade.</p>
      </div>
    </section>
  </main>;
}
