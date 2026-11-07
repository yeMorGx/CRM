import {contractTemplate} from './contract-template';
import {currency} from './crm-insights';
import type {Plan,PlanAddon,CompanySettings} from './plans-types';
export type LeadPlan = {lead_id:string;plan_id:string;addons:{id:string;qty:number}[];total_setup:number;total_monthly:number;custom_setup:number|null;custom_monthly:number|null;client:Record<string,string>;project:Record<string,string>;terms:Record<string,string>;updated_at:string;source_proposal_id:string|null};
export type ContractSnapshot = {lead_plan:LeadPlan;plan:Plan;addons:(PlanAddon&{qty:number})[];company:CompanySettings;generated_at:string};
export function contractText(snapshot:ContractSnapshot){
 const {lead_plan:p,plan,company,addons}=snapshot;const partners=company.partners||[];
 const values:Record<string,string>={
 'empresa.razao_social':company.legal_name||'', 'empresa.cnpj':company.cnpj||'', 'empresa.endereco':company.address||'','empresa.email':company.email||'', 'socios.nomes':partners.map(p=>p.name).join(' e '),
 'cliente.nome':p.client.nome,'cliente.doc':p.client.doc,'cliente.endereco':p.client.endereco,'cliente.email':p.client.email,
 'projeto.tipo':p.project.tipo,'projeto.paginas':p.project.paginas,'projeto.dominio':p.project.dominio,'projeto.funcionalidades':p.project.funcionalidades,
 'plano.nome':plan.name,'plano.backup':plan.limits.backup,'plano.monitoramento':plan.limits.monitoramento,'plano.alteracoes_mes':plan.limits.alteracoes_mes,'plano.horas_dev':plan.limits.horas_dev_mes,'plano.relatorio':plan.limits.relatorio,'plano.resposta_h':plan.limits.suporte_h?.match(/\d+/)?.[0]||plan.limits.suporte_h,
 'extras.lista':addons.map(a=>`${a.name} (${a.qty})`).join(', '),'taxa_implantacao':currency(p.total_setup),'entrada_pct':p.terms.entrada_pct,'mensalidade_total':currency(p.total_monthly),
 'mensal.hospedagem':currency(plan.monthly_breakdown.hospedagem||0),'mensal.dominio':currency(plan.monthly_breakdown.dominio||0),'mensal.licencas':currency(plan.monthly_breakdown.licencas||0),'mensal.manutencao':currency(plan.monthly_breakdown.manutencao||0),
 'forma_pagamento':p.terms.forma_pagamento,'vencimento':p.terms.vencimento,'indice':company.clause_defaults.idx,'permanencia':plan.limits.permanencia_meses||company.clause_defaults.perm,'aviso':company.clause_defaults.aviso,'multa':company.clause_defaults.multa,'prazo':p.project.prazo,'rodadas':p.project.rodadas,'foro':company.clause_defaults.foro,'valor_hora':p.terms.valor_hora?currency(Number(p.terms.valor_hora)):'',
 'data_extenso':new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'long'}).format(new Date(snapshot.generated_at))
 };
 let template=contractTemplate.replace(/\\_/g,'_').replace(' (nomes separados por “ e ”)','');
 const extraRow='| *(uma linha por extra mensal contratado)* | {{extra.valor}} |';
 template=template.replace(extraRow,addons.filter(a=>a.kind==='monthly').map(a=>`| ${a.name} (${a.qty}) | ${currency(a.price*a.qty)} |`).join('\n'));
 if(!addons.length)template=template.replace('Extras contratados: {{extras.lista}} (se não houver, omitir esta frase). ','');else template=template.replace(' (se não houver, omitir esta frase)','');
 return template.replace(/\{\{([^}]+)\}\}/g,(_m,key)=>values[key]||'________');
}
export function validateContract(snapshot:ContractSnapshot){
 const p=snapshot.lead_plan,c=snapshot.company;
 const missing:string[]=[];
 for(const [label,value] of Object.entries({'Razão social':c.legal_name,'CNPJ da empresa':c.cnpj,'Endereço da empresa':c.address,'E-mail da empresa':c.email,...Object.fromEntries(['nome','doc','endereco','email'].map(k=>['Cliente: '+k,p.client[k]])),...Object.fromEntries(['tipo','dominio','paginas','funcionalidades','prazo','rodadas'].map(k=>['Projeto: '+k,p.project[k]])),...Object.fromEntries(['entrada_pct','vencimento','forma_pagamento','valor_hora'].map(k=>['Condições: '+k,p.terms[k]]))}))if(value==null||String(value).trim()==='')missing.push(label);
 if((c.partners||[]).length<2||c.partners.some(s=>!s.name||!s.role||!s.signature_path))missing.push('Nomes, cargos e assinaturas dos dois sócios');
 if(missing.length)throw new Error('Preencha antes de gerar: '+missing.join(', ')+'.');
 if(!Number.isFinite(Number(p.terms.valor_hora))||Number(p.terms.valor_hora)<0)throw new Error('Valor/hora inválido.');
 if(Number(p.project.paginas)<1||Number(p.project.prazo)<1||!/^\d+$/.test(p.project.paginas)||!/^\d+$/.test(p.project.prazo)||!/^\d+$/.test(p.project.rodadas))throw new Error('Páginas, prazo e rodadas devem ser números inteiros.');
}
