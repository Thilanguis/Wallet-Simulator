# Carteira compartilhada sem tela de login

O Wallet v3 sincroniza saldo, histórico/arquivo, tarefas e suas conclusões, bloqueios,
redutores, roleta/prêmios, bônus, cronômetro/combo, catálogo/configurações e notas reais.
Não cria conversões entre o saldo interno e os gastos reais.

## Preparar o projeto Firebase existente — uma vez

1. Em **Authentication → Sign-in method**, habilite **Anônimo**. O SDK identifica o
   aparelho automaticamente; vocês não digitam e-mail, senha nem fazem login Google.
2. Nas regras do Firestore, acrescente o bloco `match /walletsCompartilhadas/{room}`
   de `firestore.shared.rules` dentro de `match /databases/{database}/documents`.
   Preserve as regras de outras coleções/aplicativos. Remova permissões globais abertas
   que também alcancem esta coleção: permissões de outros blocos se somam e podem
   invalidar as restrições. Este arquivo é uma referência local; não foi publicado.
3. Mantenha `firebaseConfiguration.js` local, com a configuração do projeto existente.
   O módulo deve expor `window._firestoreDb`, como a configuração atual já faz.

Não abra o banco inteiro com `allow read, write: if true`. Dados anteriores em
`usuarios/gabriel-local` e suas subcoleções não são apagados, substituídos ou usados
como base. Os campos antigos exibidos no console deixam de ser o estado ativo.

## Migrar e vincular

1. No aparelho que contém os dados desejados, atualize o site e abra
   **Configurações → Carteira compartilhada → Compartilhar esta carteira**.
   A tela informa quando o servidor confirmar o envio. A carteira local original
   fica guardada e pode ser baixada pelo botão de recuperação nesta mesma seção.
2. Use **Mostrar código de vínculo → Copiar código**. No segundo aparelho, abra a
   mesma versão do site, cole o código e pressione **Vincular este aparelho**.
   Ele recebe a carteira compartilhada; sua carteira anterior é preservada separadamente,
   sem mescla automática, duplicação de compras nem importação dos dados antigos do Firebase.
3. Guarde esse código privadamente com vocês. Ele contém a localização aleatória da
   carteira e sua chave de criptografia. Não publique código de vínculo, dados pessoais
   ou backups no GitHub. O vínculo não entra no JSON de backup normal.

Cada aparelho precisa acessar um servidor alcançável. `127.0.0.1:5501` no celular
refere-se ao próprio celular, não ao computador. Use uma hospedagem HTTPS ou um
encaminhamento HTTPS privado para o Live Server; Web Crypto exige contexto seguro.
Nenhuma publicação/hospedagem é feita por esta migração.

## Uso diário e conflitos

- Uma carteira compartilhada tem **um controlador por vez**. O outro aparelho recebe
  snapshots em tempo real e pode navegar, ler histórico/notas e exportar o backup.
- Para trocar, pressione **Liberar controle** no primeiro e **Assumir controle** no
  segundo. A sessão é pausada e enviada antes da liberação. O cronômetro não é contado
  em dobro; use **Continuar** para retomá-lo no novo controlador.
- Se o controlador fechar sem liberar, o controle vence em até 45 segundos.
  Alterações são agrupadas em envios de aproximadamente um segundo, com renovação de
  controle a cada 15 segundos. Aguarde o indicador **Sincronizado** antes de fechar.
- Ao perder a conexão, o aparelho pausa a sessão e impede novas operações compartilhadas.
  Dados já salvos no navegador continuam disponíveis. **Reconectar** recebe o último
  snapshot confirmado; mudanças locais que não puderam ser enviadas ficam numa cópia
  de recuperação, sem sobrescrever o outro aparelho.
- Restaurar um backup no controlador substitui a carteira compartilhada após confirmação
  explícita. A página aguarda o envio antes de recarregar; o outro aparelho recebe a
  restauração. **Desconectar este aparelho** mantém a cópia local e não apaga o Firebase.
- O Firebase é o estado compartilhado a partir da migração. Uma transação com revisão
  e controle válidos impede gravação de uma cópia antiga sobre um estado mais novo.
  Trabalhe com uma aba do Wallet por navegador; a proteção anterior contra múltiplas
  abas do mesmo perfil continua ativa.

## O que aparece no console

`walletsCompartilhadas/<identificador aleatório>` contém revisão, identificação do
controlador, prazo de controle, data de atualização e o estado **criptografado com
AES-GCM**. Para alterar saldo ou catálogo, use a interface do Wallet. Não edite o
payload cifrado ou os campos antigos de `usuarios/gabriel-local` esperando atualizar
esta versão. O Firebase não recebe a chave de descriptografia.

`timerSession.seconds`, `earnedUnits`, `rate`, `tasks` e `dynamicActivities` são o
estado de integração do cronômetro atual; não são créditos adicionais no saldo.
O saldo só muda nas operações já existentes de registro/conclusão da sessão.

Esta primeira integração suporta até aproximadamente 650 KB de estado descompactado
por carteira para respeitar o limite de documento do Firestore após criptografia e
base64. Se exceder, a tela informa a falha e mantém todos os registros locais; não
trunca o histórico. Snapshots em tempo real não são, por si, backups históricos do
Firebase: continue exportando o JSON. Não foram ativados backups pagos/PITR.

## Privacidade

Repositório privado e regras do Firebase são independentes. A criptografia protege o
conteúdo; conhecer o código de vínculo dá acesso à carteira. As regras exigem uma
identidade automática, proíbem listar carteiras e controlam as gravações. Um
identificador aleatório conhecido não substitui a chave AES para ler o conteúdo.
Se o código vazar, migre para uma nova carteira com novo vínculo.

## Validação

Os testes locais injetam um transporte simulado e usam perfis isolados. Nunca
enviam dados fictícios ao projeto Firebase real. A ativação de Authentication e das
regras exige acesso administrativo ao console e deve ser conferida no projeto real.

Validação desta implementação: `npm test` — 51 testes aprovados; suíte Live Server
completa — 73 testes aprovados. Após otimizar as atualizações por snapshot, foram
repetidos os 12 cenários de sincronização e redutores, todos aprovados, incluindo
desktop, celular e tablet. A verificação inclui a ausência de reconstrução das
notas durante atualizações do cronômetro. As regras estão preparadas, mas não foram
publicadas nem executadas no projeto real por estes testes.

Arquivos principais desta migração:
- `js/cloud-sync.js`: controle, revisões, envio e recepção do estado.
- `js/firebase-transport.js`: integração com snapshots e transações do Firestore.
- `js/cloud-cipher.js`: vínculo privado e criptografia nativa do navegador.
- `js/cloud-ui.js`, `index.html`, `css/modern.css`: conexão e estado na interface.
- `js/vault.js`, `js/persistence.js`, `js/backup.js`: armazenamento e recuperação.
- `js/appMain.js`, `js/timer.js`, `js/tarefasPendentes.js`, `js/roleta.js`,
  `js/roulette-rewards.js`, `js/economy-ui.js`, `js/finance-ui.js`,
  `js/transaction-presentation.js`, `js/wallet-presentation.js`: atualização dos
  componentes existentes, sem trocar fórmulas ou valores.
- `tests/cloud-sync.test.cjs`, `tests/live/cloud-sync.spec.cjs`: validação isolada.

Os backups anteriores às alterações ficam em `.local-backups/`, ignorados pelo Git.
Nenhum dado financeiro pessoal ou código de vínculo é incluído nestes arquivos de
documentação ou nos testes.

Referências oficiais:
- https://firebase.google.com/docs/auth/web/anonymous-auth
- https://firebase.google.com/docs/firestore/query-data/listen
- https://firebase.google.com/docs/firestore/manage-data/transactions
