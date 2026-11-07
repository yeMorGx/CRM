# Briefing para o agente: Planos e Contrato no site de prospecção

*Documento para o agente de código (Codex) que trabalha no site. Leia tudo antes de começar. Siga as fases na ordem e pare no fim de cada uma para mostrar o que foi feito.*

## 0. Como usar este documento

**Anexos que acompanham este briefing** (tudo está dentro deste documento; não há arquivos externos):

- **Anexo A**: o texto completo do contrato, com os campos em `{{chaves}}`. Esse é o texto oficial: reaproveite sem reescrever.
- Este documento, com os planos, o fluxo e o banco.

**Regras de trabalho:**

1. Antes de escrever código, **inspecione o repositório**: estrutura de pastas, tabela de leads, autenticação, cliente do Supabase, componentes HeroUI já em uso. Reaproveite o que existir; não crie duplicatas.
2. Use **HeroUI v3** (MCP `heroui-react`) e o tema atual do site: dark, minimalista, **sem bordas** (separação só por tom de superfície), accent rosa. Consulte o MCP para usar os componentes reais, sem inventar versões improvisadas.
3. Stack do projeto: Next.js, TypeScript, Tailwind, Supabase. Não adicione bibliotecas novas sem necessidade; se precisar, diga qual e por quê.
4. **Não altere telas existentes** fora do que este briefing pede.
5. Ao fim de cada fase rode `typecheck`, `lint` e `build`. Só avance se passar.
6. Se uma decisão não estiver neste documento, escolha a opção mais simples e anote em um comentário `// DECISÃO:` para o Gabriel revisar.

## 1. Objetivo

O site de prospecção é **interno** (uso da equipe). Hoje ele gerencia leads. Precisamos de duas funcionalidades novas:

1. **Proposta de planos por link:** a equipe gera um link para um lead; o cliente abre o link (sem login), vê os planos, **personaliza** com extras, escolhe e envia a escolha.
2. **Contrato:** com o plano escolhido, a equipe gera, dentro do site, o **contrato em PDF** pronto para assinar, já com os dados fixos da empresa e as assinaturas dos dois sócios.

## 2. Fluxo completo

1. Equipe abre um lead e clica em **Enviar proposta**.
2. Escolhe quais planos aparecem, qual fica em destaque e a validade do link. O sistema gera o link e a equipe copia ou envia pelo WhatsApp.
3. Cliente abre `/p/[token]`, compara os planos, liga ou desliga extras (o total atualiza na hora), escolhe o plano e confirma com nome, e-mail e telefone.
4. O sistema salva a escolha e muda o status da proposta. A equipe vê o aviso no lead.
5. Equipe clica em **Gerar contrato**. O formulário já vem preenchido com o plano e os valores escolhidos; a equipe completa o restante (CNPJ do cliente, domínio, páginas etc.).
6. O sistema gera o PDF com as assinaturas dos sócios e guarda no armazenamento privado. A equipe baixa e envia ao cliente.
7. Quando o cliente devolver assinado, a equipe sobe o PDF assinado e marca como **assinado**.

## 2.1. Tudo conectado: a ficha do lead é a fonte única de dados

**Esta seção prevalece sobre as demais se houver conflito.** Cada lead tem uma **ficha de plano e contrato** dentro do próprio lead. O link da proposta, o contrato e o PDF **leem dessa ficha**. Nada é digitado duas vezes. A ficha é uma área dentro do lead; não é um login para o cliente (o cliente só acessa o link com token).

**Regras:**

1. A ficha guarda: plano, extras, totais, dados do cliente (nome, CPF/CNPJ, endereço, e-mail, telefone), dados do projeto (tipo, domínio, páginas, funcionalidades, prazo, rodadas) e condições (entrada %, vencimento, forma de pagamento).
2. A ficha pode ser preenchida de **duas formas**: (a) o cliente escolhe no link `/p/[token]` e a escolha grava na ficha; (b) a equipe escolhe **manualmente no lead** (seletor de plano e extras), sem precisar do link, por exemplo quando fechou por WhatsApp ou reunião.
3. Mudou o plano ou um extra na ficha: o servidor recalcula os totais e registra a mudança na página de auditoria.
4. O botão **Gerar contrato** lê apenas da ficha. O formulário do contrato é uma visão editável da ficha; o que a equipe editar ali volta para a ficha.
5. O contrato guarda uma **cópia dos dados no momento da geração** (`data`). Se a ficha mudar depois, o contrato antigo ganha o aviso **desatualizado** e a equipe pode gerar a **versão 2**, mantendo a versão 1 no histórico.
6. No **Enterprise**, a ficha é preenchida à mão: valores de implantação e mensalidade livres (`custom_setup`, `custom_monthly`).
7. O **status do lead avança sozinho** conforme os eventos: proposta enviada, proposta vista, plano escolhido, contrato gerado, contrato assinado. A lista de leads mostra o selo do plano e o status do contrato.
8. No lead, uma aba **Plano e contrato** reúne a ficha, as propostas enviadas, as versões de contrato e os PDFs.

**Como o plano preenche o contrato:**

| Campo do contrato | Vem de |
| --- | --- |
| Plano, páginas, alterações/mês, horas de desenvolvimento, resposta do suporte, backups, monitoramento, relatório, permanência | `plans.limits` e `plans.features` |
| Taxa de implantação e entrada (%) | totais da ficha e `terms.entrada_pct` |
| Mensalidade e tabela de composição | `plans.monthly_breakdown` + extras mensais como linhas adicionais |
| Dados do cliente | `lead_plan.client` |
| Tipo, domínio, funcionalidades, prazo, rodadas | `lead_plan.project` |
| Vencimento e forma de pagamento | `lead_plan.terms` |
| Empresa, sócios, assinaturas, cláusulas padrão | `company_settings` |

A composição da mensalidade (hospedagem, domínio, licenças, manutenção) fica em `plans.monthly_breakdown`, editável em `/planos`. Valores iniciais sugeridos:

| Plano | Hospedagem | Domínio | Licenças | Manutenção e suporte | Total |
| --- | --- | --- | --- | --- | --- |
| Starter | R$ 49 | R$ 10 | R$ 0 | R$ 90 | R$ 149 |
| Pro | R$ 79 | R$ 10 | R$ 30 | R$ 230 | R$ 349 |
| Platinum | R$ 129 | R$ 10 | R$ 60 | R$ 550 | R$ 749 |

**Banco de dados (acrescenta ao da seção 5):**

```sql
create table lead_plan (
  lead_id uuid primary key references leads(id) on delete cascade,
  plan_id text references plans(id),
  addons jsonb not null default '[]',        -- [{id, qty}]
  total_setup numeric,
  total_monthly numeric,
  custom_setup numeric,                      -- só Enterprise ou ajuste manual
  custom_monthly numeric,
  client jsonb not null default '{}',        -- nome, doc, endereco, email, telefone
  project jsonb not null default '{}',       -- tipo, dominio, paginas, funcionalidades, prazo, rodadas
  terms jsonb not null default '{}',         -- entrada_pct, vencimento, forma_pagamento
  source text check (source in ('client_link','team')),
  source_proposal_id uuid references proposals(id),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table plans add column monthly_breakdown jsonb not null default '{}';
  -- {hospedagem, dominio, licencas, manutencao}

alter table contracts
  add column version int not null default 1,
  add column superseded_by uuid references contracts(id);
```

RLS ativo em `lead_plan`, sem policy para `anon`, como nas outras tabelas.

**Ajustes nas fases:** criar `lead_plan` e `monthly_breakdown` na Fase 1. Na Fase 2, fazer a aba **Plano e contrato** do lead (com a escolha manual de plano) **antes** do link público, e o link passa a gravar na ficha. Na Fase 3, o contrato lê da ficha.

**Critérios de aceite extras:**

- Escolher um plano manualmente no lead e gerar o contrato: o PDF traz páginas, limites, valores e tabela de composição daquele plano, sem digitar nada.
- Cliente escolhe pelo link: a ficha do lead muda e o status do lead avança.
- Trocar o plano na ficha depois de gerar o contrato: o contrato antigo aparece como desatualizado e é possível gerar a versão 2.
- Nenhum campo do contrato é digitado em dois lugares.

## 3. Planos (dados iniciais)

**Os valores abaixo são sugestões de partida.** Tudo deve ser **editável na tela interna `/planos`**, nunca fixo no código. Carregue como seed.

|  | **Starter** | **Pro** | **Platinum** | **Enterprise** |
| --- | --- | --- | --- | --- |
| Para quem | Presença online simples | Gerar leads e crescer | Site que sustenta o faturamento | Projetos grandes ou fora do padrão |
| Páginas | até 5 | até 10 | até 20 ou loja/área do cliente | Definido na proposta |
| Funcionalidades | Institucional ou landing page, formulário, botão de WhatsApp, SEO básico | Tudo do Starter + blog, SEO on-page, Analytics, integração com e-mail/CRM | Tudo do Pro + integrações sob medida, loja ou sistema próprio | Tudo do Platinum + ERP/CRM/pagamentos/APIs, painel admin, múltiplos perfis |
| Hospedagem, domínio e SSL | Incluídos | Incluídos | Incluídos | Incluídos |
| Backups | Mensal | Semanal | Diário | Diário |
| Monitoramento | Não | Sim | Sim, com alerta imediato | Sim, com alerta imediato |
| Alterações de conteúdo/mês | 2 | 6 | 15 | Negociado |
| Horas de desenvolvimento/mês | 0 | 0 | 4 | Pacote negociado |
| Resposta do suporte | 48 h úteis | 24 h úteis | até 4 h úteis | SLA em contrato |
| Relatório | Não | Trimestral | Mensal | Mensal + reunião |
| Implantação (única) | R$ 1.500 | R$ 3.500 | a partir de R$ 7.000 | Sob consulta |
| Mensalidade | R$ 149 | R$ 349 | R$ 749 | Sob consulta |
| Permanência mínima | 12 meses | 12 meses | 12 meses | Definida na proposta |

**Regras de exibição:**

- O **Pro** vem em destaque por padrão (selo “Mais escolhido”). A equipe pode trocar o destaque por proposta.
- O **Enterprise** não tem preço nem botão “Escolher”: o botão é **Falar com a equipe**. Ele registra o interesse na proposta e abre o WhatsApp da empresa com uma mensagem pronta.
- O Platinum mostra “a partir de” na implantação.

## 4. Personalização (extras)

O cliente pode ligar e desligar extras e ver o total mudar. Cada extra tem: nome, descrição curta, preço, tipo (`única` ou `mensal`), unidade (ex.: por página) e **em quais planos se aplica**. Seed inicial (editável em `/planos`):

| Extra | Tipo | Preço sugerido | Aplica-se a |
| --- | --- | --- | --- |
| Página extra | única, por página | R$ 250 | Starter, Pro, Platinum |
| Alteração de conteúdo extra/mês | mensal, por alteração | R$ 29 | Starter, Pro, Platinum |
| Pacote de 2 horas de desenvolvimento/mês | mensal | R$ 300 | Starter, Pro |
| Backup diário | mensal | R$ 60 | Starter, Pro |
| Monitoramento com alerta | mensal | R$ 40 | Starter |
| Blog | única | R$ 600 | Starter |
| Integração com e-mail marketing/CRM | única | R$ 500 | Starter |
| SEO avançado | única | R$ 900 | Starter, Pro |

**Regras do cálculo (faça no servidor também, nunca confie só no cliente):**

- Total de implantação = implantação do plano + soma dos extras de tipo `única`.
- Total mensal = mensalidade do plano + soma dos extras de tipo `mensal`.
- Extra com quantidade (página, alteração) multiplica pelo número escolhido (mínimo 1, máximo 20).
- Ao salvar a escolha, o servidor **recalcula tudo a partir do banco** e grava os totais. Valores vindos do navegador são ignorados.

## 5. Banco de dados (Supabase)

Adapte nomes e tipos ao que já existir (especialmente a referência à tabela de leads). Ative **RLS em todas as tabelas novas, sem nenhuma policy para o papel `anon`**.

```sql
create table plans (
  id text primary key,               -- 'starter','pro','platinum','enterprise'
  name text not null,
  tagline text,
  sort int not null default 0,
  on_request boolean not null default false,
  setup_price numeric,
  monthly_price numeric,
  setup_is_from boolean not null default false,
  features jsonb not null default '[]',  -- lista de textos para o card
  limits jsonb not null default '{}',    -- paginas, alteracoes_mes, horas_dev_mes, backup, suporte_h, permanencia_meses
  active boolean not null default true
);

create table plan_addons (
  id text primary key,
  name text not null,
  description text,
  kind text not null check (kind in ('once','monthly')),
  price numeric not null,
  unit text,                          -- ex.: 'por página'
  applies_to text[] not null default '{}',
  active boolean not null default true
);

create table proposals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  token text unique not null,         -- 24 bytes aleatórios em base64url
  status text not null default 'sent'
    check (status in ('sent','viewed','chosen','contract_generated','signed','expired','cancelled')),
  visible_plan_ids text[] not null,
  highlighted_plan_id text,
  expires_at timestamptz not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  first_viewed_at timestamptz,
  chosen_plan_id text references plans(id),
  chosen_addons jsonb,                -- [{id, qty}]
  total_setup numeric,
  total_monthly numeric,
  client_name text, client_email text, client_phone text, client_note text,
  chosen_at timestamptz,
  enterprise_interest boolean not null default false
);

create table company_settings (        -- uma única linha
  id int primary key default 1 check (id = 1),
  legal_name text, cnpj text, address text, email text, whatsapp text, logo_path text,
  partners jsonb not null default '[]',   -- [{name, role, signature_path}]
  clause_defaults jsonb not null default '{"idx":"IPCA","perm":"12","multa":"30","aviso":"30","foro":"Santos/SP"}'
);

create table contracts (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references proposals(id),
  lead_id uuid not null references leads(id),
  data jsonb not null,                 -- todos os campos usados no texto do contrato
  pdf_path text,
  signed_pdf_path text,
  status text not null default 'generated'
    check (status in ('generated','sent','signed','cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
```

**Armazenamento (buckets privados):** `signatures` (PNG das assinaturas), `contracts` (PDFs gerados e assinados) e `branding` (logo, se necessário). Nenhum deles público.

## 6. Telas internas (com login)

**6.1. `/planos` (admin):** lista os planos e extras, com edição de preços, textos, limites e ativo/inativo. Uma prévia de como o card aparece para o cliente.

**6.2. Configurações da empresa:** formulário da `company_settings` (razão social, CNPJ, endereço, e-mail, WhatsApp, logo), **upload das assinaturas dos dois sócios** (nome, cargo, PNG com fundo transparente) e as cláusulas padrão (índice, permanência, multa, aviso, foro).

**6.3. Dentro do lead:** botão **Enviar proposta** abre um modal com: planos visíveis (checkboxes), plano em destaque, validade (7, 15 ou 30 dias). Ao confirmar, mostra o link com botões **Copiar** e **Enviar por WhatsApp**. O lead mostra o histórico de propostas com status (enviada, vista, escolhida, contrato gerado, assinada) e, quando escolhida, o resumo da escolha (plano, extras, totais, dados do cliente) e o botão **Gerar contrato**.

**6.4. Gerar contrato:** formulário com os campos do Anexo B que variam por cliente. Já vem preenchido com o plano, os valores e os dados do lead. Mostra a prévia do contrato ao lado. Botão **Gerar PDF** salva o arquivo e registra em `contracts`.

**6.5. Lista de contratos:** dentro da área de documentação do site (contratos, normas, LGPD), com status, baixar PDF, subir PDF assinado e marcar como assinado.

## 7. Página pública da proposta: `/p/[token]`

- **Sem login** e **sem a navegação interna do site**. É uma página limpa, com a marca da empresa (logo e nome vindos de `company_settings`).
- **Mobile primeiro:** o cliente quase sempre abre pelo celular, vindo do WhatsApp.
- Mesmo tema dark minimalista do site, usando HeroUI.
- Cards dos planos visíveis, com destaque no escolhido pela equipe. Abaixo, uma tabela comparativa dos itens de cada plano.
- Bloco de **extras** com interruptores e campos de quantidade. O **resumo fixo** mostra implantação, mensalidade e permanência, atualizando em tempo real.
- Botão **Escolher este plano** abre uma confirmação pedindo nome, e-mail, telefone e observação opcional. Ao enviar, mostra a tela de sucesso (“Recebemos sua escolha, entraremos em contato”).
- Enquanto o contrato não for gerado, o cliente pode abrir o link de novo e **trocar a escolha**. Depois disso, o link mostra a escolha em modo leitura.
- Link expirado ou cancelado: página amigável com o contato da empresa.
- Marcar a primeira abertura (`first_viewed_at` e status `viewed`). Incluir `<meta name="robots" content="noindex,nofollow">`.

## 8. Segurança (obrigatório)

1. **Token:** gerar com `crypto.randomBytes(24).toString('base64url')`. Nunca usar o id da proposta no link.
2. A página pública e a gravação da escolha usam **rotas do servidor** (Route Handlers ou Server Actions) com a service role key, **buscando sempre por token**. A service role key nunca vai ao navegador.
3. RLS ativo, sem policy para `anon`. O navegador do cliente não fala direto com as tabelas.
4. **Rate limit** na rota de envio da escolha (ex.: 10 por minuto por IP).
5. Validar todos os campos no servidor (tipos, tamanhos, e-mail, telefone). Escapar tudo que for exibido.
6. **Assinaturas e PDFs só em buckets privados.** As imagens de assinatura são lidas **somente no servidor** para montar o PDF. Download de PDF por URL assinada com expiração curta (ex.: 60 segundos), só para usuário autenticado da equipe.
7. Nenhum dado pessoal na URL além do token. Não registrar o token em logs.
8. Só usuários autenticados da equipe acessam as telas internas e geram contratos.
9. Registrar na **página de auditoria** do site: proposta criada, vista, escolhida, contrato gerado, contrato assinado, e edições em planos e configurações.

## 9. Contrato

- O **texto e a estrutura** são os do Anexo A deste documento. Migre para um componente de template em TypeScript, recebendo um objeto tipado com os campos do Anexo B.
- **Dados fixos** vêm de `company_settings`: razão social, CNPJ, endereço, e-mail, sócios (nome, cargo, assinatura) e cláusulas padrão (índice, permanência, multa, aviso, foro). Não aparecem no formulário.
- **Dados por cliente** vêm da proposta e do lead, e a equipe edita antes de gerar: nome, CPF/CNPJ, endereço e e-mail do cliente, tipo de site, domínio, nº de páginas, funcionalidades, prazo, rodadas de ajuste, entrada (%), vencimento, forma de pagamento, alterações por mês, tempo de resposta, e a tabela de custos da mensalidade (hospedagem, domínio, licenças, manutenção).
- A tabela de composição da mensalidade soma o total sozinha. Se houver extras mensais, listá-los como linhas adicionais.
- **Geração do PDF no servidor**, sem navegador headless se possível (ex.: `@react-pdf/renderer`). O PDF sai com texto selecionável, A4, margens de 18 mm, quebra de página sem cortar cláusula no meio, e o bloco de assinaturas sem quebrar entre páginas.
- No bloco de assinaturas: as **imagens dos dois sócios** acima da linha, nome e cargo, e a linha do cliente em branco.
- Fallback aceitável: página `/contratos/[id]/imprimir` com CSS de impressão, caso o PDF no servidor dê problema.
- Nome do arquivo: `contrato-{cliente-slug}-{AAAA-MM-DD}.pdf`.
- **Assinatura do cliente** nesta versão é manual: ele assina e devolve; a equipe sobe o PDF assinado. Integração com serviço de assinatura eletrônica fica para depois (ver seção 11).

## 10. Fases e critérios de aceite

**Fase 1: Base e administração**

- Criar tabelas, RLS, buckets e seeds de planos e extras.
- Telas `/planos` e Configurações da empresa (com upload das assinaturas).
- *Aceite:* editar um preço em `/planos` e ver o valor mudar no banco; subir uma assinatura e ela ficar em bucket privado.

**Fase 2: Proposta por link**

- Modal “Enviar proposta” no lead, geração do token, copiar e WhatsApp.
- Página pública `/p/[token]` com planos, extras, cálculo e escolha.
- Status e histórico no lead, avisos de visualização e escolha.
- *Aceite:* abrir o link em janela anônima, ajustar extras, escolher o plano e ver a escolha no lead com totais corretos (conferir recálculo no servidor); link expirado mostra a página amigável; Enterprise leva ao WhatsApp.

**Fase 3: Contrato em PDF**

- Formulário com prévia, pré-preenchido pela proposta.
- Geração do PDF no servidor com assinaturas dos sócios.
- Lista de contratos, subir PDF assinado, marcar como assinado.
- *Aceite:* gerar um contrato de teste, abrir o PDF e conferir cláusulas, valores, tabela de custos e as duas assinaturas; campos vazios nunca saem como `undefined`.

**Fase 4: Acabamento**

- Auditoria, estados vazios e de erro, responsividade, textos em português.
- *Aceite:* `typecheck`, `lint` e `build` passando; fluxo completo testado de ponta a ponta.

## 11. Fora do escopo (não fazer agora)

- Integração com assinatura eletrônica (Clicksign, D4Sign, Autentique): fica como evolução.
- Pagamento online e cobrança recorrente.
- Envio automático de e-mail ao cliente (o envio do link é manual pela equipe).
- Edição do texto das cláusulas pela interface.

## 12. Confirme no repositório antes de começar

Liste as respostas em um comentário curto antes da Fase 1:

1. Nome da tabela de leads e do seu id.
2. Como é feita a autenticação da equipe e como proteger rotas internas.
3. Já existe cliente do Supabase para servidor com service role?
4. Já existe a página de auditoria e como registrar eventos nela.
5. Onde fica a área de documentação (contratos, normas, LGPD) para encaixar a lista de contratos.
6. Biblioteca de PDF já instalada, se houver.

*Observação para o Gabriel: o texto do contrato é um modelo e deve passar por revisão jurídica antes do uso em produção. Os preços são sugestões iniciais.*

## Anexo A: texto oficial do contrato

*Substitua cada `{{chave}}` pelo valor correspondente (lista de chaves no Anexo B). Valor vazio nunca vira `undefined`: use uma linha em branco `________` e destaque no preview, mas não no PDF final se o campo for obrigatório (nesse caso, bloqueie a geração). Valores em reais no formato `R$ 1.234,56`. Mantenha títulos, numeração e ordem das cláusulas.*

### CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE DESENVOLVIMENTO E MANUTENÇÃO DE SITE EM REGIME DE ASSINATURA

**CONTRATADO:** {{empresa.razao\_social}}, CNPJ {{empresa.cnpj}}, {{empresa.endereco}}, e-mail {{empresa.email}}, representada por {{socios.nomes}} (nomes separados por “ e ”).

**CONTRATANTE:** {{cliente.nome}}, CPF/CNPJ {{cliente.doc}}, {{cliente.endereco}}, e-mail {{cliente.email}}.

As partes firmam o presente contrato, regido pelas cláusulas a seguir.

**1. OBJETO**

1.1. Desenvolvimento de site {{projeto.tipo}} com {{projeto.paginas}} página(s), no domínio {{projeto.dominio}}, com as seguintes funcionalidades: {{projeto.funcionalidades}}; e sua manutenção contínua em regime de assinatura, conforme o plano {{plano.nome}}.

1.2. Serviços não previstos neste contrato são adicionais e dependem de orçamento aprovado por escrito (e-mail ou mensagem valem como aprovação escrita), cobrados a {{valor\_hora}} por hora.

**2. O QUE A ASSINATURA INCLUI**

Hospedagem, renovação de domínio e certificado SSL; atualizações técnicas e correção de falhas; backups {{plano.backup}}; monitoramento: {{plano.monitoramento}}; até {{plano.alteracoes\_mes}} alteração(ões) de conteúdo por mês; {{plano.horas\_dev}} hora(s) de desenvolvimento por mês; relatório: {{plano.relatorio}}; e suporte com resposta em até {{plano.resposta\_h}} hora(s) útil(eis). Extras contratados: {{extras.lista}} (se não houver, omitir esta frase). Não estão incluídos: novas páginas ou funcionalidades, redesign, produção de conteúdo, tráfego pago, SEO avançado (salvo se contratado como extra), e-mail corporativo e alterações acima da franquia.

**3. VALORES E TRANSPARÊNCIA DE CUSTOS**

3.1. **Taxa de implantação (única):** {{taxa\_implantacao}}, sendo {{entrada\_pct}}% na assinatura e o restante na entrega.

3.2. **Mensalidade:** {{mensalidade\_total}}, composta por:

| Componente | Valor mensal |
| --- | --- |
| Hospedagem | {{mensal.hospedagem}} |
| Domínio (rateio) | {{mensal.dominio}} |
| Licenças e ferramentas de terceiros | {{mensal.licencas}} |
| Manutenção e suporte | {{mensal.manutencao}} |
| *(uma linha por extra mensal contratado)* | {{extra.valor}} |
| **Total** | **{{mensalidade\_total}}** |

3.3. Custos de terceiros contratados diretamente pelo CONTRATANTE não estão incluídos. O CONTRATADO apresentará, quando solicitado, o demonstrativo de custos variáveis.

**4. PAGAMENTO**

4.1. A mensalidade será paga por {{forma\_pagamento}}, todo dia {{vencimento}} de cada mês.

4.2. Em atraso, incidem multa de 2%, juros de 1% ao mês e correção pelo {{indice}}. Após 10 dias de atraso, os serviços podem ser suspensos, inclusive o site, mediante notificação; após 30 dias, o contrato pode ser rescindido, sem prejuízo da cobrança.

**5. REAJUSTE**

Os valores serão reajustados a cada 12 meses pelo {{indice}} acumulado. Aumentos relevantes de custos de terceiros poderão gerar reajuste extraordinário com aviso prévio de 30 dias, permitindo ao CONTRATANTE rescindir sem multa nesse prazo.

**6. VIGÊNCIA E RESCISÃO**

6.1. Prazo inicial de {{permanencia}} meses (permanência mínima), renovado automaticamente por períodos iguais, salvo aviso contrário com {{aviso}} dias de antecedência.

6.2. Após a permanência mínima, o CONTRATANTE pode rescindir com aviso prévio de {{aviso}} dias, pagando as mensalidades até o fim do aviso.

6.3. Rescisão antes do fim da permanência mínima implica multa de {{multa}}% das mensalidades restantes.

6.4. Qualquer parte pode rescindir sem multa se a outra descumprir o contrato e não sanar a falha em 10 dias após notificação.

6.5. Na rescisão, estando o CONTRATANTE em dia, serão entregues seus arquivos e dados em até 15 dias. A taxa de implantação não é reembolsável após o início do desenvolvimento.

**7. PRAZOS E ACEITE**

O prazo estimado de entrega é de {{prazo}} dias úteis, contados do pagamento da entrada e do recebimento de todos os materiais; atrasos do CONTRATANTE prorrogam o prazo. Estão incluídas {{rodadas}} rodada(s) de ajuste. Após a entrega, o CONTRATANTE tem 5 dias corridos para pedir correções; sem manifestação, o site é considerado aceito.

**8. OBRIGAÇÕES DO CONTRATANTE**

Fornecer materiais e acessos no prazo; garantir que possui os direitos sobre o conteúdo enviado; não permitir que terceiros alterem o site sem aviso ao CONTRATADO, sob pena de perda de garantia e suporte; usar o site de forma lícita.

**9. PROPRIEDADE INTELECTUAL**

Marcas e conteúdos do CONTRATANTE permanecem seus. Após a quitação da taxa de implantação, o CONTRATANTE recebe licença de uso do design e do conteúdo final do site. Bibliotecas, templates e ferramentas utilizados permanecem de seus titulares, com licença de uso enquanto o contrato vigorar. O CONTRATADO pode citar o projeto em seu portfólio.

**10. LGPD E CONFIDENCIALIDADE**

As partes cumprirão a Lei 13.709/2018. Quanto aos dados coletados pelo site, o CONTRATANTE é controlador e o CONTRATADO, operador, que tratará os dados apenas conforme este contrato, adotará medidas razoáveis de segurança e comunicará incidentes. As partes manterão sigilo das informações confidenciais durante a vigência e por 2 anos após o término.

**11. RESPONSABILIDADE**

O CONTRATADO não garante resultados comerciais (vendas, visitas ou posicionamento em buscadores) e não responde por falhas de provedores de terceiros, uso indevido de credenciais, conteúdo fornecido pelo CONTRATANTE, caso fortuito ou força maior. A responsabilidade total, quando reconhecida, limita-se às mensalidades pagas nos 3 meses anteriores ao evento, salvo dolo ou hipótese em que a lei não permita limitação.

**12. DISPOSIÇÕES GERAIS E FORO**

Este contrato é o acordo integral das partes; alterações exigem forma escrita. Se alguma cláusula for inválida, as demais permanecem. Fica eleito o foro de {{foro}}, ressalvado o foro do consumidor quando aplicável. As partes aceitam a assinatura eletrônica (MP 2.200-2/2001 e Lei 14.063/2020).

{{foro}}, {{data\_extenso}}.

**Bloco de assinaturas** (uma coluna por assinante, em linha; não quebrar entre páginas): para cada sócio em `company_settings.partners`, a imagem da assinatura acima da linha, depois nome e “Cargo · CONTRATADO”; por último a coluna do cliente, só com a linha, `{{cliente.nome}}` e “CONTRATANTE”.

**Resumo do plano contratado** (página final do PDF, para o cliente ter tudo em uma vista):

| Item | Contratado |
| --- | --- |
| Plano | {{plano.nome}} |
| Páginas | {{projeto.paginas}} |
| Backups | {{plano.backup}} |
| Monitoramento | {{plano.monitoramento}} |
| Alterações de conteúdo/mês | {{plano.alteracoes\_mes}} |
| Horas de desenvolvimento/mês | {{plano.horas\_dev}} |
| Resposta do suporte | {{plano.resposta\_h}} h úteis |
| Relatório | {{plano.relatorio}} |
| Extras | {{extras.lista}} |
| Implantação | {{taxa\_implantacao}} |
| Mensalidade | {{mensalidade\_total}} |
| Permanência mínima | {{permanencia}} meses |

## Anexo B: campos do contrato e de onde vem cada um

Regra geral: **empresa e sócios** vêm de `company_settings`; **plano e limites** vêm de `plans`; **cliente, projeto e condições** vêm da ficha `lead_plan` do lead e são editáveis no formulário antes de gerar.

| Chave | Rótulo no formulário | Origem | Obrigatório |
| --- | --- | --- | --- |
| `empresa.razao_social`, `empresa.cnpj`, `empresa.endereco`, `empresa.email` | (não aparece) | `company_settings` | sim |
| `socios.nomes` | (não aparece) | `company_settings.partners` | sim |
| `cliente.nome` | Nome / razão social | `lead_plan.client` (pré-preenchido com o lead) | sim |
| `cliente.doc` | CPF/CNPJ | `lead_plan.client` | sim |
| `cliente.endereco` | Endereço | `lead_plan.client` | sim |
| `cliente.email` | E-mail | `lead_plan.client` | sim |
| `projeto.tipo` | Tipo de site | `lead_plan.project` (padrão: institucional) | sim |
| `projeto.dominio` | Domínio | `lead_plan.project` | sim |
| `projeto.paginas` | Nº de páginas | `plans.limits` + páginas extras escolhidas | sim |
| `projeto.funcionalidades` | Funcionalidades | `lead_plan.project` | sim |
| `prazo` | Prazo de entrega (dias úteis) | `lead_plan.project` (padrão: 20) | sim |
| `rodadas` | Rodadas de ajuste | `lead_plan.project` (padrão: 2) | sim |
| `plano.nome` | Plano | `plans.name` | sim |
| `plano.backup`, `plano.monitoramento`, `plano.horas_dev`, `plano.relatorio`, `plano.resposta_h` | (automático) | `plans.limits` | sim |
| `plano.alteracoes_mes` | Alterações de conteúdo por mês | `plans.limits` + alterações extras | sim |
| `extras.lista` | (automático) | `lead_plan.addons` | não |
| `taxa_implantacao` | Taxa de implantação | `lead_plan.total_setup` (ou `custom_setup`) | sim |
| `entrada_pct` | Entrada (%) | `lead_plan.terms` (padrão: 50) | sim |
| `mensalidade_total` | (soma automática) | soma de `mensal.*` + extras mensais | sim |
| `mensal.hospedagem`, `mensal.dominio`, `mensal.licencas`, `mensal.manutencao` | (automático, editável) | `plans.monthly_breakdown` | sim |
| `valor_hora` | Valor-hora extra | configuração geral | sim |
| `forma_pagamento` | Forma de pagamento | `lead_plan.terms` (padrão: PIX) | sim |
| `vencimento` | Dia de vencimento | `lead_plan.terms` (padrão: 10) | sim |
| `indice`, `permanencia`, `multa`, `aviso`, `foro` | (não aparecem) | `company_settings.clause_defaults` | sim |
| `data_extenso` | (automático) | data de geração, formato “31 de outubro de 2026” | sim |

**Validações antes de gerar o PDF:** todos os campos “sim” preenchidos; CPF/CNPJ com dígitos válidos; e-mail válido; números não negativos; `mensalidade_total` igual à soma da tabela; as imagens de assinatura dos sócios existem. Se algo falhar, mostrar a lista do que falta e bloquear a geração.
