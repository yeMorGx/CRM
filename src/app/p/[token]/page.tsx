import type {Metadata} from 'next';
import {PublicProposal} from '@/components/public-proposal';
export const metadata:Metadata={title:'Proposta comercial',robots:{index:false,follow:false}};
export default async function ProposalPage({params}:{params:Promise<{token:string}>}){const {token}=await params;return <PublicProposal token={token}/>;}
