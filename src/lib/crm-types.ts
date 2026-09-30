export type LeadStatus = "novo" | "contatado" | "qualificado" | "fechado";

export type Lead = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  address: string;
  website?: string | null;
  source: string;
  status: LeadStatus;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export const stages: Array<{
  slug: LeadStatus;
  name: string;
  color: string;
}> = [
  { slug: "novo", name: "Novo", color: "#89958e" },
  { slug: "contatado", name: "Contatado", color: "#d7aa4a" },
  { slug: "qualificado", name: "Qualificado", color: "#5b8e77" },
  { slug: "fechado", name: "Fechado", color: "#d86b42" },
];
