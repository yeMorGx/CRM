alter table public.calendar_events
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.calendar_events
  alter column created_by set default auth.uid();

create or replace function public.enforce_calendar_event_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    return new;
  end if;

  if old.created_by is not null and new.created_by is distinct from old.created_by then
    raise exception 'Calendar event creator cannot be changed';
  end if;

  if old.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists calendar_events_enforce_creator on public.calendar_events;
create trigger calendar_events_enforce_creator
before insert or update on public.calendar_events
for each row execute function public.enforce_calendar_event_creator();

create table if not exists public.calendar_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft', 'notion')),
  account_label text,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  expires_at timestamptz,
  scopes text[] not null default '{}',
  sync_enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  last_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists calendar_integrations_user_idx
  on public.calendar_integrations(user_id, provider);

create table if not exists public.calendar_event_syncs (
  event_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft', 'notion')),
  external_event_id text,
  state text not null default 'pending'
    check (state in ('pending', 'synced', 'error', 'delete_pending')),
  payload jsonb not null default '{}'::jsonb,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id, provider)
);

create index if not exists calendar_event_syncs_user_state_idx
  on public.calendar_event_syncs(user_id, state, provider);

alter table public.calendar_integrations enable row level security;
alter table public.calendar_event_syncs enable row level security;

revoke all on public.calendar_integrations from public, anon, authenticated;
revoke all on public.calendar_event_syncs from public, anon, authenticated;
grant all on public.calendar_integrations to service_role;
grant all on public.calendar_event_syncs to service_role;
