begin;
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique check (length(endpoint) between 20 and 4096),
 p256dh text not null check (length(p256dh) between 80 and 150),
 auth text not null check (length(auth) between 20 and 100),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public,anon,authenticated;
grant all on public.push_subscriptions to service_role;
comment on table public.push_subscriptions is 'Private delivery credentials. Enrollment and removal require an authenticated same-origin server route.';
commit;
