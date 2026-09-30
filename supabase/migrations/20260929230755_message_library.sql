create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 3 and 100),
  stage text not null check (stage in ('primeiro_contato', 'respondeu', 'sem_resposta', 'proposta', 'encerramento')),
  scenario text not null check (length(trim(scenario)) between 3 and 100),
  body text not null check (length(trim(body)) between 10 and 4000),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_messages_stage_created_idx
  on public.outreach_messages(stage, created_at desc);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'outreach_messages_set_updated_at'
    and tgrelid = 'public.outreach_messages'::regclass) then
    create trigger outreach_messages_set_updated_at
    before update on public.outreach_messages
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.outreach_messages enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'outreach_messages' and policyname = 'allowed users can read outreach messages') then
    create policy "allowed users can read outreach messages"
    on public.outreach_messages for select to authenticated
    using ((select public.is_allowed_user()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'outreach_messages' and policyname = 'allowed users can create outreach messages') then
    create policy "allowed users can create outreach messages"
    on public.outreach_messages for insert to authenticated
    with check ((select public.is_allowed_user()) and created_by = (select auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'outreach_messages' and policyname = 'authors can update outreach messages') then
    create policy "authors can update outreach messages"
    on public.outreach_messages for update to authenticated
    using ((select public.is_allowed_user()) and created_by = (select auth.uid()))
    with check ((select public.is_allowed_user()) and created_by = (select auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'outreach_messages' and policyname = 'authors can delete outreach messages') then
    create policy "authors can delete outreach messages"
    on public.outreach_messages for delete to authenticated
    using ((select public.is_allowed_user()) and created_by = (select auth.uid()));
  end if;
end $$;

revoke all on public.outreach_messages from anon;
grant select, insert, update, delete on public.outreach_messages to authenticated;
