import {NextResponse} from 'next/server';
import {isSameOriginMutation} from '@/lib/admin-users';
import {requireCrm,uuid,text,money} from '@/lib/crm-server';
export async function POST(request:Request){
 if(!isSameOriginMutation(request))return NextResponse.json({error:'Origem não permitida.'},{status:403});
 const access=await requireCrm();if('error' in access)return access.error;
 try{const raw=await request.text();if(raw.length>20000)throw new Error('Ficha muito grande.');const body=JSON.parse(raw);
 if(!uuid(body.lead_id)||typeof body.plan_id!=='string')throw new Error('Ficha inválida.');
 const clean=(object:unknown,keys:string[])=>{const input=object as Record<string,unknown>;const result:Record<string,string>={};for(const key of keys)result[key]=text(input?.[key]||'',2000);return result;};
 const client=clean(body.client,['nome','doc','endereco','email','telefone']);
 const project=clean(body.project,['tipo','dominio','paginas','funcionalidades','prazo','rodadas']);
 const terms=clean(body.terms,['entrada_pct','vencimento','forma_pagamento','valor_hora','custo_hospedagem','custo_dominio','custo_licencas','custo_manutencao']);
 if(terms.entrada_pct&&(Number(terms.entrada_pct)<0||Number(terms.entrada_pct)>100||!Number.isFinite(Number(terms.entrada_pct))))throw new Error('Entrada deve ser de 0 a 100%.');
 if(terms.vencimento&&(!Number.isInteger(Number(terms.vencimento))||Number(terms.vencimento)<1||Number(terms.vencimento)>31))throw new Error('Vencimento deve ser entre 1 e 31.');
 if(!Array.isArray(body.addons)||body.addons.some((a:{id:unknown;qty:unknown})=>typeof a.id!=='string'||!Number.isInteger(a.qty)||Number(a.qty)<1||Number(a.qty)>20))throw new Error('Extras inválidos.');
 const {data,error}=await access.admin.rpc('crm_save_lead_plan',{p_lead:body.lead_id,p_plan:body.plan_id,p_addons:body.addons,p_client:client,p_project:project,p_terms:terms,p_setup:money(body.custom_setup),p_monthly:money(body.custom_monthly),p_actor:access.user.id,p_proposal:null});
 if(error)throw new Error(error.message);return NextResponse.json({data});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Falha ao salvar ficha.'},{status:400});}
}
