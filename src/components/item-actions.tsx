"use client";

import {useState,type ReactElement,type ReactNode} from 'react';
import {ContextMenu} from '@base-ui/react/context-menu';
import {Menu} from '@base-ui/react/menu';
import {MoreHorizontal} from 'lucide-react';

export type ItemAction={label:string;icon?:ReactNode;run:()=>void;danger?:boolean;disabled?:boolean};

export function ItemContextMenu({trigger,actions,label}:{trigger:ReactElement;actions:ItemAction[];label:string}){
 const [anchor,setAnchor]=useState<HTMLElement|null>(null);
 return <ContextMenu.Root><ContextMenu.Trigger render={trigger} ref={setAnchor}/><ContextMenu.Portal container={anchor?.closest('dialog, .crm-shell') as HTMLElement|null}><ContextMenu.Positioner className="crm-menu-positioner" sideOffset={5}><ContextMenu.Popup className="crm-action-menu" aria-label={label}>{actions.map(action=><ContextMenu.Item key={action.label} className="crm-action-menu-item" data-danger={action.danger||undefined} disabled={action.disabled} onClick={action.run}>{action.icon}<span>{action.label}</span></ContextMenu.Item>)}</ContextMenu.Popup></ContextMenu.Positioner></ContextMenu.Portal></ContextMenu.Root>;
}

export function ActionsButton({actions,label}:{actions:ItemAction[];label:string}){
 const [anchor,setAnchor]=useState<HTMLElement|null>(null);
 return <Menu.Root><Menu.Trigger ref={setAnchor} className="icon-button crm-more-actions" aria-label={label} onClick={e=>e.stopPropagation()}><MoreHorizontal size={17}/></Menu.Trigger><Menu.Portal container={anchor?.closest('dialog, .crm-shell') as HTMLElement|null}><Menu.Positioner className="crm-menu-positioner" align="end" sideOffset={5}><Menu.Popup className="crm-action-menu" aria-label={label}>{actions.map(action=><Menu.Item key={action.label} className="crm-action-menu-item" data-danger={action.danger||undefined} disabled={action.disabled} onClick={e=>{e.stopPropagation();action.run();}}>{action.icon}<span>{action.label}</span></Menu.Item>)}</Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>;
}
