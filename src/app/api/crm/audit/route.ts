import {NextResponse} from 'next/server';
import {requireCrm,rows} from '@/lib/crm-server';
export async function GET(){const access=await requireCrm();if('error' in access)return access.error;try{return NextResponse.json({data:await rows(access.client,'crm_audit')},{headers:{'Cache-Control':'private, no-store'}});}catch{return NextResponse.json({error:'Não foi possível carregar a auditoria.'},{status:503});}}
