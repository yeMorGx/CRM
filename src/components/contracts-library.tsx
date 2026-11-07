"use client";
import {useCallback,useEffect,useState} from 'react';
import {DocumentsWorkspace} from './documents-workspace';
import {useCrmWorkspace,uploadSignedContract} from './use-crm-workspace';
import {dateLabel,contractStatusLabels} from '@/lib/crm-insights';
import type {Lead} from '@/lib/crm-types';
type ContractRow={id:string;lead_id:string;version:number;status:string;created_at:string;pdf_path:string|null;signed_pdf_path:string|null;stale:boolean};
export function CommercialDocuments({onSelect}:{onSelect:(lead:Lead)=>void}){
 const [tab,setTab]=useState('documents');return <div className="crm-commercial"><div className="crm-chart-tabs" role="group" aria-label="Biblioteca"><button aria-pressed={tab==='documents'} onClick={()=>setTab('documents')}>Documentos</button><button aria-pressed={tab==='contracts'} onClick={()=>setTab('contracts')}>Contratos gerados</button></div>{tab==='documents'?<DocumentsWorkspace/>:<ContractsLibrary onSelect={onSelect}/>}</div>;
}
function ContractsLibrary({onSelect}:{onSelect:(lead:Lead)=>void}){
 const {data}=useCrmWorkspace();const [contracts,setContracts]=useState<ContractRow[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/crm/contracts?list=1',{cache:'no-store'});const result=await r.json();if(!r.ok)throw new Error(result.error);setContracts(result.data);setError('');}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar contratos.');}finally{setLoading(false);}},[]);
 useEffect(()=>{void Promise.resolve().then(load);},[load]);
 async function upload(id:string,file:File){setBusy(id);try{await uploadSignedContract(id,file);await load();}catch(e){setError(e instanceof Error?e.message:'Falha ao enviar.');}finally{setBusy('');}}
 return <section className="crm-panel"><h1>Contratos gerados</h1><p>Versões e PDFs vinculados às fichas comerciais dos leads.</p>{error&&<p className="crm-error" role="alert">{error}<button onClick={()=>void load()}>Tentar novamente</button></p>}{loading&&<p role="status">Carregando contratos…</p>}<div className="crm-contract-list">{contracts.map(c=><article key={c.id}><strong>{data?.leads.find(l=>l.id===c.lead_id)?.name||'Cliente'} · v{c.version}</strong><p>{contractStatusLabels[c.status]||c.status} · {dateLabel(c.created_at)}{c.stale?' · Desatualizado':''}</p><div className="crm-heading-actions"><button className="secondary-button" onClick={()=>{const lead=data?.leads.find(l=>l.id===c.lead_id);if(lead)onSelect(lead);}}>Abrir ficha</button>{c.pdf_path&&<a className="secondary-button" href={`/api/crm/contracts?id=${c.id}`} target="_blank" rel="noreferrer">Baixar PDF</a>}{c.signed_pdf_path&&<a className="secondary-button" href={`/api/crm/contracts?id=${c.id}&kind=signed`} target="_blank" rel="noreferrer">PDF assinado</a>}<label className="secondary-button crm-file-button">Subir PDF assinado<input type="file" accept="application/pdf" disabled={busy===c.id} onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void upload(c.id,file);e.currentTarget.value='';}}/></label></div></article>)}</div>{!loading&&!contracts.length&&<p className="crm-empty-copy">Nenhum contrato gerado. Abra um lead, preencha a ficha de plano e gere o PDF.</p>}</section>;
}
