"use client";

import { Globe2, MapPin } from "lucide-react";

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

function siteDomain(website: string | null | undefined) {
  if (!website) return null;
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, "");
  } catch {
    return website;
  }
}

export function LeadHoverCard({ preview }: { preview: LeadPreview }) {
  const { lead, kind } = preview;
  const initials = lead.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("pt-BR");
  const domain = siteDomain(lead.website);
  const title = kind === "lead" ? lead.name : kind === "maps" ? "Mapa" : kind === "site" ? "Site" : "WhatsApp";
  const subtitle = kind === "lead" ? [lead.cidade, lead.uf].filter(Boolean).join(" - ") || "Localização não informada" : kind === "maps" ? lead.address || "Endereço não informado" : kind === "site" ? domain || "Site não informado" : lead.phone || "Telefone não informado";
  const mapQuery = [lead.name, lead.address].filter(Boolean).join(" ");

  return <Card aria-hidden="true" className="lead-hover-card" style={{ left: preview.left, top: preview.top }}>
    <div className={`lead-hover-card-media lead-hover-card-media-${kind}`}>
      {kind === "maps" && mapQuery ? <iframe title={`Mapa de ${lead.name}`} src={`https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`} loading="lazy" referrerPolicy="no-referrer" tabIndex={-1} /> : null}
      {kind === "maps" && !mapQuery ? <MapPin size={60} strokeWidth={1.3} /> : null}
      {kind === "site" ? <div className="lead-hover-card-site"><Globe2 size={54} strokeWidth={1.2} /><span>{domain}</span></div> : null}
      {kind === "whatsapp" ? <WhatsAppMark size={72} /> : null}
      {kind === "lead" ? <span className="lead-hover-card-initials">{initials || "—"}</span> : null}
    </div>
    <div className="lead-hover-card-caption"><strong>{title}</strong><span>{subtitle}</span></div>
  </Card>;
}
