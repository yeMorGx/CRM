import {NextResponse} from 'next/server';
import {requireCrm,uuid} from '@/lib/crm-server';
export async function GET(request:Request){
 const access=await requireCrm();if('error' in access)return access.error;
 const id=new URL(request.url).searchParams.get('id');if(!uuid(id))return NextResponse.json({error:'Lead inválido.'},{status:400});
 const [lead,proposals,plan,contracts,plans,addons]=await Promise.all([
  access.client.from('leads').select('*').eq('id',id).single(),
  access.admin.from('proposals').select('*').eq('lead_id',id).order('created_at',{ascending:false}),
  access.admin.from('lead_plan').select('*').eq('lead_id',id).maybeSingle(),
  access.admin.from('contracts').select('id,version,status,created_at,pdf_path,signed_pdf_path,superseded_by,data').eq('lead_id',id).order('version',{ascending:false}),
  access.admin.from('plans').select('*').eq('active',true).order('sort'),
  access.admin.from('plan_addons').select('*').eq('active',true)
 ]);
 if(lead.error||proposals.error||plan.error||contracts.error||plans.error||addons.error)return NextResponse.json({error:'Não foi possível carregar a ficha comercial.'},{status:503});
 return NextResponse.json({lead:lead.data,proposals:proposals.data,plan:plan.data,contracts:contracts.data,plans:plans.data,addons:addons.data},{headers:{'Cache-Control':'private, no-store'}});
}
