"use client";
import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BoardType, CanvasBoardRecord } from "@/lib/canvas-types";
const loading = () => <div className="board-loading" role="status">Carregando editor...</div>;
const Canvas = dynamic(() => import("./canvas-board"), { ssr: false, loading });
const Flow = dynamic(() => import("./flow-board"), { ssr: false, loading });
export function CanvasWorkspace() {
 const [type,setType]=useState<BoardType>("canvas");
 const [visited,setVisited]=useState<BoardType[]>(["canvas"]);
 return <section className="board-workspace"><div className="board-tabs" role="tablist" aria-label="Editor">{(["canvas","flow"] as const).map(t=><button key={t} role="tab" aria-selected={type===t} onClick={()=>{setType(t);setVisited(v=>v.includes(t)?v:[...v,t]);}}>{t==="canvas"?"Canvas":"Fluxograma"}</button>)}</div>{visited.map(t=><div className="board-session" key={t} hidden={type!==t}><BoardSession type={t}/></div>)}</section>;
}
function BoardSession({type}:{type:BoardType}) {
 const [board,setBoard]=useState<CanvasBoardRecord|null>(null);
 const [error,setError]=useState(""); const [status,setStatus]=useState("Carregando...");
 const [client]=useState(()=>createClient());
 const pending=useRef<Record<string,unknown>|null>(null); const timer=useRef<ReturnType<typeof setTimeout>|null>(null); const queue=useRef(Promise.resolve()); const revision=useRef(0); const savedRevision=useRef(0);
 useEffect(()=>{let active=true; void (async()=>{try {
 if(!client) throw Error(); const {data:auth,error:authError}=await client.auth.getUser(); if(authError||!auth.user) throw Error();
 const loadedBoard=await client.from("canvas_boards").select("*").eq("user_id",auth.user.id).eq("type",type).maybeSingle();
 let data=loadedBoard.data; if(loadedBoard.error) throw loadedBoard.error;
 if(!data) {const result=await client.from("canvas_boards").upsert({user_id:auth.user.id,type,title:type==="canvas"?"Meu canvas":"Meu fluxograma",data:{}},{onConflict:"user_id,type",ignoreDuplicates:true}); if(result.error) throw result.error; const loaded=await client.from("canvas_boards").select("*").eq("user_id",auth.user.id).eq("type",type).single(); if(loaded.error) throw loaded.error; data=loaded.data;}
 if(active){setBoard(data as CanvasBoardRecord);setStatus("Salvo");}
 }catch{if(active)setError("Não foi possível carregar o quadro. Confira a conexão e se a migration canvas_boards foi aplicada.");}})();return()=>{active=false;};},[client,type]);
 const flush=useCallback(()=>{if(!pending.current||!board||!client)return;const data=pending.current;const savingRevision=revision.current;pending.current=null;setStatus("Salvando...");queue.current=queue.current.then(async()=>{try {const result=await client.from("canvas_boards").update({data}).eq("id",board.id).select("id").single();if(result.error)throw result.error;savedRevision.current=savingRevision;setError("");if(revision.current===savingRevision)setStatus("Salvo");}catch {if(revision.current===savingRevision)pending.current=data;setError("Não foi possível salvar. Suas alterações continuam neste editor.");setStatus("Não salvo");}});},[board,client]);
 const change=useCallback((data:Record<string,unknown>)=>{revision.current+=1;pending.current=data;setStatus("Salvando...");if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(flush,1000);},[flush]);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(revision.current!==savedRevision.current){e.preventDefault();}};window.addEventListener("beforeunload",warn);return()=>{window.removeEventListener("beforeunload",warn);if(timer.current)clearTimeout(timer.current);flush();};},[flush]);
 return <><div className="board-status"><span>{board?.title}</span><span role="status">{status}</span></div>{error&&<div className="board-error" role="alert">{error} <button onClick={()=>board?flush():location.reload()}>Tentar novamente</button></div>}<div className="board-editor"><EditorBoundary>{board?(type==="canvas"?<Canvas initialData={board.data} onChange={change}/>:<Flow initialData={board.data} onChange={change}/>):error?null:loading()}</EditorBoundary></div></>;
}

class EditorBoundary extends Component<{children:ReactNode},{failed:boolean}> { state={failed:false}; static getDerivedStateFromError(){return {failed:true};} render(){return this.state.failed?<div role="alert" className="board-error">Não foi possível abrir o conteúdo salvo. Recarregue a página para tentar novamente; o quadro salvo não foi substituído.</div>:this.props.children;} }
