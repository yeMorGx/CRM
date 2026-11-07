"use client";
import {useEffect,useRef,type ReactNode} from 'react';
export function AppDialog({children,onClose,label,className='',busy=false}:{children:ReactNode;onClose:()=>void;label:string;className?:string;busy?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal();dialog.current?.querySelector<HTMLInputElement>('input:not([type="hidden"]):not(.app-select-native),textarea')?.focus();},[]);
 return <dialog ref={dialog} aria-label={label} className={`app-dialog ${className}`} onCancel={event=>{event.preventDefault();if(!busy)onClose();}} onClick={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}>{children}</dialog>;
}
