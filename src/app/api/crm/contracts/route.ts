import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {requireCrm,uuid} from '@/lib/crm-server';
import {isSameOriginMutation} from '@/lib/admin-users';
import {contractText,validateContract,type ContractSnapshot} from '@/lib/contract-data';
import {contractPdf} from '@/lib/contract-pdf';
import type {SupabaseClient} from '@supabase/supabase-js';
export const runtime='nodejs';
export const maxDuration=60;
async function snapshot(admin:SupabaseClient,leadId:string){
 const [p,c]=await Promise.all([admin.from('lead_plan').select('*').eq('lead_id',leadId).single(),admin.from('company_settings').select('*').eq('id',1).single()]);
 if(p.error||c.error)throw new Error('Salve a ficha de plano e configure a empresa antes de gerar.');
 const [plan,addons]=await Promise.all([admin.from('plans').select('*').eq('id',p.data.plan_id).single(),admin.from('plan_addons').select('*').in('id',p.data.addons.map((a:{id:string})=>a.id))]);
 if(plan.error||addons.error)throw new Error('Não foi possível carregar plano e extras.');
 const selectedAddons=(addons.data||[]).map(a=>({...a,qty:p.data.addons.find((s:{id:string;qty:number})=>s.id===a.id)?.qty||1}));
 if(plan.data.on_request)plan.data.monthly_breakdown=Object.fromEntries(['hospedagem','dominio','licencas','manutencao'].map(k=>[k,Number(p.data.terms['custo_'+k]||0)]));
 return {lead_plan:p.data,company:c.data,plan:plan.data,addons:selectedAddons,generated_at:new Date().toISOString()} as ContractSnapshot;
}
export async function GET(request:Request){
 const access=await requireCrm();if('error' in access)return access.error;
 const query=new URL(request.url).searchParams;
 try{
 if(query.get('list')){const [contracts,plans]=await Promise.all([access.admin.from('contracts').select('id,lead_id,version,status,created_at,pdf_path,signed_pdf_path,superseded_by,data').order('created_at',{ascending:false}),access.admin.from('lead_plan').select('lead_id,updated_at')]);if(contracts.error||plans.error)throw new Error('Não foi possível carregar contratos.');return NextResponse.json({data:contracts.data.map(c=>({...c,data:undefined,stale:Boolean(c.superseded_by)||(plans.data.find(p=>p.lead_id===c.lead_id)?.updated_at!==c.data?.lead_plan?.updated_at)}))},{headers:{'Cache-Control':'private, no-store'}});}
 if(query.get('preview')){const id=query.get('lead_id');if(!uuid(id))throw new Error('Lead inválido.');const data=await snapshot(access.admin,id);return NextResponse.json({text:contractText(data)},{headers:{'Cache-Control':'private, no-store'}});}
 const id=query.get('id');if(!uuid(id))throw new Error('Contrato inválido.');
 const {data,error}=await access.admin.from('contracts').select('pdf_path,signed_pdf_path').eq('id',id).single();if(error)throw new Error('Contrato não encontrado.');
 const path=query.get('kind')==='signed'?data.signed_pdf_path:data.pdf_path;if(!path)throw new Error('PDF ainda não disponível.');
 const {data:signed,error:signError}=await access.admin.storage.from('contracts').createSignedUrl(path,60);if(signError)throw new Error('Não foi possível abrir o arquivo.');
 return NextResponse.redirect(signed.signedUrl,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Falha ao abrir contrato.'},{status:400});}
}
export async function POST(request:Request){
 if(!isSameOriginMutation(request))return NextResponse.json({error:'Origem não permitida.'},{status:403});
 const access=await requireCrm();if('error' in access)return access.error;
 try{
 if(request.headers.get('content-type')?.includes('multipart/form-data')){
  if(Number(request.headers.get('content-length')||0)>21*1024*1024)throw new Error('Envie um PDF de até 20 MB.');
  const form=await request.formData();const id=form.get('id'),file=form.get('file');if(!uuid(id)||!(file instanceof File)||file.size>20*1024*1024||file.type!=='application/pdf')throw new Error('Envie um PDF de até 20 MB.');
  const bytes=Buffer.from(await file.arrayBuffer());if(bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('Arquivo PDF inválido.');
  const {data:contract,error}=await access.admin.from('contracts').select('id,lead_id,proposal_id,status,signed_pdf_path').eq('id',id).single();if(error||!contract)throw new Error('Contrato não encontrado.');
  const path=`${contract.lead_id}/${id}/assinado-${randomUUID()}.pdf`;
  const upload=await access.admin.storage.from('contracts').upload(path,bytes,{contentType:'application/pdf'});if(upload.error)throw new Error('Não foi possível guardar o PDF assinado.');
  const update=await access.admin.rpc('crm_mark_contract_signed',{p_id:id,p_path:path,p_actor:access.user.id});if(update.error){await access.admin.storage.from('contracts').remove([path]);throw new Error(update.error.message);}
  return NextResponse.json({data:{id}});
 }
 const body=await request.json();
 if(body.mode==='prepare_upload'||body.mode==='finish_upload'){
  if(!uuid(body.id))throw new Error('Contrato inválido.');
  const {data:contract,error}=await access.admin.from('contracts').select('id,lead_id,status').eq('id',body.id).single();if(error||!contract||contract.status==='cancelled')throw new Error('Contrato indisponível.');
  if(body.mode==='prepare_upload'){const path=contract.lead_id+'/'+body.id+'/assinado-'+randomUUID()+'.pdf';const {data,error}=await access.admin.storage.from('contracts').createSignedUploadUrl(path);if(error)throw new Error('Não foi possível preparar o envio.');return NextResponse.json({data:{path,token:data.token}});}
  const prefix=contract.lead_id+'/'+body.id+'/assinado-';if(typeof body.path!=='string'||!body.path.startsWith(prefix)||!uuid(body.path.slice(prefix.length,-4))||!body.path.endsWith('.pdf'))throw new Error('Caminho inválido.');
  const downloaded=await access.admin.storage.from('contracts').download(body.path);if(downloaded.error||!downloaded.data)throw new Error('Arquivo não encontrado.');
  if(downloaded.data.size>20*1024*1024)throw new Error('Envie um PDF de até 20 MB.');const header=Buffer.from(await downloaded.data.slice(0,5).arrayBuffer()).toString();if(header!=='%PDF-')throw new Error('Arquivo PDF inválido.');
  const update=await access.admin.rpc('crm_mark_contract_signed',{p_id:body.id,p_path:body.path,p_actor:access.user.id});if(update.error)throw new Error(update.error.message);return NextResponse.json({data:{id:body.id}});
 }
 if(!uuid(body.lead_id))throw new Error('Lead inválido.');
 const data=await snapshot(access.admin,body.lead_id);validateContract(data);
 const monthly=Object.values(data.plan.monthly_breakdown).reduce((s,v)=>s+Number(v||0),0)+data.addons.filter(a=>a.kind==='monthly').reduce((s,a)=>s+a.price*a.qty,0);
 if(!Number.isFinite(monthly)||Math.abs(monthly-Number(data.lead_plan.total_monthly))>.01)throw new Error('A composição da mensalidade mudou ou está incompleta. Revise e salve a ficha antes de gerar.');
 const signatures=await Promise.all(data.company.partners.map(async p=>{const {data:file,error}=await access.admin.storage.from('signatures').download(p.signature_path!);if(error||!file)throw new Error('Assinatura não disponível no armazenamento privado.');return 'data:image/png;base64,'+Buffer.from(await file.arrayBuffer()).toString('base64');}));
 const pdf=await contractPdf(data,signatures);const id=randomUUID();const slug=data.lead_plan.client.nome.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,80);
 const path=`${body.lead_id}/${id}/contrato-${slug}-${data.generated_at.slice(0,10)}.pdf`;
 const upload=await access.admin.storage.from('contracts').upload(path,pdf,{contentType:'application/pdf'});if(upload.error)throw new Error('Não foi possível guardar o PDF.');
 const saved=await access.admin.rpc('crm_register_contract',{p_id:id,p_lead:body.lead_id,p_actor:access.user.id,p_data:data,p_pdf:path,p_updated:data.lead_plan.updated_at});
 if(saved.error){await access.admin.storage.from('contracts').remove([path]);throw new Error(saved.error.message);}
 return NextResponse.json({data:{id}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Falha ao gerar contrato.'},{status:400});}
}
