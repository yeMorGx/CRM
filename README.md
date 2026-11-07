# Prospecta

CRM privado para dois usuários, com foco em prospecção de leads e acompanhamento do pipeline.

## Rodar localmente

```bash
pnpm install
pnpm dev
```

O app não cria dados fictícios: sem as variáveis necessárias, ele mostra apenas a tela de configuração. O CRM usa um único espaço fixo e começa vazio, pronto para receber os registros reais.

Para conectar ao Supabase:

1. Copie `.env.example` para `.env.local`.
2. Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Preencha `GOOGLE_PLACES_API_KEY` com uma chave do Google Cloud que tenha a Places API (New) ativada.
4. Execute `supabase/migrations/20260926000000_initial_crm.sql` no SQL Editor do seu projeto.
5. Execute também `supabase/migrations/20260927224952_add_lead_email.sql` para habilitar e-mails nos leads.
6. Crie os usuários em Authentication → Users.
7. Cadastre cada usuário em `public.profiles`, usando o mesmo `id` do Auth:

```sql
insert into public.profiles (id, email, full_name)
values
  ('UUID_DO_USUARIO_1', 'voce@exemplo.com', 'Seu nome'),
  ('UUID_DO_USUARIO_2', 'namorada@exemplo.com', 'Nome dela');
```

Depois disso, o login passa a proteger o dashboard e os leads são lidos e gravados no banco. A chave `service_role` não deve ser colocada em variáveis `NEXT_PUBLIC_`.

Na Vercel, cadastre `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `GOOGLE_PLACES_API_KEY`, `RESEND_API_KEY` e `RESEND_FROM_EMAIL` no projeto `prospecta` para produção. As chaves privadas não devem usar o prefixo `NEXT_PUBLIC_`.

## Sincronização de calendários

A Agenda envia eventos criados, editados, movidos ou excluídos no CRM para os calendários habilitados em **Configurações → Calendários integrados**. A sincronização é do CRM para o provedor; alterações feitas diretamente no Google, Outlook ou Notion não voltam para a Agenda do CRM. Ao desconectar uma conta, os eventos externos já criados ficam no provedor.

1. Configure `APP_BASE_URL` com a URL HTTPS canônica do CRM.
2. Gere uma chave privada para criptografar tokens OAuth, por exemplo com `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`, e salve o resultado em `OAUTH_TOKEN_ENCRYPTION_KEY`.
3. Crie as conexões OAuth para os provedores desejados e cadastre os client IDs e secrets listados no `.env.example`. Registre em cada provedor o callback mostrado no cartão correspondente da tela de configurações.
4. Google precisa de acesso `calendar.events`; Microsoft usa permissões delegadas `Calendars.ReadWrite`, `User.Read` e `offline_access`. A conexão pública do Notion precisa de permissões para ler, inserir e atualizar conteúdo.
5. Aplique `supabase/migrations/20261028004225_calendar_provider_sync.sql` ao banco do projeto.

Para Notion, conceda à conexão OAuth acesso à base. Em Configurações, carregue as bases disponíveis e selecione a propriedade do tipo Título e a propriedade do tipo Data. A integração cria uma página na base; para vê-la no Notion Calendar, adicione a base ao aplicativo e escolha sua propriedade de data. Esses itens são mostrados como dados de uma base Notion, não como eventos dos calendários Google/Outlook que o Notion Calendar também pode exibir.

Tokens de acesso e renovação são criptografados com `OAUTH_TOKEN_ENCRYPTION_KEY` e ficam em tabelas sem acesso direto para `anon` e `authenticated`; o servidor usa a chave privada do Supabase para acessá-los. Se eventos não sincronizarem, Configurações mostra a pendência e oferece nova tentativa.

## E-mails com Resend

- Cadastre uma chave de envio do Resend e verifique o domínio do remetente. O endereço configurado em `RESEND_FROM_EMAIL` deve pertencer a esse domínio.
- Para enviar mensagens a leads, preencha o e-mail no cadastro ou nos detalhes do lead. A mensagem será enviada pelo servidor e aparecerá no histórico do lead.
- Para recuperação de senha, no Supabase abra Authentication → Emails → SMTP Settings e habilite o SMTP personalizado com host `smtp.resend.com`, porta `465`, usuário `resend` e a chave da API como senha. Defina um remetente verificado, por exemplo `no-reply@auth.seudominio.com`.
- Configure `/auth/confirm` como URL de redirecionamento permitida no Supabase. O site pede o link de redefinição pelo fluxo de Auth do Supabase.
- Use remetentes ou subdomínios diferentes para autenticação e mensagens comerciais, conforme a recomendação do Supabase para proteger a reputação de entrega.

## O que já está implementado

- Layout responsivo do CRM Prospecta.
- Login privado via Supabase Auth.
- Estado inicial vazio, sem nomes, métricas, tarefas ou conversas inventadas.
- Login redesenhado com vídeo de referência no painel visual.
- Dashboard com métricas, busca e filtro.
- Kanban com drag-and-drop e persistência do estágio no Supabase.
- Visualização em lista.
- Cadastro manual de leads.
- Painel lateral de detalhes e registro de atividades.
- Busca de negócios via Google Places (New), seleção e importação com deduplicação por `place_id` ou telefone.
- Tarefas compartilhadas com atualização em tempo real.
- Chat privado e presença online via Supabase Realtime.
- Migração SQL com `profiles`, `pipeline_stages`, `leads`, `activities`, `tasks` e `messages`.
- RLS e grants explícitos para as tabelas expostas pela Data API.

## Próximas etapas do plano

- Carregar o histórico completo de atividades no painel do lead.
- Adicionar loaders dedicados e microinterações de acabamento.
- Criar uma landing pública opcional.

## Canvas e fluxogramas

A rota `/canvas` reutiliza a autenticação e o shell do CRM. Aplique a migration `20261029014051_canvas_boards.sql` antes do uso. Cada usuário tem um quadro de cada tipo, privado por RLS, no workspace fixo existente. Não há sincronização colaborativa; edições simultâneas em abas diferentes seguem o último salvamento.

Dependências: @excalidraw/excalidraw 0.18.1 (MIT) e @xyflow/react 12.12.0. O Excalidraw salva a cena serializada e os arquivos inseridos no JSONB do quadro.

## Documentos

A rota `/documents` permite criar e importar Markdown, enviar PDF e Word (.docx), vincular documentos a leads e informar manualmente a data de assinatura de contratos. A marcação não verifica assinaturas digitais. Os documentos são privados por usuário no workspace fixo. Aplique `20261029025657_documents_library.sql` para criar a tabela, o bucket privado e suas políticas. Uploads têm limite de 20 MB; links de leitura assinados duram uma hora. O editor usa Tiptap StarterKit e Markdown, com salvamento explícito e proteção contra sobrescrita por outra aba. HeroUI fornece os botões com estilos do CRM.

A edição ocupa a tela inteira, com propriedades recolhíveis e modos visual/Markdown. Salvar mantém o documento aberto. As prévias usam `react-markdown` e PDF.js, sem iframes nos cartões. `dev` e `build` executam `scripts/prepare-pdf-assets.mjs` para servir o worker e as fontes do PDF.js pelo próprio site, sem enviar arquivos a serviços externos. A renderização visual de PDFs preserva um link para abrir o original com seleção de texto e acessibilidade nativa.

## Evolução comercial

Dashboard, Analytics, qualificação, tarefas, propostas e contratos: veja [entrega e validação](docs/EVOLUCAO_ANDAMENTO.md). A geração de contratos exige completar Gestão → Empresa. Apagar lead fica no final da ficha e exige confirmar o nome exato; a exclusão é permanente.

