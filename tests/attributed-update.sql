begin;
do $$
declare actor uuid; result jsonb; audit_count integer;
begin
 select id into actor from profiles where is_allowed limit 1;
 select count(*) into audit_count from crm_audit;
 result=crm_attributed_update('plans','starter',jsonb_build_object('name',(select name from plans where id='starter')),actor);
 if result is null then raise exception 'Plano ausente'; end if;
 if not exists(select 1 from crm_audit where actor_id=actor and entity='plans' and entity_id='starter') then raise exception 'Autoria ausente';end if;
 if (select count(*) from crm_audit)<>audit_count+1 then raise exception 'Quantidade de eventos incorreta';end if;
 if has_function_privilege('authenticated','crm_attributed_update(text,text,jsonb,uuid)','execute') then raise exception 'RPC exposta';end if;
end $$;
rollback;
select 'Autoria validada; teste revertido' as result;
