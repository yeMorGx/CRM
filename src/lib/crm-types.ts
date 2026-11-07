export type LeadStatus = "novo" | "pesquisa" | "pronto" | "contatado" | "respondeu" | "validado" | "proposta" | "qualificado" | "fechado" | "perdido" | "nutricao" | "descartado";

export type Lead = {
  open_proposal?: boolean;
  plan_name?: string | null;
  contract_status?: string | null;
  next_action_at?: string | null;
  segment?: string | null;
  service_interest?: string[];
  lead_temperature?: string | null;
  priority?: string | null;
  website_presence?: string | null;
  purchase_timeline?: string | null;
  budget_range?: string | null;
  lost_reason?: string | null;
  discard_reason?: string | null;
  estimated_value?: number | null;
  confirmed_value?: number | null;
  contact_name?: string | null;
  pain_point?: string | null;
  digital_assessment?: Record<string, string>;
  last_contact_at?: string | null;
  last_activity_at?: string | null;
  closed_at?: string | null;
  assigned_to?: string | null;
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  address: string;
  website?: string | null;
  source: string;
  place_id?: string | null;
  status: LeadStatus;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  cidade?: string | null;
  uf?: string | null;
  foto_ref?: string | null;
  foto_atribuicao?: { displayName: string; uri?: string }[] | null;
  score?: number | null;
  nota_google?: number | null;
  total_avaliacoes?: number | null;
  instagram?: string | null;
  maps_url?: string | null;
  favorito?: boolean | null;
};

export const stages: Array<{
  slug: LeadStatus;
  name: string;
  color: string;
}> = [
  { slug: "novo", name: "Novo", color: "#89958e" },
  { slug: "pesquisa", name: "Em pesquisa", color: "#89958e" },
  { slug: "pronto", name: "Pronto para contato", color: "#89958e" },
  { slug: "contatado", name: "Contatado", color: "#d7aa4a" },
  { slug: "respondeu", name: "Respondeu", color: "#d7aa4a" },
  { slug: "validado", name: "Qualificado", color: "#5b8e77" },
  { slug: "proposta", name: "Proposta enviada", color: "#5b8e77" },
  { slug: "qualificado", name: "Em negociação", color: "#5b8e77" },
  { slug: "fechado", name: "Fechado — ganho", color: "#d86b42" },
  { slug: "perdido", name: "Fechado — perdido", color: "#b67770" },
  { slug: "nutricao", name: "Nutrição", color: "#89958e" },
  { slug: "descartado", name: "Descartado", color: "var(--crm-faint)" },
];
