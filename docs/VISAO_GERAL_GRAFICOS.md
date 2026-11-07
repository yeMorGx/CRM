# Visão geral visual e ações de contexto

## Escopo

Apenas a Visão geral recebeu a nova composição de gráficos. Analytics preserva suas métricas, filtros e apresentação anterior. Menus de contexto são uma melhoria de interação compartilhada do CRM.

## Interface

- Evolução com área/linha e alternância entre cadastros, contatos, respostas, propostas e ganhos.
- Rosca de cobertura do próximo passo, sem contar várias tarefas do mesmo lead mais de uma vez.
- Barras de estoque atual por etapa, com clique para abrir os leads.
- Rosca de origens, com agrupamento de cauda e seleção exata dos registros.
- Colunas de tarefas pendentes por prazo; atividades registradas por tipo em barras horizontais.
- Filtros recolhidos, período curto e valores sob demanda. Sem listas extensas de texto na Visão geral.
- Sem estimativas inventadas, comparações históricas fictícias ou conversões deduzidas a partir do estoque. Vazios indicados quando não há dados.

## Menus

Leads na tabela e no pipeline: abrir, agendar follow-up, plano/contrato, favoritos, copiar nome/telefone e apagar. A exclusão abre diretamente a confirmação existente pelo nome; não elimina dados ao abrir o menu.

Tarefas: concluir/reabrir, cancelar e abrir lead. Documentos: abrir, copiar título e abrir arquivo original quando houver URL privada disponível. Gráficos: abrir a seleção, acessar tarefas e atualizar.

Botão direito ou toque longo abre o contexto. O botão de reticências fornece a mesma lista para clique, toque e teclado. Base UI oferece navegação por setas, Escape e gerenciamento de foco. Portais herdam o tema do CRM e permanecem no dialog quando abertos dentro de uma ficha.

## Dependências

Novas: `@mui/x-charts` 9.17.0 Community, `@mui/material` 9.5.0, `@emotion/react` 11.14.0 e `@emotion/styled` 11.14.1. Sem pacote Pro/Premium ou chave de licença. Base UI já instalado foi reutilizado nos menus. Os gráficos carregam dinamicamente na Visão geral, sem montagem no Analytics.

## Validação

TypeScript e lint sem erros. Testes isolados em `tests/overview-charts.cjs`: partições de prazo, fuso, cobertura, agrupamento de origens e vazios. Testes de exclusão existentes continuam passando. Sem alteração de schema ou dados de produção.

Auditorias de design: sistema visual e tokens da Prospecta preservados. O scanner apontou Geist e Star como sinais genéricos: Geist é a fonte estabelecida em DESIGN.md; Star representa a ação real de favoritos. Mantidos por esses motivos. Metadados curtos distinguem estoque atual de eventos do período.

Referências: https://apexcharts.com/javascript-chart-demos/ e https://mui.com/x/react-charts/ .

## Valores e funil

Mais três gráficos exclusivos da Visão geral: série de valores encerrados, comparação de ganhos/perdas/potencial e faixa curva de funil por etapa inspirada na referência enviada. O funil alterna leads e R$, com acesso às fichas por clique e teclado. Implementado em SVG próprio, sem dependência de pacote Pro para funil.

Vendas usam confirmed_value de ganhos encerrados no período. Potencial perdido usa estimated_value dos negócios perdidos com closed_at no período; não representa custo ou saída de caixa. Potencial em aberto soma apenas estimated_value das oportunidades ativas atuais. Sem ponderação probabilística ou previsão inventada. Valores ausentes são separados; zero informado permanece zero. Lacunas de encerramentos sem valor ficam nulas na série, e vendas legadas sem data não ganham data artificial. Carteira atual por etapa não é taxa de conversão de uma coorte.

Testes adicionais verificam estas separações, valores parciais, zero, lacunas e exclusão de nutrição/encerrados do potencial.

## Publicação verificada

Versão financeira publicada em 01/11/2026 no deployment dpl_6DCBYA1sVAbT2qR1GLKmK7RWFuAV, READY e alias prospecta-topaz.vercel.app confirmado. Build padrão aprovado, TypeScript e lint sem erros nos arquivos novos. Nove gráficos presentes em produção, alternância Leads/R$ e ausência de estimativas verificadas. Larguras de 320, 375 e 768 sem overflow horizontal de página; funil tem rolagem interna. Console sem erros na conferência. Analytics mantém os 12 painéis anteriores e não monta os novos gráficos. Menus de lead testados por botão direito e reticências; exclusão abre confirmação, sem apagar dados de teste na produção. Atalho de follow-up abre a aba Tarefas. O viewport foi restaurado após a revisão.

