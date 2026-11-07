export const planLimitFields = [
  ["paginas", "Páginas"],
  ["alteracoes_mes", "Alterações de conteúdo por mês"],
  ["horas_dev_mes", "Horas de desenvolvimento por mês"],
  ["backup", "Backups"],
  ["monitoramento", "Monitoramento"],
  ["suporte_h", "Resposta do suporte"],
  ["relatorio", "Relatório"],
  ["permanencia_meses", "Permanência mínima"],
] as const;

export const monthlyBreakdownFields = [
  ["hospedagem", "Hospedagem"],
  ["dominio", "Domínio"],
  ["licencas", "Licenças e ferramentas"],
  ["manutencao", "Manutenção e suporte"],
] as const;

export type PlanLimitKey = (typeof planLimitFields)[number][0];
export type MonthlyBreakdownKey = (typeof monthlyBreakdownFields)[number][0];
export type PlanLimits = Record<PlanLimitKey, string>;
export type MonthlyBreakdown = Record<MonthlyBreakdownKey, number>;

export type Plan = {
  id: string;
  name: string;
  tagline: string | null;
  sort: number;
  on_request: boolean;
  setup_price: number | null;
  monthly_price: number | null;
  setup_is_from: boolean;
  features: string[];
  limits: PlanLimits;
  monthly_breakdown: Partial<MonthlyBreakdown>;
  active: boolean;
};

export type PlanAddon = {
  id: string;
  name: string;
  description: string | null;
  kind: "once" | "monthly";
  price: number;
  unit: string | null;
  applies_to: string[];
  active: boolean;
};

export type CompanyPartner = {
  name: string;
  role: string;
  signature_path: string | null;
  signature_url?: string | null;
};

export type ClauseDefaults = {
  idx: string;
  perm: string;
  multa: string;
  aviso: string;
  foro: string;
};

export type CompanySettings = {
  id: 1;
  legal_name: string | null;
  cnpj: string | null;
  address: string | null;
  email: string | null;
  whatsapp: string | null;
  logo_path: string | null;
  logo_url?: string | null;
  partners: CompanyPartner[];
  clause_defaults: ClauseDefaults;
};
