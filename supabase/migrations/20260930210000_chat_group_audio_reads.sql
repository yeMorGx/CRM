alter table public.messages
  add column if not exists message_type text not null default 'text',
  add column if not exists audio_path text,
  add column if not exists audio_duration_seconds integer;

alter table public.messages
  add constraint messages_audio_content_check check (
    (message_type = 'text' and audio_path is null and audio_duration_seconds is null)
    or (message_type = 'audio' and audio_path is not null and audio_duration_seconds between 1 and 300
      and image_path is null and content = '' and split_part(audio_path, '/', 1) = sender_id::text)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('chat-audio', 'chat-audio', false, 26214400, array['audio/webm', 'audio/mp4', 'audio/ogg']),
  ('chat-group', 'chat-group', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Allowed members read chat audio" on storage.objects for select to authenticated
using (bucket_id = 'chat-audio' and (select public.is_allowed_user()));
create policy "Allowed members upload own chat audio" on storage.objects for insert to authenticated
with check (bucket_id = 'chat-audio' and (select public.is_allowed_user())
  and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Members remove own failed chat audio" on storage.objects for delete to authenticated
using (bucket_id = 'chat-audio' and (select public.is_allowed_user())
  and (storage.foldername(name))[1] = (select auth.uid()::text));

create table public.chat_settings (
  id text primary key default 'team' check (id = 'team'),
  avatar_path text,
  updated_at timestamptz not null default now()
);
insert into public.chat_settings (id) values ('team');
alter table public.chat_settings enable row level security;
revoke all on public.chat_settings from public, anon, authenticated;
grant select on public.chat_settings to authenticated;
grant update (avatar_path, updated_at) on public.chat_settings to authenticated;
create policy "Allowed members read team chat settings" on public.chat_settings for select to authenticated
using ((select public.is_allowed_user()));
create policy "Admins update team chat settings" on public.chat_settings for update to authenticated
using ((select public.is_allowed_user()) and (select auth.jwt()->'app_metadata'->>'crm_role') = 'admin')
with check ((select public.is_allowed_user()) and (select auth.jwt()->'app_metadata'->>'crm_role') = 'admin');

create policy "Allowed members read group photo" on storage.objects for select to authenticated
using (bucket_id = 'chat-group' and (select public.is_allowed_user()));
create policy "Admins upload group photo" on storage.objects for insert to authenticated
with check (bucket_id = 'chat-group' and (select public.is_allowed_user())
  and (select auth.jwt()->'app_metadata'->>'crm_role') = 'admin'
  and (storage.foldername(name))[1] = 'group');
create policy "Admins remove group photos" on storage.objects for delete to authenticated
using (bucket_id = 'chat-group' and (select public.is_allowed_user())
  and (select auth.jwt()->'app_metadata'->>'crm_role') = 'admin'
  and (storage.foldername(name))[1] = 'group');

create table public.chat_reads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_read_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.chat_reads enable row level security;
revoke all on public.chat_reads from public, anon, authenticated;
grant select, insert on public.chat_reads to authenticated;
grant update (last_read_at, updated_at) on public.chat_reads to authenticated;
create policy "Members read own chat cursor" on public.chat_reads for select to authenticated
using (user_id = (select auth.uid()) and (select public.is_allowed_user()));
create policy "Members create own chat cursor" on public.chat_reads for insert to authenticated
with check (user_id = (select auth.uid()) and (select public.is_allowed_user()));
create policy "Members update own chat cursor" on public.chat_reads for update to authenticated
using (user_id = (select auth.uid()) and (select public.is_allowed_user()))
with check (user_id = (select auth.uid()) and (select public.is_allowed_user()));

create or replace view public.unread_messages
with (security_invoker = true)
as
select message.id, message.content, message.sender_id, message.created_at, message.message_type, message.image_path
from public.messages as message
where message.sender_id <> (select auth.uid())
  and (select public.is_allowed_user())
  and not exists (
    select 1 from public.message_reads as receipt
    where receipt.message_id = message.id and receipt.user_id = (select auth.uid())
  )
  and not exists (
    select 1 from public.chat_reads as cursor
    where cursor.user_id = (select auth.uid()) and cursor.last_read_at >= message.created_at
  );
revoke all on public.unread_messages from public, anon, authenticated;
grant select on public.unread_messages to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_reads') then
    alter publication supabase_realtime add table public.chat_reads;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_settings') then
    alter publication supabase_realtime add table public.chat_settings;
  end if;
end;
$$;
