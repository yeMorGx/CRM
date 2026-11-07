-- DECISÃO: chaves legadas permanecem intactas. qualificado continua representando negociação;
-- validado representa a nova etapa Qualificado. Nenhum lead existente é reclassificado.
begin;
insert into public.pipeline_stages(slug,name,position,color) values
 ('pesquisa','Em pesquisa',21,'#89958e'),('pronto','Pronto para contato',22,'#89958e'),
 ('respondeu','Respondeu',23,'#d7aa4a'),('validado','Qualificado',24,'#5b8e77'),
 ('proposta','Proposta enviada',25,'#5b8e77'),('perdido','Fechado — perdido',26,'#b67770'),
 ('nutricao','Nutrição',27,'#89958e'),('descartado','Descartado',28,'#606560')
on conflict (slug) do nothing;
alter table public.leads
 add column if not exists segment text,
 add column if not exists service_interest text[] not null default '{}',
 add column if not exists lead_temperature text check (lead_temperature in ('frio','morno','quente')),
 add column if not exists priority text check (priority in ('baixa','media','alta')),
 add column if not exists website_presence text,
 add column if not exists purchase_timeline text,
 add column if not exists budget_range text,
 add column if not exists lost_reason text,
 add column if not exists discard_reason text,
 add column if not exists estimated_value numeric(12,2) check (estimated_value >= 0),
 add column if not exists confirmed_value numeric(12,2) check (confirmed_value >= 0),
 add column if not exists contact_name text,
 add column if not exists pain_point text,
 add column if not exists digital_assessment jsonb not null default '{}',
 add column if not exists last_contact_at timestamptz,
 add column if not exists last_activity_at timestamptz,
 add column if not exists closed_at timestamptz,
 add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.activities
 add column if not exists event_type text,
 add column if not exists occurred_at timestamptz,
 add column if not exists metadata jsonb not null default '{}',
 add column if not exists request_id uuid;
alter table public.activities alter column user_id drop not null;
create unique index if not exists activities_request_id_idx on public.activities(request_id) where request_id is not null;
alter table public.tasks
 add column if not exists description text,
 add column if not exists due_at timestamptz,
 add column if not exists priority text not null default 'media' check (priority in ('baixa','media','alta')),
 add column if not exists completed_at timestamptz,
 add column if not exists cancelled_at timestamptz;
create index if not exists tasks_pending_due_idx on public.tasks(due_at) where not done and cancelled_at is null;
create index if not exists activities_event_occurred_idx on public.activities(event_type,occurred_at);
create index if not exists leads_segment_source_idx on public.leads(segment,source);
create index if not exists leads_assigned_idx on public.leads(assigned_to);
create table if not exists public.crm_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 filters jsonb not null default '{}', cadence_days integer[] not null default '{3,7,14}',
 stagnation_days integer not null default 14 check (stagnation_days between 1 and 365)
);
alter table public.crm_preferences enable row level security;
create policy "own crm preferences" on public.crm_preferences for all to authenticated
 using ((select public.is_allowed_user()) and user_id=(select auth.uid()))
 with check ((select public.is_allowed_user()) and user_id=(select auth.uid()));
grant select,insert,update on public.crm_preferences to authenticated;
create table if not exists public.crm_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id) on delete set null,
 entity text not null, entity_id text not null, action text not null,
 metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table public.crm_audit enable row level security;
create policy "team reads audit" on public.crm_audit for select to authenticated using ((select public.is_allowed_user()));
grant select on public.crm_audit to authenticated;
grant all on public.crm_audit to service_role;
create index if not exists crm_audit_created_idx on public.crm_audit(created_at desc);

create or replace function public.crm_lead_before() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='UPDATE' and new.status is distinct from old.status then
  if new.status='perdido' and nullif(trim(new.lost_reason),'') is null then raise exception 'Informe o motivo da perda.'; end if;
  if new.status='descartado' and nullif(trim(new.discard_reason),'') is null then raise exception 'Informe o motivo do descarte.'; end if;
  if new.status='fechado' and new.confirmed_value is null then raise exception 'Confirme o valor do negócio ganho.'; end if;
  if new.status in ('fechado','perdido') then new.closed_at=now(); else new.closed_at=null; end if;
  new.last_activity_at=now();
 end if;
 return new;
end $$;
create trigger crm_lead_before before update on public.leads for each row execute function public.crm_lead_before();

create or replace function public.crm_lead_event() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
  insert into public.activities(lead_id,user_id,type,event_type,content,occurred_at,metadata)
  values(new.id,auth.uid(),'note','lead_created','Lead cadastrado',now(),jsonb_build_object('source',new.source));
 elsif new.status is distinct from old.status then
  insert into public.activities(lead_id,user_id,type,event_type,content,occurred_at,metadata)
  values(new.id,auth.uid(),'note',case when new.status='fechado' then 'won_recorded' when new.status='perdido' then 'lost_recorded' when old.status in ('fechado','perdido','nutricao','descartado') then 'reopened' else 'stage_changed' end,
   'Etapa atualizada',now(),jsonb_build_object('from',old.status,'to',new.status,'reason',case when new.status='perdido' then new.lost_reason when new.status='descartado' then new.discard_reason end,'value',new.confirmed_value));
 end if;
 return new;
end $$;
revoke all on function public.crm_lead_event() from public,anon,authenticated;
create trigger crm_lead_event after insert or update of status on public.leads for each row execute function public.crm_lead_event();

create or replace function public.crm_activity_before() returns trigger language plpgsql set search_path=public as $$
begin
 new.occurred_at=coalesce(new.occurred_at,now());
 new.event_type=coalesce(new.event_type,case new.type when 'email' then 'contact_sent' when 'call' then 'call_logged' else 'note_added' end);
 if auth.uid() is not null then new.user_id=auth.uid(); end if;
 return new;
end $$;
create trigger crm_activity_before before insert on public.activities for each row execute function public.crm_activity_before();
create or replace function public.crm_activity_after() returns trigger language plpgsql security definer set search_path=public as $$
begin
 update public.leads set last_activity_at=greatest(coalesce(last_activity_at,new.occurred_at),new.occurred_at),
 last_contact_at=case when new.event_type in ('contact_sent','call_logged') then greatest(coalesce(last_contact_at,new.occurred_at),new.occurred_at) else last_contact_at end
 where id=new.lead_id;
 return new;
end $$;
revoke all on function public.crm_activity_after() from public,anon,authenticated;
create trigger crm_activity_after after insert on public.activities for each row execute function public.crm_activity_after();
-- O histórico é append-only para a equipe; importações antigas permanecem como estão.
revoke update,delete on public.activities from authenticated;
create or replace function public.crm_task_event() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.done and not old.done then
  new.completed_at=now();
  if new.lead_id is not null then
   insert into public.activities(lead_id,user_id,type,event_type,content,occurred_at,metadata)
   values(new.lead_id,auth.uid(),'note','task_completed',new.title,now(),jsonb_build_object('task_id',new.id));
  end if;
 elsif not new.done and old.done then new.completed_at=null;
 end if;
 return new;
end $$;
revoke all on function public.crm_task_event() from public,anon,authenticated;
create trigger crm_task_event before update on public.tasks for each row execute function public.crm_task_event();

-- A entidade proposals existente é reutilizada para links e propostas manuais.
alter table public.proposals add column if not exists title text not null default 'Proposta comercial',
 add column if not exists services text[] not null default '{}',
 add column if not exists quoted_value numeric(12,2) check (quoted_value>=0),
 add column if not exists version integer not null default 1,
 add column if not exists previous_id uuid references public.proposals(id),
 add column if not exists note text;
alter table public.proposals drop constraint if exists proposals_status_check;
alter table public.proposals add constraint proposals_status_check check(status in ('draft','sent','viewed','chosen','accepted','rejected','contract_generated','signed','expired','cancelled'));
notify pgrst,'reload schema';

create or replace function public.crm_record_activity(p_lead uuid,p_actor uuid,p_event text,p_content text,p_request uuid)
returns uuid language plpgsql set search_path=public as $$
declare result uuid; current_stage text;
begin
 select id into result from activities where request_id=p_request;
 if result is not null then return result; end if;
 select status into current_stage from leads where id=p_lead for update;
 if not found then raise exception 'Lead não encontrado.'; end if;
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

create or replace function public.crm_proposal_event() returns trigger language plpgsql security definer set search_path=public as $$
declare event text;
begin
 event=case when tg_op='INSERT' and new.status='draft' then 'proposal_updated' when tg_op='INSERT' then 'proposal_sent' when new.status is distinct from old.status and new.status='viewed' then 'proposal_viewed' when new.status is distinct from old.status and new.status='chosen' then 'proposal_chosen' else 'proposal_updated' end;
 insert into activities(lead_id,user_id,type,event_type,content,occurred_at,metadata)
 values(new.lead_id,coalesce(auth.uid(),new.created_by),'note',event,new.title,now(),jsonb_build_object('proposal_id',new.id,'status',new.status,'version',new.version));
 if new.status in ('sent','viewed') then
  update leads set status='proposta' where id=new.lead_id and status in ('novo','pesquisa','pronto','contatado','respondeu','validado');
 end if;
 return new;
end $$;
revoke all on function public.crm_proposal_event() from public,anon,authenticated;
create trigger crm_proposal_event after insert or update on public.proposals for each row execute function public.crm_proposal_event();
create or replace function public.crm_whatsapp_event() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.direction='inbound' or new.status in ('sent','delivered','read','received') then
  if not exists(select 1 from activities where metadata->>'whatsapp_id'=new.id::text) then
   insert into activities(lead_id,user_id,type,event_type,content,occurred_at,metadata)
   values(new.lead_id,null,'note',case when new.direction='inbound' then 'reply_received' else 'contact_sent' end,
   case when new.direction='inbound' then 'Resposta recebida pelo WhatsApp' else 'Mensagem enviada pelo WhatsApp' end,new.created_at,jsonb_build_object('whatsapp_id',new.id));
  end if;
 end if;
 return new;
end $$;
revoke all on function public.crm_whatsapp_event() from public,anon,authenticated;
create trigger crm_whatsapp_event after insert or update of status on public.whatsapp_messages for each row execute function public.crm_whatsapp_event();
create or replace function public.crm_settings_audit() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into crm_audit(actor_id,entity,entity_id,action,metadata) values(auth.uid(),tg_table_name,new.id::text,lower(tg_op),jsonb_build_object('changed_at',now()));
 return new;
end $$;
revoke all on function public.crm_settings_audit() from public,anon,authenticated;
create trigger crm_plans_audit after update on public.plans for each row execute function public.crm_settings_audit();
create trigger crm_addons_audit after update on public.plan_addons for each row execute function public.crm_settings_audit();
create trigger crm_company_audit after update on public.company_settings for each row execute function public.crm_settings_audit();
notify pgrst,'reload schema';
commit;
