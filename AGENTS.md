# Fluxo local obrigatório

- Pedido atualizado: os dois logins autorizados usam e alteram a mesma carteira; não há sessão que o usuário precise assumir/liberar nem modo de espelho. Usar a camada compartilhada com transações, preservar operações simultâneas, manter uma única contagem de cronômetro por carteira e conta/Sair em menu compacto no cabeçalho. Nunca separar dados financeiros por UID.

- Atualização autorizada de 02/11/2026: Firebase é a fonte principal, com login Google e duas contas na lista privada `usuarios/gabriel-local/config/acesso`. Usar o projeto existente `walletsumilator`, documento `usuarios/gabriel-local`, campo completo `walletAtualV4` e subcoleções existentes. Não voltar ao vínculo por código nem ao modo financeiro local. Cache do navegador serve somente para recuperação; nunca enviar saldo local zero como base. Notas particulares ficam no Firebase protegido e nas cópias privadas, nunca no código. Preservar a importação única das notas locais na primeira migração e os IDs dos registros.

- Repositório remoto oficial e único destino de desenvolvimento: `https://github.com/Thilanguis/Wallet-Simulator.git`, branch main. A pasta local permanece Simulator/ para preservar o VS Code/Live Server. A autorização de publicação desta unificação não autoriza operações Git automáticas em pedidos futuros.

- A pasta de trabalho do VS Code é `D:\Sistemas DEV\dominação`.
- A fonte ativa agora é `D:\Sistemas DEV\dominação\Simulator`, o repositório Git local. Faça as edições futuras dentro de Simulator/. A raiz contém cópias antigas preservadas e um index.html que encaminha para a aplicação.
- Não crie branches, não faça staging, commits, reset, push, Pull Requests ou merge sem autorização expressa do usuário. Não inicialize outro repositório.
- Não altere o repositório remoto, suas branches ou a PR existente sem autorização expressa.
- Fluxo: editar localmente → o usuário testa → revisar e ajustar → aguardar autorização para Git.
- Confira diferenças antes de substituir arquivos e preserve modificações locais. Backups locais ficam em `.local-backups/` e nunca devem ser publicados.
- Preserve dados do navegador e integrações existentes. Não limpe localStorage/IndexedDB para atualizar a interface.
- Desenvolvimento: Live Server em `http://127.0.0.1:5501`, servindo Simulator/ (ou encaminhado pelo index.html da raiz). `npm run setup:local` prepara as dependências locais de OCR. Não é necessário build ao salvar HTML, CSS ou JavaScript.
- `npm run build` gera `dist/` para testes do PWA/produção; não publica nada.
- Abrir o site diretamente, sem splash/loading, espera artificial ou botão Pular. Não reintroduzir a tela “Carregando sua dominação”. Preservar a animação do título.
- Terminologia: Saldo Dominadora é dinheiro interno do Wallet e deve aparecer em R$. "Ganho de Crédito" é o nome de uma operação, não uma moeda de pontos. Não usar "saldo fictício" ou preços em "créditos" na interface.
- Notas e gastos reais ficam em painel separado, sem cartões financeiros no início do Wallet e sem conversão/resgate automático entre as áreas. Integração futura só após novo pedido do usuário.
- Tudo que entra nas notas reais é gasto já realizado. Não oferecer situação pendente nem interpretar ❌ como compra pendente. Registros antigos continuam contabilizados, sem exclusão automática; o usuário removerá os itens não comprados. Cancelamento e reembolso continuam disponíveis para corrigir gastos.
- Preservar o título roxo, que fica amarelo/dourado com o bônus lingerie ativo. Listas financeiras particulares só no navegador/rascunho privado, nunca em código ou fixtures públicas.
- A apresentação principal das notas reais deve seguir a lista enviada pelo usuário: oito grupos numerados abertos, itens compactos na ordem original, ✅/❌ nas compras, subtotal por grupo, resumo final e total geral. Não substituir isso por um histórico cronológico de cartões ou por grupos recolhidos. Edição/filtros ficam em gerenciamento separado.

- Economia: uma configuração, com valores equilibrados por padrão e editor de preços, ganhos e limites sempre acessível. Não oferecer seletor Clássico/Equilibrado/Personalizado. Preservar personalizações salvas e histórico.

- Editor econômico compacto: categoria + item + um único campo de valor + Salvar valor. Não exibir todos os preços e limites como formulário longo.

- Totais das notas são automáticos: qualquer inclusão, importação, correção ou exclusão deve recalcular subtotal do grupo, resumo e total geral a partir dos itens. Não adicionar editor de totais nem botões de edição na lista principal para atender a esse pedido.

- Usar AppDialog.confirm (assíncrono, aguardar resposta) e AppDialog.alert para confirmações e avisos. Não voltar aos pop-ups nativos alert/confirm do navegador. Cancelar, fechar e Esc nunca executam a ação.

- Pedido atualizado: lista principal com caneta para edição em janela, lixeira e alça para reordenar/mover entre grupos. Toda movimentação deve preservar IDs/dados, registrar auditoria e recalcular os totais. Isto substitui a restrição anterior de botões na lista principal.

- Catálogo econômico editado nos arrays services, gains e games em js/economy-config.js; sem editor de valores na tela. Novos itens devem aparecer automaticamente mesmo com configuração personalizada salva. Preservar lógica do cronômetro, marcadores 💲 e dados existentes.

- Cronômetro sem teto de duração ou taxa por pedido do usuário. Base equilibrada R$ 0,50/min e lógica dinâmica preservadas, incrementos menores (automático R$ 0,01/60s, taskScale 0,01 e repeatIncrement 0,002). Não restaurar limites de 120 minutos/R$ 3 por minuto.

- Esclarecimento do usuário: manter na tela Economia do simulador um expansível Editar preços, ganhos e limites com editor JSON/arrays. Não substituir por inputs individuais nem remover o editor. Salvar deve atualizar valores e criar opções novas imediatamente, persistindo o catálogo junto ao backup.

- Economia do simulador fica em Configurações. Editor JSON compacto com price para serviços e amount para ganhos; não expor classic/balanced no editor. Preservar compatibilidade com catálogos já salvos e lógica dinâmica. Prévia de compra com lingerie exibe original riscado, preço final, percentual e economia.

- Contrato: serviços comprados e sua conclusão nunca geram saldo. Ganhos são registrados em Ganho de Crédito. Regras recalibradas autorizadas: descumprimento +R$160; regra do creme -R$40; jantar +R$10 por amiga. Penalidades exigem registro explícito da ocorrência e confirmação; não recebem bônus. Valores editáveis em contractRules no JSON. Obrigação de servir acompanha duas conclusões separadas, inclusive em compras antigas.

- Atualizações: detectar automaticamente, oferecer confirmação e mostrar progresso de aplicação; sem botão Verificar atualização. Live Server continua sem cache de desenvolvimento. Contrato na tela deriva do catálogo e regras atuais; manter o PDF original como referência e permitir imprimir. Não criar Git na raiz sem autorização.

- Migração autorizada pelo usuário: arquivos atuais copiados para o repositório existente Simulator, sem operações de escrita no Git. Configurações deve ser a última aba; Contrato vem antes. Não voltar a editar as cópias antigas de js/css da raiz.

- Ganhos: Buraco, Perfil e Match Masters pertencem aos aplicativos próprios e saem do catálogo ativo (incluindo migração dos catálogos salvos), sem apagar históricos nem categorias de gastos reais. Manter videogames competitivos e jogos com amigas. Conversa no WhatsApp sobre compras tem sugestão editável R$15 e marcador 💲, usando apenas o cronômetro manual; sem monitorar mensagens nem calculadora de pontos para essa atividade.

- Combo dinâmico: atividades 💲 diferentes registradas durante a sessão somam incrementos automáticos; repetir a mesma não duplica seu slot. Chips permitem encerrar cada dinâmica sem reprecificar o passado. Preservar combo ao recarregar pausado e zerar ao concluir sessão. Cuspir no copo e Pés na cara também são dinâmicos.

- Tela Nova Transação: destacar cronômetro no topo de Ganho de Crédito, com estados visuais e lembrete discreto para atividade 💲 parada. Alterações de apresentação não iniciam automaticamente o tempo, não bloqueiam registros e não mudam cálculos/combos.

- Atualização autorizada do fluxo: escolher uma atividade válida em Ganho de Crédito inicia automaticamente a sessão se ainda não existe. Não creditar saldo ao selecionar. Trocar atividade mantém tempo; pausa manual e sessão restaurada pausada exigem Continuar. Manter apresentação compacta anterior, sem ampliar os elementos.

- Manter linguagem de uso, sem textos provisórios/testes na interface. Explicar que registrar qualquer atividade na sessão aumenta a taxa, mesmo sem 💲; 💲 também contribui para aumentos automáticos do combo. Não apagar dados para limpar textos.

- Wallet: Saldo → atalhos → Nova Transação antes de tarefas, ocorrências e roleta. Abas compactas fixas no celular, Configurações por último. Zerar saldo/arquivar histórico ficam em Configurações. Ao salvar edição de nota, voltar à linha e destacar brevemente, inclusive após mudança de grupo.
