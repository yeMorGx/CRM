-- A chat-only profile directory: no email, access flag, or account metadata.
create table if not exists public.chat_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  avatar_color text not null,
  avatar_path text
);

alter table public.chat_profiles enable row level security;
revoke all on public.chat_profiles from public, anon, authenticated;
grant select on public.chat_profiles to authenticated;

drop policy if exists "Allowed users can read chat display profiles" on public.chat_profiles;
create policy "Allowed users can read chat display profiles"
on public.chat_profiles for select to authenticated
using ((select public.is_allowed_user()));

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

  if new.is_allowed then
    insert into public.chat_profiles (id, full_name, avatar_color, avatar_path)
    values (new.id, new.full_name, new.avatar_color, new.avatar_path)
    on conflict (id) do update
    set full_name = excluded.full_name,
        avatar_color = excluded.avatar_color,
        avatar_path = excluded.avatar_path;
  else
    delete from public.chat_profiles where id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_chat_profile_directory() from public, anon, authenticated;

drop trigger if exists sync_chat_profile_directory on public.profiles;
create trigger sync_chat_profile_directory
after insert or update or delete on public.profiles
for each row execute function public.sync_chat_profile_directory();

insert into public.chat_profiles (id, full_name, avatar_color, avatar_path)
select id, full_name, avatar_color, avatar_path
from public.profiles
where is_allowed = true
on conflict (id) do update
set full_name = excluded.full_name,
    avatar_color = excluded.avatar_color,
    avatar_path = excluded.avatar_path;

-- Signed chat photos remain private and only the currently selected avatar is readable.
drop policy if exists "Allowed users can read their own profile avatar" on storage.objects;
drop policy if exists "Allowed users can read chat profile avatars" on storage.objects;
create policy "Allowed users can read chat profile avatars"
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (select public.is_allowed_user())
  and (storage.foldername(name))[2] = 'profile-avatar'
  and exists (
    select 1
    from public.chat_profiles as chat_profile
    where chat_profile.id::text = (storage.foldername(name))[1]
      and chat_profile.avatar_path = name
  )
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
end;
$$;
