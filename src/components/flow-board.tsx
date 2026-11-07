"use client";
import { useCallback, useEffect, useState } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, useNodesState, useEdgesState, addEdge, useReactFlow, type Node, type Edge, type NodeProps, type Connection } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
type FlowNode=Node<{label:string}>;
function BoardNode({id,data,type,selected}:NodeProps<FlowNode>) {
 const {updateNodeData}=useReactFlow(); const [editing,setEditing]=useState(false);
 return <div className={"flow-node flow-node-"+type+(selected?" is-selected":"")} onDoubleClick={()=>setEditing(true)}>
 {type!=="start"&&<Handle type="target" position={Position.Top}/>}<small>{type==="start"?"Início":type==="decision"?"Decisão":"Processo"}</small>
 {editing?<input className="nodrag nowheel" aria-label="Texto do nó" autoFocus value={data.label} onChange={e=>updateNodeData(id,{label:e.target.value})} onBlur={()=>setEditing(false)} onKeyDown={e=>{e.stopPropagation();if(e.key==="Enter"||e.key==="Escape")setEditing(false);}}/>:<button className="nodrag" onClick={()=>setEditing(true)}>{data.label}</button>}
 {type==="decision"?<><Handle id="yes" type="source" position={Position.Bottom} style={{left:"25%"}}/><Handle id="no" type="source" position={Position.Bottom} style={{left:"75%"}}/><div className="flow-branches"><span>Sim</span><span>Não</span></div></>:<Handle type="source" position={Position.Bottom}/>}
 </div>;
}
const nodeTypes={start:BoardNode,process:BoardNode,decision:BoardNode};
function Editor({initialData,onChange}:{initialData:Record<string,unknown>;onChange:(data:Record<string,unknown>)=>void}) {
 const [nodes,setNodes,onNodesChange]=useNodesState<FlowNode>((initialData.nodes as FlowNode[])??[]);const [edges,setEdges,onEdgesChange]=useEdgesState<Edge>((initialData.edges as Edge[])??[]);
 const {screenToFlowPosition}=useReactFlow();
 useEffect(()=>{onChange({nodes,edges});},[nodes,edges,onChange]);
 const connect=useCallback((connection:Connection)=>setEdges(current=>addEdge({...connection,label:connection.sourceHandle==="yes"?"Sim":connection.sourceHandle==="no"?"Não":undefined},current)),[setEdges]);
 function add(type:string,position={x:80,y:80}) {setNodes(current=>[...current,{id:crypto.randomUUID(),type,position,data:{label:type==="start"?"Início":type==="decision"?"Qual condição?":"Nova etapa"}}]);}
 return <><div className="flow-toolbar" aria-label="Adicionar nó">{[["start","Início"],["process","Etapa"],["decision","Decisão"]].map(([type,label])=><button key={type} draggable onDragStart={e=>e.dataTransfer.setData("application/flow-node",type)} onClick={()=>add(type)}>{label}</button>)}<span>Arraste ou toque para adicionar · Delete para apagar</span></div><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect} colorMode="dark" deleteKeyCode={["Delete","Backspace"]} fitView onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";}} onDrop={e=>{e.preventDefault();const type=e.dataTransfer.getData("application/flow-node");if(["start","process","decision"].includes(type))add(type,screenToFlowPosition({x:e.clientX,y:e.clientY}));}}><Background/><Controls/><MiniMap pannable zoomable/></ReactFlow></>;
}
export default function FlowBoard(props:Parameters<typeof Editor>[0]) {return <ReactFlowProvider><Editor {...props}/></ReactFlowProvider>;}
