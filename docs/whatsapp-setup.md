# Configuração do WhatsApp no Prospecta

O CRM usa a [WhatsApp Business Platform (Cloud API)](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api): a API envia mensagens e o webhook recebe mensagens, ecos do app e estados de entrega. Esta integração é independente do chat interno do Prospecta.

## Antes de conectar o número

Este número já está ativo no WhatsApp Business do celular e precisa continuar no app. Na Meta, use o fluxo oficial de [Coexistence / onboarding de usuários do WhatsApp Business app](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users). Não registre o número pelo fluxo padrão da Cloud API, não o remova da conta do app e não confirme uma migração se a tela não disser explicitamente que o app continuará conectado. Elegibilidade, país e acesso ao fluxo dependem da Meta. Se a opção não aparecer na sua conta, pare antes de confirmar e solicite orientação à Meta ou a um provedor oficial que ofereça coexistência.

O pareamento pode solicitar uma confirmação pelo próprio WhatsApp Business. Faça isso apenas na tela oficial da Meta ou do provedor escolhido. Este repositório não implementa nem automatiza o Embedded Signup, porque o acesso a esse fluxo depende da configuração/revisão da conta Meta.

## Variáveis de ambiente

No Vercel, em **Project → Settings → Environment Variables**, configure os valores para Production e Preview (e Development se quiser usar localmente). Nunca envie tokens, App Secret ou chave de serviço pelo chat e nunca crie variáveis `NEXT_PUBLIC_` para esses segredos.

| Variável | Origem/uso |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Token de usuário do sistema com permissões de mensagens, obtido após conectar o WABA. Use um token de servidor válido, não o token temporário de teste. |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número conectado, exibido nos detalhes/API Setup do WhatsApp Manager. Não é o telefone em si. |
| `WHATSAPP_API_VERSION` | Versão Graph API ativa e permitida no app Meta, no formato `vNN.0`. |
| `WHATSAPP_FIRST_CONTACT_TEMPLATE_NAME` | Nome de um modelo de primeiro contato já aprovado no WhatsApp Manager, sem parâmetros. |
| `WHATSAPP_FIRST_CONTACT_TEMPLATE_LANGUAGE` | Idioma aprovado para esse modelo, por exemplo `pt_BR`. |
| `WHATSAPP_FIRST_CONTACT_TEMPLATE_PREVIEW` | Texto exato do corpo do modelo aprovado. Aparece para a equipe antes do envio; não use texto diferente do aprovado. |
| `WHATSAPP_APP_SECRET` | App Secret do app Meta; usado para verificar a assinatura HMAC dos POSTs recebidos. |
| `WHATSAPP_VERIFY_TOKEN` | Segredo aleatório criado por você; o mesmo valor será usado ao verificar o webhook na Meta. |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de servidor do Supabase, usada pelas rotas protegidas para gravar mensagens, consentimentos e webhooks validados. Permanece no servidor; jamais no navegador. |

As variáveis públicas do Supabase já usadas pelo Prospecta também precisam estar configuradas na Vercel. Depois de alterar variáveis, faça um novo deployment para que as funções recebam os valores.

## Callback da Meta

Com a sessão autenticada, abra os detalhes de um lead. O endereço exibido pela API é `/api/whatsapp/webhook` no domínio da implantação. Na configuração de Webhooks do app Meta:

1. Informe esse endereço como Callback URL.
2. Informe o mesmo valor de `WHATSAPP_VERIFY_TOKEN` e valide a assinatura do webhook.
3. Inscreva a conta WhatsApp Business nos eventos de mensagens. Se a coexistência da conta disponibilizar o evento `smb_message_echoes`, inscreva-o também para refletir no CRM o que for enviado pelo app do celular.
4. Configure o telefone/WABA conectado para que o identificador corresponda ao `WHATSAPP_PHONE_NUMBER_ID` da Vercel.

O endpoint de entrada só processa POSTs cuja assinatura `X-Hub-Signature-256` confere com `WHATSAPP_APP_SECRET`. Não desative essa verificação. O webhook é idempotente pelo ID da mensagem da Meta; respostas e confirmações ficam em tabelas próprias, com RLS e Realtime.

## Regras de envio

- O Prospecta envia texto livre somente durante as 24 horas após uma mensagem recebida do lead.
- Fora dessa janela, o botão **Iniciar conversa** usa no servidor o modelo de primeiro contato aprovado no WhatsApp Manager. Ele só fica disponível após configurar as três variáveis acima. O operador vê o texto antes de confirmar o envio e, quando necessário, registra a autorização prévia do lead e sua origem. O botão não envia texto livre como primeira mensagem.
- O texto exato `SAIR`, `PARAR`, `CANCELAR`, `REMOVER`, `STOP` ou `UNSUBSCRIBE` recebido do lead bloqueia novos envios. Só registre nova autorização se o lead voltar a consentir.
- Respeite a [política e os preços vigentes da Meta](https://whatsappbusiness.com/policy/). Esta primeira versão guarda mensagens textuais e mostra um rótulo para anexos recebidos; baixar/visualizar mídia ainda não está implementado.

## Banco de dados

A migration `supabase/migrations/20260928143000_whatsapp_conversations.sql` precisa estar aplicada no projeto Supabase antes de abrir conversas. Ela é aditiva, cria tabelas dedicadas, aplica RLS e publica as tabelas no Realtime; não altera nem apaga leads existentes.
