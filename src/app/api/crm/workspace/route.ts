import { NextResponse } from 'next/server';
import { requireCrm,rows } from '@/lib/crm-server';
export async function GET() {
 const access=await requireCrm();if('error' in access)return access.error;
 try {
  const [rawLeads,activities,tasks,proposals,profiles,leadPlans,contracts,plans]=await Promise.all([
   rows(access.client,'leads'),rows(access.client,'activities'),rows(access.client,'tasks'),
   rows(access.admin,'proposals','id,lead_id,title,status,quoted_value,total_setup,total_monthly,expires_at,created_at,sent_at,chosen_at,version,note'),
   rows(access.admin,'profiles','id,full_name'),rows(access.admin,'lead_plan','lead_id,plan_id','lead_id'),rows(access.admin,'contracts','id,lead_id,status,version'),rows(access.admin,'plans','id,name')
  ]);
  const leads=rawLeads.map(lead=>{const selected=leadPlans.find(p=>p.lead_id===lead.id);const contract=contracts.filter(c=>c.lead_id===lead.id).sort((a,b)=>Number(b.version)-Number(a.version))[0];const next=tasks.filter(t=>t.lead_id===lead.id&&!t.done&&!t.cancelled_at&&t.due_at).map(t=>String(t.due_at)).sort()[0];return {...lead,open_proposal:proposals.some(p=>p.lead_id===lead.id&&['sent','viewed','chosen','accepted'].includes(String(p.status))&&new Date(String(p.expires_at))>=new Date()),plan_name:plans.find(p=>p.id===selected?.plan_id)?.name||null,contract_status:contract?.status||null,next_action_at:next||null};});
  const tracked=activities.filter(a=>a.event_type).map(a=>String(a.occurred_at||a.created_at)).sort();
  return NextResponse.json({leads,activities,tasks,proposals,profiles,trackingSince:tracked[0]||null},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Falha ao carregar o CRM.'},{status:503});}
}
