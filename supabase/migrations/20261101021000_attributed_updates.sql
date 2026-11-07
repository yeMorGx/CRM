begin;
create or replace function public.crm_attributed_update(p_table text,p_key text,p_values jsonb,p_actor uuid)
returns jsonb language plpgsql set search_path=public as $$
declare columns_sql text; result jsonb;
begin
 if p_table not in ('plans','plan_addons','company_settings','proposals') or jsonb_typeof(p_values)<>'object' or p_values='{}'::jsonb then raise exception 'Atualização inválida'; end if;
 if not exists(select 1 from profiles where id=p_actor and is_allowed) then raise exception 'Autor sem acesso'; end if;
 if p_values ?| array['id','created_at','created_by'] then raise exception 'Campo protegido'; end if;
 if exists(select 1 from jsonb_object_keys(p_values) key where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=p_table and c.column_name=key)) then raise exception 'Campo inválido'; end if;
 select string_agg(format('%I',key),',') into columns_sql from jsonb_object_keys(p_values) key;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 execute format('update public.%1$I set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I,$1)) where id::text=$2 returning to_jsonb(%1$I.*)',p_table,columns_sql) into result using p_values,p_key;
 return result;
end $$;
revoke all on function public.crm_attributed_update(text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.crm_attributed_update(text,text,jsonb,uuid) to service_role;

create or replace function public.crm_deleted_lead_audit() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into crm_audit(actor_id,entity,entity_id,action,metadata) values(auth.uid(),'leads',old.id::text,'delete','{}'::jsonb);
 return old;
end $$;
revoke all on function public.crm_deleted_lead_audit() from public,anon,authenticated;
create trigger crm_deleted_lead_audit after delete on public.leads for each row execute function public.crm_deleted_lead_audit();
commit;
