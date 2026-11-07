begin;
create table public.crm_rate_limits(key_hash text primary key, window_start timestamptz not null, attempts integer not null);
alter table public.crm_rate_limits enable row level security;
revoke all on public.crm_rate_limits from public,anon,authenticated;
grant all on public.crm_rate_limits to service_role;
create or replace function public.crm_check_rate(p_key text) returns boolean language plpgsql set search_path=public as $$
declare attempts integer;
begin
 insert into crm_rate_limits(key_hash,window_start,attempts) values(p_key,date_trunc('minute',now()),1)
 on conflict(key_hash) do update set attempts=case when crm_rate_limits.window_start<date_trunc('minute',now()) then 1 else crm_rate_limits.attempts+1 end,window_start=date_trunc('minute',now()) returning crm_rate_limits.attempts into attempts;
 return attempts<=10;
end $$;
revoke all on function public.crm_check_rate(text) from public,anon,authenticated;
grant execute on function public.crm_check_rate(text) to service_role;

create or replace function public.crm_save_lead_plan(p_lead uuid,p_plan text,p_addons jsonb,p_client jsonb,p_project jsonb,p_terms jsonb,p_setup numeric,p_monthly numeric,p_actor uuid,p_proposal uuid default null)
returns jsonb language plpgsql set search_path=public as $$
declare selected plans%rowtype; previous lead_plan%rowtype; extra plan_addons%rowtype; item jsonb; qty integer; setup numeric; monthly numeric; saved lead_plan%rowtype;
begin
 perform 1 from leads where id=p_lead for update;if not found then raise exception 'Lead não encontrado.';end if;
 select * into selected from plans where id=p_plan and active=true;if not found then raise exception 'Plano indisponível.';end if;
 select * into previous from lead_plan where lead_id=p_lead for update;
 if selected.on_request then
  if p_setup is null or p_monthly is null or p_setup<0 or p_monthly<0 then raise exception 'Informe os valores Enterprise.';end if;
  setup=p_setup;monthly=p_monthly;
 else setup=selected.setup_price;monthly=selected.monthly_price;end if;
 if jsonb_typeof(p_addons)<>'array' or jsonb_array_length(p_addons)>30 then raise exception 'Extras inválidos.';end if;
 if (select count(*) from jsonb_array_elements(p_addons))<>(select count(distinct value->>'id') from jsonb_array_elements(p_addons)) then raise exception 'Extra duplicado.';end if;
 for item in select * from jsonb_array_elements(p_addons) loop
  qty=(item->>'qty')::integer;if qty<1 or qty>20 then raise exception 'Quantidade deve estar entre 1 e 20.';end if;
  select * into extra from plan_addons where id=item->>'id' and active and p_plan=any(applies_to);
  if not found then raise exception 'Extra não disponível neste plano.';end if;
  if extra.kind='once' then setup=setup+extra.price*qty;else monthly=monthly+extra.price*qty;end if;
 end loop;
 insert into lead_plan(lead_id,plan_id,addons,total_setup,total_monthly,custom_setup,custom_monthly,client,project,terms,source,source_proposal_id,updated_by)
 values(p_lead,p_plan,p_addons,setup,monthly,case when selected.on_request then p_setup end,case when selected.on_request then p_monthly end,
 coalesce(previous.client,'{}')||coalesce(p_client,'{}'),coalesce(p_project,previous.project,'{}'),coalesce(p_terms,previous.terms,'{}'),case when p_proposal is null then 'team' else 'client_link' end,p_proposal,p_actor)
 on conflict(lead_id) do update set plan_id=excluded.plan_id,addons=excluded.addons,total_setup=excluded.total_setup,total_monthly=excluded.total_monthly,custom_setup=excluded.custom_setup,custom_monthly=excluded.custom_monthly,client=excluded.client,project=excluded.project,terms=excluded.terms,source=excluded.source,source_proposal_id=excluded.source_proposal_id,updated_by=excluded.updated_by
 returning * into saved;
 insert into activities(lead_id,user_id,type,event_type,content,occurred_at,metadata) values(p_lead,p_actor,'note','proposal_updated','Ficha de plano atualizada',now(),jsonb_build_object('plan_id',p_plan,'total_setup',setup,'total_monthly',monthly));
 insert into crm_audit(actor_id,entity,entity_id,action,metadata) values(p_actor,'lead_plan',p_lead::text,'updated',jsonb_build_object('plan_id',p_plan,'total_setup',setup,'total_monthly',monthly));
 return to_jsonb(saved);
end $$;
revoke all on function public.crm_save_lead_plan(uuid,text,jsonb,jsonb,jsonb,jsonb,numeric,numeric,uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_save_lead_plan(uuid,text,jsonb,jsonb,jsonb,jsonb,numeric,numeric,uuid,uuid) to service_role;

create or replace function public.crm_choose_proposal(p_token text,p_plan text,p_addons jsonb,p_client jsonb)
returns jsonb language plpgsql set search_path=public as $$
declare proposal proposals%rowtype; saved jsonb;
begin
 select * into proposal from proposals where token=p_token for update;
 if not found or proposal.status not in ('sent','viewed','chosen') or proposal.expires_at<=now() then raise exception 'A proposta não está disponível para alterações.';end if;
 if not(p_plan=any(proposal.visible_plan_ids)) or exists(select 1 from plans where id=p_plan and on_request) then raise exception 'Plano não disponível para escolha.';end if;
 saved=crm_save_lead_plan(proposal.lead_id,p_plan,p_addons,p_client,null,null,null,null,null,proposal.id);
 update proposals set status='chosen',chosen_plan_id=p_plan,chosen_addons=p_addons,total_setup=(saved->>'total_setup')::numeric,total_monthly=(saved->>'total_monthly')::numeric,client_name=p_client->>'nome',client_email=p_client->>'email',client_phone=p_client->>'telefone',client_note=p_client->>'observacao',chosen_at=now() where id=proposal.id;
 return jsonb_build_object('total_setup',saved->'total_setup','total_monthly',saved->'total_monthly');
end $$;
revoke all on function public.crm_choose_proposal(text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.crm_choose_proposal(text,text,jsonb,jsonb) to service_role;

create or replace function public.crm_register_contract(p_id uuid,p_lead uuid,p_actor uuid,p_data jsonb,p_pdf text,p_updated timestamptz)
returns uuid language plpgsql set search_path=public as $$
declare current_plan lead_plan%rowtype; next_version integer;
begin
 perform 1 from leads where id=p_lead for update;
 select * into current_plan from lead_plan where lead_id=p_lead for update;
 if current_plan.updated_at is distinct from p_updated then raise exception 'A ficha mudou durante a geração. Atualize e tente novamente.';end if;
 select coalesce(max(version),0)+1 into next_version from contracts where lead_id=p_lead;
 insert into contracts(id,lead_id,proposal_id,data,pdf_path,created_by,version) values(p_id,p_lead,current_plan.source_proposal_id,p_data,p_pdf,p_actor,next_version);
 update contracts set superseded_by=p_id where lead_id=p_lead and id<>p_id and superseded_by is null;
 if current_plan.source_proposal_id is not null then update proposals set status='contract_generated' where id=current_plan.source_proposal_id;end if;
 insert into activities(lead_id,user_id,type,event_type,content,occurred_at,metadata) values(p_lead,p_actor,'note','contract_generated','Contrato gerado',now(),jsonb_build_object('contract_id',p_id,'version',next_version));
 return p_id;
end $$;
revoke all on function public.crm_register_contract(uuid,uuid,uuid,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.crm_register_contract(uuid,uuid,uuid,jsonb,text,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
