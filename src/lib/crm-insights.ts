import type { Lead, LeadStatus } from './crm-types';

export type CrmActivity = { id: string; lead_id: string; user_id: string | null; type: string; event_type: string | null; content: string; created_at: string; occurred_at: string | null; metadata: Record<string, unknown> };
export type CrmTask = { id: string; lead_id: string | null; title: string; description: string | null; assigned_to: string | null; due_at: string | null; done: boolean; cancelled_at: string | null; completed_at: string | null; priority: string; created_at: string };
export type CrmProposal = { id: string; lead_id: string; title: string; status: string; quoted_value: number | null; total_setup: number | null; total_monthly: number | null; expires_at: string; created_at: string; sent_at?: string | null; chosen_at: string | null; version: number; note: string | null };
export type CrmDataset = { leads: Lead[]; activities: CrmActivity[]; tasks: CrmTask[]; proposals: CrmProposal[]; profiles: { id: string; full_name: string }[]; trackingSince: string | null };
export type CrmFilters = { ids?: string[]; stage?: string; segment?: string; source?: string; priority?: string; temperature?: string; service?: string; website?: string; owner?: string; query?: string; action?: string; from?: string; to?: string };
export const inactiveStages = new Set<LeadStatus>(['fechado','perdido','nutricao','descartado']);
export const isActiveLead = (lead: Lead) => !inactiveStages.has(lead.status);
export const currency = (value: number | null | undefined) => value == null ? 'Não informado' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
export const localDay = (value: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(value));
export const dateLabel = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone:'America/Sao_Paulo', dateStyle:'short', timeStyle:'short' }).format(new Date(value)) : 'Sem data';
export const activityLabels: Record<string,string> = { lead_created:'Lead cadastrado', stage_changed:'Etapa alterada', contact_sent:'Contato registrado', reply_received:'Resposta recebida', call_logged:'Ligação registrada', meeting_logged:'Reunião registrada', note_added:'Nota', task_completed:'Tarefa concluída', proposal_sent:'Proposta enviada', proposal_updated:'Proposta atualizada', proposal_viewed:'Proposta visualizada', proposal_chosen:'Plano escolhido', lost_recorded:'Negócio perdido', won_recorded:'Negócio ganho', reopened:'Lead reaberto', contract_generated:'Contrato gerado', contract_signed:'Contrato assinado', lead_updated:'Cadastro atualizado' };
export const lostReasons = ['Concorrente contratado','Preço','Sem orçamento','Sem necessidade','Sem interesse','Timing','Sem resposta após tentativas','Outro'];
export const discardReasons = ['Duplicado','Inválido','Fora do público-alvo','Cadastro de teste','Outro'];
export function matchesLead(lead: Lead, f: CrmFilters) {
  return (f.action!=='proposals' || lead.open_proposal===true) && (!f.ids || f.ids.includes(lead.id)) && (!f.stage || lead.status===f.stage) && (!f.segment || (lead.segment||'Não informado')===f.segment) && (!f.source || lead.source===f.source) && (!f.priority || lead.priority===f.priority) && (!f.temperature || lead.lead_temperature===f.temperature) && (!f.service || lead.service_interest?.includes(f.service)) && (!f.website || lead.website_presence===f.website) && (!f.owner || lead.assigned_to===f.owner) && (!f.query || [lead.name,lead.phone,lead.email,lead.notes,lead.address,lead.website,lead.lost_reason,lead.discard_reason].some(v=>v?.toLocaleLowerCase('pt-BR').includes(f.query!.toLocaleLowerCase('pt-BR'))));
}
export function inPeriod(value: string | null | undefined, from?: string, to?: string) {
  if (!value) return false;
  const day=localDay(value);
  return (!from || day>=from) && (!to || day<=to);
}
export function contactIds(activities: CrmActivity[]) {
 return new Set(activities.filter(a=>['contact_sent','call_logged'].includes(a.event_type||'') || a.type==='email').map(a=>a.lead_id));
}
export function leadScore(lead: Lead) {
 const reasons: { label:string; points:number }[]=[];
 if (lead.website_presence==='Sem site') reasons.push({label:'Sem site, informado na ficha',points:25});
 if (lead.service_interest?.length) reasons.push({label:'Serviço de interesse registrado',points:20});
 if (lead.purchase_timeline==='Imediato' || lead.purchase_timeline==='Até 30 dias') reasons.push({label:'Prazo de compra próximo, informado',points:25});
 if (lead.budget_range==='Dentro da faixa' || lead.budget_range==='Acima da faixa') reasons.push({label:'Orçamento informado compatível',points:20});
 if (lead.contact_name) reasons.push({label:'Responsável identificado',points:10});
 return { value: reasons.length ? reasons.reduce((s,r)=>s+r.points,0) : null, reasons };
}
export function insights(data: CrmDataset, filters: CrmFilters, now = new Date(), stagnationDays = 14) {
 const leads=data.leads.filter(l=>matchesLead(l,filters)), ids=new Set(leads.map(l=>l.id));
 const allEvents=data.activities.filter(a=>ids.has(a.lead_id));
 const events=allEvents.filter(a=>inPeriod(a.occurred_at||a.created_at,filters.from,filters.to));
 const contacted=contactIds(events), replied=new Set(events.filter(a=>a.event_type==='reply_received' && contacted.has(a.lead_id)).map(a=>a.lead_id));
 const everContacted=contactIds(allEvents), active=leads.filter(isActiveLead);
 const tasks=data.tasks.filter(t=>!t.lead_id || ids.has(t.lead_id));
 const pending=tasks.filter(t=>!t.done && !t.cancelled_at);
 const overdue=pending.filter(t=>t.due_at && new Date(t.due_at)<now);
 const proposals=data.proposals.filter(p=>ids.has(p.lead_id));
 const openProposals=proposals.filter(p=>['sent','viewed','chosen','accepted'].includes(p.status) && new Date(p.expires_at)>=now);
 const wins=leads.filter(l=>l.status==='fechado' && inPeriod(l.closed_at,filters.from,filters.to));
 const losses=leads.filter(l=>l.status==='perdido' && inPeriod(l.closed_at,filters.from,filters.to));
 const known=active.filter(l=>l.estimated_value!=null);
 const stagnant=active.filter(l=>new Date(l.last_activity_at||l.created_at||now).getTime()<now.getTime()-stagnationDays*86400000);
 const noNext=active.filter(l=>!pending.some(t=>t.lead_id===l.id));
 const firstContact=leads.map(l=>{const event=allEvents.filter(a=>a.lead_id===l.id && (['contact_sent','call_logged'].includes(a.event_type||'') || a.type==='email')).sort((a,b)=>new Date(a.occurred_at||a.created_at).getTime()-new Date(b.occurred_at||b.created_at).getTime())[0];return {l,event};}).filter(({l,event})=>event && l.created_at && inPeriod(event.occurred_at||event.created_at,filters.from,filters.to));
 const delays=firstContact.map(({l,event})=>(new Date(event.occurred_at||event.created_at).getTime()-new Date(l.created_at!).getTime())/3600000).filter(n=>n>=0);
 const group=(key:(lead:Lead)=>string)=>Object.entries(Object.groupBy(leads,key)).map(([label,rows])=>{const groupLeads=rows||[];const groupIds=new Set(groupLeads.map(l=>l.id));const c=[...contacted].filter(id=>groupIds.has(id)).length;const r=[...replied].filter(id=>groupIds.has(id)).length;return {label,count:groupLeads.length,contacted:c,replied:r,wins:wins.filter(l=>groupIds.has(l.id)).length,responseRate:c?r/c*100:null};}).sort((a,b)=>b.count-a.count);
 const buckets=new Map<string,{day:string;created:number;contacted:number;replied:number;proposals:number;wins:number}>();
 const bucket=(day:string)=>{if(!buckets.has(day))buckets.set(day,{day,created:0,contacted:0,replied:0,proposals:0,wins:0});return buckets.get(day)!;};
 if(filters.from && filters.to){const start=new Date(filters.from+'T12:00:00-03:00');const end=new Date(filters.to+'T12:00:00-03:00');for(let d=start;d<=end;d=new Date(d.getTime()+86400000))bucket(localDay(d));}
 leads.filter(l=>inPeriod(l.created_at,filters.from,filters.to)).forEach(l=>bucket(localDay(l.created_at!)).created++);
 const seen=new Set<string>();
 events.forEach(a=>{const metric=['contact_sent','call_logged'].includes(a.event_type||'') || a.type==='email'?'contacted':a.event_type==='reply_received'?'replied':null;if(metric){const day=localDay(a.occurred_at||a.created_at);const key=day+metric+a.lead_id;if(!seen.has(key)){bucket(day)[metric]++;seen.add(key);}}});
 proposals.filter(p=>p.status!=='draft' && inPeriod(p.sent_at,filters.from,filters.to)).forEach(p=>bucket(localDay(p.sent_at!)).proposals++);
 wins.forEach(l=>bucket(localDay(l.closed_at!)).wins++);
 const reasons=Object.entries(Object.groupBy(losses,l=>l.lost_reason||'Não informado')).map(([label,rows])=>({label,count:rows?.length||0})).sort((a,b)=>b.count-a.count);
 return { leads,active,events,tasks,pending,overdue,openProposals,wins,losses,known,stagnant,noNext,uncontacted:active.filter(l=>!everContacted.has(l.id)&&!l.last_contact_at),ready:active.filter(l=>l.status==='pronto'),pipelineValue:known.reduce((s,l)=>s+Number(l.estimated_value),0),unknownValue:active.length-known.length,revenue:wins.reduce((s,l)=>s+Number(l.confirmed_value||0),0),unknownRevenue:wins.filter(l=>l.confirmed_value==null).length,winRate:wins.length+losses.length?wins.length/(wins.length+losses.length)*100:null,responseRate:contacted.size?replied.size/contacted.size*100:null,contacted:contacted.size,replied:replied.size,meanContactHours:delays.length?delays.reduce((s,n)=>s+n,0)/delays.length:null,sources:group(l=>l.source||'Não informado'),segments:group(l=>l.segment||'Não informado'),reasons,series:[...buckets.values()].sort((a,b)=>a.day.localeCompare(b.day)) };
}

export const proposalStatusLabels: Record<string,string> = {draft:'Rascunho',sent:'Enviada',viewed:'Visualizada',chosen:'Plano escolhido',accepted:'Aceita',rejected:'Recusada',contract_generated:'Contrato gerado',signed:'Assinada',expired:'Expirada',cancelled:'Cancelada'};
export const contractStatusLabels: Record<string,string> = {generated:'Gerado',sent:'Enviado',signed:'Assinado',cancelled:'Cancelado'};
