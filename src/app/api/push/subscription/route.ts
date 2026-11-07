import {NextResponse} from 'next/server';
import {requireCrm} from '@/lib/crm-server';
import {isSameOriginMutation} from '@/lib/admin-users';
import {pushConfigured} from '@/lib/web-push-server';
import {validPushEndpoint,validPushKeys} from '@/lib/push-validation';

export async function GET(){const access=await requireCrm();if('error' in access)return access.error;const {error}=await access.admin.from('push_subscriptions').select('id',{head:true,count:'exact'});return NextResponse.json({configured:pushConfigured()&&!error,publicKey:process.env.WEB_PUSH_PUBLIC_KEY||null},{headers:{'Cache-Control':'private, no-store'}});}
export async function POST(request:Request){
 if(!isSameOriginMutation(request))return NextResponse.json({error:'Origem não permitida.'},{status:403});
 const access=await requireCrm();if('error' in access)return access.error;
 try{const raw=await request.text();if(raw.length>8000)throw Error('Assinatura inválida.');const body=JSON.parse(raw);if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Dados inválidos.");if(!validPushEndpoint(body.endpoint)||!validPushKeys(body.keys))throw Error('Assinatura de navegador inválida.');
 const {data:allowed,error:rateError}=await access.admin.rpc('crm_check_rate',{p_key:`push-register:${access.user.id}`});if(rateError||!allowed)return NextResponse.json({error:'Aguarde um minuto e tente novamente.'},{status:429});
 const {data:existing,error:readError}=await access.admin.from('push_subscriptions').select('id,user_id').eq('endpoint',body.endpoint).maybeSingle();if(readError)throw Error('Serviço de avisos indisponível.');
 if(existing&&existing.user_id!==access.user.id)return NextResponse.json({error:'Este navegador estava vinculado a outra conta. Desative e ative os avisos novamente.'},{status:409});
 const row={user_id:access.user.id,endpoint:body.endpoint,p256dh:body.keys.p256dh,auth:body.keys.auth,updated_at:new Date().toISOString()};
 const result=existing?await access.admin.from('push_subscriptions').update(row).eq('id',existing.id).eq('user_id',access.user.id):await access.admin.from('push_subscriptions').insert(row);if(result.error)throw Error('Não foi possível ativar os avisos.');return NextResponse.json({ok:true});
 }catch(cause){return NextResponse.json({error:cause instanceof Error?cause.message:'Falha ao ativar avisos.'},{status:400});}
}
export async function DELETE(request:Request){if(!isSameOriginMutation(request))return NextResponse.json({error:'Origem não permitida.'},{status:403});const access=await requireCrm();if('error' in access)return access.error;const body=await request.json().catch(()=>null);if(!validPushEndpoint(body?.endpoint))return NextResponse.json({error:'Assinatura inválida.'},{status:400});const {error}=await access.admin.from('push_subscriptions').delete().eq('user_id',access.user.id).eq('endpoint',body.endpoint);return NextResponse.json(error?{error:'Não foi possível desativar.'}:{ok:true},{status:error?503:200});}
