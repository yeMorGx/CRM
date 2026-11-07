"use client";

import {createPortal} from "react-dom";
import {PersonAvatar} from "./person-avatar";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "info";
export type ToastActor={id?:string;name:string;avatar?:string|null;color?:string|null};
type ToastOptions={actor?:ToastActor|null;action?:{label:string;run:()=>void}};
type ToastItem = { id: number; message: string; kind: ToastKind;actor:ToastActor|null;action?:ToastOptions["action"] };
type ToastContextValue = (message: string, kind?: ToastKind, options?:ToastOptions) => void;

const IdentityContext=createContext<((actor:ToastActor|null)=>void)|null>(null);
const ToastContext = createContext<ToastContextValue | null>(null);

export function AppToastProvider({ children }: { children: ReactNode }) {
  const [portalHost,setPortalHost]=useState<HTMLElement|null>(null);
  useEffect(()=>{const update=()=>setPortalHost(Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]")).at(-1)||document.body);update();const observer=new MutationObserver(update);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["open"]});return()=>observer.disconnect();},[]);
  const [items, setItems] = useState<ToastItem[]>([]);
  const defaultActor=useRef<ToastActor|null>(null);
  const setIdentity=useCallback((actor:ToastActor|null)=>{defaultActor.current=actor;},[]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback<ToastContextValue>((message, kind = "info", options) => {
    const normalized = message.trim();
    if (!normalized) return;
    const id = ++nextId.current;
    setItems((current) => [...current.slice(-3), { id, message: normalized, kind,actor:options?.actor===undefined?defaultActor.current:options.actor,action:options?.action }]);
    timers.current.set(id, window.setTimeout(() => dismiss(id), kind === "error" ? 6500 : 4800));
  }, [dismiss]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, []);

  const stack=<div className="app-toast-stack" aria-label="Avisos" aria-live="polite" aria-relevant="additions">
        {items.map((item) => {
          const Icon = item.kind === "error" ? AlertCircle : item.kind === "success" ? CheckCircle2 : Info;
          return (
            <div className={`app-toast app-toast-${item.kind}`} key={item.id} role={item.kind === "error" ? "alert" : "status"}>
              {item.actor?<span className="toast-person"><PersonAvatar person={item.actor} size={34}/><Icon size={11} aria-hidden="true"/></span>:<Icon size={17} aria-hidden="true"/>}
              <span className="toast-copy">{item.actor&&<strong>{item.actor.name}</strong>}<span>{item.message}</span></span>{item.action&&<button type="button" className="toast-action" onClick={()=>{item.action?.run();dismiss(item.id);}}>{item.action.label}</button>}
              <button type="button" onClick={() => dismiss(item.id)} aria-label="Dispensar aviso"><X size={14} /></button>
            </div>
          );
        })}
      </div>;
  return <IdentityContext.Provider value={setIdentity}><ToastContext.Provider value={notify}>{children}{portalHost?createPortal(stack,portalHost):stack}</ToastContext.Provider></IdentityContext.Provider>;
}

export function useAppToast() {
  const notify = useContext(ToastContext);
  return notify ?? (() => undefined);
}

export function useToastIdentity(actor:ToastActor|null){const setIdentity=useContext(IdentityContext);useEffect(()=>{setIdentity?.(actor);return()=>setIdentity?.(null);},[actor,setIdentity]);}
