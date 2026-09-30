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
