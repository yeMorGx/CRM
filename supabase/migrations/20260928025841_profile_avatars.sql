-- Each authenticated user can manage only their own private profile image.
alter table public.profiles
  add column if not exists avatar_path text;

revoke update on public.profiles from public, anon, authenticated;
grant update (full_name, avatar_color, avatar_path) on public.profiles to authenticated;

drop policy if exists "Allowed users can read their own profile avatar" on storage.objects;
create policy "Allowed users can read their own profile avatar"
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (select public.is_allowed_user())
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (storage.foldername(name))[2] = 'profile-avatar'
);

drop policy if exists "Allowed users can upload their own profile avatar" on storage.objects;
create policy "Allowed users can upload their own profile avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (select public.is_allowed_user())
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (storage.foldername(name))[2] = 'profile-avatar'
);

drop policy if exists "Allowed users can remove their own old profile avatar" on storage.objects;
create policy "Allowed users can remove their own old profile avatar"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (select public.is_allowed_user())
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (storage.foldername(name))[2] = 'profile-avatar'
);
