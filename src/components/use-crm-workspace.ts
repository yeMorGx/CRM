"use client";
import {useCallback,useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import type {CrmDataset} from '@/lib/crm-insights';
export async function crmRequest(body:Record<string,unknown>,path='/api/crm') {
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível salvar.');
 window.dispatchEvent(new Event('crm:changed'));const feedback=path==='/api/crm'?String(body.action):path==='/api/crm/plan'?'plan':path==='/api/crm/contracts'?(body.mode==='finish_upload'?'signed':!body.mode?'contract':''):'';if(feedback)window.dispatchEvent(new CustomEvent('crm:feedback',{detail:feedback}));return result.data;
}
export function useCrmWorkspace(){
 const [data,setData]=useState<CrmDataset|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const refresh=useCallback(async()=>{setError('');try{const response=await fetch('/api/crm/workspace',{cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.error);setData(result);}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar o CRM.');}finally{setLoading(false);}},[]);
 useEffect(()=>{void Promise.resolve().then(refresh);const listener=()=>void refresh();window.addEventListener('crm:changed',listener);window.addEventListener('focus',listener);return()=>{window.removeEventListener('crm:changed',listener);window.removeEventListener('focus',listener);};},[refresh]);
 return {data,error,loading,refresh};
}

export function useCrmClock(){const [now,setNow]=useState(()=>new Date());useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60000);return()=>window.clearInterval(timer);},[]);return now;}

export async function uploadSignedContract(id:string,file:File){
 if(file.type!=='application/pdf'||file.size>20*1024*1024)throw new Error('Envie um PDF de até 20 MB.');
 const header=new TextDecoder().decode(await file.slice(0,5).arrayBuffer());if(header!=='%PDF-')throw new Error('Arquivo PDF inválido.');
 const client=createClient();if(!client)throw new Error('Autenticação indisponível.');
 const ticket=await crmRequest({mode:'prepare_upload',id},'/api/crm/contracts');
 const uploaded=await client.storage.from('contracts').uploadToSignedUrl(ticket.path,ticket.token,file,{contentType:'application/pdf'});if(uploaded.error)throw new Error('Não foi possível enviar o PDF. Tente novamente.');
 await crmRequest({mode:'finish_upload',id,path:ticket.path},'/api/crm/contracts');
}
