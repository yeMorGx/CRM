begin;
do $$
declare fixture_user uuid;
begin
 if not (select relrowsecurity from pg_class where oid='public.push_subscriptions'::regclass) then raise exception 'RLS ausente'; end if;
 if has_table_privilege('authenticated','public.push_subscriptions','SELECT') or has_table_privilege('authenticated','public.push_subscriptions','INSERT') or has_table_privilege('anon','public.push_subscriptions','SELECT') then raise exception 'Credenciais expostas'; end if;
 select id into fixture_user from profiles where is_allowed limit 1;
 insert into push_subscriptions(user_id,endpoint,p256dh,auth) values(fixture_user,'https://fcm.googleapis.com/fcm/send/ROLLBACK-ONLY-DB-TEST',repeat('x',87),repeat('y',22));
 if not exists(select 1 from push_subscriptions where user_id=fixture_user) then raise exception 'Registro ausente'; end if;
end $$;
rollback;
select (select count(*) from public.push_subscriptions) as registrations,
 (select relrowsecurity from pg_class where oid='public.push_subscriptions'::regclass) as rls_enabled,
 has_table_privilege('authenticated','public.push_subscriptions','SELECT') as authenticated_can_read;
