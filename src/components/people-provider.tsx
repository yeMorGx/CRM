"use client";
import {PersonAvatar} from "./person-avatar";
export {PersonAvatar} from "./person-avatar";
import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {createClient} from '@/lib/supabase/client';
import {useAppToast,useToastIdentity,type ToastActor} from './app-toast-provider';

export type Person=ToastActor&{id:string};
const People=createContext<Record<string,Person>>({});
export function usePeople(){return useContext(People);}
export function PeopleProvider({children,current}:{children:ReactNode;current:Person|null}){
 const [people,setPeople]=useState<Record<string,Person>>({});const toast=useAppToast();
 useToastIdentity(current?people[current.id]||current:null);
 const load=useCallback(async()=>{try{const response=await fetch('/api/crm/people',{cache:'no-store'});if(response.ok){const result=await response.json();setPeople(Object.fromEntries(result.data.map((person:Person)=>[person.id,person])));}}catch{/* Existing names remain available during a temporary connection failure. */}},[]);
 useEffect(()=>{void Promise.resolve().then(load);const client=createClient();const channel=client?.channel('people-directory').on('postgres_changes',{event:'*',schema:'public',table:'chat_profiles'},()=>void load()).subscribe();const timer=window.setInterval(()=>void load(),45*60000);return()=>{window.clearInterval(timer);if(client&&channel)void client.removeChannel(channel);};},[load]);
 useEffect(()=>{const messages:Record<string,string>={lead:'Ficha atualizada.',activity:'Atividade registrada.',task:'Próximo passo agendado.',task_status:'Tarefa atualizada.',proposal:'Proposta criada.',proposal_status:'Proposta atualizada.',plan:'Plano atualizado.',contract:'Contrato gerado.',signed:'PDF assinado recebido.'};const feedback=(event:Event)=>{const action=(event as CustomEvent<string>).detail;if(messages[action])toast(messages[action],'success');};window.addEventListener('crm:feedback',feedback);return()=>window.removeEventListener('crm:feedback',feedback);},[toast]);
 const value=useMemo(()=>current?{...people,[current.id]:{...current,...people[current.id]}}:people,[people,current]);
 return <People.Provider value={value}>{children}</People.Provider>;
}
export function ActorByline({id}:{id:string|null|undefined}){const people=usePeople();const person=id?people[id]:null;return <span className="actor-byline"><PersonAvatar person={person} size={23}/><span>{person?.name||(id?'Pessoa não disponível':'Sistema / integração')}</span></span>;}
