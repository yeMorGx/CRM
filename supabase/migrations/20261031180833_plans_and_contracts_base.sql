create table public.plans (
  id text primary key,
  name text not null,
  tagline text,
  sort integer not null default 0,
  on_request boolean not null default false,
  setup_price numeric(12, 2) check (setup_price is null or setup_price >= 0),
  monthly_price numeric(12, 2) check (monthly_price is null or monthly_price >= 0),
  setup_is_from boolean not null default false,
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  limits jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object'),
  monthly_breakdown jsonb not null default '{}'::jsonb check (jsonb_typeof(monthly_breakdown) = 'object'),
  active boolean not null default true
);

create table public.plan_addons (
  id text primary key,
  name text not null,
  description text,
  kind text not null check (kind in ('once', 'monthly')),
  price numeric(12, 2) not null check (price >= 0),
  unit text,
  applies_to text[] not null default '{}',
  active boolean not null default true
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  token text not null unique,
  status text not null default 'sent'
    check (status in ('sent', 'viewed', 'chosen', 'contract_generated', 'signed', 'expired', 'cancelled')),
  visible_plan_ids text[] not null check (cardinality(visible_plan_ids) > 0),
  highlighted_plan_id text references public.plans(id) on delete set null,
  expires_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  first_viewed_at timestamptz,
  chosen_plan_id text references public.plans(id) on delete set null,
  chosen_addons jsonb check (chosen_addons is null or jsonb_typeof(chosen_addons) = 'array'),
  total_setup numeric(12, 2) check (total_setup is null or total_setup >= 0),
  total_monthly numeric(12, 2) check (total_monthly is null or total_monthly >= 0),
  client_name text,
  client_email text,
  client_phone text,
  client_note text,
  chosen_at timestamptz,
  enterprise_interest boolean not null default false
);

create table public.company_settings (
  id integer primary key default 1 check (id = 1),
  legal_name text,
  cnpj text,
  address text,
  email text,
  whatsapp text,
  logo_path text,
  partners jsonb not null default '[]'::jsonb check (jsonb_typeof(partners) = 'array'),
  clause_defaults jsonb not null default '{"idx":"IPCA","perm":"12","multa":"30","aviso":"30","foro":"Santos/SP"}'::jsonb check (jsonb_typeof(clause_defaults) = 'object')
);

insert into public.company_settings (id) values (1) on conflict (id) do nothing;

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references public.proposals(id) on delete set null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  pdf_path text,
  signed_pdf_path text,
  status text not null default 'generated'
    check (status in ('generated', 'sent', 'signed', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  superseded_by uuid references public.contracts(id) on delete set null,
  unique (lead_id, version)
);

create table public.lead_plan (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  plan_id text references public.plans(id) on delete set null,
  addons jsonb not null default '[]'::jsonb check (jsonb_typeof(addons) = 'array'),
  total_setup numeric(12, 2) check (total_setup is null or total_setup >= 0),
  total_monthly numeric(12, 2) check (total_monthly is null or total_monthly >= 0),
  custom_setup numeric(12, 2) check (custom_setup is null or custom_setup >= 0),
  custom_monthly numeric(12, 2) check (custom_monthly is null or custom_monthly >= 0),
  client jsonb not null default '{}'::jsonb check (jsonb_typeof(client) = 'object'),
  project jsonb not null default '{}'::jsonb check (jsonb_typeof(project) = 'object'),
  terms jsonb not null default '{}'::jsonb check (jsonb_typeof(terms) = 'object'),
  source text check (source in ('client_link', 'team')),
  source_proposal_id uuid references public.proposals(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index plans_active_sort_idx on public.plans(active, sort);
create index plan_addons_active_name_idx on public.plan_addons(active, name);
create index proposals_lead_created_idx on public.proposals(lead_id, created_at desc);
create index proposals_status_expiry_idx on public.proposals(status, expires_at);
create index contracts_lead_created_idx on public.contracts(lead_id, created_at desc);
create index lead_plan_updated_idx on public.lead_plan(updated_at desc);

create trigger lead_plan_set_updated_at
before update on public.lead_plan
for each row execute function public.set_updated_at();

alter table public.plans enable row level security;
alter table public.plan_addons enable row level security;
alter table public.proposals enable row level security;
alter table public.company_settings enable row level security;
alter table public.contracts enable row level security;
alter table public.lead_plan enable row level security;

-- DECISÃO: os dados de proposta e contrato são acessados por rotas de servidor; o navegador não recebe policies diretas.
revoke all on public.plans, public.plan_addons, public.proposals, public.company_settings, public.contracts, public.lead_plan from public, anon, authenticated;
grant all on public.plans, public.plan_addons, public.proposals, public.company_settings, public.contracts, public.lead_plan to service_role;

insert into public.plans (id, name, tagline, sort, on_request, setup_price, monthly_price, setup_is_from, features, limits, monthly_breakdown)
values
  ('starter', 'Starter', 'Presença online simples', 1, false, 1500, 149, false,
    '["Site institucional ou landing page", "Formulário de contato e botão de WhatsApp", "SEO básico", "Hospedagem, domínio e SSL incluídos"]'::jsonb,
    '{"paginas":"Até 5", "alteracoes_mes":"2", "horas_dev_mes":"0", "backup":"Mensal", "monitoramento":"Não", "suporte_h":"48 h úteis", "relatorio":"Não", "permanencia_meses":"12"}'::jsonb,
    '{"hospedagem":49, "dominio":10, "licencas":0, "manutencao":90}'::jsonb),
  ('pro', 'Pro', 'Gerar leads e crescer', 2, false, 3500, 349, false,
    '["Tudo do Starter", "Blog e SEO on-page", "Analytics", "Integração com e-mail ou CRM", "Hospedagem, domínio e SSL incluídos"]'::jsonb,
    '{"paginas":"Até 10", "alteracoes_mes":"6", "horas_dev_mes":"0", "backup":"Semanal", "monitoramento":"Sim", "suporte_h":"24 h úteis", "relatorio":"Trimestral", "permanencia_meses":"12"}'::jsonb,
    '{"hospedagem":79, "dominio":10, "licencas":30, "manutencao":230}'::jsonb),
  ('platinum', 'Platinum', 'Site que sustenta o faturamento', 3, false, 7000, 749, true,
    '["Tudo do Pro", "Integrações sob medida", "Loja ou sistema próprio", "Hospedagem, domínio e SSL incluídos"]'::jsonb,
    '{"paginas":"Até 20 ou loja/área do cliente", "alteracoes_mes":"15", "horas_dev_mes":"4", "backup":"Diário", "monitoramento":"Sim, com alerta imediato", "suporte_h":"4 h úteis", "relatorio":"Mensal", "permanencia_meses":"12"}'::jsonb,
    '{"hospedagem":129, "dominio":10, "licencas":60, "manutencao":550}'::jsonb),
  ('enterprise', 'Enterprise', 'Projetos grandes ou fora do padrão', 4, true, null, null, false,
    '["Tudo do Platinum", "ERP, CRM, pagamentos e APIs", "Painel administrativo", "Múltiplos perfis de acesso", "Hospedagem, domínio e SSL incluídos"]'::jsonb,
    '{"paginas":"Definido na proposta", "alteracoes_mes":"Negociado", "horas_dev_mes":"Pacote negociado", "backup":"Diário", "monitoramento":"Sim, com alerta imediato", "suporte_h":"SLA em contrato", "relatorio":"Mensal + reunião", "permanencia_meses":"Definida na proposta"}'::jsonb,
    '{}'::jsonb)
on conflict (id) do nothing;

insert into public.plan_addons (id, name, description, kind, price, unit, applies_to)
values
  ('pagina-extra', 'Página extra', 'Amplie o limite de páginas do plano.', 'once', 250, 'por página', array['starter', 'pro', 'platinum']),
  ('alteracao-extra-mes', 'Alteração de conteúdo extra/mês', 'Aumente a franquia mensal de alterações.', 'monthly', 29, 'por alteração', array['starter', 'pro', 'platinum']),
  ('desenvolvimento-2h-mes', 'Pacote de 2 horas de desenvolvimento/mês', 'Duas horas adicionais de desenvolvimento por mês.', 'monthly', 300, null, array['starter', 'pro']),
  ('backup-diario', 'Backup diário', 'Backups diários dos dados do site.', 'monthly', 60, null, array['starter', 'pro']),
  ('monitoramento-alerta', 'Monitoramento com alerta', 'Monitoramento com aviso imediato.', 'monthly', 40, null, array['starter']),
  ('blog', 'Blog', 'Publicação e organização de artigos.', 'once', 600, null, array['starter']),
  ('integracao-email-crm', 'Integração com e-mail marketing/CRM', 'Conecte o site às ferramentas de relacionamento.', 'once', 500, null, array['starter']),
  ('seo-avancado', 'SEO avançado', 'Aprofunde a otimização para mecanismos de busca.', 'once', 900, null, array['starter', 'pro'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('signatures', 'signatures', false, 2097152, array['image/png']),
  ('contracts', 'contracts', false, 20971520, array['application/pdf']),
  ('branding', 'branding', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
