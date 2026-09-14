# Changelog

## v1.9.0-RC4.9

- Evita recriar rascunho ao apenas abrir e fechar um case/anotação sem alterações.
- Ao recusar a recuperação de um rascunho, ele é descartado e não volta a ser oferecido sem novas edições.
- Permite preparar comentários e evidências em novos cases antes do primeiro salvamento.
- Adiciona suporte a PDFs nos comentários/evidências de cases novos e existentes.
- Mantém imagens e PDFs em anotações novas e existentes com validação antecipada dos arquivos.
- Compacta os cards de Anotações, reduzindo espaçamento e limitando a prévia do conteúdo a poucas linhas.

## v1.9.0-RC4.8

- Otimiza a inicialização fria do servidor local, carregando o agente gráfico de notificações somente quando necessário.
- Reduz o tempo de detecção do servidor no atalho.
- Remove a renderização duplicada do painel durante o bootstrap.
- Move manutenção, sincronização, Service Worker e motor de lembretes para depois do primeiro paint.
- Adiciona indicador discreto de carregamento durante a leitura inicial dos dados.

## 1.9.0-RC4.7

- Interface profissional com temas claro/escuro e botões de ações com cores sutis.
- Lembretes por horário com recorrência `Seg a sex` ou `Todos os dias`.
- Agente local para notificações do Windows com o navegador fechado.
- Rascunhos, favoritos, lixeira e pesquisa global.
- Fila GMUD e histórico de resolvidos.
- Macros, anotações com anexos e biblioteca de Queries SQL.
- Backups automáticos/manuais, históricos separados e backup de anexos.
- Encerramento completo do servidor/agente e desinstalador seguro.
- Revisão para publicação: comentários técnicos, remoção de código obsoleto, README atualizado, `.gitignore`, `SECURITY.md` e validação automatizada.
