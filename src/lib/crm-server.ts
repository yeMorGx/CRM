import 'server-only';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/admin-users';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function requireCrm() {
 const client=await createClient();
 if(!client)return {error:NextResponse.json({error:'Autenticação não configurada.'},{status:503})} as const;
 const {data:{user}}=await client.auth.getUser();
 if(!user)return {error:NextResponse.json({error:'Entre novamente para continuar.'},{status:401})} as const;
 const {data:profile}=await client.from('profiles').select('id,is_allowed').eq('id',user.id).maybeSingle();
 if(!profile?.is_allowed)return {error:NextResponse.json({error:'Sua conta não tem acesso ao CRM.'},{status:403})} as const;
 const admin=createAdminClient();
 if(!admin)return {error:NextResponse.json({error:'Configure o acesso privado ao banco no servidor.'},{status:503})} as const;
 return {client,admin,user} as const;
}
export async function rows(client:SupabaseClient,table:string,columns='*',orderColumn='id') {
 const result: Record<string,unknown>[]=[];
 for(let page=0;page<100;page++) {
  const {data,error}=await client.from(table).select(columns).order(orderColumn).range(page*1000,page*1000+999);
  if(error)throw new Error('Não foi possível carregar '+table+'. Confira a migration do CRM.');
  result.push(...(data as unknown as Record<string,unknown>[]));
  if(data.length<1000)return result;
 }
 throw new Error('O volume excedeu o limite de consulta. Refine o período antes de continuar.');
}
export const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
export function text(value:unknown,max=250,required=false) {if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new Error('Preencha os campos corretamente.');return value.trim();}
export function money(value:unknown) {if(value===''||value==null)return null;const n=Number(value);if(!Number.isFinite(n)||n<0||n>999999999)throw new Error('Informe um valor válido.');return Math.round(n*100)/100;}
