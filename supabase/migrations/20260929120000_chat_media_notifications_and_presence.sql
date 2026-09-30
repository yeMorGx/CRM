-- Shared team notifications and private image attachments for the internal chat.

-- Restore the chat-only directory if an older production database missed its earlier migrations.
create table if not exists public.chat_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  avatar_color text not null,
  profile_avatar_path text,
  -- Kept only for compatibility with older deployments; chat uses the account profile photo.
  chat_avatar_path text,
  is_active boolean not null default true,
  last_seen_at timestamptz
);

alter table public.chat_profiles
  add column if not exists chat_avatar_path text,
  add column if not exists profile_avatar_path text,
  add column if not exists is_active boolean not null default true,
  add column if not exists last_seen_at timestamptz;

alter table public.chat_profiles enable row level security;
revoke all on public.chat_profiles from public, anon, authenticated;
grant select (id, full_name, avatar_color, profile_avatar_path, is_active, last_seen_at)
  on public.chat_profiles to authenticated;
revoke update (chat_avatar_path) on public.chat_profiles from authenticated;
grant update (last_seen_at) on public.chat_profiles to authenticated;

drop policy if exists "Allowed users can read chat display profiles" on public.chat_profiles;
create policy "Allowed users can read chat display profiles"
on public.chat_profiles for select to authenticated
using ((select public.is_allowed_user()) and is_active = true);

drop policy if exists "Users can update their own chat avatar path" on public.chat_profiles;
drop policy if exists "Users can update their own chat presence" on public.chat_profiles;
create policy "Users can update their own chat presence"
on public.chat_profiles for update to authenticated
using ((select public.is_allowed_user()) and id = (select auth.uid()))
with check ((select public.is_allowed_user()) and id = (select auth.uid()));

create or replace function public.sync_chat_profile_directory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.chat_profiles where id = old.id;
    return old;
  end if;

  insert into public.chat_profiles (id, full_name, avatar_color, profile_avatar_path, is_active)
  values (new.id, new.full_name, new.avatar_color, new.avatar_path, new.is_allowed)
  on conflict (id) do update
  set full_name = excluded.full_name,
      avatar_color = excluded.avatar_color,
      profile_avatar_path = excluded.profile_avatar_path,
      is_active = excluded.is_active;
  return new;
end;
$$;

revoke all on function public.sync_chat_profile_directory() from public, anon, authenticated;
drop trigger if exists sync_chat_profile_directory on public.profiles;
create trigger sync_chat_profile_directory
after insert or update or delete on public.profiles
for each row execute function public.sync_chat_profile_directory();

insert into public.chat_profiles (id, full_name, avatar_color, profile_avatar_path, is_active)
select id, full_name, avatar_color, avatar_path, is_allowed from public.profiles
on conflict (id) do update
set full_name = excluded.full_name,
    avatar_color = excluded.avatar_color,
    profile_avatar_path = excluded.profile_avatar_path,
    is_active = excluded.is_active;

drop policy if exists "Allowed users can read team profile avatars in chat" on storage.objects;
create policy "Allowed users can read team profile avatars in chat"
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (select public.is_allowed_user())
  and (storage.foldername(name))[2] = 'profile-avatar'
  and exists (
    select 1 from public.chat_profiles as chat_profile
    where chat_profile.id::text = (storage.foldername(name))[1]
      and chat_profile.is_active = true
      and chat_profile.profile_avatar_path = name
  )
);

-- Per-user read receipts back the message portion of the notification bell.
create table if not exists public.message_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create index if not exists message_reads_message_id_idx on public.message_reads (message_id);
alter table public.message_reads enable row level security;
revoke all on public.message_reads from public, anon, authenticated;
grant select, insert on public.message_reads to authenticated;

drop policy if exists "Users can read their own message receipts" on public.message_reads;
create policy "Users can read their own message receipts"
on public.message_reads for select to authenticated
using (user_id = (select auth.uid()) and (select public.is_allowed_user()));

drop policy if exists "Users can mark incoming messages as read" on public.message_reads;
create policy "Users can mark incoming messages as read"
on public.message_reads for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select public.is_allowed_user())
  and exists (
    select 1 from public.messages as message
    where message.id = message_id and message.sender_id <> (select auth.uid())
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
    select 1 from public.message_reads as receipt
    where receipt.message_id = message.id and receipt.user_id = (select auth.uid())
  );

revoke all on public.unread_messages from public, anon, authenticated;
grant select on public.unread_messages to authenticated;

alter table public.messages
  add column if not exists image_path text;

alter table public.chat_profiles
  add column if not exists last_seen_at timestamptz;

grant update (last_seen_at) on public.chat_profiles to authenticated;

drop policy if exists "Allowed users can upload chat attachments" on storage.objects;
create policy "Allowed users can upload chat attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-attachments'
  and (select public.is_allowed_user())
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Allowed users can read chat attachments" on storage.objects;
create policy "Allowed users can read chat attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-attachments'
  and (select public.is_allowed_user())
);

drop policy if exists "Users can remove their own chat attachments" on storage.objects;
create policy "Users can remove their own chat attachments"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-attachments'
  and (select public.is_allowed_user())
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('lead_created', 'lead_stage_changed', 'task_created', 'task_completed', 'event_scheduled', 'event_reminder')),
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null check (length(trim(body)) between 1 and 500),
  entity_type text check (entity_type in ('lead', 'task', 'calendar_event')),
  entity_id uuid,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (recipient_id, dedupe_key)
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

create index if not exists notifications_unread_recipient_created_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

drop policy if exists "Users can read their own team notifications" on public.notifications;
create policy "Users can read their own team notifications"
on public.notifications for select to authenticated
using (
  recipient_id = (select auth.uid())
  and (select public.is_allowed_user())
);

drop policy if exists "Users can mark their own team notifications read" on public.notifications;
create policy "Users can mark their own team notifications read"
on public.notifications for update to authenticated
using (
  recipient_id = (select auth.uid())
  and (select public.is_allowed_user())
)
with check (
  recipient_id = (select auth.uid())
  and (select public.is_allowed_user())
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_profiles'
  ) then
    alter publication supabase_realtime add table public.chat_profiles;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reads'
  ) then
    alter publication supabase_realtime add table public.message_reads;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
