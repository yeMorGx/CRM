"use client";
import Image from "next/image";
import {useState} from "react";
import type {ToastActor} from "./app-toast-provider";
export function PersonAvatar({person,size=30}:{person?:ToastActor|null;size?:number}){
 const [failed,setFailed]=useState<string|null>(null);const color=person?.color&&/^#[\da-f]{6}$/i.test(person.color)?person.color:'#8b908b';
 const initials=person?.name?.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'·';
 return <span className="person-avatar" style={{width:size,height:size,background:color+'22',color}} aria-hidden="true">{person?.avatar&&failed!==person.avatar?<Image src={person.avatar} alt="" width={size} height={size} unoptimized onError={()=>setFailed(person.avatar||null)}/>:initials}</span>;
}
