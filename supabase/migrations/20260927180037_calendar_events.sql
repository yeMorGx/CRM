create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 160),
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  color text not null default 'lime' check (color in ('lime', 'blue', 'amber', 'red')),
  notes text,
  lead_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_valid_period check (end_at > start_at)
);

create index if not exists calendar_events_start_at_idx on public.calendar_events(start_at);
create index if not exists calendar_events_end_at_idx on public.calendar_events(end_at);

drop trigger if exists calendar_events_set_updated_at on public.calendar_events;
create trigger calendar_events_set_updated_at
before update on public.calendar_events
for each row execute function public.set_updated_at();

alter table public.calendar_events enable row level security;

drop policy if exists "allowed users can read calendar events" on public.calendar_events;
create policy "allowed users can read calendar events"
on public.calendar_events for select to authenticated
using ((select public.is_allowed_user()));

drop policy if exists "allowed users can create calendar events" on public.calendar_events;
create policy "allowed users can create calendar events"
on public.calendar_events for insert to authenticated
with check ((select public.is_allowed_user()));

drop policy if exists "allowed users can update calendar events" on public.calendar_events;
create policy "allowed users can update calendar events"
on public.calendar_events for update to authenticated
using ((select public.is_allowed_user()))
with check ((select public.is_allowed_user()));

drop policy if exists "allowed users can delete calendar events" on public.calendar_events;
create policy "allowed users can delete calendar events"
on public.calendar_events for delete to authenticated
using ((select public.is_allowed_user()));

grant select, insert, update, delete on public.calendar_events to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calendar_events') then
    alter publication supabase_realtime add table public.calendar_events;
  end if;
end;
$$;
