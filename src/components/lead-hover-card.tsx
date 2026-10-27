"use client";

import { Globe2, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Card } from "@/components/ui/card";
import { WhatsAppMark } from "@/components/whatsapp-mark";
import type { Lead } from "@/lib/crm-types";

export type LeadPreviewKind = "lead" | "maps" | "site" | "whatsapp";

export type LeadPreview = {
  lead: Lead;
  kind: LeadPreviewKind;
  left: number;
  top: number;
};

function siteUrl(website: string | null | undefined) {
  if (!website) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function LeadPhoto({ lead, initials }: { lead: Lead; initials: string }) {
  const photoKey = lead.foto_ref ?? lead.place_id;
  const [failedKey, setFailedKey] = useState<string | null>(null);
  if (!photoKey || failedKey === photoKey) return <span className="lead-hover-card-initials">{initials || "—"}</span>;
  const source = lead.foto_ref ? `ref=${encodeURIComponent(lead.foto_ref)}` : `placeId=${encodeURIComponent(lead.place_id!)}`;
  return <img className="lead-hover-card-photo" src={`/api/lead-photo?${source}&size=card`} alt="" width={320} height={180} onError={() => setFailedKey(photoKey)} />;
}

function SitePreview({ website, domain }: { website: string | null | undefined; domain: string | null }) {
  const url = siteUrl(website);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || failedUrl === url.href) return <div className="lead-hover-card-site"><Globe2 size={38} strokeWidth={1.2} /><span>{domain || "Prévia indisponível"}</span></div>;
  const screenshot = `https://image.thum.io/get/width/600/crop/430/noanimate/maxAge/168/?url=${encodeURIComponent(url.href)}`;
  return <img className="lead-hover-card-photo lead-hover-card-site-image" src={screenshot} alt="" width={320} height={180} referrerPolicy="no-referrer" onError={() => setFailedUrl(url.href)} />;
}

export function LeadHoverCard({ preview }: { preview: LeadPreview }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { lead, kind } = preview;
  const initials = lead.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("pt-BR");
  const domain = siteUrl(lead.website)?.hostname.replace(/^www\./, "") ?? null;
  const title = kind === "lead" ? lead.name : kind === "maps" ? "Mapa" : kind === "site" ? "Site" : "WhatsApp";
  const subtitle = kind === "lead" ? [lead.cidade, lead.uf].filter(Boolean).join(" - ") || "Localização não informada" : kind === "maps" ? lead.address || "Endereço não informado" : kind === "site" ? domain || "Site não informado" : lead.phone || "Telefone não informado";
  const mapQuery = [lead.name, lead.address].filter(Boolean).join(" ");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !cardRef.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const card = cardRef.current;
        if (!card) return;
        const bounds = card.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2)));
        const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2)));
        card.style.setProperty("--preview-x", `${(x * 5).toFixed(1)}px`);
        card.style.setProperty("--preview-y", `${(y * 5).toFixed(1)}px`);
        card.style.setProperty("--preview-rotate-x", `${(-y * 2).toFixed(1)}deg`);
        card.style.setProperty("--preview-rotate-y", `${(x * 2).toFixed(1)}deg`);
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => { window.removeEventListener("pointermove", move); cancelAnimationFrame(frame); };
  }, []);

  return <Card ref={cardRef} aria-hidden="true" className="lead-hover-card" style={{ left: preview.left, top: preview.top }}>
    <div className={`lead-hover-card-media lead-hover-card-media-${kind}`}>
      {kind === "maps" && mapQuery ? <iframe title={`Mapa de ${lead.name}`} src={`https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`} loading="lazy" referrerPolicy="no-referrer" tabIndex={-1} /> : null}
      {kind === "maps" && !mapQuery ? <MapPin size={42} strokeWidth={1.3} /> : null}
      {kind === "site" ? <SitePreview website={lead.website} domain={domain} /> : null}
      {kind === "whatsapp" ? <WhatsAppMark size={52} /> : null}
      {kind === "lead" ? <LeadPhoto lead={lead} initials={initials} /> : null}
    </div>
    <div className="lead-hover-card-caption"><strong>{title}</strong><span>{subtitle}</span></div>
  </Card>;
}
