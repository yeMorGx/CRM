import {NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {createAdminClient,isSameOriginMutation} from '@/lib/admin-users';
import {text} from '@/lib/crm-server';
export const runtime='nodejs';
async function context(token:string){
 const admin=createAdminClient();if(!admin||!/^[A-Za-z0-9_-]{32}$/.test(token))return null;
 const {data:proposal}=await admin.from('proposals').select('*').eq('token',token).maybeSingle();
 if(!proposal||proposal.status==='draft')return null;
 const {data:company}=await admin.from('company_settings').select('legal_name,whatsapp,email,logo_path').eq('id',1).single();
 let logo:string|null=null;if(company?.logo_path){const {data}=await admin.storage.from('branding').createSignedUrl(company.logo_path,600);logo=data?.signedUrl||null;}
 return {admin,proposal,company:{legal_name:company?.legal_name||'Prospecta',whatsapp:company?.whatsapp||null,email:company?.email||null,logo}};
}
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;const ctx=await context(token);if(!ctx)return NextResponse.json({error:'Proposta não encontrada.'},{status:404});
 const {admin,proposal,company}=ctx;
 const unavailable=['expired','cancelled','rejected'].includes(proposal.status)||new Date(proposal.expires_at)<new Date();
 if(unavailable)return NextResponse.json({available:false,company,status:'expired'},{headers:{'Cache-Control':'no-store'}});
 if(!proposal.first_viewed_at){await admin.from('proposals').update({first_viewed_at:new Date().toISOString(),...(proposal.status==='sent'?{status:'viewed'}:{})}).eq('id',proposal.id).is('first_viewed_at',null);}
 const [plans,addons]=await Promise.all([admin.from('plans').select('*').in('id',proposal.visible_plan_ids).eq('active',true).order('sort'),admin.from('plan_addons').select('*').eq('active',true)]);
 if(plans.error||addons.error)return NextResponse.json({error:'Não foi possível carregar a proposta. Tente novamente.'},{status:503});
 return NextResponse.json({available:true,company,plans:plans.data,addons:addons.data,title:proposal.title,highlighted:proposal.highlighted_plan_id,expires_at:proposal.expires_at,readOnly:['contract_generated','signed','accepted'].includes(proposal.status),chosen_plan_id:proposal.chosen_plan_id,chosen_addons:proposal.chosen_addons||[],total_setup:proposal.total_setup,total_monthly:proposal.total_monthly},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
 if(!isSameOriginMutation(request))return NextResponse.json({error:'Origem não permitida.'},{status:403});
 const {token}=await params;const ctx=await context(token);if(!ctx)return NextResponse.json({error:'Proposta não encontrada.'},{status:404});
 try{
 const ip=request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
 const key=createHash('sha256').update((process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY||'')+ip+token).digest('hex');
 const limit=await ctx.admin.rpc('crm_check_rate',{p_key:key});if(limit.error)throw new Error('Serviço temporariamente indisponível.');if(!limit.data)return NextResponse.json({error:'Muitas tentativas. Aguarde um minuto.'},{status:429});
 const raw=await request.text();if(raw.length>10000)throw new Error('Envio muito grande.');const body=JSON.parse(raw);
 if(body.enterprise_interest){
  if(new Date(ctx.proposal.expires_at)<new Date()||!['sent','viewed','chosen'].includes(ctx.proposal.status)||!ctx.proposal.visible_plan_ids.includes('enterprise'))throw new Error('Proposta indisponível.');
  const {error}=await ctx.admin.from('proposals').update({enterprise_interest:true}).eq('id',ctx.proposal.id);if(error)throw new Error('Não foi possível registrar seu interesse.');return NextResponse.json({data:{interest:true}});
 }
 const client={nome:text(body.nome,140,true),email:text(body.email,180,true),telefone:text(body.telefone,32,true),observacao:text(body.observacao||'',2000)};
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)||client.telefone.replace(/\D/g,'').length<10)throw new Error('Confira seu e-mail e telefone.');
 if(typeof body.plan_id!=='string'||!Array.isArray(body.addons)||body.addons.length>30||body.addons.some((a:{id:unknown;qty:unknown})=>typeof a.id!=='string'||!Number.isInteger(a.qty)||Number(a.qty)<1||Number(a.qty)>20))throw new Error('Escolha um plano e extras válidos.');
 const {data,error}=await ctx.admin.rpc('crm_choose_proposal',{p_token:token,p_plan:body.plan_id,p_addons:body.addons,p_client:client});if(error)throw new Error(error.message);
 return NextResponse.json({data});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Não foi possível confirmar sua escolha.'},{status:400});}
}
