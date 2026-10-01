export type LeadStatus = "novo" | "contatado" | "qualificado" | "fechado" | "descartado";

export type Lead = {
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
  { slug: "contatado", name: "Contatado", color: "#d7aa4a" },
  { slug: "qualificado", name: "Em negociação", color: "#5b8e77" },
  { slug: "fechado", name: "Fechado", color: "#d86b42" },
  { slug: "descartado", name: "Descartado", color: "var(--crm-faint)" },
];
