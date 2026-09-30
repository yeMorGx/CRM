-- Keep the personal profile photo and the conversation photo independent.
alter table public.chat_profiles
  add column if not exists chat_avatar_path text,
  add column if not exists is_active boolean not null default true;

drop policy if exists "Allowed users can read chat display profiles" on public.chat_profiles;
create policy "Allowed users can read chat display profiles"
on public.chat_profiles for select to authenticated
using ((select public.is_allowed_user()) and is_active = true);

drop policy if exists "Allowed users can read chat profile avatars" on storage.objects;
drop policy if exists "Allowed users can read their own profile avatar" on storage.objects;

create policy "Allowed users can read their own profile avatar"
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (select public.is_allowed_user())
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (storage.foldername(name))[2] = 'profile-avatar'
);

create policy "Allowed users can read chat profile avatars"
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (select public.is_allowed_user())
  and (storage.foldername(name))[2] = 'chat-avatar'
  and exists (
    select 1
    from public.chat_profiles as chat_profile
    where chat_profile.id::text = (storage.foldername(name))[1]
      and chat_profile.is_active = true
      and chat_profile.chat_avatar_path = name
  )
);

drop policy if exists "Allowed users can upload their own chat avatar" on storage.objects;
create policy "Allowed users can upload their own chat avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (select public.is_allowed_user())
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (storage.foldername(name))[2] = 'chat-avatar'
);

drop policy if exists "Allowed users can remove their own old chat avatar" on storage.objects;
create policy "Allowed users can remove their own old chat avatar"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (select public.is_allowed_user())
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (storage.foldername(name))[2] = 'chat-avatar'
);

-- The legacy column held copies of profiles.avatar_path; it is not the chat avatar.
update public.chat_profiles set avatar_path = null where avatar_path is not null;
alter table public.chat_profiles drop column if exists avatar_path;

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

  insert into public.chat_profiles (id, full_name, avatar_color, is_active)
  values (new.id, new.full_name, new.avatar_color, new.is_allowed)
  on conflict (id) do update
  set full_name = excluded.full_name,
      avatar_color = excluded.avatar_color,
      is_active = excluded.is_active;

  return new;
end;
$$;

revoke all on function public.sync_chat_profile_directory() from public, anon, authenticated;

insert into public.chat_profiles (id, full_name, avatar_color, is_active)
select id, full_name, avatar_color, is_allowed
from public.profiles
on conflict (id) do update
set full_name = excluded.full_name,
    avatar_color = excluded.avatar_color,
    is_active = excluded.is_active;

grant update (chat_avatar_path) on public.chat_profiles to authenticated;
drop policy if exists "Users can update their own chat avatar path" on public.chat_profiles;
create policy "Users can update their own chat avatar path"
on public.chat_profiles for update to authenticated
using ((select public.is_allowed_user()) and id = (select auth.uid()))
with check ((select public.is_allowed_user()) and id = (select auth.uid()));
