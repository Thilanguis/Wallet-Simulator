# Findom Wallet

Aplicação web com Saldo Dominadora em R$ para uso interno, privilégios, cronômetro,
roleta, contrato e notas de gastos reais em uma área separada. Mantém o tema escuro,
vermelho e dourado e o título roxo/dourado conforme o Bônus Lingerie.

## Instalação local única

Repositório oficial: [Thilanguis/Wallet-Simulator](https://github.com/Thilanguis/Wallet-Simulator).
Endereço do sistema: https://thilanguis.github.io/Wallet-Simulator/.
O nome local `Simulator` é mantido para preservar o ambiente do VS Code e do Live Server.

A fonte ativa e o repositório local estão em **D:\Sistemas DEV\dominação\Simulator**.
A pasta pai pode continuar aberta no VS Code: o Live Server serve `/Simulator` em
**http://127.0.0.1:5501/** e o índice da raiz encaminha para a aplicação. As referências
e os backups não são outros sites ativos. Não é necessário build ao salvar HTML,
CSS ou JavaScript; o cache de produção não intercepta a porta 5501.

Node.js 24 ou superior:

```sh
npm ci
npm run setup:local
```

Para produção, `npm run build` gera `dist/`, com OCR e configuração Firebase local
quando disponível. Sem essa configuração, a conexão usa apenas o ID público do
projeto existente.
Sirva seu conteúdo por HTTPS. O build não publica nem faz operações Git. Backups,
listas particulares, códigos de vínculo, dependências e `firebaseConfiguration.js`
não devem ser adicionados ao repositório.

## Carteira e catálogo

- O saldo interno é dinheiro em R$, disponível para resgatar privilégios. Não é a
  soma dos gastos reais, e não há conversão automática entre as duas áreas.
- **Ganhar Créditos** e **Loja de Privilégios** selecionam a operação. Selecionar
  uma atividade válida inicia uma sessão nova, mas não credita saldo. Pausa manual
  e sessão restaurada exigem Continuar; Calcular conclui a sessão e registra o ganho.
- Registrar uma atividade durante a sessão altera a taxa dali em diante. Atividades
  💲 distintas também somam incrementos automáticos no combo. Aumentos não são
  retroativos; não há teto de duração ou taxa. Os parâmetros são os atuais do catálogo.
- **Configurações → Editar preços, ganhos e limites** abre o editor JSON/arrays.
  `price` define serviço; `amount` define ganho; `extras` vincula os adicionais.
  Alterações e itens novos aparecem após salvar, preservando o histórico anterior.
- O Selo de Privilégio usa o estado real do Bônus Lingerie e os percentuais atuais
  do catálogo. Ganhos elegíveis recebem bônus uma vez e compras recebem o desconto
  aplicável uma vez. Concluir um serviço comprado não acrescenta saldo.
- Redutores aceleram os prazos elegíveis continuamente, com barra e contador, e
  retomam os checkpoints após suspensão. Seus próprios bloqueios não são reduzidos.
- A roleta mantém cooldown de três dias e os pesos atuais. Serviços gratuitos viram
  tarefas reais uma vez, sem desconto de saldo. Efeitos que exigem ativação mantêm
  sua ação enquanto disponíveis. Resultados antigos não são apagados para limpar a tela.
- Ocorrências do contrato usam regras atuais do JSON e confirmação explícita; não
  recebem bônus. O contrato da tela acompanha o catálogo; o PDF original é referência.

## Notas e gastos reais

A lista mantém oito grupos numerados abertos, itens na ordem original, marcadores,
valores, subtotais, resumo final e total geral calculados dos registros. Todos os
lançamentos representam gastos realizados. Cancelamento e reembolso permitem correções;
valores somente em USD não são convertidos silenciosamente para BRL.

É possível importar texto do WhatsApp, conferir a prévia, adicionar uma nota manual,
ler comprovantes com OCR local, editar, excluir e mover itens. A importação não soma
subtotais digitados nem salva sugestões sem confirmação. Cada valor conserva seu ID;
as correções e movimentações possuem auditoria. O texto exportado mantém os grupos.

Comprovantes aceitam imagens e PDF, até 12 MB e dez páginas. OCR é uma sugestão e
pode exigir correção de data, moeda, loja e total. O arquivo e o texto de OCR não são
incluídos automaticamente no backup.

## Firebase, recuperação e atualização

A conexão principal recupera o mesmo projeto e documento usados pelo
`Wallet-Simulator`: `walletsumilator`, `usuarios/gabriel-local`. Não exige configurar
um novo provedor de login. O estado atual completo é criptografado; um código privado
vincula o segundo aparelho. A integração não importa a lista antiga por cima da nova.
Leia [FIREBASE-LOCAL.md](docs/FIREBASE-LOCAL.md) para ativar a conexão e
[COMPARACAO-VERSOES.md](docs/COMPARACAO-VERSOES.md) para a comparação das versões.

O armazenamento local usa `findom.wallet.v2`, preserva as chaves antigas e mantém uma
cópia anterior para recuperação. Exporte o JSON completo em Configurações; guarde-o
privadamente. Restaurar um backup exige confirmação e substitui o conjunto completo.
No controlador compartilhado, a restauração também é enviada ao Firebase.

A atualização de produção é detectada automaticamente, oferece confirmação e mostra
progresso. O aplicativo não abre um splash de espera. Não limpe localStorage ou
IndexedDB para atualizar o visual. A página do tablet precisa usar a publicação
correta: salvar arquivos no Live Server não atualiza uma URL do GitHub Pages.

## Validação e fluxo de trabalho

```sh
npm test
npm run test:live
npm run build
npm run test:e2e
```

Os testes de navegador usam dados sintéticos, perfis isolados e Firebase interceptado.
Dados reais do navegador não são apagados ou substituídos pelos testes. As limitações
administrativas do projeto real são apresentadas na própria conexão, sem alteração
automática de regras.

O fluxo do projeto continua: editar localmente → testar no navegador → revisar →
autorizar Git. Nenhum script cria branch, faz commit, push, PR ou merge por conta própria.
