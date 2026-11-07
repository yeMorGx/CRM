# Autoria, avisos, sons e Web Push

## Implementado

- Diretório autenticado de pessoas com nome, cor e foto por URL temporária. Avatar e autor na auditoria de eventos, alterações administrativas, timeline dos leads, tarefas e caixa de notificações. Registros sem autor conhecido continuam como Sistema / integração; não se atribuiu autoria retroativamente.
- Atualizações de planos, extras, empresa, imagens da empresa e estado de propostas usam RPC restrita ao servidor para registrar o usuário validado, em vez da conta técnica. Exclusão de lead registra auditoria mínima sem guardar o cadastro excluído.
- Toasts com foto e nome da pessoa, ação de abrir mensagem e confirmações adicionais de edições, atividades, tarefas, planos, propostas e contratos. Avisos repetidos de uma mesma mensagem são deduplicados por ID. Toasts podem aparecer na camada do dialog ativo.
- Volume padrão do chat alterado de 50% para 85%, mantendo os arquivos de som existentes. Controle por navegador de 0 a 100% e botão Ouvir som em Notificações → Avisos e sons.
- Web Push para mensagens de texto, imagem e áudio da equipe. O envio passa por rota autenticada que salva a mensagem e agenda a entrega com Next.js after. O envio da mensagem não depende da disponibilidade do serviço de push.
- Worker sem cache de páginas e sem interceptar a navegação. Quando há uma janela focada, encaminha ao toast; fora do site mostra aviso nativo genérico. Não exibe o texto privado da mensagem na tela bloqueada. Clicar abre o chat.
- Cada pessoa opta por receber avisos em cada navegador. Não há prompt automático. Ao sair da conta pelo site, a inscrição local é desativada.

## Configuração e proteção

Duas migrations: 20261101020000_web_push e 20261101021000_attributed_updates, aplicadas no projeto pzizvnlcwtbprapjikjc. Assinaturas privadas, RLS habilitada, sem grants de leitura/escrita para anon/authenticated. Rotas exigem sessão de membro autorizado e mesma origem. O usuário só pode remover seus próprios dispositivos. Endpoints de entrega restritos aos provedores conhecidos, para impedir requisições a destinos arbitrários. Remetente e contas sem acesso são excluídos da entrega. Inscrições expiradas 404/410 são removidas.

WEB_PUSH_PUBLIC_KEY e WEB_PUSH_PRIVATE_KEY foram geradas uma vez e salvas como variáveis protegidas na produção da Vercel. A chave privada não foi impressa ou gravada no repositório. A configuração pública expõe apenas a chave pública e o estado do serviço.

Dependências novas: web-push 3.6.7 e @types/web-push 3.6.4 (desenvolvimento). Sem serviço de email, WhatsApp ou assinatura adicional para estes avisos.

## Verificação

- TypeScript e lint; build padrão na Vercel.
- tests/push-delivery.cjs: provedores permitidos, bloqueio de destinos internos, destinatários autorizados, remetente excluído, limpeza de inscrições expiradas, fluxo foreground/background do worker e link restrito ao próprio site. Transporte mockado, sem push real.
- tests/chat-route.cjs: autenticação/origem, autor definido pela sessão, validação de mídia e ID, limitação de tentativas, entrega agendada só após gravar e retry idempotente no servidor. Banco mockado, sem mensagens reais.
- tests/push-database.sql: RLS e ausência de grants indevidos, com rollback. Resultado: 0 dispositivos registrados, RLS true, authenticated_can_read false.
- tests/attributed-update.sql: autor correto em atualização administrativa, RPC privada e rollback. Resultado: autoria validada, sem alterar o plano real.

## Uso e limites reais

Matheus e os demais membros precisam abrir o sino → Avisos e sons → Ativar avisos fora do site, aceitando a permissão no próprio navegador. A entrega depende do navegador, do sistema e de não haver bloqueio de notificações. Em iPhone/iPad, o site instalado na Tela de Início pode ser necessário.

Não ativamos permissões pelo usuário nem enviamos mensagens ou pushes de teste para outras pessoas. A entrega criptografada foi testada com transporte simulado; a conferência real entre dois dispositivos requer o consentimento/inscrição dos destinatários. O worker e a configuração serão conferidos em produção.

Só as mensagens enviadas pela nova rota geram push; abas antigas devem ser recarregadas. Usuários não inscritos continuam com avisos e mensagens dentro do site. Falhas transitórias de entrega são registradas no servidor; não há fila durável com retries automáticos nesta versão. O chat salvo permanece disponível mesmo quando um push falha. Fotos mostradas no histórico são as fotos atuais das pessoas, não snapshots históricos.

Referências: https://developer.mozilla.org/en-US/docs/Web/API/Push_API ; https://web.dev/articles/push-notifications-subscribing-a-user ; https://github.com/web-push-libs/web-push .

## Publicação e revisão final — 01/11/2026

Produção pronta em https://prospecta-topaz.vercel.app, deployment dpl_7wR5heqiJEgtxekukaHrhtHsfkKk. Build Turbopack e TypeScript passaram; lint sem erros e com nove avisos preexistentes. Conferidos em produção: fotos reais de Gabriel/Mateus nos avisos e na auditoria, toast com foto/nome ao copiar um nome, ativação disponível e volume 85%. Painel conferido a 375 px sem transbordamento horizontal; viewport restaurado. Não se ativou a permissão pelo usuário e não se enviou mensagem ou push real a terceiros.

Auditoria visual Hallmark / antislop-ui: preservados os tokens, fontes, densidade e superfícies do produto; fotos funcionais, mensagens reais e opção de permissão explícita. Scanner avoid-ai-design: zero P0, um P1 pelo CheckCircle2. Mantido porque indica sucesso com o conjunto de ícones já usado no site. Sem novo estilo de página ou efeitos decorativos. Revisão: filosofia 4/5, hierarquia 4/5, execução 4/5, especificidade 5/5, contenção 5/5, variedade 4/5.
