import {NextResponse,after} from 'next/server';
import {randomUUID} from 'node:crypto';
import {requireCrm,uuid} from '@/lib/crm-server';
import {isSameOriginMutation} from '@/lib/admin-users';
import {deliverChatPush} from '@/lib/web-push-server';
export const maxDuration=60;
export async function POST(request:Request){
 if(!isSameOriginMutation(request))return NextResponse.json({error:'Origem não permitida.'},{status:403});
 const access=await requireCrm();if('error' in access)return access.error;
 try{const raw=await request.text();if(raw.length>12000)throw Error('Mensagem muito longa.');const body=JSON.parse(raw);if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Dados inválidos.");const content=typeof body.content==='string'?body.content.trim():'';if(content.length>8000)throw Error('Mensagem muito longa.');
 const path=(value:unknown)=>typeof value==='string'&&value.length<250&&value.startsWith(access.user.id+'/')&&/^[\da-f-]{36}\.(webp|png|jpg|m4a|webm|ogg)$/i.test(value.slice(access.user.id.length+1));
 if(body.image_path&&!path(body.image_path)||body.audio_path&&!path(body.audio_path))throw Error('Arquivo inválido.');
 const audio=body.message_type==='audio';if(audio?!body.audio_path:!content&&!body.image_path)throw Error('A mensagem está vazia.');
 const {data:allowed,error:rateError}=await access.admin.rpc('crm_check_rate',{p_key:`chat-send:${access.user.id}:${Math.floor(Date.now()/10000)}`});if(rateError||!allowed)return NextResponse.json({error:'Muitas mensagens. Aguarde alguns segundos.'},{status:429});
 if(body.id&&!uuid(body.id))throw Error("Identificador de mensagem inválido.");const id=uuid(body.id)?body.id:randomUUID();
 const row={id,sender_id:access.user.id,content,message_type:audio?'audio':'text',image_path:audio?null:body.image_path||null,audio_path:audio?body.audio_path:null,audio_duration_seconds:audio?Math.min(300,Math.max(1,Math.ceil(Number(body.audio_duration_seconds)||1))):null};
 const {data,error}=await access.client.from('messages').insert(row).select('id,content,image_path,message_type,audio_path,audio_duration_seconds,sender_id,created_at').single();
 if(error){if(error.code==='23505'){const {data:previous}=await access.client.from('messages').select('*').eq('id',id).eq('sender_id',access.user.id).maybeSingle();if(previous)return NextResponse.json({data:previous});}throw Error('Não foi possível enviar a mensagem.');}
 after(()=>deliverChatPush(access.admin,{id:data.id,sender_id:access.user.id}));return NextResponse.json({data});
 }catch(cause){return NextResponse.json({error:cause instanceof Error?cause.message:'Falha ao enviar mensagem.'},{status:400});}
}
