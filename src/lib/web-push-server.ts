import 'server-only';
import webpush from 'web-push';
import type {SupabaseClient} from '@supabase/supabase-js';
import {validPushEndpoint,validPushKeys} from './push-validation';

export function pushConfigured(){return Boolean(process.env.WEB_PUSH_PUBLIC_KEY&&process.env.WEB_PUSH_PRIVATE_KEY);}
export async function deliverChatPush(admin:SupabaseClient,message:{id:string;sender_id:string}){
 if(!pushConfigured())return;
 const [{data:people,error:peopleError},{data:subscriptions,error:subscriptionError},{data:actor}]=await Promise.all([
  admin.from('profiles').select('id').eq('is_allowed',true).neq('id',message.sender_id),
  admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth'),
  admin.from('chat_profiles').select('full_name').eq('id',message.sender_id).maybeSingle(),
 ]);
 if(peopleError||subscriptionError){console.error('Push delivery unavailable: directory or subscriptions.');return;}
 const allowed=new Set((people||[]).map(p=>p.id));
 const payload=JSON.stringify({id:message.id,senderId:message.sender_id,title:actor?.full_name?`${actor.full_name} enviou uma mensagem`:'Nova mensagem da equipe',body:'Abra a Prospecta para ler no bate-papo.',url:'/?chat=open',tag:`chat-${message.id}`});
 const targets=(subscriptions||[]).filter(s=>allowed.has(s.user_id)&&validPushEndpoint(s.endpoint)&&validPushKeys(s));
 for(let offset=0;offset<targets.length;offset+=10){await Promise.all(targets.slice(offset,offset+10).map(async subscription=>{
  try{await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},payload,{TTL:300,urgency:'high',timeout:8000,vapidDetails:{subject:'https://prospecta-topaz.vercel.app',publicKey:process.env.WEB_PUSH_PUBLIC_KEY!,privateKey:process.env.WEB_PUSH_PRIVATE_KEY!}});}
  catch(cause){const status=(cause as {statusCode?:number}).statusCode;if(status===404||status===410)await admin.from('push_subscriptions').delete().eq('id',subscription.id);else console.error('Push delivery failed',status||'network');}
 }));}
}
