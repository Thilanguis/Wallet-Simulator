# Destino único: Wallet-Simulator

O projeto oficial solicitado pelo usuário é `Thilanguis/Wallet-Simulator`, com
publicação em https://thilanguis.github.io/Wallet-Simulator/. Todo o código moderno
atualmente em `D:\Sistemas DEV\dominação\Simulator` deve ser levado para esse
repositório; o nome da pasta local não define o banco nem a publicação.

## Preparado localmente

- Aplicação moderna completa, preservando notas, catálogo, economia, cronômetro,
  tarefas, roleta, contrato, OCR e o visual aprovado.
- Build público: `npm run build -- --public`. Inclui os recursos locais de OCR e
  o service worker gerado. Exclui a configuração Firebase local do pacote e cache.
- `.github/workflows/pages.yml`: valida, gera e publica o build completo; somente
  executa a publicação no repositório `Thilanguis/Wallet-Simulator`.
- Backups anteriores e desta preparação permanecem em `.local-backups/`, fora
  da publicação e do Git. Não é necessário duplicar a aplicação local.

## Estado na preparação, antes da publicação

- O remoto local ainda é `Thilanguis/Simulator`. Não foi trocado silenciosamente.
- `Wallet-Simulator/main` ainda está em `278fa677ebc3fad33e2841c92722f017701c8137`.
- Uma leitura real, sem escrita, confirmou que `usuarios/gabriel-local` no projeto
  `walletsumilator` ainda não contém o campo `walletAtualV3`. Portanto, a carteira
  nova completa ainda não foi enviada ao documento existente.
- A configuração Firebase identifica o projeto. O código privado de vínculo
  protege o estado atual criptografado e precisa ser o mesmo nos dois aparelhos.
  Não existe seleção de grupos: ambos usam o mesmo documento existente.

## Publicação a executar após autorização Git

1. Preservar os históricos Git existentes e uma cópia dos arquivos locais atuais.
2. Usar `Wallet-Simulator/main` como destino oficial de todo o sistema atual,
   mantendo o histórico anterior recuperável; sem force push ou outra PR.
3. Alinhar o repositório local com esse destino para que futuras edições e envios
   não continuem indo para `Simulator`. Não excluir nenhum repositório remoto.
4. Publicar o build completo no mesmo endereço usado pelo tablet. Confirmar a
   execução do Pages; se uma configuração administrativa impedir o deploy,
   apresentar o erro concreto, sem afirmar que o site já foi atualizado.
5. No computador que contém as notas atuais, conectar ao Firebase pela confirmação
   na interface; depois vincular o tablet com o código privado. Não enviar um
   estado vazio de teste nem usar os registros antigos como base da lista nova.

O usuário autorizou expressamente commit, envio, alinhamento do repositório e
publicação em 01/11/2026. Os históricos Git dos dois repositórios não compartilham
ancestral: a unificação conserva ambos os históricos e mantém integralmente a
árvore moderna, sem tentar substituir arquivos atuais pela implementação antiga.
O histórico local anterior também está preservado em bundle privado no backup.
O resultado da publicação deve ser confirmado pelo Pages antes de ser anunciado.

## Unificação executada em 01/11/2026

O remoto local foi alinhado com `Thilanguis/Wallet-Simulator`. Os commits
`8ad63f4` (adaptação Firebase e build) e `9e79e3c` (preservação dos históricos)
foram enviados à main sem force push. A primeira publicação pelo workflow foi
aprovada. A fonte do Pages foi corrigida de `legacy` para `workflow`, evitando
que uma publicação da raiz sobrescrevesse o pacote completo gerado em dist/.

Na conferência final também foram encontrados os commits `324502f` e `5ed4be0`
no repositório antigo Simulator. Suas mudanças foram comparadas com a versão
atual: a interface já estava contemplada; a configuração por apiKey em cada
aparelho é substituída pela conexão atual ao projeto existente; o worker
precompilado na raiz é substituído pelo build de produção. Esses commits também
ficam preservados no histórico unificado e em bundle privado, sem reintroduzir
o seletor de operação ou as opções antigas de roleta/ganhos.

Uma falha intermitente do fluxo de atualização foi identificada: a ativação
aguardava quadros de animação, que podem ficar suspensos. A ativação agora segue
sem depender deles, mantendo a confirmação e o salvamento dos dados. O teste
aguarda o recarregamento real antes de desligar a rede e verifica o caso de
quadros de animação suspensos.

O encaminhamento separado de `Simulator/main` para o site oficial foi preparado,
mas a atualização dessa branch foi rejeitada pela revisão automática de aprovação:
a autorização foi considerada específica para publicar em Wallet-Simulator.
Consequentemente, a branch e a publicação antigas não foram alteradas. O destino
local de desenvolvimento já é somente Wallet-Simulator; para encaminhar também o
outro site, é necessária autorização específica dessa alteração.
