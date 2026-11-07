"use client";
import {createContext,useContext,type ReactElement,type ReactNode} from 'react';
import {Copy,FileText,CalendarPlus,Star,Trash2,ArrowUpRight,Phone} from 'lucide-react';
import {ItemContextMenu,ActionsButton,type ItemAction} from './item-actions';
import type {Lead} from '@/lib/crm-types';

export type LeadIntent='details'|'tasks'|'plan'|'delete';
type Handlers={open:(lead:Lead,intent:LeadIntent)=>void;favorite:(id:string,value:boolean)=>Promise<void>;notice:(message:string)=>void};
const LeadActions=createContext<Handlers|null>(null);
export function LeadActionsProvider({children,...handlers}:Handlers&{children:ReactNode}){return <LeadActions.Provider value={handlers}>{children}</LeadActions.Provider>;}
function useLeadActions(lead:Lead):ItemAction[]{
 const handlers=useContext(LeadActions);
 if(!handlers)return [];
 return [
  {label:'Abrir ficha',icon:<ArrowUpRight size={15}/>,run:()=>handlers.open(lead,'details')},
  {label:'Agendar follow-up',icon:<CalendarPlus size={15}/>,run:()=>handlers.open(lead,'tasks')},
  {label:'Plano e contrato',icon:<FileText size={15}/>,run:()=>handlers.open(lead,'plan')},
  {label:lead.favorito?'Remover dos favoritos':'Favoritar lead',icon:<Star size={15}/>,run:()=>{void handlers.favorite(lead.id,!lead.favorito).catch(()=>handlers.notice('Não foi possível alterar o favorito.'));}},
  {label:'Copiar nome',icon:<Copy size={15}/>,run:()=>{void navigator.clipboard.writeText(lead.name).then(()=>handlers.notice('Nome copiado.'),()=>handlers.notice('Não foi possível copiar.'));}},
  {label:'Copiar telefone',icon:<Phone size={15}/>,disabled:!lead.phone,run:()=>{void navigator.clipboard.writeText(lead.phone||'').then(()=>handlers.notice('Telefone copiado.'),()=>handlers.notice('Não foi possível copiar.'));}},
  {label:'Apagar lead…',icon:<Trash2 size={15}/>,danger:true,run:()=>handlers.open(lead,'delete')},
 ];
}
export function LeadContextMenu({lead,trigger}:{lead:Lead;trigger:ReactElement}){const actions=useLeadActions(lead);return actions.length?<ItemContextMenu label={`Ações de ${lead.name}`} actions={actions} trigger={trigger}/>:trigger;}
export function LeadActionsButton({lead}:{lead:Lead}){const actions=useLeadActions(lead);return actions.length?<ActionsButton label={`Ações de ${lead.name}`} actions={actions}/>:null;}
