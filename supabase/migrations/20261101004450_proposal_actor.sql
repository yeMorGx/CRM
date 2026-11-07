begin;
create or replace function public.crm_proposal_event() returns trigger language plpgsql security definer set search_path=public as $$
declare event text;
begin
 event=case when tg_op='INSERT' and new.status='draft' then 'proposal_updated' when tg_op='INSERT' or (new.status='sent' and old.status='draft') then 'proposal_sent' when new.status is distinct from old.status and new.status='viewed' then 'proposal_viewed' when new.status is distinct from old.status and new.status='chosen' then 'proposal_chosen' else 'proposal_updated' end;
 insert into activities(lead_id,user_id,type,event_type,content,occurred_at,metadata)
 values(new.lead_id,coalesce(auth.uid(),case when tg_op='INSERT' then new.created_by end),'note',event,new.title,now(),jsonb_build_object('proposal_id',new.id,'status',new.status,'version',new.version));
 if new.status in ('sent','viewed') then update leads set status='proposta' where id=new.lead_id and status in ('novo','pesquisa','pronto','contatado','respondeu','validado');end if;
 return new;
end $$;
revoke all on function public.crm_proposal_event() from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
