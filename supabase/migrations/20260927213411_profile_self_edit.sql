-- Users may personalize their own profile without changing access or identity.
-- Remove any inherited table-wide UPDATE grant before granting only safe columns.
revoke update on public.profiles from public, anon, authenticated;
grant update (full_name, avatar_color) on public.profiles to authenticated;

drop policy if exists "allowed users can update their profile" on public.profiles;
create policy "allowed users can update their profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = id and is_allowed = true)
with check ((select auth.uid()) = id and is_allowed = true);
