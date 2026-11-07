# Evolução comercial — entrega e validação

Implementação do ZIP de evolução do CRM e integração ao briefing de planos e contratos, mantendo o workspace compartilhado, DESIGN.md e dados reais.

## Entregue

- Visão geral e Analytics com filtros combináveis/salvos, períodos, indicadores definidos, gráficos com tabelas acessíveis e atalhos para leads/tarefas.
- Pipeline de 12 etapas, qualificação independente, avaliação digital manual e pontuação explicável. A chave legada `qualificado` continua como Em negociação; `validado` representa Qualificado. Nenhum status existente foi convertido.
- Ficha completa, eventos reais e idempotentes, tarefas com prazo/responsável/prioridade, follow-up configurável e auditoria.
- Ficha única de plano, preços recalculados no servidor, propostas públicas com token, validade e versões, escolha transacional do plano, tratamento específico de Enterprise.
- Contrato oficial em PDF no servidor, snapshot e versões, armazenamento privado, download temporário e upload de PDF assinado até 20 MB diretamente ao Storage, com validação no servidor.
- Biblioteca de contratos integrada aos documentos. Novos editores/canvas existentes preservados.
- Apagar lead no final da ficha, com confirmação pelo nome exato, origem e acesso validados no servidor. Exclusão permanente em cascata de atividades, tarefas, WhatsApp, propostas, ficha de plano e registros de contratos. Documentos e calendário permanecem desvinculados. Objetos privados já armazenados não são purgados por essa ação e deixam de ter download pelo registro excluído.

## Banco e implantação

Projeto Supabase `pzizvnlcwtbprapjikjc`, organização Prospecta. Cinco migrations aplicadas: `20261101001658`, `20261101002508`, `20261101003217`, `20261101004006`, `20261101004450`. RLS para membros autorizados do workspace único, preferências privadas por usuário, RPCs comerciais restritos ao servidor e atividades sem edição/exclusão direta.

Inventário antes e depois dos testes transacionais: 23 leads (21 novos, 1 contatado, 1 descartado), 2 tarefas, 0 atividades, propostas e contratos. Testes de banco usaram BEGIN/ROLLBACK, sem dados de demonstração persistidos ou histórico inventado.

Produção: https://prospecta-topaz.vercel.app. Rollback conservador: reimplantar UI anterior e manter colunas/eventos adicionados; não apagar histórico ou colunas de produção.

## Definições das métricas

Estoque atual (leads ativos, pipeline, tarefas) não é uma série histórica. O período se aplica a eventos, cadastros e encerramentos com data conhecida. Resposta usa a interseção de respondentes e leads contatados no período. Sem denominador, mostra ausência de informação. Ganhos/perdas legados sem data não são distribuídos artificialmente. Pipeline exclui encerrados e informa valores desconhecidos separadamente. Venda confirmada não comprova recebimento. Propostas usam data real de envio, não criação de rascunho.

Referências de composição: https://ui.shadcn.com/charts/bar e https://ui.shadcn.com/charts/line. SVG e tabelas acessíveis, sem nova biblioteca de gráficos.

## Validação

- `pnpm exec tsc --noEmit`.
- `pnpm lint`: sem erros; avisos preexistentes de scanners de skills, imagens e virtualizador.
- `node tests/crm-insights.cjs`: fórmulas, coortes, legado, fuso, filtros e preenchimento contratual.
- `node tests/contract-pdf.cjs`: PDF A4 com texto selecionável, cláusulas e assinaturas em fixture isolada.
- `node tests/crm-delete.cjs`: origem, acesso, identificador, confirmação exata, conflito e falha segura, com banco simulado.
- `tests/crm-database.sql`: transições, idempotência, RLS/grants, recálculo, propostas, versões/assinatura e rate limit; executado com rollback.
- Build Webpack local aprovado; Turbopack local apresentou erro interno do subprocesso CSS no Windows. Build padrão Turbopack na Vercel aprovado na primeira implantação.
- Revisão visual desktop/mobile em produção; filtros recolhíveis no mobile e títulos com quebra de linha.

Nova dependência desta entrega: `@react-pdf/renderer` 4.9.0. Demais bibliotecas já faziam parte das funcionalidades anteriores.

## Uso e limites

1. Complete Gestão → Empresa: dados jurídicos, sócios e assinaturas. A configuração estava incompleta na conferência; a geração de contratos reais bloqueia até preencher os campos obrigatórios. Nenhum dado jurídico foi inventado.
2. Abra um lead, qualifique, registre contatos/respostas e agende uma tarefa. Verifique as mudanças no pipeline e Analytics.
3. Em Plano e contrato, salve a ficha, crie a proposta e copie o link. Só marque como enviada quando houver envio real. WhatsApp é abertura manual; não há disparo automático.
4. Revise o texto antes de gerar o contrato. Uma alteração posterior na ficha pede nova versão. Upload assinado é registro manual, sem validação criptográfica ou provedor de assinatura.
5. Para apagar, abra a ficha, vá ao final e digite o nome exato. Não há lixeira; cancelar não faz requisição de exclusão.

A validação do PDF usou fixture, não um contrato real de cliente: a empresa ainda precisa ser configurada. Distribuição de horários só aparece com amostra mínima de 20 respostas. Volume maior exigirá agregação de Analytics no banco em vez de snapshots no cliente. Pagamentos, assinatura eletrônica e avaliação automática de sites não foram adicionados.

## Conferência final da publicação

Deployment dpl_BV5Yds9jfFzKAopp2GbmjzstdKVY READY e alias de produção confirmado em 01/11/2026. Build padrão da Vercel aprovado. Em produção: confirmação de exclusão visível, botão definitivo bloqueado sem nome, cancelamento preserva cadastro, Analytics carregado e filtros mobile abrem/fecham. Larguras 320, 375, 414 e 768 sem overflow horizontal de página. Nenhum lead real apagado no teste. Os números atuais podem mudar com o uso normal do CRM; o inventário acima é a conferência transacional anterior.

Auditoria Hallmark: hierarquia, execução, especificidade, contenção e variedade avaliadas com base no sistema existente; sem achado bloqueante. Antislop UI/copy/code preserva os tokens, texto operacional e dados reais. Sem novo estilo ou biblioteca de gráficos.

