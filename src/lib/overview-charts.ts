import {stages} from './crm-types';
import {activityLabels,localDay,insights} from './crm-insights';

export type ChartGroup={id:string;label:string;value:number;ids?:string[]};
export function overviewFinancials(model:ReturnType<typeof insights>){
 const amount=(leads:typeof model.leads,key:'confirmed_value'|'estimated_value')=>{
  const known=leads.filter(l=>l[key]!=null);
  return {value:known.length?known.reduce((n,l)=>n+Number(l[key]),0):leads.length?null:0,unknown:leads.length-known.length,count:leads.length,ids:leads.map(l=>l.id)};
 };
 const won=amount(model.wins,'confirmed_value'),lost=amount(model.losses,'estimated_value'),potential=amount(model.active,'estimated_value');
 const daily=model.series.map(row=>{const wins=model.wins.filter(l=>localDay(l.closed_at!)===row.day),losses=model.losses.filter(l=>localDay(l.closed_at!)===row.day);return {day:row.day,won:amount(wins,'confirmed_value').value,lost:amount(losses,'estimated_value').value};});
 const funnel=stages.filter(s=>!['fechado','perdido','nutricao','descartado'].includes(s.slug)).map(s=>({...s,...amount(model.active.filter(l=>l.status===s.slug),'estimated_value')}));
 return {won,lost,potential,daily,funnel};
}
export function overviewCharts(model:ReturnType<typeof insights>,now:Date){
 const scheduled=new Set(model.pending.map(t=>t.lead_id).filter(Boolean));
 const coverage:ChartGroup[]=[
  {id:'scheduled',label:'Com próximo passo',value:0,ids:[]},
  {id:'missing',label:'Sem próximo passo',value:0,ids:[]},
 ];
 model.active.forEach(lead=>{const group=coverage[scheduled.has(lead.id)?0:1];group.value++;group.ids!.push(lead.id);});
 const today=localDay(now),weekEnd=now.getTime()+7*86400000;
 const tasks:ChartGroup[]=[{id:'overdue',label:'Vencidas',value:0},{id:'today',label:'Hoje',value:0},{id:'week',label:'Até 7 dias',value:0},{id:'later',label:'Depois',value:0},{id:'undated',label:'Sem prazo',value:0}];
 model.pending.forEach(task=>{const key=!task.due_at?'undated':new Date(task.due_at)<now?'overdue':localDay(task.due_at)===today?'today':new Date(task.due_at).getTime()<=weekEnd?'week':'later';tasks.find(g=>g.id===key)!.value++;});
 const sources:ChartGroup[]=model.sources.slice(0,4).map(s=>({id:s.label,label:s.label,value:s.count,ids:model.leads.filter(l=>(l.source||'Não informado')===s.label).map(l=>l.id)}));
 const rest=model.sources.slice(4);if(rest.length)sources.push({id:'other',label:'Outras origens',value:rest.reduce((n,s)=>n+s.count,0),ids:model.leads.filter(l=>rest.some(s=>s.label===(l.source||'Não informado'))).map(l=>l.id)});
 const activity:ChartGroup[]=Object.entries(Object.groupBy(model.events,e=>e.event_type||'other')).map(([id,events])=>({id,label:activityLabels[id]||'Outras atividades',value:events!.length})).sort((a,b)=>b.value-a.value);
 return {coverage,tasks,sources,activity,stages:stages.map(s=>({id:s.slug,label:s.name.replace('Fechado — ','').replace('Em negociação','Negociação'),value:model.leads.filter(l=>l.status===s.slug).length,color:s.color})).filter(s=>s.value>0)};
}
