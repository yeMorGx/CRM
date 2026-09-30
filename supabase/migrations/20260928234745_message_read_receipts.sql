-- A message is read by a person, not by the entire shared CRM team.
create table if not exists public.message_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create index if not exists message_reads_message_id_idx
  on public.message_reads (message_id);

alter table public.message_reads enable row level security;
revoke all on public.message_reads from public, anon, authenticated;
grant select, insert on public.message_reads to authenticated;

drop policy if exists "Users can read their own message receipts" on public.message_reads;
create policy "Users can read their own message receipts"
on public.message_reads for select to authenticated
using (
  user_id = (select auth.uid())
  and (select public.is_allowed_user())
);

drop policy if exists "Users can mark incoming messages as read" on public.message_reads;
create policy "Users can mark incoming messages as read"
on public.message_reads for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select public.is_allowed_user())
  and exists (
    select 1
    from public.messages as message
    where message.id = message_id
      and message.sender_id <> (select auth.uid())
  )
);

create or replace view public.unread_messages
with (security_invoker = true)
as
select message.id, message.content, message.sender_id, message.created_at
from public.messages as message
where message.sender_id <> (select auth.uid())
  and (select public.is_allowed_user())
  and not exists (
    select 1
    from public.message_reads as receipt
    where receipt.message_id = message.id
      and receipt.user_id = (select auth.uid())
  );

revoke all on public.unread_messages from public, anon, authenticated;
grant select on public.unread_messages to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reads'
  ) then
    alter publication supabase_realtime add table public.message_reads;
  end if;
end;
$$;
