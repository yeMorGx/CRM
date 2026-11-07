"use client";

import {Children,Fragment,isValidElement,useEffect,useId,useRef,useState,type ReactNode,type SelectHTMLAttributes} from 'react';
import {Select} from '@base-ui/react/select';
import {Check,ChevronDown} from 'lucide-react';

type Option={value:string;label:ReactNode;disabled:boolean};
function optionText(node:ReactNode):string{return Children.toArray(node).map(child=>isValidElement<{children?:ReactNode}>(child)?optionText(child.props.children):String(child??'')).join('');}
function optionsFrom(children:ReactNode):Option[]{return Children.toArray(children).flatMap(child=>{
 if(!isValidElement<{value?:string|number;children?:ReactNode;disabled?:boolean}>(child))return [];
 if(child.type===Fragment||child.type==='optgroup')return optionsFrom(child.props.children);
 return child.type==='option'?[{value:String(child.props.value??optionText(child.props.children)),label:child.props.children,disabled:Boolean(child.props.disabled)}]:[];
});}

export function AppSelect({children,value,defaultValue,className='',onChange,onClick,disabled,required,id,...props}:SelectHTMLAttributes<HTMLSelectElement>){
 const options=optionsFrom(children),generatedId=useId();
 const [uncontrolled,setUncontrolled]=useState(()=>String(defaultValue??options[0]?.value??''));
 const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null),[invalid,setInvalid]=useState(false);
 const native=useRef<HTMLSelectElement>(null);
 const current=String(value??uncontrolled),resetValue=String(defaultValue??options[0]?.value??'');
 useEffect(()=>{const form=native.current?.form;if(!form)return;const reset=()=>{setInvalid(false);setUncontrolled(resetValue);};form.addEventListener('reset',reset);return()=>form.removeEventListener('reset',reset);},[resetValue]);
 return <div className="app-select-wrap"><Select.Root value={current} disabled={disabled} items={options} onValueChange={next=>{if(next==null||!native.current)return;setInvalid(false);// Keep native validation, form events and FormData working for existing callers.
 native.current.value=next;native.current.dispatchEvent(new Event('change',{bubbles:true}));}}><Select.Trigger ref={setAnchor} id={id||generatedId} className={`app-select-trigger ${className}`} aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby']} aria-describedby={invalid?`${generatedId}-error`:props['aria-describedby']} aria-invalid={invalid||undefined} onClick={event=>onClick?.(event as unknown as React.MouseEvent<HTMLSelectElement>)}><Select.Value/><Select.Icon><ChevronDown size={14}/></Select.Icon></Select.Trigger><Select.Portal container={anchor?.closest('dialog, .crm-shell') as HTMLElement|null}><Select.Positioner className="app-select-positioner" sideOffset={6} alignItemWithTrigger={false}><Select.Popup className="app-select-popup" onClick={event=>event.stopPropagation()}><Select.List>{options.map((option,index)=><Select.Item key={`${option.value}-${index}`} value={option.value} disabled={option.disabled} className="app-select-option"><Select.ItemText>{option.label}</Select.ItemText><Select.ItemIndicator><Check size={14}/></Select.ItemIndicator></Select.Item>)}</Select.List></Select.Popup></Select.Positioner></Select.Portal></Select.Root><select {...props} ref={native} value={current} disabled={disabled} required={required} tabIndex={-1} aria-hidden="true" className="app-select-native" onChange={event=>{setUncontrolled(event.target.value);onChange?.(event);}} onInvalid={event=>{event.preventDefault();setInvalid(true);anchor?.focus();}}>{children}</select>{invalid&&<span className="app-control-error" id={`${generatedId}-error`}>Escolha uma opção.</span>}</div>;
}
