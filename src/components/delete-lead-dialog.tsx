"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Trash2,X} from 'lucide-react';
import type {Lead} from '@/lib/crm-types';
import {crmRequest} from './use-crm-workspace';

export function DeleteLeadDialog({lead,onClose,onDeleted}:{lead:Lead;onClose:()=>void;onDeleted:(id:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{dialog.current?.showModal();dialog.current?.querySelector<HTMLInputElement>('input:not([type="hidden"]):not(.app-select-native),textarea')?.focus();},[]);
 async function remove(event:FormEvent){event.preventDefault();if(name!==lead.name||busy)return;setBusy(true);setError('');try{await crmRequest({action:'delete_lead',id:lead.id,confirm_name:name});onDeleted(lead.id);}catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível apagar o lead.');setBusy(false);}}
 return <dialog ref={dialog} className="app-dialog app-delete-dialog" aria-labelledby="delete-lead-title" aria-describedby="delete-lead-description" onCancel={event=>{event.preventDefault();if(!busy)onClose();}} onClick={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}><form className="app-dialog-form" onSubmit={remove}><header className="app-dialog-header"><span className="app-danger-symbol"><Trash2 size={20}/></span><button type="button" className="icon-button" aria-label="Fechar confirmação" disabled={busy} onClick={onClose}><X size={18}/></button></header><h2 id="delete-lead-title">Apagar lead?</h2><p id="delete-lead-description"><strong>{lead.name}</strong> e seus registros comerciais vinculados serão apagados permanentemente.</p><details className="app-delete-details"><summary>O que será apagado?</summary><p>Atividades, tarefas, conversas de WhatsApp, propostas, ficha de plano e registros de contratos. Documentos e eventos de calendário permanecem, sem vínculo com este lead.</p></details><label>Digite o nome para confirmar<input autoFocus autoComplete="off" value={name} disabled={busy} onChange={event=>setName(event.target.value)} placeholder={lead.name}/></label>{error&&<p className="crm-error" role="alert">{error}</p>}<footer className="app-dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="app-danger-button" disabled={busy||name!==lead.name}>{busy?'Apagando…':'Apagar lead'}</button></footer></form></dialog>;
}
