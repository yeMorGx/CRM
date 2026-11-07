begin;
create or replace function public.crm_record_activity(p_lead uuid,p_actor uuid,p_event text,p_content text,p_request uuid)
returns uuid language plpgsql set search_path=public as $$
declare result uuid; current_stage text;
begin
 select status into current_stage from leads where id=p_lead for update;
 if not found then raise exception 'Lead não encontrado.'; end if;
 select id into result from activities where request_id=p_request;
 if result is not null then return result;end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 insert into activities(lead_id,user_id,type,event_type,content,occurred_at,request_id)
 values(p_lead,p_actor,'note',p_event,p_content,now(),p_request) returning id into result;
 if p_event in ('contact_sent','call_logged') and current_stage in ('novo','pesquisa','pronto') then
  update leads set status='contatado' where id=p_lead;
 elsif p_event='reply_received' and current_stage in ('novo','pesquisa','pronto','contatado') then
  update leads set status='respondeu' where id=p_lead;
 end if;
 return result;
end $$;
revoke all on function public.crm_record_activity(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.crm_record_activity(uuid,uuid,text,text,uuid) to service_role;


drop trigger if exists crm_lead_event on public.leads;
create or replace function public.crm_lead_event() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
  insert into public.activities(lead_id,user_id,type,event_type,content,occurred_at,metadata)
  values(new.id,auth.uid(),'note','lead_created','Lead cadastrado',now(),jsonb_build_object('source',new.source));
 elsif new.status is distinct from old.status then
  insert into public.activities(lead_id,user_id,type,event_type,content,occurred_at,metadata)
  values(new.id,auth.uid(),'note',case when new.status='fechado' then 'won_recorded' when new.status='perdido' then 'lost_recorded' when old.status in ('fechado','perdido','nutricao','descartado') then 'reopened' else 'stage_changed' end,
   'Etapa atualizada',now(),jsonb_build_object('from',old.status,'to',new.status,'reason',case when new.status='perdido' then new.lost_reason when new.status='descartado' then new.discard_reason end,'value',new.confirmed_value));
 elsif (to_jsonb(new)-array['updated_at','last_activity_at','last_contact_at']) is distinct from (to_jsonb(old)-array['updated_at','last_activity_at','last_contact_at']) then
  insert into activities(lead_id,user_id,type,event_type,content,occurred_at,metadata) values(new.id,auth.uid(),'note','lead_updated','Cadastro e qualificação atualizados',now(),'{}');
 end if;
 return new;
end $$;
revoke all on function public.crm_lead_event() from public,anon,authenticated;


create trigger crm_lead_event after insert or update on public.leads for each row execute function public.crm_lead_event();
notify pgrst,'reload schema';
commit;
