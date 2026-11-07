# Modais e controles — revisão

## Mudanças

- Exclusão de lead abre confirmação independente, com nome exato, erro recuperável e bloqueio durante a requisição. Não monta ficha comercial nem carrega campos desnecessários. Detalhes da cascata ficam disponíveis em expansão.
- Ficha do lead em Contato, Qualificação e Negócio; campos mantidos em estado entre etapas, validação leva ao campo inválido e fechamento continua alertando alterações não salvas.
- Plano em quatro passos (Plano, Cliente, Projeto, Pagamento), com Proposta e Contratos em seções separadas. Campos não são desmontados ao trocar de passo, preservando os valores do formulário e a fonte única de dados.
- Novo lead mostra nome, telefone e e-mail; endereço, site e notas são opcionais em expansão.
- Evento mostra o essencial; cor e notas ficam em expansão. Evento e editor de mensagem passam a usar dialog nativo com foco contido, Escape e bloqueio de fechamento durante processamento.
- Documentos preservam o editor em tela inteira e painel opcional. Visualizadores de mídia e foto, que já têm uma única tarefa, preservam seu conteúdo; alinhamento, bordas e controles seguem o padrão comum. Notificações permanecem popover de leitura.
- Todos os selects HTML das telas migrados para AppSelect (Base UI), com menu estilizado, busca por digitação e teclado. Os selects Base UI já existentes são preservados.
- Estilo comum para checkbox/radio, details/summary, fieldset/legend, bordas, foco e scroll. Controles de switch já desenhados mantêm a estrutura existente. Nenhuma dependência nova.

## Compatibilidade

AppSelect mantém um select nativo auxiliar para FormData, eventos React onChange e validação. O popup usa o dialog ancestral quando necessário, sem escapar da camada modal. Selecionar uma opção não propaga clique para a linha de lead. Controle com value continua controlado; defaultValue e form.reset funcionam para os demais.

## Validação

Testado no navegador em página temporária local: seleção controlada e não controlada; evento do formulário; campo obrigatório com foco/erro; FormData com valores corretos; reset; popup e seleção dentro de dialog. A rota de teste foi removida antes da publicação e nenhum dado foi enviado ao Supabase por ela.

TypeScript aprovado após regenerar os tipos e remover o cache da rota temporária. Lint dos arquivos novos sem erros. Testes de exclusão preservados. Build e revisão final em produção registrados após implantação.

Auditorias Hallmark/antislop: conteúdo real preservado, redução de densidade, hierarquia por tarefa, accent e tipografia existentes, sem novo tema. Bordas brancas nativas foram substituídas por tokens de superfície e linha. Sem mensagens, contratos ou leads fictícios na produção.

## Publicação final

Deployment dpl_2urML6tJjdhUX1grGjQLT8PLhg5q READY em 01/11/2026, alias de produção confirmado. Build padrão aprovado sem os avisos de CSS encontrados e corrigidos na primeira revisão. Lint completo: 0 erros e 9 avisos preexistentes. Em produção, confirmação de exclusão independente, três etapas de cadastro com somente uma visível, passos de cliente/plano e dropdown dentro do dialog conferidos. Altura desktop ajustada ao conteúdo (714 px na ficha conferida). Em 375 px, dialog de 355 px e popup de 307 px, sem overflow de página. Viewport restaurado. Nenhum lead real foi apagado ou salvo pelos testes; telas de teste locais removidas antes do deploy.

