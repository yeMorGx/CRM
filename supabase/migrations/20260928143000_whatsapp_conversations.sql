-- Conversas do WhatsApp são independentes do chat interno do CRM.
create table if not exists public.whatsapp_conversations (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  phone_e164 text not null,
  last_inbound_at timestamptz,
  opted_in_at timestamptz,
  opt_in_source text,
  opted_in_by uuid references auth.users(id) on delete set null,
  opted_out_at timestamptz,
  opt_out_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_conversations_phone_e164_check check (phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  constraint whatsapp_conversations_opt_in_check check (
    (opted_in_at is null and opt_in_source is null)
    or (opted_in_at is not null and opt_in_source is not null and length(trim(opt_in_source)) > 0)
  )
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  provider_message_id text unique,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null default 'text',
  body text not null,
  status text not null default 'received' check (status in ('sending', 'accepted', 'sent', 'delivered', 'read', 'failed', 'received')),
  sent_by uuid references auth.users(id) on delete set null,
  error_code text,
  created_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_lead_created_idx
  on public.whatsapp_messages(lead_id, created_at);
create or replace function public.track_whatsapp_inbound_message()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.direction = 'inbound' then
    update public.whatsapp_conversations
    set last_inbound_at = greatest(coalesce(last_inbound_at, new.created_at), new.created_at),
        updated_at = now()
    where lead_id = new.lead_id;
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_inbound_updates_window on public.whatsapp_messages;
create trigger whatsapp_inbound_updates_window
after insert on public.whatsapp_messages
for each row execute function public.track_whatsapp_inbound_message();

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;

drop policy if exists "allowed users can read WhatsApp conversations" on public.whatsapp_conversations;
create policy "allowed users can read WhatsApp conversations"
on public.whatsapp_conversations for select to authenticated
using ((select public.is_allowed_user()));

drop policy if exists "allowed users can read WhatsApp messages" on public.whatsapp_messages;
create policy "allowed users can read WhatsApp messages"
on public.whatsapp_messages for select to authenticated
using ((select public.is_allowed_user()));

grant select on public.whatsapp_conversations to authenticated;
grant select on public.whatsapp_messages to authenticated;
grant all on public.whatsapp_conversations, public.whatsapp_messages to service_role;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_conversations') then
    alter publication supabase_realtime add table public.whatsapp_conversations;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_messages') then
    alter publication supabase_realtime add table public.whatsapp_messages;
  end if;
end;
$$;
