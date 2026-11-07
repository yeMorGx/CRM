import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireCrm,uuid,text,money } from '@/lib/crm-server';
import { isSameOriginMutation } from '@/lib/admin-users';
import { stages } from '@/lib/crm-types';
import { lostReasons,discardReasons } from '@/lib/crm-insights';
export async function POST(request:Request) {
 if(!isSameOriginMutation(request))return NextResponse.json({error:'Origem não permitida.'},{status:403});
 const access=await requireCrm();if('error' in access)return access.error;
 try{
  const raw=await request.text();if(raw.length>30000)throw new Error('Dados muito grandes.');
  const body=JSON.parse(raw);const action=body.action;let result;
  if(action==='delete_lead'){
   if(!uuid(body.id))throw new Error('Lead inválido.');
   const name=text(body.confirm_name,300,true);
   const response=await access.client.from('leads').delete().eq('id',body.id).eq('name',name).select('id').maybeSingle();
   if(response.error)throw new Error('Não foi possível apagar o lead. Tente novamente.');
   if(!response.data)return NextResponse.json({error:'O lead não existe mais ou o nome mudou. Reabra a ficha antes de apagar.'},{status:409});
   result=response.data;
  }else if(action==='lead'){
   if(!uuid(body.id))throw new Error('Lead inválido.');
   const patch:Record<string,unknown>={};const values=body.values||{};
   for(const key of ['name','phone','email','address','website','notes','contact_name','pain_point','segment','source','website_presence','purchase_timeline','budget_range','lost_reason','discard_reason'])if(key in values)patch[key]=text(values[key],key==='notes'||key==='pain_point'?5000:300,key==='name')||null;
   for(const [key,allowed] of Object.entries({lead_temperature:['frio','morno','quente'],priority:['baixa','media','alta']}))if(key in values){if(values[key]&&!allowed.includes(values[key]))throw new Error('Opção inválida.');patch[key]=values[key]||null;}
   if('service_interest' in values){if(!Array.isArray(values.service_interest)||values.service_interest.length>10)throw new Error('Serviços inválidos.');patch.service_interest=values.service_interest.map((v:unknown)=>text(v,100));}
   for(const key of ['estimated_value','confirmed_value'])if(key in values)patch[key]=money(values[key]);
   if('assigned_to' in values){if(values.assigned_to&&!uuid(values.assigned_to))throw new Error('Responsável inválido.');if(values.assigned_to){const {data}=await access.admin.from('profiles').select('id').eq('id',values.assigned_to).eq('is_allowed',true).maybeSingle();if(!data)throw new Error('Responsável sem acesso.');}patch.assigned_to=values.assigned_to||null;}
   if('digital_assessment' in values){const assessment:Record<string,string>={};for(const key of ['responsividade','ux','velocidade','seo_local','integracao_pedidos'])if(values.digital_assessment?.[key])assessment[key]=text(values.digital_assessment[key],1000);patch.digital_assessment=assessment;}
   if('status' in values){if(!stages.some(s=>s.slug===values.status))throw new Error('Etapa inválida.');patch.status=values.status;if(values.status==='perdido'&&!lostReasons.includes(String(patch.lost_reason)))throw new Error('Escolha um motivo de perda.');if(values.status==='descartado'&&!discardReasons.includes(String(patch.discard_reason)))throw new Error('Escolha um motivo de descarte.');}
   if(patch.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(patch.email)))throw new Error('E-mail inválido.');
   const response=await access.client.from('leads').update(patch).eq('id',body.id).select().single();if(response.error)throw new Error(response.error.message);result=response.data;
  }else if(action==='activity'){
   if(!uuid(body.lead_id)||!uuid(body.request_id))throw new Error('Registro inválido.');
   if(!['contact_sent','reply_received','call_logged','meeting_logged','note_added'].includes(body.event_type))throw new Error('Tipo de atividade inválido.');
   const response=await access.admin.rpc('crm_record_activity',{p_lead:body.lead_id,p_actor:access.user.id,p_event:body.event_type,p_content:text(body.content,5000,true),p_request:body.request_id});if(response.error)throw new Error(response.error.message);result=response.data;
  }else if(action==='task'){
   if(body.lead_id&&!uuid(body.lead_id))throw new Error('Lead inválido.');
   if(body.assigned_to&&!uuid(body.assigned_to))throw new Error('Responsável inválido.');
   const due=body.due_at?new Date(body.due_at):null;if(due&&Number.isNaN(due.getTime()))throw new Error('Prazo inválido.');
   const response=await access.client.from('tasks').insert({title:text(body.title,250,true),description:text(body.description||'',2000)||null,lead_id:body.lead_id||null,assigned_to:body.assigned_to||access.user.id,due_at:due?.toISOString()||null,priority:['baixa','media','alta'].includes(body.priority)?body.priority:'media',created_by:access.user.id}).select().single();if(response.error)throw new Error(response.error.message);result=response.data;
  }else if(action==='task_status'){
   if(!uuid(body.id)||!['done','pending','cancelled'].includes(body.status))throw new Error('Tarefa inválida.');
   const response=await access.client.from('tasks').update({done:body.status==='done',cancelled_at:body.status==='cancelled'?new Date().toISOString():null}).eq('id',body.id).select().single();if(response.error)throw new Error(response.error.message);result=response.data;
  }else if(action==='proposal'){
   if(!uuid(body.lead_id)||!['draft','sent'].includes(body.status))throw new Error('Proposta inválida.');
   const visible=Array.isArray(body.visible_plan_ids)?body.visible_plan_ids:[];if(!visible.length)throw new Error('Selecione ao menos um plano.');
   const {data:plans,error}=await access.admin.from('plans').select('id').eq('active',true).in('id',visible);if(error||plans?.length!==visible.length)throw new Error('Plano indisponível.');
   let version=1;if(body.previous_id){if(!uuid(body.previous_id))throw new Error('Versão anterior inválida.');const {data:previous}=await access.admin.from('proposals').select('id,lead_id,version').eq('id',body.previous_id).single();if(!previous||previous.lead_id!==body.lead_id)throw new Error('Proposta anterior inválida.');version=previous.version+1;}
   const days=[7,15,30].includes(Number(body.days))?Number(body.days):15;
   const response=await access.admin.from('proposals').insert({lead_id:body.lead_id,title:text(body.title||'Proposta comercial',180,true),token:randomBytes(24).toString('base64url'),status:body.status,visible_plan_ids:visible,highlighted_plan_id:visible.includes(body.highlighted_plan_id)?body.highlighted_plan_id:visible[0],expires_at:new Date(Date.now()+days*86400000).toISOString(),created_by:access.user.id,quoted_value:money(body.quoted_value),note:text(body.note||'',2000)||null,version,previous_id:body.previous_id||null}).select().single();if(response.error)throw new Error(response.error.message);result=response.data;
  }else if(action==='proposal_status'){
   if(!uuid(body.id)||!['sent','accepted','rejected','cancelled'].includes(body.status))throw new Error('Status inválido.');
   const response=await access.admin.rpc('crm_attributed_update',{p_table:'proposals',p_key:body.id,p_values:{status:body.status},p_actor:access.user.id});if(response.error||!response.data)throw new Error('Não foi possível atualizar a proposta.');result=response.data;
  }else throw new Error('Ação desconhecida.');
  return NextResponse.json({data:result});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Não foi possível salvar.'},{status:400});}
}
