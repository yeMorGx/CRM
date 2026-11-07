begin;
revoke all on public.crm_preferences from public,anon,authenticated;
grant select,insert,update on public.crm_preferences to authenticated;
revoke all on public.crm_audit from public,anon,authenticated;
grant select on public.crm_audit to authenticated;
grant all on public.crm_preferences,public.crm_audit to service_role;
alter table public.proposals add column if not exists sent_at timestamptz;
create or replace function public.crm_proposal_before() returns trigger language plpgsql set search_path=public as $$
begin
 if new.status='sent' and new.sent_at is null then new.sent_at=now();end if;
 return new;
end $$;
create trigger crm_proposal_before before insert or update on public.proposals for each row execute function public.crm_proposal_before();
create or replace function public.crm_proposal_event() returns trigger language plpgsql security definer set search_path=public as $$
declare event text;
begin
 event=case when tg_op='INSERT' and new.status='draft' then 'proposal_updated' when tg_op='INSERT' or (new.status='sent' and old.status='draft') then 'proposal_sent' when new.status is distinct from old.status and new.status='viewed' then 'proposal_viewed' when new.status is distinct from old.status and new.status='chosen' then 'proposal_chosen' else 'proposal_updated' end;
 insert into activities(lead_id,user_id,type,event_type,content,occurred_at,metadata)
 values(new.lead_id,coalesce(auth.uid(),new.created_by),'note',event,new.title,now(),jsonb_build_object('proposal_id',new.id,'status',new.status,'version',new.version));
 if new.status in ('sent','viewed') then update leads set status='proposta' where id=new.lead_id and status in ('novo','pesquisa','pronto','contatado','respondeu','validado');end if;
 return new;
end $$;
revoke all on function public.crm_proposal_event() from public,anon,authenticated;
create or replace function public.crm_mark_contract_signed(p_id uuid,p_path text,p_actor uuid) returns uuid language plpgsql set search_path=public as $$
declare contract contracts%rowtype;
begin
 select * into contract from contracts where id=p_id for update;
 if not found then raise exception 'Contrato não encontrado.';end if;
 if contract.status='cancelled' then raise exception 'Contrato cancelado.';end if;
 update contracts set signed_pdf_path=p_path,status='signed' where id=p_id;
 insert into activities(lead_id,user_id,type,event_type,content,occurred_at,metadata) values(contract.lead_id,p_actor,'note','contract_signed','PDF assinado recebido; conferência informada pela equipe',now(),jsonb_build_object('contract_id',p_id));
 if contract.proposal_id is not null then update proposals set status='signed' where id=contract.proposal_id;end if;
 return p_id;
end $$;
revoke all on function public.crm_mark_contract_signed(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.crm_mark_contract_signed(uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
