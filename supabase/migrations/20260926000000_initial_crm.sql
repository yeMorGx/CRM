-- CRM de Leads: schema inicial.
-- Os dois usuários fixos devem ser criados em Auth e cadastrados em public.profiles.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  avatar_color text not null default '#d86b42',
  is_allowed boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.pipeline_stages (
  slug text primary key,
  name text not null,
  position integer not null unique,
  color text not null default '#8c948f',
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  website text,
  source text not null default 'manual',
  place_id text unique,
  status text not null default 'novo' references public.pipeline_stages(slug),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'note' check (type in ('note', 'call', 'email')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  done boolean not null default false,
  lead_id uuid references public.leads(id) on delete cascade,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

insert into public.pipeline_stages (slug, name, position, color)
values
  ('novo', 'Novo', 1, '#8c948f'),
  ('contatado', 'Contatado', 2, '#d3a44b'),
  ('qualificado', 'Qualificado', 3, '#5b8f7a'),
  ('fechado', 'Fechado', 4, '#d86b42')
on conflict (slug) do update set
  name = excluded.name,
  position = excluded.position,
  color = excluded.color;

create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_updated_at_idx on public.leads(updated_at desc);
create index if not exists activities_lead_created_at_idx on public.activities(lead_id, created_at desc);
create index if not exists tasks_lead_idx on public.tasks(lead_id);
create index if not exists messages_created_at_idx on public.messages(created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

create or replace function public.is_allowed_user()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_allowed = true
  );
$$;

alter table public.profiles enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.leads enable row level security;
alter table public.activities enable row level security;
alter table public.tasks enable row level security;
alter table public.messages enable row level security;

drop policy if exists "allowed users can read their profile" on public.profiles;
create policy "allowed users can read their profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id and is_allowed = true);

drop policy if exists "allowed users can read stages" on public.pipeline_stages;
create policy "allowed users can read stages"
on public.pipeline_stages for select to authenticated
using ((select public.is_allowed_user()));

drop policy if exists "allowed users can manage leads" on public.leads;
create policy "allowed users can manage leads"
on public.leads for all to authenticated
using ((select public.is_allowed_user()))
with check ((select public.is_allowed_user()));

drop policy if exists "allowed users can manage activities" on public.activities;
create policy "allowed users can manage activities"
on public.activities for all to authenticated
using ((select public.is_allowed_user()))
with check ((select public.is_allowed_user()) and user_id = (select auth.uid()));

drop policy if exists "allowed users can read tasks" on public.tasks;
create policy "allowed users can read tasks"
on public.tasks for select to authenticated
using ((select public.is_allowed_user()));

drop policy if exists "allowed users can create tasks" on public.tasks;
create policy "allowed users can create tasks"
on public.tasks for insert to authenticated
with check ((select public.is_allowed_user()) and created_by = (select auth.uid()));

drop policy if exists "allowed users can update tasks" on public.tasks;
create policy "allowed users can update tasks"
on public.tasks for update to authenticated
using ((select public.is_allowed_user()))
with check ((select public.is_allowed_user()));

drop policy if exists "allowed users can delete tasks" on public.tasks;
create policy "allowed users can delete tasks"
on public.tasks for delete to authenticated
using ((select public.is_allowed_user()));

drop policy if exists "allowed users can read messages" on public.messages;
create policy "allowed users can read messages"
on public.messages for select to authenticated
using ((select public.is_allowed_user()));

drop policy if exists "allowed users can create messages" on public.messages;
create policy "allowed users can create messages"
on public.messages for insert to authenticated
with check ((select public.is_allowed_user()) and sender_id = (select auth.uid()));

drop policy if exists "allowed users can update messages" on public.messages;
create policy "allowed users can update messages"
on public.messages for update to authenticated
using ((select public.is_allowed_user()))
with check ((select public.is_allowed_user()));

-- A Data API deve expor as tabelas de forma explícita em projetos novos.
grant select on public.pipeline_stages to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, update, delete on public.activities to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update on public.messages to authenticated;
grant select on public.profiles to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads') then
    alter publication supabase_realtime add table public.leads;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks') then
    alter publication supabase_realtime add table public.tasks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
