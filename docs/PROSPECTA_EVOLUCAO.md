# PROSPECTA — Plano de evolução do CRM e dashboard comercial

> **Documento de implementação para agente de programação (Codex, Claude Code ou equivalente)**  
> **Produto:** Prospecta — CRM de prospecção para venda de criação de sites  
> **Objetivo:** melhorar gestão de leads, qualificação, follow-ups, pipeline, propostas e inteligência comercial, preservando o sistema existente.  
> **Idioma:** pt-BR | **Moeda:** BRL | **Fuso de exibição:** `America/Sao_Paulo`  
> **Escopo:** evolução incremental do projeto atual, **não** recriação do zero.

---

## 0. Instrução principal para a IA implementadora

Você atuará como **engenheiro full-stack sênior, arquiteto de dados e designer de produto especializado em CRMs**. Sua missão é **inspecionar o repositório real e implementar incrementalmente** as melhorias descritas neste documento, com atenção à segurança e à qualidade de UX.

**Não entregue apenas mockups, recomendações ou componentes desconectados:** implemente recursos funcionais, conectados à persistência real, respeitando as decisões técnicas atuais do projeto. Onde for necessário evoluir o banco, prepare migrations seguras e testáveis.

### Regras obrigatórias

1. Leia primeiro `AGENTS.md`, `README.md`, `DESIGN.md`, `CHANGELOG.md`, arquivos de configuração, schema e migrations existentes **se estiverem no repositório**; respeite as convenções locais.
2. Inspecione o framework, bibliotecas de UI e gráficos, autenticação, funções RPC, modelos de dados e integrações efetivamente existentes. **Não presuma** que um nome de tabela, coluna, rota ou estrutura já exista.
3. Preserve o branding e a navegação atual: tema escuro, realces verdes, visual limpo, sidebar e módulos **Visão geral / Comercial / Pipeline / Encontrar leads / Comunicação / Trabalho / Gestão**. Ajuste a arquitetura da informação somente quando necessário.
4. Preserve integralmente os registros atuais, inclusive os **22 leads** exibidos nos prints enviados pelo proprietário durante a especificação. Esse número é apenas um retrato da interface e **não** deve ser hardcoded.
5. Preserve as integrações que já funcionam, especialmente **Supabase** e a origem dos leads importados por ferramentas de prospecção (por exemplo, Google Maps scraper, se presente no código).
6. Use migrations **aditivas, reversíveis quando viável e idempotentes quando apropriado**. Nunca `DROP`, `TRUNCATE` ou faça atualização massiva de estágios sem análise, backup e aprovação explícita.
7. Antes de executar uma alteração de produção no banco ou fazer deploy, identifique o projeto e o ambiente corretos, valide dependências e solicite aprovação quando a operação puder ter impacto real. **Não use projetos de outra organização por engano.**
8. Mantenha ou aperfeiçoe políticas de acesso (RLS), checagens no servidor, validação de entradas, trilha de auditoria e tratamento de erros. Nunca exponha tokens nem `service_role` no navegador.
9. Evite novas dependências pesadas se já houver componentes ou bibliotecas equivalentes instalados.
10. Faça mudanças pequenas, verificáveis e organizadas; rode lint, typecheck, testes e build com os comandos existentes. Não declare concluído aquilo que ainda estiver mockado.
11. Não invente dados históricos de contatos, respostas ou vendas; não use números fictícios no dashboard de produção. Para testes, use fixtures claramente separadas do ambiente real.
12. Caso alguma regra entre em conflito com a implementação atual, explique a incompatibilidade, proponha adaptação conservadora e siga com as partes seguras.

---

## 1. Contexto e diagnóstico da interface atual

Pelos prints compartilhados, o Prospecta já possui:

- Tema escuro com cor de destaque verde-lima, cards arredondados e sidebar.
- Dashboard de visão geral com KPIs, distribuição por estágio, atividade recente, leads recentes, próximas tarefas e resumo de estágios.
- Contagens visíveis no momento da captura: **22 leads no total, 21 novos, 1 descartado, 0 em negociação e 0 fechados**.
- Dados indicados como provenientes do Supabase.
- Origem manual e importação por scraper exibidas em alguns registros.
- Indicadores de conversão e saúde de pipeline atualmente em 0%.

### Problemas detectados a resolver

1. **Redundância:** o mesmo conjunto de estágios/contagens aparece em várias seções, competindo por atenção.
2. **Baixa densidade informativa:** o componente de distribuição por estágio usa muita altura para poucos dados.
3. **Métricas ambíguas:** “saúde do pipeline”, “conversão” e “em aberto” precisam de definições documentadas.
4. **Pouca orientação para ação:** com muitos novos leads, faltam atalhos claros para contatar, agendar e avançar oportunidades.
5. **Ausência de inteligência comercial:** faltam análise por segmento/origem, funil histórico, motivos de perda e valor de oportunidades.
6. **Falta de contexto no cadastro:** é importante separar etapa comercial, temperatura, prioridade, motivo de perda e presença digital.
7. **Possível lacuna no histórico:** se só o estágio atual estiver armazenado, a evolução temporal do funil não poderá ser reconstruída com fidelidade.

**Diretriz:** não apagar informação útil para “limpar a tela”; reorganizá-la e tornar os dados acionáveis.

---

## 2. Modelo comercial e taxonomia dos leads

### 2.1. Estágio do pipeline (um por lead/oportunidade)

Propor os estágios abaixo, mas **avaliar primeiro como o sistema atual representa status** para garantir compatibilidade:

| Ordem | Chave sugerida | Rótulo | Regra |
|---:|---|---|---|
| 1 | `new` | Novo | Lead cadastrado/importado e ainda não trabalhado. |
| 2 | `researching` | Em pesquisa | Investigando empresa, site e contato responsável. |
| 3 | `ready_to_contact` | Pronto para contato | Lead validado, com abordagem preparada. |
| 4 | `contacted` | Contatado | Primeira mensagem/ligação registrada. |
| 5 | `replied` | Respondeu | Há resposta registrada, sem inferir interesse. |
| 6 | `qualified` | Qualificado | Dor, serviço e potencial identificados. |
| 7 | `proposal_sent` | Proposta enviada | Proposta comercial formal enviada. |
| 8 | `negotiating` | Em negociação | Escopo, preço ou condições em discussão. |
| 9 | `won` | Fechado — ganho | Contratação confirmada. |
| 10 | `lost` | Fechado — perdido | Oportunidade válida encerrada sem venda. |
| — | `nurturing` | Nutrição | Contato futuro possível; fora do pipeline ativo. |
| — | `discarded` | Descartado | Duplicado, inválido ou fora do público-alvo. |

**Regras de transição:**

- Os estágios de 1 a 8 formam o pipeline ativo; `won`, `lost`, `nurturing` e `discarded` são saídas ou estados especiais.
- Não converter automaticamente leads `discarded` existentes em `lost`. Exigir categorização manual ou uma regra segura aprovada.
- “Sem resposta” não deve ser um estágio obrigatório; deve ser uma **condição derivada** de contato realizado, prazo decorrido e ausência de resposta registrada.
- O estágio `replied` significa apenas que houve retorno. **Resposta negativa não equivale a lead qualificado**.
- Permitir reabrir leads perdidos/nutrição com evento auditado. Não apagar a perda anterior.
- Não avançar automaticamente por suposição; se uma ação comprovada justificar transição, informar o usuário e registrar atividade.
- Se migrar status existentes, produzir tabela explícita de correspondência, plano de rollback e contagens antes/depois.

### 2.2. Propriedades independentes

Criar/normalizar campos com opções consistentes e filtros próprios:

| Campo | Exemplos | Observação |
|---|---|---|
| `segment` | Pizzaria, restaurante, academia, barbearia, clínica, estética, oficina, imobiliária, loja, outros | Lista expansível/editável. |
| `service_interest` | Site institucional, landing page, e-commerce, cardápio digital, redesign, manutenção | Permitir múltiplos serviços quando aplicável. |
| `lead_temperature` | Frio, morno, quente | Diferente de estágio. |
| `priority` | Baixa, média, alta | Prioridade operacional, eventualmente calculada/sugerida. |
| `lead_source` | Google Maps, Instagram, indicação, WhatsApp, inbound, pesquisa manual, outro | Preservar origens de integração existentes. |
| `website_presence` | Sem site, site antigo, site moderno, somente redes sociais, não avaliado | Guardar URL quando disponível. |
| `purchase_timeline` | Imediato, até 30 dias, até 90 dias, sem previsão | Pode ficar desconhecido. |
| `budget_range` | Não informado, abaixo da faixa, dentro da faixa, acima da faixa | Nunca supor orçamento. |
| `lost_reason` | Concorrente contratado, preço, sem orçamento, sem necessidade, sem interesse, timing, sem resposta após tentativas, outro | Obrigatório ao marcar `lost`, com opção de anotação. |
| `discard_reason` | Duplicado, inválido, fora do ICP, cadastro de teste, outro | Separado do motivo de perda comercial. |
| `next_action_at` | Data/hora | Preferir mecanismo de tarefa, não duplicar fontes da verdade. |
| `last_contact_at` | Data/hora | Derivar de atividades ou atualizar por operação confiável. |
| `estimated_value` | Valor monetário BRL | Valor **potencial**, não receita realizada. |

Permitir campos desconhecidos/nulos. Não converter ausência de orçamento, site ou data em zero/valor falso. Implementar tags livres apenas se trouxerem valor e não competirem com os campos estruturados.

### 2.3. Exemplo de classificação (não inserir automaticamente no banco)

**Fábio Pizzaria:** contato Cynthia, serviço ofertado “criação de site”, retorno recebido informando contratação de equipe de marketing que também fará site. Classificação recomendada: `lost`, motivo “Concorrente contratado” ou categoria equivalente; possibilidade de futura reavaliação. **Não classificar como descartado**. Este exemplo é apenas para ilustrar a regra de negócio; não criar contato fictício nem alterar registro sem autorização.

---

## 3. Gestão detalhada de leads

### 3.1. Ficha 360° do lead

Ao abrir um registro, disponibilizar uma página/painel com:

1. **Cabeçalho:** nome da empresa, segmento, estágio, prioridade, temperatura, origem, último contato.
2. **Dados de contato:** responsável, telefone/WhatsApp, email, endereço, site e links relevantes (quando existentes).
3. **Oportunidade:** serviço de interesse, dor identificada, orçamento conhecido, valor estimado, prazo e notas comerciais.
4. **Avaliação digital:** tem site? URL; percepção de responsividade, UX, velocidade, SEO local e integração com canais de pedido; campos opcionais e baseados em análise real.
5. **Timeline:** criação/importação, edição, mensagem enviada, resposta recebida, ligação, tarefa concluída, proposta e mudança de estágio.
6. **Próxima ação:** tarefa com responsável, prazo, prioridade e resultado esperado.
7. **Propostas:** registros enviados, versões, valores, validade e resultado.
8. **Links de ação:** WhatsApp, ligar, abrir site, criar tarefa, gerar proposta, editar, marcar como ganho/perdido.

Ações devem ter estados de loading, sucesso, erro e bloqueio de duplicação. Acesso a telefone/email deve respeitar privacidade e as permissões do usuário.

### 3.2. Kanban e lista

- Reaproveitar o Pipeline existente; oferecer **Kanban** e **Tabela** com alternância persistida por usuário, se conveniente.
- Drag-and-drop opcional; ao mover, persistir a transição com histórico e feedback claro. Impedir alteração só visual sem persistência.
- Cards compactos: empresa, segmento, valor estimado (se conhecido), última interação, próximo follow-up e sinais de atraso.
- Filtros combináveis: estágio, segmento, origem, prioridade, temperatura, serviço, presença de site, período e responsável quando houver multiusuário.
- Busca textual; salvar filtros/favoritos somente se o projeto comportar esse recurso.
- Deduplicação por chaves confiáveis (domínio/telefone/ID externo, com normalização e revisão de conflitos). **Não excluir registros automaticamente.**

---

## 4. Atividades, tarefas e follow-ups

### 4.1. Atividades com histórico confiável

Tipos recomendados: `lead_created`, `stage_changed`, `contact_sent`, `reply_received`, `call_logged`, `meeting_logged`, `note_added`, `task_completed`, `proposal_sent`, `proposal_updated`, `lost_recorded`, `won_recorded`, `reopened`.

Campos mínimos: `id`, `lead_id`, `type`, `occurred_at`, `created_at`, `actor_id` quando aplicável, `summary`/`metadata` controlada. Para mudança de estágio, guardar origem e destino.

- Histórico **append-only** para eventos críticos; restringir edição/exclusão conforme autorização.
- Dados legados não devem ganhar eventos inventados.
- Se a integração externa só comprovar “importado”, não registrar “contatado” ou “respondeu”.

### 4.2. Tarefas

Uma tarefa deve conter: lead relacionado, título, descrição opcional, responsável, vencimento, estado (`pending`, `done`, `cancelled`), prioridade e conclusão.

- Painel “Hoje”, “Vencidas”, “Próximos 7 dias” e “Sem próximo passo”.
- Ação “Agendar follow-up” diretamente na ficha do lead.
- Ao completar, solicitar opcionalmente resultado do contato; **não pressupor resposta**.
- Alertas na interface para tarefas vencidas; notificações externas apenas com integração e consentimento configurados.
- Sugestões de cadência (ex.: 3, 7, 14 dias) devem ser configuráveis, não automações que enviam mensagens sem revisão.

---

## 5. Dashboard — redesenho incremental

### 5.1. Princípio de experiência

O dashboard deve responder, nessa ordem: **o que fazer agora, o que está avançando, onde estou perdendo oportunidades e quanto posso faturar**.

**Manter tema dark/verde do Prospecta.** Não substituir o design system atual e não aplicar efeitos chamativos desnecessários. Usar spacing consistente, cards com alturas equilibradas, tipografia legível e estados vazios com orientação de ação.

### 5.2. Estrutura sugerida para a página “Visão geral”

1. **Header:** saudação, período (`7 dias`, `30 dias`, `90 dias`, `personalizado`), adicionar lead; indicar claramente o filtro aplicado.
2. **Faixa de prioridades:** “X leads prontos para contato”, “Y tarefas vencidas”, “Z propostas esperando retorno”, com navegação para listas filtradas.
3. **KPIs principais (4–6 cards):** Leads ativos, Sem primeiro contato, Taxa de resposta, Propostas abertas, Ganhos no período, Valor potencial do pipeline. Em telas pequenas, reorganizar a grade responsivamente.
4. **Coluna principal:** funil comercial compacto ou barras horizontais por estágio; evolução semanal de cadastros/contatos/respostas. Evitar bloco alto com espaço vazio.
5. **Coluna lateral:** próximas tarefas, oportunidades estagnadas, atividade recente (eventos reais).
6. **Rodapé analítico compacto:** nichos em destaque, razões de perda ou próximos leads prioritários, conforme volume de dados.

**Remover redundâncias:** não repetir “Leads por estágio” e “Estágios ativos” com os mesmos dados em duas regiões, nem misturar “leads recentes” com “atividade recente”. Se a segunda seção existir, cada uma deve mostrar entidades diferentes.

### 5.3. KPIs e fórmulas (definições obrigatórias)

| KPI | Fórmula/definição | Observação |
|---|---|---|
| Total de leads | `COUNT(DISTINCT lead_id)` visíveis ao usuário no escopo | Documentar exclusão/inclusão de descartados. |
| Leads ativos | Total em estágios ativos, excluindo ganhos/perdas/nutrição/descartados | Não contar como “em aberto” quem já foi encerrado. |
| Sem primeiro contato | Leads ativos **sem evento comprovado** de contato ou sem campo legado confiável equivalente | Não confundir estágio `new` com prova universal de ausência de contato. |
| Taxa de resposta | Leads distintos com resposta registrada / leads distintos contatados × 100 | Mesmo período e critério explícito; evitar dividir por zero. |
| Conversão de fechamento | Ganhos / oportunidades ganhas + perdidas em coorte de fechamento, × 100 | Mostrar nomenclatura “Win rate”; opcionalmente taxa por coorte de leads separada. |
| Taxa por etapa | Leads que **atingiram** etapa seguinte / leads que atingiram etapa anterior × 100 | Exige histórico; não usar apenas status atual para funil histórico. |
| Propostas abertas | Propostas enviadas e ainda não aceitas/recusadas/expiradas | Não contar drafts. |
| Pipeline potencial | Soma dos valores estimados das oportunidades abertas com valor conhecido | Exibir “valor não informado” separadamente. |
| Faturamento fechado | Soma dos valores confirmados como ganho no período | Não somar pipeline nem propostas ainda abertas. |
| Tempo médio até contato | Média do intervalo criação → primeiro contato para leads com ambos eventos | Não tratar contatos sem data como zero. |
| Leads estagnados | Leads ativos sem atividade relevante há N dias | N configurável; não confundir com automaticamente perdidos. |
| Saúde do pipeline | **Evitar índice arbitrário**; usar indicadores transparentes (tarefas vencidas, estagnação, atividade) | Se mantido, documentar fórmula e componentes. |

**Casos especiais:** denominador zero → mostrar `—` / “Sem dados suficientes”, não forçar `0%`; quando há dados reais suficientes, mostrar `0%` normalmente. Nos períodos com poucos registros, contextualizar. Todos os filtros precisam ser coerentes entre cards e gráficos.

### 5.4. Página “Analytics” (nova ou existente, após inspeção)

Gráficos priorizados:

| Prioridade | Gráfico | Tipo recomendado | Objetivo |
|---|---|---|---|
| P0 | Funil comercial | Funnel ou barras horizontais | Identificar queda de conversão entre etapas. |
| P0 | Evolução da prospecção | Linhas com séries | Novos leads, contatados, respostas, propostas, ganhos. |
| P0 | Motivos de perda | Barras horizontais | Entender objeções mais frequentes. |
| P0 | Origem dos leads | Barras comparativas | Volume e taxa de resposta/ganho por origem. |
| P1 | Desempenho por segmento | Barras ordenadas | Identificar nichos com mais conversão, não apenas volume. |
| P1 | Valor por estágio | Barras | Pipeline potencial e distribuição de oportunidades. |
| P1 | Faturamento fechado por mês | Colunas/linhas | Evolução de vendas efetivas. |
| P1 | Follow-ups | Agenda/lista, não necessariamente gráfico | Vencidos, hoje e semana. |
| P2 | Temperatura dos leads | Rosca simples | Mix de quentes, mornos e frios. |
| P2 | Dia da semana de resposta | Heatmap | Usar apenas quando houver telemetria suficiente. |

Exigências de visualização:

- Legendas, unidades e tooltips reais; valores absolutos e percentuais quando pertinente.
- Filtros por período e, se disponível, segmento, origem, serviço e responsável.
- Clicar em uma barra/segmento deve navegar para registros filtrados quando suportado.
- Estados `loading`, `empty`, `error` e atualização de dados.
- Boa acessibilidade: contraste, navegação por teclado e alternativa tabular aos gráficos quando necessário.
- Não criar 10 gráficos vazios simultaneamente: renderizar se houver dados e usar empty states úteis.

---

## 6. Propostas e visão financeira (fase intermediária)

- Criar entidade de **propostas** vinculada ao lead, se ainda inexistente: código, título, serviços, valor BRL, validade, situação (`draft`, `sent`, `accepted`, `rejected`, `expired`), datas e observações.
- Permitir múltiplas versões/revisões sem apagar o histórico anterior.
- Diferenciar **valor potencial** de **valor efetivamente fechado**.
- Uma oportunidade só entra em faturamento fechado após confirmação explícita de ganho; considerar ajustes/reaberturas com trilha auditada.
- Não desenvolver pagamentos, emissão fiscal ou ERP neste escopo.

---

## 7. Modelagem e migração de dados

### 7.1. Inspeção obrigatória antes de escrever SQL

Levantar e documentar:

1. Tabelas reais de leads, perfis/usuários, tarefas, interações e propostas (se existentes).
2. Campos atuais de estágio e suas constraints/enums.
3. Rotas, queries, cache e formulários que dependem desses campos.
4. Índices, unique constraints, triggers, RLS, grants, funções e dependências.
5. Quais dados são importados e qual lógica de deduplicação já existe.
6. Se existe suporte a histórico e qual granularidade temporal é confiável.

**Não usar SQL de exemplo cegamente.** Escolha os nomes e relacionamentos depois da inspeção.

### 7.2. Entidades conceituais

- `Lead` — cadastro, dados de contato, segmento, estágio, prioridade, orçamento/valor estimado, origem e campos digitais.
- `LeadActivity` — timeline de ações e interações.
- `LeadStageHistory` — mudança de estágios com timestamps e ator, ou reutilização de uma trilha de eventos suficientemente estruturada.
- `Task` — follow-ups e próximas ações.
- `Proposal` — orçamento vinculado à oportunidade.
- `LeadTag`/`LeadTagLink` — **opcional**, apenas se houver uso claro.

Não duplique `LeadStageHistory` e `LeadActivity` se um evento existente já suprir os requisitos com consultas eficientes.

### 7.3. Estratégia de migração

1. Fazer inventário do esquema e preservar backup/rollback conforme os meios disponíveis.
2. Criar novos campos e tabelas sem quebrar o consumo antigo.
3. Mapear os status antigos de forma explícita e segura; casos ambíguos permanecem pendentes de classificação, não alterados por inferência.
4. Adicionar índices para filtros e ordenações relevantes, após avaliar cardinalidade e padrões de consulta.
5. Atualizar camada de acesso/serviços com tipos e validações.
6. Atualizar formulários, listagens e cálculos; manter compatibilidade durante a transição.
7. Testar integridade, permissões e contagens antes/depois.
8. Se os dados legados não tiverem histórico, iniciar histórico **a partir da implantação**; não gerar métricas históricas sintéticas.
9. Aplicar em produção somente após validação do ambiente e aprovação adequada.

**Segurança:** políticas RLS devem garantir que cada pessoa/organização só visualize e altere seus dados autorizados. Não inventar política simplista `USING (true)` em tabelas contendo contatos comerciais. Nunca enviar credenciais privilegiadas ao cliente.

---

## 8. Design system e UX

- **Preservar** o visual escuro com verde-lima do Prospecta; reutilizar tokens, componentes e padrões presentes no repositório.
- Sidebar organizada por função; “Analytics” preferencialmente dentro de **Comercial**.
- Cards com números legíveis, indicadores explicativos, espaçamento consistente, hover/foco e boas hierarquias.
- Evitar barras de progresso decorativas sem semântica; cada cor deve corresponder a um significado.
- Etiquetas de estágio com cores consistentes, mas sempre acompanhadas de texto.
- Estados vazios com CTA útil: “Nenhuma proposta enviada” → “Criar proposta”; “Nenhuma tarefa” → “Agendar follow-up”.
- Responsivo para desktop/tablet/celular, sem overflow horizontal indevido.
- Formulários com validação, mensagens de erro acionáveis e aviso antes de perder alterações.
- Data e horário exibidos no fuso `America/Sao_Paulo`, armazenados de forma consistente (preferencialmente UTC no banco); datas não devem mudar de dia por erro de timezone.
- Suporte a navegação por teclado, rótulos acessíveis e contraste adequado.
- Não introduzir dados fictícios ou cards de “crescimento +12%” sem fonte real e período comparável.

---

## 9. Plano de execução em etapas

### Fase 0 — Auditoria do projeto (obrigatória)

- [ ] Ler as instruções do repositório e mapear arquitetura, rotas e módulos atuais.
- [ ] Levantar os componentes do dashboard e pipeline e as tabelas reais do Supabase.
- [ ] Validar definições dos KPIs atuais e localizar cálculos inconsistentes.
- [ ] Identificar riscos e preparar plano de migração com preservação de dados.
- [ ] Informar brevemente o plano de execução, os arquivos afetados e os riscos.

### Fase 1 — Base comercial funcional (P0)

- [ ] Separar status, prioridade, temperatura, segmento, origem, serviço e motivo de perda.
- [ ] Implementar fluxo seguro para `won`, `lost`, `nurturing` e `discarded`.
- [ ] Criar/aperfeiçoar página de detalhes do lead.
- [ ] Registrar atividades reais e mudanças de estágio em histórico.
- [ ] Criar tarefas/follow-ups vinculados aos leads.
- [ ] Atualizar Kanban/tabela e filtros, preservando integrações.
- [ ] Exibir alertas para leads sem primeiro contato e tarefas vencidas.

### Fase 2 — Dashboard e Analytics (P0/P1)

- [ ] Redesenhar a Visão geral reduzindo repetição e destacando próximas ações.
- [ ] Corrigir semântica dos KPIs e tratar zero-denominador.
- [ ] Criar funil compacto e evolução temporal com dados reais, seguindo as referências da Seção 13.
- [ ] Criar Analytics por segmento, origem e motivo de perda, seguindo as referências da Seção 13.
- [ ] Adicionar filtros consistentes e drill-down para listas.
- [ ] Garantir loading, empty states, erro, responsividade e acessibilidade.

### Fase 3 — Gestão de propostas (P1)

- [ ] Propostas ligadas às oportunidades, com valores e estados.
- [ ] Exibir valor potencial e faturamento confirmado, sem mistura.
- [ ] Conectar propostas ao histórico e aos lembretes de retorno.

### Fase 4 — Inteligência e automações (P2; não bloquear P0)

- [ ] Lead Scoring explicável, baseado em campos verificáveis (não “pontuação de IA” opaca).
- [ ] Filtros salvos, se fizer sentido com a arquitetura atual.
- [ ] Recomendações de próxima ação, sem enviar mensagens automaticamente.
- [ ] Análise técnica de sites somente com dados efetivamente coletados, não avaliações inventadas.
- [ ] Heatmap e análises mais avançadas após acumular telemetria suficiente.

**Prioridade:** entregar Fase 1 e Fase 2 com funcionalidade real antes de polir recursos da Fase 4.

---

## 10. Critérios de aceite e cenários de teste

### Regras de negócio

- [ ] Cadastrar/importar um lead não gera automaticamente evento de “contatado”.
- [ ] Registrar abordagem movimenta o lead conforme a regra configurada e cria evento auditável.
- [ ] Registrar resposta negativa pode levar a perda, sem marcá-lo como qualificado.
- [ ] Perda exige motivo e aparece nos relatórios correspondentes.
- [ ] Descarte é separado de perda comercial e não polui indicadores de conversão.
- [ ] Lead reaberto preserva o histórico anterior.
- [ ] Tarefa concluída fica registrada e não significa que houve resposta.
- [ ] Ausência de valor estimado não equivale a R$ 0.
- [ ] Nenhuma métrica tenta dividir por zero; exibir estado “Sem dados suficientes”.
- [ ] Os filtros por período são aplicados de forma coerente e a definição de cada métrica é compreensível.

### Persistência e segurança

- [ ] Atualizar a página mantém os estados gravados corretamente.
- [ ] Ações da timeline não desaparecem nem duplicam por re-render/retry.
- [ ] RLS/controle de acesso validado para leitura e escrita em todas as entidades.
- [ ] Dados e origens dos leads anteriores mantidos após a migration.
- [ ] Nenhum segredo ou token privilegiado disponível no frontend.

### UI e qualidade

- [ ] Desktop e mobile utilizáveis.
- [ ] Skeleton/empty/error states tratados.
- [ ] Atalhos do dashboard levam a listas filtradas corretas.
- [ ] Não há indicadores duplicados sem justificativa funcional.
- [ ] Os gráficos exibem somente dados reais, com legendas e período.
- [ ] Testes, lint, typecheck e build executados; problemas preexistentes relatados separadamente.

### Testes mínimos sugeridos

1. Criar lead → confirmar `new` e nenhum contato fictício.
2. Registrar mensagem enviada → atividade e primeira data de contato.
3. Registrar resposta → evento de resposta e atualização da taxa correspondente.
4. Encerrar como perdido por concorrente → aparece em perda por motivo e sai do pipeline ativo.
5. Descartar cadastro duplicado → não conta como oportunidade perdida.
6. Criar follow-up vencido → aparece na área de prioridades.
7. Enviar proposta → aparece em propostas abertas, mas não em faturamento fechado.
8. Confirmar ganho → atualizar estágio e indicador de vendas no período adequado.
9. Filtrar por origem/período → totais e gráfico batem com a lista filtrada.
10. Usuário sem acesso tenta ler/editar lead de outro escopo → acesso negado.

---

## 11. O que NÃO fazer

- Não reconstruir o Prospecta do zero ou substituir seu layout sem necessidade.
- Não mudar logo, branding, navegação e cores por gosto pessoal.
- Não apagar/alterar em massa os leads existentes.
- Não usar dados estáticos, exemplos falsos ou métricas inventadas em produção.
- Não instalar bibliotecas redundantes nem criar microserviços sem demanda.
- Não automatizar disparo de mensagens por WhatsApp ou email sem fluxo aprovado.
- Não misturar métricas de cadastros atuais com métricas de coorte histórica sem explicar.
- Não deixar a aplicação em estado de “meio migrado”.
- Não aplicar SQL no projeto Supabase errado nem fazer deploy em produção sem verificar o alvo e a autorização.

---

## 12. Entregáveis e formato do relatório final da IA

Ao terminar, entregue:

1. **Diagnóstico inicial** do repositório: stack, rotas, dados existentes e principais pontos de risco.
2. **Resumo das mudanças realizadas**, organizado por fase.
3. **Lista de arquivos criados/alterados**, com propósito.
4. **Migrations SQL** criadas, dependências, projeto/ambiente aplicado e modo de rollback (ou declaração explícita de que ainda não foram aplicadas).
5. **KPIs implementados** e fórmulas efetivamente utilizadas.
6. **Testes executados**, resultados de build/lint/typecheck e limitações conhecidas.
7. **Passo a passo para validar manualmente** o fluxo completo de um lead.
8. **Pendências futuras** priorizadas, distinguindo funcionalidade pronta de proposta ainda não implementada.

**Critério de conclusão:** um operador deve conseguir cadastrar/identificar uma empresa, qualificar, registrar contato, organizar follow-up, enviar proposta, encerrar a negociação e visualizar os resultados no dashboard usando **dados persistidos reais**.

---

## 13. Referências visuais e técnicas para os gráficos (obrigatório consultar antes de implementar)

Esta seção foi adicionada para dar à IA **exemplos reais e navegáveis de gráficos**, com escolha explícita de visualização, posicionamento, interação e adaptação ao Prospecta. **São referências, não uma autorização para copiar o layout de terceiros nem trocar a biblioteca do projeto.**

### 13.1. Galerias e documentação de referência

| Referência | URL | Uso recomendado no Prospecta |
|---|---|---|
| **shadcn/ui — galeria de gráficos** | https://ui.shadcn.com/charts | Ponto de partida preferencial se o projeto já usar React + shadcn/ui/Recharts; exemplos visuais e código. |
| **shadcn/ui — documentação de Chart** | https://ui.shadcn.com/docs/components/chart | Padrões de `ChartContainer`, `ChartConfig`, cores/tokens, tooltips, legenda e responsividade. |
| **shadcn/ui — barras** | https://ui.shadcn.com/charts/bar | Barras horizontais para motivos de perda, estágios e nichos; barras agrupadas para comparação. |
| **shadcn/ui — linhas** | https://ui.shadcn.com/charts/line | Evolução de prospecção e comparativo temporal de contatos/respostas/propostas. |
| **shadcn/ui — áreas** | https://ui.shadcn.com/charts/area | Volume temporal e faturamento; preenchimento discreto com uma série, não decoração excessiva. |
| **shadcn/ui — pizza/rosca** | https://ui.shadcn.com/charts/pie | Proporções com poucas categorias, como temperatura dos leads. |
| **shadcn/ui — tooltips** | https://ui.shadcn.com/charts/tooltip | Tooltips legíveis, valores formatados e rótulos claros. |
| **Recharts — exemplos oficiais** | https://recharts.github.io/en-US/examples/ | Exemplos de charts combinados, barras, linhas, áreas e responsividade; referência técnica, se já for dependência. |
| **Nivo — barras** | https://nivo.rocks/bar/ | Referência de barras horizontais, agrupadas e empilhadas (visualmente). |
| **Nivo — funil** | https://nivo.rocks/funnel/ | Inspiração visual para funis; **API experimental**, evitar adicioná-lo só por isso. |
| **Nivo — calendário** | https://nivo.rocks/calendar/ | Inspiração de heatmap/calendário para fase avançada. |
| **Apache ECharts — exemplos** | https://echarts.apache.org/examples/en/index.html | Referência extra de funis e mapas de calor; site interativo requer JavaScript. |

**Ordem de decisão da biblioteca:** (1) reutilizar a solução existente; (2) se já houver `recharts` ou componente shadcn de chart, utilizá-los; (3) se nada existir, escolher a dependência mais simples e compatível depois de inspecionar `package.json` e o framework. Não instalar Recharts, Nivo e ECharts em conjunto.

### 13.2. Referência específica para CADA gráfico solicitado

| Gráfico | Prioridade e posição | Referência visual clicável | Especificação de UI/UX e métrica |
|---|---|---|---|
| **Distribuição por estágio / funil atual** | **P0 · Visão geral** | [Bar horizontal — shadcn](https://ui.shadcn.com/view/new-york-v4/chart-bar-horizontal) · [Nivo Funnel](https://nivo.rocks/funnel/) | Preferir **barras horizontais compactas**, ordenadas pelas etapas do pipeline e com contagens; não desenhar funil histórico usando só status atuais. Se houver histórico confiável, oferecer a opção de funil de conversão por coorte, separadamente. |
| **Evolução de prospecção** | **P0 · Visão geral + Analytics** | [Linhas múltiplas — shadcn](https://ui.shadcn.com/view/new-york-v4/chart-line-multiple) · [Linhas — galeria](https://ui.shadcn.com/charts/line) | Linhas distintas para leads criados, abordagens registradas, respostas e propostas; agregação dia/semana/mês compatível com o período. Padrão visual: grade discreta, pontos no hover, legenda abaixo/ao topo, nada de curvas que ocultem grandes saltos. |
| **Motivos de perda** | **P0 · Analytics** | [Barras horizontais — shadcn](https://ui.shadcn.com/charts/bar) · [Nivo Bar](https://nivo.rocks/bar/) | Barras **ordenadas decrescentemente**; categoria + quantidade + percentual dos perdidos com motivo conhecido. Com poucas perdas, mostrar lista/resumo no lugar de gráfico vazio. |
| **Leads por origem e respectiva conversão** | **P0 · Analytics** | [Barras múltiplas — shadcn](https://ui.shadcn.com/charts/bar) · [Recharts Examples](https://recharts.github.io/en-US/examples/) | Comparar volume de contatos e respostas por Google Maps, Instagram, indicação etc. Não colocar volume e taxa no mesmo eixo sem sinalização; preferir alternância de métrica ou cards complementares. |
| **Conversão por segmento/nicho** | **P1 · Analytics** | [Barras horizontais — shadcn](https://ui.shadcn.com/view/new-york-v4/chart-bar-horizontal) | Ordenar por taxa ou vendas; exibir **denominadores** e mínimo de amostra para evitar conclusões de nichos com um único contato. Permitir alternar volume / resposta / fechamento. |
| **Valor potencial por etapa** | **P1 · Analytics** | [Barras — shadcn](https://ui.shadcn.com/charts/bar) | Barras por estágio, `R$` em tooltip e eixo; somar somente estimativas conhecidas de oportunidades abertas. Exibir registros sem valor em nota própria. |
| **Faturamento fechado ao longo do tempo** | **P1 · Analytics** | [Áreas interativas — shadcn](https://ui.shadcn.com/view/new-york-v4/chart-area-interactive) · [Áreas — galeria](https://ui.shadcn.com/charts/area) | Área/linha discreta com receita **confirmada** por mês; não incluir valor potencial. Tooltip em BRL e atenção para meses vazios e comparações só quando houver dado real. |
| **Temperatura dos leads** | **P2 · Analytics** | [Donut com texto — shadcn](https://ui.shadcn.com/view/new-york-v4/chart-pie-donut-text) · [Roscas — galeria](https://ui.shadcn.com/charts/pie) | Rosca de 3 fatias: quente/morno/frio. Centro com total; rótulos fora do gráfico/legenda acessível. Se houver muitos `não classificados`, explicitar o volume em vez de escondê-lo. |
| **Atividade por dia da semana / horário** | **P2 · Analytics, somente após telemetria** | [Nivo Calendar](https://nivo.rocks/calendar/) · [ECharts Examples](https://echarts.apache.org/examples/en/index.html) | Heatmap somente com datas/horários confiáveis. Medir **taxa** de resposta por janela e mostrar quantidade da amostra; diferenciar momento da abordagem do momento da resposta. Não gerar horas ideais fictícias. |
| **Follow-ups e tarefas** | **P0 · Visão geral e Trabalho** | [shadcn/ui (componentes)](https://ui.shadcn.com/docs/components) | **Não transformar em gráfico por obrigação**. Preferir lista de tarefas vencidas, hoje, próximos 7 dias e botões de ação; mini-barras por situação são opcionais. |

#### Padrões de composição (a IA deve seguir)

- **Visão geral:** mostrar **no máximo 2 gráficos principais**, um de distribuição por estágio e um temporal; o restante é contexto comercial acionável (tarefas, oportunidades e atividade recente).
- **Analytics:** começar por 4 relatórios P0; incluir P1 quando o modelo de dados estiver pronto. P2 não bloqueia a entrega principal.
- **Cada card de gráfico** deve conter título direto, subtítulo definindo o período ou métrica, seletor útil quando necessário, conteúdo gráfico, tooltip acessível, contexto e ação de drill-down quando aplicável.
- **Evitar gráficos ornamentais** (ex.: donut para 12 categorias, velocímetro para um índice sem definição, 3D, gradientes intensos, 5 séries quase indistinguíveis).
- **Barras categóricas:** preferir orientação horizontal quando os nomes dos segmentos são longos; mostrar valores visíveis para não depender apenas de hover.
- **Curvas temporais:** datas cronológicas no eixo X e total com unidade no Y; apresentar corretamente o intervalo sem registros sem fabricar eventos.
- **Eixos e percentuais:** 0 a 100% apenas em métricas percentuais; não confundir contagem com taxa. Em comparações de origens e segmentos, explicitar os denominadores.
- **Não misturar conceitos:** distribuição de **status atuais** ≠ funil de conversão de uma **coorte histórica**. Se a telemetria antiga não existir, não reconstituir conversão passada com dados inventados.

### 13.3. Referências de aparência para o tema dark + verde do Prospecta

Estas páginas são **inspiração de layout e densidade informativa**, não componentes de produção nem licença para copiar identidade visual:

1. **Attio — Reporting 2.0:** https://dribbble.com/shots/24220406-Attio-Reporting-2-0 — boa referência para composição entre funil, curva temporal e relatórios segmentados em um CRM escuro.
2. **SaaS CRM Dashboard — Interfacly:** https://dribbble.com/shots/26994021-SaaS-CRM-Dashboard-UI-Design-Modern-Web-App-Admin-Panel — referência visual particularmente próxima do **preto + verde-lima**; observar cards, barras, rosca e hierarquia visual.

**Direção obrigatória:** reinterpretar as ideias com os **tokens reais** do Prospecta, seu grid, seu spacing e seus componentes. Não replicar logos, elementos proprietários, conteúdo ou ilustrações de outros produtos. Não trazer uma nova paleta só porque a referência a utiliza.

### 13.4. Design system dos gráficos — regras executáveis

- **Cores:** verde-lima existente = ação/destaque ou série principal; cinza neutro = contexto; cores auxiliares discretas e distinguíveis para séries secundárias. Reservar verde de sucesso/vermelho de perda para significados consistentes. Priorizar tokens existentes (`--chart-*`, `--primary`, etc. **somente se já existirem**); caso contrário, criar tokens coerentes sem hardcode espalhado.
- **Superfícies:** fundo do gráfico idêntico à superfície do card; bordas sutis; grade de baixa opacidade; evitar sombra/gradiente exagerados.
- **Tipografia:** títulos e números com alto contraste; eixos e metadados legíveis sem fonte minúscula. Labels críticos sempre visíveis, não somente em tooltip.
- **Layout sugerido:** cards grandes de gráficos aproximadamente 260–340 px de altura no desktop; compactar sem cortar labels em dispositivos móveis. Tratar esses valores como referência, ajustando ao design system.
- **Responsividade:** renderização não deve estourar a largura do card; verificar containers com tamanho conhecido, legendas, eixos e menus em viewport estreita.
- **Interações:** tooltip com unidade, valor absoluto, eventual percentual e período; legenda real; indicação de clique quando houver drill-down; persistir filtros na URL ou estado da página quando apropriado.
- **Acessibilidade:** contraste, labels textuais, foco/teclado quando a biblioteca suportar; oferecer resumo textual/tabela dos dados quando a interpretação visual não for suficiente.
- **Estados:** skeleton com altura estável, empty state explicando qual evento precisa ser registrado, mensagem de erro + opção de tentar novamente, e atualização/sincronização com o Supabase. Não renderizar `0%` quando o denominador não existir.
- **Performance:** agregação no servidor/SQL para volumes maiores, sem consultas independentes repetidas por card; considerar cache conforme stack e permissões. Evitar buscar todos os registros pessoais para montar cada visualização no navegador.

### 13.5. Mapa de implementação: de onde vem cada dado

| Gráfico/indicador | Fonte de dados obrigatória | Regra de consistência |
|---|---|---|
| Estágios atuais | Campo de estágio **atual** dos leads acessíveis | Um lead deve aparecer em apenas uma categoria atual; respeitar descartados/estados especiais. |
| Evolução de prospecção | Timestamp real de cadastro e eventos de atividade | Não inferir mensagens enviadas a partir do cadastro ou estágio novo. |
| Conversão entre etapas | Histórico estruturado de transições (atingiu etapa/data) | Coorte/período estáveis; dados legados sem histórico ficam fora da métrica temporal, com aviso. |
| Motivos de perda | Negócios fechados como perdidos + motivo | Não incluir descartes; separar `não informado` sem ocultar a lacuna. |
| Desempenho por origem/nicho | Fonte/segmento de lead + eventos/fechamentos | Exibir amostra absoluta junto à taxa; deduplicar IDs. |
| Valor em pipeline | Valor estimado das oportunidades **ativas** | Não confundir com propostas recusadas nem faturamento confirmado. |
| Receita fechada | Evento/estado de ganho e valor efetivamente confirmado | Não reconhecer receita por ter enviado uma proposta. |
| Temperatura | Campo próprio de temperatura | Não derivar da cor do estágio. |
| Heatmap de respostas | Horários reais de abordagem e resposta, com timezone correto | Não tirar conclusões com amostra insuficiente. |

### 13.6. Checklist adicional de aceite para gráficos

- [ ] A IA abriu/revisou as referências aplicáveis antes de definir os componentes.
- [ ] A biblioteca de gráficos foi escolhida com base no repositório; não há dependência redundante.
- [ ] As visualizações preservam o dark mode e verde atuais, com contraste adequado.
- [ ] Os gráficos não exibem números fictícios, tendências inventadas ou percentuais sem denominador.
- [ ] O funil histórico não foi fabricado a partir de um snapshot de status.
- [ ] Cada gráfico mostra dados, unidade, período, legenda e estados vazios apropriados.
- [ ] Os filtros e drill-downs batem com as listas reais e com os KPIs.
- [ ] As telas foram conferidas em desktop e mobile; sem labels truncados nem overflow.
- [ ] Os relatórios P2 só aparecem se houver dados confiáveis; senão, indicam indisponibilidade justificadamente.
- [ ] A IA registra no relatório final **qual referência usou para qual gráfico** e quais adaptações realizou.

---

## 14. Primeira ação esperada

**Consulte a Seção 13 (referências de gráficos) ao planejar a Fase 2.** **Comece agora pela Fase 0:** inspecione os arquivos e esquema do projeto, descreva rapidamente o que encontrou e execute as melhorias seguras da Fase 1. Em seguida, avance para os KPIs e gráficos da Fase 2. Evite perguntas sobre preferências já especificadas. Peça autorização somente para ações que alterem produção, exijam credenciais ou envolvam risco de perda de dados.
