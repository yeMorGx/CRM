create table public.canvas_boards (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 type text not null check (type in ('canvas','flow')),
 title text not null check (length(trim(title)) between 1 and 200),
 data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,type)
);
alter table public.canvas_boards enable row level security;
create policy "Owners read boards" on public.canvas_boards for select to authenticated using (user_id = (select auth.uid()) and (select public.is_allowed_user()));
create policy "Owners create boards" on public.canvas_boards for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_allowed_user()));
create policy "Owners update boards" on public.canvas_boards for update to authenticated using (user_id = (select auth.uid()) and (select public.is_allowed_user())) with check (user_id = (select auth.uid()) and (select public.is_allowed_user()));
create policy "Owners delete boards" on public.canvas_boards for delete to authenticated using (user_id = (select auth.uid()) and (select public.is_allowed_user()));
create trigger canvas_boards_updated before update on public.canvas_boards for each row execute function public.set_updated_at();
revoke all on public.canvas_boards from anon;
grant select,insert,update,delete on public.canvas_boards to authenticated;
